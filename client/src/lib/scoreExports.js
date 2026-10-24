// Dựng các file Excel bảng điểm dùng chung cho trang Báo cáo, Bảng xếp hạng
// và màn "Lưu trữ" (tải từng file / cả thư mục .zip để gửi riêng cho trường,
// HLV) — chung 1 chỗ để file tải ở mọi nơi luôn giống hệt nhau.
import { api } from '../api';
import {
  computeGroupStandings, computeTaskScore,
  sideFromDetails as starsSideFromDetails, computeMatchPoints as computeStarsMatchPoints,
} from './battleScoring';
import {
  computeGroupStandings as computeDroneStandings, computeSideScore,
  sideFromDetails as droneSideFromDetails, computeMatchPoints as computeDroneMatchPoints,
} from './flySmartCupScoring';
import { safeSheetName, buildStyledSheet, writeStyledBlock } from './excelReport';
import { formatRankLabel, awardOrder } from './outstandingCoach';
import { getMergeGroupsForContent, mergeMeasurementTeams } from './boardMerge';

// Cột file Excel "Báo cáo điểm" cho nội dung đo lường — 1 dòng/thí sinh theo
// lượt 1/lượt 2. Đã bỏ cột "Ngày sinh" — hệ thống không thu thập/lưu ngày
// sinh thí sinh nên cột đó luôn trống, không cần thiết trong báo cáo.
// "Thứ hạng" ở cột cuối = hạng của đội trong BXH của ĐÚNG Bảng đấu (Board/
// Division tuổi) mà đội đó thi trong nội dung này — không phải hạng gộp toàn
// nội dung (1 nội dung có thể có nhiều Bảng đấu thi riêng). "Giải thưởng" =
// giải CHÍNH THỨC của BTC (team_awards: Giải Nhất/Nhì/Ba, Top 5, Top 10,
// Rising Star...); cuộc thi chưa nhập giải chính thức thì suy ra từ hạng.
const REPORT_EXCEL_HEADER = [
  'Stt', 'Họ và tên thí sinh', 'Tổ chức/ Trường', 'Tên đội thi',
  'Bảng đấu', 'Huấn luyện viên', 'Địa điểm đăng ký dự thi', 'Sa bàn',
  'Điểm lần 1', 'Thời gian lần 1', 'Điểm lần 2', 'Thời gian lần 2',
  'Tổng điểm', 'Tổng thời gian', 'Thứ hạng', 'Giải thưởng',
];
// 'index' = số thứ tự (căn giữa, định dạng số nguyên); 'text' = văn bản dài
// (căn trái, tự xuống dòng); 'number' = số liệu (căn giữa); 'label' = văn bản
// ngắn cần căn giữa, không xuống dòng (VD: "Top 1", "Thắng").
const REPORT_COLUMN_KINDS = [
  'index', 'text', 'text', 'text', 'text', 'text', 'text', 'text',
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'label',
];

// Mẫu Excel cho 2 nội dung đối kháng — MỖI TRẬN 1 DÒNG (không gộp thành 1
// dòng/đội như trước) — 1 đội đấu vòng tròn với N đối thủ sẽ ra N dòng, mỗi
// dòng là kết quả của đúng 1 trận, để khớp với cách người dùng đọc phiếu điểm
// giấy (từng trận riêng) thay vì chỉ xem tổng kết cuối bảng. "Thắng/Hòa/Thua"
// là TỔNG cả nội dung (không đổi theo từng dòng/trận) để trọng tài/BTC vẫn
// thấy được thành tích tổng kết của đội ngay trên cùng 1 sheet chi tiết từng
// trận, không phải mở thêm báo cáo khác.
const COMBAT_MATCH_EXCEL_HEADER = [
  'Stt', 'Tên đội thi', 'Đối thủ', 'Trường/Trung tâm', 'Bảng đấu', 'Huấn luyện viên',
  'Sân', 'Bảng vòng tròn', 'Kết quả', 'Điểm đội', 'Điểm đối thủ', 'Match Points',
  'Thắng', 'Hòa', 'Thua', 'Thứ hạng', 'Giải thưởng',
];
const COMBAT_MATCH_COLUMN_KINDS = [
  'index', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'label',
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'label',
];

