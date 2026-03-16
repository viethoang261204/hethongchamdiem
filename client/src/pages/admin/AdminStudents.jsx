import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminStudents() {
  const { showConfirm, showAlert } = useNotify();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ fullName: '', class: '', school: '', grade: '', dateOfBirth: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const load = async () => {
    try {
      const data = await api.getStudents();
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
      l = l.filter(x =>
        (x.fullName || '').toLowerCase().includes(s) ||
        (x.class || '').toLowerCase().includes(s) ||
        (x.school || '').toLowerCase().includes(s)
      );
    }
    if (filterGrade) l = l.filter(x => (x.grade || '') === filterGrade);
    return l;
  }, [list, search, filterGrade]);

  const grades = useMemo(() => [...new Set(list.map(s => s.grade).filter(Boolean))].sort(), [list]);

  const openAdd = () => {
    setModal('add');
    setForm({ fullName: '', class: '', school: '', grade: '', dateOfBirth: '' });
    setErrors({});
  };

  const openEdit = (s) => {
    setModal({ id: s.id });
    setForm({
      fullName: s.fullName,
      class: s.class,
      school: s.school,
      grade: s.grade,
      dateOfBirth: s.dateOfBirth || '',
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = 'Họ và tên không được để trống.';
    if (!form.class?.trim()) errs.class = 'Lớp không được để trống.';
    if (!form.school?.trim()) errs.school = 'Trường không được để trống.';
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
        await api.postStudent(form);
      } else {
        await api.putStudent(modal.id, form);
      }
      setModal(null);
      load();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa học sinh này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteStudent(deleteConfirm.id);
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
          <h1 className="page-title">Quản lý học sinh</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} học sinh</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm học sinh</button>
      </div>
      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên, lớp, trường..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
          <option value="">Tất cả khối</option>
          {grades.map(g => <option key={g} value={g}>Khối {g}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Lớp</th>
                <th>Trường</th>
                <th>Khối</th>
                <th>Ngày sinh</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.fullName}</td>
                <td>{s.class}</td>
                <td>{s.school}</td>
                <td>{s.grade}</td>
                <td>{s.dateOfBirth}</td>
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
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm học sinh' : 'Sửa học sinh'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
            <div className="form-group">
              <label className="form-label">Họ và tên <span style={{ color: '#dc2626' }}>*</span></label>
              <input className={`form-input ${errors.fullName ? 'form-input-error' : ''}`} value={form.fullName} onChange={(e) => { setForm({ ...form, fullName: e.target.value }); setErrors({ ...errors, fullName: '' }); }} />
              {errors.fullName && <div className="form-error-text">{errors.fullName}</div>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Lớp <span style={{ color: '#dc2626' }}>*</span></label>
                <input className={`form-input ${errors.class ? 'form-input-error' : ''}`} value={form.class} onChange={(e) => { setForm({ ...form, class: e.target.value }); setErrors({ ...errors, class: '' }); }} />
                {errors.class && <div className="form-error-text">{errors.class}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Khối</label>
                <input className="form-input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Trường <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className={`form-input ${errors.school ? 'form-input-error' : ''}`}
                value={form.school}
                onChange={(e) => { setForm({ ...form, school: e.target.value }); setErrors({ ...errors, school: '' }); }}
                placeholder="VD: THPT Chuyên Lê Hồng Phong"
              />
              {errors.school && <div className="form-error-text">{errors.school}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Ngày sinh</label>
              <input type="date" className="form-input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu học sinh' : 'Lưu thay đổi'}</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa học sinh:</p>
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
