import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { createCachedApi, clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, LoaderFull, ErrorBox } from '../../hooks/useApiLoader.jsx';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const capi = createCachedApi(api);

const IMPORT_COLUMNS = [
  { key: 'full_name', label: 'Họ và tên', required: true, example: 'Nguyễn Văn A' },
  { key: 'school_name', label: 'Tên trường', required: false, example: 'THPT Chuyên Lê Hồng Phong' },
  { key: 'grade', label: 'Khối', required: false, example: '11' },
  { key: 'gender', label: 'Giới tính', required: false, example: 'Nam' },
  { key: 'birth_date', label: 'Ngày sinh (YYYY-MM-DD)', required: false, example: '2010-05-20' },
];

export default function AdminStudents() {
  const { showConfirm, showAlert } = useNotify();
  const { data: loaded, loading, error, reload, setData } = useApiLoader(
    async () => {
      const [data, sch] = await Promise.all([capi.getStudents(), capi.getSchools()]);
      return { list: data, schools: sch };
    },
    []
  );
  const list = loaded?.list ?? [];
  const schools = loaded?.schools ?? [];
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ fullName: '', grade: '', schoolId: '', dateOfBirth: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const SECURITY_CODE = '26122004';

  const load = async () => reload();

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let l = list;
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      l = l.filter(x =>
        (x.full_name || '').toLowerCase().includes(s) ||
        (x.grade || '').toLowerCase().includes(s) ||
        (x.school?.name || x.schools?.name || '').toLowerCase().includes(s)
      );
    }
    if (filterGrade) l = l.filter(x => (x.grade || '') === filterGrade);
    return l;
  }, [list, search, filterGrade]);

  const grades = useMemo(() => [...new Set(list.map(s => s.grade).filter(Boolean))].sort(), [list]);

  const openAdd = () => {
    setModal('add');
    setForm({ fullName: '', grade: '', schoolId: '', dateOfBirth: '' });
    setErrors({});
  };

  const openEdit = (s) => {
    setModal({ id: s.id });
    setForm({
      fullName: s.full_name || '',
      grade: s.grade || '',
      schoolId: s.school_id || '',
      dateOfBirth: s.birth_date || '',
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = 'Họ và tên không được để trống.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      showAlert('Vui lòng nhập đầy đủ thông tin bắt buộc.', 'error');
      return;
    }
    try {
      if (modal === 'add') {
        await api.postStudent(form);
      } else {
        await api.putStudent(modal.id, form);
      }
      clearApiCache();
      setModal(null);
      load();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa học sinh này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteStudent(deleteConfirm.id);
      clearApiCache();
      setDeleteConfirm(null);
      load();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý học sinh</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} học sinh</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm học sinh</button>
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên, lớp, trường..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
          <option value="">Tất cả khối</option>
          {grades.map(g => <option key={g} value={g}>Khối {g}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Lớp</th>
                <th>Trường</th>
                <th>Khối</th>
                <th>Ngày sinh</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có dữ liệu</td></tr>
              ) : filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.full_name}</td>
                <td>{s.grade || '-'}</td>
                <td>{s.school?.name || s.schools?.name || '-'}</td>
                <td>{s.grade}</td>
                <td>{s.birth_date || '-'}</td>
                <td>
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(s)}>Sửa</button>
                  <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(s.id)}>Xóa</button>
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
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm học sinh' : 'Sửa học sinh'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
            <div className="form-group">
              <label className="form-label">Họ và tên <span style={{ color: '#dc2626' }}>*</span></label>
              <input className={`form-input ${errors.fullName ? 'form-input-error' : ''}`} value={form.fullName} onChange={(e) => { setForm({ ...form, fullName: e.target.value }); setErrors({ ...errors, fullName: '' }); }} />
              {errors.fullName && <div className="form-error-text">{errors.fullName}</div>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Khối</label>
                <input className="form-input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="VD: 10, 11, 12" />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày sinh</label>
                <input type="date" className="form-input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Trường</label>
              <select
                className="form-input form-select"
                value={form.schoolId || ''}
                onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              >
                <option value="">-- Chọn trường --</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, marginBottom: 0 }}>Quản lý trường tại trang Học sinh → Thêm trường.</p>
            </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu học sinh' : 'Lưu thay đổi'}</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa học sinh:</p>
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
          title="Nhập học sinh từ Excel"
          columns={IMPORT_COLUMNS}
          templateFilename="mau-hoc-sinh.xlsx"
          notePrereq="Nếu điền Tên trường mà trường chưa có trong hệ thống, hệ thống sẽ tự tạo trường mới (bậc THPT)."
          onImport={(rows) => api.importStudents(rows)}
          onDone={() => { clearApiCache(); load(); }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
