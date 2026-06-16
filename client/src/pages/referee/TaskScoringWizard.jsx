import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

/**
 * Wizard chấm điểm theo từng nhiệm vụ.
 *
 * Props:
 *   - team: object đội
 *   - content: object nội dung thi
 *   - tasks: array task (đã filter is_active, sắp theo order_index)
 *   - competitionId, contentId, region: route params
 *   - memberNames: string tên các thành viên
 *   - existing: array score đã chấm trước đó (nếu có)
 *
 * Flow 3 bước:
 *   1) Info  — round, bangThi, timeSpent
 *   2) Tasks — chấm từng task, có ảnh minh hoạ
 *   3) Confirm — ký tên, ghi chú, gửi
 */
export default function TaskScoringWizard({
  team,
  content,
  tasks,
  competitionId,
  contentId,
  region,
  memberNames,
  existing = [],
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert } = useNotify();

  const [step, setStep] = useState(1); // 1: info, 2: tasks, 3: confirm
  const [round, setRound] = useState('1');
  const [bangThi, setBangThi] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [scores, setScores] = useState(() => Object.fromEntries(tasks.map(t => [t.id, ''])));
  const [rerunCount, setRerunCount] = useState('0');
  const [extraReward, setExtraReward] = useState(0);
  const [teamMembers, setTeamMembers] = useState(memberNames || '');
  const [refereeSignature, setRefereeSignature] = useState(user?.fullName || user?.username || '');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [taskIdx, setTaskIdx] = useState(0);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const taskListRef = useRef(null);

  useEffect(() => {
    if (memberNames) setTeamMembers(memberNames);
  }, [memberNames]);

  useEffect(() => {
    const r = parseInt(rerunCount, 10);
    if (!isNaN(r) && r > 0) setExtraReward(Math.max(0, 40 - 10 * r));
    else setExtraReward(0);
  }, [rerunCount]);

  const totalScore = useMemo(() => {
    return tasks.reduce((sum, t) => {
      const v = parseFloat(scores[t.id]);
      return sum + (isNaN(v) ? 0 : v);
    }, 0) + extraReward;
  }, [scores, tasks, extraReward]);

  const filledCount = useMemo(() => {
    return tasks.filter(t => scores[t.id] !== '' && scores[t.id] !== undefined && !isNaN(parseFloat(scores[t.id]))).length;
  }, [scores, tasks]);

  const backUrl = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`;

  const setScore = (id, val) => setScores(s => ({ ...s, [id]: val }));

  const handleNext = () => {
    if (step === 1) {
      if (!timeSpent) {
        showAlert('Vui lòng nhập Thời gian hoàn thành.', 'error');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (filledCount === 0) {
        showAlert('Vui lòng nhập điểm cho ít nhất 1 nhiệm vụ.', 'error');
        return;
      }
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.postScore({
        team_id: team.id,
        contest_content_id: contentId,
        referee_id: user?.id,
        time: timeSpent,
        score: totalScore,
        // scores table không có round, extra_fields, student_signature, referee_signature
        // Lưu chi tiết taskScores + extra vào criteria_scores (jsonb) để không mất data
        criteria_scores: {
          taskScores: scores,
          bangThi,
          rerunCount: rerunCount || '0',
          extraReward,
          teamMembers,
          remarks,
          refereeSignature: refereeSignature || user?.full_name || user?.username,
          studentSignature: teamMembers,
        },
        notes: remarks || null,
      });
      setSuccess(true);
      setTimeout(() => navigate(backUrl), 2000);
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
        <strong>Gửi điểm thành công!</strong>
        <p>Đang quay lại danh sách đội...</p>
      </div>
    );
  }

  // ── Empty tasks ──
  if (tasks.length === 0) {
    return (
      <div className="ts-wrapper">
        <a href={backUrl} className="btn-ghost">← Quay lại</a>
        <div className="ts-card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Nội dung thi này chưa có nhiệm vụ nào.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>Vui lòng liên hệ Admin để thêm nhiệm vụ.</p>
        </div>
      </div>
    );
  }

  const currentTask = tasks[taskIdx];

  return (
    <div className="ts-wrapper">
      {/* ── Sticky header (luôn hiện trên tablet) ── */}
      <header className="ts-header">
        <a href={backUrl} className="ts-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <div className="ts-header-info">
          <div className="ts-team-name">{team?.name}</div>
          <div className="ts-content-name">{content?.name}</div>
        </div>
        <div className="ts-header-score">
          <div className="ts-score-label">Tổng</div>
          <div className="ts-score-value">{totalScore}</div>
        </div>
      </header>

      {/* ── Stepper ── */}
      <div className="ts-stepper">
        <div className={`ts-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} onClick={() => step > 1 && setStep(1)}>
          <span className="ts-step-num">1</span>
          <span className="ts-step-label">Thông tin</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`} onClick={() => step > 2 && setStep(2)}>
          <span className="ts-step-num">2</span>
          <span className="ts-step-label">Chấm điểm</span>
        </div>
        <div className="ts-step-line" />
        <div className={`ts-step ${step >= 3 ? 'active' : ''}`}>
          <span className="ts-step-num">3</span>
          <span className="ts-step-label">Xác nhận</span>
        </div>
      </div>

      {/* ── Step 1: Info ── */}
      {step === 1 && (
        <div className="ts-card ts-fade-in">
          <h2 className="ts-card-title">Thông tin lượt thi</h2>
          <div className="ts-form-grid">
            <div className="ts-form-row">
              <label className="ts-label">Lượt thi <span className="ts-req">*</span></label>
              <div className="ts-input-stepper">
                <button type="button" onClick={() => setRound(String(Math.max(1, (parseInt(round, 10) || 1) - 1)))}>−</button>
                <input type="number" min="1" value={round} onChange={(e) => setRound(e.target.value)} />
                <button type="button" onClick={() => setRound(String((parseInt(round, 10) || 0) + 1))}>+</button>
              </div>
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Bảng thi</label>
              <input
                type="text"
                className="ts-input"
                value={bangThi}
                onChange={(e) => setBangThi(e.target.value)}
                placeholder="VD: Bảng A"
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Thời gian hoàn thành <span className="ts-req">*</span></label>
              <input
                type="text"
                className="ts-input ts-input-lg"
                value={timeSpent}
                onChange={(e) => setTimeSpent(e.target.value)}
                placeholder="mm:ss — VD: 02:35"
                autoFocus
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Thành viên đội</label>
              <input
                type="text"
                className="ts-input"
                value={teamMembers}
                onChange={(e) => setTeamMembers(e.target.value)}
                placeholder="Tự điền nếu trống"
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Số lần chạy lại (tính điểm thưởng)</label>
              <div className="ts-input-stepper">
                <button type="button" onClick={() => setRerunCount(String(Math.max(0, (parseInt(rerunCount, 10) || 0) - 1)))}>−</button>
                <input type="number" min="0" value={rerunCount} onChange={(e) => setRerunCount(e.target.value)} />
                <button type="button" onClick={() => setRerunCount(String((parseInt(rerunCount, 10) || 0) + 1))}>+</button>
              </div>
              <div className="ts-hint">Điểm thưởng: <strong>{extraReward}</strong> (công thức: 40 − 10 × số lần, &gt; 0)</div>
            </div>
          </div>
          <div className="ts-footer">
            <a href={backUrl} className="ts-btn ts-btn-ghost">Hủy</a>
            <button type="button" className="ts-btn ts-btn-primary" onClick={handleNext}>
              Tiếp tục →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Tasks ── */}
      {step === 2 && (
        <div className="ts-card ts-fade-in" ref={taskListRef}>
          <div className="ts-task-header">
            <h2 className="ts-card-title">Chấm từng nhiệm vụ</h2>
            <button
              type="button"
              className="ts-btn ts-btn-ghost ts-btn-sm"
              onClick={() => setShowAllTasks(s => !s)}
            >
              {showAllTasks ? 'Chấm từng cái' : 'Xem tất cả'}
            </button>
          </div>

          {/* Progress */}
          <div className="ts-progress">
            <div className="ts-progress-bar" style={{ width: `${(filledCount / tasks.length) * 100}%` }} />
            <span className="ts-progress-text">{filledCount}/{tasks.length} nhiệm vụ đã chấm</span>
          </div>

          {/* One task focus mode */}
          {!showAllTasks && currentTask && (
            <div className="ts-task-focus">
              <div className="ts-task-counter">Nhiệm vụ {taskIdx + 1} / {tasks.length}</div>
              <h3 className="ts-task-name">{currentTask.name}</h3>
              {currentTask.name_en && <div className="ts-task-name-en">{currentTask.name_en}</div>}
              {currentTask.description && (
                <p className="ts-task-desc">{currentTask.description}</p>
              )}
              <div className="ts-task-input-row">
                <label className="ts-label">Điểm đạt (tối đa {currentTask.max_score})</label>
                <div className="ts-input-stepper ts-input-stepper-lg">
                  <button type="button" onClick={() => {
                    const v = parseFloat(scores[currentTask.id] || 0);
                    setScore(currentTask.id, String(Math.max(0, v - 1)));
                  }}>−</button>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={scores[currentTask.id] ?? ''}
                    onChange={(e) => setScore(currentTask.id, e.target.value)}
                    autoFocus
                    inputMode="decimal"
                  />
                  <button type="button" onClick={() => {
                    const v = parseFloat(scores[currentTask.id] || 0);
                    setScore(currentTask.id, String(Math.min(parseFloat(currentTask.max_score || 999), v + 1)));
                  }}>+</button>
                </div>
                {currentTask.scoring_type === 'binary' && (
                  <div className="ts-quick-btns">
                    <button type="button" onClick={() => setScore(currentTask.id, '0')}>0</button>
                    <button type="button" className="ts-quick-full" onClick={() => setScore(currentTask.id, String(currentTask.max_score))}>{currentTask.max_score} (đạt)</button>
                  </div>
                )}
              </div>

              <div className="ts-task-nav">
                <button
                  type="button"
                  className="ts-btn ts-btn-secondary"
                  onClick={() => setTaskIdx(i => Math.max(0, i - 1))}
                  disabled={taskIdx === 0}
                >
                  ← Trước
                </button>
                {taskIdx < tasks.length - 1 ? (
                  <button
                    type="button"
                    className="ts-btn ts-btn-primary"
                    onClick={() => setTaskIdx(i => i + 1)}
                  >
                    Sau →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ts-btn ts-btn-primary"
                    onClick={() => setStep(3)}
                  >
                    Tiếp tục →
                  </button>
                )}
              </div>

              {/* Side index */}
              <div className="ts-task-index">
                {tasks.map((t, i) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`ts-task-pill ${i === taskIdx ? 'active' : ''} ${scores[t.id] !== '' ? 'filled' : ''}`}
                    onClick={() => setTaskIdx(i)}
                    title={t.name}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All tasks list */}
          {showAllTasks && (
            <div className="ts-task-list">
              {tasks.map((t, i) => (
                <div key={t.id} className="ts-task-row">
                  <div className="ts-task-row-num">{i + 1}</div>
                  <div className="ts-task-row-body">
                    <div className="ts-task-row-name">{t.name}</div>
                    {t.description && <div className="ts-task-row-desc">{t.description}</div>}
                    <div className="ts-task-row-meta">Tối đa: <strong>{t.max_score}</strong></div>
                  </div>
                  <div className="ts-task-row-input">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={scores[t.id] ?? ''}
                      onChange={(e) => setScore(t.id, e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(1)}>← Quay lại</button>
            <button type="button" className="ts-btn ts-btn-primary" onClick={handleNext}>
              Tiếp tục →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === 3 && (
        <div className="ts-card ts-fade-in">
          <h2 className="ts-card-title">Xác nhận & gửi</h2>

          <div className="ts-summary">
            <div className="ts-summary-row">
              <span>Lượt thi</span>
              <strong>{round || '-'}</strong>
            </div>
            <div className="ts-summary-row">
              <span>Thời gian</span>
              <strong>{timeSpent || '-'}</strong>
            </div>
            <div className="ts-summary-row">
              <span>Số nhiệm vụ đã chấm</span>
              <strong>{filledCount}/{tasks.length}</strong>
            </div>
            <div className="ts-summary-row">
              <span>Điểm thưởng</span>
              <strong>{extraReward}</strong>
            </div>
            <div className="ts-summary-row ts-summary-total">
              <span>Tổng điểm</span>
              <strong>{totalScore}</strong>
            </div>
          </div>

          <details className="ts-detail">
            <summary>Xem chi tiết điểm đã chấm ({filledCount})</summary>
            <table className="ts-detail-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nhiệm vụ</th>
                  <th>Điểm</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{t.name}</td>
                    <td><strong>{scores[t.id] || '-'}</strong> / {t.max_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <div className="ts-form-grid">
            <div className="ts-form-row">
              <label className="ts-label">Học sinh / Đội trưởng ký</label>
              <input
                type="text"
                className="ts-input"
                value={teamMembers}
                onChange={(e) => setTeamMembers(e.target.value)}
                placeholder="Tên người xác nhận"
              />
            </div>
            <div className="ts-form-row">
              <label className="ts-label">Trọng tài ký</label>
              <input
                type="text"
                className="ts-input"
                value={refereeSignature}
                onChange={(e) => setRefereeSignature(e.target.value)}
              />
            </div>
            <div className="ts-form-row ts-full">
              <label className="ts-label">Ghi chú</label>
              <textarea
                className="ts-input"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Ghi chú thêm (nếu có)"
              />
            </div>
          </div>

          <div className="ts-footer">
            <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setStep(2)}>← Quay lại</button>
            <button
              type="button"
              className="ts-btn ts-btn-primary ts-btn-lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Đang gửi...' : `✓ Gửi điểm (${totalScore})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
