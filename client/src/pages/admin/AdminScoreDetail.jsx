import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import ScoreDetailView from '../shared/ScoreDetailView';
import './AdminLayout.css';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminScoreDetail() {
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
            setContent(contents.find(x => x.id === data.contestContentId) || null);
          } catch (_) {}
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scoreId]);

  if (loading) return <div className="nhutin-admin"><p>Đang tải...</p></div>;
  if (!score) return <div className="nhutin-admin"><p>Không tìm thấy phiếu điểm.</p></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Chi tiết phiếu điểm</h1>
          <p className="page-subtitle">
            {score.team?.name || '-'} · {content?.name || score.contestContentId} · Nộp lúc {formatDate(score.submittedAt)}
          </p>
        </div>
      </div>

      <ScoreDetailView
        score={score}
        content={content}
        backLink={
          <Link to="/admin/scores" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← Quay lại danh sách
          </Link>
        }
      />
    </div>
  );
}
