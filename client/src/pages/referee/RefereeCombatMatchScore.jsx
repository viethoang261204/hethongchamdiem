import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes } from '../../lib/time';
import { exportToPdf } from './exportPdf';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';
import {
  ENERGY_BLOCK_MAX, FIREPOWER_BALL_MAX, ENERGY_BLOCK_SCORE, FIREPOWER_BALL_SCORE, METEOR_TOWER_SCORE,
  computeTaskScore, determineGroupMatchResult,
} from '../../lib/battleScoring';
import {
  PENALTY_MAX_SECONDS, computeSideScore, computeMatchPoints,
  determineGroupMatchResult as determineDroneGroupResult,
  determineKnockoutResult, resolveShootoutWinner,
} from '../../lib/flySmartCupScoring';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const clampEnergy = (v) => Math.min(ENERGY_BLOCK_MAX, Math.max(0, parseInt(v, 10) || 0));
const clampFirepower = (v) => Math.min(FIREPOWER_BALL_MAX, Math.max(0, parseInt(v, 10) || 0));
const newShootoutRound = (n) => ({ roundNo: n, aSuccess: false, aTimeSeconds: '', bSuccess: false, bTimeSeconds: '' });

// Score sheet for 1 combat match — replaces the old inline accordion: clicking
// a match in the list opens this dedicated page (same shape as the "pure"
// TaskScoringWizard flow): a Start Match gate, a live stopwatch while
// scoring, and after saving it shows the actual per-team score sheet inline
// (view/print PDF) instead of just a toast.
//
// Battle of Stars (isStars) keeps its existing rules untouched. Fly Smart Cup
// (drone) uses its OWN, independent rule set (client/src/lib/flySmartCupScoring.js)
// — goals/score only, no Meteor Tower/Direct Win/Task Score/Retry.
export default function RefereeCombatMatchScore({ format }) {
  const isStars = format === 'combat_stars';
  const { competitionId, contentId, matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert } = useNotify();
  const sheetRef = useRef(null);

  const listUrl = `/referee/competition/${competitionId}/content/${contentId}/${isStars ? 'combat-stars' : 'combat-drone'}`;

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({});
  const [entered, setEntered] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [savedMatch, setSavedMatch] = useState(null);
  const [exporting, setExporting] = useState(false);

  // ── Match Status (Fly Smart Cup only) — Cancel Match / Disqualify a Team ──
  const [statusAction, setStatusAction] = useState(null); // 'cancel' | 'disqualify' | null
  const [statusReason, setStatusReason] = useState('');
  const [disqualifiedSide, setDisqualifiedSide] = useState('A');
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEntered(false);
    setStep(1);
    setSuccess(false);
    Promise.all([
      api.getCombatMatches(contentId),
      api.getTeams(contentId).catch(() => []),
      api.getStudents().catch(() => []),
    ]).then(([list, teams, students]) => {
      if (cancelled) return;
      const m = list.find((x) => x.id === matchId);
      if (!m) { setNotFound(true); return; }
      setMatch(m);
      const d = m.details || {};

      // Roster names aren't stored on the match itself — pull them from the
      // team's student_ids so the referee doesn't have to type them by hand
      // (same idea as `memberNames` in the pure scoring flow).
      const rosterNames = (teamId) => {
        const t = teams.find((x) => x.id === teamId);
        if (!t?.student_ids?.length) return '';
        return t.student_ids
          .map((sid) => students.find((s) => s.id === sid))
          .filter(Boolean)
          .map((s) => s.full_name)
          .join(', ');
      };
      const teamMembersA = d.teamMembersA || rosterNames(m.team_a_id);
      const teamMembersB = d.teamMembersB || rosterNames(m.team_b_id);
      const commonFields = {
        teamMembersA, teamMembersB,
        studentSigImageA: d.studentSignatureImageA || '', studentSigImageB: d.studentSignatureImageB || '',
        refereeSignature: d.refereeSignature || user?.fullName || user?.username || '',
        refereeSigImage: d.refereeSignatureImage || '',
        headRefereeName: d.headRefereeName || 'Mr Ly Quang Van',
        scorekeeperName: d.scorekeeperName || user?.fullName || user?.username || '',
        remarks: d.remarks || '', objection: d.objection || '',
      };

      if (isStars) {
        setForm({
          meteorCompletedA: !!d.meteorCompletedA, meteorCompletedB: !!d.meteorCompletedB,
          energyBlocksA: d.energyBlocksA ?? 0, energyBlocksB: d.energyBlocksB ?? 0,
          firepowerBallsA: d.firepowerBallsA ?? 0, firepowerBallsB: d.firepowerBallsB ?? 0,
          directWinA: !!d.directWinA, directWinB: !!d.directWinB,
          retryCountA: d.retryCountA ?? 0, retryCountB: d.retryCountB ?? 0,
          pointsLostA: d.pointsLostA ?? 0, pointsLostB: d.pointsLostB ?? 0,
          durationA: d.durationA ?? '', durationB: d.durationB ?? '',
          division: d.division || '',
          ...commonFields,
        });
      } else {
        setForm({
          division: d.division || '',
          firstHalfA: d.firstHalfA ?? 0, firstHalfB: d.firstHalfB ?? 0,
          secondHalfA: d.secondHalfA ?? 0, secondHalfB: d.secondHalfB ?? 0,
          refereeAwardedA: d.refereeAwardedA ?? 0, refereeAwardedB: d.refereeAwardedB ?? 0,
          refereeAwardedReasonA: d.refereeAwardedReasonA || '', refereeAwardedReasonB: d.refereeAwardedReasonB || '',
          shootoutRounds: Array.isArray(d.shootoutRounds) ? d.shootoutRounds : [],
          ...commonFields,
        });
      }
      // Match already has a result / is past "scheduled" (re-editing) — skip
      // straight to scoring, don't force another "Start" click.
      if (m.winner_id || m.is_draw || (m.status && m.status !== 'scheduled')) setEntered(true);
    }).catch(() => { if (!cancelled) setNotFound(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contentId, matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stopwatch ──
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  useEffect(() => {
    let interval = null;
    if (isTimerRunning) interval = setInterval(() => setStopwatchSeconds((s) => s + 1), 1000);
    else clearInterval(interval);
    return () => clearInterval(interval);
  }, [isTimerRunning]);
  const toggleStopwatch = () => setIsTimerRunning((r) => !r);
  const resetStopwatch = () => { setIsTimerRunning(false); setStopwatchSeconds(0); };
  const applyStopwatchToTime = () => {
    setForm((f) => ({ ...f, durationA: String(stopwatchSeconds), durationB: String(stopwatchSeconds) }));
    showAlert(`Match time recorded: ${stopwatchSeconds}s (${formatSecondsAsMinutes(stopwatchSeconds)}) for both teams`, 'success');
  };

  const startMatch = () => {
    setStartedAt(new Date().toISOString());
    setIsTimerRunning(true);
    setEntered(true);
    // Fly Smart Cup: match lifecycle status (mục 2/13 luật) — Battle of Stars
    // không dùng status nên không đụng tới để không ảnh hưởng module đó.
    if (!isStars && match?.status === 'scheduled') {
      api.putCombatMatch(match.id, { status: 'live' }).catch(() => {});
    }
  };

  // ── Battle of Stars: live score & result (KHÔNG đổi) ──
  const sideData = (side) => ({
    meteorCompleted: side === 'A' ? form.meteorCompletedA : form.meteorCompletedB,
    energyBlocks: side === 'A' ? form.energyBlocksA : form.energyBlocksB,
    firepowerBalls: side === 'A' ? form.firepowerBallsA : form.firepowerBallsB,
    retryCount: side === 'A' ? form.retryCountA : form.retryCountB,
    pointsLost: side === 'A' ? form.pointsLostA : form.pointsLostB,
    directWin: side === 'A' ? form.directWinA : form.directWinB,
  });
  const setDirectWin = (side, checked) => {
    setForm((f) => ({
      ...f,
      directWinA: side === 'A' ? checked : (checked ? false : f.directWinA),
      directWinB: side === 'B' ? checked : (checked ? false : f.directWinB),
    }));
  };
  const scoreA = isStars ? computeTaskScore(sideData('A')) : null;
  const scoreB = isStars ? computeTaskScore(sideData('B')) : null;
  const starsOutcome = isStars ? determineGroupMatchResult(sideData('A'), sideData('B')) : null;
  const starsResultText = isStars ? (
    form.directWinA ? `${match?.team_a?.name} wins — Direct Win (Final Fortress)`
      : form.directWinB ? `${match?.team_b?.name} wins — Direct Win (Final Fortress)`
      : starsOutcome.result === 'DRAW' ? `Draw (${scoreA.taskScore} - ${scoreB.taskScore})`
      : starsOutcome.result === 'A' ? `${match?.team_a?.name} wins (${scoreA.taskScore} - ${scoreB.taskScore})`
      : `${match?.team_b?.name} wins (${scoreA.taskScore} - ${scoreB.taskScore})`
  ) : '';

  // ── Fly Smart Cup: live score & result — independent rules, no relation to Battle of Stars ──
  const droneSideA = () => ({ half1: form.firstHalfA, half2: form.secondHalfA, refereeAwarded: form.refereeAwardedA });
  const droneSideB = () => ({ half1: form.firstHalfB, half2: form.secondHalfB, refereeAwarded: form.refereeAwardedB });
  const droneScoreA = !isStars ? computeSideScore(droneSideA()) : null;
  const droneScoreB = !isStars ? computeSideScore(droneSideB()) : null;
  const isKnockout = !isStars && !match?.group_label;
  const droneTied = !isStars && droneScoreA.total === droneScoreB.total;
  const droneOutcome = !isStars
    ? (isKnockout ? determineKnockoutResult(droneSideA(), droneSideB(), form.shootoutRounds) : determineDroneGroupResult(droneSideA(), droneSideB()))
    : null;
  const shootoutWinnerInfo = !isStars && isKnockout ? resolveShootoutWinner(form.shootoutRounds) : { winner: null };

  const droneResultText = () => {
    if (!match) return '';
    if (isKnockout) {
      if (droneOutcome.result === 'A') return `${match.team_a?.name} advances (${droneScoreA.total} - ${droneScoreB.total})${droneOutcome.shootoutNeeded ? ' — decided by Penalty Shootout' : ''}`;
      if (droneOutcome.result === 'B') return `${match.team_b?.name} advances (${droneScoreA.total} - ${droneScoreB.total})${droneOutcome.shootoutNeeded ? ' — decided by Penalty Shootout' : ''}`;
      return `Tied ${droneScoreA.total} - ${droneScoreB.total} — Penalty Shootout required`;
    }
    if (droneOutcome.result === 'DRAW') return `Draw (${droneScoreA.total} - ${droneScoreB.total}) — 1 Match Point each`;
    if (droneOutcome.result === 'A') return `${match.team_a?.name} wins (${droneScoreA.total} - ${droneScoreB.total}) — 3 Match Points`;
    return `${match.team_b?.name} wins (${droneScoreA.total} - ${droneScoreB.total}) — 3 Match Points`;
  };

  const startShootout = () => setForm((f) => ({ ...f, shootoutRounds: [1, 2, 3].map(newShootoutRound) }));
  const addShootoutRound = () => setForm((f) => ({ ...f, shootoutRounds: [...f.shootoutRounds, newShootoutRound(f.shootoutRounds.length + 1)] }));
  const updateShootoutRound = (idx, patch) => setForm((f) => {
    const rounds = [...f.shootoutRounds];
    rounds[idx] = { ...rounds[idx], ...patch };
    return { ...f, shootoutRounds: rounds };
  });

  const gotoStep2 = () => {
    if (!isStars) {
      if (isKnockout && droneTied && !shootoutWinnerInfo.winner) {
        showAlert('Penalty Shootout is not resolved yet — add rounds until there is a winner.', 'error');
        return;
      }
      if ((Number(form.refereeAwardedA) || 0) > 0 && !String(form.refereeAwardedReasonA || '').trim()) {
        showAlert('A reason is required for Red Referee Awarded Points.', 'error');
        return;
      }
      if ((Number(form.refereeAwardedB) || 0) > 0 && !String(form.refereeAwardedReasonB || '').trim()) {
        showAlert('A reason is required for Blue Referee Awarded Points.', 'error');
        return;
      }
    }
    setIsTimerRunning(false);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!form.studentSigImageA || !form.studentSigImageB || !form.refereeSigImage) {
      showAlert('Please collect signatures from both teams and the referee before saving.', 'error');
      return;
    }
    if (isStars && form.directWinA && form.directWinB) {
      showAlert('Both teams cannot have Direct Win at the same time.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let body;
      if (isStars) {
        const details = {
          division: form.division || null,
          meteorCompletedA: !!form.meteorCompletedA, meteorCompletedB: !!form.meteorCompletedB,
          energyBlocksA: clampEnergy(form.energyBlocksA), energyBlocksB: clampEnergy(form.energyBlocksB),
          firepowerBallsA: clampFirepower(form.firepowerBallsA), firepowerBallsB: clampFirepower(form.firepowerBallsB),
          directWinA: !!form.directWinA, directWinB: !!form.directWinB,
          retryCountA: Math.max(0, Number(form.retryCountA) || 0), retryCountB: Math.max(0, Number(form.retryCountB) || 0),
          pointsLostA: Math.max(0, Number(form.pointsLostA) || 0), pointsLostB: Math.max(0, Number(form.pointsLostB) || 0),
          durationA: form.durationA || null, durationB: form.durationB || null,
          teamMembersA: form.teamMembersA || null, teamMembersB: form.teamMembersB || null,
          studentSignatureImageA: form.studentSigImageA || null, studentSignatureImageB: form.studentSigImageB || null,
          refereeSignature: form.refereeSignature || null,
          refereeSignatureImage: form.refereeSigImage || null,
          headRefereeName: form.headRefereeName || null,
          scorekeeperName: form.scorekeeperName || null,
          remarks: form.remarks || null, objection: form.objection || null,
        };
        const { result } = determineGroupMatchResult(sideData('A'), sideData('B'));
        body = {
          details,
          winner_id: result === 'A' ? match.team_a_id : result === 'B' ? match.team_b_id : null,
          is_draw: result === 'DRAW',
        };
      } else {
        const details = {
          division: form.division || null,
          firstHalfA: Math.max(0, Number(form.firstHalfA) || 0), firstHalfB: Math.max(0, Number(form.firstHalfB) || 0),
          secondHalfA: Math.max(0, Number(form.secondHalfA) || 0), secondHalfB: Math.max(0, Number(form.secondHalfB) || 0),
          refereeAwardedA: Math.max(0, Number(form.refereeAwardedA) || 0), refereeAwardedB: Math.max(0, Number(form.refereeAwardedB) || 0),
          refereeAwardedReasonA: form.refereeAwardedReasonA || null, refereeAwardedReasonB: form.refereeAwardedReasonB || null,
          shootoutRounds: (form.shootoutRounds || []).map((r) => ({
            roundNo: r.roundNo,
            aSuccess: !!r.aSuccess, aTimeSeconds: r.aSuccess ? (Number(r.aTimeSeconds) || null) : null,
            bSuccess: !!r.bSuccess, bTimeSeconds: r.bSuccess ? (Number(r.bTimeSeconds) || null) : null,
          })),
          teamMembersA: form.teamMembersA || null, teamMembersB: form.teamMembersB || null,
          studentSignatureImageA: form.studentSigImageA || null, studentSignatureImageB: form.studentSigImageB || null,
          refereeSignature: form.refereeSignature || null,
          refereeSignatureImage: form.refereeSigImage || null,
          headRefereeName: form.headRefereeName || null,
          scorekeeperName: form.scorekeeperName || null,
          remarks: form.remarks || null, objection: form.objection || null,
        };
        const outcome = isKnockout
          ? determineKnockoutResult(droneSideA(), droneSideB(), details.shootoutRounds)
          : determineDroneGroupResult(droneSideA(), droneSideB());
        body = {
          details,
          winner_id: outcome.result === 'A' ? match.team_a_id : outcome.result === 'B' ? match.team_b_id : null,
          is_draw: !isKnockout && outcome.result === 'DRAW',
        };
      }
      await api.putCombatMatch(match.id, body);
      // The PUT response doesn't include nested team_a/team_b/boards (only the
      // GET list joins those) — merge into the match we already have loaded.
      setSavedMatch({ ...match, details: body.details, winner_id: body.winner_id, is_draw: body.is_draw, status: 'completed' });
      setSuccess(true);
    } catch (e) {
      showAlert(e.message || 'Failed to save.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitStatusAction = async () => {
    if (!statusReason.trim()) { showAlert('A reason is required.', 'error'); return; }
    setStatusSaving(true);
    try {
      const status = statusAction === 'cancel' ? 'cancelled' : 'disqualified';
      const details = {
        ...(match.details || {}),
        division: form.division || null,
        disqualifiedTeam: statusAction === 'disqualify' ? disqualifiedSide : null,
        disqualificationReason: statusReason,
      };
      await api.putCombatMatch(match.id, { status, details });
      showAlert(`Match marked as ${status}.`, 'success');
      setStatusAction(null);
      navigate(listUrl);
    } catch (e) {
      showAlert(e.message || 'Failed to update match status.', 'error');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const teamName = (savedMatch?.team_a?.name || 'match').replace(/\s+/g, '-').toLowerCase();
      await exportToPdf(sheetRef, `${format}-${teamName}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="ts-wrapper ts-center-screen">
      <p style={{ color: '#94a3b8' }}>Loading...</p>
    </div>
  );

  if (notFound) return (
    <div className="ts-wrapper ts-center-screen">
      <div className="ts-card ts-gate-card">
        <p style={{ color: '#f87171' }}>Match not found.</p>
        <Link to={listUrl} className="ts-btn ts-btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>← Back</Link>
      </div>
    </div>
  );

  // ── Success screen: per-team score sheet, ready to view/print right away ──
  if (success) {
    return (
      <div className="ts-wrapper ts-tablet-layout">
        <div className="ts-success" style={{ margin: '24px auto' }}>
          <div className="ts-success-icon">✓</div>
          <strong>Match score sheet saved!</strong>
        </div>
        <div className="ts-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            <button type="button" className="ts-btn ts-btn-primary" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Download PDF'}
            </button>
            <Link to={listUrl} className="ts-btn ts-btn-secondary">← Back to match list</Link>
          </div>
          {isStars
            ? <CombatStarsSheetTable match={savedMatch} sheetRef={sheetRef} />
            : <CombatDroneSheetTable match={savedMatch} sheetRef={sheetRef} />}
        </div>
      </div>
    );
  }

  // ── Start Match gate ──
  if (!entered) {
    return (
      <div className="ts-wrapper ts-center-screen">
        <div className="ts-card ts-gate-card">
          <div className="ts-gate-badge">
            {match.stage && <span className="ts-gate-round">{match.stage}</span>}
            {match.group_label && <span className="ts-gate-board">{match.group_label}</span>}
            {match.boards?.name && <span className="ts-gate-board">{match.boards.name}</span>}
          </div>

          <div className="ts-gate-eyebrow">{isStars ? 'Battle of Stars' : 'Fly Smart Cup'}</div>
          <h2 className="ts-gate-team">{match.team_a?.name || '—'} <span style={{ color: '#64748b' }}>vs</span> {match.team_b?.name || '—'}</h2>

          <div className="ts-gate-action">
            <button type="button" className="ts-btn ts-btn-primary ts-btn-xl ts-gate-start-btn" onClick={startMatch}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>
              START MATCH
            </button>
            <p className="ts-gate-hint">⏱ The stopwatch starts automatically — use it to record the match time on the sheet.</p>
          </div>

          <div className="ts-gate-footer">
            <Link to={listUrl} className="ts-btn ts-btn-ghost">← Back to match list</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-wrapper ts-tablet-layout">
      <header className="ts-header">
        <Link to={listUrl} className="ts-back" title="Back to match list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {match.team_a?.name || '—'} <span style={{ color: '#64748b', fontWeight: 400 }}>vs</span> {match.team_b?.name || '—'}
            {match.stage && <span className="ts-board-chip">{match.stage}</span>}
            {match.group_label && <span className="ts-board-chip">{match.group_label}</span>}
            {!isStars && match.status && match.status !== 'scheduled' && <span className="ts-board-chip">{match.status.toUpperCase()}</span>}
          </div>
          <div className="ts-content-name">{isStars ? 'Battle of Stars' : 'Fly Smart Cup'} — Combat</div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">LIVE SCORE</div>
          <div className="ts-score-value" style={{ fontSize: 20 }}>
            {isStars ? `${scoreA.taskScore} - ${scoreB.taskScore}` : `${droneScoreA.total} - ${droneScoreB.total}`}
          </div>
        </div>
      </header>

      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">Score both teams</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">Confirm & sign to save</span>
        </div>
      </div>

      {step === 1 && (
        <div className="ts-split-container">
          <aside className="ts-sidebar-pane">
            <div className="ts-card ts-sidebar-card">
              <div className="ts-sidebar-title">STOPWATCH</div>
              <div className="ts-stopwatch-widget">
                <div className="ts-stopwatch-display">
                  <span className="ts-stopwatch-digits">{formatSecondsAsMinutes(stopwatchSeconds)}</span>
                  <span className="ts-stopwatch-sec">({stopwatchSeconds}s)</span>
                </div>
                <div className="ts-stopwatch-controls">
                  <button type="button" className={`ts-timer-btn ${isTimerRunning ? 'pause' : 'start'}`} onClick={toggleStopwatch}>
                    {isTimerRunning ? '⏸ PAUSE' : '▶ START'}
                  </button>
                  <button type="button" className="ts-timer-btn reset" onClick={resetStopwatch} title="Reset to 0">↺</button>
                </div>
                {isStars && (
                  <button type="button" className="ts-timer-apply-btn" onClick={applyStopwatchToTime}>
                    ✓ Use this time for both teams
                  </button>
                )}
              </div>

              {isStars ? (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#4ade80' }}>
                  {starsResultText}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#4ade80' }}>
                  {droneResultText()}
                </div>
              )}
            </div>

            {!isStars && (
              <div className="ts-card ts-sidebar-card" style={{ marginTop: 12 }}>
                <div className="ts-sidebar-title">MATCH STATUS</div>
                <div style={{ marginBottom: 10 }}>
                  <span className="rt-badge">{(match.status || 'scheduled').toUpperCase()}</span>
                </div>
                {match.status !== 'cancelled' && match.status !== 'disqualified' && !statusAction && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" className="ts-btn ts-btn-secondary" onClick={() => { setStatusAction('cancel'); setStatusReason(''); }}>Cancel Match</button>
                    <button type="button" className="ts-btn ts-btn-secondary" onClick={() => { setStatusAction('disqualify'); setStatusReason(''); setDisqualifiedSide('A'); }}>Disqualify a Team</button>
                  </div>
                )}
                {(match.status === 'cancelled' || match.status === 'disqualified') && (
                  <p style={{ fontSize: 12, color: '#f87171' }}>
                    {match.details?.disqualificationReason || 'This match was closed without a normal result.'}
                  </p>
                )}
                {statusAction && (
                  <div style={{ marginTop: 6, padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                    {statusAction === 'disqualify' && (
                      <select className="form-input form-select" value={disqualifiedSide} onChange={(e) => setDisqualifiedSide(e.target.value)} style={{ marginBottom: 6 }}>
                        <option value="A">{match.team_a?.name} (Red)</option>
                        <option value="B">{match.team_b?.name} (Blue)</option>
                      </select>
                    )}
                    <textarea className="form-input" rows={2} placeholder="Reason (required)" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStatusAction(null)} disabled={statusSaving}>Back</button>
                      <button type="button" className="ts-btn ts-btn-primary" onClick={submitStatusAction} disabled={statusSaving}>
                        {statusSaving ? 'Saving...' : statusAction === 'cancel' ? 'Confirm Cancel' : 'Confirm Disqualify'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>

          <main>
            <div className="ts-card" style={{ padding: 24 }}>
              <div className="form-group" style={{ marginBottom: 14, maxWidth: 240 }}>
                <label className="form-label">Division</label>
                <input type="text" className="form-input" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
              </div>

              {isStars ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th style={{ textAlign: 'center' }}>{match.team_a?.name} (Red)</th>
                        <th style={{ textAlign: 'center' }}>{match.team_b?.name} (Blue)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: 13 }}>Meteor Tower <span style={{ color: '#94a3b8' }}>({METEOR_TOWER_SCORE} if completed)</span></td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!form.meteorCompletedA} onChange={(e) => setForm({ ...form, meteorCompletedA: e.target.checked })} /> Completed
                          </label>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!form.meteorCompletedB} onChange={(e) => setForm({ ...form, meteorCompletedB: e.target.checked })} /> Completed
                          </label>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Energy Defense <span style={{ color: '#94a3b8' }}>({ENERGY_BLOCK_SCORE}pts/block, max {ENERGY_BLOCK_MAX})</span></td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" max={ENERGY_BLOCK_MAX} className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.energyBlocksA} onChange={(e) => setForm({ ...form, energyBlocksA: clampEnergy(e.target.value) })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" max={ENERGY_BLOCK_MAX} className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.energyBlocksB} onChange={(e) => setForm({ ...form, energyBlocksB: clampEnergy(e.target.value) })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Full Firepower <span style={{ color: '#94a3b8' }}>({FIREPOWER_BALL_SCORE}pts/ball, max {FIREPOWER_BALL_MAX})</span></td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" max={FIREPOWER_BALL_MAX} className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.firepowerBallsA} onChange={(e) => setForm({ ...form, firepowerBallsA: clampFirepower(e.target.value) })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" max={FIREPOWER_BALL_MAX} className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.firepowerBallsB} onChange={(e) => setForm({ ...form, firepowerBallsB: clampFirepower(e.target.value) })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Final Fortress <span style={{ color: '#94a3b8' }}>(no points — Direct Win only)</span></td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!form.directWinA} onChange={(e) => setDirectWin('A', e.target.checked)} /> Direct Win
                          </label>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!form.directWinB} onChange={(e) => setDirectWin('B', e.target.checked)} /> Direct Win
                          </label>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Retries</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.retryCountA} onChange={(e) => setForm({ ...form, retryCountA: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.retryCountB} onChange={(e) => setForm({ ...form, retryCountB: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Extra Reward <span style={{ color: '#94a3b8' }}>(auto — 40/30/20/10/0 by retries)</span></td>
                        <td style={{ textAlign: 'center' }}>{scoreA.extraReward}</td>
                        <td style={{ textAlign: 'center' }}>{scoreB.extraReward}</td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Points lost (penalty)</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.pointsLostA} onChange={(e) => setForm({ ...form, pointsLostA: Math.max(0, Number(e.target.value) || 0) })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.pointsLostB} onChange={(e) => setForm({ ...form, pointsLostB: Math.max(0, Number(e.target.value) || 0) })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Total duration (seconds)</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.durationA} onChange={(e) => setForm({ ...form, durationA: e.target.value })} />
                          {form.durationA && <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatSecondsAsMinutes(form.durationA)}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                            value={form.durationB} onChange={(e) => setForm({ ...form, durationB: e.target.value })} />
                          {form.durationB && <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatSecondsAsMinutes(form.durationB)}</div>}
                        </td>
                      </tr>
                      <tr style={{ fontWeight: 700 }}>
                        <td style={{ fontSize: 13 }}>Task Score</td>
                        <td style={{ textAlign: 'center' }}>{scoreA.taskScore}</td>
                        <td style={{ textAlign: 'center' }}>{scoreB.taskScore}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th></th>
                          <th style={{ textAlign: 'center' }}>{match.team_a?.name} (Red)</th>
                          <th style={{ textAlign: 'center' }}>{match.team_b?.name} (Blue)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontSize: 13 }}>Half 1</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.firstHalfA} onChange={(e) => setForm({ ...form, firstHalfA: e.target.value })} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.firstHalfB} onChange={(e) => setForm({ ...form, firstHalfB: e.target.value })} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: 13 }}>Half 2</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.secondHalfA} onChange={(e) => setForm({ ...form, secondHalfA: e.target.value })} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.secondHalfB} onChange={(e) => setForm({ ...form, secondHalfB: e.target.value })} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: 13 }}>Referee Awarded Points <span style={{ color: '#94a3b8' }}>(mục 12 — cần lý do)</span></td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.refereeAwardedA} onChange={(e) => setForm({ ...form, refereeAwardedA: e.target.value })} />
                            {(Number(form.refereeAwardedA) || 0) > 0 && (
                              <input type="text" className="form-input" style={{ marginTop: 4, fontSize: 12 }} placeholder="Reason"
                                value={form.refereeAwardedReasonA} onChange={(e) => setForm({ ...form, refereeAwardedReasonA: e.target.value })} />
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.refereeAwardedB} onChange={(e) => setForm({ ...form, refereeAwardedB: e.target.value })} />
                            {(Number(form.refereeAwardedB) || 0) > 0 && (
                              <input type="text" className="form-input" style={{ marginTop: 4, fontSize: 12 }} placeholder="Reason"
                                value={form.refereeAwardedReasonB} onChange={(e) => setForm({ ...form, refereeAwardedReasonB: e.target.value })} />
                            )}
                          </td>
                        </tr>
                        <tr style={{ fontWeight: 700 }}>
                          <td style={{ fontSize: 13 }}>Total Score</td>
                          <td style={{ textAlign: 'center' }}>{droneScoreA.total}</td>
                          <td style={{ textAlign: 'center' }}>{droneScoreB.total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {isKnockout && droneTied && (
                    <div style={{ marginTop: 20, padding: 16, border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, background: 'rgba(239,68,68,0.06)' }}>
                      <h4 style={{ margin: '0 0 8px', color: '#f87171' }}>PENALTY SHOOTOUT — scores tied {droneScoreA.total} - {droneScoreB.total}</h4>
                      {form.shootoutRounds.length === 0 ? (
                        <button type="button" className="ts-btn ts-btn-primary" onClick={startShootout}>Start Penalty Shootout</button>
                      ) : (
                        <>
                          {form.shootoutRounds.map((r, idx) => (
                            <div key={r.roundNo} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                              <strong style={{ width: 70 }}>Round {r.roundNo}</strong>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={!!r.aSuccess} onChange={(e) => updateShootoutRound(idx, { aSuccess: e.target.checked })} /> Red scored
                              </label>
                              <input type="number" className="form-input" style={{ width: 90 }} placeholder="sec" min="0.01" max={PENALTY_MAX_SECONDS} step="0.01"
                                disabled={!r.aSuccess} value={r.aTimeSeconds} onChange={(e) => updateShootoutRound(idx, { aTimeSeconds: e.target.value })} />
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={!!r.bSuccess} onChange={(e) => updateShootoutRound(idx, { bSuccess: e.target.checked })} /> Blue scored
                              </label>
                              <input type="number" className="form-input" style={{ width: 90 }} placeholder="sec" min="0.01" max={PENALTY_MAX_SECONDS} step="0.01"
                                disabled={!r.bSuccess} value={r.bTimeSeconds} onChange={(e) => updateShootoutRound(idx, { bTimeSeconds: e.target.value })} />
                            </div>
                          ))}
                          {shootoutWinnerInfo.winner ? (
                            <p style={{ color: '#4ade80', fontWeight: 700 }}>
                              Shootout winner: {shootoutWinnerInfo.winner === 'A' ? match.team_a?.name : match.team_b?.name} (Round {shootoutWinnerInfo.decidingRound})
                            </p>
                          ) : (
                            <button type="button" className="ts-btn ts-btn-secondary" onClick={addShootoutRound}>+ Add Round</button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="ts-task-nav">
                <button type="button" className="ts-btn ts-btn-secondary" onClick={() => navigate(listUrl)}>← Close</button>
                <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={gotoStep2}>Review & sign to save →</button>
              </div>
            </div>
          </main>
        </div>
      )}

      {step === 2 && (
        <div className="ts-card ts-sheet-card">
          <div className="ts-sheet-header">
            <div>
              <h2 className="ts-card-title" style={{ fontSize: 20, margin: 0 }}>CONFIRM MATCH RESULT</h2>
              <div className="ts-sheet-sub">
                {match.team_a?.name} (Red) vs {match.team_b?.name} (Blue)
                {match.boards?.name ? ` · Board: ${match.boards.name}` : ''}
              </div>
            </div>
            <div className="ts-sheet-total-badge">
              <span className="ts-st-label">RESULT</span>
              <span className="ts-st-val" style={{ fontSize: 16 }}>
                {isStars
                  ? starsResultText
                  : (isKnockout
                    ? (droneOutcome.result === 'A' ? match.team_a?.name : droneOutcome.result === 'B' ? match.team_b?.name : 'Pending shootout')
                    : (droneOutcome.result === 'DRAW' ? 'Draw' : droneOutcome.result === 'A' ? match.team_a?.name : match.team_b?.name))}
              </span>
            </div>
          </div>

          <div className="ts-sheet-form-grid">
            <div className="ts-form-row">
              <label className="ts-label">Student / Team Captain — Red ({match.team_a?.name}) <span className="ts-hint-inline">(locked)</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.teamMembersA} readOnly placeholder="No members recorded" />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Student / Team Captain — Blue ({match.team_b?.name}) <span className="ts-hint-inline">(locked)</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.teamMembersB} readOnly placeholder="No members recorded" />
            </div>
            <div className="ts-form-row">
              <SignatureBox label="Red Team Signature" value={form.studentSigImageA} onChange={(v) => setForm({ ...form, studentSigImageA: v })} required />
            </div>
            <div className="ts-form-row">
              <SignatureBox label="Blue Team Signature" value={form.studentSigImageB} onChange={(v) => setForm({ ...form, studentSigImageB: v })} required />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Referee Name <span className="ts-hint-inline">(locked)</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.refereeSignature} readOnly />
            </div>
            <div className="ts-form-row">
              <SignatureBox label="Referee Signature" value={form.refereeSigImage} onChange={(v) => setForm({ ...form, refereeSigImage: v })} required />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Chief Referee <span className="ts-hint-inline">(locked)</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.headRefereeName} readOnly />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Scorekeeper <span className="ts-hint-inline">(locked)</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.scorekeeperName} readOnly />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Remarks</label>
              <textarea className="ts-input" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Objection</label>
              <textarea className="ts-input" rows={2} value={form.objection} onChange={(e) => setForm({ ...form, objection: e.target.value })} />
            </div>
          </div>

          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>← Edit scores</button>
            <button type="button" className="ts-btn ts-btn-primary ts-btn-xl" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : '✓ CONFIRM & SAVE SCORE SHEET'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
