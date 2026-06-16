import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

export default function AdminAreas() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(async () => {
    const [allAreas, allContents, comps] = await Promise.all([
      api.getAllAreas(),
      api.getAllContents(),
      api.getCompetitions(),
    ]);
    return { allAreas, allContents, competitions: comps };
  }, []);
  const allAreas = data?.allAreas || [];
  const allContents = data?.allContents || [];
  const competitions = data?.competitions || [];

  const [filterComp, setFilterComp] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', region: 'bac', competitionId: '', contestContentId: '', order: 1 });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const filtered = useMemo(() => {
    let l = allAreas;
    if (filterComp) l = l.filter(a => a.contest_contents?.competitions?.id === filterComp || a.competition_id === filterComp);
    if (filterRegion) l = l.filter(a => a.region === filterRegion);
    return l;
  }, [allAreas, filterComp, filterRegion]);

  const contestContents = useMemo(() => {
    if (!filterComp) return allContents;
    return allContents.filter(c => c.competition_id === filterComp);
  }, [filterComp, allContents]);

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', region: 'bac', competitionId: filterComp || '', contestContentId: '', order: allAreas.length + 1 });
    setErrors({});
  };

  const openEdit = (a) => {
    setModal({ id: a.id });
    const content = allContents.find(c => c.id === a.contest_content_id);
    setForm({
      name: a.name || '',
      region: a.region || 'bac',
      competitionId: content?.competition_id || a.competition_id || '',
      contestContentId: a.contest_content_id || '',
      order: a.order_index || 1,
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Tên khu vực / trung tâm không được để trống.';
    if (!form.contestContentId) errs.contestContentId = 'Chọn nội dung thi.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập đầy đủ thông tin.', 'error');
      return;
    }
    try {
      if (modal === 'add') {
        await api.postArea(form.contestContentId, {
          name: form.name,
          region: form.region,
          order: form.order,
        });
      } else {
        await api.putArea(modal.id, {
          name: form.name,
          region: form.region,
          order: form.order,
          competition_id: form.competitionId || null,
        });
      }
      setModal(null);
      setData(null);
      const updated = await api.getAllAreas();
      setData((prev) => prev ? { ...prev, allAreas: updated } : prev);
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa khu vực này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
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
      await api.deleteArea(deleteConfirm.id);
      setDeleteConfirm(null);
      setData(null);
      const updated = await api.getAllAreas();
      setData((prev) => prev ? { ...prev, allAreas: updated } : prev);
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const regionLabel = (r) => {
    if (r === 'bac') return 'Miền Bắc';
    if (r === 'trung') return 'Miền Trung';
    if (r === 'nam') return 'Miền Nam';
    return r;
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý khu vực / Trung tâm</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} khu vực</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm khu vực</button>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="filters-bar">
        <select className="filter-select" value={filterComp} onChange={(e) => { setFilterComp(e.target.value); setForm(f => ({ ...f, competitionId: e.target.value, contestContentId: '' })); }}>
          <option value="">Tất cả cuộc thi</option>
          {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
          <option value="">Tất cả miền</option>
          <option value="bac">Miền Bắc</option>
          <option value="trung">Miền Trung</option>
          <option value="nam">Miền Nam</option>
        </select>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên khu vực</th>
                <th>Cuộc thi</th>
                <th>Nội dung thi</th>
                <th>Miền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : filtered.map((a, i) => (
                <tr key={a.id}>
                  <td>{a.order_index ?? i + 1}</td>
                  <td>{a.name}</td>
                  <td>{a.contest_contents?.competitions?.name || '-'}</td>
                  <td>{a.contest_contents?.name || '-'}</td>
                  <td>{regionLabel(a.region)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(a)}>Sửa</button>
                    <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(a.id)}>Xóa</button>
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
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm khu vực' : 'Sửa khu vực'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              {modal === 'add' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Cuộc thi</label>
                    <select
                      className="form-input form-select"
                      value={form.competitionId}
                      onChange={(e) => setForm({ ...form, competitionId: e.target.value, contestContentId: '' })}
                    >
                      <option value="">-- Chọn cuộc thi --</option>
                      {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nội dung thi <span style={{ color: '#dc2626' }}>*</span></label>
                    <select
                      className={`form-input form-select ${errors.contestContentId ? 'form-input-error' : ''}`}
                      value={form.contestContentId}
                      onChange={(e) => setForm({ ...form, contestContentId: e.target.value })}
                      disabled={!form.competitionId}
                    >
                      <option value="">-- Chọn nội dung --</option>
                      {contestContents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.contestContentId && <div className="form-error-text">{errors.contestContentId}</div>}
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Tên khu vực / trung tâm <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder="VD: Khu vực A - TP.HCM"
                />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Miền</label>
                  <select className="form-input form-select" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                    <option value="bac">Miền Bắc</option>
                    <option value="trung">Miền Trung</option>
                    <option value="nam">Miền Nam</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Thứ tự</label>
                  <input type="number" className="form-input" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 1 })} />
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu khu vực' : 'Lưu thay đổi'}</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa khu vực:</p>
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
