import { useState, useRef, useMemo } from 'react';
import { api } from '../../api';
import { clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import { exportToPdf, exportMultipleToPdf } from '../referee/exportPdf';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import SignatureBox from '../../components/SignaturePad';
import './AdminLayout.css';

const CONTENT_FORMAT_LABEL = {
  combat_drone: 'Đối kháng — Fly Smart Cup',
  combat_stars: 'Đối kháng — Battle of Stars',
};

// Quy ước dùng cho bảng xếp hạng vòng bảng (Appendix II) của Fly Smart Cup
// (combat_drone) — không có trong ảnh mẫu, có thể chỉnh nếu cần: thắng = 3,
// hòa = 1, thua = 0; "Highest Points" = tổng điểm số thực ghi được (tie-break
// phụ khi bằng điểm).
const WIN_POINTS = 3, DRAW_POINTS = 1, LOSS_POINTS = 0;

// Xếp hạng vòng bảng của Battle of Stars (combat_stars) theo đúng luật do
// người dùng cung cấp: (1) số trận thắng trực tiếp nhiều hơn → hạng cao hơn;
// (2) bằng nhau thì tổng điểm ghi được cao hơn → hạng cao hơn; (3) bằng nhau
// tiếp thì đội hoàn thành nhiệm vụ "Meteor Tower" nhiều lần hơn (qua tất cả
// các trận) → hạng cao hơn.
const STARS_BONUS_FALLBACK = { base: 40, per_retry: 10 };

// Chỉ dùng cho combat_drone (Fly Smart Cup) — điểm 1 trận = tổng hiệp 1 + hiệp 2.
function matchPoints(match) {
  const d = match.details || {};
  return {
    a: (Number(d.firstHalfA) || 0) + (Number(d.secondHalfA) || 0),
    b: (Number(d.firstHalfB) || 0) + (Number(d.secondHalfB) || 0),
  };
}

// Điểm ghi được của 1 đội trong 1 trận Battle of Stars — y hệt công thức
// trong CombatStarsSheetTable (tổng điểm nhiệm vụ + điểm thưởng − points lost).
function computeStarsMatchScore(match, side, bonusCfg, taskIds) {
  const d = match.details || {};
  const scores = side === 'A' ? (d.taskScoresA || {}) : (d.taskScoresB || {});
  const retry = Number(side === 'A' ? d.retryCountA : d.retryCountB) || 0;
  const lost = Number(side === 'A' ? d.pointsLostA : d.pointsLostB) || 0;
  const taskSum = taskIds.reduce((s, id) => s + (Number(scores[id]) || 0), 0);
  const extra = Math.max(0, (Number(bonusCfg.base) || 0) - (Number(bonusCfg.per_retry) || 0) * retry);
  return taskSum + extra - lost;
}

export default function AdminCombatMatches() {
  const { showConfirm, showAlert } = useNotify();
  const sheetRef = useRef(null);
  const SECURITY_CODE = '26122004';

  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, allContents, allBoards] = await Promise.all([api.getCompetitions(), api.getAllContents(), api.getAllBoards()]);
    return { competitions: comps, allContents, allBoards };
  }, []);
  const competitions = data?.competitions || [];
  const allContents = data?.allContents || [];
  const allBoards = data?.allBoards || []; // 5 bảng cố định A-E — không dùng content_boards ở đây
  const combatContents = useMemo(() => allContents.filter((c) => c.content_format !== 'scoring'), [allContents]);

  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContentId, setSelectedContentId] = useState('');
  const selectedContent = combatContents.find((c) => c.id === selectedContentId) || null;
  const contentsForComp = useMemo(
    () => combatContents.filter((c) => !selectedComp || c.competition_id === selectedComp),
    [combatContents, selectedComp]
  );

  const { data: cdata, loading: cLoading, error: cError, reload: cReload, setData: setCData } = useApiLoader(async () => {
    if (!selectedContentId) return null;
    const [teams, matches, tasks] = await Promise.all([
      api.getTeams(selectedContentId),
      api.getCombatMatches(selectedContentId),
      selectedContent?.content_format === 'combat_stars' ? api.getTasks(selectedContentId) : Promise.resolve([]),
    ]);
    return { teams, matches, tasks };
  }, [selectedContentId]);
  const teams = cdata?.teams || [];
  const matches = cdata?.matches || [];
  const tasks = cdata?.tasks || [];
  const { pageItems: matchesPage, page: matchesPageNo, setPage: setMatchesPage, pageCount: matchesPageCount, totalItems: matchesTotal, pageSize: matchesPageSize } = usePagination(matches, 10);

  const [modal, setModal] = useState(null); // 'add' | { id }
  const [form, setForm] = useState({ team_a_id: '', team_b_id: '', team_a_no: '', team_b_no: '', stage: '', group_label: '', match_no: '', board_id: '' });
  const [errors, setErrors] = useState({});
  const [detailModal, setDetailModal] = useState(null); // match object đang sửa chi tiết
  const [detailForm, setDetailForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMatchId, setViewMatchId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [pendingExport, setPendingExport] = useState(null);

  const reloadMatches = async () => {
    const m = await api.getCombatMatches(selectedContentId);
    setCData((prev) => prev ? { ...prev, matches: m } : prev);
    clearApiCache('getCombatMatches');
  };

  const openAdd = () => {
    setModal('add');
    setForm({ team_a_id: '', team_b_id: '', team_a_no: '', team_b_no: '', stage: '', group_label: '', match_no: '', board_id: '' });
    setErrors({});
  };

  const openEditMatch = (m) => {
    setModal({ id: m.id });
    setForm({
      team_a_id: m.team_a_id || '', team_b_id: m.team_b_id || '',
      team_a_no: m.team_a_no || '', team_b_no: m.team_b_no || '',
      stage: m.stage || '', group_label: m.group_label || '', match_no: m.match_no || '',
      board_id: m.board_id || '',
    });
    setErrors({});
  };

  // board_id BẮT BUỘC — trọng tài chỉ thấy trận thuộc bảng đã được phân quyền
  // (referee_boards); thiếu board_id nghĩa là NULL, và NULL không bao giờ
  // khớp trong mảng board đã phân quyền → trận biến mất khỏi màn hình trọng
  // tài dù admin đã tạo (lỗi đã xảy ra thật, giờ chặn ngay từ form).
  const validate = () => {
    const errs = {};
    if (!form.team_a_id) errs.team_a_id = 'Chọn đội Đỏ.';
    if (!form.team_b_id) errs.team_b_id = 'Chọn đội Xanh.';
    if (form.team_a_id && form.team_a_id === form.team_b_id) errs.team_b_id = 'Đội Xanh phải khác đội Đỏ.';
    if (!form.board_id) errs.board_id = 'Chọn bảng đấu — thiếu bảng thì trọng tài sẽ không thấy trận này.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveMatch = async () => {
    if (!validate()) { showAlert('Vui lòng điền đủ thông tin bắt buộc.', 'error'); return; }
    try {
      const body = {
        team_a_id: form.team_a_id, team_b_id: form.team_b_id,
        team_a_no: form.team_a_no.trim() || null, team_b_no: form.team_b_no.trim() || null,
        stage: form.stage.trim() || null, group_label: form.group_label.trim() || null,
        match_no: form.match_no.trim() || null,
        board_id: form.board_id || null,
      };
      if (modal === 'add') await api.postCombatMatch(selectedContentId, body);
      else await api.putCombatMatch(modal.id, body);
      setModal(null);
      await reloadMatches();
      showAlert('Đã lưu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const removeMatch = async (m) => {
    const ok = await showConfirm({ message: 'Xóa trận đấu này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id: m.id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.securityCode !== SECURITY_CODE) { showAlert('Mã bảo mật không đúng!', 'error'); return; }
    try {
      await api.deleteCombatMatch(selectedContentId, deleteConfirm.id);
      setDeleteConfirm(null);
      await reloadMatches();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  // ── Sửa chi tiết trận (khác nhau theo content_format) ──
  const confirmFieldsFrom = (d) => ({
    teamMembersA: d.teamMembersA || '', teamMembersB: d.teamMembersB || '',
    studentSigImageA: d.studentSignatureImageA || '', studentSigImageB: d.studentSignatureImageB || '',
    refereeSignature: d.refereeSignature || '',
    refereeSigImage: d.refereeSignatureImage || '',
    headRefereeName: d.headRefereeName || 'Mr Ly Quang Van',
    scorekeeperName: d.scorekeeperName || '',
    remarks: d.remarks || '', objection: d.objection || '',
  });

  const openDetail = (m) => {
    const d = m.details || {};
    setDetailModal(m);
    if (selectedContent?.content_format === 'combat_stars') {
      setDetailForm({
        taskScoresA: { ...(d.taskScoresA || {}) }, taskQtyA: { ...(d.taskQtyA || {}) },
        taskScoresB: { ...(d.taskScoresB || {}) }, taskQtyB: { ...(d.taskQtyB || {}) },
        retryCountA: d.retryCountA ?? 0, retryCountB: d.retryCountB ?? 0,
        pointsLostA: d.pointsLostA ?? 0, pointsLostB: d.pointsLostB ?? 0,
        durationA: d.durationA ?? '', durationB: d.durationB ?? '',
        division: d.division || '',
        winner_id: m.winner_id || '', is_draw: !!m.is_draw,
        ...confirmFieldsFrom(d),
      });
    } else {
      setDetailForm({
        division: d.division || '',
        firstHalfA: d.firstHalfA ?? 0, firstHalfB: d.firstHalfB ?? 0,
        secondHalfA: d.secondHalfA ?? 0, secondHalfB: d.secondHalfB ?? 0,
        penaltyShootout: !!d.penaltyShootout,
        penaltyA: d.penaltyA?.length ? d.penaltyA : [{ score: '', time: '' }, { score: '', time: '' }, { score: '', time: '' }],
        penaltyB: d.penaltyB?.length ? d.penaltyB : [{ score: '', time: '' }, { score: '', time: '' }, { score: '', time: '' }],
        winner_id: m.winner_id || '', is_draw: !!m.is_draw,
        ...confirmFieldsFrom(d),
      });
    }
  };

  const saveDetail = async () => {
    if (!detailModal) return;
    try {
      const isStars = selectedContent?.content_format === 'combat_stars';
      const confirmFields = {
        teamMembersA: detailForm.teamMembersA || null, teamMembersB: detailForm.teamMembersB || null,
        studentSignatureImageA: detailForm.studentSigImageA || null, studentSignatureImageB: detailForm.studentSigImageB || null,
        refereeSignature: detailForm.refereeSignature || null,
        refereeSignatureImage: detailForm.refereeSigImage || null,
        headRefereeName: detailForm.headRefereeName || null,
        scorekeeperName: detailForm.scorekeeperName || null,
        remarks: detailForm.remarks || null, objection: detailForm.objection || null,
      };
      const details = isStars
        ? {
            division: detailForm.division || null,
            taskScoresA: detailForm.taskScoresA, taskQtyA: detailForm.taskQtyA,
            taskScoresB: detailForm.taskScoresB, taskQtyB: detailForm.taskQtyB,
            retryCountA: Number(detailForm.retryCountA) || 0, retryCountB: Number(detailForm.retryCountB) || 0,
            pointsLostA: Number(detailForm.pointsLostA) || 0, pointsLostB: Number(detailForm.pointsLostB) || 0,
            durationA: detailForm.durationA || null, durationB: detailForm.durationB || null,
            ...confirmFields,
          }
        : {
            division: detailForm.division || null,
            firstHalfA: Number(detailForm.firstHalfA) || 0, firstHalfB: Number(detailForm.firstHalfB) || 0,
            secondHalfA: Number(detailForm.secondHalfA) || 0, secondHalfB: Number(detailForm.secondHalfB) || 0,
            penaltyShootout: !!detailForm.penaltyShootout,
            penaltyA: detailForm.penaltyShootout ? detailForm.penaltyA : [],
            penaltyB: detailForm.penaltyShootout ? detailForm.penaltyB : [],
            ...confirmFields,
          };
      await api.putCombatMatch(detailModal.id, {
        details,
        winner_id: detailForm.is_draw ? null : (detailForm.winner_id || null),
        is_draw: !!detailForm.is_draw,
      });
      setDetailModal(null);
      await reloadMatches();
      showAlert('Đã lưu chi tiết trận.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const setTaskScore = (side, taskId, task, value) => {
    setDetailForm((f) => {
      const key = side === 'A' ? 'taskScoresA' : 'taskScoresB';
      return { ...f, [key]: { ...f[key], [taskId]: value } };
    });
  };
  const setTaskQty = (side, taskId, task, qty) => {
    setDetailForm((f) => {
      const scoreKey = side === 'A' ? 'taskScoresA' : 'taskScoresB';
      const qtyKey = side === 'A' ? 'taskQtyA' : 'taskQtyB';
      return {
        ...f,
        [qtyKey]: { ...f[qtyKey], [taskId]: qty },
        [scoreKey]: { ...f[scoreKey], [taskId]: qty * (Number(task.max_score) || 0) },
      };
    });
  };

  // ── Bảng xếp hạng vòng bảng (Appendix II) — tính lại từ danh sách trận cùng group_label ──
  const isStars = selectedContent?.content_format === 'combat_stars';
  const meteorTowerTaskId = useMemo(
    () => (isStars ? tasks.find((t) => t.name?.trim().toLowerCase() === 'meteor tower')?.id : null),
    [isStars, tasks]
  );
  const starsBonusCfg = selectedContent?.bonus_config || STARS_BONUS_FALLBACK;
  const starsTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const groups = useMemo(() => {
    const byGroup = new Map();
    for (const m of matches) {
      if (!m.group_label) continue;
      if (!byGroup.has(m.group_label)) byGroup.set(m.group_label, []);
      byGroup.get(m.group_label).push(m);
    }
    const result = [];
    for (const [label, groupMatches] of byGroup.entries()) {
      if (groupMatches.length < 2) continue;
      const teamIds = new Set();
      for (const m of groupMatches) { if (m.team_a_id) teamIds.add(m.team_a_id); if (m.team_b_id) teamIds.add(m.team_b_id); }
      const standings = Array.from(teamIds).map((tid) => {
        const teamName = teams.find((t) => t.id === tid)?.name || groupMatches.find((m) => m.team_a_id === tid)?.team_a?.name
          || groupMatches.find((m) => m.team_b_id === tid)?.team_b?.name || tid;
        let wins = 0, points = 0, highestPoints = 0, totalScore = 0, meteorTowerCount = 0;
        const vs = {};
        for (const m of groupMatches) {
          if (m.team_a_id !== tid && m.team_b_id !== tid) continue;
          const isA = m.team_a_id === tid;
          const oppId = isA ? m.team_b_id : m.team_a_id;

          if (m.winner_id === tid) wins++;
          if (m.winner_id) points += m.winner_id === tid ? WIN_POINTS : LOSS_POINTS;
          else if (m.is_draw) points += DRAW_POINTS;

          if (isStars) {
            const myScore = computeStarsMatchScore(m, isA ? 'A' : 'B', starsBonusCfg, starsTaskIds);
            const oppScore = computeStarsMatchScore(m, isA ? 'B' : 'A', starsBonusCfg, starsTaskIds);
            totalScore += myScore;
            if (meteorTowerTaskId) {
              const scores = isA ? (m.details?.taskScoresA || {}) : (m.details?.taskScoresB || {});
              if ((Number(scores[meteorTowerTaskId]) || 0) > 0) meteorTowerCount++;
            }
            if (oppId) vs[oppId] = `${myScore}:${oppScore}`;
          } else {
            const pts = matchPoints(m);
            const myScore = pts ? (isA ? pts.a : pts.b) : null;
            const oppScore = pts ? (isA ? pts.b : pts.a) : null;
            if (myScore !== null) highestPoints += myScore;
            if (oppId) vs[oppId] = pts ? `${myScore}:${oppScore}` : (m.winner_id === tid ? 'W' : m.winner_id === oppId ? 'L' : m.is_draw ? 'D' : '');
          }
        }
        return { teamId: tid, teamName, wins, points, highestPoints, totalScore, meteorTowerCount, vs };
      });
      if (isStars) {
        // (1) số trận thắng trực tiếp, (2) tổng điểm ghi được, (3) số lần hoàn thành Meteor Tower
        standings.sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore || b.meteorTowerCount - a.meteorTowerCount);
      } else {
        standings.sort((a, b) => b.points - a.points || b.highestPoints - a.highestPoints);
      }
      standings.forEach((s, i) => { s.rank = i + 1; });
      result.push({ label, teamIds: Array.from(teamIds), standings });
    }
    return result;
  }, [matches, teams, isStars, starsBonusCfg, starsTaskIds, meteorTowerTaskId]);

  // ── Xuất PDF ──
  const handleExportOne = async () => {
    setExporting(true);
    try {
      const m = matches.find((x) => x.id === viewMatchId);
      const teamName = (m?.team_a?.name || 'tran').replace(/\s+/g, '-').toLowerCase();
      await exportToPdf(sheetRef, `${selectedContent?.content_format}-${teamName}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    if (!matches.length) return;
    setExporting(true);
    try {
      setPendingExport(matches);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = matches.map((m) => document.getElementById(`combat-export-${m.id}`));
      const slug = (selectedContent?.name || 'doi-khang').replace(/\s+/g, '-').toLowerCase();
      await exportMultipleToPdf(nodes, `phieu-doi-khang-${slug}`);
    } finally {
      setPendingExport(null);
      setExporting(false);
    }
  };

  const renderSheet = (m, ref) => (
    selectedContent?.content_format === 'combat_stars'
      ? <CombatStarsSheetTable match={m} content={selectedContent} tasks={tasks} sheetRef={ref} />
      : <CombatDroneSheetTable match={m} sheetRef={ref} />
  );

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trận đối kháng</h1>
          <p className="page-subtitle">Fly Smart Cup / Battle of Stars — quản lý trận, nhập chi tiết, xuất phiếu điểm</p>
        </div>
        {matches.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={handleExportAll} disabled={exporting}>
            {exporting ? 'Đang xuất...' : 'Tải PDF toàn bộ'}
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Cuộc thi</label>
            <select className="form-input form-select" value={selectedComp} onChange={(e) => { setSelectedComp(e.target.value); setSelectedContentId(''); }}>
              <option value="">-- Chọn cuộc thi --</option>
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 280 }}>
            <label className="form-label">Nội dung đối kháng</label>
            <select className="form-input form-select" value={selectedContentId} onChange={(e) => setSelectedContentId(e.target.value)} disabled={!selectedComp}>
              <option value="">-- Chọn nội dung --</option>
              {contentsForComp.map((c) => <option key={c.id} value={c.id}>{c.name} ({CONTENT_FORMAT_LABEL[c.content_format]})</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      {!selectedContentId ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#888' }}>
          <p>Chọn cuộc thi và nội dung đối kháng ở trên để quản lý trận đấu.</p>
          {combatContents.length === 0 && !loading && (
            <p style={{ marginTop: 8, fontSize: 13 }}>Chưa có nội dung nào được đặt định dạng đối kháng — vào "Nội dung thi" để đổi.</p>
          )}
        </div>
      ) : cLoading ? (
        <p style={{ padding: 24 }}>Đang tải...</p>
      ) : (
        <>
          {cError && <ErrorBox error={cError} onRetry={cReload} />}

          <div className="page-header" style={{ marginBottom: 12 }}>
            <div><h3 className="card-title">Danh sách trận ({matches.length})</h3></div>
            <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trận</button>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Vòng / Bảng</th>
                    <th>Đội Đỏ</th>
                    <th>Đội Xanh</th>
                    <th>Kết quả</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có trận nào.</td></tr>
                  ) : matchesPage.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.stage || '-'}
                        {m.group_label && <div style={{ fontSize: 12, color: '#64748b' }}>Bảng: {m.group_label}</div>}
                      </td>
                      <td>{m.team_a?.name || '-'}{m.team_a_no ? ` (No.${m.team_a_no})` : ''}</td>
                      <td>{m.team_b?.name || '-'}{m.team_b_no ? ` (No.${m.team_b_no})` : ''}</td>
                      <td style={{ fontSize: 13 }}>
                        {m.is_draw ? 'Hòa' : m.winner_id ? `Thắng: ${m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}` : 'Chưa có kết quả'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => openEditMatch(m)}>Sửa trận</button>
                          <button type="button" className="btn btn-secondary" onClick={() => openDetail(m)}>Nhập điểm</button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setViewMatchId(viewMatchId === m.id ? null : m.id)}
                          >
                            {viewMatchId === m.id ? 'Đóng phiếu' : 'Xem phiếu'}
                          </button>
                          <button type="button" className="btn btn-danger" onClick={() => removeMatch(m)}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={matchesPageNo} pageCount={matchesPageCount} onChange={setMatchesPage} totalItems={matchesTotal} pageSize={matchesPageSize} />
          </div>

          {viewMatchId && (
            <div className="card" style={{ marginBottom: 24, overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button type="button" className="btn btn-primary" onClick={handleExportOne} disabled={exporting}>
                  {exporting ? 'Đang xuất...' : 'Tải PDF'}
                </button>
              </div>
              {renderSheet(matches.find((m) => m.id === viewMatchId), sheetRef)}
            </div>
          )}

          {groups.map((g) => (
            <div className="card" key={g.label} style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h3 className="card-title">Bảng xếp hạng — {g.label}</h3>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      {g.standings.map((s) => <th key={s.teamId} style={{ textAlign: 'center' }}>{s.teamName}</th>)}
                      {isStars ? (
                        <>
                          <th style={{ textAlign: 'center' }}>Số trận thắng</th>
                          <th style={{ textAlign: 'center' }}>Tổng điểm</th>
                          <th style={{ textAlign: 'center' }} title="Tiêu chí phụ khi vẫn bằng nhau">Meteor Tower</th>
                        </>
                      ) : (
                        <>
                          <th style={{ textAlign: 'center' }}>Points</th>
                          <th style={{ textAlign: 'center' }}>Highest Points</th>
                        </>
                      )}
                      <th style={{ textAlign: 'center' }}>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.standings.map((row) => (
                      <tr key={row.teamId}>
                        <td style={{ fontWeight: 600 }}>{row.teamName}</td>
                        {g.standings.map((opp) => (
                          <td key={opp.teamId} style={{ textAlign: 'center' }}>
                            {opp.teamId === row.teamId ? '—' : (row.vs[opp.teamId] || '')}
                          </td>
                        ))}
                        {isStars ? (
                          <>
                            <td style={{ textAlign: 'center' }}><strong>{row.wins}</strong></td>
                            <td style={{ textAlign: 'center' }}><strong>{row.totalScore}</strong></td>
                            <td style={{ textAlign: 'center' }}>{row.meteorTowerCount}</td>
                          </>
                        ) : (
                          <>
                            <td style={{ textAlign: 'center' }}><strong>{row.points}</strong></td>
                            <td style={{ textAlign: 'center' }}>{row.highestPoints}</td>
                          </>
                        )}
                        <td style={{ textAlign: 'center' }}><strong>{row.rank}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Modal: thêm/sửa trận ── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">{modal === 'add' ? 'Thêm trận' : 'Sửa trận'}</h3>
              <button type="button" className="form-modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Bảng đấu <span style={{ color: '#dc2626' }}>*</span></label>
                <select className={`form-input form-select ${errors.board_id ? 'form-input-error' : ''}`} value={form.board_id} onChange={(e) => setForm({ ...form, board_id: e.target.value })}>
                  <option value="">-- Chọn bảng --</option>
                  {allBoards.map((b) => <option key={b.id} value={b.id}>{b.name}{b.age_group ? ` — ${b.age_group}` : ''}</option>)}
                </select>
                {errors.board_id && <div className="form-error-text">{errors.board_id}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Bắt buộc — trọng tài chỉ được phân quyền theo bảng đấu, thiếu bảng thì trận sẽ không hiện bên trọng tài.
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Đội Đỏ <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className={`form-input form-select ${errors.team_a_id ? 'form-input-error' : ''}`} value={form.team_a_id} onChange={(e) => setForm({ ...form, team_a_id: e.target.value })}>
                    <option value="">-- Chọn đội --</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Số báo danh Đỏ</label>
                  <input className="form-input" value={form.team_a_no} onChange={(e) => setForm({ ...form, team_a_no: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Đội Xanh <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className={`form-input form-select ${errors.team_b_id ? 'form-input-error' : ''}`} value={form.team_b_id} onChange={(e) => setForm({ ...form, team_b_id: e.target.value })}>
                    <option value="">-- Chọn đội --</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {errors.team_b_id && <div className="form-error-text">{errors.team_b_id}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Số báo danh Xanh</label>
                  <input className="form-input" value={form.team_b_no} onChange={(e) => setForm({ ...form, team_b_no: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Vòng đấu (Preliminary/Intermediate/Chung kết...)</label>
                <input className="form-input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} placeholder="VD: Preliminary 1" />
              </div>
              <div className="form-group">
                <label className="form-label">Bảng vòng tròn (để trống nếu là loại trực tiếp)</label>
                <input className="form-input" value={form.group_label} onChange={(e) => setForm({ ...form, group_label: e.target.value })} placeholder="VD: Group 1" />
              </div>
              <div className="form-group">
                <label className="form-label">Số trận</label>
                <input className="form-input" value={form.match_no} onChange={(e) => setForm({ ...form, match_no: e.target.value })} placeholder="VD: 1" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveMatch}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: nhập chi tiết điểm ── */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Nhập điểm — {detailModal.team_a?.name} vs {detailModal.team_b?.name}</h3>
              <button type="button" className="form-modal-close" onClick={() => setDetailModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Division</label>
                <input className="form-input" value={detailForm.division || ''} onChange={(e) => setDetailForm({ ...detailForm, division: e.target.value })} />
              </div>

              {selectedContent?.content_format === 'combat_stars' ? (
                <>
                  {tasks.map((t) => (
                    <div key={t.id} className="form-row">
                      <div className="form-group">
                        <label className="form-label">{t.name} — Đỏ {t.scoring_type === 'count' ? '(số lượng)' : `(0-${t.max_score})`}</label>
                        {t.scoring_type === 'count' ? (
                          <input type="number" min="0" className="form-input" value={detailForm.taskQtyA?.[t.id] ?? 0}
                            onChange={(e) => setTaskQty('A', t.id, t, Number(e.target.value) || 0)} />
                        ) : (
                          <input type="number" min="0" max={t.max_score} className="form-input" value={detailForm.taskScoresA?.[t.id] ?? 0}
                            onChange={(e) => setTaskScore('A', t.id, t, Number(e.target.value) || 0)} />
                        )}
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t.name} — Xanh {t.scoring_type === 'count' ? '(số lượng)' : `(0-${t.max_score})`}</label>
                        {t.scoring_type === 'count' ? (
                          <input type="number" min="0" className="form-input" value={detailForm.taskQtyB?.[t.id] ?? 0}
                            onChange={(e) => setTaskQty('B', t.id, t, Number(e.target.value) || 0)} />
                        ) : (
                          <input type="number" min="0" max={t.max_score} className="form-input" value={detailForm.taskScoresB?.[t.id] ?? 0}
                            onChange={(e) => setTaskScore('B', t.id, t, Number(e.target.value) || 0)} />
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Số lần chạy lại — Đỏ</label>
                      <input type="number" min="0" className="form-input" value={detailForm.retryCountA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, retryCountA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Số lần chạy lại — Xanh</label>
                      <input type="number" min="0" className="form-input" value={detailForm.retryCountB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, retryCountB: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Points lost — Đỏ</label>
                      <input type="number" min="0" className="form-input" value={detailForm.pointsLostA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, pointsLostA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Points lost — Xanh</label>
                      <input type="number" min="0" className="form-input" value={detailForm.pointsLostB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, pointsLostB: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Total duration — Đỏ (giây)</label>
                      <input type="number" min="0" className="form-input" value={detailForm.durationA ?? ''} onChange={(e) => setDetailForm({ ...detailForm, durationA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Total duration — Xanh (giây)</label>
                      <input type="number" min="0" className="form-input" value={detailForm.durationB ?? ''} onChange={(e) => setDetailForm({ ...detailForm, durationB: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Hiệp 1 — Đỏ</label>
                      <input type="number" className="form-input" value={detailForm.firstHalfA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, firstHalfA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Hiệp 1 — Xanh</label>
                      <input type="number" className="form-input" value={detailForm.firstHalfB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, firstHalfB: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Hiệp 2 — Đỏ</label>
                      <input type="number" className="form-input" value={detailForm.secondHalfA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, secondHalfA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Hiệp 2 — Xanh</label>
                      <input type="number" className="form-input" value={detailForm.secondHalfB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, secondHalfB: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={!!detailForm.penaltyShootout} onChange={(e) => setDetailForm({ ...detailForm, penaltyShootout: e.target.checked })} style={{ width: 'auto' }} />
                      Đá luân lưu (Penalty Shootout)
                    </label>
                  </div>
                  {detailForm.penaltyShootout && (
                    <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 12 }}>
                      {[0, 1, 2].map((i) => (
                        <div className="form-row" key={i}>
                          <div className="form-group">
                            <label className="form-label">Đỏ — lượt {i + 1} (điểm / thời gian)</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="number" className="form-input" placeholder="Điểm" value={detailForm.penaltyA?.[i]?.score ?? ''}
                                onChange={(e) => setDetailForm((f) => { const a = [...f.penaltyA]; a[i] = { ...a[i], score: e.target.value }; return { ...f, penaltyA: a }; })} />
                              <input type="text" className="form-input" placeholder="Thời gian" value={detailForm.penaltyA?.[i]?.time ?? ''}
                                onChange={(e) => setDetailForm((f) => { const a = [...f.penaltyA]; a[i] = { ...a[i], time: e.target.value }; return { ...f, penaltyA: a }; })} />
                            </div>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Xanh — lượt {i + 1} (điểm / thời gian)</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="number" className="form-input" placeholder="Điểm" value={detailForm.penaltyB?.[i]?.score ?? ''}
                                onChange={(e) => setDetailForm((f) => { const b = [...f.penaltyB]; b[i] = { ...b[i], score: e.target.value }; return { ...f, penaltyB: b }; })} />
                              <input type="text" className="form-input" placeholder="Thời gian" value={detailForm.penaltyB?.[i]?.time ?? ''}
                                onChange={(e) => setDetailForm((f) => { const b = [...f.penaltyB]; b[i] = { ...b[i], time: e.target.value }; return { ...f, penaltyB: b }; })} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!detailForm.is_draw} onChange={(e) => setDetailForm({ ...detailForm, is_draw: e.target.checked, winner_id: e.target.checked ? '' : detailForm.winner_id })} style={{ width: 'auto' }} />
                  Hòa
                </label>
                {!detailForm.is_draw && (
                  <select className="form-input form-select" value={detailForm.winner_id || ''} onChange={(e) => setDetailForm({ ...detailForm, winner_id: e.target.value })}>
                    <option value="">-- Chưa có kết quả --</option>
                    <option value={detailModal.team_a_id}>{detailModal.team_a?.name} thắng (Đỏ)</option>
                    <option value={detailModal.team_b_id}>{detailModal.team_b?.name} thắng (Xanh)</option>
                  </select>
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
              <h4 style={{ marginBottom: 8 }}>Xác nhận điểm</h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Học sinh/đội trưởng — Đỏ</label>
                  <input className="form-input" value={detailForm.teamMembersA || ''} onChange={(e) => setDetailForm({ ...detailForm, teamMembersA: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Học sinh/đội trưởng — Xanh</label>
                  <input className="form-input" value={detailForm.teamMembersB || ''} onChange={(e) => setDetailForm({ ...detailForm, teamMembersB: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <SignatureBox label="Chữ ký đội Đỏ" value={detailForm.studentSigImageA} onChange={(v) => setDetailForm({ ...detailForm, studentSigImageA: v })} />
                </div>
                <div className="form-group">
                  <SignatureBox label="Chữ ký đội Xanh" value={detailForm.studentSigImageB} onChange={(v) => setDetailForm({ ...detailForm, studentSigImageB: v })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tên trọng tài</label>
                  <input className="form-input" value={detailForm.refereeSignature || ''} onChange={(e) => setDetailForm({ ...detailForm, refereeSignature: e.target.value })} />
                </div>
                <div className="form-group">
                  <SignatureBox label="Chữ ký trọng tài" value={detailForm.refereeSigImage} onChange={(v) => setDetailForm({ ...detailForm, refereeSigImage: v })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Trưởng ban trọng tài</label>
                  <input className="form-input" value={detailForm.headRefereeName || ''} onChange={(e) => setDetailForm({ ...detailForm, headRefereeName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Người ghi điểm</label>
                  <input className="form-input" value={detailForm.scorekeeperName || ''} onChange={(e) => setDetailForm({ ...detailForm, scorekeeperName: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea className="form-input" rows={2} value={detailForm.remarks || ''} onChange={(e) => setDetailForm({ ...detailForm, remarks: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Kiến nghị</label>
                <textarea className="form-input" rows={2} value={detailForm.objection || ''} onChange={(e) => setDetailForm({ ...detailForm, objection: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDetailModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveDetail}>Lưu điểm</button>
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
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa trận đấu:</p>
              <div className="form-group">
                <label className="form-label">Mã bảo mật</label>
                <input type="password" className="form-input" value={deleteConfirm.securityCode}
                  onChange={(e) => setDeleteConfirm({ ...deleteConfirm, securityCode: e.target.value })} autoFocus />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Hủy</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}

      {pendingExport && (
        <div style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1 }}>
          {pendingExport.map((m) => (
            <div key={m.id} id={`combat-export-${m.id}`}>
              {renderSheet(m, null)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
