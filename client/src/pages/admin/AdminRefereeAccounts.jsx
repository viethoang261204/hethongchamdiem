import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { useAuth } from '../../App';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const IMPORT_COLUMNS = [
  { key: 'email', label: 'Email', required: true, example: 'trongtai1@enjoyai.vn' },
  { key: 'full_name', label: 'Họ tên', required: false, example: 'Nguyễn Văn A' },
  { key: 'password', label: 'Mật khẩu (bỏ trống = tự sinh)', required: false, example: '' },
];

export default function AdminRefereeAccounts() {
  const { showConfirm, showAlert } = useNotify();
  const { user } = useAuth();
  const { data, loading, error, reload, setData } = useApiLoader(() => api.getUsers('referee'), []);
  const { data: boardsData } = useApiLoader(() => api.getAllBoards(), []);
  const allBoards = boardsData || [];
  const list = data || [];
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [boardsModal, setBoardsModal] = useState(null); // { user, selected: Set, loading, saving }
  const SECURITY_CODE = '26122004';

  const openBoards = async (u) => {
    setBoardsModal({ user: u, selected: new Set(), loading: true, saving: false });
    try {
      const ids = await api.getUserBoards(u.id);
      setBoardsModal({ user: u, selected: new Set(ids), loading: false, saving: false });
    } catch (e) {
      showAlert(e.message || 'Không tải được danh sách phân quyền.', 'error');
      setBoardsModal(null);
    }
  };

  const toggleBoard = (boardId) => {
    setBoardsModal((m) => {
      const selected = new Set(m.selected);
      if (selected.has(boardId)) selected.delete(boardId); else selected.add(boardId);
      return { ...m, selected };
    });
  };

  const saveBoards = async () => {
    setBoardsModal((m) => ({ ...m, saving: true }));
    try {
      await api.putUserBoards(boardsModal.user.id, [...boardsModal.selected]);
      setBoardsModal(null);
      showAlert('Đã lưu phân quyền bảng đấu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu phân quyền.', 'error');
      setBoardsModal((m) => ({ ...m, saving: false }));
    }
  };

  const load = async () => reload();

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const s = search.toLowerCase().trim();
    return list.filter(u =>
      (u.username || '').toLowerCase().includes(s) ||
      (u.full_name || '').toLowerCase().includes(s)
    );
  }, [list, search]);

  const openAdd = () => {
    setModal('add');
    setForm({ email: '', password: '', full_name: '' });
    setError('');
    setErrors({});
  };

  const openEdit = (u) => {
    setModal({ id: u.id });
    // Bảng users dùng username làm email đăng nhập, không có cột email riêng
    setForm({ email: u.username, password: '', full_name: u.full_name || '' });
    setError('');
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.email.trim()) errs.email = 'Email không được để trống.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email không hợp lệ.';
    if (modal === 'add' && !form.password) errs.password = 'Mật khẩu không được để trống.';
    if (modal === 'add' && form.password && form.password.length < 6) errs.password = 'Mật khẩu phải ít nhất 6 ký tự.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập đầy đủ thông tin bắt buộc.', 'error');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (modal === 'add') {
        // Token JWT tự động gắn từ localStorage (lib/http.js)
        await api.createRefereeUser({
          email: form.email.trim(),
          password: form.password,
          username: form.email.trim().split('@')[0],
          full_name: form.full_name?.trim() || form.email.trim().split('@')[0],
        });
      } else {
        // Sửa: full_name + (tùy chọn) mật khẩu mới
        const body = { full_name: form.full_name?.trim() || form.email.split('@')[0] };
        if (form.password) body.password = form.password;
        await api.putUser(modal.id, body);
      }
      setModal(null);
      load();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      setError(e.message || 'Lỗi khi lưu tài khoản.');
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm tài khoản</button>
        </div>
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

      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tên đăng nhập (email)</th>
                <th>Họ tên</th>
                <th>Vai trò</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có tài khoản trọng tài. Bấm "Thêm tài khoản" để tạo mới.</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.full_name || '-'}</td>
                    <td><span className="badge badge-blue">{u.role}</span></td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(u)}>Sửa</button>
                      <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => openBoards(u)}>Phân quyền bảng đấu</button>
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
              <label className="form-label">Email đăng nhập <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className={`form-input ${errors.email ? 'form-input-error' : ''}`}
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: '' }); }}
                disabled={modal !== 'add'}
                placeholder="trongtai@enjoyai.vn"
              />
              {errors.email && <div className="form-error-text">{errors.email}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Họ tên</label>
              <input
                className="form-input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu {modal !== 'add' ? '(để trống nếu không đổi)' : <span style={{ color: '#dc2626' }}>*</span>}</label>
              <input
                type="password"
                className={`form-input ${errors.password ? 'form-input-error' : ''}`}
                value={form.password}
                onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: '' }); }}
                placeholder={modal !== 'add' ? 'Để trống = giữ nguyên' : 'Ít nhất 6 ký tự'}
              />
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

      {boardsModal && (
        <div className="modal-overlay" onClick={() => !boardsModal.saving && setBoardsModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Phân quyền bảng đấu — {boardsModal.user.full_name || boardsModal.user.username}</h3>
              <button type="button" className="form-modal-close" onClick={() => setBoardsModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <p style={{ marginBottom: 16, color: '#374151' }}>
                Chọn các bảng đấu mà trọng tài này được phép chấm điểm. Nếu không chọn bảng nào, trọng tài sẽ thấy và chấm được <strong>tất cả</strong> các đội (chưa giới hạn).
              </p>
              {boardsModal.loading ? (
                <p style={{ textAlign: 'center', padding: 24 }}>Đang tải...</p>
              ) : allBoards.length === 0 ? (
                <p style={{ color: '#888' }}>Chưa có bảng đấu nào trong hệ thống.</p>
              ) : (
                <div className="checkbox-list">
                  {allBoards.map((b) => (
                    <label key={b.id}>
                      <input
                        type="checkbox"
                        checked={boardsModal.selected.has(b.id)}
                        onChange={() => toggleBoard(b.id)}
                      />
                      {' '}{b.name}{b.age_group ? ` — ${b.age_group}` : ''}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBoardsModal(null)} disabled={boardsModal.saving}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveBoards} disabled={boardsModal.loading || boardsModal.saving}>
                {boardsModal.saving ? 'Đang lưu...' : 'Lưu phân quyền'}
              </button>
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

      {importOpen && (
        <ExcelImportModal
          title="Nhập tài khoản trọng tài từ Excel"
          columns={IMPORT_COLUMNS}
          templateFilename="mau-tai-khoan-trong-tai.xlsx"
          notePrereq="Tên đăng nhập lấy tự động từ phần trước @ của email. Nếu để trống cột Mật khẩu, hệ thống tự sinh mật khẩu 8 ký tự — chỉ hiện được 1 lần ngay sau khi nhập, hãy chép lại gửi cho trọng tài."
          onImport={(rows) => api.importRefereeUsers(rows)}
          onDone={load}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
