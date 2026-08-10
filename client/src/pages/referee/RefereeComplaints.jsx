import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import './RefereeLayout.css';

const STATUS_LABEL = {
  pending: { label: 'Đang chờ xử lý', className: 'rt-badge-pending' },
  resolved: { label: 'Đã xử lý ✓', className: 'rt-badge-done' },
  rejected: { label: 'Đã từ chối ✗', className: 'rt-badge-rejected' },
};

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

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
    if (targetType === 'score' && !scoreId) { showAlert('Vui lòng chọn 1 phiếu điểm để khiếu nại.', 'error'); return; }
    if (targetType === 'combat' && !combatMatchId) { showAlert('Vui lòng chọn 1 trận đối kháng để khiếu nại.', 'error'); return; }
    if (!message.trim()) { showAlert('Vui lòng nhập lý do khiếu nại.', 'error'); return; }

    setSubmitting(true);
    try {
      await api.postComplaint({
        score_id: targetType === 'score' ? scoreId : undefined,
        combat_match_id: targetType === 'combat' ? combatMatchId : undefined,
        message: message.trim(),
      });
      showAlert('Đã gửi yêu cầu khiếu nại thành công.', 'success');
      setScoreId(''); setCombatMatchId(''); setMessage('');
      load();
    } catch (e) {
      showAlert(e.message || 'Lỗi khi gửi khiếu nại.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const { pageItems: complaintsPage, page, setPage, pageCount, totalItems, pageSize } = usePagination(complaints, 10);

  if (loading) return (
    <div className="referee-loading-container">
      <div className="ts-spinner" />
      <p>Đang tải dữ liệu khiếu nại...</p>
    </div>
  );

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Khiếu nại bảng điểm</h1>
        <p className="referee-page-subtitle">Gửi yêu cầu khiếu nại trực tiếp về phiếu điểm hoặc trận đấu — Ban quản trị sẽ xem xét và phản hồi.</p>
      </div>

      {/* Form Tạo khiếu nại mới */}
      <div className="card referee-form-card">
        <div className="card-header">
          <h2 className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Gửi yêu cầu khiếu nại mới
          </h2>
        </div>

        {/* Modern Segmented Tab Bar */}
        <div className="tab-segmented">
          <button
            type="button"
            className={`tab-item ${targetType === 'score' ? 'active' : ''}`}
            onClick={() => setTargetType('score')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Phiếu điểm đo lường
          </button>
          <button
            type="button"
            className={`tab-item ${targetType === 'combat' ? 'active' : ''}`}
            onClick={() => setTargetType('combat')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Trận đối kháng
          </button>
        </div>

        {targetType === 'score' ? (
          <div className="form-group">
            <label className="form-label">Chọn phiếu điểm cần khiếu nại <span className="required">*</span></label>
            <select className="form-select ts-input" value={scoreId} onChange={(e) => setScoreId(e.target.value)}>
              <option value="">-- Chọn phiếu điểm trong lịch sử --</option>
              {myScores.map((s) => (
                <option key={s.id} value={s.id}>
                  Đội: {s.team?.name || '—'} · {contentNames[s.contest_content_id] || s.contest_content_id} · Lượt {s.round} ({s.score ?? 0}đ) · {formatDate(s.submitted_at)}
                </option>
              ))}
            </select>
            {myScores.length === 0 && <div className="form-hint">Bạn chưa nhập phiếu điểm nào.</div>}
          </div>
        ) : (
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Cuộc thi</label>
              <select className="form-select ts-input" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
                <option value="">-- Chọn cuộc thi --</option>
                {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nội dung đối kháng</label>
              <select className="form-select ts-input" value={contentId} onChange={(e) => setContentId(e.target.value)} disabled={!competitionId}>
                <option value="">-- Chọn nội dung --</option>
                {combatContents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group form-full">
              <label className="form-label">Chọn trận đấu <span className="required">*</span></label>
              <select className="form-select ts-input" value={combatMatchId} onChange={(e) => setCombatMatchId(e.target.value)} disabled={!contentId || matchesLoading}>
                <option value="">{matchesLoading ? 'Đang tải danh sách trận...' : '-- Chọn trận đấu --'}</option>
                {combatMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.team_a?.name || '—'} vs {m.team_b?.name || '—'}{m.stage ? ` · ${m.stage}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Lý do khiếu nại chi tiết <span className="required">*</span></label>
          <textarea
            className="form-input ts-input"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mô tả chi tiết sai sót về điểm số, thời gian, hoặc sự cố trọng tài cần làm rõ..."
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={submitting}>
            {submitting ? 'Đang gửi...' : '✓ Gửi yêu cầu khiếu nại'}
          </button>
        </div>
      </div>

      {/* Danh sách Khiếu nại đã gửi */}
      <div className="referee-section-header">
        <h3 className="referee-section-title">Khiếu nại đã gửi ({complaints.length})</h3>
      </div>

      {complaints.length === 0 ? (
        <div className="card referee-empty-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
          </svg>
          <p>Bạn chưa gửi yêu cầu khiếu nại nào.</p>
        </div>
      ) : (
        <div className="complaints-list">
          {complaintsPage.map((c) => {
            const st = STATUS_LABEL[c.status] || STATUS_LABEL.pending;
            return (
              <div className="card complaint-card" key={c.id}>
                <div className="complaint-card-head">
                  <div>
                    <h4 className="complaint-team">{c.team_name || 'Đội thi / Trận đấu'}</h4>
                    <div className="complaint-meta">
                      <span>{c.content_name}</span>
                      {c.score_round && <span className="meta-badge">Lượt {c.score_round}</span>}
                      <span>• {formatDate(c.created_at)}</span>
                    </div>
                  </div>
                  <span className={`rt-badge ${st.className}`}>{st.label}</span>
                </div>

                <div className="complaint-body">
                  <p>{c.message}</p>
                </div>

                {c.status !== 'pending' && (
                  <div className="complaint-reply">
                    <div className="reply-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      <strong>Phản hồi từ Ban quản trị (Admin):</strong>
                    </div>
                    <p>{c.resolution_note || '(Không có ghi chú thêm)'}</p>
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

