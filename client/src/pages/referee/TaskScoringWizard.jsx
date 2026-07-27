import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, taskImageUrl } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes } from '../../lib/time';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

// Điểm thưởng mặc định khi nội dung thi chưa tự cấu hình bonus_config riêng
const DEFAULT_BONUS_CONFIG = { label: 'Extra reward', base: 40, per_retry: 10 };

/**
 * Wizard chấm điểm theo từng nhiệm vụ — tối ưu cho trọng tài không chuyên trên iPad.
 *
 * Flow 2 bước:
 *   1) Chấm  — mỗi nhiệm vụ 1 màn hình: ảnh to + điểm, nút bấm lớn
 *              (binary: Đạt/Không đạt · count: đếm số lượng · numeric: nhập điểm)
 *              + màn điểm thưởng nếu nội dung có bonus_config
 *   2) Gửi   — bảng tổng kết giống phiếu giấy để học sinh check, nhập thời gian,
 *              ký tên rồi gửi
 *
 * Mỗi đội chỉ có 1 phiếu / nội dung: nếu đã có phiếu (existing) → sửa phiếu đó (PUT).
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

  // Mặc định điểm thưởng cho MỌI nội dung thi: 40 điểm, trừ 10/lượt chạy lại
  // (tối đa 4 lượt thì về 0) — admin có thể cấu hình khác riêng cho từng nội
  // dung thi qua bonus_config, nếu không cấu hình thì dùng mặc định này.
  const bonusCfg = content?.bonus_config || DEFAULT_BONUS_CONFIG;

  // ── State chấm điểm ──
  // taskState[taskId] = { qty, points, done }
  const [taskState, setTaskState] = useState(() => {
    const init = {};
    for (const t of tasks) {
      const prevPts = prevCS.taskScores?.[t.id];
      const prevQty = prevCS.taskQty?.[t.id];
      const has = prevPts !== undefined && prevPts !== '';
      init[t.id] = {
        qty: prevQty !== undefined ? Number(prevQty) : 0,
        points: has ? Number(prevPts) || 0 : null, // null = chưa chấm
      };
    }
    return init;
  });
  const [retryCount, setRetryCount] = useState(() => Number(prevCS.rerunCount) || existingScore?.retry_count || 0);
  const [step, setStep] = useState(1);
  // các "màn": mỗi task 1 màn + 1 màn bonus (nếu có)
  const screenCount = tasks.length + (bonusCfg ? 1 : 0);
  const [screenIdx, setScreenIdx] = useState(0);

  // ── State xác nhận ──
  const [timeSpent, setTimeSpent] = useState(existingScore?.time || '');
  const [teamMembers, setTeamMembers] = useState(prevCS.teamMembers || memberNames || '');
  const [refereeSignature, setRefereeSignature] = useState(
    prevCS.refereeSignature || user?.fullName || user?.username || ''
  );
  const [remarks, setRemarks] = useState(prevCS.remarks || existingScore?.notes || '');
  // Chữ ký tay (data URL PNG) — học sinh ký trực tiếp trên iPad/điện thoại
  const [studentSigImage, setStudentSigImage] = useState(prevCS.studentSignatureImage || '');
  const [refereeSigImage, setRefereeSigImage] = useState(prevCS.refereeSignatureImage || '');
  // Các trường theo mẫu phiếu điểm giấy (Score Sheet)
  const [arenaEntryTime, setArenaEntryTime] = useState(existingScore?.arena_entry_time || '');
  // Head Referee mặc định "Mr Ly Quang Van"; Scorekeeper mặc định tên tài khoản đang chấm
  const [headRefereeName, setHeadRefereeName] = useState(existingScore?.head_referee_name || 'Mr Ly Quang Van');
  const [scorekeeperName, setScorekeeperName] = useState(
    existingScore?.scorekeeper_name || user?.fullName || user?.username || ''
  );
  const [objection, setObjection] = useState(existingScore?.objection || '');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
    () => tasks.filter(t => t.scoring_type === 'count' ? true : taskState[t.id]?.points !== null).length,
    [taskState, tasks]
  );

  const setTask = (id, patch) => setTaskState(s => ({ ...s, [id]: { ...s[id], ...patch } }));

  const gotoNextScreen = () => {
    if (screenIdx < screenCount - 1) setScreenIdx(i => i + 1);
    else setStep(2);
  };

  // Format giới hạn thời gian mm:ss
  const timeLimitText = content?.time_limit_seconds
    ? formatSecondsAsMinutes(content.time_limit_seconds)
    : null;

  // ── Gửi ──
  const handleSubmit = async () => {
    const timeSeconds = Number(timeSpent);
    if (!timeSpent || Number.isNaN(timeSeconds) || timeSeconds < 0) {
      showAlert('Please enter Time spent (in seconds).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const taskScores = {};
      const taskQty = {};
      for (const t of tasks) {
        taskScores[t.id] = taskPoints(t);
        if (t.scoring_type === 'count') taskQty[t.id] = taskState[t.id]?.qty || 0;
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
      };
      if (existingScore) {
        await api.putScore(existingScore.id, payload);
      } else {
        try {
          await api.postScore(payload);
        } catch (err) {
          // Đội đã có phiếu (tạo từ nơi khác) → server trả 409 kèm existing_id
          const m = /Đội này đã có phiếu điểm/.test(err.message || '');
          if (m) throw new Error('This team already has a score sheet for this round. Go back to the team list and reopen the team to edit it.');
          throw err;
        }
      }
      setSuccess(true);
      setTimeout(() => navigate(backUrl), 2000);
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
        <strong>{existingScore ? 'Score sheet updated!' : 'Score submitted successfully!'}</strong>
        <p>Returning to team list...</p>
      </div>
    );
  }

  // ── Empty tasks ──
  if (tasks.length === 0) {
    return (
      <div className="ts-wrapper">
        <a href={backUrl} className="btn-ghost">← Back</a>
        <div className="ts-card" style={{ textAlign: 'center', padding: 40 }}>
          <p>This content has no tasks yet.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>Please contact Admin to add tasks.</p>
        </div>
      </div>
    );
  }

  const isBonusScreen = bonusCfg && screenIdx === tasks.length;
  const currentTask = !isBonusScreen ? tasks[screenIdx] : null;
  const curImg = currentTask ? taskImageUrl(currentTask) : null;

  return (
    <div className="ts-wrapper">
      {/* ── Sticky header ── */}
      <header className="ts-header">
        <a href={backUrl} className="ts-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <div className="ts-header-info">
          <div className="ts-team-name">
            {team?.name}
            <span className="ts-board-chip">Round {round}</span>
            {team?.boards?.name && <span className="ts-board-chip">{team.boards.name}</span>}
            {existingScore && <span className="ts-edit-chip">Editing</span>}
          </div>
          <div className="ts-content-name">{content?.name}</div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">Total</div>
          <div className="ts-score-value">{totalScore}</div>
        </div>
      </header>

      {/* ── Stepper ── */}
      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">Scoring</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''}`}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">Confirm & submit</span>
        </div>
      </div>

      {/* ── Step 1: chấm từng nhiệm vụ ── */}
      {step === 1 && (
        <div className="ts-card ts-fade-in">
          {/* Progress */}
          <div className="ts-progress">
            <div className="ts-progress-bar" style={{ width: `${((screenIdx + 1) / screenCount) * 100}%` }} />
            <span className="ts-progress-text">
              {isBonusScreen ? 'Extra reward' : `Task ${screenIdx + 1} / ${tasks.length}`}
            </span>
          </div>

          {/* ── Màn nhiệm vụ ── */}
          {currentTask && (
            <div className="ts-task-focus">
              <h3 className="ts-task-name">{currentTask.name}</h3>
              {currentTask.name_en && <div className="ts-task-name-en">{currentTask.name_en}</div>}

              {curImg && (
                <div className="ts-task-image-wrap">
                  <img src={curImg} alt={currentTask.name} className="ts-task-image" />
                </div>
              )}

              {currentTask.description && (
                <p className="ts-task-desc">{currentTask.description}</p>
              )}

              {/* binary: 2 nút to */}
              {currentTask.scoring_type === 'binary' && (
                <div className="ts-bigbtns">
                  <button
                    type="button"
                    className={`ts-bigbtn ts-bigbtn-fail ${taskState[currentTask.id]?.points === 0 ? 'selected' : ''}`}
                    onClick={() => { setTask(currentTask.id, { points: 0 }); gotoNextScreen(); }}
                  >
                    ✗ Fail
                    <span className="ts-bigbtn-pts">0 pts</span>
                  </button>
                  <button
                    type="button"
                    className={`ts-bigbtn ts-bigbtn-pass ${taskState[currentTask.id]?.points > 0 ? 'selected' : ''}`}
                    onClick={() => { setTask(currentTask.id, { points: Number(currentTask.max_score) || 0 }); gotoNextScreen(); }}
                  >
                    ✓ Pass
                    <span className="ts-bigbtn-pts">+{currentTask.max_score} pts</span>
                  </button>
                </div>
              )}

              {/* count: đếm số lượng */}
              {currentTask.scoring_type === 'count' && (
                <div className="ts-count-box">
                  <div className="ts-count-label">Quantity achieved</div>
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
                  <div className="ts-count-calc">
                    {taskState[currentTask.id]?.qty || 0} × {currentTask.max_score} = <strong>{taskPoints(currentTask)} pts</strong>
                    {currentTask.max_count ? <span className="ts-count-max"> (max {currentTask.max_count})</span> : null}
                  </div>
                </div>
              )}

              {/* numeric / tier: nhập điểm */}
              {(currentTask.scoring_type === 'numeric' || currentTask.scoring_type === 'tier') && (
                <div className="ts-count-box">
                  <div className="ts-count-label">Points scored (max {currentTask.max_score})</div>
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
                </div>
              )}
            </div>
          )}

          {/* ── Màn điểm thưởng ── */}
          {isBonusScreen && (
            <div className="ts-task-focus">
              <h3 className="ts-task-name">{bonusCfg.label || 'Extra reward'}</h3>
              <p className="ts-task-desc">
                Formula: {bonusCfg.base} − {bonusCfg.per_retry} × number of retries (minimum 0)
              </p>
              <div className="ts-count-box">
                <div className="ts-count-label">Number of retries</div>
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
                  Extra reward: <strong>{bonusPoints} pts</strong>
                </div>
              </div>
            </div>
          )}

          {/* Điều hướng màn */}
          <div className="ts-task-nav">
            <button
              type="button"
              className="ts-btn ts-btn-secondary"
              onClick={() => setScreenIdx(i => Math.max(0, i - 1))}
              disabled={screenIdx === 0}
            >
              ← Previous
            </button>
            <button type="button" className="ts-btn ts-btn-primary" onClick={gotoNextScreen}>
              {screenIdx < screenCount - 1 ? 'Next →' : 'Done — Confirm →'}
            </button>
          </div>

          {/* Side index */}
          <div className="ts-task-index">
            {tasks.map((t, i) => (
              <button
                type="button"
                key={t.id}
                className={`ts-task-pill ${i === screenIdx ? 'active' : ''} ${t.scoring_type === 'count' ? (taskState[t.id]?.qty > 0 ? 'filled' : '') : (taskState[t.id]?.points !== null ? 'filled' : '')}`}
                onClick={() => setScreenIdx(i)}
                title={t.name}
              >
                {i + 1}
              </button>
            ))}
            {bonusCfg && (
              <button
                type="button"
                className={`ts-task-pill ${isBonusScreen ? 'active' : ''} ${retryCount >= 0 && screenIdx > tasks.length - 1 ? '' : ''}`}
                onClick={() => setScreenIdx(tasks.length)}
                title={bonusCfg.label || 'Extra reward'}
              >
                ★
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: xác nhận — trình bày như phiếu giấy để học sinh check ── */}
      {step === 2 && (
        <div className="ts-card ts-fade-in">
          <h2 className="ts-card-title">Score Sheet</h2>
          <div className="ts-sheet-sub">
            {team?.name}
            {team?.boards?.name ? ` · ${team.boards.name}` : ''} · {content?.name} · Round {round}
          </div>

          <table className="ts-detail-table ts-sheet-table">
            <thead>
              <tr>
                <th>Task</th>
                <th className="ts-col-qty">Quantity</th>
                <th className="ts-col-pts">Score</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.name}
                    {taskState[t.id]?.points === null && t.scoring_type !== 'count' && (
                      <span className="ts-not-scored"> (not scored)</span>
                    )}
                  </td>
                  <td className="ts-col-qty">{t.scoring_type === 'count' ? (taskState[t.id]?.qty || 0) : '—'}</td>
                  <td className="ts-col-pts"><strong>{taskPoints(t)}</strong></td>
                </tr>
              ))}
              {bonusCfg && (
                <tr>
                  <td>{bonusCfg.label || 'Extra reward'} <span className="ts-not-scored">({retryCount} retries)</span></td>
                  <td className="ts-col-qty">—</td>
                  <td className="ts-col-pts"><strong>{bonusPoints}</strong></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="ts-sheet-total">
                <td colSpan={2}>TOTAL SCORE</td>
                <td className="ts-col-pts"><strong>{totalScore}</strong></td>
              </tr>
            </tfoot>
          </table>

          <div className="ts-form-grid" style={{ marginTop: 16 }}>
            <div className="ts-form-row ts-full">
              <label className="ts-label">
                Time spent (seconds) <span className="ts-req">*</span>
                {timeLimitText && <span className="ts-hint-inline"> (max {timeLimitText})</span>}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="ts-input ts-input-lg"
                value={timeSpent}
                onChange={(e) => setTimeSpent(e.target.value)}
                placeholder="e.g. 155"
              />
              {timeSpent !== '' && !Number.isNaN(Number(timeSpent)) && (
                <div className="ts-hint">≈ {formatSecondsAsMinutes(timeSpent)} min</div>
              )}
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Time entering the field</label>
              <input
                type="text"
                className="ts-input"
                value={arenaEntryTime}
                onChange={(e) => setArenaEntryTime(e.target.value)}
                placeholder="e.g. 08:30"
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Contestant name / team leader</label>
              <input
                type="text"
                className="ts-input"
                value={teamMembers}
                onChange={(e) => setTeamMembers(e.target.value)}
                placeholder="Name of the person confirming"
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Referee name</label>
              <input
                type="text"
                className="ts-input"
                value={refereeSignature}
                onChange={(e) => setRefereeSignature(e.target.value)}
              />
            </div>
            <div className="ts-form-row">
              <SignatureBox
                label="Team / team leader signature"
                value={studentSigImage}
                onChange={setStudentSigImage}
              />
            </div>
            <div className="ts-form-row">
              <SignatureBox
                label="Referee signature"
                value={refereeSigImage}
                onChange={setRefereeSigImage}
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Head Referee</label>
              <input
                type="text"
                className="ts-input"
                value={headRefereeName}
                onChange={(e) => setHeadRefereeName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Scorekeeper</label>
              <input
                type="text"
                className="ts-input"
                value={scorekeeperName}
                onChange={(e) => setScorekeeperName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Remarks</label>
              <textarea
                className="ts-input"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Additional remarks (if any)"
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Recommendation</label>
              <textarea
                className="ts-input"
                rows={2}
                value={objection}
                onChange={(e) => setObjection(e.target.value)}
                placeholder="Team's recommendation/objection (if any)"
              />
            </div>
          </div>

          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>← Re-score</button>
            <button
              type="button"
              className="ts-btn ts-btn-primary ts-btn-lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : `✓ ${existingScore ? 'Update score sheet' : 'Submit score'} (${totalScore})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
