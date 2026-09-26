import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { formatSecondsAsMinutes } from '../../lib/time';
import { computeGroupStandings } from '../../lib/battleScoring';
import { computeGroupStandings as computeDroneStandings } from '../../lib/flySmartCupScoring';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

const COMBAT_FORMATS = ['combat_stars', 'combat_drone'];

// Bảng xếp hạng CHO TRỌNG TÀI — chỉ hiện với tài khoản được admin bật quyền
// "Xem bảng xếp hạng" (users.can_view_scoreboard, quản lý ở AdminRefereeAccounts).
// Khác AdminScoreboard (phải chọn từng nội dung/bảng đấu để xem), trang này
// hiện LUÔN toàn bộ nội dung + bảng đấu của cuộc thi đang chọn — đúng yêu cầu
// "xem được bảng xếp hạng cả giải đấu", không giới hạn theo referee_boards
// (đó là quyền CHẤM, khác với quyền XEM ở đây).

function RankBadge({ rank }) {
  const cls = rank === 1 ? 'rt-rank rt-rank-1' : rank === 2 ? 'rt-rank rt-rank-2' : rank === 3 ? 'rt-rank rt-rank-3' : 'rt-rank';
  return <span className={cls}>{rank}</span>;
}

function MeasurementTable({ teams }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: 56 }}>Hạng</th>
            <th>Đội</th>
            <th style={{ width: 80 }}>Lượt 1</th>
            <th style={{ width: 80 }}>Lượt 2</th>
            <th style={{ width: 90 }}>Tổng điểm</th>
            <th style={{ width: 110 }}>Tổng thời gian</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.team_id}>
              <td>
                <RankBadge rank={i + 1} />
                {t.needs_playoff && <span className="rt-badge rt-badge-rejected" style={{ marginLeft: 6 }}>Cần chạy thử</span>}
              </td>
              <td>{t.team_name}</td>
              <td>{t.round1 ? t.round1.score : <span style={{ color: '#475569' }}>—</span>}</td>
              <td>{t.round2 ? t.round2.score : <span style={{ color: '#475569' }}>—</span>}</td>
              <td><strong style={{ color: '#f1f5f9' }}>{t.total_score}</strong></td>
              <td>{formatSecondsAsMinutes(String(t.total_time)) || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Bảng xếp hạng đối kháng (Battle of Stars/Fly Smart Cup) theo Board — tính
// từ TOÀN BỘ trận của nội dung (không chỉ lọc theo group vòng tròn), giống
// hệt cách AdminScoreboard.jsx tính combatBoardStandings, vì nội dung đối
// kháng không dùng bảng `scores`/API /ranking (đó là cho nội dung đo lường).
function CombatBoardTable({ standings, isStars }) {
  if (standings.length === 0) return <p style={{ color: '#64748b', fontSize: 13.5 }}>Chưa có đội nào ở bảng này.</p>;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: 56 }}>Hạng</th>
            <th>Đội</th>
            <th style={{ width: 70 }}>Trận</th>
            <th style={{ width: 50 }}>W</th>
            <th style={{ width: 50 }}>D</th>
            <th style={{ width: 50 }}>L</th>
            <th style={{ width: 100 }}>Match Points</th>
            <th style={{ width: 100 }}>Total Score</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.teamId}>
              <td><RankBadge rank={s.rank} /></td>
              <td>{s.teamName}</td>
              <td>{s.played}</td>
              <td>{s.wins}</td>
              <td>{s.draws}</td>
              <td>{s.losses}</td>
              <td><strong style={{ color: '#f1f5f9' }}>{s.matchPoints}</strong></td>
              <td>{s.totalScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CombatSummary({ data }) {
  if (!data.matches?.length) {
    return <p style={{ padding: '12px 4px', color: '#64748b', fontSize: 13.5 }}>Chưa có nhánh đấu.</p>;
  }
  return (
    <div style={{ padding: '4px 0' }}>
      {data.bracket_resolved && data.placements?.length > 0 ? (
        <table className="ts-detail-table">
          <tbody>
            {data.placements.map((p) => {
              const name = data.matches.find((m) => m.team_a_id === p.team_id)?.team_a_name
                || data.matches.find((m) => m.team_b_id === p.team_id)?.team_b_name || p.team_id;
              return (
                <tr key={p.team_id}>
                  <td><strong style={{ color: '#c4b5fd' }}>Hạng {p.rank}</strong></td>
                  <td>{name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#64748b', fontSize: 13.5 }}>Nhánh đấu chưa kết thúc — {data.matches.length} trận.</p>
      )}
    </div>
  );
}

function ContentSection({ content }) {
  const isCombat = COMBAT_FORMATS.includes(content.content_format);
  const isStars = content.content_format === 'combat_stars';
  const [boards, setBoards] = useState([]);
  const [rankings, setRankings] = useState({});
  const [combatData, setCombatData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (isCombat) {
      // Nội dung đối kháng KHÔNG dùng bảng `scores`/API /ranking (đó là cho
      // nội dung đo lường) — phải tự lấy teams + combat_matches rồi tính
      // bằng đúng luật riêng của từng format, giống AdminScoreboard.jsx.
      Promise.all([api.getBoards(content.id), api.getTeams(content.id), api.getCombatMatches(content.id)])
        .then(([bd, tm, ms]) => {
          if (cancelled) return;
          setBoards(bd);
          setCombatData({ teams: tm, matches: ms });
        })
        .catch(() => { if (!cancelled) { setBoards([]); setCombatData({ teams: [], matches: [] }); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      api.getBoards(content.id)
        .then(async (bd) => {
          if (cancelled) return;
          setBoards(bd);
          const pairs = await Promise.all(
            bd.map((b) => api.getRanking(content.id, b.id).then((r) => [b.id, r]).catch(() => [b.id, null]))
          );
          if (!cancelled) setRankings(Object.fromEntries(pairs));
        })
        .catch(() => { if (!cancelled) setBoards([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [content.id, isCombat]);

  const combatBoardStandings = useMemo(() => {
    if (!isCombat || !combatData) return {};
    const result = {};
    for (const b of boards) {
      const boardTeams = combatData.teams.filter((t) => t.board_id === b.id);
      result[b.id] = isStars
        ? computeGroupStandings(boardTeams, combatData.matches)
        : computeDroneStandings(boardTeams, combatData.matches);
    }
    return result;
  }, [isCombat, isStars, combatData, boards]);

  return (
    <div className="ts-card" style={{ marginBottom: 20 }}>
      <h3 className="ts-card-title">{content.name}</h3>
      {loading ? (
        <p style={{ color: '#64748b' }}>Đang tải...</p>
      ) : boards.length === 0 ? (
        <p style={{ color: '#64748b' }}>Nội dung này chưa có bảng đấu nào.</p>
      ) : isCombat ? (
        boards.map((b) => (
          <div key={b.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ color: '#e2e8f0', fontSize: 14 }}>
                {b.name}{b.age_group ? ` — ${b.age_group}` : ''}
              </strong>
              <span className="ts-board-chip">{isStars ? 'Battle of Stars' : 'Fly Smart Cup'}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>{(combatBoardStandings[b.id] || []).length} đội</span>
            </div>
            <CombatBoardTable standings={combatBoardStandings[b.id] || []} isStars={isStars} />
          </div>
        ))
      ) : (
        boards.map((b) => {
          const r = rankings[b.id];
          return (
            <div key={b.id} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <strong style={{ color: '#e2e8f0', fontSize: 14 }}>
                  {b.name}{b.age_group ? ` — ${b.age_group}` : ''}
                </strong>
                {b.ranking_format === 'combat' && <span className="ts-board-chip">Đối kháng</span>}
                {r?.ranking_format === 'measurement' && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>{r.teams.length} đội</span>
                )}
              </div>
              {!r ? (
                <p style={{ color: '#64748b', fontSize: 13.5 }}>Không tải được dữ liệu.</p>
              ) : r.ranking_format === 'combat' ? (
                <CombatSummary data={r} />
              ) : r.teams.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: 13.5 }}>Chưa có điểm nào.</p>
              ) : (
                <MeasurementTable teams={r.teams} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function RefereeScoreboard() {
  const { user } = useAuth();
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [selectedComp, setSelectedComp] = useState('');
  const [loading, setLoading] = useState(true);

  const allowed = !!user?.can_view_scoreboard;

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    api.getCompetitions()
      .then((list) => {
        const active = list.filter((c) => c.is_active !== false);
        setCompetitions(active);
        if (active.length) setSelectedComp(active[0].id);
      })
      .catch(() => setCompetitions([]))
      .finally(() => setLoading(false));
  }, [allowed]);

  useEffect(() => {
    if (!selectedComp) { setContents([]); return; }
    api.getContents(selectedComp).then(setContents).catch(() => setContents([]));
  }, [selectedComp]);

  const sortedContents = useMemo(
    () => contents.slice().sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)),
    [contents]
  );

  if (!allowed) {
    return (
      <div>
        <h1 className="referee-page-title">Bảng xếp hạng</h1>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#f87171', fontWeight: 600, marginBottom: 6 }}>Bạn không có quyền xem trang này.</p>
          <p style={{ color: '#64748b', fontSize: 13.5 }}>Liên hệ admin nếu cần xem Bảng xếp hạng.</p>
        </div>
      </div>
    );
  }

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Bảng xếp hạng giải đấu</h1>
        <p className="referee-page-subtitle">Xem điểm số và xếp hạng của toàn bộ các nội dung và bảng đấu trong cuộc thi.</p>
      </div>

      {competitions.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Chưa có cuộc thi nào đang diễn ra.</div>
      ) : (
        <>
          {competitions.length > 1 && (
            <div className="form-group" style={{ maxWidth: 360, marginBottom: 20 }}>
              <label className="form-label">Cuộc thi</label>
              <select className="form-input form-select" value={selectedComp} onChange={(e) => setSelectedComp(e.target.value)}>
                {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {sortedContents.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Cuộc thi này chưa có nội dung thi nào.</div>
          ) : (
            sortedContents.map((content) => <ContentSection key={content.id} content={content} />)
          )}
        </>
      )}
    </div>
  );
}
