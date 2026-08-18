import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, taskImageUrl } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { useLang, t } from '../../lib/i18n';
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
  PENALTY_MAX_SECONDS, computeSideScore,
  determineGroupMatchResult as determineDroneGroupResult,
  determineKnockoutResult, resolveShootoutWinner,
} from '../../lib/flySmartCupScoring';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const clampEnergy = (v) => Math.min(ENERGY_BLOCK_MAX, Math.max(0, parseInt(v, 10) || 0));
const clampFirepower = (v) => Math.min(FIREPOWER_BALL_MAX, Math.max(0, parseInt(v, 10) || 0));
const newShootoutRound = (n) => ({ roundNo: n, aSuccess: false, aTimeSeconds: '', bSuccess: false, bTimeSeconds: '' });

const STATUS_LABEL_VI = { scheduled: 'Chưa bắt đầu', live: 'Đang diễn ra', completed: 'Đã hoàn thành', cancelled: 'Đã hủy', disqualified: 'Truất quyền' };

// Ô nhập số lượng nhiệm vụ (khối năng lượng, bóng hỏa lực, số lần thử lại,
// điểm bị trừ) — thêm nút +/- để trọng tài không phải gõ tay bằng bàn phím
// ảo trên iPad, vốn khá lích kích khi phải bấm liên tục giữa các trận.
function MiniStepper({ value, onChange, min = 0, max }) {
  const num = Number(value) || 0;
  const clamp = (v) => Math.min(max ?? Infinity, Math.max(min, v));
  return (
    <div className="ts-mini-stepper">
      <button type="button" onClick={() => onChange(clamp(num - 1))} disabled={num <= min}>−</button>
      <input
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || 0))}
      />
      <button type="button" onClick={() => onChange(clamp(num + 1))} disabled={max != null && num >= max}>+</button>
    </div>
  );
}

