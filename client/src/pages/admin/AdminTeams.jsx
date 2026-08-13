import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi, clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import ExcelImportModal from '../../components/ExcelImportModal';
import './AdminLayout.css';

const capi = createCachedApi(api);
const UNASSIGNED = '__unassigned__';

const IMPORT_COLUMNS = [
  { key: 'content_name', label: 'Tên nội dung thi', required: true, example: 'Robot Marathon' },
  { key: 'name', label: 'Tên đội', required: true, example: 'Đội A1' },
  { key: 'school_name', label: 'Tên trường', required: false, example: 'THPT Chuyên Lê Hồng Phong' },
  { key: 'board_name', label: 'Bảng đấu (Bảng A–E)', required: false, example: 'Bảng E' },
  { key: 'coach_name', label: 'Huấn luyện viên', required: false, example: '' },
  { key: 'field_name', label: 'Field', required: false, example: '' },
  { key: 'region', label: 'Khu vực (bac/trung/nam)', required: false, example: 'bac' },
];

export default function AdminTeams() {
  const { showConfirm, showAlert } = useNotify();
  const { data, loading, error, reload, setData } = useApiLoader(async () => {
    const [comps, allCont, tm, st, sch, coa, fld] = await Promise.all([
      capi.getCompetitions(),
      capi.getAllContents(),
      capi.getAllTeams(),
      capi.getStudents(),
      capi.getSchools(),
      capi.getCoaches(),
      capi.getFields(),
    ]);
    return {
      competitions: comps.filter(c => c.is_active !== false),
      allContents: allCont,
      teams: tm,
      students: st,
      schools: sch,
      coaches: coa,
      fields: fld,
    };
  }, []);
  const competitions = data?.competitions || [];
  const allContents = data?.allContents || [];
  const teams = data?.teams || [];
  const students = data?.students || [];
  const coaches = data?.coaches || [];
  const fields = data?.fields || [];
  const [schools, setSchools] = useState([]);
  useEffect(() => { if (data?.schools) setSchools(data.schools); }, [data]);
  const [filterComp, setFilterComp] = useState('');
  const [filterBoard, setFilterBoard] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterField, setFilterField] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', studentIds: [], competitionId: '', contestContentId: '', boardId: '', coachId: '', fieldId: '', schoolId: '' });
  const [contents, setContents] = useState([]);
  const [boards, setBoards] = useState([]);
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const SECURITY_CODE = '26122004';
  const [studentModal, setStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState({ fullName: '', class: '', grade: '', dateOfBirth: '', school: '' });
  const [studentErrors, setStudentErrors] = useState({});
  const [schoolModal, setSchoolModal] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ name: '', level: 'THPT', province: '', district: '' });
  const [schoolErrors, setSchoolErrors] = useState({});

  const load = async () => reload();

  useEffect(() => {
    async function loadContentsForForm() {
      if (!form.competitionId) {
        setContents([]);
        return;
      }
      try {
        const list = await capi.getContents(form.competitionId);
        setContents(list);
        if (list.length > 0 && !form.contestContentId) {
          setForm(prev => ({ ...prev, contestContentId: list[0].id }));
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadContentsForForm();
  }, [form.competitionId]);

  // Load bảng đấu của nội dung đang chọn trong form
  useEffect(() => {
    if (!form.contestContentId) {
      setBoards([]);
      return;
    }
    capi.getBoards(form.contestContentId)
      .then(setBoards)
      .catch(() => setBoards([]));
  }, [form.contestContentId]);

  const compFiltered = useMemo(() => {
    if (!filterComp) return teams;
    const contentIds = allContents.filter(c => c.competition_id === filterComp).map(c => c.id);
    return teams.filter(t => contentIds.includes(t.contest_content_id));
  }, [teams, filterComp, allContents]);

  // Bảng đấu có mặt trong tập đội đang lọc theo giải đấu — không cần gọi API riêng
  const boardOptions = useMemo(() => {
    const map = new Map();
    for (const t of compFiltered) {
      if (t.boards?.id && !map.has(t.boards.id)) map.set(t.boards.id, t.boards);
    }
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [compFiltered]);

  const boardFiltered = useMemo(() => {
    if (!filterBoard) return compFiltered;
    if (filterBoard === UNASSIGNED) return compFiltered.filter(t => !t.board_id);
    return compFiltered.filter(t => t.board_id === filterBoard);
  }, [compFiltered, filterBoard]);

  // Trường/trung tâm có mặt trong tập đội đang lọc theo giải đấu + bảng đấu
  // (teams.schools chỉ có {name, level}, không có id — dùng school_id làm key)
  const schoolOptions = useMemo(() => {
    const map = new Map();
    for (const t of boardFiltered) {
      if (t.school_id && !map.has(t.school_id)) map.set(t.school_id, t.schools?.name || t.school_id);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [boardFiltered]);

  const schoolFiltered = useMemo(() => {
    if (!filterSchool) return boardFiltered;
    if (filterSchool === UNASSIGNED) return boardFiltered.filter(t => !t.school_id);
    return boardFiltered.filter(t => t.school_id === filterSchool);
  }, [boardFiltered, filterSchool]);

  // Field có mặt trong tập đội đang lọc theo giải đấu + bảng đấu + trường
  const fieldOptions = useMemo(() => {
    const map = new Map();
    for (const t of schoolFiltered) {
      if (t.field_id && !map.has(t.field_id)) map.set(t.field_id, t.fields?.name || t.field_id);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schoolFiltered]);

  const teamsFiltered = useMemo(() => {
    if (!filterField) return schoolFiltered;
    if (filterField === UNASSIGNED) return schoolFiltered.filter(t => !t.field_id);
    return schoolFiltered.filter(t => t.field_id === filterField);
  }, [schoolFiltered, filterField]);

  const { pageItems: teamsPage, page, setPage, pageCount, totalItems, pageSize } = usePagination(teamsFiltered, 10);

  const studentsFiltered = useMemo(() => {
    if (!form.schoolId) return students;
    return students.filter(s => s.school_id === form.schoolId);
  }, [students, form.schoolId]);

  const getContentName = (contentId) => {
    const c = allContents.find(x => x.id === contentId);
    return c ? c.name : contentId;
  };

  const getCompetitionName = (contentId) => {
    const c = allContents.find(x => x.id === contentId);
    if (!c) return '';
    const comp = competitions.find(x => x.id === (c.competition_id || c.competitions?.id));
    return comp ? comp.name : (c.competitions?.name || '');
  };

  const getCompetitionId = (contentId) => allContents.find(x => x.id === contentId)?.competition_id || '';

  const openAdd = () => {
    setForm({ name: '', studentIds: [], competitionId: filterComp || '', contestContentId: '', boardId: '', coachId: '', fieldId: '', schoolId: '' });
    setContents([]);
    setErrors({});
    setModal('add');
  };

  const openEdit = (team) => {
    const content = allContents.find(c => c.id === team.contest_content_id);
    setModal({ id: team.id });
    setForm({
      name: team.name || '',
      studentIds: team.student_ids || [],
      competitionId: content?.competition_id || '',
      contestContentId: team.contest_content_id || '',
      boardId: team.board_id || '',
      coachId: team.coach_id || '',
      fieldId: team.field_id || '',
      schoolId: team.school_id || '',
    });
    setContents(content ? allContents.filter(c => c.competition_id === content.competition_id) : []);
    setErrors({});
  };

  const openAddStudent = () => {
    const schoolName = schools.find(s => s.id === form.schoolId)?.name || '';
    setStudentModal(true);
    setStudentForm({ fullName: '', class: '', grade: '', dateOfBirth: '', school: schoolName });
    setStudentErrors({});
  };

  const validateStudent = () => {
    const errs = {};
    if (!studentForm.fullName.trim()) errs.fullName = 'Họ và tên không được để trống.';
    if (!studentForm.class.trim()) errs.class = 'Lớp không được để trống.';
    if (!studentForm.school.trim()) errs.school = 'Trường không được để trống.';
    setStudentErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveStudent = async () => {
    if (!validateStudent()) {
      showAlert('Vui lòng nhập đầy đủ thông tin bắt buộc.', 'error');
      return;
    }
    try {
      let schoolId = null;
      const schoolName = studentForm.school.trim();
      if (schoolName) {
        const existing = schools.find(s => s.name === schoolName);
        if (existing) {
          schoolId = existing.id;
        } else {
          const created = await api.postSchool({ name: schoolName, level: 'THPT' });
          schoolId = created.id;
          setSchools((prev) => [created, ...prev]);
          clearApiCache();
        }
      }
      const created = await api.postStudent({
        fullName: studentForm.fullName.trim(),
        grade: studentForm.grade.trim(),
        dateOfBirth: studentForm.dateOfBirth,
        schoolId,
      });
      clearApiCache();
      setData((prev) => prev ? { ...prev, students: [created, ...prev.students] } : prev);
      setForm((prev) => ({ ...prev, studentIds: [...prev.studentIds, created.id] }));
      setStudentModal(false);
      showAlert('Đã thêm học sinh.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const openAddSchool = () => {
    setSchoolModal(true);
    setSchoolForm({ name: '', level: 'THPT', province: '', district: '' });
    setSchoolErrors({});
  };

  const validateSchool = () => {
    const errs = {};
    if (!schoolForm.name.trim()) errs.name = 'Tên trường không được để trống.';
    setSchoolErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveSchool = async () => {
    if (!validateSchool()) {
      showAlert('Vui lòng nhập tên trường.', 'error');
      return;
    }
    try {
      const created = await api.postSchool({
        name: schoolForm.name.trim(),
        level: schoolForm.level,
        province: schoolForm.province.trim(),
        district: schoolForm.district.trim(),
      });
      setSchools((prev) => [created, ...prev]);
      setForm((prev) => ({ ...prev, schoolId: created.id }));
      setStudentForm((prev) => ({ ...prev, school: created.name }));
      setSchoolModal(false);
      showAlert('Đã thêm trường.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const toggleStudent = (id) => {
    setForm(f => ({
      ...f,
      studentIds: f.studentIds.includes(id) ? f.studentIds.filter(s => s !== id) : [...f.studentIds, id],
    }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Tên đội không được để trống.';
    if (!form.contestContentId) errs.contestContentId = 'Chọn nội dung thi.';
    if (!form.schoolId) errs.schoolId = 'Chọn trường/trung tâm — mọi đội đều phải thuộc 1 trường/trung tâm.';
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
        await api.postTeam(form.contestContentId, {
          name: form.name,
          studentIds: form.studentIds,
          boardId: form.boardId || null,
          coachId: form.coachId || null,
          fieldId: form.fieldId || null,
          schoolId: form.schoolId || null,
          order: teams.length + 1,
        });
      } else {
        await api.putTeam(modal.id, {
          name: form.name,
          studentIds: form.studentIds,
          boardId: form.boardId || null,
          coachId: form.coachId || null,
          fieldId: form.fieldId || null,
          schoolId: form.schoolId || null,
        });
      }
      clearApiCache();
      setModal(null);
      const [tm, st] = await Promise.all([capi.getAllTeams(), capi.getStudents()]);
      setData((prev) => prev ? { ...prev, teams: tm, students: st } : prev);
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa đội này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
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
      await api.deleteTeam(deleteConfirm.id);
      clearApiCache();
      setDeleteConfirm(null);
      const [tm, st] = await Promise.all([capi.getAllTeams(), capi.getStudents()]);
      setData((prev) => prev ? { ...prev, teams: tm, students: st } : prev);
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý đội thi</h1>
          <p className="page-subtitle">Tổng số: {teamsFiltered.length} đội</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Nhập từ Excel</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm đội</button>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Lọc theo giải đấu</label>
            <select className="form-input form-select" value={filterComp} onChange={(e) => { setFilterComp(e.target.value); setFilterBoard(''); setFilterSchool(''); setFilterField(''); }}>
              <option value="">Tất cả giải đấu</option>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="form-label">Lọc theo bảng đấu</label>
            <select className="form-input form-select" value={filterBoard} onChange={(e) => { setFilterBoard(e.target.value); setFilterSchool(''); setFilterField(''); }}>
              <option value="">Tất cả bảng đấu</option>
              {boardOptions.map(b => <option key={b.id} value={b.id}>{b.name}{b.age_group ? ` — ${b.age_group}` : ''}</option>)}
              <option value={UNASSIGNED}>Chưa phân bảng</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="form-label">Lọc theo trường/trung tâm</label>
            <select className="form-input form-select" value={filterSchool} onChange={(e) => { setFilterSchool(e.target.value); setFilterField(''); }}>
              <option value="">Tất cả trường/trung tâm</option>
              {schoolOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={UNASSIGNED}>Chưa gán trường/trung tâm</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="form-label">Lọc theo Field</label>
            <select className="form-input form-select" value={filterField} onChange={(e) => setFilterField(e.target.value)}>
              <option value="">Tất cả Field</option>
              {fieldOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              <option value={UNASSIGNED}>Chưa gán Field</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Đội</th>
                <th>Trường/Trung tâm</th>
                <th>Giải đấu</th>
                <th>Nội dung</th>
                <th>Bảng đấu</th>
                <th>HLV</th>
                <th>Field</th>
                <th>Học sinh</th>
                <th style={{ minWidth: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {teamsFiltered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có đội nào.</td></tr>
              ) : teamsPage.map((t) => {
                const compName = getCompetitionName(t.contest_content_id);
                const mems = (t.student_ids || []).map(sid => students.find(s => s.id === sid)).filter(Boolean);
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.schools?.name || <span style={{ color: '#dc2626' }}>Chưa gán</span>}</td>
                    <td>{compName}</td>
                    <td>{getContentName(t.contest_content_id)}</td>
                    <td>{t.boards?.name || '-'}</td>
                    <td>{t.coaches?.name || '-'}</td>
                    <td>{t.fields?.name || '-'}</td>
                    <td style={{ maxWidth: 220 }}>{mems.length > 0 ? mems.map(m => m.full_name).join(', ') : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/competitions/${getCompetitionId(t.contest_content_id)}/contents/${t.contest_content_id}/scoreboard`} className="btn btn-secondary">Điểm</Link>
                        <button type="button" className="btn btn-secondary" onClick={() => openEdit(t)}>Sửa</button>
                        <button type="button" className="btn btn-danger" onClick={() => remove(t.id)}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm đội' : 'Sửa đội'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              {modal === 'add' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Giải đấu</label>
                    <select
                      className="form-input form-select"
                      value={form.competitionId}
                      onChange={(e) => setForm({ ...form, competitionId: e.target.value, contestContentId: '' })}
                    >
                      <option value="">-- Chọn giải đấu --</option>
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
                      {contents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.contestContentId && <div className="form-error-text">{errors.contestContentId}</div>}
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Bảng đấu</label>
                <select
                  className="form-input form-select"
                  value={form.boardId}
                  onChange={(e) => setForm({ ...form, boardId: e.target.value })}
                  disabled={!form.contestContentId}
                >
                  <option value="">-- Chưa phân bảng --</option>
                  {boards.map(b => (
                    <option key={b.id} value={b.id}>{b.name}{b.age_group ? ` — ${b.age_group}` : ''}</option>
                  ))}
                </select>
                {form.contestContentId && boards.length === 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Nội dung này chưa có bảng đấu — tạo ở mục "Bảng đấu".
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Huấn luyện viên</label>
                <select
                  className="form-input form-select"
                  value={form.coachId}
                  onChange={(e) => setForm({ ...form, coachId: e.target.value })}
                >
                  <option value="">-- Chưa có HLV --</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Field</label>
                <select
                  className="form-input form-select"
                  value={form.fieldId}
                  onChange={(e) => setForm({ ...form, fieldId: e.target.value })}
                >
                  <option value="">-- Chưa gán Field --</option>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tên đội <span style={{ color: '#dc2626' }}>*</span></label>
                <input className={`form-input ${errors.name ? 'form-input-error' : ''}`} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }} />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Trường/Trung tâm <span style={{ color: '#dc2626' }}>*</span></label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className={`form-input form-select ${errors.schoolId ? 'form-input-error' : ''}`}
                    value={form.schoolId}
                    onChange={(e) => { setForm({ ...form, schoolId: e.target.value }); setErrors({ ...errors, schoolId: '' }); }}
                  >
                    <option value="">-- Chọn trường/trung tâm --</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={openAddSchool} title="Thêm trường/trung tâm">+</button>
                </div>
                {errors.schoolId && <div className="form-error-text">{errors.schoolId}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Mọi đội đều thuộc 1 trường/trung tâm — chọn xong danh sách học sinh bên dưới sẽ tự lọc theo đúng trường này.
                </div>
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Học sinh (chọn nhiều)</label>
                  <button type="button" className="btn btn-secondary" onClick={openAddStudent} disabled={!form.schoolId} title={!form.schoolId ? 'Chọn trường/trung tâm trước' : 'Thêm học sinh'}>+ Thêm học sinh</button>
                </div>
                {studentsFiltered.length === 0 ? (
                  <p style={{ color: '#888', fontSize: 13 }}>Chưa có học sinh nào. Nhấn + để thêm.</p>
                ) : (
                  <div className="checkbox-list">
                    {studentsFiltered.map(s => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={form.studentIds.includes(s.id)}
                          onChange={() => toggleStudent(s.id)}
                        />
                        {' '}{s.full_name || s.fullName} - {s.grade || ''}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save}>{modal === 'add' ? 'Lưu đội' : 'Lưu thay đổi'}</button>
            </div>
          </div>
        </div>
      )}

      {studentModal && (
        <div className="modal-overlay" onClick={() => setStudentModal(false)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Thêm học sinh</h3>
              <button type="button" className="form-modal-close" onClick={() => setStudentModal(false)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Họ và tên <span style={{ color: '#dc2626' }}>*</span></label>
                <input className={`form-input ${studentErrors.fullName ? 'form-input-error' : ''}`} value={studentForm.fullName} onChange={(e) => { setStudentForm({ ...studentForm, fullName: e.target.value }); setStudentErrors({ ...studentErrors, fullName: '' }); }} />
                {studentErrors.fullName && <div className="form-error-text">{studentErrors.fullName}</div>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Lớp <span style={{ color: '#dc2626' }}>*</span></label>
                  <input className={`form-input ${studentErrors.class ? 'form-input-error' : ''}`} value={studentForm.class} onChange={(e) => { setStudentForm({ ...studentForm, class: e.target.value }); setStudentErrors({ ...studentErrors, class: '' }); }} />
                  {studentErrors.class && <div className="form-error-text">{studentErrors.class}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Khối</label>
                  <input className="form-input" value={studentForm.grade} onChange={(e) => setStudentForm({ ...studentForm, grade: e.target.value })} placeholder="VD: 10, 11, 12" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Trường <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  className={`form-input ${studentErrors.school ? 'form-input-error' : ''}`}
                  value={studentForm.school}
                  onChange={(e) => { setStudentForm({ ...studentForm, school: e.target.value }); setStudentErrors({ ...studentErrors, school: '' }); }}
                  placeholder="VD: THPT Chuyên Lê Hồng Phong"
                />
                {studentErrors.school && <div className="form-error-text">{studentErrors.school}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Ngày sinh</label>
                <input type="date" className="form-input" value={studentForm.dateOfBirth} onChange={(e) => setStudentForm({ ...studentForm, dateOfBirth: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStudentModal(false)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveStudent}>Lưu học sinh</button>
            </div>
          </div>
        </div>
      )}

      {schoolModal && (
        <div className="modal-overlay" onClick={() => setSchoolModal(false)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Thêm trường</h3>
              <button type="button" className="form-modal-close" onClick={() => setSchoolModal(false)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Tên trường <span style={{ color: '#dc2626' }}>*</span></label>
                <input className={`form-input ${schoolErrors.name ? 'form-input-error' : ''}`} value={schoolForm.name} onChange={(e) => { setSchoolForm({ ...schoolForm, name: e.target.value }); setSchoolErrors({ ...schoolErrors, name: '' }); }} placeholder="VD: THPT Chuyên Lê Hồng Phong" />
                {schoolErrors.name && <div className="form-error-text">{schoolErrors.name}</div>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Bậc</label>
                  <select className="form-input form-select" value={schoolForm.level} onChange={(e) => setSchoolForm({ ...schoolForm, level: e.target.value })}>
                    <option value="MN">Mầm non</option>
                    <option value="TH">TH</option>
                    <option value="THCS">THCS</option>
                    <option value="THPT">THPT</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tỉnh/TP</label>
                  <input className="form-input" value={schoolForm.province} onChange={(e) => setSchoolForm({ ...schoolForm, province: e.target.value })} placeholder="VD: TP. Hồ Chí Minh" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quận/Huyện</label>
                <input className="form-input" value={schoolForm.district} onChange={(e) => setSchoolForm({ ...schoolForm, district: e.target.value })} placeholder="VD: Quận 5" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSchoolModal(false)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveSchool}>Lưu trường</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa đội:</p>
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
          title="Nhập đội thi từ Excel"
          columns={IMPORT_COLUMNS}
          templateFilename="mau-doi-thi.xlsx"
          notePrereq='Tên nội dung thi phải khớp nội dung đã có sẵn (không tự tạo). Bảng đấu phải khớp đúng "Bảng A".."Bảng E" (không tự tạo). Trường/HLV/Field sẽ tự tạo mới nếu gõ tên chưa có. Không gán học sinh vào đội qua Excel — gán tay sau khi nhập.'
          onImport={(rows) => api.importTeams(rows)}
          onDone={async () => {
            clearApiCache();
            const [tm, sch, coa, fld] = await Promise.all([capi.getAllTeams(), capi.getSchools(), capi.getCoaches(), capi.getFields()]);
            setData((prev) => prev ? { ...prev, teams: tm, schools: sch, coaches: coa, fields: fld } : prev);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
