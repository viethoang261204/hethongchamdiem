import { useState, useMemo } from 'react';
import { api } from '../../api';
import { clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const IMPORT_COLUMNS = [
  { key: 'name', label: 'Tên trường/trung tâm', required: true, example: 'THPT Chuyên Lê Hồng Phong' },
  { key: 'province', label: 'Tỉnh/TP', required: false, example: 'TP. Hồ Chí Minh' },
  { key: 'district', label: 'Quận/Huyện', required: false, example: 'Quận 5' },
];

export default function AdminSchools() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(() => api.getSchools(), []);
  const list = data || [];
  const [search, setSearch] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [modal, setModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ name: '', province: '', district: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const filtered = useMemo(() => {
    let l = list;
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(x =>
        (x.name || '').toLowerCase().includes(s) ||
        (x.province || '').toLowerCase().includes(s) ||
        (x.district || '').toLowerCase().includes(s)
      );
    }
    if (filterProvince) l = l.filter(x => (x.province || '') === filterProvince);
    return l;
  }, [list, search, filterProvince]);

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 10);

  const provinces = useMemo(() =>
    [...new Set(list.map(s => s.province).filter(Boolean))].sort(),
    [list]
  );

  // Trang khác (Học sinh, Đội thi...) đọc danh sách trường qua cache
  // (capi.getSchools) — phải clear để không thấy dữ liệu cũ sau khi sửa ở đây.
  const refreshSchools = async () => {
    clearApiCache('getSchools');
    setData(null);
    const updated = await api.getSchools();
    setData(updated);
  };

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', province: '', district: '' });
    setErrors({});
  };

  const openEdit = (s) => {
    setModal({ id: s.id });
    setForm({
      name: s.name || '',
      province: s.province || '',
      district: s.district || '',
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Tên trường không được để trống.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập tên trường.', 'error');
      return;
    }
    try {
      if (modal === 'add') {
        await api.postSchool({
          name: form.name.trim(),
          province: form.province.trim(),
          district: form.district.trim(),
        });
      } else {
        await api.putSchool(modal.id, {
          name: form.name.trim(),
          province: form.province.trim(),
          district: form.district.trim(),
        });
      }
      setModal(null);
      await refreshSchools();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa trường/trung tâm này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteSchool(deleteConfirm.id);
      setDeleteConfirm(null);
      await refreshSchools();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý các trường - trung tâm</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} trường</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trường/trung tâm</button>
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên, tỉnh, quận..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}>
          <option value="">Tất cả tỉnh/TP</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tên trường/trung tâm</th>
                <th>Tỉnh/TP</th>
                <th>Quận/Huyện</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : pageItems.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.province || '-'}</td>
                  <td>{s.district || '-'}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(s)}>Sửa</button>
                    <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(s.id)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm trường/trung tâm' : 'Sửa trường/trung tâm'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Tên trường/trung tâm <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder="VD: THPT Chuyên Lê Hồng Phong"
                />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tỉnh/TP</label>
                  <input
                    className="form-input"
                    value={form.province}
                    onChange={(e) => setForm({ ...form, province: e.target.value })}
                    placeholder="VD: TP. Hồ Chí Minh"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Quận/Huyện</label>
                  <input
                    className="form-input"
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })}
                    placeholder="VD: Quận 5"
                  />
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu trường/trung tâm' : 'Lưu thay đổi'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Xác nhận xóa</h3>
              <button type="button" className="form-modal-close" onClick={() => setDeleteConfirm(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa trường/trung tâm:</p>
              <div className="form-group">
                <label className="form-label">Mã bảo mật</label>
                <input
                  type="password"
                  className="form-input"
                  value={deleteConfirm.securityCode}
                  onChange={(e) => setDeleteConfirm({ ...deleteConfirm, securityCode: e.target.value })}
                  placeholder="Nhập mã bảo mật"
                  autoFocus
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Hủy</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <ExcelImportModal
          title="Nhập trường/trung tâm từ Excel"
          columns={IMPORT_COLUMNS}
          templateFilename="mau-truong-hoc.xlsx"
          onImport={(rows) => api.importSchools(rows)}
          onDone={refreshSchools}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
