import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const IMPORT_COLUMNS = [
  { key: 'competition_name', label: 'Tên cuộc thi', required: true, example: 'Enjoy AI Asian Open 2026' },
  { key: 'name', label: 'Tên nội dung', required: true, example: 'Robot Marathon' },
  { key: 'description', label: 'Mô tả', required: false, example: '' },
  { key: 'time_limit_seconds', label: 'Thời gian trận đấu (giây)', required: false, example: '150' },
  { key: 'content_format', label: 'Định dạng chấm điểm', required: false, example: 'Chấm điểm' },
];

export default function AdminContentsPage() {
  const { showConfirm, showAlert } = useNotify();
  const [searchParams] = useSearchParams();
  const { data, loading, error, reload, setData } = useApiLoader(async () => {
    const [comps, allContents] = await Promise.all([
      api.getCompetitions(),
      api.getAllContents(),
    ]);
    return { competitions: comps, allContents };
  }, []);
  const competitions = data?.competitions || [];
  const allContents = data?.allContents || [];

  // Cho phép mở thẳng vào 1 cuộc thi qua /admin/contents?competitionId=... (VD: từ trang Cuộc thi)
  const [selectedComp, setSelectedComp] = useState(searchParams.get('competitionId') || '');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', scoring_method: '', order_index: 1, criteria: [], content_format: 'scoring' });
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

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(contents, 10);

  // Trang khác (Đội thi, Phiếu điểm...) đọc danh sách nội dung qua cache
  // (capi.getAllContents) — phải clear để không thấy dữ liệu cũ sau khi sửa ở đây.
  const refreshContents = async () => {
    clearApiCache('getAllContents');
    const updated = await api.getAllContents();
    setData((prev) => ({ ...prev, allContents: updated }));
  };

  const selectedCompData = competitions.find(c => c.id === selectedComp);

  const openAdd = () => {
    setModal('add');
    setForm({
      name: '', description: '', scoring_method: '', order_index: contents.length + 1, criteria: [],
      time_limit_seconds: '', bonus_enabled: false, bonus_base: 40, bonus_per_retry: 10, bonus_label: '',
      content_format: 'scoring',
    });
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
      time_limit_seconds: c.time_limit_seconds ?? '',
      bonus_enabled: !!c.bonus_config,
      bonus_base: c.bonus_config?.base ?? 40,
      bonus_per_retry: c.bonus_config?.per_retry ?? 10,
      bonus_label: c.bonus_config?.label || '',
      content_format: c.content_format || 'scoring',
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
        time_limit_seconds: form.time_limit_seconds !== '' ? Number(form.time_limit_seconds) : null,
        bonus_config: form.bonus_enabled
          ? {
              label: form.bonus_label?.trim() || 'Extra reward',
              base: Number(form.bonus_base) || 0,
              per_retry: Number(form.bonus_per_retry) || 0,
            }
          : null,
        content_format: form.content_format || 'scoring',
      };
      if (modal === 'add') {
        await api.postContent(selectedComp, body);
      } else {
        await api.putContent(modal.id, body);
      }
      setModal(null);
      await refreshContents();
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
      await refreshContents();
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel</button>
          {selectedComp && (
            <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm nội dung</button>
          )}
        </div>
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
                  <th>Định dạng</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
                ) : contents.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có nội dung nào.</td></tr>
                ) : pageItems.map((c, i) => (
                  <tr key={c.id}>
                    <td>{c.order_index ?? (page - 1) * pageSize + i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                    </td>
                    <td style={{ fontSize: 13, color: '#64748b' }}>{c.description || '-'}</td>
                    <td style={{ fontSize: 13 }}>
                      {c.content_format === 'combat_drone' ? 'Đối kháng — Fly Smart Cup'
                        : c.content_format === 'combat_stars' ? 'Đối kháng — Battle of Stars'
                        : 'Chấm điểm'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/competitions/${selectedComp}/contents/${c.id}/teams`} className="btn btn-secondary">Đội thi</Link>
                        <button type="button" className="btn btn-secondary" onClick={() => openEdit(c)}>Sửa</button>
                        <button type="button" className="btn btn-danger" onClick={() => remove(c.id)}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
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
                <label className="form-label">Định dạng chấm điểm <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  className="form-input form-select"
                  value={form.content_format}
                  onChange={(e) => setForm({ ...form, content_format: e.target.value })}
                >
                  <option value="scoring">Chấm điểm (mặc định — nhiệm vụ + xuất phiếu điểm thường)</option>
                  <option value="combat_drone">Đối kháng — Fly Smart Cup (mẫu Drone Cup)</option>
                  <option value="combat_stars">Đối kháng — Battle of Stars</option>
                </select>
                {modal !== 'add' && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Nếu nội dung đã có đội/phiếu điểm/trận đấu, hệ thống sẽ báo lỗi khi lưu nếu đổi định dạng.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Phương thức chấm (mô tả)</label>
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
              <div className="form-group">
                <label className="form-label">Thời gian trận đấu (giây)</label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={form.time_limit_seconds}
                  onChange={(e) => setForm({ ...form, time_limit_seconds: e.target.value })}
                  placeholder="VD: 150 — để trống nếu không giới hạn"
                />
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Đồng hồ bấm giờ của trọng tài sẽ tự động dừng khi chạm mốc thời gian này.
                </div>
              </div>
              {form.content_format !== 'combat_drone' && (
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!form.bonus_enabled}
                    onChange={(e) => setForm({ ...form, bonus_enabled: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Có điểm thưởng (theo số lần chạy lại)
                </label>
                {form.bonus_enabled && (
                  <div style={{ marginTop: 8, padding: 12, background: '#f8fafc', borderRadius: 8, display: 'grid', gap: 8 }}>
                    <input
                      className="form-input"
                      value={form.bonus_label}
                      onChange={(e) => setForm({ ...form, bonus_label: e.target.value })}
                      placeholder="Tên điểm thưởng — VD: Điểm thưởng vận hành mượt mà"
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13 }}>Điểm thưởng =</span>
                      <input
                        type="number" className="form-input" style={{ width: 80 }}
                        value={form.bonus_base}
                        onChange={(e) => setForm({ ...form, bonus_base: e.target.value })}
                      />
                      <span style={{ fontSize: 13 }}>−</span>
                      <input
                        type="number" className="form-input" style={{ width: 80 }}
                        value={form.bonus_per_retry}
                        onChange={(e) => setForm({ ...form, bonus_per_retry: e.target.value })}
                      />
                      <span style={{ fontSize: 13 }}>× số lần chạy lại (tối thiểu 0)</span>
                    </div>
                  </div>
                )}
              </div>
              )}
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

      {importOpen && (
        <ExcelImportModal
          title="Nhập nội dung thi từ Excel"
          columns={IMPORT_COLUMNS}
          templateFilename="mau-noi-dung-thi.xlsx"
          notePrereq='Tên cuộc thi phải khớp đúng 1 cuộc thi đã có sẵn. Định dạng chấm điểm để trống = "Chấm điểm"; nếu điền thì phải đúng "Chấm điểm", "Đối kháng — Fly Smart Cup" hoặc "Đối kháng — Battle of Stars".'
          onImport={(rows) => api.importContents(rows)}
          onDone={refreshContents}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
