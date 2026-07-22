import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi } from '../../apiCache';
import { formatSecondsAsMinutes } from '../../lib/time';
import './RefereeLayout.css';

const capi = createCachedApi(api);

export default function RefereeTeams() {
  const { competitionId, contentId, region } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [boards, setBoards] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | done | pending

  useEffect(() => {
    Promise.all([
      capi.getTeams(contentId).catch(() => []),
      capi.getStudents().catch(() => []),
      api.getScores({ contestContentId: contentId }).catch(() => []), // scores không cache vì cần fresh
      capi.getBoards(contentId).catch(() => []),
    ]).then(([teamsList, st, sc, bd]) => {
      setTeams(teamsList);
      setStudents(st);
      setScores(sc);
      setBoards(bd);
    }).catch(console.error).finally(() => setLoading(false));
  }, [contentId, region]);

  // Đang xem 1 bảng đấu cụ thể (region = board id) hay tất cả (region = 'all')
  const currentBoard = region && region !== 'all' ? boards.find(b => b.id === region) : null;

  const teamsInBoard = useMemo(() => {
    if (!region || region === 'all') return teams;
    return teams.filter(t => t.board_id === region);
  }, [teams, region]);

  // Map team_id -> scores
  const scoresByTeam = useMemo(() => {
    const m = {};
    scores.forEach(s => { (m[s.team_id] ||= []).push(s); });
    return m;
  }, [scores]);

  const filtered = useMemo(() => {
    let l = teamsInBoard;
    if (filter === 'done') l = l.filter(t => (scoresByTeam[t.id] || []).length > 0);
    if (filter === 'pending') l = l.filter(t => !(scoresByTeam[t.id] || []).length);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(t => (t.name || '').toLowerCase().includes(s));
    }
    return l;
  }, [teamsInBoard, filter, search, scoresByTeam]);

  const stats = useMemo(() => {
    const done = teamsInBoard.filter(t => (scoresByTeam[t.id] || []).length > 0).length;
    return { total: teamsInBoard.length, done, pending: teamsInBoard.length - done };
  }, [teamsInBoard, scoresByTeam]);

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải...</p>;

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">
        Danh sách đội{currentBoard ? ` — ${currentBoard.name}${currentBoard.age_group ? ` (${currentBoard.age_group})` : ''}` : ''}
      </h1>
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
          {teamsInBoard.length === 0 ? `Chưa có đội nào trong ${currentBoard ? 'bảng đấu' : 'nội dung'} này.` : 'Không tìm thấy đội phù hợp.'}
        </div>
      ) : (
        <div className="referee-grid">
          {filtered.map((t) => {
            const mems = (t.student_ids || []).map(sid => students.find(s => s.id === sid)).filter(Boolean);
            const memberNames = mems.map(m => m.full_name).join(', ');
            const teamScores = scoresByTeam[t.id] || [];
            const isDone = teamScores.length > 0;
            const lastScore = teamScores[0];
            const scoreUrl = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/team/${t.id}/score`;
            return (
              <Link
                key={t.id}
                to={scoreUrl}
                state={{ memberNames }}
                className={`referee-card ${isDone ? 'is-done' : ''}`}
              >
                <div className="referee-card-head">
                  <h3>{t.name}</h3>
                  {isDone && <span className="rt-badge rt-badge-done">✓ Đã chấm</span>}
                </div>
                {t.boards?.name && (
                  <p className="referee-card-members" style={{ color: '#60a5fa', fontWeight: 600 }}>
                    {t.boards.name}{t.boards.age_group ? ` — ${t.boards.age_group}` : ''}
                  </p>
                )}
                <p className="referee-card-members">
                  {mems.length > 0 ? memberNames : <em style={{ color: '#475569' }}>Chưa có thành viên</em>}
                </p>
                {isDone && lastScore && (
                  <div className="referee-card-foot">
                    <span>Điểm: <strong>{lastScore.score ?? '-'}</strong> · Ấn để xem phiếu</span>
                    {lastScore.time && <span>· {formatSecondsAsMinutes(lastScore.time)}</span>}
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
