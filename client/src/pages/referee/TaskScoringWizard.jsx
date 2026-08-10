import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, taskImageUrl } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes } from '../../lib/time';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

// Điểm thưởng mặc định khi nội dung thi chưa tự cấu hình bonus_config riêng
const DEFAULT_BONUS_CONFIG = { label: 'Phần thưởng thêm / Extra reward', base: 40, per_retry: 10 };

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
  const [teamMembers, setTeamMembers] = useState(prevCS.teamMembers || memberNames || '');
  const [refereeSignature, setRefereeSignature] = useState(
    prevCS.refereeSignature || user?.fullName || user?.username || ''
  );
  const [remarks, setRemarks] = useState(prevCS.remarks || existingScore?.notes || '');
  const [studentSigImage, setStudentSigImage] = useState(prevCS.studentSignatureImage || '');
  const [refereeSigImage, setRefereeSigImage] = useState(prevCS.refereeSignatureImage || '');
  const [arenaEntryTime, setArenaEntryTime] = useState(existingScore?.arena_entry_time || '');
  const [headRefereeName, setHeadRefereeName] = useState(existingScore?.head_referee_name || 'Mr Ly Quang Van');
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
    showAlert(`Đã ghi nhận thời gian thi đấu: ${stopwatchSeconds}s (${formatSecondsAsMinutes(stopwatchSeconds)})`, 'success');
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
    if (screenIdx < screenCount - 1) setScreenIdx(i => i + 1);
    else setStep(2);
  };

  const timeLimitText = content?.time_limit_seconds
    ? formatSecondsAsMinutes(content.time_limit_seconds)
    : null;

  // ── Gửi phiếu ──
  const handleSubmit = async () => {
    const timeSeconds = Number(timeSpent);
    if (!timeSpent || Number.isNaN(timeSeconds) || timeSeconds < 0) {
      showAlert('Vui lòng nhập Thời gian hoàn thành (tính bằng giây).', 'error');
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
          if (m) throw new Error('Đội này đã có phiếu điểm lượt này. Vui lòng quay lại danh sách mở lại để sửa.');
          throw err;
        }
      }
      setSuccess(true);
      setTimeout(() => navigate(backUrl), 1800);
    } catch (err) {
      showAlert(err.message || 'Gửi điểm thất bại', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──
  if (success) {
    return (
      <div className="ts-success">
        <div className="ts-success-icon">✓</div>
        <strong>{existingScore ? 'Đã cập nhật phiếu điểm!' : 'Gửi phiếu điểm thành công!'}</strong>
        <p>Đang quay lại danh sách đội thi...</p>
      </div>
    );
  }

  // ── Empty tasks ──
  if (tasks.length === 0) {
    return (
      <div className="ts-wrapper">
        <a href={backUrl} className="btn-ghost">← Quay lại</a>
        <div className="ts-card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Nội dung thi này chưa thiết lập các nhiệm vụ.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>Vui lòng liên hệ Admin để tạo danh sách nhiệm vụ.</p>
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
        <a href={backUrl} className="ts-back" title="Quay lại danh sách">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {team?.name}
            <span className="ts-board-chip">Lượt {round}</span>
            {team?.boards?.name && <span className="ts-board-chip">{team.boards.name}</span>}
            {existingScore && <span className="ts-edit-chip">Đang sửa phiếu</span>}
          </div>
          <div className="ts-content-name">
            {content?.name}
            {step === 1 && (isBonusScreen ? ' · Phần thưởng thêm' : ` · Nhiệm vụ ${screenIdx + 1}/${tasks.length}`)}
          </div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">TỔNG ĐIỂM LIVE</div>
          <div className="ts-score-value">{totalScore}</div>
        </div>
      </header>

      {/* ── Stepper Nav ── */}
      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">Chấm từng nhiệm vụ ({scoredCount}/{tasks.length})</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">Xác nhận & Ký tên gửi phiếu</span>
        </div>
      </div>

      {/* ── Step 1: Chấm điểm với Layout 2 cột trên Tablet ── */}
      {step === 1 && (
        <div className="ts-split-container">
          {/* CỘT TRÁI (Tablet Sidebar): Tiến độ + Đồng hồ Bấm giờ Live + Danh sách Nhiệm vụ */}
          <aside className="ts-sidebar-pane">
            <div className="ts-card ts-sidebar-card">
              <div className="ts-sidebar-title">BẢNG CHẤM & ĐỒNG HỒ</div>

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
                    {isTimerRunning ? '⏸ TẠM DỪNG' : '▶ BẤM GIỜ'}
                  </button>
                  <button type="button" className="ts-timer-btn reset" onClick={resetStopwatch} title="Đặt lại về 0">
                    ↺
                  </button>
                </div>
                <button type="button" className="ts-timer-apply-btn" onClick={applyStopwatchToTime}>
                  ✓ Dùng thời gian này cho phiếu
                </button>
              </div>

              {/* Progress bar */}
              <div className="ts-progress-wrap">
                <div className="ts-progress-info">
                  <span>Tiến độ chấm:</span>
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
                          {t.scoring_type === 'count' ? `${st?.qty || 0} x ${t.max_score}đ` : (st?.points !== null ? `${st?.points}đ` : 'Chưa chấm')}
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
                      <span className="ts-tnav-name">{bonusCfg.label || 'Thưởng thêm'}</span>
                      <span className="ts-tnav-score">+{bonusPoints}đ ({retryCount} lượt chạy lại)</span>
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
                    <span className="ts-task-tag">Nhiệm vụ {screenIdx + 1} / {tasks.length}</span>
                    <span className="ts-task-max-badge">Điểm tối đa: {currentTask.max_score}đ</span>
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
                        <span className="ts-bigbtn-text">KHÔNG ĐẠT</span>
                        <span className="ts-bigbtn-pts">0 Điểm</span>
                      </button>
                      <button
                        type="button"
                        className={`ts-bigbtn ts-bigbtn-pass ${taskState[currentTask.id]?.points > 0 ? 'selected' : ''}`}
                        onClick={() => { setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 }); gotoNextScreen(); }}
                      >
                        <span className="ts-bigbtn-icon">✓</span>
                        <span className="ts-bigbtn-text">ĐẠT</span>
                        <span className="ts-bigbtn-pts">+{currentTask.max_score} Điểm</span>
                      </button>
                    </div>
                  )}

                  {/* COUNT: Đếm số lượng với Stepper + Chip tăng nhanh */}
                  {currentTask.scoring_type === 'count' && (
                    <div className="ts-count-box">
                      <div className="ts-count-label">Số lượng hoàn thành (đơn vị)</div>
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
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: 0 })}>Đặt về 0</button>
                        {currentTask.max_count && (
                          <button type="button" className="ts-chip-full" onClick={() => setTask(currentTask.id, { qty: currentTask.max_count })}>
                            Tối đa ({currentTask.max_count})
                          </button>
                        )}
                      </div>

                      <div className="ts-count-calc">
                        Tính điểm: {taskState[currentTask.id]?.qty || 0} × {currentTask.max_score}đ = <strong>{taskPoints(currentTask)} Điểm</strong>
                      </div>
                    </div>
                  )}

                  {/* NUMERIC: Nhập điểm trực tiếp + Phím Preset % */}
                  {currentTask.scoring_type === 'numeric' && (
                    <div className="ts-count-box">
                      <div className="ts-count-label">Số điểm đạt được (Tối đa {currentTask.max_score}đ)</div>
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
                        <button type="button" onClick={() => setTask(currentTask.id, { points: 0 })}>0 Điểm</button>
                        <button type="button" onClick={() => setTask(currentTask.id, { points: Math.round((Number(currentTask.max_score) || 0) / 2) })}>
                          50% ({Math.round((Number(currentTask.max_score) || 0) / 2)}đ)
                        </button>
                        <button type="button" className="ts-chip-full" onClick={() => setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 })}>
                          100% Điểm tối đa ({currentTask.max_score}đ)
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
                            <span className="ts-tier-btn-pts">{tier.points} Điểm</span>
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
                    <span className="ts-task-tag">Cấu hình thưởng thêm</span>
                    <span className="ts-task-max-badge">Tối đa: {bonusCfg.base}đ</span>
                  </div>
                  <h2 className="ts-task-name">{bonusCfg.label || 'Điểm thưởng thêm'}</h2>
                  <p className="ts-task-desc">
                    Công thức: {bonusCfg.base}đ điểm thưởng gốc − {bonusCfg.per_retry}đ cho mỗi lần chạy lại (rerun).
                  </p>
                  <div className="ts-count-box">
                    <div className="ts-count-label">Số lần chạy lại (Rerun / Retry)</div>
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
                      Điểm thưởng tính được: <strong>+{bonusPoints} Điểm</strong>
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
                  ← Nhiệm vụ trước
                </button>
                <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={gotoNextScreen}>
                  {screenIdx < screenCount - 1 ? 'Nhiệm vụ tiếp theo →' : 'Xem phiếu tổng kết & Ký tên →'}
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
              <h2 className="ts-card-title" style={{ fontSize: 20, margin: 0 }}>PHIẾU CHẤM ĐIỂM THI ĐẤU</h2>
              <div className="ts-sheet-sub">
                Đội: <strong>{team?.name}</strong> {team?.boards?.name ? `· Bảng: ${team.boards.name}` : ''} · Nội dung: <strong>{content?.name}</strong> · Lượt thi: <strong>{round}</strong>
              </div>
            </div>
            <div className="ts-sheet-total-badge">
              <span className="ts-st-label">TỔNG ĐIỂM</span>
              <span className="ts-st-val">{totalScore}</span>
            </div>
          </div>

          {/* Bảng điểm chi tiết */}
          <table className="ts-detail-table ts-sheet-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên Nhiệm vụ / Hạng mục</th>
                <th className="ts-col-qty">Số lượng</th>
                <th className="ts-col-pts">Điểm đạt</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, idx) => (
                <tr key={t.id}>
                  <td style={{ width: 40, color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                  <td>
                    <div style={{ color: '#f9fafb', fontWeight: 600 }}>{t.name}</div>
                    {taskState[t.id]?.tierLabel && <div style={{ fontSize: 12, color: '#60a5fa' }}>Mức: {taskState[t.id].tierLabel}</div>}
                    {taskState[t.id]?.points === null && t.scoring_type !== 'count' && (
                      <span className="ts-not-scored"> (Chưa nhập điểm)</span>
                    )}
                  </td>
                  <td className="ts-col-qty">{t.scoring_type === 'count' ? (taskState[t.id]?.qty || 0) : '—'}</td>
                  <td className="ts-col-pts"><strong>{taskPoints(t)}đ</strong></td>
                </tr>
              ))}
              {bonusCfg && (
                <tr className="ts-row-bonus-summary">
                  <td style={{ color: '#9ca3af', fontWeight: 600 }}>★</td>
                  <td>
                    <div style={{ color: '#f59e0b', fontWeight: 600 }}>{bonusCfg.label || 'Phần thưởng thêm'}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>Số lần chạy lại: {retryCount} lần</div>
                  </td>
                  <td className="ts-col-qty">—</td>
                  <td className="ts-col-pts"><strong style={{ color: '#f59e0b' }}>+{bonusPoints}đ</strong></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="ts-sheet-total">
                <td colSpan={3}>TỔNG ĐIỂM LƯỢT THI {round}</td>
                <td className="ts-col-pts"><strong style={{ color: '#10b981', fontSize: 20 }}>{totalScore}đ</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Form Thông tin & Ô Ký Tên Tablet 2 Cột */}
          <div className="ts-sheet-form-grid">
            <div className="ts-form-row ts-full">
              <label className="ts-label">
                Thời gian thi đấu (tính bằng Giây) <span className="ts-req">*</span>
                {timeLimitText && <span className="ts-hint-inline"> (Giới hạn tối đa: {timeLimitText})</span>}
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
                  placeholder="Nhập số giây (ví dụ: 155)"
                />
                {stopwatchSeconds > 0 && (
                  <button type="button" className="ts-btn ts-btn-secondary" onClick={applyStopwatchToTime}>
                    Dùng {stopwatchSeconds}s từ đồng hồ
                  </button>
                )}
              </div>
              {timeSpent !== '' && !Number.isNaN(Number(timeSpent)) && (
                <div className="ts-hint">Đổi ra phút: <strong>{formatSecondsAsMinutes(timeSpent)}</strong></div>
              )}
            </div>

            <div className="ts-form-row">
              <label className="ts-label">Thời gian vào sân (nếu có)</label>
              <input
                type="text"
                className="ts-input"
                value={arenaEntryTime}
                onChange={(e) => setArenaEntryTime(e.target.value)}
                placeholder="Ví dụ: 08:30"
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Đội trưởng / Đại diện học sinh ký xác nhận</label>
              <input
                type="text"
                className="ts-input"
                value={teamMembers}
                onChange={(e) => setTeamMembers(e.target.value)}
                placeholder="Họ tên người xác nhận"
              />
            </div>

            {/* Ô Ký Tên Tablet Đặt Cạnh Nhau */}
            <div className="ts-form-row">
              <SignatureBox
                label="Chữ ký Học sinh / Đội trưởng"
                value={studentSigImage}
                onChange={setStudentSigImage}
                required
              />
            </div>
            <div className="ts-form-row">
              <SignatureBox
                label="Chữ ký Trọng tài bàn"
                value={refereeSigImage}
                onChange={setRefereeSigImage}
                required
              />
            </div>

            <div className="ts-form-row">
              <label className="ts-label">Họ tên Trọng tài bàn</label>
              <input
                type="text"
                className="ts-input"
                value={refereeSignature}
                onChange={(e) => setRefereeSignature(e.target.value)}
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Trọng tài trưởng (Chief Referee)</label>
              <input
                type="text"
                className="ts-input"
                value={headRefereeName}
                onChange={(e) => setHeadRefereeName(e.target.value)}
              />
            </div>

            <div className="ts-form-row ts-full">
              <label className="ts-label">Ghi chú của trọng tài (Remarks)</label>
              <textarea
                className="ts-input"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Nhập ghi chú thêm nếu có..."
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Ý kiến / Kiến nghị của Đội thi (Recommendation / Objection)</label>
              <textarea
                className="ts-input"
                rows={2}
                value={objection}
                onChange={(e) => setObjection(e.target.value)}
                placeholder="Ý kiến hoặc kiến nghị của đội thi (nếu có)..."
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>
              ← Sửa lại điểm nhiệm vụ
            </button>
            <button
              type="button"
              className="ts-btn ts-btn-primary ts-btn-xl"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Đang gửi...' : `✓ XÁC NHẬN & GỬI PHIẾU ĐIỂM (${totalScore}đ)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

