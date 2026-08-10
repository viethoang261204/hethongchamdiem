import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi } from '../../apiCache';
import { formatSecondsAsMinutes } from '../../lib/time';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
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

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 10);

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
    <div className="referee-content-wrap">
      <div className="breadcrumb">
        <Link to="/referee">Chấm điểm</Link>
        <span>/</span>
        <span>Danh sách đội thi</span>
      </div>

      <div className="referee-page-header">
        <h1 className="referee-page-title">
          Danh sách đội thi{currentBoard ? ` — ${currentBoard.name}${currentBoard.age_group ? ` (${currentBoard.age_group})` : ''}` : ''}
        </h1>
        <p className="referee-page-subtitle">Mỗi đội thi thực hiện 2 lượt chấm độc lập — chọn lượt thi tương ứng để bắt đầu chấm điểm.</p>
      </div>

      {/* Stats */}
      <div className="rt-stats">
        <div className="rt-stat">
          <div className="rt-stat-value">{stats.total}</div>
          <div className="rt-stat-label">Tổng đội thi</div>
        </div>
        <div className="rt-stat rt-stat-done">
          <div className="rt-stat-value">{stats.done}</div>
          <div className="rt-stat-label">Hoàn thành 2 lượt</div>
        </div>
        <div className="rt-stat rt-stat-pending">
          <div className="rt-stat-value">{stats.partial}</div>
          <div className="rt-stat-label">Mới chấm 1 lượt</div>
        </div>
        <div className="rt-stat rt-stat-pending">
          <div className="rt-stat-value">{stats.pending}</div>
          <div className="rt-stat-label">Chưa chấm lượt nào</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Tìm theo tên đội thi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chưa chấm</option>
          <option value="partial">Mới chấm 1 lượt</option>
          <option value="done">Hoàn thành cả 2 lượt</option>
        </select>
      </div>

      {/* Team grid */}
      {filtered.length === 0 ? (
        <div className="card referee-empty-card">
          <p>{teamsInBoard.length === 0 ? `Chưa có đội nào trong ${currentBoard ? 'bảng đấu' : 'nội dung'} này.` : 'Không tìm thấy đội phù hợp.'}</p>
        </div>
      ) : (
        <div className="referee-grid">
          {pageItems.map((t) => {
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
                  <div className="card-badge" style={{ marginBottom: 6 }}>
                    {t.boards.name}{t.boards.age_group ? ` — ${t.boards.age_group}` : ''}{isCombat ? ' · Đối kháng' : ''}
                  </div>
                )}
                <p className="referee-card-members">
                  {mems.length > 0 ? memberNames : <em style={{ color: '#64748b' }}>Chưa cập nhật thành viên</em>}
                </p>

                {isCombat ? (
                  <Link
                    to={`/referee/competition/${competitionId}/content/${contentId}/region/${t.board_id}/matches`}
                    className="btn btn-ghost"
                    style={{ marginTop: 10, display: 'inline-flex' }}
                  >
                    Xem danh sách trận đấu →
                  </Link>
                ) : (
                  <div className="referee-card-foot">
                    {[1, 2].map((roundNo) => {
                      const s = r[roundNo];
                      const url = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/team/${t.id}/round/${roundNo}/score`;
                      return (
                        <Link key={roundNo} to={url} state={{ memberNames }} className={`rt-badge ${s ? 'rt-badge-done' : 'rt-badge-pending'}`} style={{ textDecoration: 'none' }}>
                          {s ? `✓ Lượt ${roundNo}: ${s.score ?? '-'}đ${s.time ? ` · ${formatSecondsAsMinutes(s.time)}` : ''}` : `Chấm lượt ${roundNo} →`}
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
      <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
    </div>
  );
}
