import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { exportChinaExcel, filterChinaRows, prepareChinaRows, CHINA_IMPORT_COLUMNS } from '../../lib/china';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

// Đội đủ điều kiện đi Trung Quốc (có giải thưởng chính thức) — admin nhập
// email/SĐT liên hệ: sửa ngay trên bảng (lưu khi rời ô) hoặc nhập từ file
// Excel đã xuất ở đây (khớp theo cột Mã đội).
export default function AdminChinaTeams() {
  const { showAlert } = useNotify();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', giai: '', nhom: '', loai: '', lienHe: '' });
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(() => {
    api.getChinaEligible().then((r) => { setRaw(prepareChinaRows(r)); setError(''); }).catch((e) => setError(e.message || 'Lỗi tải dữ liệu.'));
  }, []);
  useEffect(load, [load]);

  const rows = raw || [];
  const filtered = useMemo(() => filterChinaRows(rows, f), [rows, f]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 30);
  const comps = useMemo(() => [...new Map(rows.map((r) => [r.competition_id, r.competition_name])).entries()], [rows]);
  const groups = useMemo(() => [...new Map(rows.map((r) => [r.contentGroup.key, r.contentGroup.name])).entries()], [rows]);
  const full = rows.filter((r) => r.hasEmail && r.hasPhone).length;

  const saveContact = async (row, field, value) => {
    const v = value.trim();
    if ((row[field] || '') === v) return;
    try {
      const saved = await api.putTeamContact(row.id, {
        contact_email: field === 'contact_email' ? v : row.contact_email,
        contact_phone: field === 'contact_phone' ? v : row.contact_phone,
      });
      setRaw((list) => prepareChinaRows(list.map((r) => (r.id === row.id ? { ...r, ...saved } : r))));
    } catch (e) {
      showAlert(e.message || 'Không lưu được liên hệ.', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Đội đi Trung Quốc</h1>
          <p className="page-subtitle">Đội có giải thưởng chính thức ở mọi giải — {rows.length} đội, đã đủ email + SĐT: {full}, còn thiếu: {rows.length - full}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" disabled={!filtered.length || exporting}
            onClick={async () => { setExporting(true); try { await exportChinaExcel(filtered); } finally { setExporting(false); } }}>
            {exporting ? 'Đang xuất...' : `Xuất Excel (${filtered.length})`}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>Nhập liên hệ từ Excel</button>
        </div>
      </div>
      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>{error}</div>}

      <div className="filters-bar" style={{ flexWrap: 'wrap' }}>
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
          <option value="chinh">Có giải chính</option>
          <option value="rising">Rising Star</option>
          <option value="phu">Chỉ giải phụ</option>
        </select>
        <select className="filter-select" value={f.lienHe} onChange={(e) => set('lienHe', e.target.value)}>
          <option value="">Liên hệ: tất cả</option>
          <option value="du">Đã đủ email + SĐT</option>
          <option value="thieu">Còn thiếu liên hệ</option>
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Đội</th><th>Giải đấu</th><th>Nội dung · Bảng</th><th>Giải thưởng</th><th>Trường / HLV</th><th>Email liên hệ</th><th>SĐT liên hệ</th></tr>
            </thead>
            <tbody>
              {!raw ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có đội nào.</td></tr>
              ) : pageItems.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}<div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>{r.students}</div></td>
                  <td>{r.competition_name}</td>
                  <td>{r.content_name}<div style={{ fontSize: 12, color: '#64748b' }}>{r.board_name}</div></td>
                  <td style={{ fontSize: 13 }}>{r.awardText}</td>
                  <td style={{ fontSize: 13 }}>{r.school_name || '—'}<div style={{ color: '#64748b' }}>{r.coach_name || ''}</div></td>
                  <td>
                    <input key={`e-${r.id}-${r.contact_email || ''}`} className="form-input" type="email" style={{ minWidth: 190 }}
                      defaultValue={r.contact_email || ''} placeholder="email@..." onBlur={(e) => saveContact(r, 'contact_email', e.target.value)} />
                  </td>
                  <td>
                    <input key={`p-${r.id}-${r.contact_phone || ''}`} className="form-input" type="tel" style={{ minWidth: 130 }}
                      defaultValue={r.contact_phone || ''} placeholder="09..." onBlur={(e) => saveContact(r, 'contact_phone', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>

      {importOpen && (
        <ExcelImportModal
          title="Nhập email / SĐT liên hệ từ Excel"
          columns={CHINA_IMPORT_COLUMNS}
          templateFilename="mau-lien-he-doi-di-trung-quoc.xlsx"
          notePrereq='Dùng chính file "Xuất Excel" ở trang này: điền cột Email liên hệ / SĐT liên hệ, giữ nguyên cột Mã đội. Ô để trống sẽ giữ nguyên giá trị cũ.'
          onImport={(r) => api.importTeamContacts(r)}
          onDone={load}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
