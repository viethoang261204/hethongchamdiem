import { useState, useMemo } from 'react';
import { api, taskImageUrl } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const SCORING_TYPES = [
  { value: 'binary',  label: 'Tick đạt / không đạt' },
  { value: 'count',   label: 'Đếm số lượng (điểm × số lượng)' },
  { value: 'numeric', label: 'Nhập điểm tay' },
  { value: 'tier',    label: 'Nhiều mức đạt (chọn 1 trong nhiều mức điểm)' },
];

const IMPORT_COLUMNS = [
  { key: 'content_name', label: 'Tên nội dung thi', required: true, example: 'Robot Marathon' },
  { key: 'name', label: 'Tên nhiệm vụ', required: true, example: 'Hoàn thành mê cung' },
  { key: 'description', label: 'Mô tả', required: false, example: '' },
  { key: 'scoring_type', label: 'Kiểu chấm (binary/count/numeric/tier)', required: false, example: 'binary' },
  { key: 'max_score', label: 'Điểm tối đa', required: true, example: '100' },
  { key: 'max_count', label: 'Số lượng tối đa', required: false, example: '' },
];

// 1 mức (tier) trống — { label, points }
const emptyTier = () => ({ label: '', points: '' });

// Hàm khởi tạo (không phải object tĩnh) — tránh chia sẻ chung 1 mảng
// tier_options giữa các lần mở form "Thêm nhiệm vụ" khác nhau.
const emptyForm = () => ({
  contest_content_id: '',
  name: '',
  name_en: '',
  description: '',
  max_score: 0,
  max_count: '',
  scoring_type: 'binary',
  tier_options: [emptyTier(), emptyTier()],
  order_index: 0,
  is_active: true,
});

