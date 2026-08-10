import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, taskImageUrl } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes, formatVietnamClockTime } from '../../lib/time';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

// Điểm thưởng mặc định khi nội dung thi chưa tự cấu hình bonus_config riêng
const DEFAULT_BONUS_CONFIG = { label: 'Bonus Points', base: 40, per_retry: 10 };

/**
 * Wizard chấm điểm theo từng nhiệm vụ — tối ưu hóa toàn diện cho Tablet/iPad & Touch Screen.
 *
 * Bố cục 2 cột (Split Pane) trên Tablet Ngang:
 *   - Bên trái: Bảng điều hướng nhiệm vụ, Đồng hồ bấm giờ (Stopwatch), Điểm tổng live
 *   - Bên phải: Thẻ chấm điểm chi tiết nhiệm vụ với nút bấm kích thước lớn (Touch-first)
 */
export default function TaskScoringWizard({
  team,
  content,
  tasks,
  competitionId,
  contentId,
  region,
  round = 1,
  memberNames,
  existing = [],
  startedAt = null,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert } = useNotify();

  // Phiếu đã có của đội cho đúng lượt này (mỗi lượt 1 phiếu độc lập) → chế độ sửa
  const existingScore = useMemo(
    () => existing.find(s => s.contest_content_id === contentId && s.round === round) || null,
    [existing, contentId, round]
  );
  const prevCS = existingScore?.criteria_scores || {};

  const bonusCfg = content?.bonus_config || DEFAULT_BONUS_CONFIG;

  // ── State chấm điểm ──
  const [taskState, setTaskState] = useState(() => {
    const init = {};
    for (const t of tasks) {
      const prevPts = prevCS.taskScores?.[t.id];
      const prevQty = prevCS.taskQty?.[t.id];
      const has = prevPts !== undefined && prevPts !== '';
      init[t.id] = {
        qty: prevQty !== undefined ? Number(prevQty) : 0,
        points: has ? Number(prevPts) || 0 : null, // null = chưa chấm
        tierLabel: prevCS.taskTier?.[t.id] ?? null,
      };
    }
    return init;
  });
  const [retryCount, setRetryCount] = useState(() => Number(prevCS.rerunCount) || existingScore?.retry_count || 0);
  const [step, setStep] = useState(1);
  const screenCount = tasks.length + (bonusCfg ? 1 : 0);
  const [screenIdx, setScreenIdx] = useState(0);

  // ── State xác nhận ──
  const [timeSpent, setTimeSpent] = useState(existingScore?.time || '');
  // Các ô dưới đây bị khóa (readOnly) — không cho trọng tài gõ tay để tránh
  // sai lệch / gian lận: đội trưởng lấy từ danh sách đội, trọng tài bàn lấy
  // từ tài khoản đang đăng nhập, trọng tài trưởng lấy giá trị mặc định cố định.
  const teamMembers = prevCS.teamMembers || memberNames || '';
  const refereeSignature = prevCS.refereeSignature || user?.fullName || user?.username || '';
  const [remarks, setRemarks] = useState(prevCS.remarks || existingScore?.notes || '');
  const [studentSigImage, setStudentSigImage] = useState(prevCS.studentSignatureImage || '');
  const [refereeSigImage, setRefereeSigImage] = useState(prevCS.refereeSignatureImage || '');
  // Thời gian vào sân = thời điểm thực tế (GMT+7) trọng tài bấm "Bắt đầu lượt thi" —
  // không cho nhập tay.
  const arenaEntryTime = existingScore?.arena_entry_time || formatVietnamClockTime(startedAt);
  const headRefereeName = existingScore?.head_referee_name || 'Mr Ly Quang Van';
  const [scorekeeperName, setScorekeeperName] = useState(
    existingScore?.scorekeeper_name || user?.fullName || user?.username || ''
  );
  const [objection, setObjection] = useState(existingScore?.objection || '');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── State Đồng hồ bấm giờ (Stopwatch) tích hợp trên Tablet ──
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setStopwatchSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const toggleStopwatch = () => setIsTimerRunning((r) => !r);
  const resetStopwatch = () => { setIsTimerRunning(false); setStopwatchSeconds(0); };
  const applyStopwatchToTime = () => {
    setTimeSpent(String(stopwatchSeconds));
    showAlert(`Match time recorded: ${stopwatchSeconds}s (${formatSecondsAsMinutes(stopwatchSeconds)})`, 'success');
  };

  const backUrl = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`;

  // ── Tính điểm ──
  const bonusPoints = bonusCfg
    ? Math.max(0, (Number(bonusCfg.base) || 0) - (Number(bonusCfg.per_retry) || 0) * retryCount)
    : 0;

  const taskPoints = (t) => {
    const st = taskState[t.id];
    if (!st) return 0;
    if (t.scoring_type === 'count') return (st.qty || 0) * (Number(t.max_score) || 0);
    return st.points ?? 0;
  };

  const totalScore = useMemo(
    () => tasks.reduce((sum, t) => sum + taskPoints(t), 0) + bonusPoints,
    [taskState, tasks, bonusPoints] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const scoredCount = useMemo(
    () => tasks.filter(t => t.scoring_type === 'count' ? (taskState[t.id]?.qty > 0) : taskState[t.id]?.points !== null).length,
    [taskState, tasks]
  );

  const setTask = (id, patch) => setTaskState(s => ({ ...s, [id]: { ...s[id], ...patch } }));

  const gotoNextScreen = () => {
    if (screenIdx < screenCount - 1) {
      setScreenIdx(i => i + 1);
    } else {
      // Trọng tài có thể quên tự bấm Tạm dừng — tự dừng đồng hồ khi sang
      // phiếu tổng kết để không đếm nhầm quá thời gian thi thực tế.
      setIsTimerRunning(false);
      setStep(2);
    }
  };

  const timeLimitText = content?.time_limit_seconds
    ? formatSecondsAsMinutes(content.time_limit_seconds)
    : null;

  // ── Gửi phiếu ──
  const handleSubmit = async () => {
    const timeSeconds = Number(timeSpent);
    if (!timeSpent || Number.isNaN(timeSeconds) || timeSeconds < 0) {
      showAlert('Please enter the completion time (in seconds).', 'error');
      return;
    }
    if (!studentSigImage || !refereeSigImage) {
      showAlert('Please collect both signatures before submitting the score sheet.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const taskScores = {};
      const taskQty = {};
      const taskTier = {};
      for (const t of tasks) {
        taskScores[t.id] = taskPoints(t);
        if (t.scoring_type === 'count') taskQty[t.id] = taskState[t.id]?.qty || 0;
        if (t.scoring_type === 'tier' && taskState[t.id]?.tierLabel) taskTier[t.id] = taskState[t.id].tierLabel;
      }
      const payload = {
        team_id: team.id,
        contest_content_id: contentId,
        referee_id: user?.id,
        time: String(Math.round(timeSeconds)),
        score: totalScore,
        round,
        retry_count: retryCount,
        bonus_points: bonusPoints,
        criteria_scores: {
          taskScores,
          taskQty,
          taskTier,
          bangThi: team?.boards?.name || '',
          rerunCount: String(retryCount),
          extraReward: bonusPoints,
          teamMembers,
          remarks,
          refereeSignature: refereeSignature || user?.full_name || user?.username,
          studentSignature: teamMembers,
          studentSignatureImage: studentSigImage || null,
          refereeSignatureImage: refereeSigImage || null,
        },
        notes: remarks || null,
        arena_entry_time: arenaEntryTime || null,
        head_referee_name: headRefereeName || null,
        scorekeeper_name: scorekeeperName || null,
        objection: objection || null,
        started_at: startedAt || existingScore?.started_at || null,
      };
      if (existingScore) {
        await api.putScore(existingScore.id, payload);
      } else {
        try {
          await api.postScore(payload);
        } catch (err) {
          const m = /Đội này đã có phiếu điểm/.test(err.message || '');
          if (m) throw new Error('This team already has a score sheet for this round. Please go back to the team list to edit it.');
          throw err;
        }
      }
      setSuccess(true);
      setTimeout(() => navigate(backUrl), 1800);
    } catch (err) {
      showAlert(err.message || 'Failed to submit score', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──
  if (success) {
    return (
      <div className="ts-success">
        <div className="ts-success-icon">✓</div>
        <strong>{existingScore ? 'Score sheet updated!' : 'Score sheet submitted successfully!'}</strong>
        <p>Returning to the team list...</p>
      </div>
    );
  }

  // ── Empty tasks ──
  if (tasks.length === 0) {
    return (
      <div className="ts-wrapper">
        <a href={backUrl} className="btn-ghost">← Back</a>
        <div className="ts-card" style={{ textAlign: 'center', padding: 40 }}>
          <p>This content has no tasks configured yet.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>Please contact the admin to set up the task list.</p>
        </div>
      </div>
    );
  }

  const isBonusScreen = bonusCfg && screenIdx === tasks.length;
  const currentTask = !isBonusScreen ? tasks[screenIdx] : null;
  const curImg = currentTask ? taskImageUrl(currentTask) : null;

  return (
    <div className="ts-wrapper ts-tablet-layout">
      {/* ── Sticky header ── */}
      <header className="ts-header">
        <a href={backUrl} className="ts-back" title="Back to team list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {team?.name}
            <span className="ts-board-chip">Round {round}</span>
            {team?.boards?.name && <span className="ts-board-chip">{team.boards.name}</span>}
            {existingScore && <span className="ts-edit-chip">Editing sheet</span>}
          </div>
          <div className="ts-content-name">
            {content?.name}
            {step === 1 && (isBonusScreen ? ' · Bonus' : ` · Task ${screenIdx + 1}/${tasks.length}`)}
          </div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">LIVE TOTAL SCORE</div>
          <div className="ts-score-value">{totalScore}</div>
        </div>
      </header>

      {/* ── Stepper Nav ── */}
      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">Score each task ({scoredCount}/{tasks.length})</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">Confirm & sign to submit</span>
        </div>
      </div>

      {/* ── Step 1: Chấm điểm với Layout 2 cột trên Tablet ── */}
      {step === 1 && (
        <div className="ts-split-container">
          {/* CỘT TRÁI (Tablet Sidebar): Tiến độ + Đồng hồ Bấm giờ Live + Danh sách Nhiệm vụ */}
          <aside className="ts-sidebar-pane">
            <div className="ts-card ts-sidebar-card">
              <div className="ts-sidebar-title">SCOREBOARD & TIMER</div>

              {/* Tích hợp Widget Đồng Hồ Bấm Giờ trên Tablet */}
              <div className="ts-stopwatch-widget">
                <div className="ts-stopwatch-display">
                  <span className="ts-stopwatch-digits">{formatSecondsAsMinutes(stopwatchSeconds)}</span>
                  <span className="ts-stopwatch-sec">({stopwatchSeconds}s)</span>
                </div>
                <div className="ts-stopwatch-controls">
                  <button
                    type="button"
                    className={`ts-timer-btn ${isTimerRunning ? 'pause' : 'start'}`}
                    onClick={toggleStopwatch}
                  >
                    {isTimerRunning ? '⏸ PAUSE' : '▶ START TIMER'}
                  </button>
                  <button type="button" className="ts-timer-btn reset" onClick={resetStopwatch} title="Reset to 0">
                    ↺
                  </button>
                </div>
                <button type="button" className="ts-timer-apply-btn" onClick={applyStopwatchToTime}>
                  ✓ Use this time for the sheet
                </button>
              </div>

              {/* Progress bar */}
              <div className="ts-progress-wrap">
                <div className="ts-progress-info">
                  <span>Scoring progress:</span>
                  <strong>{Math.round(((screenIdx + 1) / screenCount) * 100)}%</strong>
                </div>
                <div className="ts-progress">
                  <div className="ts-progress-bar" style={{ width: `${((screenIdx + 1) / screenCount) * 100}%` }} />
                </div>
              </div>

              {/* Danh sách nhiệm vụ dạng Nav Pill rộng trên Tablet */}
              <div className="ts-task-nav-list">
                {tasks.map((t, idx) => {
                  const st = taskState[t.id];
                  const isDone = t.scoring_type === 'count' ? (st?.qty > 0) : (st?.points !== null);
                  const isCurrent = idx === screenIdx;
                  return (
                    <button
                      type="button"
                      key={t.id}
                      className={`ts-task-nav-item ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
                      onClick={() => setScreenIdx(idx)}
                    >
                      <span className="ts-tnav-num">{idx + 1}</span>
                      <div className="ts-tnav-info">
                        <span className="ts-tnav-name">{t.name}</span>
                        <span className="ts-tnav-score">
                          {t.scoring_type === 'count' ? `${st?.qty || 0} x ${t.max_score}pts` : (st?.points !== null ? `${st?.points}pts` : 'Not scored')}
                        </span>
                      </div>
                      {isDone && <span className="ts-tnav-check">✓</span>}
                    </button>
                  );
                })}

                {bonusCfg && (
                  <button
                    type="button"
                    className={`ts-task-nav-item bonus ${isBonusScreen ? 'active' : ''}`}
                    onClick={() => setScreenIdx(tasks.length)}
                  >
                    <span className="ts-tnav-num">★</span>
                    <div className="ts-tnav-info">
                      <span className="ts-tnav-name">{bonusCfg.label || 'Bonus'}</span>
                      <span className="ts-tnav-score">+{bonusPoints}pts ({retryCount} reruns)</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* CỘT PHẢI: Màn hình Chấm chi tiết Task đang chọn */}
          <main className="ts-main-pane">
            <div className="ts-card ts-fade-in ts-focus-card">
              {currentTask && (
                <div className="ts-task-focus">
                  <div className="ts-task-top-meta">
                    <span className="ts-task-tag">Task {screenIdx + 1} / {tasks.length}</span>
                    <span className="ts-task-max-badge">Max score: {currentTask.max_score}pts</span>
                  </div>

                  <h2 className="ts-task-name">{currentTask.name}</h2>
                  {currentTask.name_en && <div className="ts-task-name-en">{currentTask.name_en}</div>}

                  {currentTask.description && (
                    <p className="ts-task-desc">{currentTask.description}</p>
                  )}

                  {curImg && (
                    <div className="ts-task-image-wrap">
                      <img src={curImg} alt={currentTask.name} className="ts-task-image" />
                    </div>
                  )}

                  {/* BINARY: Pass / Fail card cực lớn dễ chạm */}
                  {currentTask.scoring_type === 'binary' && (
                    <div className="ts-bigbtns-container">
                      <button
                        type="button"
                        className={`ts-bigbtn ts-bigbtn-fail ${taskState[currentTask.id]?.points === 0 ? 'selected' : ''}`}
                        onClick={() => { setTask(currentTask.id, { points: 0 }); gotoNextScreen(); }}
                      >
                        <span className="ts-bigbtn-icon">✗</span>
                        <span className="ts-bigbtn-text">FAIL</span>
                        <span className="ts-bigbtn-pts">0 pts</span>
                      </button>
                      <button
                        type="button"
                        className={`ts-bigbtn ts-bigbtn-pass ${taskState[currentTask.id]?.points > 0 ? 'selected' : ''}`}
                        onClick={() => { setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 }); gotoNextScreen(); }}
                      >
                        <span className="ts-bigbtn-icon">✓</span>
                        <span className="ts-bigbtn-text">PASS</span>
                        <span className="ts-bigbtn-pts">+{currentTask.max_score} pts</span>
                      </button>
                    </div>
                  )}

                  {/* COUNT: Đếm số lượng với Stepper + Chip tăng nhanh */}
                  {currentTask.scoring_type === 'count' && (
                    <div className="ts-count-box">
                      <div className="ts-count-label">Quantity completed (units)</div>
                      <div className="ts-input-stepper ts-input-stepper-xl">
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: Math.max(0, (taskState[currentTask.id]?.qty || 0) - 1) })}>−</button>
                        <input
                          type="number"
                          min="0"
                          max={currentTask.max_count || undefined}
                          value={taskState[currentTask.id]?.qty ?? 0}
                          onChange={(e) => {
                            let v = parseInt(e.target.value, 10);
                            if (isNaN(v) || v < 0) v = 0;
                            if (currentTask.max_count && v > currentTask.max_count) v = currentTask.max_count;
                            setTask(currentTask.id, { qty: v });
                          }}
                          inputMode="numeric"
                        />
                        <button type="button" onClick={() => {
                          const cur = taskState[currentTask.id]?.qty || 0;
                          const next = currentTask.max_count ? Math.min(currentTask.max_count, cur + 1) : cur + 1;
                          setTask(currentTask.id, { qty: next });
                        }}>+</button>
                      </div>

                      {/* Phím tăng nhanh kích thước lớn cho Tablet */}
                      <div className="ts-quick-chips">
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: (taskState[currentTask.id]?.qty || 0) + 1 })}>+1</button>
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: (taskState[currentTask.id]?.qty || 0) + 2 })}>+2</button>
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: (taskState[currentTask.id]?.qty || 0) + 5 })}>+5</button>
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: 0 })}>Reset to 0</button>
                        {currentTask.max_count && (
                          <button type="button" className="ts-chip-full" onClick={() => setTask(currentTask.id, { qty: currentTask.max_count })}>
                            Max ({currentTask.max_count})
                          </button>
                        )}
                      </div>

                      <div className="ts-count-calc">
                        Score: {taskState[currentTask.id]?.qty || 0} × {currentTask.max_score}pts = <strong>{taskPoints(currentTask)} pts</strong>
                      </div>
                    </div>
                  )}

                  {/* NUMERIC: Nhập điểm trực tiếp + Phím Preset % */}
                  {currentTask.scoring_type === 'numeric' && (
                    <div className="ts-count-box">
                      <div className="ts-count-label">Points scored (Max {currentTask.max_score}pts)</div>
                      <div className="ts-input-stepper ts-input-stepper-xl">
                        <button type="button" onClick={() => {
                          const v = taskState[currentTask.id]?.points ?? 0;
                          setTask(currentTask.id, { points: Math.max(0, v - 1) });
                        }}>−</button>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={taskState[currentTask.id]?.points ?? ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setTask(currentTask.id, { points: isNaN(v) ? null : Math.min(Number(currentTask.max_score) || 999, Math.max(0, v)) });
                          }}
                          placeholder="0"
                          inputMode="decimal"
                        />
                        <button type="button" onClick={() => {
                          const v = taskState[currentTask.id]?.points ?? 0;
                          setTask(currentTask.id, { points: Math.min(Number(currentTask.max_score) || 999, v + 1) });
                        }}>+</button>
                      </div>

                      {/* Phím preset điểm cho Tablet */}
                      <div className="ts-quick-chips">
                        <button type="button" onClick={() => setTask(currentTask.id, { points: 0 })}>0 pts</button>
                        <button type="button" onClick={() => setTask(currentTask.id, { points: Math.round((Number(currentTask.max_score) || 0) / 2) })}>
                          50% ({Math.round((Number(currentTask.max_score) || 0) / 2)}pts)
                        </button>
                        <button type="button" className="ts-chip-full" onClick={() => setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 })}>
                          100% Max score ({currentTask.max_score}pts)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TIER: Các mức chọn độc lập */}
                  {currentTask.scoring_type === 'tier' && (
                    <div className="ts-tier-options">
                      {(currentTask.tier_options || []).map((tier, i) => {
                        const selected = taskState[currentTask.id]?.tierLabel === tier.label
                          && taskState[currentTask.id]?.points === Number(tier.points);
                        return (
                          <button
                            type="button"
                            key={i}
                            className={`ts-tier-btn ${selected ? 'selected' : ''}`}
                            onClick={() => { setTask(currentTask.id, { points: Number(tier.points) || 0, tierLabel: tier.label }); gotoNextScreen(); }}
                          >
                            <div className="ts-tier-radio">{selected ? '✓' : ''}</div>
                            <span className="ts-tier-label">{tier.label}</span>
                            <span className="ts-tier-btn-pts">{tier.points} pts</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* MÀN ĐIỂM THƯỞNG */}
              {isBonusScreen && (
                <div className="ts-task-focus">
                  <div className="ts-task-top-meta">
                    <span className="ts-task-tag">Bonus configuration</span>
                    <span className="ts-task-max-badge">Max: {bonusCfg.base}pts</span>
                  </div>
                  <h2 className="ts-task-name">{bonusCfg.label || 'Bonus points'}</h2>
                  <p className="ts-task-desc">
                    Formula: {bonusCfg.base}pts base bonus − {bonusCfg.per_retry}pts per rerun.
                  </p>
                  <div className="ts-count-box">
                    <div className="ts-count-label">Number of reruns (Retry)</div>
                    <div className="ts-input-stepper ts-input-stepper-xl">
                      <button type="button" onClick={() => setRetryCount(c => Math.max(0, c - 1))}>−</button>
                      <input
                        type="number"
                        min="0"
                        value={retryCount}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setRetryCount(isNaN(v) || v < 0 ? 0 : v);
                        }}
                        inputMode="numeric"
                      />
                      <button type="button" onClick={() => setRetryCount(c => c + 1)}>+</button>
                    </div>
                    <div className="ts-count-calc">
                      Bonus points calculated: <strong>+{bonusPoints} pts</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Thanh điều hướng màn */}
              <div className="ts-task-nav">
                <button
                  type="button"
                  className="ts-btn ts-btn-secondary"
                  onClick={() => setScreenIdx(i => Math.max(0, i - 1))}
                  disabled={screenIdx === 0}
                >
                  ← Previous task
                </button>
                <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={gotoNextScreen}>
                  {screenIdx < screenCount - 1 ? 'Next task →' : 'Review summary & sign →'}
                </button>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ── Step 2: Màn hình Xác nhận & Ký tên Phiếu điểm Chuẩn ── */}
      {step === 2 && (
        <div className="ts-card ts-fade-in ts-sheet-card">
          <div className="ts-sheet-header">
            <div>
              <h2 className="ts-card-title" style={{ fontSize: 20, margin: 0 }}>MATCH SCORE SHEET</h2>
              <div className="ts-sheet-sub">
                Team: <strong>{team?.name}</strong> {team?.boards?.name ? `· Board: ${team.boards.name}` : ''} · Content: <strong>{content?.name}</strong> · Round: <strong>{round}</strong>
              </div>
            </div>
            <div className="ts-sheet-total-badge">
              <span className="ts-st-label">TOTAL SCORE</span>
              <span className="ts-st-val">{totalScore}</span>
            </div>
          </div>

          {/* Bảng điểm chi tiết */}
          <table className="ts-detail-table ts-sheet-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Task / Category</th>
                <th className="ts-col-qty">Qty</th>
                <th className="ts-col-pts">Score</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, idx) => (
                <tr key={t.id}>
                  <td style={{ width: 40, color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                  <td>
                    <div style={{ color: '#f9fafb', fontWeight: 600 }}>{t.name}</div>
                    {taskState[t.id]?.tierLabel && <div style={{ fontSize: 12, color: '#60a5fa' }}>Tier: {taskState[t.id].tierLabel}</div>}
                    {taskState[t.id]?.points === null && t.scoring_type !== 'count' && (
                      <span className="ts-not-scored"> (Not scored)</span>
                    )}
                  </td>
                  <td className="ts-col-qty">{t.scoring_type === 'count' ? (taskState[t.id]?.qty || 0) : '—'}</td>
                  <td className="ts-col-pts"><strong>{taskPoints(t)}pts</strong></td>
                </tr>
              ))}
              {bonusCfg && (
                <tr className="ts-row-bonus-summary">
                  <td style={{ color: '#9ca3af', fontWeight: 600 }}>★</td>
                  <td>
                    <div style={{ color: '#f59e0b', fontWeight: 600 }}>{bonusCfg.label || 'Bonus'}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>Reruns: {retryCount}</div>
                  </td>
                  <td className="ts-col-qty">—</td>
                  <td className="ts-col-pts"><strong style={{ color: '#f59e0b' }}>+{bonusPoints}pts</strong></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="ts-sheet-total">
                <td colSpan={3}>TOTAL SCORE — ROUND {round}</td>
                <td className="ts-col-pts"><strong style={{ color: '#10b981', fontSize: 20 }}>{totalScore}pts</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Form Thông tin & Ô Ký Tên Tablet 2 Cột */}
          <div className="ts-sheet-form-grid">
            <div className="ts-form-row ts-full">
              <label className="ts-label">
                Match Time (in seconds) <span className="ts-req">*</span>
                {timeLimitText && <span className="ts-hint-inline"> (Time limit: {timeLimitText})</span>}
              </label>
              <div className="ts-time-input-group">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  className="ts-input ts-input-lg"
                  value={timeSpent}
                  onChange={(e) => setTimeSpent(e.target.value)}
                  placeholder="Enter seconds (e.g. 155)"
                />
                {stopwatchSeconds > 0 && (
                  <button type="button" className="ts-btn ts-btn-secondary" onClick={applyStopwatchToTime}>
                    Use {stopwatchSeconds}s from timer
                  </button>
                )}
              </div>
              {timeSpent !== '' && !Number.isNaN(Number(timeSpent)) && (
                <div className="ts-hint">In minutes: <strong>{formatSecondsAsMinutes(timeSpent)}</strong></div>
              )}
            </div>

            <div className="ts-form-row">
              <label className="ts-label">Arena Entry Time <span className="ts-hint-inline">(auto, locked)</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={arenaEntryTime}
                readOnly
                placeholder="Recorded when the round is started"
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Team Captain / Student Representative <span className="ts-hint-inline">(locked)</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={teamMembers}
                readOnly
                placeholder="No members recorded"
              />
            </div>

            {/* Ô Ký Tên Tablet Đặt Cạnh Nhau */}
            <div className="ts-form-row">
              <SignatureBox
                label="Student / Team Captain Signature"
                value={studentSigImage}
                onChange={setStudentSigImage}
                required
              />
            </div>
            <div className="ts-form-row">
              <SignatureBox
                label="Table Referee Signature"
                value={refereeSigImage}
                onChange={setRefereeSigImage}
                required
              />
            </div>

            <div className="ts-form-row">
              <label className="ts-label">Table Referee Name <span className="ts-hint-inline">(locked)</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={refereeSignature}
                readOnly
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Chief Referee <span className="ts-hint-inline">(locked)</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={headRefereeName}
                readOnly
              />
            </div>

            <div className="ts-form-row ts-full">
              <label className="ts-label">Referee Remarks</label>
              <textarea
                className="ts-input"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Additional notes (optional)..."
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Team Feedback / Objection</label>
              <textarea
                className="ts-input"
                rows={2}
                value={objection}
                onChange={(e) => setObjection(e.target.value)}
                placeholder="Team's feedback or objection (optional)..."
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>
              ← Edit task scores
            </button>
            <button
              type="button"
              className="ts-btn ts-btn-primary ts-btn-xl"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : `✓ CONFIRM & SUBMIT SCORE SHEET (${totalScore}pts)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