// Score sheet for 1 combat match — replaces the old inline accordion: clicking
// a match in the list opens this dedicated page (same shape as the "pure"
// TaskScoringWizard flow): a Start Match gate, a live stopwatch while
// scoring, and after saving it shows the actual per-team score sheet inline
// (view/print PDF) instead of just a toast.
//
// Battle of Stars (isStars) keeps its existing rules untouched. Fly Smart Cup
// (drone) uses its OWN, independent rule set (client/src/lib/flySmartCupScoring.js)
// — goals/score only, no Meteor Tower/Direct Win/Task Score/Retry.
//
// UI text renders in English or Vietnamese based on the logged-in referee's
// user.language (client/src/lib/i18n.js) — EN is the original/default text,
// unchanged from before this feature existed.
export default function RefereeCombatMatchScore({ format }) {
  const isStars = format === 'combat_stars';
  const { competitionId, contentId, matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const lang = useLang();
  const { showAlert } = useNotify();
  const sheetRef = useRef(null);

  const listUrl = `/referee/competition/${competitionId}/content/${contentId}/${isStars ? 'combat-stars' : 'combat-drone'}`;

  const [match, setMatch] = useState(null);
  const [content, setContent] = useState(null);
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
  const [missionTasks, setMissionTasks] = useState([]);

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
      // Ảnh minh hoạ nhiệm vụ Battle of Stars — lấy từ "Nhiệm vụ" đã tạo sẵn
      // cho content này, khớp theo tên (không phải kho ảnh riêng).
      isStars ? api.getTasks(contentId).catch(() => []) : Promise.resolve([]),
      // Thời gian tối đa (time_limit_seconds) để tự động dừng đồng hồ bấm giờ.
      api.getContents(competitionId).catch(() => []),
    ]).then(([list, teams, students, tasks, contents]) => {
      if (!cancelled) setMissionTasks(tasks);
      if (!cancelled) setContent(contents.find((c) => c.id === contentId) || null);
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
          half1RedTeam: d.half1RedTeam === 'B' ? 'B' : 'A',
          half2RedTeam: d.half2RedTeam === 'B' ? 'B' : 'A',
          refereeAwardedA: d.refereeAwardedA ?? 0, refereeAwardedB: d.refereeAwardedB ?? 0,
          refereeAwardedReasonA: d.refereeAwardedReasonA || '', refereeAwardedReasonB: d.refereeAwardedReasonB || '',
          shootoutRounds: Array.isArray(d.shootoutRounds) ? d.shootoutRounds : [],
          ...commonFields,
        });
      }
      // Match already has a result / is past "scheduled" (re-editing) — skip
      // straight to scoring, don't force another "Start" click.
      if (m.winner_id || m.is_draw || (m.details?.status && m.details.status !== 'scheduled')) setEntered(true);
    }).catch(() => { if (!cancelled) setNotFound(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [competitionId, contentId, matchId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Tự động dừng đồng hồ khi chạm giới hạn thời gian thi của nội dung
  // (content.time_limit_seconds) — trọng tài có thể quên tự bấm Tạm dừng,
  // để đồng hồ chạy quá giờ quy định sẽ ghi sai thời gian vào phiếu điểm.
  useEffect(() => {
    if (isTimerRunning && content?.time_limit_seconds && stopwatchSeconds >= content.time_limit_seconds) {
      setIsTimerRunning(false);
      showAlert(
        t(lang, `Time's up — timer stopped automatically at ${content.time_limit_seconds}s.`, `Đã hết giờ — đồng hồ tự động dừng ở ${content.time_limit_seconds}s.`),
        'info'
      );
    }
  }, [stopwatchSeconds, isTimerRunning, content?.time_limit_seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMatch = () => {
    setStartedAt(new Date().toISOString());
    setIsTimerRunning(true);
    setEntered(true);
    // Fly Smart Cup: match lifecycle status (mục 2/13 luật) — Battle of Stars
    // không dùng status nên không đụng tới để không ảnh hưởng module đó.
    if (!isStars && (!match?.details?.status || match.details.status === 'scheduled')) {
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
    form.directWinA ? `${match?.team_a?.name} ${t(lang, 'wins', 'thắng')} — Direct Win (Final Fortress)`
      : form.directWinB ? `${match?.team_b?.name} ${t(lang, 'wins', 'thắng')} — Direct Win (Final Fortress)`
      : starsOutcome.result === 'DRAW' ? `${t(lang, 'Draw', 'Hòa')} (${scoreA.taskScore} - ${scoreB.taskScore})`
      : starsOutcome.result === 'A' ? `${match?.team_a?.name} ${t(lang, 'wins', 'thắng')} (${scoreA.taskScore} - ${scoreB.taskScore})`
      : `${match?.team_b?.name} ${t(lang, 'wins', 'thắng')} (${scoreA.taskScore} - ${scoreB.taskScore})`
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

  // Ảnh minh hoạ 4 nhiệm vụ cố định Battle of Stars — lấy từ "Nhiệm vụ" cùng
  // tên trong content này (admin quản lý ảnh y hệt task đo lường bình thường).
  const missionImageThumb = (missionName) => {
    const task = missionTasks.find((t) => (t.name || '').trim().toLowerCase() === missionName.toLowerCase());
    const url = taskImageUrl(task);
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noreferrer" title="Xem ảnh lớn" style={{ display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }}>
        <img src={url} alt={missionName} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid #334155' }} />
      </a>
    );
  };

  const droneResultText = () => {
    if (!match) return '';
    if (isKnockout) {
      if (droneOutcome.result === 'A') return `${match.team_a?.name} ${t(lang, 'advances', 'đi tiếp')} (${droneScoreA.total} - ${droneScoreB.total})${droneOutcome.shootoutNeeded ? t(lang, ' — decided by Penalty Shootout', ' — quyết định bằng đá luân lưu') : ''}`;
      if (droneOutcome.result === 'B') return `${match.team_b?.name} ${t(lang, 'advances', 'đi tiếp')} (${droneScoreA.total} - ${droneScoreB.total})${droneOutcome.shootoutNeeded ? t(lang, ' — decided by Penalty Shootout', ' — quyết định bằng đá luân lưu') : ''}`;
      return t(lang, `Tied ${droneScoreA.total} - ${droneScoreB.total} — Penalty Shootout required`, `Hòa ${droneScoreA.total} - ${droneScoreB.total} — cần đá luân lưu`);
    }
    if (droneOutcome.result === 'DRAW') return t(lang, `Draw (${droneScoreA.total} - ${droneScoreB.total}) — 1 Match Point each`, `Hòa (${droneScoreA.total} - ${droneScoreB.total}) — mỗi đội 1 Match Point`);
    if (droneOutcome.result === 'A') return t(lang, `${match.team_a?.name} wins (${droneScoreA.total} - ${droneScoreB.total}) — 3 Match Points`, `${match.team_a?.name} thắng (${droneScoreA.total} - ${droneScoreB.total}) — 3 Match Points`);
    return t(lang, `${match.team_b?.name} wins (${droneScoreA.total} - ${droneScoreB.total}) — 3 Match Points`, `${match.team_b?.name} thắng (${droneScoreA.total} - ${droneScoreB.total}) — 3 Match Points`);
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
        showAlert(t(lang, 'Penalty Shootout is not resolved yet — add rounds until there is a winner.', 'Đá luân lưu chưa có kết quả — thêm vòng cho đến khi có đội thắng.'), 'error');
        return;
      }
      if ((Number(form.refereeAwardedA) || 0) > 0 && !String(form.refereeAwardedReasonA || '').trim()) {
        showAlert(t(lang, `A reason is required for ${match.team_a?.name}'s Referee Awarded Points.`, `Cần nhập lý do cho Điểm trọng tài thưởng của ${match.team_a?.name}.`), 'error');
        return;
      }
      if ((Number(form.refereeAwardedB) || 0) > 0 && !String(form.refereeAwardedReasonB || '').trim()) {
        showAlert(t(lang, `A reason is required for ${match.team_b?.name}'s Referee Awarded Points.`, `Cần nhập lý do cho Điểm trọng tài thưởng của ${match.team_b?.name}.`), 'error');
        return;
      }
    }
    setIsTimerRunning(false);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!form.studentSigImageA || !form.studentSigImageB || !form.refereeSigImage) {
      showAlert(t(lang, 'Please collect signatures from both teams and the referee before saving.', 'Vui lòng lấy đủ chữ ký của cả 2 đội và trọng tài trước khi lưu.'), 'error');
      return;
    }
    if (isStars && form.directWinA && form.directWinB) {
      showAlert(t(lang, 'Both teams cannot have Direct Win at the same time.', 'Không thể cả 2 đội cùng có Direct Win.'), 'error');
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
          half1RedTeam: form.half1RedTeam === 'B' ? 'B' : 'A', half2RedTeam: form.half2RedTeam === 'B' ? 'B' : 'A',
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
      setSavedMatch({ ...match, details: { ...body.details, status: 'completed' }, winner_id: body.winner_id, is_draw: body.is_draw });
      setSuccess(true);
    } catch (e) {
      showAlert(e.message || t(lang, 'Failed to save.', 'Lưu thất bại.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitStatusAction = async () => {
    if (!statusReason.trim()) { showAlert(t(lang, 'A reason is required.', 'Cần nhập lý do.'), 'error'); return; }
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
      showAlert(t(lang, `Match marked as ${status}.`, `Đã đánh dấu trận là "${STATUS_LABEL_VI[status]}".`), 'success');
      setStatusAction(null);
      navigate(listUrl);
    } catch (e) {
      showAlert(e.message || t(lang, 'Failed to update match status.', 'Cập nhật trạng thái trận thất bại.'), 'error');
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
      <p style={{ color: '#94a3b8' }}>{t(lang, 'Loading...', 'Đang tải...')}</p>
    </div>
  );

  if (notFound) return (
    <div className="ts-wrapper ts-center-screen">
      <div className="ts-card ts-gate-card">
        <p style={{ color: '#f87171' }}>{t(lang, 'Match not found.', 'Không tìm thấy trận đấu.')}</p>
        <Link to={listUrl} className="ts-btn ts-btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>{t(lang, '← Back', '← Quay lại')}</Link>
      </div>
    </div>
  );

  // ── Success screen: just a confirmation + PDF download, no on-screen sheet
  // preview — the actual sheet still renders off-screen so handleExportPdf's
  // html2canvas capture keeps working. ──
  if (success) {
    return (
      <div className="ts-wrapper ts-center-screen">
        <div className="ts-success">
          <div className="ts-success-icon">✓</div>
          <strong>{t(lang, 'Match score sheet saved!', 'Đã lưu phiếu điểm trận đấu!')}</strong>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="ts-btn ts-btn-primary" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? t(lang, 'Exporting...', 'Đang xuất...') : t(lang, 'Download PDF', 'Tải PDF')}
            </button>
            <Link to={listUrl} className="ts-btn ts-btn-secondary">{t(lang, '← Back to match list', '← Về danh sách trận')}</Link>
          </div>
        </div>
        <div style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1 }}>
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
              {t(lang, 'START MATCH', 'BẮT ĐẦU TRẬN')}
            </button>
            <p className="ts-gate-hint">{t(lang, '⏱ The stopwatch starts automatically — use it to record the match time on the sheet.', '⏱ Đồng hồ bấm giờ tự động chạy — dùng để ghi lại thời gian trận đấu vào phiếu điểm.')}</p>
          </div>

          <div className="ts-gate-footer">
            <Link to={listUrl} className="ts-btn ts-btn-ghost">{t(lang, '← Back to match list', '← Về danh sách trận')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-wrapper ts-tablet-layout">
      <header className="ts-header">
        <Link to={listUrl} className="ts-back" title={t(lang, 'Back to match list', 'Về danh sách trận')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {match.team_a?.name || '—'} <span style={{ color: '#64748b', fontWeight: 400 }}>vs</span> {match.team_b?.name || '—'}
            {match.stage && <span className="ts-board-chip">{match.stage}</span>}
            {match.group_label && <span className="ts-board-chip">{match.group_label}</span>}
            {!isStars && match.details?.status && match.details.status !== 'scheduled' && (
              <span className="ts-board-chip">{t(lang, match.details.status.toUpperCase(), (STATUS_LABEL_VI[match.details.status] || match.details.status).toUpperCase())}</span>
            )}
          </div>
          <div className="ts-content-name">{isStars ? 'Battle of Stars' : 'Fly Smart Cup'} — {t(lang, 'Combat', 'Đối kháng')}</div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">{t(lang, 'LIVE SCORE', 'ĐIỂM TRỰC TIẾP')}</div>
          <div className="ts-score-value" style={{ fontSize: 20 }}>
            {isStars ? `${scoreA.taskScore} - ${scoreB.taskScore}` : `${droneScoreA.total} - ${droneScoreB.total}`}
          </div>
        </div>
      </header>

      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">{t(lang, 'Score both teams', 'Chấm điểm cả 2 đội')}</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">{t(lang, 'Confirm & sign to save', 'Xác nhận & ký để lưu')}</span>
        </div>
      </div>

      {step === 1 && (
        <div className="ts-split-container">
          <aside className="ts-sidebar-pane">
            <div className="ts-card ts-sidebar-card">
              <div className="ts-sidebar-title">{t(lang, 'STOPWATCH', 'ĐỒNG HỒ BẤM GIỜ')}</div>
              <div className="ts-stopwatch-widget">
                <div className="ts-stopwatch-display">
                  <span className="ts-stopwatch-digits">{formatSecondsAsMinutes(stopwatchSeconds)}</span>
                  <span className="ts-stopwatch-sec">({stopwatchSeconds}s)</span>
                </div>
                {content?.time_limit_seconds && (
                  <div className="ts-stopwatch-sec" style={{ marginTop: -6, marginBottom: 6 }}>
                    {t(lang, `Auto-stops at ${formatSecondsAsMinutes(content.time_limit_seconds)}`, `Tự dừng ở ${formatSecondsAsMinutes(content.time_limit_seconds)}`)}
                  </div>
                )}
                <div className="ts-stopwatch-controls">
                  <button type="button" className={`ts-timer-btn ${isTimerRunning ? 'pause' : 'start'}`} onClick={toggleStopwatch}>
                    {isTimerRunning ? t(lang, '⏸ PAUSE', '⏸ TẠM DỪNG') : t(lang, '▶ START', '▶ BẮT ĐẦU')}
                  </button>
                  <button type="button" className="ts-timer-btn reset" onClick={resetStopwatch} title={t(lang, 'Reset to 0', 'Đặt lại về 0')}>↺</button>
                </div>
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
                <div className="ts-sidebar-title">{t(lang, 'MATCH STATUS', 'TRẠNG THÁI TRẬN')}</div>
                <div style={{ marginBottom: 10 }}>
                  <span className="rt-badge">{t(lang, (match.details?.status || 'scheduled').toUpperCase(), (STATUS_LABEL_VI[match.details?.status || 'scheduled']).toUpperCase())}</span>
                </div>
                {match.details?.status !== 'cancelled' && match.details?.status !== 'disqualified' && !statusAction && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" className="ts-btn ts-btn-secondary" onClick={() => { setStatusAction('cancel'); setStatusReason(''); }}>{t(lang, 'Cancel Match', 'Hủy trận')}</button>
                    <button type="button" className="ts-btn ts-btn-secondary" onClick={() => { setStatusAction('disqualify'); setStatusReason(''); setDisqualifiedSide('A'); }}>{t(lang, 'Disqualify a Team', 'Truất quyền 1 đội')}</button>
                  </div>
                )}
                {(match.details?.status === 'cancelled' || match.details?.status === 'disqualified') && (
                  <p style={{ fontSize: 12, color: '#f87171' }}>
                    {match.details?.disqualificationReason || t(lang, 'This match was closed without a normal result.', 'Trận này đã kết thúc không có kết quả bình thường.')}
                  </p>
                )}
                {statusAction && (
                  <div style={{ marginTop: 6, padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                    {statusAction === 'disqualify' && (
                      <select className="form-input form-select" value={disqualifiedSide} onChange={(e) => setDisqualifiedSide(e.target.value)} style={{ marginBottom: 6 }}>
                        <option value="A">{match.team_a?.name}</option>
                        <option value="B">{match.team_b?.name}</option>
                      </select>
                    )}
                    <textarea className="form-input" rows={2} placeholder={t(lang, 'Reason (required)', 'Lý do (bắt buộc)')} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStatusAction(null)} disabled={statusSaving}>{t(lang, 'Back', 'Quay lại')}</button>
                      <button type="button" className="ts-btn ts-btn-primary" onClick={submitStatusAction} disabled={statusSaving}>
                        {statusSaving ? t(lang, 'Saving...', 'Đang lưu...') : statusAction === 'cancel' ? t(lang, 'Confirm Cancel', 'Xác nhận hủy') : t(lang, 'Confirm Disqualify', 'Xác nhận truất quyền')}
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
                        <th>{t(lang, 'Task', 'Nhiệm vụ')}</th>
                        <th style={{ textAlign: 'center' }}>{match.team_a?.name} (Red)</th>
                        <th style={{ textAlign: 'center' }}>{match.team_b?.name} (Blue)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: 13 }}>Meteor Tower <span style={{ color: '#94a3b8' }}>({METEOR_TOWER_SCORE} {t(lang, 'if completed', 'nếu hoàn thành')})</span>{missionImageThumb('Meteor Tower')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!form.meteorCompletedA} onChange={(e) => setForm({ ...form, meteorCompletedA: e.target.checked })} /> {t(lang, 'Completed', 'Hoàn thành')}
                          </label>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!form.meteorCompletedB} onChange={(e) => setForm({ ...form, meteorCompletedB: e.target.checked })} /> {t(lang, 'Completed', 'Hoàn thành')}
                          </label>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Energy Defense <span style={{ color: '#94a3b8' }}>({ENERGY_BLOCK_SCORE}{t(lang, 'pts/block', 'đ/khối')}, {t(lang, 'max', 'tối đa')} {ENERGY_BLOCK_MAX})</span>{missionImageThumb('Energy Defense')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.energyBlocksA} max={ENERGY_BLOCK_MAX} onChange={(v) => setForm({ ...form, energyBlocksA: v })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.energyBlocksB} max={ENERGY_BLOCK_MAX} onChange={(v) => setForm({ ...form, energyBlocksB: v })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Full Firepower <span style={{ color: '#94a3b8' }}>({FIREPOWER_BALL_SCORE}{t(lang, 'pts/ball', 'đ/quả')}, {t(lang, 'max', 'tối đa')} {FIREPOWER_BALL_MAX})</span>{missionImageThumb('Full Firepower')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.firepowerBallsA} max={FIREPOWER_BALL_MAX} onChange={(v) => setForm({ ...form, firepowerBallsA: v })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.firepowerBallsB} max={FIREPOWER_BALL_MAX} onChange={(v) => setForm({ ...form, firepowerBallsB: v })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>Final Fortress <span style={{ color: '#94a3b8' }}>({t(lang, 'no points — Direct Win only', 'không tính điểm — chỉ Direct Win')})</span>{missionImageThumb('Final Fortress')}</td>
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
                        <td style={{ fontSize: 13 }}>{t(lang, 'Retries', 'Số lần thử lại')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.retryCountA} onChange={(v) => setForm({ ...form, retryCountA: v })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.retryCountB} onChange={(v) => setForm({ ...form, retryCountB: v })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>{t(lang, 'Extra Reward', 'Điểm thưởng thêm')} <span style={{ color: '#94a3b8' }}>({t(lang, 'auto — 40/30/20/10/0 by retries', 'tự động — 40/30/20/10/0 theo số lần thử lại')})</span></td>
                        <td style={{ textAlign: 'center' }}>{scoreA.extraReward}</td>
                        <td style={{ textAlign: 'center' }}>{scoreB.extraReward}</td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>{t(lang, 'Points lost (penalty)', 'Điểm bị trừ (phạt)')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.pointsLostA} onChange={(v) => setForm({ ...form, pointsLostA: v })} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <MiniStepper value={form.pointsLostB} onChange={(v) => setForm({ ...form, pointsLostB: v })} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 13 }}>{t(lang, 'Total duration (seconds)', 'Tổng thời gian (giây)')}</td>
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
                        <td style={{ fontSize: 13 }}>{t(lang, 'Task Score', 'Điểm nhiệm vụ')}</td>
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
                          <th style={{ textAlign: 'center' }}>{match.team_a?.name}</th>
                          <th style={{ textAlign: 'center' }}>{match.team_b?.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontSize: 13 }}>
                            {t(lang, 'Half 1', 'Hiệp 1')}
                            <select className="form-input form-select" style={{ marginTop: 4, fontSize: 12, padding: '2px 6px' }}
                              value={form.half1RedTeam} onChange={(e) => setForm({ ...form, half1RedTeam: e.target.value })}>
                              <option value="A">{match.team_a?.name} = {t(lang, 'Red', 'Đỏ')}</option>
                              <option value="B">{match.team_b?.name} = {t(lang, 'Red', 'Đỏ')}</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.firstHalfA} onChange={(e) => setForm({ ...form, firstHalfA: e.target.value })} />
                            <div style={{ fontSize: 11, color: form.half1RedTeam === 'A' ? '#dc2626' : '#2563eb', marginTop: 2 }}>{form.half1RedTeam === 'A' ? t(lang, 'Red', 'Đỏ') : t(lang, 'Blue', 'Xanh')}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.firstHalfB} onChange={(e) => setForm({ ...form, firstHalfB: e.target.value })} />
                            <div style={{ fontSize: 11, color: form.half1RedTeam === 'B' ? '#dc2626' : '#2563eb', marginTop: 2 }}>{form.half1RedTeam === 'B' ? t(lang, 'Red', 'Đỏ') : t(lang, 'Blue', 'Xanh')}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: 13 }}>
                            {t(lang, 'Half 2', 'Hiệp 2')}
                            <select className="form-input form-select" style={{ marginTop: 4, fontSize: 12, padding: '2px 6px' }}
                              value={form.half2RedTeam} onChange={(e) => setForm({ ...form, half2RedTeam: e.target.value })}>
                              <option value="A">{match.team_a?.name} = {t(lang, 'Red', 'Đỏ')}</option>
                              <option value="B">{match.team_b?.name} = {t(lang, 'Red', 'Đỏ')}</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.secondHalfA} onChange={(e) => setForm({ ...form, secondHalfA: e.target.value })} />
                            <div style={{ fontSize: 11, color: form.half2RedTeam === 'A' ? '#dc2626' : '#2563eb', marginTop: 2 }}>{form.half2RedTeam === 'A' ? t(lang, 'Red', 'Đỏ') : t(lang, 'Blue', 'Xanh')}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.secondHalfB} onChange={(e) => setForm({ ...form, secondHalfB: e.target.value })} />
                            <div style={{ fontSize: 11, color: form.half2RedTeam === 'B' ? '#dc2626' : '#2563eb', marginTop: 2 }}>{form.half2RedTeam === 'B' ? t(lang, 'Red', 'Đỏ') : t(lang, 'Blue', 'Xanh')}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: 13 }}>{t(lang, 'Referee Awarded Points', 'Điểm trọng tài thưởng')} <span style={{ color: '#94a3b8' }}>({t(lang, 'section 12 — a reason is required', 'mục 12 — cần lý do')})</span></td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.refereeAwardedA} onChange={(e) => setForm({ ...form, refereeAwardedA: e.target.value })} />
                            {(Number(form.refereeAwardedA) || 0) > 0 && (
                              <input type="text" className="form-input" style={{ marginTop: 4, fontSize: 12 }} placeholder={t(lang, 'Reason', 'Lý do')}
                                value={form.refereeAwardedReasonA} onChange={(e) => setForm({ ...form, refereeAwardedReasonA: e.target.value })} />
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="form-input" style={{ textAlign: 'center' }} value={form.refereeAwardedB} onChange={(e) => setForm({ ...form, refereeAwardedB: e.target.value })} />
                            {(Number(form.refereeAwardedB) || 0) > 0 && (
                              <input type="text" className="form-input" style={{ marginTop: 4, fontSize: 12 }} placeholder={t(lang, 'Reason', 'Lý do')}
                                value={form.refereeAwardedReasonB} onChange={(e) => setForm({ ...form, refereeAwardedReasonB: e.target.value })} />
                            )}
                          </td>
                        </tr>
                        <tr style={{ fontWeight: 700 }}>
                          <td style={{ fontSize: 13 }}>{t(lang, 'Total Score', 'Tổng điểm')}</td>
                          <td style={{ textAlign: 'center' }}>{droneScoreA.total}</td>
                          <td style={{ textAlign: 'center' }}>{droneScoreB.total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {isKnockout && droneTied && (
                    <div style={{ marginTop: 20, padding: 16, border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, background: 'rgba(239,68,68,0.06)' }}>
                      <h4 style={{ margin: '0 0 8px', color: '#f87171' }}>{t(lang, `PENALTY SHOOTOUT — scores tied ${droneScoreA.total} - ${droneScoreB.total}`, `ĐÁ LUÂN LƯU — hòa ${droneScoreA.total} - ${droneScoreB.total}`)}</h4>
                      {form.shootoutRounds.length === 0 ? (
                        <button type="button" className="ts-btn ts-btn-primary" onClick={startShootout}>{t(lang, 'Start Penalty Shootout', 'Bắt đầu đá luân lưu')}</button>
                      ) : (
                        <>
                          {form.shootoutRounds.map((r, idx) => (
                            <div key={r.roundNo} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                              <strong style={{ width: 70 }}>{t(lang, 'Round', 'Vòng')} {r.roundNo}</strong>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={!!r.aSuccess} onChange={(e) => updateShootoutRound(idx, { aSuccess: e.target.checked })} /> {match.team_a?.name} {t(lang, 'scored', 'ghi điểm')}
                              </label>
                              <input type="number" className="form-input" style={{ width: 90 }} placeholder={t(lang, 'sec', 'giây')} min="0.01" max={PENALTY_MAX_SECONDS} step="0.01"
                                disabled={!r.aSuccess} value={r.aTimeSeconds} onChange={(e) => updateShootoutRound(idx, { aTimeSeconds: e.target.value })} />
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={!!r.bSuccess} onChange={(e) => updateShootoutRound(idx, { bSuccess: e.target.checked })} /> {match.team_b?.name} {t(lang, 'scored', 'ghi điểm')}
                              </label>
                              <input type="number" className="form-input" style={{ width: 90 }} placeholder={t(lang, 'sec', 'giây')} min="0.01" max={PENALTY_MAX_SECONDS} step="0.01"
                                disabled={!r.bSuccess} value={r.bTimeSeconds} onChange={(e) => updateShootoutRound(idx, { bTimeSeconds: e.target.value })} />
                            </div>
                          ))}
                          {shootoutWinnerInfo.winner ? (
                            <p style={{ color: '#4ade80', fontWeight: 700 }}>
                              {t(lang, 'Shootout winner', 'Thắng đá luân lưu')}: {shootoutWinnerInfo.winner === 'A' ? match.team_a?.name : match.team_b?.name} ({t(lang, 'Round', 'Vòng')} {shootoutWinnerInfo.decidingRound})
                            </p>
                          ) : (
                            <button type="button" className="ts-btn ts-btn-secondary" onClick={addShootoutRound}>{t(lang, '+ Add Round', '+ Thêm vòng')}</button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="ts-task-nav">
                <button type="button" className="ts-btn ts-btn-secondary" onClick={() => navigate(listUrl)}>{t(lang, '← Close', '← Đóng')}</button>
                <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={gotoStep2}>{t(lang, 'Review & sign to save →', 'Xem lại & ký để lưu →')}</button>
              </div>
            </div>
          </main>
        </div>
      )}

      {step === 2 && (
        <div className="ts-card ts-sheet-card">
          <div className="ts-sheet-header">
            <div>
              <h2 className="ts-card-title" style={{ fontSize: 20, margin: 0 }}>{t(lang, 'CONFIRM MATCH RESULT', 'XÁC NHẬN KẾT QUẢ TRẬN ĐẤU')}</h2>
              <div className="ts-sheet-sub">
                {match.team_a?.name}{isStars ? ' (Red)' : ''} vs {match.team_b?.name}{isStars ? ' (Blue)' : ''}
                {match.boards?.name ? ` · ${t(lang, 'Board', 'Bảng')}: ${match.boards.name}` : ''}
              </div>
            </div>
            <div className="ts-sheet-total-badge">
              <span className="ts-st-label">{t(lang, 'RESULT', 'KẾT QUẢ')}</span>
              <span className="ts-st-val" style={{ fontSize: 16 }}>
                {isStars
                  ? starsResultText
                  : (isKnockout
                    ? (droneOutcome.result === 'A' ? match.team_a?.name : droneOutcome.result === 'B' ? match.team_b?.name : t(lang, 'Pending shootout', 'Chờ đá luân lưu'))
                    : (droneOutcome.result === 'DRAW' ? t(lang, 'Draw', 'Hòa') : droneOutcome.result === 'A' ? match.team_a?.name : match.team_b?.name))}
              </span>
            </div>
          </div>

          <div className="ts-sheet-form-grid">
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Student / Team Captain', 'Học sinh / Đội trưởng')} — {match.team_a?.name}{isStars ? ' (Red)' : ''} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.teamMembersA} readOnly placeholder={t(lang, 'No members recorded', 'Chưa có tên')} />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Student / Team Captain', 'Học sinh / Đội trưởng')} — {match.team_b?.name}{isStars ? ' (Blue)' : ''} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.teamMembersB} readOnly placeholder={t(lang, 'No members recorded', 'Chưa có tên')} />
            </div>
            <div className="ts-form-row">
              <SignatureBox label={isStars ? t(lang, 'Red Team Signature', 'Chữ ký đội Đỏ') : t(lang, `${match.team_a?.name} Signature`, `Chữ ký đội ${match.team_a?.name}`)} value={form.studentSigImageA} onChange={(v) => setForm({ ...form, studentSigImageA: v })} required />
            </div>
            <div className="ts-form-row">
              <SignatureBox label={isStars ? t(lang, 'Blue Team Signature', 'Chữ ký đội Xanh') : t(lang, `${match.team_b?.name} Signature`, `Chữ ký đội ${match.team_b?.name}`)} value={form.studentSigImageB} onChange={(v) => setForm({ ...form, studentSigImageB: v })} required />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Referee Name', 'Tên trọng tài')} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.refereeSignature} readOnly />
            </div>
            <div className="ts-form-row">
              <SignatureBox label={t(lang, 'Referee Signature', 'Chữ ký trọng tài')} value={form.refereeSigImage} onChange={(v) => setForm({ ...form, refereeSigImage: v })} required />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Chief Referee', 'Trưởng ban trọng tài')} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.headRefereeName} readOnly />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Scorekeeper', 'Người ghi điểm')} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input type="text" className="ts-input ts-input-locked" value={form.scorekeeperName} readOnly />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">{t(lang, 'Remarks', 'Ghi chú')}</label>
              <textarea className="ts-input" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">{t(lang, 'Objection', 'Kiến nghị')}</label>
              <textarea className="ts-input" rows={2} value={form.objection} onChange={(e) => setForm({ ...form, objection: e.target.value })} />
            </div>
          </div>

          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>{t(lang, '← Edit scores', '← Sửa điểm')}</button>
            <button type="button" className="ts-btn ts-btn-primary ts-btn-xl" onClick={handleSubmit} disabled={submitting}>
              {submitting ? t(lang, 'Saving...', 'Đang lưu...') : t(lang, '✓ CONFIRM & SAVE SCORE SHEET', '✓ XÁC NHẬN & LƯU PHIẾU ĐIỂM')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
