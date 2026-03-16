import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminContents() {
  const { competitionId } = useParams();
  const { showConfirm, showAlert } = useNotify();
  const [competition, setCompetition] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const load = async () => {
    try {
      const [comps, contents] = await Promise.all([
        api.getCompetitions(),
        api.getContents(competitionId),
      ]);
      setCompetition(comps.find(c => c.id === competitionId));
      setList(contents);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [competitionId]);

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
      await api.postContent(competitionId, { ...form, scoreSheetTemplate: { fields: [
        { id: 'thoi_gian', label: 'Thời gian', type: 'time', required: true },
        { id: 'diem', label: 'Điểm', type: 'number', required: true },
      ]}, order: list.length + 1 });
      setModal(null);
      load();
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
      load();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="nhutin-admin">
      <div className="breadcrumb" style={{ marginBottom: 16 }}>
        <Link to="/admin/competitions">Cuộc thi</Link>
        <span> / </span>
        <span>{competition?.name || competitionId}</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nội dung thi</h1>
          <p className="page-subtitle">{list.length} nội dung</p>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/admin/competitions/${competitionId}/contents/${c.id}/teams`}>{c.name}</Link>
                </td>
                <td>{c.description}</td>
                <td>
                  <Link to={`/admin/competitions/${competitionId}/contents/${c.id}/scoreboard`} className="btn btn-secondary" style={{ marginRight: 8 }}>Bảng điểm</Link>
                  <button type="button" className="btn btn-danger" onClick={() => remove(c.id)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {modal === 'add' && (
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
