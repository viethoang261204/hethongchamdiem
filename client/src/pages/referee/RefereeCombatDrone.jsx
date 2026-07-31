import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import SignatureBox from '../../components/SignaturePad';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const emptyPenalty = () => [{ score: '', time: '' }, { score: '', time: '' }, { score: '', time: '' }];

// Chấm điểm nội dung content_format = 'combat_drone' (Fly Smart Cup) — theo
// mẫu "Scoring Sheet of Drone Cup": hiệp 1/2, đá luân lưu, đội thắng.
export default function RefereeCombatDrone() {
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
    api.getCombatMatches(contentId).then(setMatches).catch(() => setMatches([])).finally(() => setLoading(false));
  };
  useEffect(load, [contentId]);

  const openMatch = (m) => {
    if (openId === m.id) { setOpenId(null); return; }
    const d = m.details || {};
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
    setOpenId(m.id);
  };

  const submit = async (m) => {
    setSubmitting(true);
    try {
      await api.putCombatMatch(m.id, {
        details: {
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

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Fly Smart Cup — Đối kháng</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Chọn 1 trận để nhập điểm hiệp 1/2, đá luân lưu (nếu có) và đội thắng.</p>

      {matches.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>Chưa có trận nào — vui lòng liên hệ admin.</div>
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

                    <div className="ts-count-box" style={{ marginTop: 12 }}>
                      <div className="ts-count-label">Hiệp 1 — {m.team_a?.name} (Đỏ)</div>
                      <input type="number" className="ts-input ts-input-lg" value={form.firstHalfA} onChange={(e) => setForm({ ...form, firstHalfA: e.target.value })} />
                    </div>
                    <div className="ts-count-box">
                      <div className="ts-count-label">Hiệp 1 — {m.team_b?.name} (Xanh)</div>
                      <input type="number" className="ts-input ts-input-lg" value={form.firstHalfB} onChange={(e) => setForm({ ...form, firstHalfB: e.target.value })} />
                    </div>
                    <div className="ts-count-box">
                      <div className="ts-count-label">Hiệp 2 — {m.team_a?.name} (Đỏ)</div>
                      <input type="number" className="ts-input ts-input-lg" value={form.secondHalfA} onChange={(e) => setForm({ ...form, secondHalfA: e.target.value })} />
                    </div>
                    <div className="ts-count-box">
                      <div className="ts-count-label">Hiệp 2 — {m.team_b?.name} (Xanh)</div>
                      <input type="number" className="ts-input ts-input-lg" value={form.secondHalfB} onChange={(e) => setForm({ ...form, secondHalfB: e.target.value })} />
                    </div>

                    <label className="ts-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <input type="checkbox" checked={form.penaltyShootout} onChange={(e) => setForm({ ...form, penaltyShootout: e.target.checked })} style={{ width: 'auto' }} />
                      Đá luân lưu (Penalty Shootout)
                    </label>

                    {form.penaltyShootout && (
                      <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginTop: 8 }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <input type="number" className="ts-input" placeholder={`Đỏ — điểm lượt ${i + 1}`} value={form.penaltyA[i]?.score ?? ''}
                              onChange={(e) => setForm((f) => { const a = [...f.penaltyA]; a[i] = { ...a[i], score: e.target.value }; return { ...f, penaltyA: a }; })} />
                            <input type="text" className="ts-input" placeholder="Thời gian" value={form.penaltyA[i]?.time ?? ''}
                              onChange={(e) => setForm((f) => { const a = [...f.penaltyA]; a[i] = { ...a[i], time: e.target.value }; return { ...f, penaltyA: a }; })} />
                            <input type="number" className="ts-input" placeholder={`Xanh — điểm lượt ${i + 1}`} value={form.penaltyB[i]?.score ?? ''}
                              onChange={(e) => setForm((f) => { const b = [...f.penaltyB]; b[i] = { ...b[i], score: e.target.value }; return { ...f, penaltyB: b }; })} />
                            <input type="text" className="ts-input" placeholder="Thời gian" value={form.penaltyB[i]?.time ?? ''}
                              onChange={(e) => setForm((f) => { const b = [...f.penaltyB]; b[i] = { ...b[i], time: e.target.value }; return { ...f, penaltyB: b }; })} />
                          </div>
                        ))}
                      </div>
                    )}

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

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <h3 className="ts-card-title" style={{ fontSize: 15, marginBottom: 8 }}>Xác nhận điểm</h3>
                      <div className="ts-form-grid">
                        <div className="ts-form-row">
                          <label className="ts-label">Học sinh/đội trưởng — Đỏ ({m.team_a?.name})</label>
                          <input type="text" className="ts-input" value={form.teamMembersA} onChange={(e) => setForm({ ...form, teamMembersA: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Học sinh/đội trưởng — Xanh ({m.team_b?.name})</label>
                          <input type="text" className="ts-input" value={form.teamMembersB} onChange={(e) => setForm({ ...form, teamMembersB: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <SignatureBox label={`Chữ ký đội Đỏ`} value={form.studentSigImageA} onChange={(v) => setForm({ ...form, studentSigImageA: v })} />
                        </div>
                        <div className="ts-form-row">
                          <SignatureBox label={`Chữ ký đội Xanh`} value={form.studentSigImageB} onChange={(v) => setForm({ ...form, studentSigImageB: v })} />
                        </div>
                        <div className="ts-form-row">
                          <label className="ts-label">Tên trọng tài</label>
                          <input type="text" className="ts-input" value={form.refereeSignature} onChange={(e) => setForm({ ...form, refereeSignature: e.target.value })} />
                        </div>
                        <div className="ts-form-row">
                          <SignatureBox label="Chữ ký trọng tài" value={form.refereeSigImage} onChange={(v) => setForm({ ...form, refereeSigImage: v })} />
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
