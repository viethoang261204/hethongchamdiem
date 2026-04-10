import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import ScoreDetailView from '../shared/ScoreDetailView';
import './RefereeLayout.css';

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
            setContent(contents.find(x => x.id === data.contestContentId) || null);
          } catch (_) {}
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scoreId]);

  if (loading) return <p className="referee-page-title">Đang tải...</p>;
  if (!score) return <p className="referee-page-title">Không tìm thấy phiếu điểm.</p>;

  return (
    <ScoreDetailView
      score={score}
      content={content}
      backLink={
        <Link to="/referee/history" className="btn-ghost">← Quay lại lịch sử</Link>
      }
    />
  );
}
