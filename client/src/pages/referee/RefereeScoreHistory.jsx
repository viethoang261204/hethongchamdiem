import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import './RefereeLayout.css';

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function RefereeScoreHistory() {
  const { user } = useAuth();
  const [scores, setScores] = useState([]);
  const [contentNames, setContentNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      api.getScores({ refereeId: user.id }),
      api.getCompetitions().then((comps) =>
        Promise.all(comps.map((c) => api.getContents(c.id))).then((arrays) => {
          const map = {};
          arrays.flat().forEach((x) => { map[x.id] = x.name; });
          return map;
        })
      ),
    ])
      .then(([list, names]) => {
        setScores(list);
        setContentNames(names || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(scores, 10);

  if (loading) return <p className="referee-page-title">Đang tải...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Lịch sử nhập điểm</h1>
        <p className="referee-page-subtitle">Danh sách tất cả các phiếu điểm bạn đã thực hiện chấm và gửi lên hệ thống.</p>
      </div>

      {scores.length === 0 ? (
        <div className="card referee-empty-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
          </svg>
          <p>Bạn chưa gửi phiếu điểm nào.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="bxh-table">
              <thead>
                <tr>
                  <th>Thời gian nộp</th>
                  <th>Đội thi</th>
                  <th>Nội dung</th>
                  <th>Lượt thi</th>
                  <th>Điểm số</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.submitted_at)}</td>
                    <td><strong style={{ color: '#ffffff' }}>{s.team?.name || '—'}</strong></td>
                    <td>{contentNames[s.contest_content_id] || s.contest_content_id}</td>
                    <td><span className="meta-badge">Lượt {s.round || 1}</span></td>
                    <td><strong style={{ color: '#38bdf8', fontSize: 16 }}>{s.score ?? '-'}đ</strong></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/referee/history/${s.id}`} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13, minHeight: 34 }}>
                        Xem phiếu điểm →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px' }}>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
          </div>
        </div>
      )}
    </div>
  );
}
