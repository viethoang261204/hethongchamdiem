import { useState } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

const STATUS_BADGE = {
  pending: { label: 'Đang chờ', className: 'badge-blue' },
  resolved: { label: 'Đã xử lý', className: 'badge-green' },
  rejected: { label: 'Từ chối', className: 'badge-red' },
};

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminComplaints() {
  const { showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(() => api.getComplaints(), []);
  const list = data || [];
  const [filterStatus, setFilterStatus] = useState('');
  const [resolveModal, setResolveModal] = useState(null); // { id, status, note }
  const [saving, setSaving] = useState(false);

  const filtered = filterStatus ? list.filter((c) => c.status === filterStatus) : list;

  const openResolve = (c, status) => {
    setResolveModal({ id: c.id, status, note: c.resolution_note || '' });
  };

  const save = async () => {
    if (!resolveModal) return;
    setSaving(true);
    try {
      await api.putComplaint(resolveModal.id, { status: resolveModal.status, resolution_note: resolveModal.note.trim() || null });
      setResolveModal(null);
      setData(null);
      const updated = await api.getComplaints();
      setData(updated);
      showAlert('Đã cập nhật.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = list.filter((c) => c.status === 'pending').length;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Yêu cầu khiếu nại</h1>
          <p className="page-subtitle">
            Tổng số: {filtered.length}{pendingCount > 0 ? ` · ${pendingCount} đang chờ xử lý` : ''}
          </p>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="filters-bar">
        <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Đang chờ</option>
          <option value="resolved">Đã xử lý</option>
          <option value="rejected">Từ chối</option>
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Đội / Trận</th>
                <th>Nội dung</th>
                <th>Người gửi</th>
                <th>Nội dung khiếu nại</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có khiếu nại nào.</td></tr>
              ) : filtered.map((c) => {
                const st = STATUS_BADGE[c.status] || STATUS_BADGE.pending;
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.team_name || '-'}{c.score_round ? ` · Lượt ${c.score_round}` : ''}</td>
                    <td style={{ fontSize: 13 }}>{c.content_name || '-'}</td>
                    <td style={{ fontSize: 13 }}>{c.referee?.full_name || c.referee?.username || '-'}</td>
                    <td style={{ fontSize: 13, maxWidth: 280 }}>{c.message}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(c.created_at)}</td>
                    <td><span className={`badge ${st.className}`}>{st.label}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.status === 'pending' ? (
                        <>
                          <button type="button" className="btn btn-secondary" onClick={() => openResolve(c, 'resolved')}>Đã xử lý</button>
                          <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => openResolve(c, 'rejected')}>Từ chối</button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-secondary" onClick={() => openResolve(c, c.status)}>Sửa phản hồi</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {resolveModal && (
        <div className="modal-overlay" onClick={() => setResolveModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{resolveModal.status === 'rejected' ? 'Từ chối khiếu nại' : 'Xử lý khiếu nại'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setResolveModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <select className="form-input form-select" value={resolveModal.status} onChange={(e) => setResolveModal({ ...resolveModal, status: e.target.value })}>
                  <option value="resolved">Đã xử lý</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Phản hồi</label>
                <textarea className="form-input" rows={3} value={resolveModal.note} onChange={(e) => setResolveModal({ ...resolveModal, note: e.target.value })} placeholder="Ghi chú phản hồi cho trọng tài..." />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setResolveModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
