import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import {
  buildPeople, chinaStats, exportChinaExcel, filterChinaRows, filterPeople, fmtDate, prepareChinaRows, validDob,
} from '../../lib/china';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

const Missing = () => <span className="viewer-missing">Chưa có</span>;
const AwardChips = ({ awards }) => (
  <div className="viewer-chips">{awards.map((a) => <span key={a} className={`viewer-chip ${a !== 'Top 5' && a !== 'Top 10' ? 'viewer-chip-gold' : ''}`}>{a}</span>)}</div>
);
const Contact = ({ value, source }) => (value
  ? <>{value}{source && <div className="viewer-sub">{source}</div>}</>
  : <Missing />);

// Đội đủ điều kiện đi Trung Quốc = có giải thưởng chính thức (mọi giải, mọi
// loại giải). Mặc định xem THEO HỌC SINH — đã lọc trùng em thi nhiều giải
// (xem buildPeople); "Theo đội" giữ nguyên từng đội. Cổng Tra cứu chỉ XEM +
// xuất Excel; nhập thông tin ở trang admin.
export default function ViewerChina() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('hs');
  const [f, setF] = useState({ q: '', giai: '', nhom: '', loai: '', thongTin: '' });
  const [exporting, setExporting] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.getChinaEligible().then((r) => setRaw(prepareChinaRows(r))).catch((e) => setError(e.message || 'Không tải được dữ liệu.'));
  }, []);

  const rows = raw || [];
  const teamFilter = useMemo(() => (view === 'hs' ? { ...f, q: '', thongTin: '' } : f), [view, f]);
  const filtered = useMemo(() => filterChinaRows(rows, teamFilter), [rows, teamFilter]);
  const people = useMemo(() => (view === 'hs' ? filterPeople(buildPeople(filtered), f) : []), [view, filtered, f]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(view === 'hs' ? people : filtered, view === 'hs' ? 30 : 20);
  const comps = useMemo(() => [...new Map(rows.map((r) => [r.competition_id, r.competition_name])).entries()], [rows]);
  const groups = useMemo(() => [...new Map(rows.map((r) => [r.contentGroup.key, r.contentGroup.name])).entries()], [rows]);
  const stats = useMemo(() => chinaStats(rows), [rows]);

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!raw) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải danh sách...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Đội đủ điều kiện đi Trung Quốc</h1>
        <p className="referee-page-subtitle">Tất cả các đội có giải thưởng chính thức ở mọi giải (Giải Nhất / Nhì / Ba, Top 5 / Top 10, Rising Star...), kèm họ tên, ngày sinh, SĐT và email của từng học sinh. Em thi nhiều giải chỉ tính 1 lần.</p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{stats.teams}</div><div className="rt-stat-label">Đội đủ điều kiện</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{stats.students}</div><div className="rt-stat-label">Học sinh (đã lọc trùng — {stats.multi} em đạt giải ở nhiều đội)</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{stats.complete}</div><div className="rt-stat-label">HS đủ thông tin</div></div>
        <div className="rt-stat rt-stat-pending"><div className="rt-stat-value">{stats.students - stats.complete}</div><div className="rt-stat-label">HS còn thiếu thông tin</div></div>
      </div>

      <div className="filters-bar viewer-filters">
        <select className="filter-select" value={view} onChange={(e) => { setView(e.target.value); setPage(1); }}>
          <option value="hs">Theo học sinh</option>
          <option value="doi">Theo đội</option>
        </select>
        <div className="search-box"><input type="text" placeholder="Tên đội, học sinh, trường, HLV, email, SĐT..." value={f.q} onChange={(e) => set('q', e.target.value)} /></div>
        <select className="filter-select" value={f.giai} onChange={(e) => set('giai', e.target.value)}>
          <option value="">Tất cả giải</option>
          {comps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="filter-select" value={f.nhom} onChange={(e) => set('nhom', e.target.value)}>
          <option value="">Tất cả nội dung</option>
          {groups.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        <select className="filter-select" value={f.loai} onChange={(e) => set('loai', e.target.value)}>
          <option value="">Mọi loại giải</option>
          <option value="chinh">Có giải chính (Nhất/Nhì/Ba)</option>
          <option value="rising">Rising Star</option>
          <option value="phu">Chỉ giải phụ (Rising Star, Top 5 / Top 10...)</option>
        </select>
        <select className="filter-select" value={f.thongTin} onChange={(e) => set('thongTin', e.target.value)}>
          <option value="">Thông tin HS: tất cả</option>
          <option value="du">{view === 'hs' ? 'HS đã đủ thông tin' : 'Đội đã đủ thông tin'}</option>
          <option value="thieu">{view === 'hs' ? 'HS còn thiếu thông tin' : 'Đội còn HS thiếu thông tin'}</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={!filtered.length || exporting}
          onClick={async () => { setExporting(true); try { await exportChinaExcel(filtered); } finally { setExporting(false); } }}>
          {exporting ? 'Đang xuất...' : 'Xuất Excel (đã lọc trùng)'}
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          {view === 'hs' ? (
            <table className="viewer-china-table">
              <thead>
                <tr><th>Học sinh</th><th>Ngày sinh</th><th>SĐT</th><th>Email</th><th>Đội · giải thưởng</th></tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có học sinh nào.</td></tr>
                ) : pageItems.map((p) => (
                  <tr key={p.key} className="viewer-team-first">
                    <td>
                      <strong>{p.full_name}</strong>
                      <div className="viewer-sub">{[p.schools.join(', '), p.coaches.length && `HLV ${p.coaches.join(', ')}`].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="viewer-nowrap">{fmtDate(p.birth_date) || <Missing />}</td>
                    <td className="viewer-nowrap"><Contact value={p.phone} source={p.phone_source} /></td>
                    <td><Contact value={p.email} source={p.email_source} /></td>
                    <td>
                      {p.entries.length > 1 && <div className="viewer-sub" style={{ marginBottom: 4 }}>Đạt giải ở {p.entries.length} đội</div>}
                      {p.entries.map((t) => (
                        <div key={t.id} className="viewer-entry">
                          <AwardChips awards={t.awards} />
                          <span>{t.name}</span>
                          <span className="viewer-sub">{t.competition_name} · {t.content_name}{t.board_name ? ` · ${t.board_name}` : ''}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="viewer-china-table">
              <thead>
                <tr><th>Đội</th><th>Giải thưởng</th><th>Học sinh</th><th>Ngày sinh</th><th>SĐT</th><th>Email</th></tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có đội nào.</td></tr>
                ) : pageItems.map((r) => {
                  const list = r.students.length ? r.students : [null];
                  const span = list.length;
                  return list.map((s, i) => (
                    <tr key={`${r.id}-${s?.id || i}`} className={i === 0 ? 'viewer-team-first' : ''}>
                      {i === 0 && (
                        <>
                          <td rowSpan={span}>
                            <strong>{r.name}</strong>
                            <div className="viewer-sub">{r.competition_name}</div>
                            <div className="viewer-sub">{r.content_name}{r.board_name ? ` · ${r.board_name}` : ''}</div>
                            <div className="viewer-sub">{[r.school_name, r.coach_name && `HLV ${r.coach_name}`].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td rowSpan={span}><AwardChips awards={r.awards} /></td>
                        </>
                      )}
                      {s ? (
                        <>
                          <td>{s.full_name}</td>
                          <td className="viewer-nowrap">{validDob(s.birth_date) ? fmtDate(s.birth_date) : <Missing />}</td>
                          <td className="viewer-nowrap"><Contact value={s.phone} source={s.phone_source} /></td>
                          <td><Contact value={s.email} source={s.email_source} /></td>
                        </>
                      ) : <td colSpan={4} className="viewer-sub">Đội chưa có học sinh trong hệ thống</td>}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
