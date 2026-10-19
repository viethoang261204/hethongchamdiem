import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import {
  buildPeople, chinaStats, exportChinaExcel, expandImportRows, filterChinaRows, filterPeople, prepareChinaRows,
  validDob, CHINA_IMPORT_COLUMNS,
} from '../../lib/china';
import { readRegistrationFile } from '../../lib/registration';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const sub = { fontSize: 12, color: '#64748b', fontWeight: 400 };

// Đội đủ điều kiện đi Trung Quốc (có giải thưởng chính thức) — admin bổ sung
// thông tin từng học sinh (ngày sinh, SĐT, email):
//   - "Nhập từ file đăng ký EAVN": đọc mọi sheet của file đăng ký, tự khớp
//     học sinh theo họ tên + tên đội (xem POST /students/registration-import)
//   - sửa ngay trên bảng (lưu khi rời ô)
//   - xuất Excel → điền ô trống → "Nhập từ Excel đã xuất" (khớp theo Mã HS)
// Mặc định xem THEO HỌC SINH (đã lọc trùng em thi nhiều giải — buildPeople);
// sửa 1 em là ghi cho mọi bản ghi của em đó ở các giải.
export default function AdminChinaTeams() {
  const { showAlert } = useNotify();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', giai: '', nhom: '', loai: '', thongTin: '' });
  const [view, setView] = useState('hs');
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reg, setReg] = useState(null); // { fileName, rows, sheets, busy, result }
  const regInput = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(() => {
    api.getChinaEligible().then((r) => { setRaw(prepareChinaRows(r)); setError(''); }).catch((e) => setError(e.message || 'Lỗi tải dữ liệu.'));
  }, []);
  useEffect(load, [load]);

  const rows = raw || [];
  const teamFilter = useMemo(() => (view === 'hs' ? { ...f, q: '', thongTin: '' } : f), [view, f]);
  const filtered = useMemo(() => filterChinaRows(rows, teamFilter), [rows, teamFilter]);
  const people = useMemo(() => (view === 'hs' ? filterPeople(buildPeople(filtered), f) : []), [view, filtered, f]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(view === 'hs' ? people : filtered, view === 'hs' ? 30 : 20);
  const comps = useMemo(() => [...new Map(rows.map((r) => [r.competition_id, r.competition_name])).entries()], [rows]);
  const groups = useMemo(() => [...new Map(rows.map((r) => [r.contentGroup.key, r.contentGroup.name])).entries()], [rows]);
  const stats = useMemo(() => chinaStats(rows), [rows]);

  // target: 1 bản ghi học sinh ({ id, ... }) hoặc 1 người đã gộp ({ ids, ... })
  const saveStudent = async (target, field, value) => {
    const v = String(value ?? '').trim();
    if ((target[field] || '') === v) return;
    const ids = target.ids || [target.id];
    try {
      const saved = new Map();
      for (const id of ids) saved.set(id, await api.putStudentInfo(id, { [field]: v }));
      // 1 bản ghi có thể nằm ở nhiều đội đạt giải → cập nhật mọi chỗ
      setRaw((list) => prepareChinaRows(list.map((r) => ({
        ...r, students: r.students.map((s) => (saved.has(s.id) ? { ...s, ...saved.get(s.id) } : s)),
      }))));
    } catch (e) {
      showAlert(e.message || 'Không lưu được thông tin học sinh.', 'error');
    }
  };

  const pickRegistration = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { rows: regRows, sheets } = await readRegistrationFile(file);
      if (!regRows.length) { showAlert('Không tìm thấy sheet học sinh nào (cần cột "Họ và tên thi sinh").', 'error'); return; }
      setReg({ fileName: file.name, rows: regRows, sheets });
    } catch {
      showAlert('Không đọc được file Excel.', 'error');
    }
  };

  const runRegistration = async () => {
    setReg((x) => ({ ...x, busy: true }));
    try {
      const result = await api.importRegistration(reg.rows);
      setReg((x) => ({ ...x, busy: false, result }));
      load();
    } catch (e) {
      setReg((x) => ({ ...x, busy: false }));
      showAlert(e.message || 'Nhập thất bại.', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Đội đi Trung Quốc</h1>
          <p className="page-subtitle">
            {stats.teams} đội đạt giải · {stats.students} học sinh (đã gộp {stats.records - stats.students} bản ghi trùng của em thi nhiều giải) — đủ thông tin: {stats.complete}, còn thiếu: {stats.students - stats.complete}
            {' '}(chưa có SĐT: {stats.noPhone})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => regInput.current?.click()}>Nhập từ file đăng ký EAVN</button>
          <input ref={regInput} type="file" accept=".xlsx,.xls" hidden onChange={pickRegistration} />
          <button type="button" className="btn btn-secondary" disabled={!filtered.length || exporting}
            onClick={async () => { setExporting(true); try { await exportChinaExcel(filtered); } finally { setExporting(false); } }}>
            {exporting ? 'Đang xuất...' : 'Xuất Excel (đã lọc trùng)'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel đã xuất</button>
        </div>
      </div>
      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>{error}</div>}

      <div className="filters-bar" style={{ flexWrap: 'wrap' }}>
        <select className="filter-select" value={view} onChange={(e) => setView(e.target.value)}>
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
          <option value="chinh">Có giải chính</option>
          <option value="rising">Rising Star</option>
          <option value="phu">Chỉ giải phụ</option>
        </select>
        <select className="filter-select" value={f.thongTin} onChange={(e) => set('thongTin', e.target.value)}>
          <option value="">Thông tin HS: tất cả</option>
          <option value="du">{view === 'hs' ? 'HS đã đủ thông tin' : 'Đội đã đủ thông tin'}</option>
          <option value="thieu">{view === 'hs' ? 'HS còn thiếu thông tin' : 'Đội còn HS thiếu thông tin'}</option>
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          {view === 'hs' ? (
            <table>
              <thead>
                <tr><th>Học sinh</th><th>Ngày sinh</th><th>SĐT</th><th>Email</th><th>Đội · giải thưởng</th></tr>
              </thead>
              <tbody>
                {!raw ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
                ) : pageItems.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có học sinh nào.</td></tr>
                ) : pageItems.map((p) => (
                  <tr key={p.key} style={{ verticalAlign: 'top' }}>
                    <td style={{ fontWeight: 600, minWidth: 180 }}>
                      {p.full_name}
                      <div style={sub}>{[p.schools.join(', '), p.coaches.length && `HLV ${p.coaches.join(', ')}`].filter(Boolean).join(' · ')}</div>
                      {p.ids.length > 1 && <div style={sub}>Gộp {p.ids.length} bản ghi — sửa là lưu cho cả {p.ids.length}</div>}
                    </td>
                    <td>
                      <input key={`d-${p.key}-${p.birth_date}`} className="form-input" type="date" style={{ minWidth: 140 }}
                        defaultValue={p.birth_date} onBlur={(e) => saveStudent(p, 'birth_date', e.target.value)} />
                    </td>
                    <td>
                      <input key={`p-${p.key}-${p.phone}`} className="form-input" type="tel" style={{ minWidth: 130 }}
                        defaultValue={p.phone} placeholder="09..." onBlur={(e) => saveStudent(p, 'phone', e.target.value)} />
                      {p.phone_source && <div style={sub}>{p.phone_source}</div>}
                    </td>
                    <td>
                      <input key={`e-${p.key}-${p.email}`} className="form-input" type="email" style={{ minWidth: 200 }}
                        defaultValue={p.email} placeholder="email@..." onBlur={(e) => saveStudent(p, 'email', e.target.value)} />
                      {p.email_source && <div style={sub}>{p.email_source}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {p.entries.map((t) => (
                        <div key={t.id} style={{ marginBottom: 4 }}>
                          <strong>{t.awardText}</strong> — {t.name}
                          <div style={sub}>{t.competition_name} · {t.content_name}{t.board_name ? ` · ${t.board_name}` : ''}</div>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
          <table>
            <thead>
              <tr><th>Đội</th><th>Giải thưởng</th><th>Học sinh</th><th>Ngày sinh</th><th>SĐT</th><th>Email</th></tr>
            </thead>
            <tbody>
              {!raw ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có đội nào.</td></tr>
              ) : pageItems.map((r) => {
                const list = r.students.length ? r.students : [null];
                return list.map((s, i) => (
                  <tr key={`${r.id}-${s?.id || i}`} style={{ verticalAlign: 'top', ...(i > 0 ? { borderTop: 'none' } : {}) }}>
                    {i === 0 && (
                      <>
                        <td rowSpan={list.length} style={{ fontWeight: 600, minWidth: 200 }}>
                          {r.name}
                          <div style={sub}>{r.competition_name}</div>
                          <div style={sub}>{r.content_name}{r.board_name ? ` · ${r.board_name}` : ''}</div>
                          <div style={sub}>{[r.school_name, r.coach_name && `HLV ${r.coach_name}`].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td rowSpan={list.length} style={{ fontSize: 13 }}>{r.awardText}</td>
                      </>
                    )}
                    {s ? (
                      <>
                        <td style={{ minWidth: 160 }}>{s.full_name}</td>
                        <td>
                          <input key={`d-${s.id}-${s.birth_date || ''}`} className="form-input" type="date" style={{ minWidth: 140 }}
                            defaultValue={validDob(s.birth_date) ? s.birth_date : ''} onBlur={(e) => saveStudent(s, 'birth_date', e.target.value)} />
                        </td>
                        <td>
                          <input key={`p-${s.id}-${s.phone || ''}`} className="form-input" type="tel" style={{ minWidth: 130 }}
                            defaultValue={s.phone || ''} placeholder="09..." onBlur={(e) => saveStudent(s, 'phone', e.target.value)} />
                          {s.phone_source && <div style={sub}>{s.phone_source}</div>}
                        </td>
                        <td>
                          <input key={`e-${s.id}-${s.email || ''}`} className="form-input" type="email" style={{ minWidth: 200 }}
                            defaultValue={s.email || ''} placeholder="email@..." onBlur={(e) => saveStudent(s, 'email', e.target.value)} />
                          {s.email_source && <div style={sub}>{s.email_source}</div>}
                        </td>
                      </>
                    ) : <td colSpan={4} style={sub}>Đội chưa có học sinh trong hệ thống</td>}
                  </tr>
                ));
              })}
            </tbody>
          </table>
          )}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>

      {reg && (
        <div className="modal-overlay" onClick={() => !reg.busy && setReg(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Nhập thông tin học sinh từ file đăng ký</h3>
              <button type="button" className="form-modal-close" onClick={() => !reg.busy && setReg(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              {!reg.result ? (
                <>
                  <p style={{ marginTop: 0 }}><strong>{reg.fileName}</strong> — đọc được {reg.rows.length} dòng học sinh:</p>
                  <ul style={{ marginTop: 0 }}>
                    {reg.sheets.map((s) => <li key={s.name}>{s.name}: {s.count}</li>)}
                  </ul>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    Khớp học sinh theo họ tên + tên đội (không phân biệt dấu). Ngày sinh chỉ điền vào ô còn trống.
                    File đăng ký không có SĐT riêng của học sinh nên SĐT/email lấy theo thứ tự: thí sinh → phụ huynh → HLV → đơn vị
                    (ghi rõ nguồn); không ghi đè thông tin admin đã nhập tay.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ marginTop: 0 }}>
                    Đã khớp <strong>{reg.result.matchedRows}</strong>/{reg.result.total} dòng → <strong>{reg.result.matchedStudents}</strong> học sinh,
                    cập nhật <strong>{reg.result.updated}</strong> học sinh.
                  </p>
                  {reg.result.unmatchedCount > 0 && (
                    <>
                      <p style={{ fontSize: 13, color: '#64748b' }}>
                        {reg.result.unmatchedCount} dòng không khớp (thường là học sinh đăng ký nhưng không có trong đội nào của hệ thống,
                        hoặc tên gõ khác nhau){reg.result.unmatchedCount > reg.result.unmatched.length ? ` — hiện ${reg.result.unmatched.length} dòng đầu` : ''}:
                      </p>
                      <div className="table-container" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        <table>
                          <thead><tr><th>Sheet</th><th>Dòng</th><th>Học sinh</th><th>Đội</th><th>Lý do</th></tr></thead>
                          <tbody>
                            {reg.result.unmatched.map((u) => (
                              <tr key={`${u.sheet}-${u.row}`}><td>{u.sheet}</td><td>{u.row}</td><td>{u.full_name}</td><td>{u.team}</td><td style={{ fontSize: 12 }}>{u.reason}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="form-actions">
              {reg.result ? (
                <button type="button" className="btn btn-primary" onClick={() => setReg(null)}>Đóng</button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" disabled={reg.busy} onClick={() => setReg(null)}>Hủy</button>
                  <button type="button" className="btn btn-primary" disabled={reg.busy} onClick={runRegistration}>
                    {reg.busy ? 'Đang nhập...' : `Nhập ${reg.rows.length} dòng`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <ExcelImportModal
          title="Nhập thông tin học sinh từ Excel đã xuất"
          columns={CHINA_IMPORT_COLUMNS}
          templateFilename="mau-thong-tin-hoc-sinh-di-trung-quoc.xlsx"
          notePrereq='Dùng chính file "Xuất Excel" ở trang này: điền các ô Ngày sinh (dd/mm/yyyy) / SĐT / Email còn trống, giữ nguyên cột Mã HS. Ô để trống sẽ giữ nguyên giá trị cũ.'
          onImport={(list) => api.importStudentInfo(expandImportRows(list))}
          onDone={load}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
