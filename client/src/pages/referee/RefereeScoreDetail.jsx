import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import './RefereeLayout.css';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function RefereeScoreDetail() {
  const { scoreId } = useParams();
  const [score, setScore] = useState(null);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getScore(scoreId)
      .then(async (data) => {
        setScore(data);
        const compId = data?.team?.competitionId;
        if (compId && data?.contestContentId) {
          try {
            const contents = await api.getContents(compId);
            const c = contents.find(x => x.id === data.contestContentId);
            setContent(c || null);
          } catch (_) {}
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scoreId]);

  if (loading) return <p className="referee-page-title">Đang tải...</p>;
  if (!score) return <p className="referee-page-title">Không tìm thấy phiếu điểm.</p>;

  const fields = content?.scoreSheetTemplate?.fields || [
    { id: 'thoi_gian', label: 'Thời gian' },
    { id: 'diem', label: 'Điểm' },
  ];

  const getValue = (field) => {
    if (field.id === 'thoi_gian') return score.time;
    if (field.id === 'diem') return score.score;
    return score.extraFields?.[field.id];
  };

  return (
    <div>
      <Link to="/referee/history" className="btn-ghost" style={{ display: 'inline-block', marginBottom: 16 }}>
        ← Quay lại lịch sử
      </Link>
      <h1 className="referee-page-title">Chi tiết phiếu điểm</h1>
      <div className="score-form-card">
        <div className="score-form-header">
          <h2 className="score-form-title">{score.team?.name || 'Đội'} · {content?.name || score.contestContentId}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Gửi lúc {formatDate(score.submittedAt)}</p>
        </div>
        <div className="score-form-body">
          <div className="score-form-section">
            <div className="score-section-title">Thông tin điểm</div>
            {fields.map((f) => (
              <div key={f.id} className="form-group">
                <label className="form-label">{f.label}</label>
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10, color: '#1e293b' }}>
                  {typeof getValue(f) === 'boolean' ? (getValue(f) ? 'Có' : 'Không') : (getValue(f) ?? '-')}
                </div>
              </div>
            ))}
          </div>
          <div className="score-form-section">
            <div className="score-section-title">Xác nhận</div>
            <div className="form-group">
              <label className="form-label">Học sinh ký</label>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>{score.studentSignature || '-'}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Trọng tài ký</label>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>{score.refereeSignature || '-'}</div>
            </div>
          </div>
          <div className="form-actions">
            <Link to="/referee/history" className="btn btn-secondary">Quay lại lịch sử</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