const COMBAT_FORMATS = ['combat_stars', 'combat_drone'];
const RESULT_LABEL_VI = { WIN: 'Thắng', DRAW: 'Hòa', LOSS: 'Thua' };

// Kết quả + điểm số của 1 team trong 1 trận đối kháng, nhìn từ phía team đó.
// Thắng/Hòa/Thua lấy trực tiếp từ match.winner_id/is_draw (đã được tính đúng
// luật lúc trọng tài lưu — kể cả trận vòng loại trực tiếp quyết định bằng
// đá luân lưu ở Fly Smart Cup) thay vì tự suy luận lại từ details, để không
// lặp thiếu logic shootout riêng của combat_drone.
function combatMatchOutcome(match, isStars, teamId, mySide) {
  const sideFromDetails = isStars ? starsSideFromDetails : droneSideFromDetails;
  const computeScore = isStars ? (s) => computeTaskScore(s).taskScore : (s) => computeSideScore(s).total;
  const computeMatchPoints = isStars ? computeStarsMatchPoints : computeDroneMatchPoints;
  const oppSide = mySide === 'A' ? 'B' : 'A';
  const myScore = computeScore(sideFromDetails(match.details, mySide));
  const oppScore = computeScore(sideFromDetails(match.details, oppSide));
  const outcome = match.is_draw ? 'DRAW' : match.winner_id === teamId ? 'WIN' : 'LOSS';
  return { myScore, oppScore, outcome, matchPoints: computeMatchPoints(outcome) };
}

