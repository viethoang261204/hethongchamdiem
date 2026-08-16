import { useState, useRef, useMemo } from 'react';
import { api, taskImageUrl } from '../../api';
import { clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import { exportToPdf, exportMultipleToPdf } from '../referee/exportPdf';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import SignatureBox from '../../components/SignaturePad';
import {
  ENERGY_BLOCK_MAX, FIREPOWER_BALL_MAX, ENERGY_BLOCK_SCORE, FIREPOWER_BALL_SCORE, METEOR_TOWER_SCORE,
  computeTaskScore, determineGroupMatchResult, determineFinalsMatchResult, computeGroupStandings, generateRoundRobin,
} from '../../lib/battleScoring';
import {
  PENALTY_MAX_SECONDS, computeSideScore,
  determineGroupMatchResult as determineDroneGroupResult,
  determineKnockoutResult, resolveShootoutWinner,
  computeGroupStandings as computeDroneGroupStandings,
} from '../../lib/flySmartCupScoring';
import './AdminLayout.css';

const CONTENT_FORMAT_LABEL = {
  combat_drone: 'Đối kháng — Fly Smart Cup',
  combat_stars: 'Đối kháng — Battle of Stars',
};

// 4 nhiệm vụ cố định Battle of Stars — ảnh minh hoạ lấy từ "Nhiệm vụ" (bảng
// tasks) đã tạo sẵn cùng tên cho content này, khớp theo tên (không phân biệt
// hoa/thường) — không có kho ảnh riêng, admin quản lý ảnh như task bình thường.
const MISSION_NAMES = ['Meteor Tower', 'Energy Defense', 'Full Firepower', 'Final Fortress'];

const clampEnergy = (v) => Math.min(ENERGY_BLOCK_MAX, Math.max(0, parseInt(v, 10) || 0));
const clampFirepower = (v) => Math.min(FIREPOWER_BALL_MAX, Math.max(0, parseInt(v, 10) || 0));
const newShootoutRound = (n) => ({ roundNo: n, aSuccess: false, aTimeSeconds: '', bSuccess: false, bTimeSeconds: '' });

// Sắp xếp lại thứ tự các cặp giữa các round để né việc 1 đội thi 2 trận
// LIÊN TIẾP về số thứ tự (match_no) — round-robin gốc (generateRoundRobin)
// đã đảm bảo 1 đội chỉ xuất hiện đúng 1 lần / round, nên rủi ro chỉ nằm ở
// ranh giới giữa 2 round: đội đá cặp CUỐI round trước trùng đội đá cặp ĐẦU
// round sau (2 số thứ tự liền kề). Nếu trùng và round hiện tại có >1 cặp,
// đẩy cặp đó xuống cuối round hiện tại. Round chỉ có đúng 1 cặp thì không
// có chỗ để hoán đổi (không tránh được) — chấp nhận giới hạn này.
function orderPairsAcrossRounds(rounds) {
  const ordered = [];
  let prevPairTeams = null;
  for (const round of rounds) {
    const pairs = round.pairs.slice();
    if (prevPairTeams && pairs.length > 1) {
      const idx = pairs.findIndex((p) => prevPairTeams.has(p.teamAId) || prevPairTeams.has(p.teamBId));
      if (idx > -1 && idx !== pairs.length - 1) {
        const [moved] = pairs.splice(idx, 1);
        pairs.push(moved);
      }
    }
    ordered.push(...pairs);
    if (pairs.length) {
      const last = pairs[pairs.length - 1];
      prevPairTeams = new Set([last.teamAId, last.teamBId]);
    }
  }
  return ordered;
}

// Số thứ tự trận tiếp theo trong 1 group — đếm tiếp từ match_no lớn nhất
// đã có trong CHÍNH group đó (áp dụng chung cho cả lượt đi lẫn lượt về, để
// lượt về nối tiếp số của lượt đi thay vì đánh số lại từ đầu).
function nextMatchNoForGroup(matches, groupLabel) {
  const nums = matches
    .filter((m) => m.group_label === groupLabel)
    .map((m) => parseInt(m.match_no, 10))
    .filter((n) => !Number.isNaN(n));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export default function AdminCombatMatches() {
  const { showConfirm, showAlert } = useNotify();
  const sheetRef = useRef(null);
  const SECURITY_CODE = '26122004';

  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, allContents, allBoards, allFields] = await Promise.all([api.getCompetitions(), api.getAllContents(), api.getAllBoards(), api.getFields()]);
    return { competitions: comps, allContents, allBoards, allFields };
  }, []);
  const competitions = data?.competitions || [];
  const allContents = data?.allContents || [];
  const allBoards = data?.allBoards || []; // 5 bảng cố định A-E — không dùng content_boards ở đây
  const allFields = data?.allFields || [];
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
    const isStarsContent = selectedContent?.content_format === 'combat_stars';
    const [teams, matches, tasks] = await Promise.all([
      api.getTeams(selectedContentId),
      api.getCombatMatches(selectedContentId),
      // Ảnh minh hoạ 4 nhiệm vụ Battle of Stars — lấy từ "Nhiệm vụ" đã tạo sẵn
      // cho đúng content này (khớp theo tên), không phải kho ảnh riêng.
      isStarsContent ? api.getTasks(selectedContentId).catch(() => []) : Promise.resolve([]),
    ]);
    return { teams, matches, tasks };
  }, [selectedContentId]);
  const teams = cdata?.teams || [];
  const matches = cdata?.matches || [];
  const missionTasks = cdata?.tasks || [];

  // Lọc "Danh sách trận" theo Bảng (group_label) — nhiều trận dồn 1 chỗ dễ
  // rối, để trọng tài/admin xem riêng từng bảng. "Finals" gộp các trận
  // group_label rỗng (vòng loại trực tiếp). Lọc thêm theo Sân (field) — các
  // đội khác bảng vẫn có thể thi chung 1 sân, cần xem riêng theo sân được.
  const FINALS_FILTER = '__finals__';
  const [matchListGroupFilter, setMatchListGroupFilter] = useState('');
  const [matchListFieldFilter, setMatchListFieldFilter] = useState('');
  const matchGroupOptions = useMemo(
    () => [...new Set(matches.map((m) => m.group_label).filter(Boolean))].sort(),
    [matches]
  );
  const matchFieldOptions = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      if (m.field?.id && !map.has(m.field.id)) map.set(m.field.id, m.field.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [matches]);
  const matchesForList = useMemo(() => {
    let l = matches;
    if (matchListGroupFilter === FINALS_FILTER) l = l.filter((m) => !m.group_label);
    else if (matchListGroupFilter) l = l.filter((m) => m.group_label === matchListGroupFilter);
    if (matchListFieldFilter) l = l.filter((m) => m.field_id === matchListFieldFilter);
    return l;
  }, [matches, matchListGroupFilter, matchListFieldFilter]);

  const { pageItems: matchesPage, page: matchesPageNo, setPage: setMatchesPage, pageCount: matchesPageCount, totalItems: matchesTotal, pageSize: matchesPageSize } = usePagination(matchesForList, 10);

  const [modal, setModal] = useState(null); // 'add' | { id }
  const [form, setForm] = useState({ team_a_id: '', team_b_id: '', team_a_no: '', team_b_no: '', stage: '', group_label: '', match_no: '', board_id: '', field_id: '' });
  const [errors, setErrors] = useState({});
  const [detailModal, setDetailModal] = useState(null); // match object đang sửa chi tiết
  const [detailForm, setDetailForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [viewMatchId, setViewMatchId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [pendingExport, setPendingExport] = useState(null);
  const [generatingGroup, setGeneratingGroup] = useState(null);
  const [generatingReturnGroup, setGeneratingReturnGroup] = useState(null);
  const [groupDivModal, setGroupDivModal] = useState(null); // { count } khi mở modal Phân chia bảng
  const [dividingGroups, setDividingGroups] = useState(false);
  const [statusAction, setStatusAction] = useState(null); // 'cancel' | 'disqualify' | null
  const [statusReason, setStatusReason] = useState('');
  const [disqualifiedSide, setDisqualifiedSide] = useState('A');
  const [statusSaving, setStatusSaving] = useState(false);

  const isStars = selectedContent?.content_format === 'combat_stars';
  const isDrone = selectedContent?.content_format === 'combat_drone';
  const isCombat = isStars || isDrone;

  const reloadMatches = async () => {
    const m = await api.getCombatMatches(selectedContentId);
    setCData((prev) => prev ? { ...prev, matches: m } : prev);
    clearApiCache('getCombatMatches');
  };

  const reloadTeams = async () => {
    const t = await api.getTeams(selectedContentId);
    setCData((prev) => prev ? { ...prev, teams: t } : prev);
    clearApiCache('getTeams');
  };

  const openAdd = () => {
    setModal('add');
    setForm({ team_a_id: '', team_b_id: '', team_a_no: '', team_b_no: '', stage: '', group_label: '', match_no: '', board_id: '', field_id: '' });
    setErrors({});
  };

  const openEditMatch = (m) => {
    setModal({ id: m.id });
    setForm({
      team_a_id: m.team_a_id || '', team_b_id: m.team_b_id || '',
      team_a_no: m.team_a_no || '', team_b_no: m.team_b_no || '',
      stage: m.stage || '', group_label: m.group_label || '', match_no: m.match_no || '',
      board_id: m.board_id || '', field_id: m.field_id || '',
    });
    setErrors({});
  };

  // board_id BẮT BUỘC — trọng tài chỉ thấy trận thuộc bảng đã được phân quyền
  // (referee_boards); thiếu board_id nghĩa là NULL, và NULL không bao giờ
  // khớp trong mảng board đã phân quyền → trận biến mất khỏi màn hình trọng
  // tài dù admin đã tạo (lỗi đã xảy ra thật, giờ chặn ngay từ form).
  const validate = () => {
    const errs = {};
    if (!form.team_a_id) errs.team_a_id = isDrone ? 'Chọn đội 1.' : 'Chọn đội Đỏ.';
    if (!form.team_b_id) errs.team_b_id = isDrone ? 'Chọn đội 2.' : 'Chọn đội Xanh.';
    if (form.team_a_id && form.team_a_id === form.team_b_id) errs.team_b_id = isDrone ? 'Đội 2 phải khác đội 1.' : 'Đội Xanh phải khác đội Đỏ.';
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
        board_id: form.board_id || null, field_id: form.field_id || null,
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

  // Sửa nhanh STT (match_no) ngay tại danh sách trận — không cần mở modal
  // "Sửa trận" đầy đủ chỉ để đổi số thứ tự sau khi sinh lịch tự động.
  const updateMatchNo = async (m, value) => {
    const next = value.trim() || null;
    if (next === (m.match_no || null)) return;
    try {
      await api.putCombatMatch(m.id, { match_no: next });
      await reloadMatches();
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

  const removeAllMatches = async () => {
    if (!matches.length) return;
    const ok = await showConfirm({
      message: `Xóa TẤT CẢ ${matches.length} trận đấu của nội dung này? Toàn bộ điểm số và phiếu đã nhập sẽ mất — không thể hoàn tác.`,
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
      for (const m of matches) {
        await api.deleteCombatMatch(selectedContentId, m.id);
      }
      setDeleteAllConfirm(null);
      await reloadMatches();
      showAlert('Đã xóa tất cả trận đấu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setDeletingAll(false);
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
    setStatusAction(null);
    setStatusReason('');
    if (isStars) {
      setDetailForm({
        meteorCompletedA: !!d.meteorCompletedA, meteorCompletedB: !!d.meteorCompletedB,
        energyBlocksA: d.energyBlocksA ?? 0, energyBlocksB: d.energyBlocksB ?? 0,
        firepowerBallsA: d.firepowerBallsA ?? 0, firepowerBallsB: d.firepowerBallsB ?? 0,
        directWinA: !!d.directWinA, directWinB: !!d.directWinB,
        retryCountA: d.retryCountA ?? 0, retryCountB: d.retryCountB ?? 0,
        pointsLostA: d.pointsLostA ?? 0, pointsLostB: d.pointsLostB ?? 0,
        durationA: d.durationA ?? '', durationB: d.durationB ?? '',
        division: d.division || '',
        ...confirmFieldsFrom(d),
      });
    } else {
      setDetailForm({
        division: d.division || '',
        firstHalfA: d.firstHalfA ?? 0, firstHalfB: d.firstHalfB ?? 0,
        secondHalfA: d.secondHalfA ?? 0, secondHalfB: d.secondHalfB ?? 0,
        half1RedTeam: d.half1RedTeam === 'B' ? 'B' : 'A', half2RedTeam: d.half2RedTeam === 'B' ? 'B' : 'A',
        refereeAwardedA: d.refereeAwardedA ?? 0, refereeAwardedB: d.refereeAwardedB ?? 0,
        refereeAwardedReasonA: d.refereeAwardedReasonA || '', refereeAwardedReasonB: d.refereeAwardedReasonB || '',
        shootoutRounds: Array.isArray(d.shootoutRounds) ? d.shootoutRounds : [],
        ...confirmFieldsFrom(d),
      });
    }
  };

  const setDetailDirectWin = (side, checked) => {
    setDetailForm((f) => ({
      ...f,
      directWinA: side === 'A' ? checked : (checked ? false : f.directWinA),
      directWinB: side === 'B' ? checked : (checked ? false : f.directWinB),
    }));
  };

  const saveDetail = async () => {
    if (!detailModal) return;
    if (isStars && detailForm.directWinA && detailForm.directWinB) {
      showAlert('Không thể cả hai đội cùng Direct Win.', 'error');
      return;
    }
    try {
      const confirmFields = {
        teamMembersA: detailForm.teamMembersA || null, teamMembersB: detailForm.teamMembersB || null,
        studentSignatureImageA: detailForm.studentSigImageA || null, studentSignatureImageB: detailForm.studentSigImageB || null,
        refereeSignature: detailForm.refereeSignature || null,
        refereeSignatureImage: detailForm.refereeSigImage || null,
        headRefereeName: detailForm.headRefereeName || null,
        scorekeeperName: detailForm.scorekeeperName || null,
        remarks: detailForm.remarks || null, objection: detailForm.objection || null,
      };
      let details, winner_id, is_draw;
      if (isStars) {
        details = {
          division: detailForm.division || null,
          meteorCompletedA: !!detailForm.meteorCompletedA, meteorCompletedB: !!detailForm.meteorCompletedB,
          energyBlocksA: clampEnergy(detailForm.energyBlocksA), energyBlocksB: clampEnergy(detailForm.energyBlocksB),
          firepowerBallsA: clampFirepower(detailForm.firepowerBallsA), firepowerBallsB: clampFirepower(detailForm.firepowerBallsB),
          directWinA: !!detailForm.directWinA, directWinB: !!detailForm.directWinB,
          retryCountA: Math.max(0, Number(detailForm.retryCountA) || 0), retryCountB: Math.max(0, Number(detailForm.retryCountB) || 0),
          pointsLostA: Math.max(0, Number(detailForm.pointsLostA) || 0), pointsLostB: Math.max(0, Number(detailForm.pointsLostB) || 0),
          durationA: detailForm.durationA || null, durationB: detailForm.durationB || null,
          ...confirmFields,
        };
        const sideA = { meteorCompleted: details.meteorCompletedA, energyBlocks: details.energyBlocksA, firepowerBalls: details.firepowerBallsA, retryCount: details.retryCountA, pointsLost: details.pointsLostA, directWin: details.directWinA };
        const sideB = { meteorCompleted: details.meteorCompletedB, energyBlocks: details.energyBlocksB, firepowerBalls: details.firepowerBallsB, retryCount: details.retryCountB, pointsLost: details.pointsLostB, directWin: details.directWinB };
        const isGroupStage = !!detailModal.group_label;
        const { result } = isGroupStage ? determineGroupMatchResult(sideA, sideB) : determineFinalsMatchResult(sideA, sideB);
        winner_id = result === 'A' ? detailModal.team_a_id : result === 'B' ? detailModal.team_b_id : null;
        is_draw = result === 'DRAW';
      } else {
        // Fly Smart Cup — điểm & kết quả tính tự động từ Total Score (mục 3-9
        // luật), KHÔNG dùng logic Battle of Stars. Vòng sơ loại (group_label
        // có giá trị) luôn phân định W/D/L; Knockout (group_label rỗng) bằng
        // điểm phải chờ Penalty Shootout mới có kết quả.
        details = {
          division: detailForm.division || null,
          firstHalfA: Math.max(0, Number(detailForm.firstHalfA) || 0), firstHalfB: Math.max(0, Number(detailForm.firstHalfB) || 0),
          secondHalfA: Math.max(0, Number(detailForm.secondHalfA) || 0), secondHalfB: Math.max(0, Number(detailForm.secondHalfB) || 0),
          half1RedTeam: detailForm.half1RedTeam === 'B' ? 'B' : 'A', half2RedTeam: detailForm.half2RedTeam === 'B' ? 'B' : 'A',
          refereeAwardedA: Math.max(0, Number(detailForm.refereeAwardedA) || 0), refereeAwardedB: Math.max(0, Number(detailForm.refereeAwardedB) || 0),
          refereeAwardedReasonA: detailForm.refereeAwardedReasonA || null, refereeAwardedReasonB: detailForm.refereeAwardedReasonB || null,
          shootoutRounds: (detailForm.shootoutRounds || []).map((r) => ({
            roundNo: r.roundNo,
            aSuccess: !!r.aSuccess, aTimeSeconds: r.aSuccess ? (Number(r.aTimeSeconds) || null) : null,
            bSuccess: !!r.bSuccess, bTimeSeconds: r.bSuccess ? (Number(r.bTimeSeconds) || null) : null,
          })),
          ...confirmFields,
        };
        const droneSideA = { half1: details.firstHalfA, half2: details.secondHalfA, refereeAwarded: details.refereeAwardedA };
        const droneSideB = { half1: details.firstHalfB, half2: details.secondHalfB, refereeAwarded: details.refereeAwardedB };
        const isKnockout = !detailModal.group_label;
        const outcome = isKnockout
          ? determineKnockoutResult(droneSideA, droneSideB, details.shootoutRounds)
          : determineDroneGroupResult(droneSideA, droneSideB);
        winner_id = outcome.result === 'A' ? detailModal.team_a_id : outcome.result === 'B' ? detailModal.team_b_id : null;
        is_draw = !isKnockout && outcome.result === 'DRAW';
      }
      await api.putCombatMatch(detailModal.id, { details, winner_id, is_draw });
      setDetailModal(null);
      await reloadMatches();
      showAlert('Đã lưu chi tiết trận.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  // ── Match Status (Fly Smart Cup) — Hủy trận / Truất quyền một đội (mục 13) ──
  const submitStatusAction = async () => {
    if (!detailModal) return;
    if (!statusReason.trim()) { showAlert('Cần nhập lý do.', 'error'); return; }
    setStatusSaving(true);
    try {
      const status = statusAction === 'cancel' ? 'cancelled' : 'disqualified';
      const details = {
        ...(detailModal.details || {}),
        division: detailForm.division || null,
        disqualifiedTeam: statusAction === 'disqualify' ? disqualifiedSide : null,
        disqualificationReason: statusReason,
      };
      await api.putCombatMatch(detailModal.id, { status, details });
      showAlert(`Đã đặt trạng thái trận: ${status}.`, 'success');
      setStatusAction(null);
      setDetailModal(null);
      await reloadMatches();
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setStatusSaving(false);
    }
  };

  const startDroneShootout = () => setDetailForm((f) => ({ ...f, shootoutRounds: [1, 2, 3].map(newShootoutRound) }));
  const addDroneShootoutRound = () => setDetailForm((f) => ({ ...f, shootoutRounds: [...f.shootoutRounds, newShootoutRound(f.shootoutRounds.length + 1)] }));
  const updateDroneShootoutRound = (idx, patch) => setDetailForm((f) => {
    const rounds = [...f.shootoutRounds];
    rounds[idx] = { ...rounds[idx], ...patch };
    return { ...f, shootoutRounds: rounds };
  });

  // ── Teams & Groups (Battle of Stars + Fly Smart Cup) — gán Group/Bảng đấu cho từng đội ──
  // Nhãn Group luôn theo mẫu "Group N" (số) — cho phép chọn tay từng đội vào
  // đúng Group qua dropdown, hoặc tạo Group mới ngay tại đó.
  const GROUP_LABEL_RE = /^Group\s+(\d+)$/i;
  const groupNumbers = useMemo(() => {
    const nums = teams
      .map((t) => { const m = t.combat_group && t.combat_group.match(GROUP_LABEL_RE); return m ? Number(m[1]) : null; })
      .filter((n) => n != null);
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  }, [teams]);
  const nextGroupNumber = groupNumbers.length ? groupNumbers[groupNumbers.length - 1] + 1 : 1;

  const updateTeamGroup = async (teamId, combat_group) => {
    try {
      await api.putTeam(teamId, { combat_group: combat_group || null });
      await reloadTeams();
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  const assignTeamGroup = (teamId, value) => {
    if (value === '__new__') updateTeamGroup(teamId, `Group ${nextGroupNumber}`);
    else updateTeamGroup(teamId, value || null);
  };

  // Chia TẤT CẢ đội của nội dung đang chọn thành N bảng đều nhau (lệch tối đa 1
  // đội/bảng — vd 15 đội chia 2 bảng thì 8 + 7), bốc thăm ngẫu nhiên, ghi đè
  // Group hiện tại của mọi đội. Dùng chung cho cả Battle of Stars lẫn Fly Smart Cup.
  const divideIntoGroups = async (count) => {
    const n = Math.max(1, Math.min(26, Math.floor(Number(count)) || 0));
    if (!n) { showAlert('Nhập số bảng hợp lệ.', 'error'); return; }
    if (teams.length < n) { showAlert(`Chỉ có ${teams.length} đội, không đủ chia thành ${n} bảng.`, 'error'); return; }
    const ok = await showConfirm({
      message: `Chia ${teams.length} đội thành ${n} bảng (bốc thăm ngẫu nhiên)? Thao tác này sẽ GHI ĐÈ Group hiện tại của tất cả các đội trong nội dung này.`,
      confirmText: 'Chia bảng', cancelText: 'Hủy', danger: true,
    });
    if (!ok) return;
    const shuffled = [...teams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const base = Math.floor(shuffled.length / n);
    const remainder = shuffled.length % n;
    setDividingGroups(true);
    try {
      let cursor = 0;
      for (let g = 0; g < n; g++) {
        const size = base + (g < remainder ? 1 : 0);
        const label = `Group ${g + 1}`;
        for (let i = 0; i < size; i++) {
          const team = shuffled[cursor++];
          await api.putTeam(team.id, { combat_group: label });
        }
      }
      await reloadTeams();
      showAlert(`Đã chia thành ${n} bảng.`, 'success');
      setGroupDivModal(null);
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setDividingGroups(false);
    }
  };

  // Nhóm đội theo combat_group — dùng chung cho cả 2 format (chỉ để hiển thị +
  // sinh lịch, KHÔNG tính điểm/xếp hạng ở đây).
  const teamGroups = useMemo(() => {
    if (!isCombat) return [];
    const byGroup = new Map();
    for (const t of teams) {
      if (!t.combat_group) continue;
      if (!byGroup.has(t.combat_group)) byGroup.set(t.combat_group, []);
      byGroup.get(t.combat_group).push(t);
    }
    return Array.from(byGroup.entries())
      .map(([label, groupTeams]) => ({ label, teams: groupTeams }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [isCombat, teams]);

  // ── Bảng xếp hạng vòng bảng — Battle of Stars: logic riêng theo đúng luật
  // (xem client/src/lib/battleScoring.js). Fly Smart Cup: xem "droneGroups" bên dưới.
  const starsGroups = useMemo(() => {
    if (!isStars) return [];
    return teamGroups.map((g) => {
      const groupMatches = matches.filter((m) => m.group_label === g.label);
      return { label: g.label, teams: g.teams, standings: computeGroupStandings(g.teams, groupMatches) };
    });
  }, [isStars, teamGroups, matches]);

  // Lịch vòng tròn — dùng chung cho cả Battle of Stars lẫn Fly Smart Cup, thuật
  // toán round-robin không phụ thuộc format (client/src/lib/battleScoring.js).
  // Chỉ khớp trận "lượt đi" (details.leg mặc định 1 nếu thiếu) — trận "lượt về"
  // (details.leg === 2, xem returnLegByGroup) không được tính là đã đủ lượt đi.
  const scheduleByGroup = useMemo(() => {
    if (!isCombat) return [];
    return teamGroups.map((g) => {
      const teamIds = g.teams.map((t) => t.id);
      const rounds = generateRoundRobin(teamIds).map((pairs, idx) => ({
        roundNo: idx + 1,
        pairs: pairs.map(([aId, bId]) => {
          const existing = matches.find((m) => m.group_label === g.label && (m.details?.leg ?? 1) === 1 &&
            ((m.team_a_id === aId && m.team_b_id === bId) || (m.team_a_id === bId && m.team_b_id === aId)));
          const teamA = g.teams.find((t) => t.id === aId);
          const teamB = g.teams.find((t) => t.id === bId);
          return { teamAId: aId, teamBId: bId, teamAName: teamA?.name || '', teamBName: teamB?.name || '', match: existing || null };
        }),
      }));
      const missingPairs = rounds.flatMap((r) => r.pairs.filter((p) => !p.match));
      return { label: g.label, teamIds, rounds, missingPairs };
    });
  }, [isCombat, teamGroups, matches]);

  // "Lượt về" (Battle of Stars only) — thêm 1 vòng tròn nữa cho 1 group khi
  // group đó ít đội (thêm trận để có thêm dữ liệu tính bảng xếp hạng), team_a/
  // team_b ĐẢO NGƯỢC so với lượt đi (quy ước sân nhà/sân khách đảo vị trí).
  // Chỉ cho sinh lượt về khi group đã đủ lượt đi (leg 1) — tránh tạo lượt về
  // trước khi có đủ dữ liệu lượt đi để đối chiếu.
  const returnLegByGroup = useMemo(() => {
    if (!isStars) return [];
    return scheduleByGroup
      .filter((g) => g.teamIds.length >= 2 && g.missingPairs.length === 0)
      .map((g) => {
        const rounds = g.rounds.map((r) => ({
          roundNo: r.roundNo,
          pairs: r.pairs.filter((p) => {
            const exists = matches.some((m) => m.group_label === g.label && (m.details?.leg ?? 1) === 2 &&
              ((m.team_a_id === p.teamAId && m.team_b_id === p.teamBId) || (m.team_a_id === p.teamBId && m.team_b_id === p.teamAId)));
            return !exists;
          }),
        }));
        const missingReturnPairs = rounds.flatMap((r) => r.pairs);
        return { label: g.label, teamIds: g.teamIds, rounds, missingReturnPairs };
      });
  }, [isStars, scheduleByGroup, matches]);

  // Sinh trận còn thiếu của 1 bảng, rải đều field: ưu tiên chọn field nằm
  // trong tập field mà 1 trong 2 đội (team_a/team_b) đã được gán riêng (đội
  // có thể gán nhiều field — xem team_fields/AdminTeams.jsx), cân bằng theo
  // số trận CHÍNH 2 đội đó đã chơi ở từng field ứng viên; đội chưa gán field
  // nào thì fallback dùng field ít được dùng nhất toàn nội dung (hành vi cũ).
  const generateSchedule = async (group) => {
    if (!group.missingPairs.length) return;
    const teamsById = new Map(group.teamIds.map((id) => [id, teams.find((t) => t.id === id)]));
    const missingBoard = group.missingPairs
      .flatMap((p) => [teamsById.get(p.teamAId), teamsById.get(p.teamBId)])
      .find((t) => !t?.board_id);
    if (missingBoard) {
      showAlert(`Đội "${missingBoard.name}" chưa có Division (Bảng đấu theo tuổi) — vào module Teams để gán trước khi sinh lịch.`, 'error');
      return;
    }
    const fieldUsage = new Map();
    const teamFieldUsage = new Map(); // key `${teamId}:${fieldId}` -> số trận đội đó đã chơi ở field đó
    const bumpTeamField = (teamId, fieldId) => {
      if (!teamId) return;
      const key = `${teamId}:${fieldId}`;
      teamFieldUsage.set(key, (teamFieldUsage.get(key) || 0) + 1);
    };
    for (const m of matches) {
      if (!m.field_id) continue;
      fieldUsage.set(m.field_id, (fieldUsage.get(m.field_id) || 0) + 1);
      bumpTeamField(m.team_a_id, m.field_id);
      bumpTeamField(m.team_b_id, m.field_id);
    }
    const pickField = (teamA, teamB) => {
      if (!allFields.length) return null;
      const candidateIds = new Set([...(teamA?.fields || []), ...(teamB?.fields || [])].map((f) => f.id));
      const candidates = candidateIds.size ? allFields.filter((f) => candidateIds.has(f.id)) : allFields;
      let best = candidates[0], bestScore = Infinity;
      for (const f of candidates) {
        const teamScore = (teamFieldUsage.get(`${teamA?.id}:${f.id}`) || 0) + (teamFieldUsage.get(`${teamB?.id}:${f.id}`) || 0);
        const score = teamScore * 1000 + (fieldUsage.get(f.id) || 0);
        if (score < bestScore) { bestScore = score; best = f; }
      }
      fieldUsage.set(best.id, (fieldUsage.get(best.id) || 0) + 1);
      bumpTeamField(teamA?.id, best.id);
      bumpTeamField(teamB?.id, best.id);
      return best;
    };
    // Xếp thứ tự theo round (né 1 đội đá 2 trận liên tiếp về match_no) rồi
    // đánh số tiếp nối từ trận lớn nhất đã có trong group.
    const orderedPairs = orderPairsAcrossRounds(
      group.rounds.map((r) => ({ ...r, pairs: r.pairs.filter((p) => !p.match) }))
    );
    let nextNo = nextMatchNoForGroup(matches, group.label);
    setGeneratingGroup(group.label);
    try {
      for (const p of orderedPairs) {
        const teamA = teamsById.get(p.teamAId);
        const teamB = teamsById.get(p.teamBId);
        const field = pickField(teamA, teamB);
        await api.postCombatMatch(selectedContentId, {
          team_a_id: p.teamAId, team_b_id: p.teamBId,
          group_label: group.label, board_id: teamA.board_id, field_id: field?.id || null,
          match_no: String(nextNo++),
          details: { leg: 1 },
        });
      }
      await reloadMatches();
      showAlert('Đã sinh lịch vòng tròn.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setGeneratingGroup(null);
    }
  };

  // Sinh "lượt về" cho 1 group (Battle of Stars) — mỗi cặp còn thiếu ở leg 2,
  // team_a/team_b ĐẢO NGƯỢC so với lượt đi (đúng quy ước sân nhà/sân khách),
  // đánh dấu details.leg = 2. computeGroupStandings không lọc theo leg nên
  // điểm lượt đi + lượt về tự cộng dồn vào đúng bảng xếp hạng của group.
  const generateReturnLeg = async (returnGroup) => {
    if (!returnGroup.missingReturnPairs.length) return;
    const teamsById = new Map(returnGroup.teamIds.map((id) => [id, teams.find((t) => t.id === id)]));
    const fieldUsage = new Map();
    const teamFieldUsage = new Map();
    const bumpTeamField = (teamId, fieldId) => {
      if (!teamId) return;
      const key = `${teamId}:${fieldId}`;
      teamFieldUsage.set(key, (teamFieldUsage.get(key) || 0) + 1);
    };
    for (const m of matches) {
      if (!m.field_id) continue;
      fieldUsage.set(m.field_id, (fieldUsage.get(m.field_id) || 0) + 1);
      bumpTeamField(m.team_a_id, m.field_id);
      bumpTeamField(m.team_b_id, m.field_id);
    }
    const pickField = (teamA, teamB) => {
      if (!allFields.length) return null;
      const candidateIds = new Set([...(teamA?.fields || []), ...(teamB?.fields || [])].map((f) => f.id));
      const candidates = candidateIds.size ? allFields.filter((f) => candidateIds.has(f.id)) : allFields;
      let best = candidates[0], bestScore = Infinity;
      for (const f of candidates) {
        const teamScore = (teamFieldUsage.get(`${teamA?.id}:${f.id}`) || 0) + (teamFieldUsage.get(`${teamB?.id}:${f.id}`) || 0);
        const score = teamScore * 1000 + (fieldUsage.get(f.id) || 0);
        if (score < bestScore) { bestScore = score; best = f; }
      }
      fieldUsage.set(best.id, (fieldUsage.get(best.id) || 0) + 1);
      bumpTeamField(teamA?.id, best.id);
      bumpTeamField(teamB?.id, best.id);
      return best;
    };
    const orderedPairs = orderPairsAcrossRounds(returnGroup.rounds);
    let nextNo = nextMatchNoForGroup(matches, returnGroup.label);
    setGeneratingReturnGroup(returnGroup.label);
    try {
      // Các trận lượt đi tạo trước khi có tính năng này chưa có details.leg
      // tường minh (chỉ ngầm hiểu leg mặc định = 1) — gắn nhãn rõ ràng ngay
      // khi bắt đầu sinh lượt về, để danh sách trận hiện đúng "Lượt đi" thay
      // vì im lặng suy luận.
      const unlabeledLeg1 = matches.filter((m) =>
        m.group_label === returnGroup.label && !m.details?.leg
      );
      for (const m of unlabeledLeg1) {
        await api.putCombatMatch(m.id, { details: { ...(m.details || {}), leg: 1 } });
      }
      for (const p of orderedPairs) {
        const homeTeam = teamsById.get(p.teamBId); // đảo ngược: đội B lượt đi thành đội A lượt về
        const awayTeam = teamsById.get(p.teamAId);
        const field = pickField(homeTeam, awayTeam);
        await api.postCombatMatch(selectedContentId, {
          team_a_id: p.teamBId, team_b_id: p.teamAId,
          group_label: returnGroup.label, board_id: homeTeam.board_id, field_id: field?.id || null,
          match_no: String(nextNo++),
          details: { leg: 2 },
        });
      }
      await reloadMatches();
      showAlert('Đã sinh lượt về.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    } finally {
      setGeneratingReturnGroup(null);
    }
  };

  // ── Finals (knockout) — chỉ Battle of Stars, trận có group_label rỗng ──
  const finalsRounds = useMemo(() => {
    if (!isStars) return [];
    const byStage = new Map();
    for (const m of matches) {
      if (m.group_label) continue;
      const key = m.stage || 'Chưa đặt tên vòng';
      if (!byStage.has(key)) byStage.set(key, []);
      byStage.get(key).push(m);
    }
    return Array.from(byStage.entries()).map(([stage, ms]) => ({ stage, matches: ms }));
  }, [isStars, matches]);

  // ── Bảng xếp hạng vòng bảng Fly Smart Cup (combat_drone) — luật riêng, xem
  // client/src/lib/flySmartCupScoring.js (mục 6-8 luật: Match Points 3/1/0 →
  // Total Score → Head-to-Head → Tie-break Required, KHÔNG dùng logic Battle
  // of Stars/Highest Points cũ).
  const droneGroups = useMemo(() => {
    if (isStars) return [];
    return teamGroups.map((g) => {
      const groupMatches = matches.filter((m) => m.group_label === g.label);
      return { label: g.label, teams: g.teams, standings: computeDroneGroupStandings(g.teams, groupMatches) };
    });
  }, [isStars, teamGroups, matches]);

  // ── Finals (Knockout) — Fly Smart Cup, trận có group_label rỗng (mục 9) ──
  const droneFinalsRounds = useMemo(() => {
    if (isStars) return [];
    const byStage = new Map();
    for (const m of matches) {
      if (m.group_label) continue;
      const key = m.stage || 'Chưa đặt tên vòng';
      if (!byStage.has(key)) byStage.set(key, []);
      byStage.get(key).push(m);
    }
    return Array.from(byStage.entries()).map(([stage, ms]) => ({ stage, matches: ms }));
  }, [isStars, matches]);

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
    isStars
      ? <CombatStarsSheetTable match={m} sheetRef={ref} />
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

          {/* ── A0. Ảnh minh hoạ nhiệm vụ (chỉ Battle of Stars) — lấy từ "Nhiệm
               vụ" đã tạo sẵn cho content này, khớp theo tên. Muốn thêm/đổi ảnh
               thì vào trang "Nhiệm vụ", không quản lý riêng ở đây. ── */}
          {isStars && missionTasks.some((t) => MISSION_NAMES.some((n) => n.toLowerCase() === (t.name || '').trim().toLowerCase()) && t.has_image) && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h3 className="card-title">Ảnh minh họa nhiệm vụ</h3>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                Lấy từ "Nhiệm vụ" cùng tên trong content này — muốn đổi ảnh thì vào trang "Nhiệm vụ" để sửa.
              </p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {MISSION_NAMES.map((name) => {
                  const task = missionTasks.find((t) => (t.name || '').trim().toLowerCase() === name.toLowerCase());
                  const url = taskImageUrl(task);
                  if (!url) return null;
                  return (
                    <div key={name} style={{ textAlign: 'center' }}>
                      <img src={url} alt={name} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── A+B. Teams & Groups (Battle of Stars + Fly Smart Cup) ── */}
          {isCombat && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h3 className="card-title">Đội thi &amp; Bảng đấu (Group)</h3>
                <button type="button" className="btn btn-secondary" onClick={() => setGroupDivModal({ count: 2 })} disabled={teams.length < 2}>
                  Phân chia bảng tự động
                </button>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                Gán mỗi đội vào 1 Group — các đội cùng Group sẽ thi đấu vòng tròn với nhau (có thể gồm nhiều Division/Bảng tuổi khác nhau nếu cần ghép cho đủ số đội). Chọn tay Group cho từng đội bên dưới, hoặc bấm "Phân chia bảng tự động" để hệ thống tự chia đều + bốc thăm ngẫu nhiên. Đội thi được tạo/sửa ở module Teams; ở đây chỉ gán Group.
              </p>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      <th>Division</th>
                      <th>Group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có đội — thêm đội ở module Teams.</td></tr>
                    ) : teams.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>{t.name}</td>
                        <td>{t.boards?.name || '-'}</td>
                        <td>
                          <select
                            className="form-input form-select"
                            style={{ maxWidth: 180 }}
                            value={t.combat_group && GROUP_LABEL_RE.test(t.combat_group) ? t.combat_group : (t.combat_group ? '__other__' : '')}
                            onChange={(e) => assignTeamGroup(t.id, e.target.value)}
                          >
                            <option value="">-- Chưa gán --</option>
                            {groupNumbers.map((n) => <option key={n} value={`Group ${n}`}>{`Group ${n}`}</option>)}
                            <option value="__new__">+ Tạo Group {nextGroupNumber}</option>
                            {t.combat_group && !GROUP_LABEL_RE.test(t.combat_group) && (
                              <option value="__other__" disabled>{t.combat_group} (tên cũ)</option>
                            )}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── C. Match Schedule (Battle of Stars + Fly Smart Cup) ── */}
          {isCombat && scheduleByGroup.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h3 className="card-title">Lịch thi đấu vòng tròn</h3>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                Trận được rải đều theo từng sân (Field) khi sinh lịch.
              </p>
              {scheduleByGroup.map((g) => (
                <div key={g.label} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <h4 style={{ margin: 0, color: '#0f172a' }}>{g.label} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 13 }}>({g.teamIds.length} đội)</span></h4>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button" className="btn btn-secondary"
                        disabled={!g.missingPairs.length || generatingGroup === g.label}
                        onClick={() => generateSchedule(g)}
                      >
                        {generatingGroup === g.label ? 'Đang sinh...' : g.missingPairs.length ? `Sinh lịch vòng tròn (còn thiếu ${g.missingPairs.length} trận)` : 'Đã đủ lịch vòng tròn'}
                      </button>
                      {isStars && (() => {
                        const rg = returnLegByGroup.find((x) => x.label === g.label);
                        if (!rg) return (
                          <button type="button" className="btn btn-secondary" disabled title="Cần sinh đủ lượt đi trước">
                            Sinh lượt về
                          </button>
                        );
                        return (
                          <button
                            type="button" className="btn btn-secondary"
                            disabled={!rg.missingReturnPairs.length || generatingReturnGroup === g.label}
                            onClick={() => generateReturnLeg(rg)}
                          >
                            {generatingReturnGroup === g.label ? 'Đang sinh...' : rg.missingReturnPairs.length ? `Sinh lượt về (còn thiếu ${rg.missingReturnPairs.length} trận)` : 'Đã đủ lượt về'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  {g.rounds.map((r) => (
                    <div key={r.roundNo} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Round {r.roundNo}</div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {r.pairs.map((p, i) => (
                          <li key={i} style={{ fontSize: 13, marginBottom: 4, color: '#1e293b' }}>
                            {p.teamAName} vs {p.teamBName}
                            {p.match ? (
                              <>
                                {p.match.field?.name && <span style={{ color: '#94a3b8' }}> [{p.match.field.name}]</span>}
                                {p.match.is_draw ? ' — Hòa' : p.match.winner_id ? ` — Thắng: ${p.match.winner_id === p.match.team_a_id ? p.teamAName : p.teamBName}` : ' — Chưa có kết quả'}
                                <button type="button" className="btn btn-secondary" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }} onClick={() => openDetail(p.match)}>Nhập điểm</button>
                              </>
                            ) : ' — (chưa tạo trận)'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="page-header" style={{ marginBottom: 12 }}>
            <div><h3 className="card-title">Danh sách trận ({matchesForList.length}{(matchListGroupFilter || matchListFieldFilter) ? `/${matches.length}` : ''})</h3></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-danger" onClick={removeAllMatches} disabled={matches.length === 0}>Xóa tất cả trận</button>
              <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trận</button>
            </div>
          </div>

          {(matchGroupOptions.length > 0 || matchFieldOptions.length > 0) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              {matchGroupOptions.length > 0 && (
                <div className="form-group" style={{ maxWidth: 260, marginBottom: 0 }}>
                  <label className="form-label">Lọc theo Bảng</label>
                  <select className="form-input form-select" value={matchListGroupFilter} onChange={(e) => setMatchListGroupFilter(e.target.value)}>
                    <option value="">Tất cả bảng</option>
                    {matchGroupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value={FINALS_FILTER}>Finals / loại trực tiếp (không có bảng)</option>
                  </select>
                </div>
              )}
              {matchFieldOptions.length > 0 && (
                <div className="form-group" style={{ maxWidth: 260, marginBottom: 0 }}>
                  <label className="form-label">Lọc theo Sân</label>
                  <select className="form-input form-select" value={matchListFieldFilter} onChange={(e) => setMatchListFieldFilter(e.target.value)}>
                    <option value="">Tất cả sân</option>
                    {matchFieldOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Vòng / Bảng</th>
                    <th>Sân</th>
                    <th>{isDrone ? 'Đội 1' : 'Đội Đỏ'}</th>
                    <th>{isDrone ? 'Đội 2' : 'Đội Xanh'}</th>
                    <th>Kết quả</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matchesForList.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có trận nào.</td></tr>
                  ) : matchesPage.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          style={{ width: 56, padding: '4px 6px', textAlign: 'center' }}
                          defaultValue={m.match_no || ''}
                          placeholder="-"
                          title="Sửa số thứ tự trận"
                          onBlur={(e) => updateMatchNo(m, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        />
                      </td>
                      <td>
                        {m.stage || '-'}
                        {m.group_label && (
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Bảng: {m.group_label}
                            {isStars && (
                              <span style={{ marginLeft: 6, fontWeight: 600, color: (m.details?.leg ?? 1) === 2 ? '#7c3aed' : '#0ea5e9' }}>
                                [{(m.details?.leg ?? 1) === 2 ? 'Lượt về' : 'Lượt đi'}]
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>{m.field?.name || '-'}</td>
                      <td>{m.team_a?.name || '-'}{m.team_a_no ? ` (No.${m.team_a_no})` : ''}</td>
                      <td>{m.team_b?.name || '-'}{m.team_b_no ? ` (No.${m.team_b_no})` : ''}</td>
                      <td style={{ fontSize: 13 }}>
                        {m.details?.status === 'cancelled' ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Đã hủy</span>
                          : m.details?.status === 'disqualified' ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Truất quyền</span>
                          : m.is_draw ? 'Hòa' : m.winner_id ? `Thắng: ${m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}` : 'Chưa có kết quả'}
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

          {/* ── E. Group Ranking (Fly Smart Cup) — mục 7-8 luật ── */}
          {isDrone && droneGroups.map((g) => (
            <div className="card" key={g.label} style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h3 className="card-title">Bảng xếp hạng — {g.label}</h3>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>Rank</th>
                      <th>Đội</th>
                      <th style={{ textAlign: 'center' }}>Played</th>
                      <th style={{ textAlign: 'center' }}>W</th>
                      <th style={{ textAlign: 'center' }}>D</th>
                      <th style={{ textAlign: 'center' }}>L</th>
                      <th style={{ textAlign: 'center' }}>Match Points</th>
                      <th style={{ textAlign: 'center' }}>Total Score</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.standings.map((row) => (
                      <tr key={row.teamId}>
                        <td style={{ textAlign: 'center' }}><strong>{row.rank}</strong></td>
                        <td style={{ fontWeight: 600 }}>
                          {row.teamName}
                          {row.headToHeadWinner && <span style={{ marginLeft: 6, fontSize: 11, color: '#16a34a', fontWeight: 700 }}>H2H</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{row.played}</td>
                        <td style={{ textAlign: 'center' }}>{row.wins}</td>
                        <td style={{ textAlign: 'center' }}>{row.draws}</td>
                        <td style={{ textAlign: 'center' }}>{row.losses}</td>
                        <td style={{ textAlign: 'center' }}><strong>{row.matchPoints}</strong></td>
                        <td style={{ textAlign: 'center' }}>{row.totalScore}</td>
                        <td style={{ textAlign: 'center' }}>
                          {row.tieBreakRequired
                            ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12 }}>TIE-BREAK REQUIRED</span>
                            : <span style={{ color: '#16a34a', fontSize: 12 }}>OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {g.standings.some((s) => s.tieBreakRequired) && (
                <p style={{ fontSize: 12, color: '#dc2626', margin: '10px 0 0' }}>
                  Các đội đánh dấu "TIE-BREAK REQUIRED" đang bằng nhau cả Match Points, Total Score (và Head-to-Head nếu chỉ 2 đội) — tạo thêm 1 trận giữa các đội này bằng nút "Thêm trận" (cùng chọn Group "{g.label}"), xếp hạng sẽ tự cập nhật sau khi nhập kết quả.
                </p>
              )}
            </div>
          ))}

          {isStars && starsGroups.map((g) => (
            <div className="card" key={g.label} style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h3 className="card-title">Bảng xếp hạng — {g.label}</h3>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>Rank</th>
                      <th>Team</th>
                      <th style={{ textAlign: 'center' }}>Played</th>
                      <th style={{ textAlign: 'center' }}>W</th>
                      <th style={{ textAlign: 'center' }}>D</th>
                      <th style={{ textAlign: 'center' }}>L</th>
                      <th style={{ textAlign: 'center' }}>Match Points</th>
                      <th style={{ textAlign: 'center' }}>Total Score</th>
                      <th style={{ textAlign: 'center' }}>Meteor Completed</th>
                      <th style={{ textAlign: 'center' }}>Direct Wins</th>
                      <th style={{ textAlign: 'center' }}>Retries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.standings.map((row) => (
                      <tr key={row.teamId}>
                        <td style={{ textAlign: 'center' }}><strong>{row.rank}</strong></td>
                        <td style={{ fontWeight: 600 }}>
                          {row.teamName}
                          {row.tieBreak && <span style={{ marginLeft: 6, fontSize: 11, color: '#dc2626', fontWeight: 700 }}>TIE-BREAK</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{row.played}</td>
                        <td style={{ textAlign: 'center' }}>{row.wins}</td>
                        <td style={{ textAlign: 'center' }}>{row.draws}</td>
                        <td style={{ textAlign: 'center' }}>{row.losses}</td>
                        <td style={{ textAlign: 'center' }}><strong>{row.matchPoints}</strong></td>
                        <td style={{ textAlign: 'center' }}>{row.totalScore}</td>
                        <td style={{ textAlign: 'center' }}>{row.meteorCompleted}</td>
                        <td style={{ textAlign: 'center' }}>{row.directWins}</td>
                        <td style={{ textAlign: 'center' }}>{row.retries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* ── F. Finals (Knockout) — chỉ Battle of Stars ── */}
          {isStars && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="page-header" style={{ marginBottom: 12 }}>
                <div><h3 className="card-title">Finals (Knockout)</h3></div>
                <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trận Finals</button>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                Tạo trận Finals bằng nút trên (để trống "Bảng vòng tròn", đặt tên vòng đấu ở "Vòng đấu" — vd Quarterfinal/Semifinal/Final). Đội đi tiếp được tính tự động theo luật riêng của Finals (khác vòng bảng).
              </p>
              {finalsRounds.length === 0 ? (
                <p style={{ color: '#888', padding: '8px 0' }}>Chưa có trận Finals nào.</p>
              ) : finalsRounds.map((r) => (
                <div key={r.stage} style={{ marginBottom: 16 }}>
                  <h4 style={{ marginBottom: 8, color: '#0f172a' }}>{r.stage}</h4>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr><th>Đội Đỏ</th><th>Đội Xanh</th><th>Kết quả</th><th></th></tr>
                      </thead>
                      <tbody>
                        {r.matches.map((m) => {
                          const scored = m.details && Object.prototype.hasOwnProperty.call(m.details, 'meteorCompletedA');
                          return (
                            <tr key={m.id}>
                              <td>{m.team_a?.name || '-'}</td>
                              <td>{m.team_b?.name || '-'}</td>
                              <td style={{ fontSize: 13 }}>
                                {m.winner_id
                                  ? <strong style={{ color: '#16a34a' }}>Đi tiếp: {m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}</strong>
                                  : scored ? <span style={{ color: '#dc2626', fontWeight: 600 }}>TIE-BREAK — cần phân định thêm</span> : 'Chưa có kết quả'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button type="button" className="btn btn-secondary" onClick={() => openEditMatch(m)}>Sửa trận</button>
                                  <button type="button" className="btn btn-secondary" onClick={() => openDetail(m)}>Nhập điểm</button>
                                  <button type="button" className="btn btn-danger" onClick={() => removeMatch(m)}>Xóa</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── F. Finals (Knockout) — Fly Smart Cup, mục 9-10 luật ── */}
          {isDrone && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="page-header" style={{ marginBottom: 12 }}>
                <div><h3 className="card-title">Finals (Knockout)</h3></div>
                <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trận Finals</button>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                Tạo trận Finals bằng nút trên (để trống "Bảng vòng tròn", đặt tên vòng đấu ở "Vòng đấu" — vd Quarterfinal/Semifinal/Final). Không dùng Match Points 3/1/0 ở Knockout — bằng Total Score sẽ chuyển Penalty Shootout (mục 9-10 luật), không có kết quả Hòa.
              </p>
              {droneFinalsRounds.length === 0 ? (
                <p style={{ color: '#888', padding: '8px 0' }}>Chưa có trận Finals nào.</p>
              ) : droneFinalsRounds.map((r) => (
                <div key={r.stage} style={{ marginBottom: 16 }}>
                  <h4 style={{ marginBottom: 8, color: '#0f172a' }}>{r.stage}</h4>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr><th>Đội 1</th><th>Đội 2</th><th>Kết quả</th><th></th></tr>
                      </thead>
                      <tbody>
                        {r.matches.map((m) => {
                          const d = m.details || {};
                          const scored = Object.prototype.hasOwnProperty.call(d, 'firstHalfA');
                          const totalA = computeSideScore({ half1: d.firstHalfA, half2: d.secondHalfA, refereeAwarded: d.refereeAwardedA }).total;
                          const totalB = computeSideScore({ half1: d.firstHalfB, half2: d.secondHalfB, refereeAwarded: d.refereeAwardedB }).total;
                          const tied = scored && totalA === totalB;
                          return (
                            <tr key={m.id}>
                              <td>{m.team_a?.name || '-'}</td>
                              <td>{m.team_b?.name || '-'}</td>
                              <td style={{ fontSize: 13 }}>
                                {m.details?.status === 'cancelled' ? <span style={{ color: '#dc2626', fontWeight: 600 }}>CANCELLED</span>
                                  : m.details?.status === 'disqualified' ? <span style={{ color: '#dc2626', fontWeight: 600 }}>DISQUALIFIED</span>
                                  : m.winner_id
                                  ? <strong style={{ color: '#16a34a' }}>Đi tiếp: {m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name} ({totalA} - {totalB})</strong>
                                  : tied ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Bằng {totalA}-{totalB} — cần Penalty Shootout</span>
                                  : scored ? `${totalA} - ${totalB}` : 'Chưa có kết quả'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button type="button" className="btn btn-secondary" onClick={() => openEditMatch(m)}>Sửa trận</button>
                                  <button type="button" className="btn btn-secondary" onClick={() => openDetail(m)}>Nhập điểm</button>
                                  <button type="button" className="btn btn-danger" onClick={() => removeMatch(m)}>Xóa</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
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
              <div className="form-group">
                <label className="form-label">Sân thi đấu (Field)</label>
                <select className="form-input form-select" value={form.field_id} onChange={(e) => setForm({ ...form, field_id: e.target.value })}>
                  <option value="">-- Chưa chọn --</option>
                  {allFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{isDrone ? 'Đội 1' : 'Đội Đỏ'} <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className={`form-input form-select ${errors.team_a_id ? 'form-input-error' : ''}`} value={form.team_a_id} onChange={(e) => setForm({ ...form, team_a_id: e.target.value })}>
                    <option value="">-- Chọn đội --</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{isDrone ? 'Số báo danh đội 1' : 'Số báo danh Đỏ'}</label>
                  <input className="form-input" value={form.team_a_no} onChange={(e) => setForm({ ...form, team_a_no: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{isDrone ? 'Đội 2' : 'Đội Xanh'} <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className={`form-input form-select ${errors.team_b_id ? 'form-input-error' : ''}`} value={form.team_b_id} onChange={(e) => setForm({ ...form, team_b_id: e.target.value })}>
                    <option value="">-- Chọn đội --</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {errors.team_b_id && <div className="form-error-text">{errors.team_b_id}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">{isDrone ? 'Số báo danh đội 2' : 'Số báo danh Xanh'}</label>
                  <input className="form-input" value={form.team_b_no} onChange={(e) => setForm({ ...form, team_b_no: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Vòng đấu (Preliminary/Intermediate/Quarterfinal/Semifinal/Final...)</label>
                <input className="form-input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} placeholder="VD: Preliminary 1" />
              </div>
              <div className="form-group">
                <label className="form-label">Bảng vòng tròn (để trống nếu là trận Finals/loại trực tiếp)</label>
                <input className="form-input" value={form.group_label} onChange={(e) => setForm({ ...form, group_label: e.target.value })} placeholder="VD: Bảng A" />
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

              {isStars ? (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Meteor Tower — Đỏ ({METEOR_TOWER_SCORE}đ nếu hoàn thành)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!detailForm.meteorCompletedA} onChange={(e) => setDetailForm({ ...detailForm, meteorCompletedA: e.target.checked })} /> Completed
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Meteor Tower — Xanh ({METEOR_TOWER_SCORE}đ nếu hoàn thành)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!detailForm.meteorCompletedB} onChange={(e) => setDetailForm({ ...detailForm, meteorCompletedB: e.target.checked })} /> Completed
                      </label>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Energy Defense — Đỏ (số block, {ENERGY_BLOCK_SCORE}đ/block, tối đa {ENERGY_BLOCK_MAX})</label>
                      <input type="number" min="0" max={ENERGY_BLOCK_MAX} className="form-input" value={detailForm.energyBlocksA ?? 0}
                        onChange={(e) => setDetailForm({ ...detailForm, energyBlocksA: clampEnergy(e.target.value) })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Energy Defense — Xanh (số block, {ENERGY_BLOCK_SCORE}đ/block, tối đa {ENERGY_BLOCK_MAX})</label>
                      <input type="number" min="0" max={ENERGY_BLOCK_MAX} className="form-input" value={detailForm.energyBlocksB ?? 0}
                        onChange={(e) => setDetailForm({ ...detailForm, energyBlocksB: clampEnergy(e.target.value) })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Full Firepower — Đỏ (số ball, {FIREPOWER_BALL_SCORE}đ/ball, tối đa {FIREPOWER_BALL_MAX})</label>
                      <input type="number" min="0" max={FIREPOWER_BALL_MAX} className="form-input" value={detailForm.firepowerBallsA ?? 0}
                        onChange={(e) => setDetailForm({ ...detailForm, firepowerBallsA: clampFirepower(e.target.value) })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Full Firepower — Xanh (số ball, {FIREPOWER_BALL_SCORE}đ/ball, tối đa {FIREPOWER_BALL_MAX})</label>
                      <input type="number" min="0" max={FIREPOWER_BALL_MAX} className="form-input" value={detailForm.firepowerBallsB ?? 0}
                        onChange={(e) => setDetailForm({ ...detailForm, firepowerBallsB: clampFirepower(e.target.value) })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Final Fortress — Đỏ (không tính điểm, chỉ Direct Win)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!detailForm.directWinA} onChange={(e) => setDetailDirectWin('A', e.target.checked)} /> Direct Win
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Final Fortress — Xanh (không tính điểm, chỉ Direct Win)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!detailForm.directWinB} onChange={(e) => setDetailDirectWin('B', e.target.checked)} /> Direct Win
                      </label>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Retries — Đỏ</label>
                      <input type="number" min="0" className="form-input" value={detailForm.retryCountA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, retryCountA: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Retries — Xanh</label>
                      <input type="number" min="0" className="form-input" value={detailForm.retryCountB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, retryCountB: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Points lost (penalty) — Đỏ</label>
                      <input type="number" min="0" className="form-input" value={detailForm.pointsLostA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, pointsLostA: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Points lost (penalty) — Xanh</label>
                      <input type="number" min="0" className="form-input" value={detailForm.pointsLostB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, pointsLostB: Math.max(0, Number(e.target.value) || 0) })} />
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
                  {(() => {
                    const sideA = { meteorCompleted: detailForm.meteorCompletedA, energyBlocks: detailForm.energyBlocksA, firepowerBalls: detailForm.firepowerBallsA, retryCount: detailForm.retryCountA, pointsLost: detailForm.pointsLostA, directWin: detailForm.directWinA };
                    const sideB = { meteorCompleted: detailForm.meteorCompletedB, energyBlocks: detailForm.energyBlocksB, firepowerBalls: detailForm.firepowerBallsB, retryCount: detailForm.retryCountB, pointsLost: detailForm.pointsLostB, directWin: detailForm.directWinB };
                    const scoreA = computeTaskScore(sideA);
                    const scoreB = computeTaskScore(sideB);
                    const isGroupStage = !!detailModal.group_label;
                    const { result } = isGroupStage ? determineGroupMatchResult(sideA, sideB) : determineFinalsMatchResult(sideA, sideB);
                    const resultText = detailForm.directWinA ? `${detailModal.team_a?.name} thắng — Direct Win (Final Fortress)`
                      : detailForm.directWinB ? `${detailModal.team_b?.name} thắng — Direct Win (Final Fortress)`
                      : result === 'DRAW' ? `Hòa (${scoreA.taskScore} - ${scoreB.taskScore})`
                      : result === 'A' ? `${detailModal.team_a?.name} thắng (${scoreA.taskScore} - ${scoreB.taskScore})`
                      : result === 'B' ? `${detailModal.team_b?.name} thắng (${scoreA.taskScore} - ${scoreB.taskScore})`
                      : `TIE-BREAK — chưa phân định được (${scoreA.taskScore} - ${scoreB.taskScore})`;
                    return (
                      <div style={{ margin: '12px 0', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                        <div>Task Score — Đỏ: <strong>{scoreA.taskScore}</strong> · Xanh: <strong>{scoreB.taskScore}</strong></div>
                        <div style={{ marginTop: 4, fontWeight: 700, color: '#16a34a' }}>Kết quả (tự động): {resultText}</div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Màu Hiệp 1 (đội nào là Đỏ)</label>
                    <select className="form-input form-select" value={detailForm.half1RedTeam ?? 'A'} onChange={(e) => setDetailForm({ ...detailForm, half1RedTeam: e.target.value })}>
                      <option value="A">{detailModal.team_a?.name} = Đỏ, {detailModal.team_b?.name} = Xanh</option>
                      <option value="B">{detailModal.team_b?.name} = Đỏ, {detailModal.team_a?.name} = Xanh</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Hiệp 1 — {detailModal.team_a?.name}</label>
                      <input type="number" min="0" className="form-input" value={detailForm.firstHalfA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, firstHalfA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Hiệp 1 — {detailModal.team_b?.name}</label>
                      <input type="number" min="0" className="form-input" value={detailForm.firstHalfB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, firstHalfB: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Màu Hiệp 2 (đội nào là Đỏ)</label>
                    <select className="form-input form-select" value={detailForm.half2RedTeam ?? 'A'} onChange={(e) => setDetailForm({ ...detailForm, half2RedTeam: e.target.value })}>
                      <option value="A">{detailModal.team_a?.name} = Đỏ, {detailModal.team_b?.name} = Xanh</option>
                      <option value="B">{detailModal.team_b?.name} = Đỏ, {detailModal.team_a?.name} = Xanh</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Hiệp 2 — {detailModal.team_a?.name}</label>
                      <input type="number" min="0" className="form-input" value={detailForm.secondHalfA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, secondHalfA: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Hiệp 2 — {detailModal.team_b?.name}</label>
                      <input type="number" min="0" className="form-input" value={detailForm.secondHalfB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, secondHalfB: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Referee Awarded Points — {detailModal.team_a?.name} <span style={{ color: '#94a3b8' }}>(mục 12, cần lý do)</span></label>
                      <input type="number" min="0" className="form-input" value={detailForm.refereeAwardedA ?? 0} onChange={(e) => setDetailForm({ ...detailForm, refereeAwardedA: e.target.value })} />
                      {(Number(detailForm.refereeAwardedA) || 0) > 0 && (
                        <input type="text" className="form-input" style={{ marginTop: 6 }} placeholder="Lý do" value={detailForm.refereeAwardedReasonA} onChange={(e) => setDetailForm({ ...detailForm, refereeAwardedReasonA: e.target.value })} />
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Referee Awarded Points — {detailModal.team_b?.name}</label>
                      <input type="number" min="0" className="form-input" value={detailForm.refereeAwardedB ?? 0} onChange={(e) => setDetailForm({ ...detailForm, refereeAwardedB: e.target.value })} />
                      {(Number(detailForm.refereeAwardedB) || 0) > 0 && (
                        <input type="text" className="form-input" style={{ marginTop: 6 }} placeholder="Lý do" value={detailForm.refereeAwardedReasonB} onChange={(e) => setDetailForm({ ...detailForm, refereeAwardedReasonB: e.target.value })} />
                      )}
                    </div>
                  </div>

                  {(() => {
                    const sideA = { half1: detailForm.firstHalfA, half2: detailForm.secondHalfA, refereeAwarded: detailForm.refereeAwardedA };
                    const sideB = { half1: detailForm.firstHalfB, half2: detailForm.secondHalfB, refereeAwarded: detailForm.refereeAwardedB };
                    const tA = computeSideScore(sideA), tB = computeSideScore(sideB);
                    const isKnockout = !detailModal.group_label;
                    const outcome = isKnockout ? determineKnockoutResult(sideA, sideB, detailForm.shootoutRounds) : determineDroneGroupResult(sideA, sideB);
                    const resultText = isKnockout
                      ? (outcome.result === 'A' ? `Đi tiếp: ${detailModal.team_a?.name} (${tA.total} - ${tB.total})`
                        : outcome.result === 'B' ? `Đi tiếp: ${detailModal.team_b?.name} (${tA.total} - ${tB.total})`
                        : `Bằng ${tA.total} - ${tB.total} — cần Penalty Shootout`)
                      : (outcome.result === 'DRAW' ? `Hòa (${tA.total} - ${tB.total}) — 1 Match Point mỗi đội`
                        : outcome.result === 'A' ? `${detailModal.team_a?.name} thắng (${tA.total} - ${tB.total}) — 3 Match Points`
                        : `${detailModal.team_b?.name} thắng (${tA.total} - ${tB.total}) — 3 Match Points`);
                    const tied = tA.total === tB.total;
                    return (
                      <>
                        <div style={{ margin: '12px 0', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                          <div>Total Score — {detailModal.team_a?.name}: <strong>{tA.total}</strong> · {detailModal.team_b?.name}: <strong>{tB.total}</strong></div>
                          <div style={{ marginTop: 4, fontWeight: 700, color: '#16a34a' }}>Kết quả (tự động): {resultText}</div>
                        </div>
                        {isKnockout && tied && (
                          <div style={{ padding: 12, background: '#fef2f2', borderRadius: 8, marginBottom: 12, border: '1px solid #fecaca' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#b91c1c' }}>PENALTY SHOOTOUT</h4>
                            {(!detailForm.shootoutRounds || detailForm.shootoutRounds.length === 0) ? (
                              <button type="button" className="btn btn-secondary" onClick={startDroneShootout}>Bắt đầu Penalty Shootout</button>
                            ) : (
                              <>
                                {detailForm.shootoutRounds.map((r, idx) => (
                                  <div className="form-row" key={r.roundNo} style={{ alignItems: 'center' }}>
                                    <div className="form-group">
                                      <label className="form-label">Round {r.roundNo} — {detailModal.team_a?.name}</label>
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                          <input type="checkbox" checked={!!r.aSuccess} onChange={(e) => updateDroneShootoutRound(idx, { aSuccess: e.target.checked })} /> Ghi điểm
                                        </label>
                                        <input type="number" min="0.01" max={PENALTY_MAX_SECONDS} step="0.01" className="form-input" placeholder="giây"
                                          disabled={!r.aSuccess} value={r.aTimeSeconds} onChange={(e) => updateDroneShootoutRound(idx, { aTimeSeconds: e.target.value })} />
                                      </div>
                                    </div>
                                    <div className="form-group">
                                      <label className="form-label">Round {r.roundNo} — {detailModal.team_b?.name}</label>
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                          <input type="checkbox" checked={!!r.bSuccess} onChange={(e) => updateDroneShootoutRound(idx, { bSuccess: e.target.checked })} /> Ghi điểm
                                        </label>
                                        <input type="number" min="0.01" max={PENALTY_MAX_SECONDS} step="0.01" className="form-input" placeholder="giây"
                                          disabled={!r.bSuccess} value={r.bTimeSeconds} onChange={(e) => updateDroneShootoutRound(idx, { bTimeSeconds: e.target.value })} />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {(() => {
                                  const sw = resolveShootoutWinner(detailForm.shootoutRounds);
                                  return sw.winner ? (
                                    <p style={{ color: '#16a34a', fontWeight: 700, margin: '8px 0 0' }}>
                                      Thắng shootout: {sw.winner === 'A' ? detailModal.team_a?.name : detailModal.team_b?.name} (Round {sw.decidingRound})
                                    </p>
                                  ) : (
                                    <button type="button" className="btn btn-secondary" onClick={addDroneShootoutRound}>+ Thêm Round</button>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
              <h4 style={{ marginBottom: 8 }}>Xác nhận điểm</h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Học sinh/đội trưởng — {isStars ? 'Đỏ' : detailModal.team_a?.name}</label>
                  <input className="form-input" value={detailForm.teamMembersA || ''} onChange={(e) => setDetailForm({ ...detailForm, teamMembersA: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Học sinh/đội trưởng — {isStars ? 'Xanh' : detailModal.team_b?.name}</label>
                  <input className="form-input" value={detailForm.teamMembersB || ''} onChange={(e) => setDetailForm({ ...detailForm, teamMembersB: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <SignatureBox label={isStars ? 'Chữ ký đội Đỏ' : `Chữ ký đội ${detailModal.team_a?.name}`} value={detailForm.studentSigImageA} onChange={(v) => setDetailForm({ ...detailForm, studentSigImageA: v })} />
                </div>
                <div className="form-group">
                  <SignatureBox label={isStars ? 'Chữ ký đội Xanh' : `Chữ ký đội ${detailModal.team_b?.name}`} value={detailForm.studentSigImageB} onChange={(v) => setDetailForm({ ...detailForm, studentSigImageB: v })} />
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

              {!isStars && detailModal.details?.status !== 'cancelled' && detailModal.details?.status !== 'disqualified' && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#b91c1c' }}>Hủy trận / Truất quyền (mục 13)</h4>
                  {!statusAction ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => { setStatusAction('cancel'); setStatusReason(''); }}>Hủy trận</button>
                      <button type="button" className="btn btn-secondary" onClick={() => { setStatusAction('disqualify'); setStatusReason(''); setDisqualifiedSide('A'); }}>Truất quyền 1 đội</button>
                    </div>
                  ) : (
                    <div style={{ padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                      {statusAction === 'disqualify' && (
                        <select className="form-input form-select" style={{ marginBottom: 8 }} value={disqualifiedSide} onChange={(e) => setDisqualifiedSide(e.target.value)}>
                          <option value="A">{detailModal.team_a?.name}</option>
                          <option value="B">{detailModal.team_b?.name}</option>
                        </select>
                      )}
                      <textarea className="form-input" rows={2} placeholder="Lý do (bắt buộc)" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setStatusAction(null)} disabled={statusSaving}>Bỏ qua</button>
                        <button type="button" className="btn btn-danger" onClick={submitStatusAction} disabled={statusSaving}>
                          {statusSaving ? 'Đang lưu...' : statusAction === 'cancel' ? 'Xác nhận hủy trận' : 'Xác nhận truất quyền'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!isStars && (detailModal.details?.status === 'cancelled' || detailModal.details?.status === 'disqualified') && (
                <p style={{ marginTop: 12, fontSize: 12, color: '#dc2626' }}>
                  Trận này đã ở trạng thái "{detailModal.details?.status}" — {detailModal.details?.disqualificationReason || 'không có lý do ghi nhận'}.
                </p>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDetailModal(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveDetail}>Lưu điểm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Phân chia bảng tự động ── */}
      {groupDivModal && (
        <div className="modal-overlay" onClick={() => !dividingGroups && setGroupDivModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Phân chia bảng tự động</h3>
              <button type="button" className="form-modal-close" onClick={() => setGroupDivModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Số bảng muốn chia</label>
                <input
                  type="number" min="1" max={Math.max(1, teams.length)} className="form-input"
                  value={groupDivModal.count}
                  onChange={(e) => setGroupDivModal({ count: e.target.value })}
                />
              </div>
              {(() => {
                const n = Math.max(1, Math.min(26, Math.floor(Number(groupDivModal.count)) || 0));
                if (!n || teams.length < n) return null;
                const base = Math.floor(teams.length / n);
                const remainder = teams.length % n;
                const sizes = Array.from({ length: n }, (_, g) => base + (g < remainder ? 1 : 0));
                return (
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    {teams.length} đội → {sizes.map((s, i) => `Bảng ${String.fromCharCode(65 + i)}: ${s} đội`).join(', ')}.
                  </p>
                );
              })()}
              <p style={{ fontSize: 12, color: '#dc2626' }}>
                Sẽ ghi đè Group hiện tại của tất cả {teams.length} đội trong nội dung này (bốc thăm ngẫu nhiên).
              </p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setGroupDivModal(null)} disabled={dividingGroups}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={() => divideIntoGroups(groupDivModal.count)} disabled={dividingGroups}>
                {dividingGroups ? 'Đang chia...' : 'Chia bảng'}
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

      {deleteAllConfirm && (
        <div className="modal-overlay" onClick={() => !deletingAll && setDeleteAllConfirm(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Xác nhận xóa tất cả trận</h3>
              <button type="button" className="form-modal-close" onClick={() => setDeleteAllConfirm(null)} aria-label="Đóng" disabled={deletingAll}>×</button>
            </div>
            <div className="form-modal-body">
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa TẤT CẢ {matches.length} trận đấu của nội dung này:</p>
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
