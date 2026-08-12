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
import {
  ENERGY_BLOCK_MAX, FIREPOWER_BALL_MAX, ENERGY_BLOCK_SCORE, FIREPOWER_BALL_SCORE, METEOR_TOWER_SCORE,
  computeTaskScore, determineGroupMatchResult, determineFinalsMatchResult, computeGroupStandings, generateRoundRobin,
} from '../../lib/battleScoring';
import './AdminLayout.css';

const CONTENT_FORMAT_LABEL = {
  combat_drone: 'Đối kháng — Fly Smart Cup',
  combat_stars: 'Đối kháng — Battle of Stars',
};

// Quy ước dùng cho bảng xếp hạng vòng bảng (Appendix II) của Fly Smart Cup
// (combat_drone) — không có trong ảnh mẫu, có thể chỉnh nếu cần: thắng = 3,
// hòa = 1, thua = 0; "Highest Points" = tổng điểm số thực ghi được (tie-break
// phụ khi bằng điểm). KHÔNG áp dụng cho Battle of Stars (combat_stars) —
// Battle of Stars dùng logic riêng trong client/src/lib/battleScoring.js theo
// đúng luật ENJOY AI 2026.
const WIN_POINTS = 3, DRAW_POINTS = 1, LOSS_POINTS = 0;

// Chỉ dùng cho combat_drone (Fly Smart Cup) — điểm 1 trận = tổng hiệp 1 + hiệp 2.
function matchPoints(match) {
  const d = match.details || {};
  return {
    a: (Number(d.firstHalfA) || 0) + (Number(d.secondHalfA) || 0),
    b: (Number(d.firstHalfB) || 0) + (Number(d.secondHalfB) || 0),
  };
}