// Dữ liệu trang "Báo cáo": điểm đo lường + kết quả đối kháng + hạng theo
// Bảng đấu của 1 cuộc thi (contentId rỗng = mọi nội dung). `contents` = danh
// sách nội dung (mọi cuộc thi hoặc riêng cuộc thi này).
export async function loadReportRows({ compId, contentId = '', contents }) {
  const contentsForComp = contents.filter((c) => !compId || c.competition_id === compId);
  const scopedContents = contentId ? contents.filter((c) => c.id === contentId) : contentsForComp;
  const scopedCombatContents = scopedContents.filter((c) => COMBAT_FORMATS.includes(c.content_format));
  // Nội dung đo lường không có sẵn rank trong /reports/scores — phải hỏi
  // riêng route /ranking theo TỪNG Bảng đấu (giống trang Bảng xếp hạng),
  // rồi build 1 map tra cứu nhanh theo (team_id, content_id) để dùng khi
  // xuất Excel. Bracket đấu loại (ranking_format='combat' cho nội dung đo
  // lường) chỉ có hạng khi ĐÃ đấu xong (bracket_resolved) — đội chưa bị
  // loại/chưa xong nhánh sẽ không có hạng, để trống trong báo cáo.
  const scopedMeasurementContents = scopedContents.filter((c) => !COMBAT_FORMATS.includes(c.content_format));
  const competitionIds = compId ? [compId] : [...new Set(scopedContents.map((c) => c.competition_id))];
  const [measurement, combatPerContent, measurementRankEntries, awardLists] = await Promise.all([
    api.getReportScores({ competitionId: compId, contentId: contentId || undefined }),
    Promise.all(scopedCombatContents.map(async (c) => {
      const [teams, matches, boards] = await Promise.all([api.getTeams(c.id), api.getCombatMatches(c.id), api.getBoards(c.id)]);
      const isStars = c.content_format === 'combat_stars';
      const standings = isStars
        ? computeGroupStandings(teams, matches)
        : computeDroneStandings(teams, matches);
      // Thứ hạng phải tính RIÊNG theo từng Bảng đấu (Board/Division tuổi) —
      // standings ở trên gộp CHUNG toàn bộ đội của nội dung nên thứ tự sort
      // (và do đó rank) không đúng nếu nội dung có nhiều Bảng đấu thi song
      // song (giống cách AdminScoreboard.jsx tính BXH theo Board riêng).
      const rankByTeamId = new Map();
      boards.forEach((b) => {
        const boardTeams = teams.filter((t) => t.board_id === b.id);
        if (!boardTeams.length) return;
        const boardStandings = isStars
          ? computeGroupStandings(boardTeams, matches)
          : computeDroneStandings(boardTeams, matches);
        boardStandings.forEach((s) => rankByTeamId.set(s.teamId, s.rank));
      });
      const standingsRows = standings.map((s) => ({
        team_id: s.teamId, team_name: s.teamName,
        school: teams.find((t) => t.id === s.teamId)?.schools?.name || 'Chưa có trường',
        coach_name: teams.find((t) => t.id === s.teamId)?.coaches?.name || '',
        content_name: c.name, contest_content_id: c.id, content_format: c.content_format,
        played: s.played, wins: s.wins, draws: s.draws, losses: s.losses,
        match_points: s.matchPoints, total_score: s.totalScore,
        rank: rankByTeamId.get(s.teamId) ?? null,
      }));
      // Chỉ tính trận ĐÃ chấm điểm — bỏ qua trận còn "scheduled" (chưa vào
      // bàn), cùng điều kiện "đã chấm" mà RefereeCombatMatchScore.jsx dùng
      // để tự điền lại dữ liệu đã lưu khi trọng tài mở lại 1 trận.
      const completedMatches = matches.filter((m) => m.winner_id || m.is_draw || (m.details?.status && m.details.status !== 'scheduled'));
      // Tổng Thắng/Hòa/Thua CẢ nội dung của từng đội — lấy từ standings đã
      // tính ở trên (không đổi theo Board vì mỗi trận chỉ được cộng vào
      // đúng 1 trong 2 đội tham gia, không phụ thuộc việc so sánh/sort với
      // ai), để gắn vào MỌI dòng trận của đội đó bên dưới.
      const statsByTeamId = new Map(standings.map((s) => [s.teamId, s]));

      // Mỗi trận đã chấm → 2 dòng (1 dòng/đội, nhìn từ phía đội đó) — 1 đội
      // đấu vòng tròn với N trận sẽ có N dòng riêng trong sheet xuất Excel.
      const matchRows = [];
      completedMatches.forEach((m) => {
        [['A', m.team_a_id, m.team_b_id], ['B', m.team_b_id, m.team_a_id]].forEach(([side, teamId, oppId]) => {
          if (!teamId) return;
          const team = teams.find((t) => t.id === teamId);
          const opp = teams.find((t) => t.id === oppId);
          const { myScore, oppScore, outcome, matchPoints } = combatMatchOutcome(m, isStars, teamId, side);
          const stats = statsByTeamId.get(teamId);
          matchRows.push({
            team_id: teamId, team_name: team?.name || (side === 'A' ? m.team_a?.name : m.team_b?.name) || '—',
            opponent_name: opp?.name || (side === 'A' ? m.team_b?.name : m.team_a?.name) || '—',
            school: team?.schools?.name || 'Chưa có trường',
            board_name: team?.boards?.name || '', coach_name: team?.coaches?.name || '',
            field_names: (team?.fields || []).map((f) => f.name).join(', '),
            group_label: m.group_label || m.stage || '',
            content_name: c.name, contest_content_id: c.id, content_format: c.content_format,
            result_label: RESULT_LABEL_VI[outcome], my_score: myScore, opp_score: oppScore, match_points: matchPoints,
            total_wins: stats?.wins ?? 0, total_draws: stats?.draws ?? 0, total_losses: stats?.losses ?? 0,
            rank: rankByTeamId.get(teamId) ?? null,
            match_id: m.id,
          });
        });
      });
      return { content: c, matches, standingsRows, matchRows };
    })),
    Promise.all(scopedMeasurementContents.map(async (c) => {
      const boards = await api.getBoards(c.id).catch(() => []);
      const entries = [];

      // Bảng nào nằm trong nhóm gộp (boardMerge.js) thì tính hạng theo
      // ĐÚNG hạng đã gộp (khớp Bảng xếp hạng + HLV xuất sắc), không tính
      // riêng theo từng bảng tách.
      const mergeGroups = getMergeGroupsForContent(c.competition_id, c.name, boards);
      const mergedBoardIds = new Set(mergeGroups.flat().map((b) => b.id));
      await Promise.all(mergeGroups.map(async (groupBoards) => {
        const rankingResults = await Promise.all(groupBoards.map((b) => api.getRanking(c.id, b.id).catch(() => null)));
        const mergedTeams = mergeMeasurementTeams(rankingResults);
        const boardLabel = groupBoards.map((b) => b.name).join(' + ');
        mergedTeams.forEach((t, idx) => entries.push({ team_id: t.team_id, contest_content_id: c.id, board_name: boardLabel, rank: idx + 1 }));
      }));

      const perBoard = await Promise.all(
        boards.filter((b) => !mergedBoardIds.has(b.id)).map((b) => api.getRanking(c.id, b.id).catch((e) => [null, b, e]).then((r) => [r, b]))
      );
      perBoard.forEach(([r, b]) => {
        if (!r) return;
        if (r.ranking_format === 'measurement') {
          (r.teams || []).forEach((t, idx) => entries.push({ team_id: t.team_id, contest_content_id: c.id, board_name: b.name, rank: idx + 1 }));
        } else if (r.ranking_format === 'combat' && r.bracket_resolved) {
          (r.placements || []).forEach((p) => entries.push({ team_id: p.team_id, contest_content_id: c.id, board_name: b.name, rank: p.rank }));
        }
      });
      return entries.map((e) => ({ ...e, content_name: c.name }));
    })),
    Promise.all(competitionIds.map((id) => api.getCompetitionAwards(id).then((list) => [id, list || []]).catch(() => [id, []]))),
  ]);
  const awardsByTeamId = {};
  awardLists.forEach(([, list]) => list.forEach((a) => {
    if (!awardsByTeamId[a.team_id]) awardsByTeamId[a.team_id] = [];
    awardsByTeamId[a.team_id].push(a.label);
  }));
  return {
    measurement,
    rankByMeasurementKey: Object.fromEntries(
      measurementRankEntries.flat().map((e) => [`${e.team_id}|${e.contest_content_id}`, e])
    ),
    awardsByTeamId,
    competitionsWithAwards: awardLists.filter(([, list]) => list.length).map(([id]) => id),
    combat: combatPerContent.flatMap((c) => c.standingsRows),
    combatMatchRows: combatPerContent.flatMap((c) => c.matchRows),
    combatMatches: combatPerContent.flatMap((c) => c.matches
      .filter((m) => m.winner_id || m.is_draw || (m.details?.status && m.details.status !== 'scheduled'))
      .map((m) => ({ match: m, content: c.content }))),
  };
}

