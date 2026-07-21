import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

const AGE_GROUPS = [
  'Mầm non (5-6 tuổi)',
  'Tiểu học sơ cấp (7-8 tuổi)',
  'Tiểu học cao cấp (9-11 tuổi)',
  'THCS (12-14 tuổi)',
  'THPT (15-17 tuổi)',
];

const emptyForm = { contest_content_id: '', name: '', age_group: '', order_index: 0 };

export default function AdminBoards() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(async () => {
    const [comps, allContents, allBoards] = await Promise.all([
      api.getCompetitions(),
      api.getAllContents(),
      api.getAllBoards(),
    ]);
    return { competitions: comps, contents: allContents, boards: allBoards };
  }, []);
  const competitions = data?.competitions || [];
  const contents = data?.contents || [];
  const boards = data?.boards || [];
  const [filterComp, setFilterComp] = useState('');
  const [filterContent, setFilterContent] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    let l = boards;
    if (filterComp) {
      const ids = new Set(contents.filter(c => c.competition_id === filterComp).map(c => c.id));
      l = l.filter(b => ids.has(b.contest_content_id));
    }
    if (filterContent) l = l.filter(b => b.contest_content_id === filterContent);
    return l;
  }, [boards, filterComp, filterContent, contents]);

  const contentName = (id) => {
    const c = contents.find(x => x.id === id);
    if (!c) return '-';
    return c.competitions?.name ? `${c.competitions.name} → ${c.name}` : c.name;
  };

  const refreshBoards = async () => {
    const updated = await api.getAllBoards();
    setData((prev) => prev ? { ...prev, boards: updated } : prev);
  };

  const openAdd = () => {
    setModal('add');
    setForm({ ...emptyForm, contest_content_id: filterContent || (contents[0]?.id || '') });
    setErrors({});
  };

  const openEdit = (b) => {
    setModal({ id: b.id });
    setForm({
      contest_content_id: b.contest_content_id,
      name: b.name || '',
      age_group: b.age_group || '',
      order_index: b.order_index ?? 0,
    });
    setErrors({});
  };

  const save = async () => {
    const errs = {};
    if (!form.contest_content_id) errs.contest_content_id = 'Chưa chọn nội dung thi.';
    if (!form.name.trim()) errs.name = 'Tên bảng đấu không được để trống.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      showAlert('Vui lòng nhập đầy đủ thông tin.', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        age_group: form.age_group?.trim() || null,
        order_index: Number(form.order_index) || 0,
      };
      if (modal === 'add') {
        await api.postBoard(form.contest_content_id, body);
      } else if (modal?.id) {
        await api.putBoard(modal.id, body);
      }
      setModal(null);
      await refreshBoards();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu bảng đấu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    const ok = await showConfirm({
      message: `Xóa bảng đấu "${b.name}"? Đội trong bảng sẽ thành chưa phân bảng.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteBoard(b.id);
      await refreshBoards();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bảng đấu</h1>
          <p className="page-subtitle">Chia bảng theo độ tuổi cho từng nội dung thi · {filtered.length} bảng</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openAdd}
          disabled={contents.length === 0}
          title={contents.length === 0 ? 'Cần tạo nội dung thi trước' : 'Thêm bảng đấu'}
        >
          Thêm bảng đấu
        </button>
      </div>

      <div className="filters-bar">
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
                <th>Tên bảng</th>
                <th>Độ tuổi</th>
                <th>Thuộc nội dung</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có bảng đấu nào</td></tr>
              ) : filtered.map((b, idx) => (
                <tr key={b.id}>
                  <td>{b.order_index ?? idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td>{b.age_group || '-'}</td>
                  <td style={{ fontSize: 13 }}>{contentName(b.contest_content_id)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(b)}>Sửa</button>
                    <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(b)}>Xóa</button>
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
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm bảng đấu' : 'Sửa bảng đấu'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Thuộc nội dung thi <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  className={`form-input form-select ${errors.contest_content_id ? 'form-input-error' : ''}`}
                  value={form.contest_content_id}
                  onChange={(e) => { setForm({ ...form, contest_content_id: e.target.value }); setErrors({ ...errors, contest_content_id: '' }); }}
                  disabled={modal !== 'add'}
                >
                  <option value="">-- Chọn nội dung thi --</option>
                  {contents.map(c => (
                    <option key={c.id} value={c.id}>{contentName(c.id)}</option>
                  ))}
                </select>
                {errors.contest_content_id && <div className="form-error-text">{errors.contest_content_id}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Tên bảng <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder="VD: Bảng A"
                />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Độ tuổi</label>
                <input
                  className="form-input"
                  list="age-groups"
                  value={form.age_group}
                  onChange={(e) => setForm({ ...form, age_group: e.target.value })}
                  placeholder="VD: THCS (12-14 tuổi)"
                />
                <datalist id="age-groups">
                  {AGE_GROUPS.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Thứ tự</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu bảng đấu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
