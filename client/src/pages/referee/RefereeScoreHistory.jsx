import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
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

  if (loading) return <p className="referee-page-title">Đang tải...</p>;

  return (
    <div>
      <h1 className="referee-page-title">Lịch sử nhập điểm</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>Các phiếu điểm bạn đã gửi.</p>
      {scores.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          Chưa có phiếu điểm nào.
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="bxh-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Thời gian gửi</th>
                  <th>Đội</th>
                  <th>Nội dung</th>
                  <th>Điểm</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.submittedAt)}</td>
                    <td>{s.team?.name || '-'}</td>
                    <td>{contentNames[s.contestContentId] || s.contestContentId}</td>
                    <td><strong>{s.score ?? '-'}</strong></td>
                    <td>
                      <Link to={`/referee/history/${s.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }}>
                        Xem chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
