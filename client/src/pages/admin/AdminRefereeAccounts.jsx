import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminRefereeAccounts() {
  const { showConfirm, showAlert } = useNotify();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'add' | { id, ... }
  const [form, setForm] = useState({ username: '', password: '', fullName: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, securityCode: '' }
  const SECURITY_CODE = '26122004';

  const load = async () => {
    try {
      const data = await api.getUsers('referee');
      setList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const s = search.toLowerCase().trim();
    return list.filter(u =>
      (u.username || '').toLowerCase().includes(s) ||
      (u.fullName || '').toLowerCase().includes(s)
    );
  }, [list, search]);

  const openAdd = () => {
    setModal('add');
    setForm({ username: '', password: '', fullName: '' });
    setError('');
    setErrors({});
  };

  const openEdit = (u) => {
    setModal({ id: u.id });
    setForm({ username: u.username, password: '', fullName: u.fullName || '' });
    setError('');
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim()) errs.username = 'Tên đăng nhập không được để trống.';
    if (modal === 'add' && !form.password) errs.password = 'Mật khẩu không được để trống.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập đầy đủ thông tin bắt buộc.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modal === 'add') {
        await api.postUser({ username: form.username.trim(), fullName: form.fullName?.trim() || form.username.trim(), password: form.password });
      } else {
        const body = { fullName: form.fullName?.trim() || form.username };
        if (form.password) body.password = form.password;
        await api.putUser(modal.id, body);
      }
      setModal(null);
      load();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      setError(e.message || 'Lỗi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa tài khoản trọng tài này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteUser(deleteConfirm.id);
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
          <h1 className="page-title">Quản lý tài khoản trọng tài</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} tài khoản</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm tài khoản</button>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Tìm theo tên đăng nhập, họ tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tên đăng nhập</th>
                <th>Họ tên</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.fullName || '-'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(u)}>Sửa</button>
                      <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(u.id)}>Xóa</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm tài khoản trọng tài' : 'Sửa tài khoản'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
            {error && <div className="form-error-inline" style={{ marginBottom: 16 }}>{error}</div>}
            <div className="form-group">
              <label className="form-label">Tên đăng nhập <span style={{ color: '#dc2626' }}>*</span></label>
              <input className={`form-input ${errors.username ? 'form-input-error' : ''}`} value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setErrors({ ...errors, username: '' }); }} disabled={modal !== 'add'} />
              {errors.username && <div className="form-error-text">{errors.username}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Họ tên</label>
              <input className="form-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu {modal !== 'add' ? '(để trống nếu không đổi)' : <span style={{ color: '#dc2626' }}>*</span>}</label>
              <input type="password" className={`form-input ${errors.password ? 'form-input-error' : ''}`} value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: '' }); }} placeholder={modal !== 'add' ? 'Để trống = giữ nguyên' : ''} />
              {errors.password && <div className="form-error-text">{errors.password}</div>}
            </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : modal === 'add' ? 'Lưu tài khoản' : 'Lưu thay đổi'}</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa tài khoản:</p>
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
