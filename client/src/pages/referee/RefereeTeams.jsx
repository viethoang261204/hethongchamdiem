import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi } from '../../apiCache';
import { formatSecondsAsMinutes } from '../../lib/time';
import './RefereeLayout.css';

const capi = createCachedApi(api);

export default function RefereeTeams() {
  const { competitionId, contentId, region } = useParams();
  const [teams, setTeams] = useState([]);
  const [boards, setBoards] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | pending | partial | done

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
  const boardFormatById = useMemo(() => {
    const m = {};
    boards.forEach(b => { m[b.id] = b.ranking_format || 'measurement'; });
    return m;
  }, [boards]);

  const teamsInBoard = useMemo(() => {
    if (!region || region === 'all') return teams;
    return teams.filter(t => t.board_id === region);
  }, [teams, region]);

  // Map team_id -> { 1: score|undefined, 2: score|undefined }
  const scoresByTeam = useMemo(() => {
    const m = {};
    scores.forEach(s => { (m[s.team_id] ||= {})[s.round] = s; });
    return m;
  }, [scores]);

  const roundsDone = (teamId) => Object.keys(scoresByTeam[teamId] || {}).length;

  const filtered = useMemo(() => {
    let l = teamsInBoard;
    if (filter === 'done') l = l.filter(t => roundsDone(t.id) >= 2);
    if (filter === 'partial') l = l.filter(t => roundsDone(t.id) === 1);
    if (filter === 'pending') l = l.filter(t => roundsDone(t.id) === 0);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(t => (t.name || '').toLowerCase().includes(s));
    }
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsInBoard, filter, search, scoresByTeam]);

  const stats = useMemo(() => {
    let done = 0, partial = 0, pending = 0;
    teamsInBoard.forEach(t => {
      const n = roundsDone(t.id);
      if (n >= 2) done++; else if (n === 1) partial++; else pending++;
    });
    return { total: teamsInBoard.length, done, partial, pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <p style={{ color: '#64748b', marginBottom: 20 }}>Mỗi đội thi 2 lượt độc lập — ấn vào từng lượt để chấm.</p>

      {/* Stats */}
      <div className="rt-stats">
        <div className="rt-stat">
          <div className="rt-stat-value">{stats.total}</div>
          <div className="rt-stat-label">Tổng đội</div>
        </div>
        <div className="rt-stat rt-stat-done">
          <div className="rt-stat-value">{stats.done}</div>
          <div className="rt-stat-label">Xong cả 2 lượt</div>
        </div>
        <div className="rt-stat rt-stat-pending">
          <div className="rt-stat-value">{stats.partial}</div>
          <div className="rt-stat-label">Mới 1 lượt</div>
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
          <option value="partial">Mới 1 lượt</option>
          <option value="done">Xong cả 2 lượt</option>
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
            const isCombat = boardFormatById[t.board_id] === 'combat';
            const r = scoresByTeam[t.id] || {};

            return (
              <div key={t.id} className={`referee-card ${roundsDone(t.id) >= 2 ? 'is-done' : ''}`} style={{ cursor: 'default' }}>
                <div className="referee-card-head">
                  <h3>{t.name}</h3>
                  {roundsDone(t.id) >= 2 && <span className="rt-badge rt-badge-done">✓ Xong 2 lượt</span>}
                </div>
                {t.boards?.name && (
                  <p className="referee-card-members" style={{ color: '#60a5fa', fontWeight: 600 }}>
                    {t.boards.name}{t.boards.age_group ? ` — ${t.boards.age_group}` : ''}{isCombat ? ' · Đối kháng' : ''}
                  </p>
                )}
                <p className="referee-card-members">
                  {mems.length > 0 ? memberNames : <em style={{ color: '#475569' }}>Chưa có thành viên</em>}
                </p>

                {isCombat ? (
                  <Link
                    to={`/referee/competition/${competitionId}/content/${contentId}/region/${t.board_id}/matches`}
                    className="btn-ghost"
                    style={{ marginTop: 10, display: 'inline-flex' }}
                  >
                    Xem trận đấu →
                  </Link>
                ) : (
                  <div className="referee-card-foot" style={{ gap: 10, flexWrap: 'wrap' }}>
                    {[1, 2].map((roundNo) => {
                      const s = r[roundNo];
                      const url = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/team/${t.id}/round/${roundNo}/score`;
                      return (
                        <Link key={roundNo} to={url} state={{ memberNames }} className={`rt-badge ${s ? 'rt-badge-done' : 'rt-badge-pending'}`} style={{ textDecoration: 'none' }}>
                          {s ? `✓ Lượt ${roundNo}: ${s.score ?? '-'}đ${s.time ? ` · ${formatSecondsAsMinutes(s.time)}` : ''}` : `Chấm lượt ${roundNo}`}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
