import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { chinaStats, exportChinaExcel, filterChinaRows, fmtDate, prepareChinaRows } from '../../lib/china';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

const Missing = () => <span className="viewer-missing">Chưa có</span>;

// Đội đủ điều kiện đi Trung Quốc = có giải thưởng chính thức (mọi giải, mọi
// loại giải), kèm thông tin từng học sinh. Cổng Tra cứu chỉ XEM + xuất Excel;
// nhập thông tin ở trang admin.
export default function ViewerChina() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', giai: '', nhom: '', loai: '', thongTin: '' });
  const [exporting, setExporting] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.getChinaEligible().then((r) => setRaw(prepareChinaRows(r))).catch((e) => setError(e.message || 'Không tải được dữ liệu.'));
  }, []);

  const rows = raw || [];
  const filtered = useMemo(() => filterChinaRows(rows, f), [rows, f]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 20);
  const comps = useMemo(() => [...new Map(rows.map((r) => [r.competition_id, r.competition_name])).entries()], [rows]);
  const groups = useMemo(() => [...new Map(rows.map((r) => [r.contentGroup.key, r.contentGroup.name])).entries()], [rows]);
  const stats = useMemo(() => chinaStats(rows), [rows]);

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!raw) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải danh sách...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Đội đủ điều kiện đi Trung Quốc</h1>
        <p className="referee-page-subtitle">Tất cả các đội có giải thưởng chính thức ở mọi giải (Giải Nhất / Nhì / Ba, Top 5 / Top 10, Rising Star...), kèm họ tên, ngày sinh, giới tính, SĐT và email của từng học sinh.</p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{stats.teams}</div><div className="rt-stat-label">Đội đủ điều kiện</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{stats.students}</div><div className="rt-stat-label">Học sinh</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{stats.complete}</div><div className="rt-stat-label">HS đủ 4 thông tin</div></div>
        <div className="rt-stat rt-stat-pending"><div className="rt-stat-value">{stats.students - stats.complete}</div><div className="rt-stat-label">HS còn thiếu thông tin</div></div>
      </div>

      <div className="filters-bar viewer-filters">
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
          <option value="chinh">Có giải chính (Nhất/Nhì/Ba, Rising Star)</option>
          <option value="rising">Rising Star</option>
          <option value="phu">Chỉ giải phụ (Top 5 / Top 10...)</option>
        </select>
        <select className="filter-select" value={f.thongTin} onChange={(e) => set('thongTin', e.target.value)}>
          <option value="">Thông tin HS: tất cả</option>
          <option value="du">Đội đã đủ thông tin</option>
          <option value="thieu">Đội còn HS thiếu thông tin</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={!filtered.length || exporting}
          onClick={async () => { setExporting(true); try { await exportChinaExcel(filtered); } finally { setExporting(false); } }}>
          {exporting ? 'Đang xuất...' : `Xuất Excel (${filtered.length} đội)`}
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="viewer-china-table">
            <thead>
              <tr><th>Đội</th><th>Giải thưởng</th><th>Học sinh</th><th>Ngày sinh</th><th>Giới tính</th><th>SĐT</th><th>Email</th></tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có đội nào.</td></tr>
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
                        <td rowSpan={span}><div className="viewer-chips">{r.awards.map((a) => <span key={a} className={`viewer-chip ${a !== 'Top 5' && a !== 'Top 10' ? 'viewer-chip-gold' : ''}`}>{a}</span>)}</div></td>
                      </>
                    )}
                    {s ? (
                      <>
                        <td>{s.full_name}</td>
                        <td className="viewer-nowrap">{fmtDate(s.birth_date) || <Missing />}</td>
                        <td>{s.gender || <Missing />}</td>
                        <td className="viewer-nowrap">{s.phone || <Missing />}{s.phone && s.phone_source && <div className="viewer-sub">{s.phone_source}</div>}</td>
                        <td>{s.email || <Missing />}{s.email && s.email_source && <div className="viewer-sub">{s.email_source}</div>}</td>
                      </>
                    ) : <td colSpan={5} className="viewer-sub">Đội chưa có học sinh trong hệ thống</td>}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
