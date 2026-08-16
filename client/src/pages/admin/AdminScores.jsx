import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi, clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import { formatSecondsAsMinutes } from '../../lib/time';
import SignatureBox from '../../components/SignaturePad';
import './AdminLayout.css';

const capi = createCachedApi(api);
const UNASSIGNED = '__unassigned__';

export default function AdminScores() {
  const { showConfirm, showAlert } = useNotify();
  const [scores, setScores] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [boardsForFilter, setBoardsForFilter] = useState([]); // bảng đấu của nội dung đang lọc
  const [boardsInForm, setBoardsInForm] = useState([]); // bảng đấu của nội dung đang chọn trong form
  const [images, setImages] = useState({}); // scoreId -> [image,...]
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterComp, setFilterComp] = useState('');
  const [filterContent, setFilterContent] = useState('');
  const [filterBoard, setFilterBoard] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [imageModal, setImageModal] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const SECURITY_CODE = '26122004';

  function emptyForm() {
    return {
      team_id: '',
      contest_content_id: '',
      board_id: '', // chỉ dùng để lọc dropdown đội — không gửi lên server
      referee_id: null,
      round: 1,
      score: 0,
      time: '',
      notes: '',
      criteria_scores: {},
      arena_entry_time: '',
      head_referee_name: '',
      scorekeeper_name: '',
      objection: '',
      reviewerSignature: '',
    };
  }

  const load = async () => {
    setLoadError(null);
    try {
      const [compList, scoreList, allContents, allTeams] = await Promise.all([
        capi.getCompetitions(),
        capi.getScores(),
        capi.getAllContents(),
        capi.getAllTeams(),
      ]);
      setCompetitions(compList);
      setScores(scoreList);
      setContents(allContents);
      setTeams(allTeams);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || 'Lỗi không xác định');
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = scores;
    if (filterComp) {
      const contentIdsInComp = new Set(contents.filter(c => c.competition_id === filterComp).map(c => c.id));
      list = list.filter(s => contentIdsInComp.has(s.contest_content_id));
    }
    if (filterContent) list = list.filter(s => s.contest_content_id === filterContent);
    if (filterBoard) list = list.filter(s => (s.boards?.id || UNASSIGNED) === filterBoard);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      list = list.filter(x => (x.team?.name || '').toLowerCase().includes(s));
    }
    return list;
  }, [scores, filterComp, filterContent, filterBoard, search, contents]);

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 10);

  const contentName = (id) => contents.find(c => c.id === id)?.name || id;
  const compName = (id) => competitions.find(c => c.id === id)?.name || id;
  const teamName = (id) => teams.find(t => t.id === id)?.name || '-';

  // Bảng đấu đã được thêm vào nội dung đang lọc/đang chọn trong form
  useEffect(() => {
    if (!filterContent) { setBoardsForFilter([]); return; }
    api.getBoards(filterContent).then(setBoardsForFilter).catch(() => setBoardsForFilter([]));
  }, [filterContent]);

  useEffect(() => {
    if (!form.contest_content_id) { setBoardsInForm([]); return; }
    api.getBoards(form.contest_content_id).then(setBoardsInForm).catch(() => setBoardsInForm([]));
  }, [form.contest_content_id]);

  const openAdd = () => {
    setModal('add');
    setForm({ ...emptyForm(), contest_content_id: filterContent || (contents[0]?.id || '') });
    setErrors({});
  };

  const openEdit = (s) => {
    setModal({ id: s.id });
    setForm({
      team_id: s.team_id,
      contest_content_id: s.contest_content_id,
      board_id: s.boards?.id || '',
      referee_id: s.referee_id || null,
      round: s.round || 1,
      score: s.score ?? 0,
      time: s.time || '',
      notes: s.notes || '',
      criteria_scores: s.criteria_scores || {},
      arena_entry_time: s.arena_entry_time || '',
      head_referee_name: s.head_referee_name || '',
      scorekeeper_name: s.scorekeeper_name || '',
      objection: s.objection || '',
      reviewerSignature: '',
    });
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.contest_content_id) errs.contest_content_id = 'Chưa chọn nội dung thi.';
    if (!form.team_id) errs.team_id = 'Chưa chọn đội thi.';
    const sc = Number(form.score);
    if (Number.isNaN(sc)) errs.score = 'Điểm phải là số.';
    if (modal !== 'add' && !form.reviewerSignature) {
      errs.reviewerSignature = 'Cần chữ ký người duyệt (Trưởng ban trọng tài) để sửa phiếu điểm.';
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
      const body = {
        team_id: form.team_id,
        contest_content_id: form.contest_content_id,
        referee_id: form.referee_id || null,
        round: Number(form.round) === 2 ? 2 : 1,
        score: Number(form.score) || 0,
        time: form.time?.toString().trim() || null,
        notes: form.notes?.trim() || null,
        criteria_scores: form.criteria_scores || {},
        arena_entry_time: form.arena_entry_time?.trim() || null,
        head_referee_name: form.head_referee_name?.trim() || null,
        scorekeeper_name: form.scorekeeper_name?.trim() || null,
        objection: form.objection?.trim() || null,
      };
      if (modal === 'add') {
        await api.postScore(body);
      } else if (modal?.id) {
        await api.putScore(modal.id, { ...body, reviewer_signature: form.reviewerSignature });
      }
      clearApiCache();
      setModal(null);
      load();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu phiếu điểm.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa phiếu điểm này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteScore(deleteConfirm.id);
      clearApiCache();
      setDeleteConfirm(null);
      load();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  // Xóa toàn bộ phiếu điểm ĐANG LỌC (không nhất thiết là toàn hệ thống —
  // nếu chưa chọn bộ lọc nào thì "đang lọc" = tất cả) — cùng cách "Xóa tất
  // cả trận" ở AdminCombatMatches.jsx đang làm với danh sách đang xem.
  const removeAll = async () => {
    if (!filtered.length) return;
    const ok = await showConfirm({
      message: `Xóa TẤT CẢ ${filtered.length} phiếu điểm đang hiển thị? Không thể hoàn tác.`,
      confirmText: 'Xóa tất cả', cancelText: 'Hủy', danger: true,
    });
    if (!ok) return;
    setDeleteAllConfirm({ securityCode: '' });
  };

  const confirmDeleteAll = async () => {
    if (!deleteAllConfirm) return;
    if (deleteAllConfirm.securityCode !== SECURITY_CODE) { showAlert('Mã bảo mật không đúng!', 'error'); return; }
    setDeletingAll(true);
    try {
      await api.bulkDeleteScores(filtered.map((s) => s.id));
      clearApiCache();
      setDeleteAllConfirm(null);
      load();
      showAlert('Đã xóa toàn bộ phiếu điểm.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setDeletingAll(false);
    }
  };

  const teamsInContent = useMemo(() => {
    if (!form.contest_content_id) return [];
    let list = teams.filter(t => t.contest_content_id === form.contest_content_id);
    if (form.board_id) {
      list = list.filter(t => (t.board_id || UNASSIGNED) === form.board_id);
    }
    return list;
  }, [form.contest_content_id, form.board_id, teams]);

  const loadImagesFor = async (scoreId) => {
    try {
      const imgs = await api.getScoreImages(scoreId);
      setImages(prev => ({ ...prev, [scoreId]: imgs }));
      return imgs;
    } catch (_) { return []; }
  };

  const handleUploadImage = async (scoreId, file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      await api.uploadScoreImage({ scoreId, file });
      clearApiCache();
      const imgs = await loadImagesFor(scoreId);
      // Modal "Ảnh phiếu điểm" đang mở cho đúng phiếu này → cập nhật luôn,
      // không cần đóng/mở lại mới thấy ảnh mới.
      setImageModal((m) => (m && m.scoreId === scoreId) ? { ...m, images: imgs } : m);
      showAlert('Đã tải ảnh lên.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi upload.', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteImage = async (img) => {
    const ok = await showConfirm({ message: 'Xóa ảnh này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    try {
      await api.deleteScoreImage(img.id, img.storage_path);
      clearApiCache();
      const scoreId = img.score_id || imageModal?.scoreId;
      if (scoreId) {
        const imgs = await loadImagesFor(scoreId);
        // Modal đang mở vẫn hiện ảnh vừa xóa nếu không cập nhật lại state ở đây.
        setImageModal((m) => (m && m.scoreId === scoreId) ? { ...m, images: imgs } : m);
      }
      showAlert('Đã xóa ảnh.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý phiếu điểm</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} phiếu</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-danger" onClick={removeAll} disabled={filtered.length === 0}>
            Xóa toàn bộ phiếu điểm
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openAdd}
            disabled={contents.length === 0 || teams.length === 0}
          >
            Thêm phiếu điểm
          </button>
        </div>
      </div>

      {loadError && <ErrorBox error={loadError} onRetry={load} />}
      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên đội..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterComp} onChange={(e) => { setFilterComp(e.target.value); setFilterContent(''); setFilterBoard(''); }}>
          <option value="">Tất cả cuộc thi</option>
          {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={filterContent} onChange={(e) => { setFilterContent(e.target.value); setFilterBoard(''); }} disabled={!filterComp}>
          <option value="">Tất cả nội dung</option>
          {contents.filter(c => !filterComp || c.competition_id === filterComp).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="filter-select" value={filterBoard} onChange={(e) => setFilterBoard(e.target.value)} disabled={!filterContent}>
          <option value="">Tất cả bảng đấu</option>
          {boardsForFilter.map(b => <option key={b.id} value={b.id}>{b.name}{b.age_group ? ` — ${b.age_group}` : ''}</option>)}
          <option value={UNASSIGNED}>Chưa phân bảng</option>
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Cuộc thi / Nội dung</th>
                <th>Bảng đấu</th>
                <th>Đội</th>
                <th style={{ width: 60 }}>Lượt</th>
                <th>Thời gian</th>
                <th>Điểm</th>
                <th>Ảnh</th>
                <th>Ngày nộp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có phiếu điểm</td></tr>
              ) : pageItems.map((s) => {
                const imgs = images[s.id] || [];
                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{compName(contents.find(c => c.id === s.contest_content_id)?.competition_id)}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{contentName(s.contest_content_id)}</div>
                    </td>
                    <td>{s.boards?.name || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td>{s.team?.name || teamName(s.team_id) || '-'}</td>
                    <td>{s.round || 1}</td>
                    <td>{formatSecondsAsMinutes(s.time) || '-'}</td>
                    <td><strong>{s.score ?? '-'}</strong></td>
                    <td>
                      {imgs.length > 0 ? (
                        <button
                          type="button"
                          className="image-thumb-list"
                          onClick={async () => {
                            const imgs = images[s.id] || (await loadImagesFor(s.id));
                            setImageModal({ scoreId: s.id, score: s, images: imgs });
                          }}
                          style={{ background: 'none', cursor: 'pointer' }}
                          title="Xem ảnh"
                        >
                          {imgs.slice(0, 3).map(img => (
                            <img key={img.id} src={img.public_url} alt={img.file_name || ''} />
                          ))}
                          {imgs.length > 3 && <span className="more">+{imgs.length - 3}</span>}
                        </button>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>{s.submitted_at ? new Date(s.submitted_at).toLocaleString('vi-VN') : '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link to={`/admin/scores/${s.id}`} className="btn btn-secondary" style={{ marginRight: 8 }}>Xem</Link>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(s)} style={{ marginRight: 8 }}>Sửa</button>
                      <button type="button" className="btn btn-danger" onClick={() => remove(s.id)}>Xóa</button>
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
        <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm phiếu điểm' : 'Sửa phiếu điểm'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Nội dung thi <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  className={`form-input form-select ${errors.contest_content_id ? 'form-input-error' : ''}`}
                  value={form.contest_content_id}
                  onChange={(e) => { setForm({ ...form, contest_content_id: e.target.value, board_id: '', team_id: '' }); setErrors({ ...errors, contest_content_id: '' }); }}
                >
                  <option value="">-- Chọn nội dung --</option>
                  {contents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {errors.contest_content_id && <div className="form-error-text">{errors.contest_content_id}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Bảng đấu</label>
                <select
                  className="form-input form-select"
                  value={form.board_id}
                  onChange={(e) => setForm({ ...form, board_id: e.target.value, team_id: '' })}
                  disabled={!form.contest_content_id}
                >
                  <option value="">-- Tất cả bảng --</option>
                  {boardsInForm.map(b => <option key={b.id} value={b.id}>{b.name}{b.age_group ? ` — ${b.age_group}` : ''}</option>)}
                  <option value={UNASSIGNED}>Chưa phân bảng</option>
                </select>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Chọn bảng đấu để thu hẹp danh sách đội bên dưới.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Đội thi <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  className={`form-input form-select ${errors.team_id ? 'form-input-error' : ''}`}
                  value={form.team_id}
                  onChange={(e) => { setForm({ ...form, team_id: e.target.value }); setErrors({ ...errors, team_id: '' }); }}
                  disabled={!form.contest_content_id}
                >
                  <option value="">-- Chọn đội --</option>
                  {teamsInContent.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {errors.team_id && <div className="form-error-text">{errors.team_id}</div>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Lượt</label>
                  <select
                    className="form-input form-select"
                    value={form.round}
                    onChange={(e) => setForm({ ...form, round: Number(e.target.value) })}
                  >
                    <option value={1}>Lượt 1</option>
                    <option value={2}>Lượt 2</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Điểm <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    className={`form-input ${errors.score ? 'form-input-error' : ''}`}
                    value={form.score}
                    onChange={(e) => { setForm({ ...form, score: e.target.value }); setErrors({ ...errors, score: '' }); }}
                  />
                  {errors.score && <div className="form-error-text">{errors.score}</div>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Thời gian (giây)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    placeholder="VD: 155"
                  />
                  {form.time !== '' && !Number.isNaN(Number(form.time)) && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>≈ {formatSecondsAsMinutes(form.time)} phút</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Thời gian bắt đầu vào sân</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.arena_entry_time}
                    onChange={(e) => setForm({ ...form, arena_entry_time: e.target.value })}
                    placeholder="VD: 08:30"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Trưởng ban trọng tài</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.head_referee_name}
                    onChange={(e) => setForm({ ...form, head_referee_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Người ghi điểm</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.scorekeeper_name}
                    onChange={(e) => setForm({ ...form, scorekeeper_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kiến nghị</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.objection}
                  onChange={(e) => setForm({ ...form, objection: e.target.value })}
                  placeholder="Kiến nghị/khiếu nại của đội thi (nếu có)"
                />
              </div>

              {modal !== 'add' && (
                <div className="form-group" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, color: '#1e293b' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1e293b' }}>
                    Người duyệt: Mr Ly Quang Van (Trưởng ban trọng tài)
                  </div>
                  <SignatureBox
                    label="Chữ ký người duyệt"
                    required
                    value={form.reviewerSignature}
                    onChange={(v) => { setForm({ ...form, reviewerSignature: v }); setErrors({ ...errors, reviewerSignature: '' }); }}
                  />
                  {errors.reviewerSignature && <div className="form-error-text">{errors.reviewerSignature}</div>}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    Mọi lần sửa phiếu điểm đã chấm đều được lưu vào lịch sử (kèm chữ ký) và hiện trong báo cáo/PDF xuất ra.
                  </div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu phiếu điểm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {imageModal && (
        <div className="modal-overlay" onClick={() => setImageModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Ảnh phiếu điểm — {imageModal.score?.team?.name || ''}</h3>
              <button type="button" className="form-modal-close" onClick={() => setImageModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <label className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={uploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        await handleUploadImage(imageModal.scoreId, file);
                        e.target.value = '';
                      }
                    }}
                  />
                  {uploadingImage ? 'Đang tải lên...' : '+ Thêm ảnh'}
                </label>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>JPG/PNG/WEBP, tối đa 5MB.</span>
              </div>
              {imageModal.images.length === 0 ? (
                <div className="image-empty">Chưa có ảnh nào.</div>
              ) : (
                <div className="image-grid">
                  {imageModal.images.map(img => (
                    <div key={img.id} className="image-card">
                      <a href={img.public_url} target="_blank" rel="noreferrer">
                        <img src={img.public_url} alt={img.file_name || ''} loading="lazy" />
                      </a>
                      <div className="image-overlay">
                        <button type="button" className="btn btn-danger" onClick={() => handleDeleteImage(img)}>Xóa</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setImageModal(null)}>Đóng</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa phiếu điểm:</p>
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

      {deleteAllConfirm && (
        <div className="modal-overlay" onClick={() => !deletingAll && setDeleteAllConfirm(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Xác nhận xóa tất cả phiếu điểm</h3>
              <button type="button" className="form-modal-close" onClick={() => setDeleteAllConfirm(null)} aria-label="Đóng" disabled={deletingAll}>×</button>
            </div>
            <div className="form-modal-body">
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa TẤT CẢ {filtered.length} phiếu điểm đang hiển thị:</p>
              <div className="form-group">
                <label className="form-label">Mã bảo mật</label>
                <input type="password" className="form-input" value={deleteAllConfirm.securityCode}
                  onChange={(e) => setDeleteAllConfirm({ ...deleteAllConfirm, securityCode: e.target.value })} autoFocus disabled={deletingAll} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteAllConfirm(null)} disabled={deletingAll}>Hủy</button>
              <button type="button" className="btn btn-danger" onClick={confirmDeleteAll} disabled={deletingAll}>
                {deletingAll ? 'Đang xóa...' : 'Xóa tất cả'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
