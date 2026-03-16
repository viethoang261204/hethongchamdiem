import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminCompetitions() {
  const { showConfirm, showAlert } = useNotify();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState(''); // '' | 'active' | 'inactive'
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', location: '', startDate: '', endDate: '', isActive: true });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, securityCode: '' }
  const SECURITY_CODE = '26122004';

  const load = async () => {
    try {
      const data = await api.getCompetitions();
      setList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let l = list;
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(c => (c.name || '').toLowerCase().includes(s) || (c.location || '').toLowerCase().includes(s));
    }
    if (filterActive === 'active') l = l.filter(c => c.isActive !== false);
    if (filterActive === 'inactive') l = l.filter(c => c.isActive === false);
    return l;
  }, [list, search, filterActive]);

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', description: '', location: '', startDate: '', endDate: '', isActive: true });
  };

  const openEdit = (c) => {
    setModal({ id: c.id, ...c });
    setForm({ name: c.name, description: c.description || '', location: c.location || '', startDate: c.startDate || '', endDate: c.endDate || '', isActive: c.isActive !== false });
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Tên cuộc thi không được để trống.';
    if (!form.location.trim()) errs.location = 'Địa điểm không được để trống.';
    if (!form.startDate) errs.startDate = 'Ngày bắt đầu không được để trống.';
    if (!form.endDate) errs.endDate = 'Ngày kết thúc không được để trống.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập đầy đủ thông tin bắt buộc.', 'error');
      return;
    }
    try {
      if (modal === 'add') {
        await api.postCompetition(form);
      } else if (modal?.id) {
        await api.putCompetition(modal.id, form);
      }
      setModal(null);
      load();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa cuộc thi này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteCompetition(deleteConfirm.id);
      setDeleteConfirm(null);
      load();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý cuộc thi</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} cuộc thi</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm cuộc thi</button>
      </div>
      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên, địa điểm..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang mở</option>
          <option value="inactive">Đã đóng</option>
        </select>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Địa điểm</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/admin/competitions/${c.id}/contents`}>{c.name}</Link>
                </td>
                <td>{c.location}</td>
                <td>{c.startDate} → {c.endDate}</td>
                <td>{c.isActive ? 'Đang mở' : 'Đã đóng'}</td>
                <td>
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(c)}>Sửa</button>
                  <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(c.id)}>Xóa</button>
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
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm cuộc thi' : 'Sửa cuộc thi'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
            <div className="form-group">
              <label className="form-label">Tên cuộc thi <span style={{ color: '#dc2626' }}>*</span></label>
              <input className={`form-input ${errors.name ? 'form-input-error' : ''}`} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }} />
              {errors.name && <div className="form-error-text">{errors.name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Mô tả</label>
              <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Địa điểm <span style={{ color: '#dc2626' }}>*</span></label>
              <input className={`form-input ${errors.location ? 'form-input-error' : ''}`} value={form.location} onChange={(e) => { setForm({ ...form, location: e.target.value }); setErrors({ ...errors, location: '' }); }} />
              {errors.location && <div className="form-error-text">{errors.location}</div>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ngày bắt đầu <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" className={`form-input ${errors.startDate ? 'form-input-error' : ''}`} value={form.startDate} onChange={(e) => { setForm({ ...form, startDate: e.target.value }); setErrors({ ...errors, startDate: '' }); }} />
                {errors.startDate && <div className="form-error-text">{errors.startDate}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Ngày kết thúc <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" className={`form-input ${errors.endDate ? 'form-input-error' : ''}`} value={form.endDate} onChange={(e) => { setForm({ ...form, endDate: e.target.value }); setErrors({ ...errors, endDate: '' }); }} />
                {errors.endDate && <div className="form-error-text">{errors.endDate}</div>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select className="form-input form-select" value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}>
                <option value="active">Đang mở</option>
                <option value="inactive">Đã đóng</option>
              </select>
            </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>Lưu cuộc thi</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa cuộc thi:</p>
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
