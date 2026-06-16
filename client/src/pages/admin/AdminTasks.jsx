import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

const SCORING_TYPES = [
  { value: 'binary',  label: 'Nhị phân (Có / Không)' },
  { value: 'tier',    label: 'Phân hạng (1 / 2 / 3)' },
  { value: 'numeric', label: 'Số (nhập điểm)' },
];

const emptyForm = {
  contest_content_id: '',
  name: '',
  name_en: '',
  description: '',
  max_score: 0,
  scoring_type: 'binary',
  order_index: 0,
  is_active: true,
};

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

  const contentName = (id) => {
    const c = contents.find(x => x.id === id);
    if (!c) return '-';
    return c.competitions?.name ? `${c.competitions.name} → ${c.name}` : c.name;
  };

  const openAdd = () => {
    setModal('add');
    setForm({ ...emptyForm, contest_content_id: filterContent || (contents[0]?.id || '') });
    setErrors({});
  };

  const openEdit = (t) => {
    setModal({ id: t.id });
    setForm({
      contest_content_id: t.contest_content_id,
      name: t.name || '',
      name_en: t.name_en || '',
      description: t.description || '',
      max_score: t.max_score ?? 0,
      scoring_type: t.scoring_type || 'binary',
      order_index: t.order_index ?? 0,
      is_active: t.is_active !== false,
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.contest_content_id) errs.contest_content_id = 'Chưa chọn nội dung thi.';
    if (!form.name.trim()) errs.name = 'Tên nhiệm vụ không được để trống.';
    const max = Number(form.max_score);
    if (Number.isNaN(max) || max < 0) errs.max_score = 'Điểm tối đa phải >= 0.';
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
      const body = {
        contest_content_id: form.contest_content_id,
        name: form.name.trim(),
        name_en: form.name_en?.trim() || null,
        description: form.description?.trim() || null,
        max_score: Number(form.max_score) || 0,
        scoring_type: form.scoring_type,
        order_index: Number(form.order_index) || 0,
        is_active: !!form.is_active,
      };
      if (modal === 'add') {
        await api.postTask(body);
      } else if (modal?.id) {
        await api.putTask(modal.id, body);
      }
      setModal(null);
      setData(null);
      const updated = await api.getAllTasks();
      setData((prev) => prev ? { ...prev, tasks: updated } : prev);
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
      setData(null);
      const updated = await api.getAllTasks();
      setData((prev) => prev ? { ...prev, tasks: updated } : prev);
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
              ) : filtered.map((t, idx) => (
                <tr key={t.id}>
                  <td>{t.order_index ?? idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    {t.name_en && <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.name_en}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>{contentName(t.contest_content_id)}</td>
                  <td>{SCORING_TYPES.find(s => s.value === t.scoring_type)?.label || t.scoring_type}</td>
                  <td><strong>{t.max_score ?? 0}</strong></td>
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
                  <label className="form-label">Điểm tối đa</label>
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
    </div>
  );
}
