import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

export default function AdminSchools() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(() => api.getSchools(), []);
  const list = data || [];
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', level: 'THPT', province: '', district: '' });
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
    if (filterLevel) l = l.filter(x => x.level === filterLevel);
    if (filterProvince) l = l.filter(x => (x.province || '') === filterProvince);
    return l;
  }, [list, search, filterLevel, filterProvince]);

  const provinces = useMemo(() =>
    [...new Set(list.map(s => s.province).filter(Boolean))].sort(),
    [list]
  );

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', level: 'THPT', province: '', district: '' });
    setErrors({});
  };

  const openEdit = (s) => {
    setModal({ id: s.id });
    setForm({
      name: s.name || '',
      level: s.level || 'THPT',
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
          level: form.level,
          province: form.province.trim(),
          district: form.district.trim(),
        });
      } else {
        await api.putSchool(modal.id, {
          name: form.name.trim(),
          level: form.level,
          province: form.province.trim(),
          district: form.district.trim(),
        });
      }
      setModal(null);
      setData(null);
      const updated = await api.getSchools();
      setData(updated);
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa trường này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
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
      setData(null);
      const updated = await api.getSchools();
      setData(updated);
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const levelLabel = (l) => {
    if (l === 'MN') return 'Mầm non';
    if (l === 'TH') return 'Tiểu học';
    if (l === 'THCS') return 'THCS';
    if (l === 'THPT') return 'THPT';
    return l;
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý trường học</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} trường</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trường</button>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên, tỉnh, quận..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
          <option value="">Tất cả bậc</option>
          <option value="MN">Mầm non</option>
          <option value="TH">Tiểu học</option>
          <option value="THCS">THCS</option>
          <option value="THPT">THPT</option>
        </select>
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
                <th>Tên trường</th>
                <th>Bậc</th>
                <th>Tỉnh/TP</th>
                <th>Quận/Huyện</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{levelLabel(s.level)}</td>
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
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm trường' : 'Sửa trường'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Tên trường <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder="VD: THPT Chuyên Lê Hồng Phong"
                />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Bậc</label>
                <select className="form-input form-select" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                  <option value="MN">Mầm non</option>
                  <option value="TH">Tiểu học (TH)</option>
                  <option value="THCS">THCS</option>
                  <option value="THPT">THPT</option>
                </select>
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
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu trường' : 'Lưu thay đổi'}</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa trường:</p>
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
    </div>
  );
}
