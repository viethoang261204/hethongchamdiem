import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import './RefereeLayout.css';

export default function RefereeTeams() {
  const { competitionId, contentId, region } = useParams();
  const [teams, setTeams] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | done | pending

  useEffect(() => {
    Promise.all([
      api.getTeams(contentId).catch(() => []),
      api.getStudents().catch(() => []),
      api.getScores({ contestContentId: contentId }).catch(() => []),
    ]).then(([teamsList, st, sc]) => {
      setTeams(teamsList);
      setStudents(st);
      setScores(sc);
    }).catch(console.error).finally(() => setLoading(false));
  }, [contentId, region]);

  // Map team_id -> scores
  const scoresByTeam = useMemo(() => {
    const m = {};
    scores.forEach(s => { (m[s.team_id] ||= []).push(s); });
    return m;
  }, [scores]);

  const filtered = useMemo(() => {
    let l = teams;
    if (filter === 'done') l = l.filter(t => (scoresByTeam[t.id] || []).length > 0);
    if (filter === 'pending') l = l.filter(t => !(scoresByTeam[t.id] || []).length);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(t => (t.name || '').toLowerCase().includes(s));
    }
    return l;
  }, [teams, filter, search, scoresByTeam]);

  const stats = useMemo(() => {
    const done = teams.filter(t => (scoresByTeam[t.id] || []).length > 0).length;
    return { total: teams.length, done, pending: teams.length - done };
  }, [teams, scoresByTeam]);

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải...</p>;

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Danh sách đội</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Ấn vào từng đội để chấm điểm.</p>

      {/* Stats */}
      <div className="rt-stats">
        <div className="rt-stat">
          <div className="rt-stat-value">{stats.total}</div>
          <div className="rt-stat-label">Tổng đội</div>
        </div>
        <div className="rt-stat rt-stat-done">
          <div className="rt-stat-value">{stats.done}</div>
          <div className="rt-stat-label">Đã chấm</div>
        </div>
        <div className="rt-stat rt-stat-pending">
          <div className="rt-stat-value">{stats.pending}</div>
          <div className="rt-stat-label">Chưa chấm</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Tìm theo tên đội..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          <option value="pending">Chưa chấm</option>
          <option value="done">Đã chấm</option>
        </select>
      </div>

      {/* Team grid */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          {teams.length === 0 ? 'Chưa có đội nào trong nội dung này.' : 'Không tìm thấy đội phù hợp.'}
        </div>
      ) : (
        <div className="referee-grid">
          {filtered.map((t) => {
            const mems = (t.student_ids || []).map(sid => students.find(s => s.id === sid)).filter(Boolean);
            const teamScores = scoresByTeam[t.id] || [];
            const isDone = teamScores.length > 0;
            const lastScore = teamScores[0];
            return (
              <Link
                key={t.id}
                to={`/referee/competition/${competitionId}/content/${contentId}/region/${region}/team/${t.id}/score`}
                className={`referee-card ${isDone ? 'is-done' : ''}`}
              >
                <div className="referee-card-head">
                  <h3>{t.name}</h3>
                  {isDone && <span className="rt-badge rt-badge-done">✓ Đã chấm</span>}
                </div>
                <p className="referee-card-members">
                  {mems.length > 0 ? mems.map(m => m.full_name).join(', ') : <em style={{ color: '#475569' }}>Chưa có thành viên</em>}
                </p>
                {isDone && lastScore && (
                  <div className="referee-card-foot">
                    <span>Điểm: <strong>{lastScore.score ?? '-'}</strong></span>
                    {lastScore.time && <span>· {lastScore.time}</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
