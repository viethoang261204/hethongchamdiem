import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

export default function AdminContentsPage() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(async () => {
    const [comps, allContents] = await Promise.all([
      api.getCompetitions(),
      api.getAllContents(),
    ]);
    return { competitions: comps, allContents };
  }, []);
  const competitions = data?.competitions || [];
  const allContents = data?.allContents || [];

  const [selectedComp, setSelectedComp] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', scoring_method: '', order_index: 1, criteria: [] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const contents = useMemo(() => {
    if (!selectedComp) return [];
    let l = allContents.filter(c => c.competition_id === selectedComp);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(c =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.description || '').toLowerCase().includes(s)
      );
    }
    return l;
  }, [selectedComp, search, allContents]);

  const selectedCompData = competitions.find(c => c.id === selectedComp);

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', description: '', scoring_method: '', order_index: contents.length + 1, criteria: [] });
    setErrors({});
  };

  const openEdit = (c) => {
    setModal({ id: c.id });
    setForm({
      name: c.name || '',
      description: c.description || '',
      scoring_method: c.scoring_method || '',
      order_index: c.order_index ?? contents.length + 1,
      criteria: c.criteria || [],
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Tên nội dung không được để trống.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập tên nội dung.', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        scoring_method: form.scoring_method?.trim() || null,
        order_index: Number(form.order_index) || 1,
        criteria: form.criteria || [],
      };
      if (modal === 'add') {
        await api.postContent(selectedComp, body);
      } else {
        await api.putContent(modal.id, body);
      }
      setModal(null);
      setData(null);
      const updated = await api.getAllContents();
      setData((prev) => prev ? { ...prev, allContents: updated } : prev);
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa nội dung thi này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
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
      await api.deleteContent(deleteConfirm.id);
      setDeleteConfirm(null);
      setData(null);
      const updated = await api.getAllContents();
      setData((prev) => prev ? { ...prev, allContents: updated } : prev);
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý nội dung thi</h1>
          <p className="page-subtitle">
            {selectedCompData ? `${selectedCompData.name} — ${contents.length} nội dung` : 'Chọn cuộc thi để quản lý nội dung'}
          </p>
        </div>
        {selectedComp && (
          <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm nội dung</button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 300 }}>
            <label className="form-label">Cuộc thi</label>
            <select className="form-input form-select" value={selectedComp} onChange={(e) => { setSelectedComp(e.target.value); setSearch(''); }}>
              <option value="">-- Chọn cuộc thi --</option>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {selectedComp && (
            <div className="search-box">
              <input
                type="text"
                placeholder="Tìm nội dung..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      {selectedComp ? (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Tên nội dung</th>
                  <th>Mô tả</th>
                  <th>Phương thức chấm</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
                ) : contents.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có nội dung nào.</td></tr>
                ) : contents.map((c, i) => (
                  <tr key={c.id}>
                    <td>{c.order_index ?? i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                    </td>
                    <td style={{ fontSize: 13, color: '#64748b' }}>{c.description || '-'}</td>
                    <td style={{ fontSize: 13 }}>{c.scoring_method || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/competitions/${selectedComp}/contents/${c.id}/teams`} className="btn btn-secondary">Đội thi</Link>
                        <Link to={`/admin/competitions/${selectedComp}/contents/${c.id}/areas`} className="btn btn-secondary">Khu vực</Link>
                        <button type="button" className="btn btn-secondary" onClick={() => openEdit(c)}>Sửa</button>
                        <button type="button" className="btn btn-danger" onClick={() => remove(c.id)}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#888' }}>
          <p>Chọn một cuộc thi ở trên để quản lý nội dung thi.</p>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm nội dung thi' : 'Sửa nội dung thi'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Tên nội dung <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder="VD: Robot Marathon, Innovation Trail..."
                />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Mô tả</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Mô tả ngắn về nội dung thi..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phương thức chấm</label>
                <input
                  className="form-input"
                  value={form.scoring_method}
                  onChange={(e) => setForm({ ...form, scoring_method: e.target.value })}
                  placeholder="VD: Chấm theo nhiệm vụ, Tổng điểm..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Thứ tự hiển thị</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Đang lưu...' : (modal === 'add' ? 'Lưu nội dung' : 'Lưu thay đổi')}
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa nội dung:</p>
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
