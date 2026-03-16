import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminAreas() {
  const { competitionId, contentId } = useParams();
  const { showAlert } = useNotify();
  const [content, setContent] = useState(null);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', order: 1 });
  const [errors, setErrors] = useState({});

  const load = async () => {
    try {
      const [contents, list] = await Promise.all([
        api.getContents(competitionId),
        api.getAreas(contentId),
      ]);
      setContent(contents.find(c => c.id === contentId));
      setAreas(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [competitionId, contentId]);

  const openAdd = () => {
    setModal(true);
    setForm({ name: '', order: areas.length + 1 });
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Tên khu vực không được để trống.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập tên khu vực.', 'error');
      return;
    }
    try {
      await api.postArea(contentId, { name: form.name, order: form.order || areas.length + 1 });
      setModal(false);
      load();
      showAlert('Đã thêm khu vực.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="nhutin-admin">
      <div className="breadcrumb">
        <Link to="/admin/competitions">Cuộc thi</Link>
        <span>/</span>
        <Link to={`/admin/competitions/${competitionId}/contents`}>Nội dung</Link>
        <span>/</span>
        <span>Khu vực - {content?.name}</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Khu vực chấm</h1>
          <p className="page-subtitle">{areas.length} khu vực</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/admin/competitions/${competitionId}/contents/${contentId}/teams`} className="btn btn-secondary">Đội thi</Link>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm khu vực</button>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên khu vực</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a, i) => (
              <tr key={a.id}>
                <td>{a.order ?? i + 1}</td>
                <td>{a.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {areas.length === 0 && <p style={{ padding: '1rem', color: 'var(--text-muted)' }}>Chưa có khu vực. Thêm khu vực để trọng tài chọn khi chấm.</p>}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Thêm khu vực</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(false)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
            <div className="form-group">
              <label className="form-label">Tên khu vực <span style={{ color: '#dc2626' }}>*</span></label>
              <input className={`form-input ${errors.name ? 'form-input-error' : ''}`} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }} placeholder="VD: Khu vực A - Sân 1" />
              {errors.name && <div className="form-error-text">{errors.name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Thứ tự</label>
              <input type="number" className="form-input" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 1 })} />
            </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>Lưu khu vực</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
