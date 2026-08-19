import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

// Bình chọn "HLV xuất sắc" theo TỪNG cuộc thi — xếp theo số đội của HLV đó
// đạt giải. Tiêu chí xét thế nào là "đạt giải" (Top mấy, tính theo bảng đấu
// nào...) sẽ được bổ sung sau; hiện tại `award_team_count` nhập tay, chưa
// tự nối vào bảng xếp hạng thật.
export default function AdminOutstandingCoaches() {
  const { showConfirm, showAlert } = useNotify();

  const { data: compsData, loading: compsLoading, error: compsError, reload: compsReload } = useApiLoader(
    () => api.getCompetitions(), []
  );
  const competitions = compsData || [];
  const { data: coachesData } = useApiLoader(() => api.getCoaches(), []);
  const coaches = coachesData || [];

  const [selectedComp, setSelectedComp] = useState('');
  const { data: listData, loading: listLoading, error: listError, reload: listReload } = useApiLoader(
    async () => (selectedComp ? await api.getOutstandingCoaches(selectedComp) : []),
    [selectedComp]
  );
  const list = listData || [];

  const [modal, setModal] = useState(null); // 'add' | { id }
  const [form, setForm] = useState({ coach_id: '', award_team_count: 0, note: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const usedCoachIds = useMemo(() => new Set(list.map((x) => x.coach_id)), [list]);
  const sortedList = useMemo(
    () => list.slice().sort((a, b) =>
      (b.award_team_count || 0) - (a.award_team_count || 0) || (a.coach_name || '').localeCompare(b.coach_name || '')
    ),
    [list]
  );

  const openAdd = () => {
    setModal('add');
    setForm({ coach_id: '', award_team_count: 0, note: '' });
    setErrors({});
  };

  const openEdit = (row) => {
    setModal({ id: row.id });
    setForm({ coach_id: row.coach_id, award_team_count: row.award_team_count ?? 0, note: row.note || '' });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.coach_id) errs.coach_id = 'Chọn huấn luyện viên.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!selectedComp) { showAlert('Chọn cuộc thi trước.', 'error'); return; }
    if (!validate()) { showAlert('Vui lòng chọn HLV.', 'error'); return; }
    try {
      const body = {
        coach_id: form.coach_id,
        award_team_count: Math.max(0, parseInt(form.award_team_count, 10) || 0),
        note: form.note.trim() || null,
      };
      if (modal === 'add') await api.postOutstandingCoach(selectedComp, body);
      else await api.putOutstandingCoach(modal.id, body);
      setModal(null);
      listReload();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu.', 'error');
    }
  };

  const remove = async (row) => {
    const ok = await showConfirm({
      message: `Xóa "${row.coach_name}" khỏi danh sách HLV xuất sắc?`,
      confirmText: 'Xóa', cancelText: 'Hủy', danger: true,
    });
    if (!ok) return;
    setDeleteConfirm({ id: row.id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteOutstandingCoach(deleteConfirm.id);
      setDeleteConfirm(null);
      listReload();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xóa.', 'error');
    }
  };

  const loading = compsLoading;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">HLV xuất sắc</h1>
          <p className="page-subtitle">
            Bình chọn theo từng cuộc thi, xếp theo số đội của HLV đó đạt giải.
            Tiêu chí xét "đạt giải" sẽ bổ sung sau — hiện nhập tay số đội.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd} disabled={!selectedComp}>
          Thêm HLV xuất sắc
        </button>
      </div>

      {compsError && <ErrorBox error={compsError} onRetry={compsReload} />}

      <div className="filters-bar">
        <div className="form-group" style={{ marginBottom: 0, minWidth: 280 }}>
          <label className="form-label">Cuộc thi <span style={{ color: '#dc2626' }}>*</span></label>
          <select className="form-input form-select" value={selectedComp} onChange={(e) => setSelectedComp(e.target.value)}>
            <option value="">-- Chọn cuộc thi --</option>
            {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {listError && <ErrorBox error={listError} onRetry={listReload} />}

      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>Đang tải...</div>
      ) : !selectedComp ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>
          Chọn cuộc thi để xem danh sách HLV xuất sắc.
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Hạng</th>
                  <th>Tên HLV</th>
                  <th style={{ width: 130 }}>SĐT</th>
                  <th style={{ width: 140 }}>Số đội đạt giải</th>
                  <th>Ghi chú</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
                ) : sortedList.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có HLV xuất sắc nào cho cuộc thi này.</td></tr>
                ) : sortedList.map((row, i) => (
                  <tr key={row.id}>
                    <td><span className={`rank-badge rank-${i + 1}`}>{i + 1}</span></td>
                    <td style={{ fontWeight: 600 }}>{row.coach_name}</td>
                    <td>{row.coach_phone || '-'}</td>
                    <td><strong>{row.award_team_count}</strong> đội</td>
                    <td style={{ fontSize: 13, color: '#64748b' }}>{row.note || '-'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>Sửa</button>
                      <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(row)}>Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm HLV xuất sắc' : 'Sửa HLV xuất sắc'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Huấn luyện viên <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  className={`form-input form-select ${errors.coach_id ? 'form-input-error' : ''}`}
                  value={form.coach_id}
                  onChange={(e) => { setForm({ ...form, coach_id: e.target.value }); setErrors({ ...errors, coach_id: '' }); }}
                  disabled={modal !== 'add'}
                >
                  <option value="">-- Chọn HLV --</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id} disabled={modal === 'add' && usedCoachIds.has(c.id)}>
                      {c.name}{modal === 'add' && usedCoachIds.has(c.id) ? ' (đã có trong danh sách)' : ''}
                    </option>
                  ))}
                </select>
                {errors.coach_id && <div className="form-error-text">{errors.coach_id}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Số đội đạt giải</label>
                <input
                  type="number" min="0" className="form-input"
                  value={form.award_team_count}
                  onChange={(e) => setForm({ ...form, award_team_count: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea
                  className="form-input" rows={3} value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="VD: tên đội/nội dung đạt giải, lý do bình chọn..."
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu' : 'Lưu thay đổi'}</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa:</p>
              <div className="form-group">
                <label className="form-label">Mã bảo mật</label>
                <input
                  type="password" className="form-input"
                  value={deleteConfirm.securityCode}
                  onChange={(e) => setDeleteConfirm({ ...deleteConfirm, securityCode: e.target.value })}
                  placeholder="Nhập mã bảo mật" autoFocus
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
