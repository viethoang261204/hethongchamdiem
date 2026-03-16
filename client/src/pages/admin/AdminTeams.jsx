import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminTeams() {
  const { showConfirm, showAlert } = useNotify();
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [allContents, setAllContents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolFilter, setSchoolFilter] = useState('');
  const [filterComp, setFilterComp] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', studentIds: [], region: 'bac', competitionId: '', contestContentId: '' });
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';
  const [studentModal, setStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState({ fullName: '', class: '', grade: '', dateOfBirth: '', school: '' });
  const [studentErrors, setStudentErrors] = useState({});
  const [schoolModal, setSchoolModal] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ name: '', level: 'THPT', province: '', district: '' });
  const [schoolErrors, setSchoolErrors] = useState({});

  useEffect(() => {
    async function loadInitial() {
      try {
        const [comps, allCont, tm, st] = await Promise.all([
          api.getCompetitions(),
          api.getAllContents(),
          api.getAllTeams(),
          api.getStudents(),
        ]);
        setCompetitions(comps.filter(c => c.isActive !== false));
        setAllContents(allCont);
        setTeams(tm);
        setStudents(st);
      } catch (e) {
        console.error('Error loading:', e);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  useEffect(() => {
    async function loadContentsForForm() {
      if (!form.competitionId) {
        setContents([]);
        return;
      }
      try {
        const list = await api.getContents(form.competitionId);
        setContents(list);
        if (!list.find(c => c.id === form.contestContentId)) {
          setForm(prev => ({ ...prev, contestContentId: '' }));
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadContentsForForm();
  }, [form.competitionId]);

  const teamsFiltered = useMemo(() => {
    if (!filterComp) return teams;
    const contentIds = allContents.filter(c => c.competitionId === filterComp).map(c => c.id);
    return teams.filter(t => contentIds.includes(t.contestContentId));
  }, [teams, filterComp, allContents]);

  const studentsFiltered = useMemo(() => {
    if (!schoolFilter) return students;
    return students.filter(s => (s.school || '') === schoolFilter);
  }, [students, schoolFilter]);

  const getContentName = (contentId) => {
    const c = allContents.find(x => x.id === contentId);
    return c ? c.name : contentId;
  };

  const getCompetitionName = (contentId) => {
    const c = allContents.find(x => x.id === contentId);
    if (!c) return '';
    const comp = competitions.find(x => x.id === c.competitionId);
    return comp ? comp.name : '';
  };

  const openAdd = () => {
    setModal('add');
    setForm({ name: '', studentIds: [], region: 'bac', competitionId: filterComp || '', contestContentId: '' });
    setErrors({});
  };

  const openEdit = (team) => {
    const content = allContents.find(c => c.id === team.contestContentId);
    setModal({ id: team.id });
    setForm({
      name: team.name || '',
      studentIds: team.studentIds || [],
      region: team.region || 'bac',
      competitionId: content?.competitionId || '',
      contestContentId: team.contestContentId || '',
    });
    setErrors({});
  };

  const openAddStudent = () => {
    setStudentModal(true);
    setStudentForm({ fullName: '', class: '', grade: '', dateOfBirth: '', school: schoolFilter || '' });
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
      const created = await api.postStudent({
        fullName: studentForm.fullName.trim(),
        class: studentForm.class.trim(),
        grade: studentForm.grade.trim(),
        dateOfBirth: studentForm.dateOfBirth,
        school: studentForm.school.trim(),
      });
      setStudents((prev) => [created, ...prev]);
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
    if (!form.competitionId) errs.competitionId = 'Chọn giải đấu.';
    if (!form.contestContentId) errs.contestContentId = 'Chọn nội dung.';
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
          competitionId: form.competitionId,
          studentIds: form.studentIds,
          region: form.region,
          order: teams.length + 1,
        });
      } else {
        await api.putTeam(modal.id, {
          name: form.name,
          studentIds: form.studentIds,
          region: form.region,
        });
      }
      setModal(null);
      const [tm, st] = await Promise.all([
        api.getAllTeams(),
        api.getStudents(),
      ]);
      setTeams(tm);
      setStudents(st);
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
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteTeam(deleteConfirm.id);
      setDeleteConfirm(null);
      const [tm, st] = await Promise.all([
        api.getAllTeams(),
        api.getStudents(),
      ]);
      setTeams(tm);
      setStudents(st);
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
        <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm đội</button>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Lọc theo giải đấu</label>
            <select className="form-input form-select" value={filterComp} onChange={(e) => setFilterComp(e.target.value)}>
              <option value="">Tất cả giải đấu</option>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <th>Giải đấu</th>
                <th>Nội dung</th>
                <th>Vùng</th>
                <th>Học sinh</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teamsFiltered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có đội nào.</td></tr>
              ) : teamsFiltered.map((t) => {
                const mems = (t.studentIds || []).map(sid => students.find(s => s.id === sid)).filter(Boolean);
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{getCompetitionName(t.contestContentId)}</td>
                    <td>{getContentName(t.contestContentId)}</td>
                    <td>{t.region === 'trung' ? 'Trung' : t.region === 'nam' ? 'Nam' : 'Bắc'}</td>
                    <td>{mems.map(m => m.fullName).join(', ')}</td>
                    <td>
                      <Link to={`/admin/competitions/${getCompetitionName(t.contestContentId)}/contents/${t.contestContentId}/scoreboard`} className="btn btn-secondary" style={{ marginRight: 8 }}>Điểm</Link>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(t)}>Sửa</button>
                      <button type="button" className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(t.id)}>Xóa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                    <label className="form-label">Giải đấu <span style={{ color: '#dc2626' }}>*</span></label>
                    <select
                      className={`form-input form-select ${errors.competitionId ? 'form-input-error' : ''}`}
                      value={form.competitionId}
                      onChange={(e) => setForm({ ...form, competitionId: e.target.value, contestContentId: '' })}
                    >
                      <option value="">-- Chọn giải đấu --</option>
                      {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.competitionId && <div className="form-error-text">{errors.competitionId}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nội dung <span style={{ color: '#dc2626' }}>*</span></label>
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
                <label className="form-label">Tên đội <span style={{ color: '#dc2626' }}>*</span></label>
                <input className={`form-input ${errors.name ? 'form-input-error' : ''}`} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }} />
                {errors.name && <div className="form-error-text">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Vùng</label>
                <select className="form-input form-select" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                  <option value="bac">Bắc</option>
                  <option value="trung">Trung</option>
                  <option value="nam">Nam</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Trường (lọc học sinh)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="form-input form-select" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
                    <option value="">Tất cả trường</option>
                    {[...new Set(students.map(s => s.school).filter(Boolean))].sort().map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={openAddStudent} title="Thêm học sinh">+</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Học sinh (chọn nhiều)</label>
                <div className="checkbox-list">
                  {studentsFiltered.map(s => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={form.studentIds.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                      {' '}{s.fullName} - {s.class} - {s.school}
                    </label>
                  ))}
                </div>
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
                  <input className="form-input" value={studentForm.grade} onChange={(e) => setStudentForm({ ...studentForm, grade: e.target.value })} />
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
    </div>
  );
}
