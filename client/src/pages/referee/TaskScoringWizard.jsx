import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, taskImageUrl } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { useLang, t } from '../../lib/i18n';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes, formatVietnamClockTime } from '../../lib/time';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

/**
 * Wizard chấm điểm theo từng nhiệm vụ — tối ưu hóa toàn diện cho Tablet/iPad & Touch Screen.
 *
 * Bố cục 2 cột (Split Pane) trên Tablet Ngang:
 *   - Bên trái: Bảng điều hướng nhiệm vụ, Đồng hồ bấm giờ (Stopwatch), Điểm tổng live
 *   - Bên phải: Thẻ chấm điểm chi tiết nhiệm vụ với nút bấm kích thước lớn (Touch-first)
 *
 * UI text renders in English or Vietnamese based on the logged-in referee's
 * user.language (client/src/lib/i18n.js) — EN is the original/default text,
 * unchanged from before this feature existed. Task names (`tasks.name` /
 * `tasks.name_en`, set by admin) follow the same rule: EN mode keeps its
 * original behavior (name + small name_en subtitle if set); VI mode shows
 * just `name` (treated as the task's Vietnamese name).
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
  const lang = useLang();
  const { showAlert } = useNotify();

  // Phiếu đã có của đội cho đúng lượt này (mỗi lượt 1 phiếu độc lập) → chế độ sửa
  const existingScore = useMemo(
    () => existing.find(s => s.contest_content_id === contentId && s.round === round) || null,
    [existing, contentId, round]
  );
  const prevCS = existingScore?.criteria_scores || {};

  // Điểm thưởng mặc định khi nội dung thi chưa tự cấu hình bonus_config riêng
  const bonusCfg = content?.bonus_config
    ? { base: 40, per_retry: 10, ...content.bonus_config, label: content.bonus_config.label || t(lang, 'Bonus Points', 'Điểm thưởng') }
    : { label: t(lang, 'Bonus Points', 'Điểm thưởng'), base: 40, per_retry: 10 };

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

  const toggleStopwatch = () => setIsTimerRunning((r) => !r);
  const resetStopwatch = () => { setIsTimerRunning(false); setStopwatchSeconds(0); };
  const applyStopwatchToTime = () => {
    setTimeSpent(String(stopwatchSeconds));
    showAlert(t(lang, `Match time recorded: ${stopwatchSeconds}s (${formatSecondsAsMinutes(stopwatchSeconds)})`, `Đã ghi thời gian trận đấu: ${stopwatchSeconds}s (${formatSecondsAsMinutes(stopwatchSeconds)})`), 'success');
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
      showAlert(t(lang, 'Please enter the completion time (in seconds).', 'Vui lòng nhập thời gian hoàn thành (tính bằng giây).'), 'error');
      return;
    }
    if (!studentSigImage || !refereeSigImage) {
      showAlert(t(lang, 'Please collect both signatures before submitting the score sheet.', 'Vui lòng lấy đủ 2 chữ ký trước khi nộp phiếu điểm.'), 'error');
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
          if (m) throw new Error(t(lang, 'This team already has a score sheet for this round. Please go back to the team list to edit it.', 'Đội này đã có phiếu điểm cho lượt này. Vui lòng quay lại danh sách đội để sửa.'));
          throw err;
        }
      }
      setSuccess(true);
      setTimeout(() => navigate(backUrl), 1800);
    } catch (err) {
      showAlert(err.message || t(lang, 'Failed to submit score', 'Nộp phiếu điểm thất bại'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──
  if (success) {
    return (
      <div className="ts-success">
        <div className="ts-success-icon">✓</div>
        <strong>{existingScore ? t(lang, 'Score sheet updated!', 'Đã cập nhật phiếu điểm!') : t(lang, 'Score sheet submitted successfully!', 'Đã nộp phiếu điểm thành công!')}</strong>
        <p>{t(lang, 'Returning to the team list...', 'Đang quay lại danh sách đội...')}</p>
      </div>
    );
  }

  // ── Empty tasks ──
  if (tasks.length === 0) {
    return (
      <div className="ts-wrapper">
        <Link to={backUrl} className="btn-ghost">{t(lang, '← Back', '← Quay lại')}</Link>
        <div className="ts-card" style={{ textAlign: 'center', padding: 40 }}>
          <p>{t(lang, 'This content has no tasks configured yet.', 'Nội dung này chưa có nhiệm vụ nào được cấu hình.')}</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>{t(lang, 'Please contact the admin to set up the task list.', 'Vui lòng liên hệ admin để thiết lập danh sách nhiệm vụ.')}</p>
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
        <Link to={backUrl} className="ts-back" title={t(lang, 'Back to team list', 'Về danh sách đội')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {team?.name}
            <span className="ts-board-chip">{t(lang, 'Round', 'Lượt')} {round}</span>
            {team?.boards?.name && <span className="ts-board-chip">{team.boards.name}</span>}
            {existingScore && <span className="ts-edit-chip">{t(lang, 'Editing sheet', 'Đang sửa phiếu')}</span>}
          </div>
          <div className="ts-content-name">
            {content?.name}
            {step === 1 && (isBonusScreen ? t(lang, ' · Bonus', ' · Điểm thưởng') : ` · ${t(lang, 'Task', 'Nhiệm vụ')} ${screenIdx + 1}/${tasks.length}`)}
          </div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">{t(lang, 'LIVE TOTAL SCORE', 'TỔNG ĐIỂM TRỰC TIẾP')}</div>
          <div className="ts-score-value">{totalScore}</div>
        </div>
      </header>

      {/* ── Stepper Nav ── */}
      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">{t(lang, `Score each task (${scoredCount}/${tasks.length})`, `Chấm từng nhiệm vụ (${scoredCount}/${tasks.length})`)}</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">{t(lang, 'Confirm & sign to submit', 'Xác nhận & ký để nộp')}</span>
        </div>
      </div>

      {/* ── Step 1: Chấm điểm với Layout 2 cột trên Tablet ── */}
      {step === 1 && (
        <div className="ts-split-container">
          {/* CỘT TRÁI (Tablet Sidebar): Tiến độ + Đồng hồ Bấm giờ Live + Danh sách Nhiệm vụ */}
          <aside className="ts-sidebar-pane">
            <div className="ts-card ts-sidebar-card">
              <div className="ts-sidebar-title">{t(lang, 'SCOREBOARD & TIMER', 'BẢNG ĐIỂM & ĐỒNG HỒ')}</div>

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
                    {isTimerRunning ? t(lang, '⏸ PAUSE', '⏸ TẠM DỪNG') : t(lang, '▶ START TIMER', '▶ BẮT ĐẦU')}
                  </button>
                  <button type="button" className="ts-timer-btn reset" onClick={resetStopwatch} title={t(lang, 'Reset to 0', 'Đặt lại về 0')}>
                    ↺
                  </button>
                </div>
                <button type="button" className="ts-timer-apply-btn" onClick={applyStopwatchToTime}>
                  {t(lang, '✓ Use this time for the sheet', '✓ Dùng thời gian này cho phiếu điểm')}
                </button>
              </div>

              {/* Progress bar */}
              <div className="ts-progress-wrap">
                <div className="ts-progress-info">
                  <span>{t(lang, 'Scoring progress:', 'Tiến độ chấm:')}</span>
                  <strong>{Math.round(((screenIdx + 1) / screenCount) * 100)}%</strong>
                </div>
                <div className="ts-progress">
                  <div className="ts-progress-bar" style={{ width: `${((screenIdx + 1) / screenCount) * 100}%` }} />
                </div>
              </div>

              {/* Danh sách nhiệm vụ dạng Nav Pill rộng trên Tablet */}
              <div className="ts-task-nav-list">
                {tasks.map((t2, idx) => {
                  const st = taskState[t2.id];
                  const isDone = t2.scoring_type === 'count' ? (st?.qty > 0) : (st?.points !== null);
                  const isCurrent = idx === screenIdx;
                  return (
                    <button
                      type="button"
                      key={t2.id}
                      className={`ts-task-nav-item ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
                      onClick={() => setScreenIdx(idx)}
                    >
                      <span className="ts-tnav-num">{idx + 1}</span>
                      <div className="ts-tnav-info">
                        <span className="ts-tnav-name">{t2.name}</span>
                        <span className="ts-tnav-score">
                          {t2.scoring_type === 'count' ? `${st?.qty || 0} x ${t2.max_score}${t(lang, 'pts', 'đ')}` : (st?.points !== null ? `${st?.points}${t(lang, 'pts', 'đ')}` : t(lang, 'Not scored', 'Chưa chấm'))}
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
                      <span className="ts-tnav-name">{bonusCfg.label}</span>
                      <span className="ts-tnav-score">+{bonusPoints}{t(lang, 'pts', 'đ')} ({retryCount} {t(lang, 'reruns', 'lần chạy lại')})</span>
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
                    <span className="ts-task-tag">{t(lang, 'Task', 'Nhiệm vụ')} {screenIdx + 1} / {tasks.length}</span>
                    <span className="ts-task-max-badge">{t(lang, 'Max score:', 'Điểm tối đa:')} {currentTask.max_score}{t(lang, 'pts', 'đ')}</span>
                  </div>

                  <h2 className="ts-task-name">{currentTask.name}</h2>
                  {lang === 'en' && currentTask.name_en && <div className="ts-task-name-en">{currentTask.name_en}</div>}

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
                        <span className="ts-bigbtn-text">{t(lang, 'FAIL', 'RỚT')}</span>
                        <span className="ts-bigbtn-pts">0 {t(lang, 'pts', 'đ')}</span>
                      </button>
                      <button
                        type="button"
                        className={`ts-bigbtn ts-bigbtn-pass ${taskState[currentTask.id]?.points > 0 ? 'selected' : ''}`}
                        onClick={() => { setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 }); gotoNextScreen(); }}
                      >
                        <span className="ts-bigbtn-icon">✓</span>
                        <span className="ts-bigbtn-text">{t(lang, 'PASS', 'ĐẠT')}</span>
                        <span className="ts-bigbtn-pts">+{currentTask.max_score} {t(lang, 'pts', 'đ')}</span>
                      </button>
                    </div>
                  )}

                  {/* COUNT: Đếm số lượng với Stepper + Chip tăng nhanh */}
                  {currentTask.scoring_type === 'count' && (
                    <div className="ts-count-box">
                      <div className="ts-count-label">{t(lang, 'Quantity completed (units)', 'Số lượng hoàn thành (đơn vị)')}</div>
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
                        {[1, 2, 5].filter((n) => !currentTask.max_count || currentTask.max_count >= n).map((n) => (
                          <button key={n} type="button" onClick={() => setTask(currentTask.id, {
                            qty: Math.min(currentTask.max_count || Infinity, (taskState[currentTask.id]?.qty || 0) + n),
                          })}>+{n}</button>
                        ))}
                        <button type="button" onClick={() => setTask(currentTask.id, { qty: 0 })}>{t(lang, 'Reset to 0', 'Đặt lại về 0')}</button>
                        {currentTask.max_count && (
                          <button type="button" className="ts-chip-full" onClick={() => setTask(currentTask.id, { qty: currentTask.max_count })}>
                            {t(lang, 'Max', 'Tối đa')} ({currentTask.max_count})
                          </button>
                        )}
                      </div>

                      <div className="ts-count-calc">
                        {t(lang, 'Score', 'Điểm')}: {taskState[currentTask.id]?.qty || 0} × {currentTask.max_score}{t(lang, 'pts', 'đ')} = <strong>{taskPoints(currentTask)} {t(lang, 'pts', 'đ')}</strong>
                      </div>
                    </div>
                  )}

                  {/* NUMERIC: Nhập điểm trực tiếp + Phím Preset % */}
                  {currentTask.scoring_type === 'numeric' && (
                    <div className="ts-count-box">
                      <div className="ts-count-label">{t(lang, `Points scored (Max ${currentTask.max_score}pts)`, `Điểm đạt được (Tối đa ${currentTask.max_score}đ)`)}</div>
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
                        <button type="button" onClick={() => setTask(currentTask.id, { points: 0 })}>0 {t(lang, 'pts', 'đ')}</button>
                        <button type="button" onClick={() => setTask(currentTask.id, { points: Math.round((Number(currentTask.max_score) || 0) / 2) })}>
                          50% ({Math.round((Number(currentTask.max_score) || 0) / 2)}{t(lang, 'pts', 'đ')})
                        </button>
                        <button type="button" className="ts-chip-full" onClick={() => setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 })}>
                          {t(lang, `100% Max score (${currentTask.max_score}pts)`, `100% Điểm tối đa (${currentTask.max_score}đ)`)}
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
                            <span className="ts-tier-btn-pts">{tier.points} {t(lang, 'pts', 'đ')}</span>
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
                    <span className="ts-task-tag">{t(lang, 'Bonus configuration', 'Cấu hình điểm thưởng')}</span>
                    <span className="ts-task-max-badge">{t(lang, 'Max:', 'Tối đa:')} {bonusCfg.base}{t(lang, 'pts', 'đ')}</span>
                  </div>
                  <h2 className="ts-task-name">{bonusCfg.label}</h2>
                  <p className="ts-task-desc">
                    {t(lang, `Formula: ${bonusCfg.base}pts base bonus − ${bonusCfg.per_retry}pts per rerun.`, `Công thức: ${bonusCfg.base}đ thưởng gốc − ${bonusCfg.per_retry}đ mỗi lần chạy lại.`)}
                  </p>
                  <div className="ts-count-box">
                    <div className="ts-count-label">{t(lang, 'Number of reruns (Retry)', 'Số lần chạy lại (Retry)')}</div>
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
                      {t(lang, 'Bonus points calculated:', 'Điểm thưởng tính được:')} <strong>+{bonusPoints} {t(lang, 'pts', 'đ')}</strong>
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
                  {t(lang, '← Previous task', '← Nhiệm vụ trước')}
                </button>
                <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={gotoNextScreen}>
                  {screenIdx < screenCount - 1 ? t(lang, 'Next task →', 'Nhiệm vụ tiếp →') : t(lang, 'Review summary & sign →', 'Xem tổng kết & ký →')}
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
              <h2 className="ts-card-title" style={{ fontSize: 20, margin: 0 }}>{t(lang, 'MATCH SCORE SHEET', 'PHIẾU ĐIỂM')}</h2>
              <div className="ts-sheet-sub">
                {t(lang, 'Team:', 'Đội:')} <strong>{team?.name}</strong> {team?.boards?.name ? `· ${t(lang, 'Board:', 'Bảng:')} ${team.boards.name}` : ''} · {t(lang, 'Content:', 'Nội dung:')} <strong>{content?.name}</strong> · {t(lang, 'Round:', 'Lượt:')} <strong>{round}</strong>
              </div>
            </div>
            <div className="ts-sheet-total-badge">
              <span className="ts-st-label">{t(lang, 'TOTAL SCORE', 'TỔNG ĐIỂM')}</span>
              <span className="ts-st-val">{totalScore}</span>
            </div>
          </div>

          {/* Bảng điểm chi tiết */}
          <table className="ts-detail-table ts-sheet-table">
            <thead>
              <tr>
                <th>{t(lang, 'No.', 'STT')}</th>
                <th>{t(lang, 'Task / Category', 'Nhiệm vụ / Hạng mục')}</th>
                <th className="ts-col-qty">{t(lang, 'Qty', 'SL')}</th>
                <th className="ts-col-pts">{t(lang, 'Score', 'Điểm')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t3, idx) => (
                <tr key={t3.id}>
                  <td style={{ width: 40, color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                  <td>
                    <div style={{ color: '#f9fafb', fontWeight: 600 }}>{t3.name}</div>
                    {taskState[t3.id]?.tierLabel && <div style={{ fontSize: 12, color: '#60a5fa' }}>{t(lang, 'Tier:', 'Mức:')} {taskState[t3.id].tierLabel}</div>}
                    {taskState[t3.id]?.points === null && t3.scoring_type !== 'count' && (
                      <span className="ts-not-scored"> ({t(lang, 'Not scored', 'Chưa chấm')})</span>
                    )}
                  </td>
                  <td className="ts-col-qty">{t3.scoring_type === 'count' ? (taskState[t3.id]?.qty || 0) : '—'}</td>
                  <td className="ts-col-pts"><strong>{taskPoints(t3)}{t(lang, 'pts', 'đ')}</strong></td>
                </tr>
              ))}
              {bonusCfg && (
                <tr className="ts-row-bonus-summary">
                  <td style={{ color: '#9ca3af', fontWeight: 600 }}>★</td>
                  <td>
                    <div style={{ color: '#f59e0b', fontWeight: 600 }}>{bonusCfg.label}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{t(lang, 'Reruns:', 'Chạy lại:')} {retryCount}</div>
                  </td>
                  <td className="ts-col-qty">—</td>
                  <td className="ts-col-pts"><strong style={{ color: '#f59e0b' }}>+{bonusPoints}{t(lang, 'pts', 'đ')}</strong></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="ts-sheet-total">
                <td colSpan={3}>{t(lang, `TOTAL SCORE — ROUND ${round}`, `TỔNG ĐIỂM — LƯỢT ${round}`)}</td>
                <td className="ts-col-pts"><strong style={{ color: '#10b981', fontSize: 20 }}>{totalScore}{t(lang, 'pts', 'đ')}</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Form Thông tin & Ô Ký Tên Tablet 2 Cột */}
          <div className="ts-sheet-form-grid">
            <div className="ts-form-row ts-full">
              <label className="ts-label">
                {t(lang, 'Match Time (in seconds)', 'Thời gian thi (giây)')} <span className="ts-req">*</span>
                {timeLimitText && <span className="ts-hint-inline"> ({t(lang, 'Time limit:', 'Giới hạn:')} {timeLimitText})</span>}
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
                  placeholder={t(lang, 'Enter seconds (e.g. 155)', 'Nhập số giây (vd 155)')}
                />
                {stopwatchSeconds > 0 && (
                  <button type="button" className="ts-btn ts-btn-secondary" onClick={applyStopwatchToTime}>
                    {t(lang, `Use ${stopwatchSeconds}s from timer`, `Dùng ${stopwatchSeconds}s từ đồng hồ`)}
                  </button>
                )}
              </div>
              {timeSpent !== '' && !Number.isNaN(Number(timeSpent)) && (
                <div className="ts-hint">{t(lang, 'In minutes:', 'Tính theo phút:')} <strong>{formatSecondsAsMinutes(timeSpent)}</strong></div>
              )}
            </div>

            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Arena Entry Time', 'Giờ vào sân')} <span className="ts-hint-inline">({t(lang, 'auto, locked', 'tự động, đã khóa')})</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={arenaEntryTime}
                readOnly
                placeholder={t(lang, 'Recorded when the round is started', 'Ghi nhận khi bắt đầu lượt thi')}
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Team Captain / Student Representative', 'Đội trưởng / Đại diện học sinh')} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={teamMembers}
                readOnly
                placeholder={t(lang, 'No members recorded', 'Chưa có tên')}
              />
            </div>

            {/* Ô Ký Tên Tablet Đặt Cạnh Nhau */}
            <div className="ts-form-row">
              <SignatureBox
                label={t(lang, 'Student / Team Captain Signature', 'Chữ ký học sinh / đội trưởng')}
                value={studentSigImage}
                onChange={setStudentSigImage}
                required
              />
            </div>
            <div className="ts-form-row">
              <SignatureBox
                label={t(lang, 'Table Referee Signature', 'Chữ ký trọng tài bàn')}
                value={refereeSigImage}
                onChange={setRefereeSigImage}
                required
              />
            </div>

            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Table Referee Name', 'Tên trọng tài bàn')} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={refereeSignature}
                readOnly
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">{t(lang, 'Chief Referee', 'Trưởng ban trọng tài')} <span className="ts-hint-inline">({t(lang, 'locked', 'đã khóa')})</span></label>
              <input
                type="text"
                className="ts-input ts-input-locked"
                value={headRefereeName}
                readOnly
              />
            </div>

            <div className="ts-form-row ts-full">
              <label className="ts-label">{t(lang, 'Referee Remarks', 'Ghi chú của trọng tài')}</label>
              <textarea
                className="ts-input"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={t(lang, 'Additional notes (optional)...', 'Ghi chú thêm (không bắt buộc)...')}
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">{t(lang, 'Team Feedback / Objection', 'Phản hồi / Kiến nghị của đội')}</label>
              <textarea
                className="ts-input"
                rows={2}
                value={objection}
                onChange={(e) => setObjection(e.target.value)}
                placeholder={t(lang, "Team's feedback or objection (optional)...", 'Phản hồi hoặc kiến nghị của đội (không bắt buộc)...')}
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>
              {t(lang, '← Edit task scores', '← Sửa điểm nhiệm vụ')}
            </button>
            <button
              type="button"
              className="ts-btn ts-btn-primary ts-btn-xl"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? t(lang, 'Submitting...', 'Đang nộp...') : t(lang, `✓ CONFIRM & SUBMIT SCORE SHEET (${totalScore}pts)`, `✓ XÁC NHẬN & NỘP PHIẾU ĐIỂM (${totalScore}đ)`)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
