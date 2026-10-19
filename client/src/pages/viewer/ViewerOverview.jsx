import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { BOARD_AGE_LABEL } from '../../lib/lookup';

export default function ViewerOverview() {
  const { lookup } = useLookupData();

  const stats = useMemo(() => {
    if (!lookup) return null;
    const scoredTeams = lookup.teams.filter((t) => (t.isCombat ? t.combat?.played > 0 : t.total)).length;
    const perContent = lookup.contents.map((c) => {
      const teams = lookup.teams.filter((t) => t.contest_content_id === c.id);
      const studentIds = new Set(teams.flatMap((t) => t.student_ids || []));
      const boards = lookup.boards.filter((b) => b.contest_content_id === c.id);
      const done = teams.filter((t) => (t.isCombat ? t.combat?.played > 0 : t.total?.rounds_done === 2)).length;
      const perBoard = boards.map((b) => ({
        name: b.name,
        teams: teams.filter((t) => t.board_id === b.id).length,
        students: new Set(teams.filter((t) => t.board_id === b.id).flatMap((t) => t.student_ids || [])).size,
      }));
      return { content: c, teams: teams.length, students: studentIds.size, done, perBoard,
        schools: new Set(teams.map((t) => t.school_name).filter(Boolean)).size };
    });
    const perBoard = ['Bảng A', 'Bảng B', 'Bảng C', 'Bảng D', 'Bảng E'].map((name) => {
      const ids = new Set(lookup.teams.filter((t) => t.boardName === name).flatMap((t) => t.student_ids || []));
      return { name, students: ids.size, teams: lookup.teams.filter((t) => t.boardName === name).length };
    }).filter((b) => b.teams > 0);
    return { scoredTeams, perContent, perBoard };
  }, [lookup]);

  if (!lookup) return <p style={{ color: '#94a3b8', padding: 24 }}>Chọn giải đấu để xem thống kê.</p>;
  const c = lookup.competition;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">{c.name}</h1>
        <p className="referee-page-subtitle">
          {[c.location, c.start_date].filter(Boolean).join(' · ') || 'Thống kê tổng quan giải đấu'}
          {c.is_active === false ? ' · Đã kết thúc' : ''}
        </p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{lookup.students.length}</div><div className="rt-stat-label">Học sinh tham dự</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.teams.length}</div><div className="rt-stat-label">Đội thi</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.schools.length}</div><div className="rt-stat-label">Trường / Trung tâm</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.coaches.length}</div><div className="rt-stat-label">Huấn luyện viên</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.contents.length}</div><div className="rt-stat-label">Nội dung thi</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{stats.scoredTeams}</div><div className="rt-stat-label">Đội đã có kết quả</div></div>
      </div>

      <div className="card viewer-section">
        <div className="card-header"><h3 className="card-title">Theo nội dung thi</h3></div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Nội dung</th><th className="viewer-num">Đội</th><th className="viewer-num">Học sinh</th><th className="viewer-num">Trường / TT</th><th>Theo bảng (đội / học sinh)</th><th className="viewer-num">Đã thi xong</th></tr>
            </thead>
            <tbody>
              {stats.perContent.map((r) => (
                <tr key={r.content.id}>
                  <td><Link className="viewer-link" to={`/tra-cuu/doi-thi?noiDung=${r.content.id}`}>{r.content.name}</Link></td>
                  <td className="viewer-num">{r.teams}</td>
                  <td className="viewer-num">{r.students}</td>
                  <td className="viewer-num">{r.schools}</td>
                  <td>
                    <div className="viewer-chips">
                      {r.perBoard.filter((b) => b.teams).map((b) => (
                        <span key={b.name} className="viewer-chip" title={BOARD_AGE_LABEL[b.name] || ''}>{b.name}: {b.teams} / {b.students}</span>
                      ))}
                    </div>
                  </td>
                  <td className="viewer-num">{r.done}/{r.teams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="viewer-hint">"Đã thi xong": nội dung chấm điểm = đội đã có đủ 2 lượt; đối kháng = đội đã đấu ít nhất 1 trận. Một học sinh có thể thi nhiều nội dung nên tổng theo nội dung có thể lớn hơn tổng học sinh của giải.</p>
      </div>

      {stats.perBoard.length > 0 && (
        <div className="card viewer-section">
          <div className="card-header"><h3 className="card-title">Theo bảng đấu (lứa tuổi)</h3></div>
          <div className="rt-stats" style={{ marginBottom: 0 }}>
            {stats.perBoard.map((b) => (
              <div key={b.name} className="rt-stat">
                <div className="rt-stat-value">{b.students}</div>
                <div className="rt-stat-label">{b.name} — {BOARD_AGE_LABEL[b.name]} · {b.teams} đội</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
