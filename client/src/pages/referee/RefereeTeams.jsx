import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import './RefereeLayout.css';

export default function RefereeTeams() {
  const { competitionId, contentId, region } = useParams();
  const [teams, setTeams] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getTeams(contentId),
      api.getStudents(),
    ]).then(([teamsList, st]) => {
      setTeams(teamsList.filter(t => (t.region || 'bac') === region));
      setStudents(st);
    }).catch(console.error).finally(() => setLoading(false));
  }, [contentId, region]);

  if (loading) return <p>Đang tải...</p>;

  const backUrl = `/referee`;

  return (
    <div>
      <Link to={backUrl} className="btn-ghost" style={{ display: 'inline-block', marginBottom: 16 }}>
        ← Quay lại chọn cuộc thi
      </Link>
      <div className="breadcrumb" style={{ marginBottom: '1rem' }}>
        <Link to="/referee">Chấm điểm</Link>
        <span> / </span>
        <span>{region === 'trung' ? 'Trung' : region === 'nam' ? 'Nam' : 'Bắc'}</span>
      </div>
      <h1 className="referee-page-title">Danh sách đội</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Ấn vào từng đội để chấm điểm.</p>
      <div className="referee-grid">
        {teams.map((t) => {
          const mems = (t.studentIds || []).map(sid => students.find(s => s.id === sid)).filter(Boolean);
          return (
            <Link
              key={t.id}
              to={`/referee/competition/${competitionId}/content/${contentId}/region/${region}/team/${t.id}/score`}
              className="referee-card"
            >
              <h3>{t.name}</h3>
              <p>{mems.map(m => m.fullName).join(', ')}</p>
            </Link>
          );
        })}
      </div>
      {teams.length === 0 && (
        <div className="card" style={{ padding: '1.5rem' }}>Chưa có đội nào trong vùng này.</div>
      )}
    </div>
  );
}
