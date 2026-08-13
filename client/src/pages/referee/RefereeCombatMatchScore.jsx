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
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const emptyPenalty = () => [{ score: '', time: '' }, { score: '', time: '' }, { score: '', time: '' }];
const clampEnergy = (v) => Math.min(ENERGY_BLOCK_MAX, Math.max(0, parseInt(v, 10) || 0));
const clampFirepower = (v) => Math.min(FIREPOWER_BALL_MAX, Math.max(0, parseInt(v, 10) || 0));

// Trang chấm 1 trận đối kháng — thay cho accordion cũ: bấm vào 1 trận ở danh
// sách sẽ mở HẲN trang này (giống luồng "thuần" TaskScoringWizard): có màn
// Bắt đầu trận, đồng hồ bấm giờ sống trong lúc chấm, và sau khi lưu thì hiện
// luôn phiếu điểm (Score Sheet) từng đội để xem/in PDF — không phải dropdown.
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

  useEffect(() => {
    setLoading(true);
    setEntered(false);
    setStep(1);
    setSuccess(false);
    api.getCombatMatches(contentId).then((list) => {
      const m = list.find((x) => x.id === matchId);
      if (!m) { setNotFound(true); return; }
      setMatch(m);
      const d = m.details || {};
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
          teamMembersA: d.teamMembersA || '', teamMembersB: d.teamMembersB || '',
          studentSigImageA: d.studentSignatureImageA || '', studentSigImageB: d.studentSignatureImageB || '',
          refereeSignature: d.refereeSignature || user?.fullName || user?.username || '',
          refereeSigImage: d.refereeSignatureImage || '',
          headRefereeName: d.headRefereeName || 'Mr Ly Quang Van',
          scorekeeperName: d.scorekeeperName || user?.fullName || user?.username || '',
          remarks: d.remarks || '', objection: d.objection || '',
        });
      } else {
        setForm({
          division: d.division || '',
          firstHalfA: d.firstHalfA ?? 0, firstHalfB: d.firstHalfB ?? 0,
          secondHalfA: d.secondHalfA ?? 0, secondHalfB: d.secondHalfB ?? 0,
          penaltyShootout: !!d.penaltyShootout,
          penaltyA: d.penaltyA?.length ? d.penaltyA : emptyPenalty(),
          penaltyB: d.penaltyB?.length ? d.penaltyB : emptyPenalty(),
          winner_id: m.winner_id || '', is_draw: !!m.is_draw,
          teamMembersA: d.teamMembersA || '', teamMembersB: d.teamMembersB || '',
          studentSigImageA: d.studentSignatureImageA || '', studentSigImageB: d.studentSignatureImageB || '',
          refereeSignature: d.refereeSignature || user?.fullName || user?.username || '',
          refereeSigImage: d.refereeSignatureImage || '',
          headRefereeName: d.headRefereeName || 'Mr Ly Quang Van',
          scorekeeperName: d.scorekeeperName || user?.fullName || user?.username || '',
          remarks: d.remarks || '', objection: d.objection || '',
        });
      }
      // Trận đã có kết quả rồi (đang sửa lại) — vào thẳng màn chấm, không bắt bấm Bắt đầu lại.
      if (m.winner_id || m.is_draw) setEntered(true);
    }).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [contentId, matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Đồng hồ bấm giờ ──
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
    showAlert(`Đã ghi thời gian trận: ${stopwatchSeconds}s (${formatSecondsAsMinutes(stopwatchSeconds)}) cho cả 2 đội`, 'success');
  };

  const startMatch = () => {
    setStartedAt(new Date().toISOString());
    setIsTimerRunning(true);
    setEntered(true);
  };

  // ── Battle of Stars: điểm & kết quả trực tiếp (live) ──
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
    form.directWinA ? `${match?.team_a?.name} thắng — Direct Win (Final Fortress)`
      : form.directWinB ? `${match?.team_b?.name} thắng — Direct Win (Final Fortress)`
      : starsOutcome.result === 'DRAW' ? `Hòa (${scoreA.taskScore} - ${scoreB.taskScore})`
      : starsOutcome.result === 'A' ? `${match?.team_a?.name} thắng (${scoreA.taskScore} - ${scoreB.taskScore})`
      : `${match?.team_b?.name} thắng (${scoreA.taskScore} - ${scoreB.taskScore})`
  ) : '';

  // ── Fly Smart Cup: tổng điểm hiệp 1+2 (live) ──
  const droneTotalA = !isStars ? (Number(form.firstHalfA) || 0) + (Number(form.secondHalfA) || 0) : 0;
  const droneTotalB = !isStars ? (Number(form.firstHalfB) || 0) + (Number(form.secondHalfB) || 0) : 0;

  const gotoStep2 = () => { setIsTimerRunning(false); setStep(2); };

  const handleSubmit = async () => {
    if (!form.studentSigImageA || !form.studentSigImageB || !form.refereeSigImage) {
      showAlert('Vui lòng lấy đủ chữ ký 2 đội và trọng tài trước khi lưu.', 'error');
      return;
    }
    if (isStars && form.directWinA && form.directWinB) {
      showAlert('Không thể cả hai đội cùng Direct Win.', 'error');
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
          firstHalfA: Number(form.firstHalfA) || 0, firstHalfB: Number(form.firstHalfB) || 0,
          secondHalfA: Number(form.secondHalfA) || 0, secondHalfB: Number(form.secondHalfB) || 0,
          penaltyShootout: !!form.penaltyShootout,
          penaltyA: form.penaltyShootout ? form.penaltyA : [],
          penaltyB: form.penaltyShootout ? form.penaltyB : [],
          teamMembersA: form.teamMembersA || null, teamMembersB: form.teamMembersB || null,
          studentSignatureImageA: form.studentSigImageA || null, studentSignatureImageB: form.studentSigImageB || null,
          refereeSignature: form.refereeSignature || null,
          refereeSignatureImage: form.refereeSigImage || null,
          headRefereeName: form.headRefereeName || null,
          scorekeeperName: form.scorekeeperName || null,
          remarks: form.remarks || null, objection: form.objection || null,
        };
        body = {
          details,
          winner_id: form.is_draw ? null : (form.winner_id || null),
          is_draw: !!form.is_draw,
        };
      }
      await api.putCombatMatch(match.id, body);
      // Response PUT không kèm team_a/team_b/boards lồng nhau (chỉ GET danh
      // sách mới join) — ghép thẳng vào match đã có sẵn để hiện phiếu điểm.
      setSavedMatch({ ...match, details: body.details, winner_id: body.winner_id, is_draw: body.is_draw });
      setSuccess(true);
    } catch (e) {
      showAlert(e.message || 'Lưu thất bại.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const teamName = (savedMatch?.team_a?.name || 'tran').replace(/\s+/g, '-').toLowerCase();
      await exportToPdf(sheetRef, `${format}-${teamName}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="ts-wrapper ts-center-screen">
      <p style={{ color: '#94a3b8' }}>Đang tải...</p>
    </div>
  );

  if (notFound) return (
    <div className="ts-wrapper ts-center-screen">
      <div className="ts-card ts-gate-card">
        <p style={{ color: '#f87171' }}>Không tìm thấy trận đấu.</p>
        <Link to={listUrl} className="ts-btn ts-btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>← Quay lại</Link>
      </div>
    </div>
  );

  // ── Màn thành công: phiếu điểm từng đội, có thể xem/in ngay ──
  if (success) {
    return (
      <div className="ts-wrapper ts-tablet-layout">
        <div className="ts-success" style={{ margin: '24px auto' }}>
          <div className="ts-success-icon">✓</div>
          <strong>Đã lưu phiếu điểm trận đấu!</strong>
        </div>
        <div className="ts-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            <button type="button" className="ts-btn ts-btn-primary" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? 'Đang xuất...' : 'Tải PDF'}
            </button>
            <Link to={listUrl} className="ts-btn ts-btn-secondary">← Quay lại danh sách trận</Link>
          </div>
          {isStars
            ? <CombatStarsSheetTable match={savedMatch} sheetRef={sheetRef} />
            : <CombatDroneSheetTable match={savedMatch} sheetRef={sheetRef} />}
        </div>
      </div>
    );
  }

  // ── Màn Bắt đầu trận ──
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
              BẮT ĐẦU TRẬN
            </button>
            <p className="ts-gate-hint">⏱ Đồng hồ bấm giờ sẽ tự chạy khi bấm bắt đầu — dùng để ghi thời gian trận vào phiếu.</p>
          </div>

          <div className="ts-gate-footer">
            <Link to={listUrl} className="ts-btn ts-btn-ghost">← Quay lại danh sách trận</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-wrapper ts-tablet-layout">
      <header className="ts-header">
        <Link to={listUrl} className="ts-back" title="Quay lại danh sách trận">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {match.team_a?.name || '—'} <span style={{ color: '#64748b', fontWeight: 400 }}>vs</span> {match.team_b?.name || '—'}
            {match.stage && <span className="ts-board-chip">{match.stage}</span>}
            {match.group_label && <span className="ts-board-chip">{match.group_label}</span>}
          </div>
          <div className="ts-content-name">{isStars ? 'Battle of Stars' : 'Fly Smart Cup'} — Đối kháng</div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">TỶ SỐ TRỰC TIẾP</div>
          <div className="ts-score-value" style={{ fontSize: 20 }}>
            {isStars ? `${scoreA.taskScore} - ${scoreB.taskScore}` : `${droneTotalA} - ${droneTotalB}`}
          </div>
        </div>
      </header>

      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">Chấm điểm 2 đội</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">Xác nhận & ký để lưu</span>
        </div>
      </div>

      {step === 1 && (
        <div className="ts-split-container">
          <aside className="ts-sidebar-pane">
            <div className="ts-card ts-sidebar-card">
              <div className="ts-sidebar-title">ĐỒNG HỒ BẤM GIỜ</div>
              <div className="ts-stopwatch-widget">
                <div className="ts-stopwatch-display">
                  <span className="ts-stopwatch-digits">{formatSecondsAsMinutes(stopwatchSeconds)}</span>
                  <span className="ts-stopwatch-sec">({stopwatchSeconds}s)</span>
                </div>
                <div className="ts-stopwatch-controls">
                  <button type="button" className={`ts-timer-btn ${isTimerRunning ? 'pause' : 'start'}`} onClick={toggleStopwatch}>
                    {isTimerRunning ? '⏸ TẠM DỪNG' : '▶ BẮT ĐẦU'}
                  </button>
                  <button type="button" className="ts-timer-btn reset" onClick={resetStopwatch} title="Reset về 0">↺</button>
                </div>
                {isStars && (
                  <button type="button" className="ts-timer-apply-btn" onClick={applyStopwatchToTime}>
                    ✓ Dùng thời gian này cho cả 2 đội
                  </button>
                )}
              </div>

              {isStars ? (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#4ade80' }}>
                  {starsResultText}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#4ade80' }}>
                  {form.is_draw ? `Hòa (${droneTotalA} - ${droneTotalB})`
                    : form.winner_id ? `${form.winner_id === match.team_a_id ? match.team_a?.name : match.team_b?.name} thắng (${droneTotalA} - ${droneTotalB})`
                    : `Chưa chọn đội thắng (${droneTotalA} - ${droneTotalB})`}
                </div>
              )}
            </div>
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
                        <td style={{ fontSize: 13 }}>Meteor Tower <span style={{ color: '#94a3b8' }}>({METEOR_TOWER_SCORE} nếu hoàn thành)</span></td>
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
                        <td style={{ fontSize: 13 }}>Energy Defense <span style={{ color: '#94a3b8' }}>({ENERGY_BLOCK_SCORE}đ/block, tối đa {ENERGY_BLOCK_MAX})</span></td>
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
                        <td style={{ fontSize: 13 }}>Full Firepower <span style={{ color: '#94a3b8' }}>({FIREPOWER_BALL_SCORE}đ/ball, tối đa {FIREPOWER_BALL_MAX})</span></td>
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
                        <td style={{ fontSize: 13 }}>Final Fortress <span style={{ color: '#94a3b8' }}>(không tính điểm — chỉ Direct Win)</span></td>
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
                        <td style={{ fontSize: 13 }}>Extra Reward <span style={{ color: '#94a3b8' }}>(auto — 40/30/20/10/0 theo retry)</span></td>
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
                        <td style={{ fontSize: 13 }}>Tổng thời gian (giây)</td>
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
                          <td style={{ fontSize: 13 }}>Hiệp 1</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" className="form-input" style={{ textAlign: 'center' }} value={form.firstHalfA} onChange={(e) => setForm({ ...form, firstHalfA: e.target.value })} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" className="form-input" style={{ textAlign: 'center' }} value={form.firstHalfB} onChange={(e) => setForm({ ...form, firstHalfB: e.target.value })} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: 13 }}>Hiệp 2</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" className="form-input" style={{ textAlign: 'center' }} value={form.secondHalfA} onChange={(e) => setForm({ ...form, secondHalfA: e.target.value })} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" className="form-input" style={{ textAlign: 'center' }} value={form.secondHalfB} onChange={(e) => setForm({ ...form, secondHalfB: e.target.value })} />
                          </td>
                        </tr>
                        <tr style={{ fontWeight: 700 }}>
                          <td style={{ fontSize: 13 }}>Tổng điểm</td>
                          <td style={{ textAlign: 'center' }}>{droneTotalA}</td>
                          <td style={{ textAlign: 'center' }}>{droneTotalB}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                    <input type="checkbox" checked={form.penaltyShootout} onChange={(e) => setForm({ ...form, penaltyShootout: e.target.checked })} style={{ width: 'auto' }} />
                    Đá luân lưu (Penalty Shootout)
                  </label>

                  {form.penaltyShootout && (
                    <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginTop: 8 }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <input type="number" className="form-input" placeholder={`Red — lượt ${i + 1} điểm`} value={form.penaltyA[i]?.score ?? ''}
                            onChange={(e) => setForm((f) => { const a = [...f.penaltyA]; a[i] = { ...a[i], score: e.target.value }; return { ...f, penaltyA: a }; })} />
                          <input type="text" className="form-input" placeholder="Thời gian" value={form.penaltyA[i]?.time ?? ''}
                            onChange={(e) => setForm((f) => { const a = [...f.penaltyA]; a[i] = { ...a[i], time: e.target.value }; return { ...f, penaltyA: a }; })} />
                          <input type="number" className="form-input" placeholder={`Blue — lượt ${i + 1} điểm`} value={form.penaltyB[i]?.score ?? ''}
                            onChange={(e) => setForm((f) => { const b = [...f.penaltyB]; b[i] = { ...b[i], score: e.target.value }; return { ...f, penaltyB: b }; })} />
                          <input type="text" className="form-input" placeholder="Thời gian" value={form.penaltyB[i]?.time ?? ''}
                            onChange={(e) => setForm((f) => { const b = [...f.penaltyB]; b[i] = { ...b[i], time: e.target.value }; return { ...f, penaltyB: b }; })} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="ts-bigbtns-container" style={{ gridTemplateColumns: '1fr 1fr auto', marginTop: 16 }}>
                    <button type="button" className={`ts-bigbtn ts-bigbtn-pass ${form.winner_id === match.team_a_id && !form.is_draw ? 'selected' : ''}`}
                      onClick={() => setForm({ ...form, winner_id: match.team_a_id, is_draw: false })}>
                      {match.team_a?.name} thắng
                    </button>
                    <button type="button" className={`ts-bigbtn ts-bigbtn-pass ${form.winner_id === match.team_b_id && !form.is_draw ? 'selected' : ''}`}
                      onClick={() => setForm({ ...form, winner_id: match.team_b_id, is_draw: false })}>
                      {match.team_b?.name} thắng
                    </button>
                    <button type="button" className={`ts-bigbtn ts-bigbtn-fail ${form.is_draw ? 'selected' : ''}`}
                      onClick={() => setForm({ ...form, is_draw: true, winner_id: '' })}>
                      Hòa
                    </button>
                  </div>
                </>
              )}

              <div className="ts-task-nav">
                <button type="button" className="ts-btn ts-btn-secondary" onClick={() => navigate(listUrl)}>← Đóng</button>
                <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={gotoStep2}>Xem lại & ký để lưu →</button>
              </div>
            </div>
          </main>
        </div>
      )}

      {step === 2 && (
        <div className="ts-card ts-sheet-card">
          <div className="ts-sheet-header">
            <div>
              <h2 className="ts-card-title" style={{ fontSize: 20, margin: 0 }}>XÁC NHẬN KẾT QUẢ TRẬN</h2>
              <div className="ts-sheet-sub">
                {match.team_a?.name} (Red) vs {match.team_b?.name} (Blue)
                {match.boards?.name ? ` · Bảng: ${match.boards.name}` : ''}
              </div>
            </div>
            <div className="ts-sheet-total-badge">
              <span className="ts-st-label">KẾT QUẢ</span>
              <span className="ts-st-val" style={{ fontSize: 16 }}>
                {isStars ? starsResultText : (form.is_draw ? 'Hòa' : form.winner_id ? (form.winner_id === match.team_a_id ? match.team_a?.name : match.team_b?.name) : '—')}
              </span>
            </div>
          </div>

          <div className="ts-sheet-form-grid">
            <div className="ts-form-row">
              <label className="ts-label">Học sinh/đội trưởng — Red ({match.team_a?.name})</label>
              <input type="text" className="ts-input" value={form.teamMembersA} onChange={(e) => setForm({ ...form, teamMembersA: e.target.value })} />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Học sinh/đội trưởng — Blue ({match.team_b?.name})</label>
              <input type="text" className="ts-input" value={form.teamMembersB} onChange={(e) => setForm({ ...form, teamMembersB: e.target.value })} />
            </div>
            <div className="ts-form-row">
              <SignatureBox label="Chữ ký đội Red" value={form.studentSigImageA} onChange={(v) => setForm({ ...form, studentSigImageA: v })} required />
            </div>
            <div className="ts-form-row">
              <SignatureBox label="Chữ ký đội Blue" value={form.studentSigImageB} onChange={(v) => setForm({ ...form, studentSigImageB: v })} required />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Tên trọng tài</label>
              <input type="text" className="ts-input" value={form.refereeSignature} onChange={(e) => setForm({ ...form, refereeSignature: e.target.value })} />
            </div>
            <div className="ts-form-row">
              <SignatureBox label="Chữ ký trọng tài" value={form.refereeSigImage} onChange={(v) => setForm({ ...form, refereeSigImage: v })} required />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Trưởng ban trọng tài</label>
              <input type="text" className="ts-input" value={form.headRefereeName} onChange={(e) => setForm({ ...form, headRefereeName: e.target.value })} />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Người ghi điểm</label>
              <input type="text" className="ts-input" value={form.scorekeeperName} onChange={(e) => setForm({ ...form, scorekeeperName: e.target.value })} />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Ghi chú</label>
              <textarea className="ts-input" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Kiến nghị</label>
              <textarea className="ts-input" rows={2} value={form.objection} onChange={(e) => setForm({ ...form, objection: e.target.value })} />
            </div>
          </div>

          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>← Sửa lại điểm</button>
            <button type="button" className="ts-btn ts-btn-primary ts-btn-xl" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Đang lưu...' : '✓ XÁC NHẬN & LƯU PHIẾU ĐIỂM'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
