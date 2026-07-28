import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { formatSecondsAsMinutes } from '../../lib/time';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const DEFAULT_BONUS_CONFIG = { label: 'Extra reward', base: 40, per_retry: 10 };

// Chấm điểm nội dung content_format = 'combat_stars' (Battle of Stars) — 2 đội
// cùng chấm chung 1 bộ nhiệm vụ (tái dùng tasks của nội dung), điểm thưởng
// theo bonus_config, Points lost nhập tay, Total duration, đội thắng.
export default function RefereeCombatStars() {
  const { competitionId, contentId } = useParams();
  const { showAlert } = useNotify();
  const [content, setContent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getAllContents().then((all) => all.find((c) => c.id === contentId) || null).catch(() => null),
      api.getTasks(contentId).catch(() => []),
      api.getCombatMatches(contentId).catch(() => []),
    ])
      .then(([c, t, m]) => { setContent(c); setTasks(t); setMatches(m); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [contentId]);

  const bonusCfg = content?.bonus_config || DEFAULT_BONUS_CONFIG;

  const openMatch = (m) => {
    if (openId === m.id) { setOpenId(null); return; }
    const d = m.details || {};
    setForm({
      taskScoresA: { ...(d.taskScoresA || {}) }, taskQtyA: { ...(d.taskQtyA || {}) },
      taskScoresB: { ...(d.taskScoresB || {}) }, taskQtyB: { ...(d.taskQtyB || {}) },
      retryCountA: d.retryCountA ?? 0, retryCountB: d.retryCountB ?? 0,
      pointsLostA: d.pointsLostA ?? 0, pointsLostB: d.pointsLostB ?? 0,
      durationA: d.durationA ?? '', durationB: d.durationB ?? '',
      division: d.division || '',
      winner_id: m.winner_id || '', is_draw: !!m.is_draw,
    });
    setOpenId(m.id);
  };

  const setQty = (side, task, qty) => {
    setForm((f) => {
      const scoreKey = side === 'A' ? 'taskScoresA' : 'taskScoresB';
      const qtyKey = side === 'A' ? 'taskQtyA' : 'taskQtyB';
      return { ...f, [qtyKey]: { ...f[qtyKey], [task.id]: qty }, [scoreKey]: { ...f[scoreKey], [task.id]: qty * (Number(task.max_score) || 0) } };
    });
  };
  const setScore = (side, task, points) => {
    setForm((f) => {
      const scoreKey = side === 'A' ? 'taskScoresA' : 'taskScoresB';
      return { ...f, [scoreKey]: { ...f[scoreKey], [task.id]: points } };
    });
  };

  const computeScore = (side) => {
    const scores = side === 'A' ? form.taskScoresA : form.taskScoresB;
    const retry = Number(side === 'A' ? form.retryCountA : form.retryCountB) || 0;
    const lost = Number(side === 'A' ? form.pointsLostA : form.pointsLostB) || 0;
    const taskSum = tasks.reduce((s, t) => s + (Number(scores?.[t.id]) || 0), 0);
    const extra = Math.max(0, (Number(bonusCfg.base) || 0) - (Number(bonusCfg.per_retry) || 0) * retry);
    return taskSum + extra - lost;
  };

  const submit = async (m) => {
    setSubmitting(true);
    try {
      await api.putCombatMatch(m.id, {
        details: {
          division: form.division || null,
          taskScoresA: form.taskScoresA, taskQtyA: form.taskQtyA,
          taskScoresB: form.taskScoresB, taskQtyB: form.taskQtyB,
          retryCountA: Number(form.retryCountA) || 0, retryCountB: Number(form.retryCountB) || 0,
          pointsLostA: Number(form.pointsLostA) || 0, pointsLostB: Number(form.pointsLostB) || 0,
          durationA: form.durationA || null, durationB: form.durationB || null,
        },
        winner_id: form.is_draw ? null : (form.winner_id || null),
        is_draw: !!form.is_draw,
      });
      showAlert('Đã lưu điểm trận đấu.', 'success');
      setOpenId(null);
      load();
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải...</p>;

  const taskInput = (side, m, t) => {
    const scores = side === 'A' ? form.taskScoresA : form.taskScoresB;
    const qty = side === 'A' ? form.taskQtyA : form.taskQtyB;
    if (t.scoring_type === 'count') {
      return (
        <div className="ts-input-stepper" key={t.id}>
          <button type="button" onClick={() => setQty(side, t, Math.max(0, (qty?.[t.id] || 0) - 1))}>−</button>
          <input type="number" min="0" value={qty?.[t.id] ?? 0} onChange={(e) => setQty(side, t, Math.max(0, parseInt(e.target.value, 10) || 0))} />
          <button type="button" onClick={() => setQty(side, t, (qty?.[t.id] || 0) + 1)}>+</button>
        </div>
      );
    }
    return (
      <input
        type="number" min="0" max={t.max_score} className="ts-input"
        value={scores?.[t.id] ?? 0}
        onChange={(e) => setScore(side, t, Math.min(Number(t.max_score) || 999, Math.max(0, Number(e.target.value) || 0)))}
      />
    );
  };

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Battle of Stars — Đối kháng</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Chọn 1 trận để chấm điểm nhiệm vụ cho cả 2 đội.</p>

      {matches.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>Chưa có trận nào — vui lòng liên hệ admin.</div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>Nội dung này chưa có nhiệm vụ nào — vui lòng liên hệ admin.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matches.map((m) => {
            const isOpen = openId === m.id;
            const done = !!m.winner_id || m.is_draw;
            return (
              <div className="ts-card" key={m.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                  onClick={() => openMatch(m)} role="button">
                  <strong style={{ color: '#f1f5f9' }}>
                    {m.team_a?.name || '—'} <span style={{ color: '#64748b' }}>vs</span> {m.team_b?.name || '—'}
                  </strong>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {m.stage && <span className="ts-board-chip">{m.stage}</span>}
                    {done && (
                      <span className="rt-badge rt-badge-done">
                        {m.is_draw ? 'Hòa' : `Thắng: ${m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}`}
                      </span>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 16 }}>
                    <div className="ts-form-grid">
                      <div className="form-group ts-full">
                        <label className="ts-label">Division</label>
                        <input type="text" className="ts-input" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
                      </div>
                    </div>

                    {['A', 'B'].map((side) => (
                      <div key={side} style={{ marginTop: 14 }}>
                        <h3 className="ts-card-title" style={{ fontSize: 15 }}>
                          {side === 'A' ? `${m.team_a?.name} (Đỏ)` : `${m.team_b?.name} (Xanh)`}
                        </h3>
                        {tasks.map((t) => (
                          <div key={t.id} className="ts-form-row" style={{ marginBottom: 8 }}>
                            <label className="ts-label">{t.name} {t.scoring_type !== 'count' ? `(0-${t.max_score})` : ''}</label>
                            {taskInput(side, m, t)}
                          </div>
                        ))}
                        <div className="ts-form-row">
                          <label className="ts-label">Số lần chạy lại</label>
                          <input type="number" min="0" className="ts-input" value={side === 'A' ? form.retryCountA : form.retryCountB}
                            onChange={(e) => setForm({ ...form, [side === 'A' ? 'retryCountA' : 'retryCountB']: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Points lost</label>
                          <input type="number" min="0" className="ts-input" value={side === 'A' ? form.pointsLostA : form.pointsLostB}
                            onChange={(e) => setForm({ ...form, [side === 'A' ? 'pointsLostA' : 'pointsLostB']: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Total duration (giây)</label>
                          <input type="number" min="0" className="ts-input" value={side === 'A' ? form.durationA : form.durationB}
                            onChange={(e) => setForm({ ...form, [side === 'A' ? 'durationA' : 'durationB']: e.target.value })} />
                          {(side === 'A' ? form.durationA : form.durationB) && (
                            <div className="ts-hint">≈ {formatSecondsAsMinutes(side === 'A' ? form.durationA : form.durationB)} phút</div>
                          )}
                        </div>
                        <div className="ts-count-calc">Points scored: <strong>{computeScore(side)}</strong></div>
                      </div>
                    ))}

                    <div className="ts-bigbtns" style={{ gridTemplateColumns: '1fr 1fr auto', marginTop: 16 }}>
                      <button type="button" className={`ts-bigbtn ts-bigbtn-pass ${form.winner_id === m.team_a_id && !form.is_draw ? 'selected' : ''}`}
                        onClick={() => setForm({ ...form, winner_id: m.team_a_id, is_draw: false })}>
                        {m.team_a?.name} thắng
                      </button>
                      <button type="button" className={`ts-bigbtn ts-bigbtn-pass ${form.winner_id === m.team_b_id && !form.is_draw ? 'selected' : ''}`}
                        onClick={() => setForm({ ...form, winner_id: m.team_b_id, is_draw: false })}>
                        {m.team_b?.name} thắng
                      </button>
                      <button type="button" className={`ts-bigbtn ts-bigbtn-fail ${form.is_draw ? 'selected' : ''}`}
                        onClick={() => setForm({ ...form, is_draw: true, winner_id: '' })}>
                        Hòa
                      </button>
                    </div>

                    <div className="ts-footer">
                      <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setOpenId(null)}>Đóng</button>
                      <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={() => submit(m)} disabled={submitting}>
                        {submitting ? 'Đang lưu...' : '✓ Lưu điểm trận đấu'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
