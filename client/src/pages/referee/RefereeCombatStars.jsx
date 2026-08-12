import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import { formatSecondsAsMinutes } from '../../lib/time';
import {
  ENERGY_BLOCK_MAX, FIREPOWER_BALL_MAX, ENERGY_BLOCK_SCORE, FIREPOWER_BALL_SCORE, METEOR_TOWER_SCORE,
  computeTaskScore, determineGroupMatchResult,
} from '../../lib/battleScoring';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

// Chấm điểm nội dung content_format = 'combat_stars' (Battle of Stars) — đúng
// luật ENJOY AI 2026: 4 nhiệm vụ cố định (Meteor Tower / Energy Defense /
// Full Firepower / Final Fortress), Extra Reward theo số lần retry, Direct
// Win qua Final Fortress. Kết quả Win/Draw/Loss được TÍNH TỰ ĐỘNG (server là
// nơi có thẩm quyền cuối cùng, tính lại từ `details` khi lưu) — trọng tài
// không tự chọn đội thắng.
export default function RefereeCombatStars() {
  const { competitionId, contentId } = useParams();
  const { user } = useAuth();
  const { showAlert } = useNotify();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api.getCombatMatches(contentId).catch(() => [])
      .then((m) => setMatches(m))
      .finally(() => setLoading(false));
  };
  useEffect(load, [contentId]);

  const openMatch = (m) => {
    if (openId === m.id) { setOpenId(null); return; }
    const d = m.details || {};
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
    setOpenId(m.id);
  };

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

  const clampEnergy = (v) => Math.min(ENERGY_BLOCK_MAX, Math.max(0, parseInt(v, 10) || 0));
  const clampFirepower = (v) => Math.min(FIREPOWER_BALL_MAX, Math.max(0, parseInt(v, 10) || 0));

  const submit = async (m) => {
    if (!form.studentSigImageA || !form.studentSigImageB || !form.refereeSigImage) {
      showAlert('Please collect signatures from both teams and the referee before submitting.', 'error');
      return;
    }
    if (form.directWinA && form.directWinB) {
      showAlert('Only one team can have a Direct Win.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { result } = determineGroupMatchResult(sideData('A'), sideData('B'));
      await api.putCombatMatch(m.id, {
        details: {
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
        },
        // Server sẽ tự tính lại winner_id/is_draw từ details — gửi kèm chỉ để
        // UI phản hồi tức thời, không phải nguồn sự thật cuối cùng.
        winner_id: result === 'A' ? m.team_a_id : result === 'B' ? m.team_b_id : null,
        is_draw: result === 'DRAW',
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

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Battle of Stars — Combat</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Select a match to score both teams. The win/draw result is calculated automatically from the scores.</p>

      {matches.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>No matches yet — please contact the admin.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matches.map((m) => {
            const isOpen = openId === m.id;
            const done = !!m.winner_id || m.is_draw;
            const scoreA = isOpen ? computeTaskScore(sideData('A')) : null;
            const scoreB = isOpen ? computeTaskScore(sideData('B')) : null;
            const outcome = isOpen ? determineGroupMatchResult(sideData('A'), sideData('B')) : null;
            const resultText = isOpen
              ? (form.directWinA ? `${m.team_a?.name} wins — Direct Win (Final Fortress)`
                : form.directWinB ? `${m.team_b?.name} wins — Direct Win (Final Fortress)`
                : outcome.result === 'DRAW' ? `Draw (${scoreA.taskScore} - ${scoreB.taskScore})`
                : outcome.result === 'A' ? `${m.team_a?.name} wins (${scoreA.taskScore} - ${scoreB.taskScore})`
                : `${m.team_b?.name} wins (${scoreA.taskScore} - ${scoreB.taskScore})`)
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
                    {m.group_label && <span className="ts-board-chip">{m.group_label}</span>}
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
                            <td style={{ fontSize: 13 }}>Energy Defense <span style={{ color: '#94a3b8' }}>({ENERGY_BLOCK_SCORE} pts × block, max {ENERGY_BLOCK_MAX})</span></td>
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
                            <td style={{ fontSize: 13 }}>Full Firepower <span style={{ color: '#94a3b8' }}>({FIREPOWER_BALL_SCORE} pts × ball, max {FIREPOWER_BALL_MAX})</span></td>
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