const clampEnergy = (v) => Math.min(ENERGY_BLOCK_MAX, Math.max(0, parseInt(v, 10) || 0));
const clampFirepower = (v) => Math.min(FIREPOWER_BALL_MAX, Math.max(0, parseInt(v, 10) || 0));

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
    const [teams, matches] = await Promise.all([
      api.getTeams(selectedContentId),
      api.getCombatMatches(selectedContentId),
    ]);
    return { teams, matches };
  }, [selectedContentId]);
  const teams = cdata?.teams || [];
  const matches = cdata?.matches || [];
  const { pageItems: matchesPage, page: matchesPageNo, setPage: setMatchesPage, pageCount: matchesPageCount, totalItems: matchesTotal, pageSize: matchesPageSize } = usePagination(matches, 10);

  const [modal, setModal] = useState(null); // 'add' | { id }
  const [form, setForm] = useState({ team_a_id: '', team_b_id: '', team_a_no: '', team_b_no: '', stage: '', group_label: '', match_no: '', board_id: '', field_id: '' });
  const [errors, setErrors] = useState({});
  const [detailModal, setDetailModal] = useState(null); // match object đang sửa chi tiết
  const [detailForm, setDetailForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMatchId, setViewMatchId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [pendingExport, setPendingExport] = useState(null);
  const [generatingGroup, setGeneratingGroup] = useState(null);
  const [groupDivModal, setGroupDivModal] = useState(null); // { count } khi mở modal Phân chia bảng
  const [dividingGroups, setDividingGroups] = useState(false);

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
        penaltyShootout: !!d.penaltyShootout,
        penaltyA: d.penaltyA?.length ? d.penaltyA : [{ score: '', time: '' }, { score: '', time: '' }, { score: '', time: '' }],
        penaltyB: d.penaltyB?.length ? d.penaltyB : [{ score: '', time: '' }, { score: '', time: '' }, { score: '', time: '' }],
        winner_id: m.winner_id || '', is_draw: !!m.is_draw,
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
        details = {
          division: detailForm.division || null,
          firstHalfA: Number(detailForm.firstHalfA) || 0, firstHalfB: Number(detailForm.firstHalfB) || 0,
          secondHalfA: Number(detailForm.secondHalfA) || 0, secondHalfB: Number(detailForm.secondHalfB) || 0,
          penaltyShootout: !!detailForm.penaltyShootout,
          penaltyA: detailForm.penaltyShootout ? detailForm.penaltyA : [],
          penaltyB: detailForm.penaltyShootout ? detailForm.penaltyB : [],
          ...confirmFields,
        };
        winner_id = detailForm.is_draw ? null : (detailForm.winner_id || null);
        is_draw = !!detailForm.is_draw;
      }
      await api.putCombatMatch(detailModal.id, { details, winner_id, is_draw });
      setDetailModal(null);
      await reloadMatches();
      showAlert('Đã lưu chi tiết trận.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  // ── Teams & Groups (Battle of Stars + Fly Smart Cup) — gán Group/Bảng đấu cho từng đội ──
  const groupNames = useMemo(() => Array.from(new Set(teams.map((t) => t.combat_group).filter(Boolean))).sort(), [teams]);

  const updateTeamGroup = async (teamId, combat_group) => {
    try {
      await api.putTeam(teamId, { combat_group: combat_group || null });
      await reloadTeams();
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
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
        const label = `Bảng ${String.fromCharCode(65 + g)}`;
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
  // (xem client/src/lib/battleScoring.js). Fly Smart Cup: xem "groups" bên dưới.
  const starsGroups = useMemo(() => {
    if (!isStars) return [];
    return teamGroups.map((g) => {
      const groupMatches = matches.filter((m) => m.group_label === g.label);
      return { label: g.label, teams: g.teams, standings: computeGroupStandings(g.teams, groupMatches) };
    });
  }, [isStars, teamGroups, matches]);

  // Lịch vòng tròn — dùng chung cho cả Battle of Stars lẫn Fly Smart Cup, thuật
  // toán round-robin không phụ thuộc format (client/src/lib/battleScoring.js).
  const scheduleByGroup = useMemo(() => {
    if (!isCombat) return [];
    return teamGroups.map((g) => {
      const teamIds = g.teams.map((t) => t.id);
      const rounds = generateRoundRobin(teamIds).map((pairs, idx) => ({
        roundNo: idx + 1,
        pairs: pairs.map(([aId, bId]) => {
          const existing = matches.find((m) => m.group_label === g.label &&
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

  // Sinh trận còn thiếu của 1 bảng, rải đều field: chọn field đang được dùng ÍT
  // NHẤT trong toàn nội dung (tính cả trận đã có) cho mỗi trận mới, để tổng số
  // trận trên mỗi field cân bằng nhau xuyên suốt cả giải chứ không chỉ trong 1 bảng.
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
    for (const m of matches) { if (m.field_id) fieldUsage.set(m.field_id, (fieldUsage.get(m.field_id) || 0) + 1); }
    const pickField = () => {
      if (!allFields.length) return null;
      let best = allFields[0], bestCount = Infinity;
      for (const f of allFields) {
        const c = fieldUsage.get(f.id) || 0;
        if (c < bestCount) { bestCount = c; best = f; }
      }
      fieldUsage.set(best.id, bestCount + 1);
      return best;
    };
    setGeneratingGroup(group.label);
    try {
      for (const p of group.missingPairs) {
        const teamA = teamsById.get(p.teamAId);
        const field = pickField();
        await api.postCombatMatch(selectedContentId, {
          team_a_id: p.teamAId, team_b_id: p.teamBId,
          group_label: group.label, board_id: teamA.board_id, field_id: field?.id || null,
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

  // ── Bảng xếp hạng vòng bảng Fly Smart Cup (combat_drone) — giữ nguyên như cũ ──
  const groups = useMemo(() => {
    if (isStars) return [];
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
        let points = 0, highestPoints = 0;
        const vs = {};
        for (const m of groupMatches) {
          if (m.team_a_id !== tid && m.team_b_id !== tid) continue;
          const isA = m.team_a_id === tid;
          const oppId = isA ? m.team_b_id : m.team_a_id;
          if (m.winner_id) points += m.winner_id === tid ? WIN_POINTS : LOSS_POINTS;
          else if (m.is_draw) points += DRAW_POINTS;
          const pts = matchPoints(m);
          const myScore = pts ? (isA ? pts.a : pts.b) : null;
          const oppScore = pts ? (isA ? pts.b : pts.a) : null;
          if (myScore !== null) highestPoints += myScore;
          if (oppId) vs[oppId] = pts ? `${myScore}:${oppScore}` : (m.winner_id === tid ? 'W' : m.winner_id === oppId ? 'L' : m.is_draw ? 'D' : '');
        }
        return { teamId: tid, teamName, points, highestPoints, vs };
      });
      standings.sort((a, b) => b.points - a.points || b.highestPoints - a.highestPoints);
      standings.forEach((s, i) => { s.rank = i + 1; });
      result.push({ label, teamIds: Array.from(teamIds), standings });
    }
    return result;
  }, [matches, teams, isStars]);

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
                Gán mỗi đội vào 1 Group/Bảng đấu — các đội cùng Group sẽ thi đấu vòng tròn với nhau. Có thể gán tay từng đội bên dưới, hoặc bấm "Phân chia bảng tự động" để hệ thống tự chia đều + bốc thăm ngẫu nhiên. Đội thi được tạo/sửa ở module Teams; ở đây chỉ gán Group.
              </p>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      <th>Division</th>
                      <th>Group/Bảng đấu</th>
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
                          <input
                            list="combat-group-options"
                            className="form-input"
                            style={{ maxWidth: 180 }}
                            defaultValue={t.combat_group || ''}
                            placeholder="VD: Bảng A"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (t.combat_group || '')) updateTeamGroup(t.id, v || null);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="combat-group-options">
                  {groupNames.map((g) => <option key={g} value={g} />)}
                </datalist>
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
                    <button
                      type="button" className="btn btn-secondary"
                      disabled={!g.missingPairs.length || generatingGroup === g.label}
                      onClick={() => generateSchedule(g)}
                    >
                      {generatingGroup === g.label ? 'Đang sinh...' : g.missingPairs.length ? `Sinh lịch vòng tròn (còn thiếu ${g.missingPairs.length} trận)` : 'Đã đủ lịch vòng tròn'}
                    </button>
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
            <div><h3 className="card-title">Danh sách trận ({matches.length})</h3></div>
            <button type="button" className="btn btn-primary" onClick={openAdd}>Thêm trận</button>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Vòng / Bảng</th>
                    <th>Sân</th>
                    <th>Đội Đỏ</th>
                    <th>Đội Xanh</th>
                    <th>Kết quả</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có trận nào.</td></tr>
                  ) : matchesPage.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.stage || '-'}
                        {m.group_label && <div style={{ fontSize: 12, color: '#64748b' }}>Bảng: {m.group_label}</div>}
                      </td>
                      <td>{m.field?.name || '-'}</td>
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

          {/* ── E. Group Ranking ── */}
          {!isStars && groups.map((g) => (
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
                      <th style={{ textAlign: 'center' }}>Points</th>
                      <th style={{ textAlign: 'center' }}>Highest Points</th>
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
                        <td style={{ textAlign: 'center' }}><strong>{row.points}</strong></td>
                        <td style={{ textAlign: 'center' }}>{row.highestPoints}</td>
                        <td style={{ textAlign: 'center' }}><strong>{row.rank}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

              {!isStars && (
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
              )}

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
