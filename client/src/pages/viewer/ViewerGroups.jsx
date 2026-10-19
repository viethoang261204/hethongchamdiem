import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { normalizeText } from '../../lib/lookup';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

// Tổng hợp theo Trường / Trung tâm hoặc theo HLV — bấm tên để sang trang
// Tra cứu đội đã lọc sẵn (?truong= / ?hlv=), xem từng đội + phiếu điểm.
export default function ViewerGroups() {
  const { lookup } = useLookupData();
  const [mode, setMode] = useState('truong');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    if (!lookup) return [];
    const key = mode === 'truong' ? 'school_name' : 'coach_name';
    const map = new Map();
    for (const t of lookup.teams) {
      const name = t[key];
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, teams: [], students: new Set(), contents: new Set(), other: new Set() });
      const r = map.get(name);
      r.teams.push(t);
      (t.student_ids || []).forEach((id) => r.students.add(id));
      if (t.content) r.contents.add(t.content.name);
      const otherName = mode === 'truong' ? t.coach_name : t.school_name;
      if (otherName) r.other.add(otherName);
    }
    const nq = normalizeText(q);
    return [...map.values()]
      .map((r) => ({
        ...r,
        top3: r.teams.filter((t) => t.rank && t.rank <= 3).length,
        withResult: r.teams.filter((t) => (t.isCombat ? t.combat?.played > 0 : t.total)).length,
      }))
      .filter((r) => !nq || normalizeText(r.name).includes(nq) || [...r.other].some((o) => normalizeText(o).includes(nq)))
      .sort((a, b) => b.teams.length - a.teams.length || a.name.localeCompare(b.name, 'vi'));
  }, [lookup, mode, q]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(rows, 30);

  if (!lookup) return null;
  const param = mode === 'truong' ? 'truong' : 'hlv';

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Trường / Trung tâm / Huấn luyện viên</h1>
        <p className="referee-page-subtitle">Bấm vào tên để xem toàn bộ đội thi, điểm và phiếu điểm của trường / trung tâm hoặc HLV đó.</p>
      </div>

      <div className="tab-segmented" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab-item ${mode === 'truong' ? 'active' : ''}`} onClick={() => setMode('truong')}>Trường / Trung tâm ({lookup.schools.length})</button>
        <button type="button" className={`tab-item ${mode === 'hlv' ? 'active' : ''}`} onClick={() => setMode('hlv')}>Huấn luyện viên ({lookup.coaches.length})</button>
      </div>

      <div className="filters-bar viewer-filters">
        <div className="search-box">
          <input type="text" placeholder={mode === 'truong' ? 'Tìm trường / trung tâm hoặc HLV...' : 'Tìm HLV hoặc trường / trung tâm...'} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{mode === 'truong' ? 'Trường / Trung tâm' : 'Huấn luyện viên'}</th>
                <th className="viewer-num">Đội</th><th className="viewer-num">Học sinh</th>
                <th>Nội dung tham gia</th><th>{mode === 'truong' ? 'HLV' : 'Trường / Trung tâm'}</th>
                <th className="viewer-num">Đã có kết quả</th><th className="viewer-num">Đội Top 3</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có kết quả.</td></tr>
              ) : pageItems.map((r) => (
                <tr key={r.name}>
                  <td><Link className="viewer-link" to={`/tra-cuu/doi-thi?${param}=${encodeURIComponent(r.name)}`}><strong>{r.name}</strong></Link></td>
                  <td className="viewer-num">{r.teams.length}</td>
                  <td className="viewer-num">{r.students.size}</td>
                  <td><div className="viewer-chips">{[...r.contents].map((c) => <span key={c} className="viewer-chip">{c}</span>)}</div></td>
                  <td className="viewer-sub">{[...r.other].join(', ')}</td>
                  <td className="viewer-num">{r.withResult}/{r.teams.length}</td>
                  <td className="viewer-num">{r.top3 ? <strong style={{ color: '#fbbf24' }}>{r.top3}</strong> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
