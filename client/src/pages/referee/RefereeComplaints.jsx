import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import './RefereeLayout.css';

const STATUS_LABEL = {
  pending: { label: 'Đang chờ', className: 'rt-badge-pending' },
  resolved: { label: 'Đã xử lý', className: 'rt-badge-done' },
  rejected: { label: 'Từ chối', className: 'rt-badge-rejected' },
};

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

// "Khiếu nại bảng điểm" — trọng tài chọn 1 phiếu điểm (đo lường) hoặc 1 trận
// đối kháng đã chấm, gửi yêu cầu khiếu nại kèm lý do; admin xử lý ở
// /admin/complaints. Đây là luồng riêng, không phải ô "Kiến nghị" đã có sẵn
// ngay trên phiếu điểm (ô đó chỉ là ghi chú, không ai theo dõi xử lý).
export default function RefereeComplaints() {
  const { user } = useAuth();
  const { showAlert } = useNotify();

  const [myScores, setMyScores] = useState([]);
  const [contentNames, setContentNames] = useState({});
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  const [targetType, setTargetType] = useState('score'); // score | combat
  const [scoreId, setScoreId] = useState('');

  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [combatContents, setCombatContents] = useState([]);
  const [contentId, setContentId] = useState('');
  const [combatMatches, setCombatMatches] = useState([]);
  const [combatMatchId, setCombatMatchId] = useState('');
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!user?.id) return;
    setLoading(true);
    Promise.all([
      api.getScores({ refereeId: user.id }),
      api.getCompetitions().then((comps) =>
        Promise.all(comps.map((c) => api.getContents(c.id))).then((arrays) => {
          const map = {};
          arrays.flat().forEach((x) => { map[x.id] = x.name; });
          return map;
        })
      ),
      api.getCompetitions(),
      api.getMyComplaints(),
    ])
      .then(([scores, names, comps, myComplaints]) => {
        setMyScores(scores);
        setContentNames(names || {});
        setCompetitions(comps.filter((c) => c.is_active !== false));
        setComplaints(myComplaints);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, [user?.id]);

  useEffect(() => {
    if (!competitionId) { setCombatContents([]); return; }
    api.getContents(competitionId)
      .then((list) => setCombatContents(list.filter((c) => c.content_format !== 'scoring')))
      .catch(() => setCombatContents([]));
    setContentId('');
    setCombatMatchId('');
  }, [competitionId]);

  useEffect(() => {
    if (!contentId) { setCombatMatches([]); return; }
    setMatchesLoading(true);
    api.getCombatMatches(contentId)
      .then(setCombatMatches)
      .catch(() => setCombatMatches([]))
      .finally(() => setMatchesLoading(false));
    setCombatMatchId('');
  }, [contentId]);

  const submit = async () => {
    if (targetType === 'score' && !scoreId) { showAlert('Chọn 1 phiếu điểm để khiếu nại.', 'error'); return; }
    if (targetType === 'combat' && !combatMatchId) { showAlert('Chọn 1 trận đối kháng để khiếu nại.', 'error'); return; }
    if (!message.trim()) { showAlert('Nhập lý do khiếu nại.', 'error'); return; }

    setSubmitting(true);
    try {
      await api.postComplaint({
        score_id: targetType === 'score' ? scoreId : undefined,
        combat_match_id: targetType === 'combat' ? combatMatchId : undefined,
        message: message.trim(),
      });
      showAlert('Đã gửi khiếu nại.', 'success');
      setScoreId(''); setCombatMatchId(''); setMessage('');
      load();
    } catch (e) {
      showAlert(e.message || 'Lỗi khi gửi khiếu nại.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const { pageItems: complaintsPage, page, setPage, pageCount, totalItems, pageSize } = usePagination(complaints, 10);

  if (loading) return <p className="referee-page-title">Đang tải...</p>;

  return (
    <div>
      <h1 className="referee-page-title">Khiếu nại bảng điểm</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>Gửi yêu cầu khiếu nại về 1 phiếu điểm đã chấm — admin sẽ xem và phản hồi.</p>

      <div className="ts-card" style={{ marginBottom: 24 }}>
        <h3 className="ts-card-title" style={{ marginBottom: 12 }}>Gửi khiếu nại mới</h3>

        <div className="ts-bigbtns" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
          <button type="button" className={`ts-bigbtn ts-bigbtn-pass ${targetType === 'score' ? 'selected' : ''}`} onClick={() => setTargetType('score')}>
            Phiếu điểm đo lường
          </button>
          <button type="button" className={`ts-bigbtn ts-bigbtn-pass ${targetType === 'combat' ? 'selected' : ''}`} onClick={() => setTargetType('combat')}>
            Trận đối kháng
          </button>
        </div>

        {targetType === 'score' ? (
          <div className="form-group">
            <label className="ts-label">Chọn phiếu điểm</label>
            <select className="ts-input form-select" value={scoreId} onChange={(e) => setScoreId(e.target.value)}>
              <option value="">-- Chọn phiếu điểm --</option>
              {myScores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.team?.name || '—'} · {contentNames[s.contest_content_id] || s.contest_content_id} · Lượt {s.round} · {formatDate(s.submitted_at)}
                </option>
              ))}
            </select>
            {myScores.length === 0 && <div className="ts-hint">Bạn chưa gửi phiếu điểm nào.</div>}
          </div>
        ) : (
          <>
            <div className="ts-form-grid">
              <div className="ts-form-row">
                <label className="ts-label">Cuộc thi</label>
                <select className="ts-input form-select" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
                  <option value="">-- Chọn cuộc thi --</option>
                  {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="ts-form-row">
                <label className="ts-label">Nội dung đối kháng</label>
                <select className="ts-input form-select" value={contentId} onChange={(e) => setContentId(e.target.value)} disabled={!competitionId}>
                  <option value="">-- Chọn nội dung --</option>
                  {combatContents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="ts-label">Chọn trận đấu</label>
              <select className="ts-input form-select" value={combatMatchId} onChange={(e) => setCombatMatchId(e.target.value)} disabled={!contentId || matchesLoading}>
                <option value="">{matchesLoading ? 'Đang tải...' : '-- Chọn trận --'}</option>
                {combatMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.team_a?.name || '—'} vs {m.team_b?.name || '—'}{m.stage ? ` · ${m.stage}` : ''}
                  </option>
                ))}
              </select>
              {contentId && !matchesLoading && combatMatches.length === 0 && <div className="ts-hint">Nội dung này chưa có trận nào.</div>}
            </div>
          </>
        )}

        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="ts-label">Lý do khiếu nại</label>
          <textarea className="ts-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mô tả cụ thể vấn đề bạn muốn khiếu nại..." />
        </div>

        <div className="ts-footer">
          <button type="button" className="ts-btn ts-btn-primary ts-btn-lg" onClick={submit} disabled={submitting}>
            {submitting ? 'Đang gửi...' : '✓ Gửi khiếu nại'}
          </button>
        </div>
      </div>

      <h3 className="ts-card-title" style={{ marginBottom: 12 }}>Khiếu nại đã gửi ({complaints.length})</h3>
      {complaints.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Bạn chưa gửi khiếu nại nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {complaintsPage.map((c) => {
            const st = STATUS_LABEL[c.status] || STATUS_LABEL.pending;
            return (
              <div className="ts-card" key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong style={{ color: '#f1f5f9' }}>{c.team_name || '—'}</strong>
                    <div style={{ color: '#64748b', fontSize: 13 }}>{c.content_name}{c.score_round ? ` · Lượt ${c.score_round}` : ''} · {formatDate(c.created_at)}</div>
                  </div>
                  <span className={`rt-badge ${st.className}`}>{st.label}</span>
                </div>
                <p style={{ marginTop: 10, color: '#cbd5e1', fontSize: 14 }}>{c.message}</p>
                {c.status !== 'pending' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 13, color: '#94a3b8' }}>
                    Phản hồi từ admin: {c.resolution_note || '(không có ghi chú)'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
    </div>
  );
}