export default function AdminTasks() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(async () => {
    const [comps, allContents, allTasks] = await Promise.all([
      api.getCompetitions(),
      api.getAllContents(),
      api.getAllTasks(),
    ]);
    return { competitions: comps, contents: allContents, tasks: allTasks };
  }, []);
  const competitions = data?.competitions || [];
  const contents = data?.contents || [];
  const tasks = data?.tasks || [];
  const [search, setSearch] = useState('');
  const [filterComp, setFilterComp] = useState('');
  const [filterContent, setFilterContent] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  // Ảnh nhiệm vụ: chọn file → preview local, upload sau khi lưu task
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const SECURITY_CODE = '26122004';

  const load = async () => reload();

  const filtered = useMemo(() => {
    let l = tasks;
    if (filterComp) {
      const contentIdsInComp = new Set(
        contents.filter(c => c.competition_id === filterComp).map(c => c.id)
      );
      l = l.filter(t => contentIdsInComp.has(t.contest_content_id));
    }
    if (filterContent) l = l.filter(t => t.contest_content_id === filterContent);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(t =>
        (t.name || '').toLowerCase().includes(s) ||
        (t.name_en || '').toLowerCase().includes(s) ||
        (t.description || '').toLowerCase().includes(s)
      );
    }
    return l;
  }, [tasks, search, filterComp, filterContent, contents]);

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 10);

  const contentName = (id) => {
    const c = contents.find(x => x.id === id);
    if (!c) return '-';
    return c.competitions?.name ? `${c.competitions.name} → ${c.name}` : c.name;
  };

  const resetImageState = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
  };

  const openAdd = () => {
    setModal('add');
    setForm({ ...emptyForm(), contest_content_id: filterContent || (contents[0]?.id || '') });
    setErrors({});
    resetImageState();
  };

  const openEdit = (t) => {
    setModal({ id: t.id, task: t });
    setForm({
      contest_content_id: t.contest_content_id,
      name: t.name || '',
      name_en: t.name_en || '',
      description: t.description || '',
      max_score: t.max_score ?? 0,
      max_count: t.max_count ?? '',
      scoring_type: t.scoring_type || 'binary',
      tier_options: t.tier_options?.length ? t.tier_options.map((o) => ({ label: o.label ?? '', points: o.points ?? '' })) : [emptyTier(), emptyTier()],
      order_index: t.order_index ?? 0,
      is_active: t.is_active !== false,
    });
    setErrors({});
    resetImageState();
  };

  const addTierRow = () => setForm((f) => ({ ...f, tier_options: [...f.tier_options, emptyTier()] }));
  const removeTierRow = (idx) => setForm((f) => ({ ...f, tier_options: f.tier_options.filter((_, i) => i !== idx) }));
  const updateTierRow = (idx, patch) => setForm((f) => ({
    ...f,
    tier_options: f.tier_options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
  }));

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  // Các mức hợp lệ (có mô tả + điểm số) — dùng chung cho validate() và save()
  const validTierOptions = () => form.tier_options
    .filter((o) => o.label.trim() && o.points !== '' && !Number.isNaN(Number(o.points)))
    .map((o) => ({ label: o.label.trim(), points: Number(o.points) }));

  const validate = () => {
    const errs = {};
    if (!form.contest_content_id) errs.contest_content_id = 'Chưa chọn nội dung thi.';
    if (!form.name.trim()) errs.name = 'Tên nhiệm vụ không được để trống.';
    if (form.scoring_type === 'tier') {
      if (validTierOptions().length < 2) errs.tier_options = 'Cần ít nhất 2 mức, mỗi mức có mô tả và điểm số.';
    } else {
      const max = Number(form.max_score);
      if (Number.isNaN(max) || max < 0) errs.max_score = 'Điểm tối đa phải >= 0.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập đầy đủ thông tin bắt buộc.', 'error');
      return;
    }
    setSaving(true);
    try {
      const isTier = form.scoring_type === 'tier';
      const tierOptions = isTier ? validTierOptions() : null;
      const body = {
        contest_content_id: form.contest_content_id,
        name: form.name.trim(),
        name_en: form.name_en?.trim() || null,
        description: form.description?.trim() || null,
        // Nhiệm vụ nhiều mức: điểm tối đa tự tính = điểm mức cao nhất, không nhập tay
        max_score: isTier ? Math.max(0, ...tierOptions.map((o) => o.points)) : (Number(form.max_score) || 0),
        max_count: form.scoring_type === 'count' && form.max_count !== '' ? Number(form.max_count) : null,
        scoring_type: form.scoring_type,
        tier_options: tierOptions,
        order_index: Number(form.order_index) || 0,
        is_active: !!form.is_active,
      };
      let saved;
      if (modal === 'add') {
        saved = await api.postTask(body);
      } else if (modal?.id) {
        saved = await api.putTask(modal.id, body);
      }
      const taskId = saved?.id || modal?.id;
      if (taskId && imageFile) {
        await api.uploadTaskImage({ taskId, file: imageFile });
      } else if (taskId && removeImage) {
        await api.deleteTaskImage(taskId);
      }
      resetImageState();
      setModal(null);
      const updated = await api.getAllTasks();
      setData((prev) => ({ ...prev, tasks: updated }));
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu nhiệm vụ.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    const ok = await showConfirm({
      message: `Xóa nhiệm vụ "${t.name}"?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      danger: true,
    });
    if (!ok) return;
    setDeleteConfirm({ id: t.id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteTask(deleteConfirm.id);
      setDeleteConfirm(null);
      const updated = await api.getAllTasks();
      setData((prev) => ({ ...prev, tasks: updated }));
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý nhiệm vụ</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} nhiệm vụ</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openAdd}
            disabled={contents.length === 0}
            title={contents.length === 0 ? 'Cần tạo nội dung thi trước' : 'Thêm nhiệm vụ'}
          >
            Thêm nhiệm vụ
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Tìm theo tên nhiệm vụ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={filterComp} onChange={(e) => { setFilterComp(e.target.value); setFilterContent(''); }}>
          <option value="">Tất cả cuộc thi</option>
          {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={filterContent} onChange={(e) => setFilterContent(e.target.value)} disabled={!filterComp}>
          <option value="">Tất cả nội dung</option>
          {contents.filter(c => !filterComp || c.competition_id === filterComp).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Tên nhiệm vụ</th>
                <th>Thuộc nội dung</th>
                <th>Loại chấm</th>
                <th>Điểm tối đa</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có nhiệm vụ nào</td></tr>
              ) : pageItems.map((t, idx) => (
                <tr key={t.id}>
                  <td>{t.order_index ?? (page - 1) * pageSize + idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    {t.name_en && <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.name_en}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>{contentName(t.contest_content_id)}</td>
                  <td>{SCORING_TYPES.find(s => s.value === t.scoring_type)?.label || t.scoring_type}</td>
                  <td>
                    {t.scoring_type === 'count' ? (
                      <strong>{t.max_score ?? 0} × SL{t.max_count ? ` (tối đa ${t.max_count})` : ''}</strong>
                    ) : t.scoring_type === 'tier' ? (
                      <span>
                        <strong>{t.max_score ?? 0}</strong>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}> ({t.tier_options?.length || 0} mức)</span>
                      </span>
                    ) : (
                      <strong>{t.max_score ?? 0}</strong>
                    )}
                  </td>
                  <td>
                    {t.is_active
                      ? <span className="badge badge-green">Hoạt động</span>
                      : <span className="badge badge-gray">Tạm ẩn</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(t)}>Sửa</button>
                    <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(t)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm nhiệm vụ' : 'Sửa nhiệm vụ'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Thuộc nội dung thi <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  className={`form-input form-select ${errors.contest_content_id ? 'form-input-error' : ''}`}
                  value={form.contest_content_id}
                  onChange={(e) => { setForm({ ...form, contest_content_id: e.target.value }); setErrors({ ...errors, contest_content_id: '' }); }}
                >
                  <option value="">-- Chọn nội dung thi --</option>
                  {contents.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.competitions?.name ? `${c.competitions.name} → ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
                {errors.contest_content_id && <div className="form-error-text">{errors.contest_content_id}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Tên nhiệm vụ <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder="VD: Hoàn thành mê cung"
                />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Tên tiếng Anh</label>
                <input
                  className="form-input"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  placeholder="Complete the maze"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mô tả</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Mô tả chi tiết cách chấm..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Loại chấm</label>
                  <select
                    className="form-input form-select"
                    value={form.scoring_type}
                    onChange={(e) => setForm({ ...form, scoring_type: e.target.value })}
                  >
                    {SCORING_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {form.scoring_type !== 'tier' && (
                  <div className="form-group">
                    <label className="form-label">
                      {form.scoring_type === 'count' ? 'Điểm mỗi đơn vị' : 'Điểm tối đa'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`form-input ${errors.max_score ? 'form-input-error' : ''}`}
                      value={form.max_score}
                      onChange={(e) => { setForm({ ...form, max_score: e.target.value }); setErrors({ ...errors, max_score: '' }); }}
                    />
                    {errors.max_score && <div className="form-error-text">{errors.max_score}</div>}
                  </div>
                )}
              </div>

              {form.scoring_type === 'tier' && (
                <div className="form-group">
                  <label className="form-label">Các mức đạt <span style={{ color: '#dc2626' }}>*</span></label>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: -4, marginBottom: 8 }}>
                    Trọng tài sẽ chọn ĐÚNG 1 mức khi chấm. Điểm tối đa của nhiệm vụ tự tính bằng điểm mức cao nhất.
                  </div>
                  {form.tier_options.map((tier, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                      <textarea
                        className="form-input"
                        rows={2}
                        style={{ flex: 1 }}
                        value={tier.label}
                        onChange={(e) => updateTierRow(idx, { label: e.target.value })}
                        placeholder={`Mô tả mức ${idx + 1}...`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input"
                        style={{ width: 90, flexShrink: 0 }}
                        value={tier.points}
                        onChange={(e) => updateTierRow(idx, { points: e.target.value })}
                        placeholder="Điểm"
                      />
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ flexShrink: 0 }}
                        onClick={() => removeTierRow(idx)}
                        disabled={form.tier_options.length <= 1}
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                  {errors.tier_options && <div className="form-error-text">{errors.tier_options}</div>}
                  <button type="button" className="btn btn-secondary" onClick={addTierRow}>+ Thêm mức</button>
                </div>
              )}

              {form.scoring_type === 'count' && (
                <div className="form-group">
                  <label className="form-label">Số lượng tối đa</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={form.max_count}
                    onChange={(e) => setForm({ ...form, max_count: e.target.value })}
                    placeholder="Để trống = không giới hạn"
                  />
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Điểm nhiệm vụ = số lượng × {Number(form.max_score) || 0} điểm
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Ảnh minh hoạ (hiện cho trọng tài khi chấm)</label>
                {(imagePreview || (!removeImage && modal?.task && taskImageUrl(modal.task))) && (
                  <div style={{ marginBottom: 8 }}>
                    <img
                      src={imagePreview || taskImageUrl(modal.task)}
                      alt="Ảnh nhiệm vụ"
                      style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onPickImage} />
                  {modal?.task?.has_image && !removeImage && !imageFile && (
                    <button type="button" className="btn btn-danger" onClick={() => setRemoveImage(true)}>Xóa ảnh</button>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Thứ tự</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.order_index}
                    onChange={(e) => setForm({ ...form, order_index: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select
                    className="form-input form-select"
                    value={form.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
                  >
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Tạm ẩn</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu nhiệm vụ'}
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa nhiệm vụ:</p>
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
          title="Nhập nhiệm vụ từ Excel"
          columns={IMPORT_COLUMNS}
          templateFilename="mau-nhiem-vu.xlsx"
          notePrereq="Tên nội dung thi phải khớp đúng 1 nội dung đã có sẵn. Kiểu chấm để trống = binary. Không nhập được ảnh minh hoạ qua Excel — thêm ảnh riêng sau khi nhập."
          onImport={(rows) => api.importTasks(rows)}
          onDone={async () => { const updated = await api.getAllTasks(); setData((prev) => ({ ...prev, tasks: updated })); }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
