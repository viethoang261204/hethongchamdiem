import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import ScoreDetailView from '../shared/ScoreDetailView';

// Xem phiếu điểm (gộp 2 lượt lên 1 Score Sheet) — giống trang chi tiết của
// trọng tài nhưng chỉ xem, quay lại trang tra cứu trước đó.
export default function ViewerScoreDetail() {
  const { scoreId } = useParams();
  const navigate = useNavigate();
  const [score, setScore] = useState(null);
  const [scores, setScores] = useState(null);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getScore(scoreId)
      .then(async (data) => {
        setScore(data);
        setScores([data]);
        const contentId = data?.contest_content_id || data?.team?.contest_content_id;
        if (contentId) {
          const [allContents, both] = await Promise.all([
            api.getAllContents().catch(() => []),
            data?.team_id ? api.getScores({ teamId: data.team_id, contestContentId: contentId }).catch(() => null) : null,
          ]);
          setContent(allContents.find((x) => x.id === contentId) || null);
          if (both) setScores(both);
        }
      })
      .catch(() => setScore(null))
      .finally(() => setLoading(false));
  }, [scoreId]);

  if (loading) return <p className="referee-page-title">Đang tải phiếu điểm...</p>;
  if (!score) return <p className="referee-page-title">Không tìm thấy phiếu điểm.</p>;

  return (
    <div className="referee-content-wrap">
      <ScoreDetailView
        score={score}
        scores={scores}
        content={content}
        variant="referee"
        backLink={<button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>← Quay lại</button>}
      />
    </div>
  );
}
