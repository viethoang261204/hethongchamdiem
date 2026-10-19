import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { normalizeText } from '../../lib/lookup';
import { classifyRank, formatRankLabel, isOutstandingCoach, isRisingStarTeam } from '../../lib/outstandingCoach';

// Tổng hợp "HLV xuất sắc" — ĐÚNG tiêu chí ở lib/outstandingCoach.js (dùng
// chung với trang admin): HLV có ≥ 1 đội Top 1-3 (hoặc Rising Star), hoặc
// ≥ 3 đội trong "Top + giải phụ" theo cấu hình giải phụ của TỪNG giải. Hạng
// lấy từ lib/lookup.js (đã gộp bảng nếu giải có cấu hình), khớp Bảng xếp hạng.
export default function ViewerCoaches() {
  const { lookup } = useLookupData();
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    if (!lookup) return [];
    const byCoach = new Map();
    for (const t of lookup.teams) {
      if (!t.coach_id) continue;
      const key = `${t.competition_id}|${t.coach_id}`;
      if (!byCoach.has(key)) {
        byCoach.set(key, { key, coach: t.coach_name, competition: t.competition, schools: new Set(), teams: 0, entries: [] });
      }
      const r = byCoach.get(key);
      r.teams++;
      if (t.school_name) r.schools.add(t.school_name);
      const contentName = t.content?.name;
      if (isRisingStarTeam(t.competition_id, t.name)) {
        r.entries.push({ team: t, label: 'Rising Star', tier: 'major' });
      }
      const tier = t.rank ? classifyRank(t.competition_id, contentName, t.rankScope, t.rank) : null;
      if (tier) r.entries.push({ team: t, label: formatRankLabel(t.competition_id, contentName, t.rankScope, t.rank), tier });
    }
    const nq = normalizeText(q);
    return [...byCoach.values()]
      .map((r) => ({
        ...r,
        outstanding: isOutstandingCoach(r.entries),
        major: r.entries.filter((e) => e.tier === 'major').length,
      }))
      .filter((r) => (showAll ? r.entries.length > 0 : r.outstanding))
      .filter((r) => !nq || normalizeText(r.coach).includes(nq) || [...r.schools].some((s) => normalizeText(s).includes(nq)))
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding) || b.major - a.major || b.entries.length - a.entries.length
        || (a.coach || '').localeCompare(b.coach || '', 'vi'));
  }, [lookup, q, showAll]);

  if (!lookup) return null;
  const outstandingCount = rows.filter((r) => r.outstanding).length;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Huấn luyện viên xuất sắc</h1>
        <p className="referee-page-subtitle">
          HLV đạt danh hiệu khi có <strong>ít nhất 1 đội đạt giải chính (Top 1–3 hoặc Rising Star)</strong>, hoặc <strong>ít nhất 3 đội đạt giải</strong> (gộp giải chính + giải phụ Top 5 / Top 10 theo cấu hình từng giải). Hạng xét theo bảng xếp hạng chính thức.
        </p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{outstandingCount}</div><div className="rt-stat-label">HLV xuất sắc{lookup.all ? ' (tất cả các giải)' : ''}</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{rows.reduce((a, r) => a + (r.outstanding ? r.entries.length : 0), 0)}</div><div className="rt-stat-label">Lượt đội đạt giải của các HLV này</div></div>
      </div>

      <div className="filters-bar viewer-filters">
        <div className="search-box">
          <input type="text" placeholder="Tìm HLV hoặc trường / trung tâm..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="viewer-check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Hiện cả HLV có đội đạt giải nhưng chưa đủ tiêu chí
        </label>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Huấn luyện viên</th>{lookup.all && <th>Giải</th>}<th>Trường / Trung tâm</th>
                <th className="viewer-num">Đội dự thi</th><th>Đội đạt giải</th><th className="viewer-num">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={lookup.all ? 6 : 5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Chưa có HLV nào đạt tiêu chí (hoặc giải chưa có kết quả).</td></tr>
              ) : rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <Link className="viewer-link" to={`/tra-cuu/doi-thi?hlv=${encodeURIComponent(r.coach)}${lookup.all ? `&giai=${r.competition?.id}` : ''}`}><strong>{r.coach}</strong></Link>
                  </td>
                  {lookup.all && <td>{r.competition?.name}</td>}
                  <td className="viewer-sub">{[...r.schools].join(', ')}</td>
                  <td className="viewer-num">{r.teams}</td>
                  <td>
                    {r.entries.map((e, i) => (
                      <div key={i} className="viewer-award">
                        <span className={`viewer-chip ${e.tier === 'major' ? 'viewer-chip-gold' : ''}`}>{e.label}</span>
                        {' '}{e.team.name}<span className="viewer-sub"> — {e.team.content?.name}{e.team.rankScope && e.label !== 'Rising Star' ? ` · ${e.team.rankScope}` : ''}</span>
                      </div>
                    ))}
                  </td>
                  <td className="viewer-num">
                    {r.outstanding ? <span className="rt-badge rt-badge-done">Đạt</span> : <span className="rt-badge rt-badge-pending">Chưa đủ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
