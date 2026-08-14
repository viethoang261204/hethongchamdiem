import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
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
  const { data: contentsData } = useApiLoader(() => api.getAllContents(), []);
  const allContents = contentsData || [];
  const { data: fieldsData } = useApiLoader(() => api.getFields(), []);
  const allFields = fieldsData || [];
  const { data: permCountsData, reload: reloadPermCounts } = useApiLoader(() => api.getUserPermissionCounts(), []);
  const permCountsByReferee = useMemo(() => {
    const map = new Map();
    for (const r of permCountsData || []) map.set(r.referee_id, r);
    return map;
  }, [permCountsData]);
  const list = data || [];
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', can_view_scoreboard: false, language: 'en' });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [permModal, setPermModal] = useState(null); // { user, selected: Set<"contentId:fieldId">, loading, saving }
  const SECURITY_CODE = '26122004';

  const permKey = (contentId, fieldId) => `${contentId}:${fieldId}`;
  // Snapshot đã lưu (chuỗi đã sort, so sánh nhanh) — dùng để phát hiện có
  // thay đổi chưa lưu khi đóng modal, tránh việc bấm ra ngoài/nhấn X làm mất
  // tick đã chọn mà không hề có cảnh báo (dễ khiến admin tưởng đã lưu).
  const snapshotOf = (set) => [...set].sort().join(',');

  const openPerms = async (u) => {
    setPermModal({ user: u, selected: new Set(), saved: '', loading: true, saving: false });
    try {
      const items = await api.getUserPermissions(u.id);
      const selected = new Set(items.map((it) => permKey(it.contest_content_id, it.field_id)));
      setPermModal({ user: u, selected, saved: snapshotOf(selected), loading: false, saving: false });
    } catch (e) {
      showAlert(e.message || 'Không tải được danh sách phân quyền.', 'error');
      setPermModal(null);
    }
  };

  const closePermModal = async () => {
    if (permModal.saving) return;
    if (snapshotOf(permModal.selected) !== permModal.saved) {
      const ok = await showConfirm({
        message: 'Có thay đổi chưa lưu — đóng và bỏ các ô vừa tick?',
        confirmText: 'Bỏ thay đổi', cancelText: 'Quay lại', danger: true,
      });
      if (!ok) return;
    }
    setPermModal(null);
  };

  const togglePerm = (contentId, fieldId) => {
    setPermModal((m) => {
      const selected = new Set(m.selected);
      const key = permKey(contentId, fieldId);
      if (selected.has(key)) selected.delete(key); else selected.add(key);
      return { ...m, selected };
    });
  };

  const toggleAllFieldsForContent = (contentId, allChecked) => {
    setPermModal((m) => {
      const selected = new Set(m.selected);
      for (const f of allFields) {
        const key = permKey(contentId, f.id);
        if (allChecked) selected.delete(key); else selected.add(key);
      }
      return { ...m, selected };
    });
  };

  const savePerms = async () => {
    setPermModal((m) => ({ ...m, saving: true }));
    try {
      const items = [...permModal.selected].map((key) => {
        const [contest_content_id, field_id] = key.split(':');
        return { contest_content_id, field_id };
      });
      await api.putUserPermissions(permModal.user.id, items);
      setPermModal(null);
      reloadPermCounts();
      showAlert('Đã lưu phân quyền.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu phân quyền.', 'error');
      setPermModal((m) => ({ ...m, saving: false }));
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

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 10);

  const openAdd = () => {
    setModal('add');
    setForm({ email: '', password: '', full_name: '', can_view_scoreboard: false, language: 'en' });
    setError('');
    setErrors({});
  };

  const openEdit = (u) => {
    setModal({ id: u.id });
    // Bảng users dùng username làm email đăng nhập, không có cột email riêng
    setForm({ email: u.username, password: '', full_name: u.full_name || '', can_view_scoreboard: !!u.can_view_scoreboard, language: u.language === 'vi' ? 'vi' : 'en' });
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
          can_view_scoreboard: form.can_view_scoreboard,
          language: form.language,
        });
      } else {
        // Sửa: full_name + (tùy chọn) mật khẩu mới + quyền xem bảng xếp hạng
        const body = {
          full_name: form.full_name?.trim() || form.email.split('@')[0],
          can_view_scoreboard: form.can_view_scoreboard,
          language: form.language,
        };
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
                <th>Ngôn ngữ</th>
                <th>Loại chấm điểm</th>
                <th>Phân quyền Field</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có tài khoản trọng tài. Bấm "Thêm tài khoản" để tạo mới.</td></tr>
              ) : (
                pageItems.map((u) => {
                  const pc = permCountsByReferee.get(u.id);
                  return (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.full_name || '-'}</td>
                    <td><span className="badge badge-blue">{u.role}</span></td>
                    <td>{u.language === 'vi' ? 'Tiếng Việt' : 'English'}</td>
                    <td>
                      {u.can_view_scoreboard
                        ? <span className="badge badge-green">Xem được BXH</span>
                        : <span className="badge badge-blue" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>Chấm điểm bình thường</span>}
                    </td>
                    <td>
                      {pc
                        ? <span className="badge badge-green" title="Số dòng (Nội dung × Field) đã gán">Giới hạn ở {pc.content_count} nội dung ({pc.row_count} field)</span>
                        : <span className="badge badge-blue" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>Chưa giới hạn — thấy tất cả</span>}
                    </td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(u)}>Sửa</button>
                      <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => openPerms(u)}>Phân quyền Nội dung × Field</button>
                      <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(u.id)}>Xóa</button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
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

            <div className="form-group">
              <label className="form-label">Ngôn ngữ giao diện chấm điểm</label>
              <select
                className="form-input form-select"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="en">Tiếng Anh (English)</option>
                <option value="vi">Tiếng Việt</option>
              </select>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Áp dụng cho toàn bộ giao diện nhập điểm (Fly Smart Cup, Battle of Stars, và các nội dung chấm điểm thường) của tài khoản này.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Loại chấm điểm</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                  <input
                    type="radio"
                    name="can_view_scoreboard"
                    checked={!form.can_view_scoreboard}
                    onChange={() => setForm({ ...form, can_view_scoreboard: false })}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Chấm điểm bình thường</strong>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Chỉ nhập phiếu điểm, không thấy Bảng xếp hạng.</div>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                  <input
                    type="radio"
                    name="can_view_scoreboard"
                    checked={form.can_view_scoreboard}
                    onChange={() => setForm({ ...form, can_view_scoreboard: true })}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Chấm điểm + Xem bảng xếp hạng</strong>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Thấy thêm mục "Bảng xếp hạng" (toàn giải) trong menu trọng tài.</div>
                  </span>
                </label>
              </div>
            </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : modal === 'add' ? 'Lưu tài khoản' : 'Lưu thay đổi'}</button>
            </div>
          </div>
        </div>
      )}

      {permModal && (
        <div className="modal-overlay" onClick={closePermModal}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Phân quyền Nội dung × Field — {permModal.user.full_name || permModal.user.username}</h3>
              <button type="button" className="form-modal-close" onClick={closePermModal} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <p style={{ marginBottom: 16, color: '#374151' }}>
                Đánh dấu ô (Nội dung, Field) mà trọng tài này được phép chấm điểm/ghi kết quả. Nếu 1 Nội dung không có ô nào được đánh dấu, trọng tài sẽ thấy và chấm được <strong>tất cả</strong> Field của nội dung đó (chưa giới hạn).
              </p>
              {permModal.loading ? (
                <p style={{ textAlign: 'center', padding: 24 }}>Đang tải...</p>
              ) : allContents.length === 0 || allFields.length === 0 ? (
                <p style={{ color: '#888' }}>Cần có ít nhất 1 Nội dung thi và 1 Field trong hệ thống trước.</p>
              ) : (
                <div className="table-container" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nội dung</th>
                        {allFields.map((f) => <th key={f.id} style={{ textAlign: 'center' }}>{f.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {allContents.map((c) => {
                        const allChecked = allFields.every((f) => permModal.selected.has(permKey(c.id, f.id)));
                        return (
                          <tr key={c.id}>
                            <td>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                                <input type="checkbox" checked={allChecked} onChange={() => toggleAllFieldsForContent(c.id, allChecked)} />
                                {c.name}
                              </label>
                            </td>
                            {allFields.map((f) => (
                              <td key={f.id} style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={permModal.selected.has(permKey(c.id, f.id))}
                                  onChange={() => togglePerm(c.id, f.id)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={closePermModal} disabled={permModal.saving}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={savePerms} disabled={permModal.loading || permModal.saving}>
                {permModal.saving ? 'Đang lưu...' : 'Lưu phân quyền'}
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
