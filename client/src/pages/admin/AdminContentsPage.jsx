import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminContentsPage() {
  const { showConfirm, showAlert } = useNotify();
  const [competitions, setCompetitions] = useState([]);
  const [selectedComp, setSelectedComp] = useState('');
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  useEffect(() => {
    async function loadComps() {
      try {
        const comps = await api.getCompetitions();
        setCompetitions(comps);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadComps();
  }, []);

  useEffect(() => {
    async function loadContents() {
      if (!selectedComp) {
        setContents([]);
        return;
      }
      try {
        const list = await api.getContents(selectedComp);
        setContents(list);
      } catch (e) {
        console.error(e);
      }
    }
    loadContents();
  }, [selectedComp]);

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', description: '' });
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
    try {
      await api.postContent(selectedComp, {
        ...form,
        scoreSheetTemplate: {
          fields: [
            { id: 'thoi_gian', label: 'Thời gian', type: 'time', required: true },
            { id: 'diem', label: 'Điểm', type: 'number', required: true },
          ]
        },
        order: contents.length + 1
      });
      setModal(null);
      const list = await api.getContents(selectedComp);
      setContents(list);
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa nội dung thi này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteContent(deleteConfirm.id);
      setDeleteConfirm(null);
      const list = await api.getContents(selectedComp);
      setContents(list);
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý nội dung thi</h1>
          <p className="page-subtitle">Chọn cuộc thi để quản lý nội dung</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 300 }}>
            <label className="form-label">Cuộc thi</label>
            <select className="form-input form-select" value={selectedComp} onChange={(e) => setSelectedComp(e.target.value)}>
              <option value="">-- Chọn cuộc thi --</option>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedComp && (
        <>
          <div className="page-header" style={{ marginTop: 24 }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 20 }}>Danh sách nội dung</h2>
              <p className="page-subtitle">{contents.length} nội dung</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm nội dung</button>
          </div>

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Nội dung</th>
                    <th>Mô tả</th>
                    <th style={{ width: 100 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contents.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có nội dung nào.</td></tr>
                  ) : contents.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/admin/competitions/${selectedComp}/contents/${c.id}/teams`}>{c.name}</Link>
                      </td>
                      <td>{c.description || '-'}</td>
                      <td>
                        <Link to={`/admin/competitions/${selectedComp}/contents/${c.id}/teams`} className="btn btn-secondary" style={{ marginRight: 8 }}>Đội</Link>
                        <button type="button" className="btn btn-danger" onClick={() => remove(c.id)}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal === 'add' && selectedComp && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Thêm nội dung thi</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Tên nội dung <span style={{ color: '#dc2626' }}>*</span></label>
                <input className={`form-input ${errors.name ? 'form-input-error' : ''}`} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }} />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Mô tả</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>Lưu nội dung</button>
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