// Giải của 1 đội: giải chính thức (nhiều giải nối bằng " + "); cuộc thi
// chưa có giải chính thức nào thì suy từ hạng (Top 1/2/3, Top 5/10).
function teamAwardLabel(rows, content, teamId, boardName, rank) {
  if ((rows.competitionsWithAwards || []).includes(content.competition_id)) {
    return [...new Set(rows.awardsByTeamId?.[teamId] || [])].sort((a, b) => awardOrder(a) - awardOrder(b)).join(' + ');
  }
  return formatRankLabel(content.competition_id, content.name, boardName, rank);
}

// Gom (đội × nội dung) theo Trường/Trung tâm (groupBy='school') hoặc Huấn
// luyện viên (groupBy='coach') — mỗi nhóm = 1 file "bao-cao-diem-<tên>.xlsx".
export function groupReportRows(rows, groupBy) {
  if (!rows) return [];
  const noSchoolLabel = 'Chưa có trường';
  const noCoachLabel = 'Chưa có HLV';
  const byTeam = new Map();
  for (const r of rows.measurement || []) {
    const key = `${r.team_id}|${r.contest_content_id}`;
    if (!byTeam.has(key)) {
      byTeam.set(key, {
        key, team_id: r.team_id, team_name: r.team_name,
        school: r.schools?.name || noSchoolLabel,
        coach: r.coaches?.name || noCoachLabel,
        content_name: r.content_name, contest_content_id: r.contest_content_id,
        format: 'measurement', total_score: 0, total_time: 0, rounds: 0,
      });
    }
    const t = byTeam.get(key);
    t.total_score += Number(r.score) || 0;
    t.total_time += Number(r.time) || 0;
    t.rounds += 1;
  }
  for (const r of rows.combat || []) {
    const key = `${r.team_id}|${r.contest_content_id}`;
    byTeam.set(key, {
      key, team_id: r.team_id, team_name: r.team_name, school: r.school,
      coach: r.coach_name || noCoachLabel,
      content_name: r.content_name, contest_content_id: r.contest_content_id,
      format: 'combat', content_format: r.content_format, total_score: r.total_score, total_time: null, rounds: r.played,
      wins: r.wins, draws: r.draws, losses: r.losses, match_points: r.match_points,
    });
  }
  const teams = Array.from(byTeam.values());
  const byGroup = new Map();
  for (const t of teams) {
    const g = groupBy === 'coach' ? t.coach : t.school;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(t);
  }
  return Array.from(byGroup.entries())
    .map(([name, teamsList]) => ({
      name,
      teams: teamsList.sort((a, b) => b.total_score - a.total_score),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// File "bao-cao-diem-<nhóm>.xlsx" — mọi đội của 1 nhóm, 1 sheet/nội dung.
// Trả { workbook, filename } hoặc null nếu nhóm chưa có dữ liệu điểm.
export async function buildGroupWorkbook({ rows, groupName, groupBy, contents, compLocation = '' }) {
  const measurementRows = (rows.measurement || []).filter((r) => (
    groupBy === 'coach' ? (r.coaches?.name || 'Chưa có HLV') : (r.schools?.name || 'Chưa có trường')
  ) === groupName);
  const combatRows = (rows.combatMatchRows || []).filter((r) => (
    groupBy === 'coach' ? (r.coach_name || 'Chưa có HLV') : r.school
  ) === groupName);
  const contentIdsInScope = new Set([
    ...measurementRows.map((r) => r.contest_content_id),
    ...combatRows.map((r) => r.contest_content_id),
  ]);
  if (contentIdsInScope.size === 0) return null;
  const orderedContents = contents.filter((c) => contentIdsInScope.has(c.id));

  const measurementContentIds = [...new Set(measurementRows.map((r) => r.contest_content_id))];
  const [students, teamsArrays] = await Promise.all([
    measurementContentIds.length ? api.getStudents() : Promise.resolve([]),
    Promise.all(measurementContentIds.map((cid) => api.getTeams(cid))),
  ]);
  const teamsById = new Map(teamsArrays.flat().map((t) => [t.id, t]));

  // Nạp exceljs động (dynamic import) — thư viện khá nặng, chỉ cần cho
  // đúng tính năng xuất Excel này, không nên bắt MỌI người dùng (kể cả
  // trọng tài dùng iPad) tải thêm ~1MB JS này ngay từ lúc mở app.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set();

  for (const content of orderedContents) {
    const isCombat = COMBAT_FORMATS.includes(content.content_format);
    const title = `BÁO CÁO KẾT QUẢ THI ĐẤU – ${(content.name || '').toUpperCase()}`;
    const subtitle = isCombat
      ? `${groupName} – Bảng tổng hợp kết quả vòng tròn theo đội`
      : `${groupName} – Bảng tổng hợp kết quả chấm điểm theo đội`;

    let dataRows;
    if (isCombat) {
      const matchRowsForContent = combatRows
        .filter((r) => r.contest_content_id === content.id)
        .sort((a, b) => a.team_name.localeCompare(b.team_name) || a.opponent_name.localeCompare(b.opponent_name));
      dataRows = matchRowsForContent.map((r, idx) => [
        idx + 1, r.team_name, r.opponent_name, r.school, r.board_name, r.coach_name,
        r.field_names, r.group_label, r.result_label, r.my_score, r.opp_score, r.match_points,
        r.total_wins, r.total_draws, r.total_losses, r.rank ?? '', teamAwardLabel(rows, content, r.team_id, r.board_name, r.rank),
      ]);
    } else {
      const scoresByTeam = new Map();
      measurementRows
        .filter((r) => r.contest_content_id === content.id)
        .forEach((r) => {
          if (!scoresByTeam.has(r.team_id)) scoresByTeam.set(r.team_id, {});
          scoresByTeam.get(r.team_id)[r.round] = r;
        });
      const teamsSorted = Array.from(scoresByTeam.keys())
        .map((id) => teamsById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      dataRows = [];
      let stt = 0;
      for (const team of teamsSorted) {
        stt++;
        const rs = scoresByTeam.get(team.id) || {};
        const r1 = rs[1], r2 = rs[2];
        const totalScore = (Number(r1?.score) || 0) + (Number(r2?.score) || 0);
        const totalTime = (Number(r1?.time) || 0) + (Number(r2?.time) || 0);
        const members = (team.student_ids || []).map((id) => students.find((s) => s.id === id)).filter(Boolean);
        const displayMembers = members.length ? members : [null];
        displayMembers.forEach((mem, idx) => {
          dataRows.push([
            idx === 0 ? stt : '',
            mem?.full_name || '',
            team.schools?.name || '',
            team.name,
            team.boards?.name || '',
            team.coaches?.name || '',
            compLocation,
            (team.fields || []).map((f) => f.name).join(', '),
            r1?.score ?? '', r1?.time ?? '',
            r2?.score ?? '', r2?.time ?? '',
            totalScore, totalTime,
            ...(idx === 0 ? (() => {
              const rankInfo = rows.rankByMeasurementKey?.[`${team.id}|${content.id}`];
              return [rankInfo?.rank ?? '', teamAwardLabel(rows, content, team.id, rankInfo?.board_name, rankInfo?.rank)];
            })() : ['', '']),
          ]);
        });
      }
    }

    buildStyledSheet(workbook, safeSheetName(content.name, usedNames), {
      title, subtitle,
      header: isCombat ? COMBAT_MATCH_EXCEL_HEADER : REPORT_EXCEL_HEADER,
      columnKinds: isCombat ? COMBAT_MATCH_COLUMN_KINDS : REPORT_COLUMN_KINDS,
      columnWidths: isCombat
        ? [6, 22, 22, 20, 14, 20, 12, 16, 12, 12, 14, 14, 10, 10, 10, 10, 18]
        : [6, 22, 20, 20, 12, 20, 26, 14, 10, 12, 10, 12, 10, 12, 10, 18],
      rows: dataRows,
    });
  }

  const slug = groupName.replace(/\s+/g, '-').toLowerCase();
  return { workbook, filename: `bao-cao-diem-${slug}.xlsx` };
}

// File "bang-xep-hang-<cuộc thi>.xlsx" — BXH mọi nội dung × Bảng đấu, gộp
// chung 1 sheet. Trả { workbook, filename } hoặc null nếu chưa có dữ liệu.
export async function buildScoreboardWorkbook({ compId, compName = '' }) {
  const allContents = await api.getContents(compId);
  const allStudents = await api.getStudents().catch(() => []);
  const studentNameById = new Map(allStudents.map((s) => [s.id, s.full_name]));
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  // Gộp TẤT CẢ bảng vào 1 sheet duy nhất (không tách sheet riêng từng nội
  // dung×bảng đấu như trước) — mỗi bảng cách nhau vài dòng trống để dễ
  // cắt/kéo sắp xếp lại tay. Dựng TOÀN BỘ dữ liệu (mảng `blocks`) trước,
  // CHƯA ghi vào sheet — để đo được độ dài nội dung dài nhất của từng cột
  // trên khắp mọi khối rồi mới set độ rộng cột (ws.columns dùng CHUNG cho
  // cả sheet), tránh chữ bị xuống dòng hoặc bảng quá hẹp mất chữ.
  const ws = workbook.addWorksheet('Bảng xếp hạng', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
  });
  const blocks = [];

  for (const content of allContents) {
    const contentBoards = await api.getBoards(content.id).catch(() => []);
    if (!contentBoards.length) continue;
    const isCombat = COMBAT_FORMATS.includes(content.content_format);
    const isStars = content.content_format === 'combat_stars';

    let combatTeams = null, combatMatches = null;
    if (isCombat) {
      [combatTeams, combatMatches] = await Promise.all([api.getTeams(content.id), api.getCombatMatches(content.id)]);
    }
    // HLV/Trường/Sân thi đấu/Học sinh không có sẵn trong /ranking
    // (measurement) hay trong dữ liệu tính BXH combat (chỉ có id/name
    // đội) — lấy riêng từ /teams (đã kèm sẵn coaches.name, schools.name,
    // fields, student_ids) rồi tra theo team_id khi dựng từng dòng.
    const allTeamsForLookup = isCombat ? combatTeams : await api.getTeams(content.id).catch(() => []);
    const teamInfoById = new Map((allTeamsForLookup || []).map((t) => [t.id, {
      coach: t.coaches?.name || '',
      school: t.schools?.name || '',
      field: (t.fields || []).map((f) => f.name).join(', '),
      students: (t.student_ids || []).map((sid) => studentNameById.get(sid)).filter(Boolean).join(', '),
    }]));
    const infoOf = (id) => teamInfoById.get(id) || { coach: '', school: '', field: '', students: '' };

    const IDENTITY_HEADER = ['Hạng', 'Đội', 'HLV', 'Trường', 'Sân thi đấu', 'Học sinh'];
    const IDENTITY_KINDS = ['index', 'text-nowrap', 'text-nowrap', 'text-nowrap', 'text-nowrap', 'text-nowrap'];
    const identityRow = (rank, teamName, id) => {
      const info = infoOf(id);
      return [rank, teamName, info.coach, info.school, info.field, info.students];
    };

    // Ghép xếp hạng theo boardMerge.js (nếu nội dung này có cấu hình) —
    // chỉ áp dụng cho bảng đang xếp hạng đo lường (measurement), không đụng
    // tới nhánh đấu loại trực tiếp (combat). Bảng đã gộp thì bỏ qua ở vòng
    // lặp per-board bên dưới, tránh xuất trùng 2 lần.
    const mergedBoardIds = new Set();
    if (!isCombat) {
      for (const groupBoards of getMergeGroupsForContent(content.competition_id, content.name, contentBoards)) {
        const rankingResults = await Promise.all(groupBoards.map((b) => api.getRanking(content.id, b.id).catch(() => null)));
        const mergedTeams = mergeMeasurementTeams(rankingResults);
        if (!mergedTeams.length) continue;

        blocks.push({
          title: `BẢNG XẾP HẠNG – ${(content.name || '').toUpperCase()}`,
          subtitle: `${groupBoards.map((b) => b.name).join(' + ')} (gộp xếp hạng)`,
          header: [...IDENTITY_HEADER, 'Lượt 1', 'Lượt 2', 'Tổng điểm', 'Tổng thời gian', 'Chạy lại'],
          columnKinds: [...IDENTITY_KINDS, 'number', 'number', 'number', 'number', 'number'],
          rows: mergedTeams.map((t, idx) => [
            ...identityRow(idx + 1, t.team_name, t.team_id),
            t.round1 ? t.round1.score : '', t.round2 ? t.round2.score : '',
            t.total_score, t.total_time, t.total_retry,
          ]),
        });

        groupBoards.forEach((b) => mergedBoardIds.add(b.id));
      }
    }

    for (const board of contentBoards) {
      if (mergedBoardIds.has(board.id)) continue;
      let header, columnKinds, dataRows;

      if (isCombat) {
        const boardTeams = combatTeams.filter((t) => t.board_id === board.id);
        if (!boardTeams.length) continue;
        const standings = isStars
          ? computeGroupStandings(boardTeams, combatMatches)
          : computeDroneStandings(boardTeams, combatMatches);
        header = isStars
          ? [...IDENTITY_HEADER, 'Trận', 'Thắng', 'Hòa', 'Thua', 'Match Points', 'Total Score', 'Meteor', 'Direct Win', 'Retries']
          : [...IDENTITY_HEADER, 'Trận', 'Thắng', 'Hòa', 'Thua', 'Match Points', 'Total Score'];
        columnKinds = isStars
          ? [...IDENTITY_KINDS, 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']
          : [...IDENTITY_KINDS, 'number', 'number', 'number', 'number', 'number', 'number'];
        dataRows = standings.map((s) => (isStars
          ? [...identityRow(s.rank, s.teamName, s.teamId), s.played, s.wins, s.draws, s.losses, s.matchPoints, s.totalScore, s.meteorCompleted, s.directWins, s.retries]
          : [...identityRow(s.rank, s.teamName, s.teamId), s.played, s.wins, s.draws, s.losses, s.matchPoints, s.totalScore]));
      } else {
        const r = await api.getRanking(content.id, board.id).catch(() => null);
        if (!r) continue;
        if (r.ranking_format === 'measurement') {
          if (!r.teams?.length) continue;
          header = [...IDENTITY_HEADER, 'Lượt 1', 'Lượt 2', 'Tổng điểm', 'Tổng thời gian', 'Chạy lại'];
          columnKinds = [...IDENTITY_KINDS, 'number', 'number', 'number', 'number', 'number'];
          dataRows = r.teams.map((t, idx) => [
            ...identityRow(idx + 1, t.team_name, t.team_id),
            t.round1 ? t.round1.score : '', t.round2 ? t.round2.score : '',
            t.total_score, t.total_time, t.total_retry,
          ]);
        } else {
          // Nhánh đấu loại trực tiếp (ranking_format='combat' cho nội dung
          // đo lường) — chỉ xuất được khi đã đấu xong hết nhánh.
          if (!r.bracket_resolved || !r.placements?.length) continue;
          header = IDENTITY_HEADER;
          columnKinds = IDENTITY_KINDS;
          dataRows = r.placements.map((p) => {
            const name = r.matches.find((m) => m.team_a_id === p.team_id)?.team_a_name
              || r.matches.find((m) => m.team_b_id === p.team_id)?.team_b_name || p.team_id;
            return identityRow(p.rank, name, p.team_id);
          });
        }
      }

      blocks.push({
        title: `BẢNG XẾP HẠNG – ${(content.name || '').toUpperCase()}`,
        subtitle: `${board.name}${board.age_group ? ` — ${board.age_group}` : ''}`,
        header, columnKinds, rows: dataRows,
      });
    }
  }

  if (blocks.length === 0) return null;

  // Độ rộng mỗi cột = độ dài nội dung DÀI NHẤT xuất hiện ở đúng cột đó
  // (tiêu đề lẫn dữ liệu) trên khắp mọi khối, cộng thêm chút đệm — không
  // dùng bề rộng cố định vì tên trường/HLV/học sinh dài ngắn rất khác nhau
  // giữa các đội, cố định sẽ khiến chữ bị xuống dòng hoặc bảng quá hẹp.
  const colCount = Math.max(...blocks.map((b) => b.header.length));
  const colMaxLen = new Array(colCount).fill(0);
  const colKindAt = new Array(colCount).fill(null);
  for (const b of blocks) {
    b.header.forEach((h, i) => { colMaxLen[i] = Math.max(colMaxLen[i], String(h).length); });
    b.rows.forEach((row) => {
      row.forEach((v, i) => { colMaxLen[i] = Math.max(colMaxLen[i], String(v ?? '').length); });
    });
    b.columnKinds.forEach((k, i) => { if (!colKindAt[i]) colKindAt[i] = k; });
  }
  ws.columns = colMaxLen.map((len, i) => {
    const minWidth = colKindAt[i] === 'index' ? 8 : colKindAt[i] === 'number' ? 10 : 10;
    return { width: Math.max(minWidth, len + 2) };
  });

  const BLOCK_GAP_ROWS = 2;
  let currentRow = 1;
  for (const b of blocks) {
    const nextRow = writeStyledBlock(ws, currentRow, b);
    currentRow = nextRow + BLOCK_GAP_ROWS;
  }

  const name = compName || 'bang-xep-hang';
  const slug = name.replace(/\s+/g, '-').toLowerCase();
  return { workbook, filename: `bang-xep-hang-${slug}.xlsx` };
}
