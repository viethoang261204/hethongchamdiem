import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { BOARD_AGE_LABEL, contentLabel } from '../../lib/lookup';

const hasResult = (t) => (t.isCombat ? t.combat?.played > 0 : !!t.total);

function summarize(teams) {
  const students = new Set(teams.flatMap((t) => t.student_ids || []));
  return {
    teams: teams.length,
    students: students.size,
    schools: new Set(teams.map((t) => t.school_name).filter(Boolean)).size,
    coaches: new Set(teams.map((t) => t.coach_name).filter(Boolean)).size,
    withResult: teams.filter(hasResult).length,
  };
}

export default function ViewerOverview() {
  const { lookup } = useLookupData();

  const stats = useMemo(() => {
    if (!lookup) return null;
    const perCompetition = lookup.all
      ? lookup.competitions.map((comp) => {
        const teams = lookup.teams.filter((t) => t.competition_id === comp.id);
        return { comp, contents: lookup.contents.filter((c) => c.competition_id === comp.id).length, ...summarize(teams) };
      }).filter((r) => r.teams > 0 || r.contents > 0)
      : [];
    const perContent = lookup.contents.map((c) => {
      const teams = lookup.teams.filter((t) => t.contest_content_id === c.id);
      const boards = lookup.boards.filter((b) => b.contest_content_id === c.id);
      const done = teams.filter((t) => (t.isCombat ? t.combat?.played > 0 : t.total?.rounds_done === 2)).length;
      const perBoard = boards.map((b) => ({
        name: b.name,
        teams: teams.filter((t) => t.board_id === b.id).length,
        students: new Set(teams.filter((t) => t.board_id === b.id).flatMap((t) => t.student_ids || [])).size,
      }));
      return { content: c, done, perBoard, ...summarize(teams) };
    }).filter((r) => r.teams > 0);
    const perBoard = ['Bảng A', 'Bảng B', 'Bảng C', 'Bảng D', 'Bảng E'].map((name) => {
      const teams = lookup.teams.filter((t) => t.boardName === name);
      return { name, ...summarize(teams) };
    }).filter((b) => b.teams > 0);
    return { total: summarize(lookup.teams), perCompetition, perContent, perBoard };
  }, [lookup]);

  if (!lookup) return <p style={{ color: '#94a3b8', padding: 24 }}>Chọn giải đấu để xem thống kê.</p>;
  const c = lookup.competition;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">{lookup.all ? 'Báo cáo tổng thể — tất cả các giải' : c.name}</h1>
        <p className="referee-page-subtitle">
          {lookup.all
            ? `${stats.perCompetition.length} giải đấu · số học sinh, đội thi, trường / trung tâm và HLV cộng gộp toàn hệ thống`
            : ([c.location, c.start_date].filter(Boolean).join(' · ') || 'Thống kê tổng quan giải đấu') + (c.is_active === false ? ' · Đã kết thúc' : '')}
        </p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{lookup.students.length}</div><div className="rt-stat-label">Học sinh tham dự</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.teams.length}</div><div className="rt-stat-label">Đội thi</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.schools.length}</div><div className="rt-stat-label">Trường / Trung tâm</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.coaches.length}</div><div className="rt-stat-label">Huấn luyện viên</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{lookup.all ? stats.perCompetition.length : stats.perContent.length}</div><div className="rt-stat-label">{lookup.all ? 'Giải đấu' : 'Nội dung thi'}</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{stats.total.withResult}</div><div className="rt-stat-label">Đội đã có kết quả</div></div>
      </div>

      {lookup.all && (
        <div className="card viewer-section">
          <div className="card-header"><h3 className="card-title">Theo từng giải</h3></div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Giải đấu</th><th className="viewer-num">Nội dung</th><th className="viewer-num">Đội</th><th className="viewer-num">Học sinh</th><th className="viewer-num">Trường / TT</th><th className="viewer-num">HLV</th><th className="viewer-num">Đã có kết quả</th></tr>
              </thead>
              <tbody>
                {stats.perCompetition.map((r) => (
                  <tr key={r.comp.id}>
                    <td><strong>{r.comp.name}</strong>{r.comp.is_active === false ? <span className="viewer-sub"> · đã kết thúc</span> : null}</td>
                    <td className="viewer-num">{r.contents}</td>
                    <td className="viewer-num">{r.teams}</td>
                    <td className="viewer-num">{r.students}</td>
                    <td className="viewer-num">{r.schools}</td>
                    <td className="viewer-num">{r.coaches}</td>
                    <td className="viewer-num">{r.withResult}/{r.teams}</td>
                  </tr>
                ))}
                <tr className="viewer-total-row">
                  <td>Tổng cộng</td>
                  <td className="viewer-num">{stats.perCompetition.reduce((a, r) => a + r.contents, 0)}</td>
                  <td className="viewer-num">{stats.total.teams}</td>
                  <td className="viewer-num">{stats.total.students}</td>
                  <td className="viewer-num">{stats.total.schools}</td>
                  <td className="viewer-num">{stats.total.coaches}</td>
                  <td className="viewer-num">{stats.total.withResult}/{stats.total.teams}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <td><Link className="viewer-link" to={`/tra-cuu/doi-thi?noiDung=${r.content.id}`}>{contentLabel(lookup, r.content)}</Link></td>
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
        <p className="viewer-hint">"Đã thi xong": nội dung chấm điểm = đội đã có đủ 2 lượt; đối kháng = đội đã đấu ít nhất 1 trận. Một học sinh có thể thi nhiều nội dung nên tổng theo nội dung có thể lớn hơn tổng học sinh.</p>
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
