import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { BOARD_AGE_LABEL, contentGroup } from '../../lib/lookup';
import { HBarChart, SERIES_COLORS } from './ViewerCharts';

const AWARD_SERIES = [
  { key: 'major', label: 'Giải chính (Nhất / Nhì / Ba, Vô địch...)', color: SERIES_COLORS[0] },
  { key: 'rising', label: 'Rising Star', color: SERIES_COLORS[1] },
  { key: 'phu', label: 'Giải phụ (Top 5 / Top 10...)', color: SERIES_COLORS[2] },
];
const ONE_SERIES = [{ key: 'v', label: '', color: SERIES_COLORS[0] }];

// Đếm giải thưởng chính thức của 1 tập đội theo 3 loại (đội nhiều giải đếm đủ)
function countAwards(teams) {
  const c = { major: 0, rising: 0, phu: 0 };
  for (const t of teams) for (const a of t.awards || []) {
    if (a.label === 'Rising Star') c.rising++;
    else if (a.tier === 'major') c.major++;
    else c.phu++;
  }
  return c;
}

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
    // Gộp CÙNG 1 nội dung giữa các giải (vd "Con đường phát minh" ở ĐN/HCM/HN
    // + "Inventions Trail" ở Asian Open) thành 1 dòng; xem 1 giải thì mỗi
    // nội dung vẫn là 1 dòng như cũ.
    const groups = new Map();
    for (const c of lookup.contents) {
      const g = contentGroup(c);
      if (!groups.has(g.key)) groups.set(g.key, { key: g.key, name: g.name, contents: [] });
      groups.get(g.key).contents.push(c);
    }
    const perContent = [...groups.values()].map((g) => {
      const ids = new Set(g.contents.map((c) => c.id));
      const teams = lookup.teams.filter((t) => ids.has(t.contest_content_id));
      // Bằng đã thi xong: chấm điểm = có ĐỦ số lượt của giải đó (giải nhập bảng
      // điểm ngoài chỉ có 1 lượt), đối kháng = đã đấu ≥ 1 trận.
      const done = teams.filter((t) => (t.isCombat ? t.combat?.played > 0
        : t.total && (t.total.rounds_done === 2 || [t.rounds[1], t.rounds[2]].some((r) => r?.official_rank)))).length;
      const boardNames = [...new Set(lookup.boards.filter((b) => ids.has(b.contest_content_id)).map((b) => b.name))].sort();
      const perBoard = boardNames.map((name) => {
        const bt = teams.filter((t) => t.boardName === name);
        return { name, teams: bt.length, students: new Set(bt.flatMap((t) => t.student_ids || [])).size };
      });
      const comps = [...new Set(g.contents.map((c) => lookup.competitionsById.get(c.competition_id)?.name).filter(Boolean))];
      return { key: g.key, name: g.name, comps, done, perBoard, ...summarize(teams) };
    }).filter((r) => r.teams > 0).sort((a, b) => b.teams - a.teams);
    const perBoard = ['Bảng A', 'Bảng B', 'Bảng C', 'Bảng D', 'Bảng E'].map((name) => {
      const teams = lookup.teams.filter((t) => t.boardName === name);
      return { name, ...summarize(teams) };
    }).filter((b) => b.teams > 0);
    // Biểu đồ: theo giải (host) khi xem tổng thể, theo nội dung khi xem 1 giải
    const chartUnits = lookup.all
      ? lookup.competitions.map((comp) => ({ key: comp.id, label: comp.name, teams: lookup.teams.filter((t) => t.competition_id === comp.id) }))
      : perContent.map((r) => ({ key: r.key, label: r.name, teams: lookup.teams.filter((t) => contentGroup(t.content).key === r.key) }));
    const awardRows = chartUnits.map((u) => ({ key: u.key, label: u.label, values: countAwards(u.teams) }));
    const studentRows = chartUnits
      .map((u) => ({ key: u.key, label: u.label, values: { v: new Set(u.teams.flatMap((t) => t.student_ids || [])).size } }))
      .filter((r) => r.values.v > 0).sort((a, b) => b.values.v - a.values.v);
    const contentStudentRows = perContent.map((r) => ({ key: r.key, label: r.name, values: { v: r.students } }))
      .sort((a, b) => b.values.v - a.values.v);
    const awardTotal = countAwards(lookup.teams);
    return { total: summarize(lookup.teams), perCompetition, perContent, perBoard, awardRows, studentRows, contentStudentRows,
      awardTotal: awardTotal.major + awardTotal.rising + awardTotal.phu, awardSplit: awardTotal };
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
        <div className="rt-stat"><div className="rt-stat-value">{stats.awardTotal.toLocaleString('vi-VN')}</div><div className="rt-stat-label">Tổng giải thưởng ({stats.awardSplit.major} chính · {stats.awardSplit.rising} Rising Star · {stats.awardSplit.phu} phụ)</div></div>
      </div>

      <div className="viz-grid">
        <div className="card viz-wide">
          <div className="card-header"><h3 className="card-title">{lookup.all ? 'Tổng số giải thưởng theo từng giải (host)' : 'Giải thưởng theo nội dung'}</h3></div>
          <HBarChart rows={stats.awardRows} series={AWARD_SERIES} emptyText="Chưa có giải thưởng chính thức." />
        </div>
        <div className="card">
          <div className="card-header"><h3 className="card-title">{lookup.all ? 'Học sinh tham dự theo giải' : 'Học sinh tham dự theo nội dung'}</h3></div>
          <HBarChart rows={stats.studentRows} series={ONE_SERIES} unit=" HS" />
        </div>
        {lookup.all && (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Học sinh theo nội dung thi (gộp các giải)</h3></div>
            <HBarChart rows={stats.contentStudentRows} series={ONE_SERIES} unit=" HS" />
          </div>
        )}
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
                <tr key={r.key}>
                  <td>
                    <Link className="viewer-link" to={`/tra-cuu/doi-thi?nhom=${encodeURIComponent(r.key)}`}>{r.name}</Link>
                    {lookup.all && <div className="viewer-sub">{r.comps.length} giải: {r.comps.join(', ')}</div>}
                  </td>
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
