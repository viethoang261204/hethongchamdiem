import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { exportChinaExcel, filterChinaRows, prepareChinaRows } from '../../lib/china';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

// Đội đủ điều kiện đi Trung Quốc = có giải thưởng chính thức (mọi giải, mọi
// loại giải). Cổng Tra cứu chỉ XEM + xuất Excel; nhập liên hệ ở trang admin.
export default function ViewerChina() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', giai: '', nhom: '', loai: '', lienHe: '' });
  const [exporting, setExporting] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.getChinaEligible().then((r) => setRaw(prepareChinaRows(r))).catch((e) => setError(e.message || 'Không tải được dữ liệu.'));
  }, []);

  const rows = raw || [];
  const filtered = useMemo(() => filterChinaRows(rows, f), [rows, f]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 30);
  const comps = useMemo(() => [...new Map(rows.map((r) => [r.competition_id, r.competition_name])).entries()], [rows]);
  const groups = useMemo(() => [...new Map(rows.map((r) => [r.contentGroup.key, r.contentGroup.name])).entries()], [rows]);
  const full = rows.filter((r) => r.hasEmail && r.hasPhone).length;

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!raw) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải danh sách...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Đội đủ điều kiện đi Trung Quốc</h1>
        <p className="referee-page-subtitle">Tất cả các đội có giải thưởng chính thức ở mọi giải (Giải Nhất / Nhì / Ba, Top 5 / Top 10, Rising Star...), kèm email và số điện thoại liên hệ.</p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{rows.length}</div><div className="rt-stat-label">Đội đủ điều kiện</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{full}</div><div className="rt-stat-label">Đã có đủ email + SĐT</div></div>
        <div className="rt-stat rt-stat-pending"><div className="rt-stat-value">{rows.length - full}</div><div className="rt-stat-label">Còn thiếu liên hệ</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{new Set(rows.flatMap((r) => r.student_ids || [])).size}</div><div className="rt-stat-label">Học sinh trong các đội này</div></div>
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
        <select className="filter-select" value={f.lienHe} onChange={(e) => set('lienHe', e.target.value)}>
          <option value="">Liên hệ: tất cả</option>
          <option value="du">Đã đủ email + SĐT</option>
          <option value="thieu">Còn thiếu liên hệ</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={!filtered.length || exporting}
          onClick={async () => { setExporting(true); try { await exportChinaExcel(filtered); } finally { setExporting(false); } }}>
          {exporting ? 'Đang xuất...' : `Xuất Excel (${filtered.length})`}
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Đội</th><th>Giải đấu</th><th>Nội dung · Bảng</th><th>Giải thưởng</th><th>Trường / HLV</th><th>Email</th><th>SĐT</th></tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có đội nào.</td></tr>
              ) : pageItems.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong><div className="viewer-sub">{r.students}</div></td>
                  <td>{r.competition_name}</td>
                  <td>{r.content_name}<div className="viewer-sub">{r.board_name}</div></td>
                  <td><div className="viewer-chips">{r.awards.map((a) => <span key={a} className={`viewer-chip ${a !== 'Top 5' && a !== 'Top 10' ? 'viewer-chip-gold' : ''}`}>{a}</span>)}</div></td>
                  <td>{r.school_name || '—'}<div className="viewer-sub">{r.coach_name || ''}</div></td>
                  <td>{r.contact_email || <span className="viewer-missing">Chưa có</span>}</td>
                  <td>{r.contact_phone || <span className="viewer-missing">Chưa có</span>}</td>
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
