import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes } from '../../lib/time';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const DEFAULT_BONUS_CONFIG = { label: 'Extra reward', base: 40, per_retry: 10 };

// Chấm điểm nội dung content_format = 'combat_stars' (Battle of Stars) — 2 đội
// cùng chấm chung 1 bộ nhiệm vụ (tái dùng tasks của nội dung), điểm thưởng
// theo bonus_config, Points lost nhập tay, Total duration. Đội thắng/hòa được
// TÍNH TỰ ĐỘNG từ điểm ghi được của 2 đội — trọng tài không tự chọn.
export default function RefereeCombatStars() {
  const { competitionId, contentId } = useParams();
  const { user } = useAuth();
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
      teamMembersA: d.teamMembersA || '', teamMembersB: d.teamMembersB || '',
      studentSigImageA: d.studentSignatureImageA || '', studentSigImageB: d.studentSignatureImageB || '',
      refereeSignature: d.refereeSignature || user?.fullName || user?.username || '',
      refereeSigImage: d.refereeSignatureImage || '',
      headRefereeName: d.headRefereeName || 'Mr Ly Quang Van',
      scorekeeperName: d.scorekeeperName || user?.fullName || user?.username || '',
      remarks: d.remarks || '', objection: d.objection || '',
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
    if (!form.studentSigImageA || !form.studentSigImageB || !form.refereeSigImage) {
      showAlert('Please collect signatures from both teams and the referee before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const scoreA = computeScore('A');
      const scoreB = computeScore('B');
      const winner_id = scoreA > scoreB ? m.team_a_id : scoreB > scoreA ? m.team_b_id : null;
      await api.putCombatMatch(m.id, {
        details: {
          division: form.division || null,
          taskScoresA: form.taskScoresA, taskQtyA: form.taskQtyA,
          taskScoresB: form.taskScoresB, taskQtyB: form.taskQtyB,
          retryCountA: Number(form.retryCountA) || 0, retryCountB: Number(form.retryCountB) || 0,
          pointsLostA: Number(form.pointsLostA) || 0, pointsLostB: Number(form.pointsLostB) || 0,
          durationA: form.durationA || null, durationB: form.durationB || null,
          teamMembersA: form.teamMembersA || null, teamMembersB: form.teamMembersB || null,
          studentSignatureImageA: form.studentSigImageA || null, studentSignatureImageB: form.studentSigImageB || null,
          refereeSignature: form.refereeSignature || null,
          refereeSignatureImage: form.refereeSigImage || null,
          headRefereeName: form.headRefereeName || null,
          scorekeeperName: form.scorekeeperName || null,
          remarks: form.remarks || null, objection: form.objection || null,
        },
        winner_id,
        is_draw: scoreA === scoreB,
      });
      showAlert('Match score saved.', 'success');
      setOpenId(null);
      load();
    } catch (e) {
      showAlert(e.message || 'Failed to save.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Loading...</p>;

  const taskInput = (side, t) => {
    const scores = side === 'A' ? form.taskScoresA : form.taskScoresB;
    const qty = side === 'A' ? form.taskQtyA : form.taskQtyB;
    if (t.scoring_type === 'count') {
      return (
        <input
          type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
          value={qty?.[t.id] ?? 0}
          onChange={(e) => setQty(side, t, Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
      );
    }
    return (
      <input
        type="number" min="0" max={t.max_score} className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
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
      <h1 className="referee-page-title">Battle of Stars — Combat</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Select a match to score tasks for both teams. The win/draw result is calculated automatically from the scores.</p>

      {matches.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>No matches yet — please contact the admin.</div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>This content has no tasks yet — please contact the admin.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matches.map((m) => {
            const isOpen = openId === m.id;
            const done = !!m.winner_id || m.is_draw;
            const scoreA = isOpen ? computeScore('A') : null;
            const scoreB = isOpen ? computeScore('B') : null;
            const resultText = isOpen
              ? (scoreA === scoreB ? `Draw (${scoreA} - ${scoreB})`
                : scoreA > scoreB ? `${m.team_a?.name} wins (${scoreA} - ${scoreB})`
                : `${m.team_b?.name} wins (${scoreA} - ${scoreB})`)
              : '';

            return (
              <div className="ts-card" key={m.id} style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                  onClick={() => openMatch(m)} role="button">
                  <strong style={{ color: '#f1f5f9', fontSize: 14 }}>
                    {m.team_a?.name || '—'} <span style={{ color: '#64748b' }}>vs</span> {m.team_b?.name || '—'}
                  </strong>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {m.stage && <span className="ts-board-chip">{m.stage}</span>}
                    {done && (
                      <span className="rt-badge rt-badge-done">
                        {m.is_draw ? 'Draw' : `Winner: ${m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}`}
                      </span>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 12 }}>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label className="form-label" style={{ marginBottom: 2 }}>Division</label>
                      <input type="text" className="form-input" style={{ maxWidth: 240 }} value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
                    </div>

                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Task</th>
                            <th style={{ textAlign: 'center' }}>{m.team_a?.name} (Red)</th>
                            <th style={{ textAlign: 'center' }}>{m.team_b?.name} (Blue)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tasks.map((t) => (
                            <tr key={t.id}>
                              <td style={{ fontSize: 13 }}>{t.name} <span style={{ color: '#94a3b8' }}>{t.scoring_type === 'count' ? `(Qty × ${t.max_score})` : `(0-${t.max_score})`}</span></td>
                              <td style={{ textAlign: 'center' }}>{taskInput('A', t)}</td>
                              <td style={{ textAlign: 'center' }}>{taskInput('B', t)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td style={{ fontSize: 13 }}>Reruns</td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                                value={form.retryCountA} onChange={(e) => setForm({ ...form, retryCountA: e.target.value })} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                                value={form.retryCountB} onChange={(e) => setForm({ ...form, retryCountB: e.target.value })} />
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontSize: 13 }}>Points lost</td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                                value={form.pointsLostA} onChange={(e) => setForm({ ...form, pointsLostA: e.target.value })} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" min="0" className="form-input" style={{ textAlign: 'center', padding: '4px 6px' }}
                                value={form.pointsLostB} onChange={(e) => setForm({ ...form, pointsLostB: e.target.value })} />
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
                            <td style={{ fontSize: 13 }}>Score</td>
                            <td style={{ textAlign: 'center' }}>{scoreA}</td>
                            <td style={{ textAlign: 'center' }}>{scoreB}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#4ade80' }}>
                      Result (auto-calculated): {resultText}
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <h3 className="ts-card-title" style={{ fontSize: 15, marginBottom: 8 }}>Score Confirmation</h3>
                      <div className="ts-form-grid">
                        <div className="ts-form-row">
                          <label className="ts-label">Student / Team Captain — Red ({m.team_a?.name})</label>
                          <input type="text" className="ts-input" value={form.teamMembersA} onChange={(e) => setForm({ ...form, teamMembersA: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Student / Team Captain — Blue ({m.team_b?.name})</label>
                          <input type="text" className="ts-input" value={form.teamMembersB} onChange={(e) => setForm({ ...form, teamMembersB: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <SignatureBox label="Red Team Signature" value={form.studentSigImageA} onChange={(v) => setForm({ ...form, studentSigImageA: v })} />
                        </div>
                        <div className="ts-form-row">
                          <SignatureBox label="Blue Team Signature" value={form.studentSigImageB} onChange={(v) => setForm({ ...form, studentSigImageB: v })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Referee Name</label>
                          <input type="text" className="ts-input" value={form.refereeSignature} onChange={(e) => setForm({ ...form, refereeSignature: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <SignatureBox label="Referee Signature" value={form.refereeSigImage} onChange={(v) => setForm({ ...form, refereeSigImage: v })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Chief Referee</label>
                          <input type="text" className="ts-input" value={form.headRefereeName} onChange={(e) => setForm({ ...form, headRefereeName: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Scorekeeper</label>
                          <input type="text" className="ts-input" value={form.scorekeeperName} onChange={(e) => setForm({ ...form, scorekeeperName: e.target.value })} />
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
                    </div>

                    <div className="ts-footer">
                      <button type="button" className="ts-btn ts-btn-ghost" onClick={() => setOpenId(null)}>Close</button>
                      <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={() => submit(m)} disabled={submitting}>
                        {submitting ? 'Saving...' : '✓ Save Match Score'}
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
