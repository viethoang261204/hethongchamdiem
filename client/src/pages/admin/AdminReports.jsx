import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { formatSecondsAsMinutes } from '../../lib/time';
import { exportMultipleToPdf } from '../referee/exportPdf';
import ScoreSheetTable from '../shared/ScoreSheetTable';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';
import {
  computeGroupStandings, computeTaskScore,
  sideFromDetails as starsSideFromDetails, computeMatchPoints as computeStarsMatchPoints,
} from '../../lib/battleScoring';
import {
  computeGroupStandings as computeDroneStandings, computeSideScore,
  sideFromDetails as droneSideFromDetails, computeMatchPoints as computeDroneMatchPoints,
} from '../../lib/flySmartCupScoring';
import './AdminLayout.css';

// Cột file Excel "Báo cáo điểm" cho nội dung đo lường — 1 dòng/thí sinh theo
// lượt 1/lượt 2. Đã bỏ cột "Ngày sinh" — hệ thống không thu thập/lưu ngày
// sinh thí sinh nên cột đó luôn trống, không cần thiết trong báo cáo.
// "Thứ hạng" ở cột cuối = hạng của đội trong BXH của ĐÚNG Bảng đấu (Board/
// Division tuổi) mà đội đó thi trong nội dung này — không phải hạng gộp toàn
// nội dung (1 nội dung có thể có nhiều Bảng đấu thi riêng), ghi dạng "Top N".
const REPORT_EXCEL_HEADER = [
  'Stt', 'Họ và tên thí sinh', 'Tổ chức/ Trường', 'Tên đội thi',
  'Bảng đấu', 'Huấn luyện viên', 'Địa điểm đăng ký dự thi', 'Sa bàn',
  'Điểm lần 1', 'Thời gian lần 1', 'Điểm lần 2', 'Thời gian lần 2',
  'Tổng điểm', 'Tổng thời gian', 'Thứ hạng',
];
// 'index' = số thứ tự (căn giữa, định dạng số nguyên); 'text' = văn bản dài
// (căn trái, tự xuống dòng); 'number' = số liệu (căn giữa); 'label' = văn bản
// ngắn cần căn giữa, không xuống dòng (VD: "Top 1", "Thắng").
const REPORT_COLUMN_KINDS = [
  'index', 'text', 'text', 'text', 'text', 'text', 'text', 'text',
  'number', 'number', 'number', 'number', 'number', 'number', 'label',
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
  'Thắng', 'Hòa', 'Thua', 'Thứ hạng',
];
const COMBAT_MATCH_COLUMN_KINDS = [
  'index', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'label',
  'number', 'number', 'number', 'number', 'number', 'number', 'label',
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

// "Top N" cho cột Thứ hạng — để trống (không phải "Top null") khi đội chưa
// có hạng (chưa gán Bảng đấu, hoặc nhánh đấu loại trực tiếp chưa đấu xong).
function formatRankLabel(rank) {
  return rank ? `Top ${rank}` : '';
}

// Tên sheet Excel tối đa 31 ký tự, không chứa \ / * ? : [ ], và không trùng
// nhau trong cùng 1 workbook — content.name có thể vi phạm cả 3.
function safeSheetName(name, used) {
  const base = (name || 'Sheet').replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(candidate);
  return candidate;
}

// Bảng màu/kiểu chữ lấy nguyên từ file mẫu báo cáo (bao-cao-mau.xlsx) người
// dùng cung cấp — thư viện `xlsx` (SheetJS bản miễn phí) không ghi được style
// khi xuất file nên đổi sang `exceljs` chỉ cho tính năng này để tô đúng màu/
// font/viền như mẫu (tiêu đề nền xanh navy chữ trắng đậm, dòng phụ đề chữ
// xanh ngọc nghiêng, dòng tiêu đề cột nền navy chữ trắng đậm, dữ liệu viền
// xám mảnh, đóng băng 4 dòng đầu, ẩn đường kẻ lưới).
const REPORT_NAVY = 'FF1F3864';
const REPORT_TEAL = 'FF0F7A82';
const REPORT_WHITE = 'FFFFFFFF';
const REPORT_BORDER_GRAY = 'FFBFBFBF';
const REPORT_THIN_BORDER = { style: 'thin', color: { argb: REPORT_BORDER_GRAY } };
const REPORT_CELL_BORDER = { top: REPORT_THIN_BORDER, bottom: REPORT_THIN_BORDER, left: REPORT_THIN_BORDER, right: REPORT_THIN_BORDER };

// Dựng 1 sheet theo đúng bố cục mẫu: dòng 1 tiêu đề lớn (merge hết chiều
// rộng), dòng 2 phụ đề, dòng 3 để trống, dòng 4 tiêu đề cột, từ dòng 5 là dữ
// liệu. `columnKinds` quyết định canh lề/định dạng số cho từng cột (song song
// với `header`); `rows` là mảng dữ liệu THÔ, KHÔNG kèm dòng tiêu đề.
function buildStyledSheet(workbook, sheetName, { title, subtitle, header, columnKinds, columnWidths, rows }) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
    properties: { tabColor: { argb: REPORT_NAVY } },
  });
  const colCount = header.length;
  ws.columns = columnWidths.map((w) => ({ width: w }));

  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: REPORT_WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NAVY } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 31.5;

  ws.mergeCells(2, 1, 2, colCount);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: 'Arial', size: 11, italic: true, color: { argb: REPORT_TEAL } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 19.5;

  ws.getRow(3).height = 6;

  const headerRow = ws.getRow(4);
  header.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: REPORT_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NAVY } };
    cell.border = REPORT_CELL_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 30;

  rows.forEach((rowValues, rIdx) => {
    const row = ws.getRow(5 + rIdx);
    rowValues.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val === '' || val === undefined ? null : val;
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF000000' } };
      cell.border = REPORT_CELL_BORDER;
      const kind = columnKinds[cIdx];
      if (kind === 'index') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '0';
      } else if (kind === 'number') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (typeof val === 'number') cell.numFmt = '0.##';
      } else if (kind === 'label') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    });
    row.height = 19.5;
  });

  return ws;
}

// Tải file .xlsx đã dựng bằng ExcelJS xuống máy — không có API writeFile như
// SheetJS cho trình duyệt nên tự tạo Blob + link tải rồi bấm hộ.
async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const { showAlert } = useNotify();
  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, allContents] = await Promise.all([api.getCompetitions(), api.getAllContents()]);
    return { competitions: comps, contents: allContents };
  }, []);
  const competitions = data?.competitions || [];
  const contents = data?.contents || [];

  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const [rows, setRows] = useState(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState(null);
  // Tên group (trường/HLV) đang xuất PDF chi tiết — dùng để disable đúng nút đó
  const [exportingGroup, setExportingGroup] = useState(null);
  // Danh sách phiếu điểm chi tiết (đã fetch đủ scores + tasks) đang chờ render
  // ẩn để html2canvas chụp từng phiếu, gộp thành 1 PDF cho cả group.
  const [pendingExport, setPendingExport] = useState(null);
  // Tên group (trường/HLV) đang xuất Excel bảng điểm — dùng để disable đúng nút đó
  const [exportingExcelGroup, setExportingExcelGroup] = useState(null);
  // Đang xuất PDF toàn bộ phiếu điểm trận đối kháng (mọi trận, mọi đội, mọi
  // nội dung đối kháng đang trong phạm vi báo cáo) + danh sách trận đang chờ
  // render ẩn để html2canvas chụp, gộp thành 1 PDF.
  const [exportingCombatPdf, setExportingCombatPdf] = useState(false);
  const [pendingCombatExport, setPendingCombatExport] = useState(null);

  const contentsForComp = useMemo(
    () => contents.filter((c) => !selectedComp || c.competition_id === selectedComp),
    [contents, selectedComp]
  );

  // content_format='scoring' (đo lường) đi qua /reports/scores như cũ. Nội
  // dung đối kháng (combat_stars/combat_drone) KHÔNG có row nào trong bảng
  // `scores` — phải tự lấy teams+combat_matches rồi tính bằng đúng luật riêng
  // của từng format (giống AdminScoreboard.jsx), không có route report riêng.
  const loadReport = async () => {
    if (!selectedComp) return;
    setRowsLoading(true);
    setRowsError(null);
    try {
      const scopedContents = selectedContent ? contents.filter((c) => c.id === selectedContent) : contentsForComp;
      const scopedCombatContents = scopedContents.filter((c) => COMBAT_FORMATS.includes(c.content_format));
      // Nội dung đo lường không có sẵn rank trong /reports/scores — phải hỏi
      // riêng route /ranking theo TỪNG Bảng đấu (giống trang Bảng xếp hạng),
      // rồi build 1 map tra cứu nhanh theo (team_id, content_id) để dùng khi
      // xuất Excel. Bracket đấu loại (ranking_format='combat' cho nội dung đo
      // lường) chỉ có hạng khi ĐÃ đấu xong (bracket_resolved) — đội chưa bị
      // loại/chưa xong nhánh sẽ không có hạng, để trống trong báo cáo.
      const scopedMeasurementContents = scopedContents.filter((c) => !COMBAT_FORMATS.includes(c.content_format));
      const [measurement, combatPerContent, measurementRankEntries] = await Promise.all([
        api.getReportScores({ competitionId: selectedComp, contentId: selectedContent || undefined }),
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
          const perBoard = await Promise.all(boards.map((b) => api.getRanking(c.id, b.id).catch(() => null)));
          const entries = [];
          perBoard.forEach((r) => {
            if (!r) return;
            if (r.ranking_format === 'measurement') {
              (r.teams || []).forEach((t, idx) => entries.push({ team_id: t.team_id, contest_content_id: c.id, rank: idx + 1 }));
            } else if (r.ranking_format === 'combat' && r.bracket_resolved) {
              (r.placements || []).forEach((p) => entries.push({ team_id: p.team_id, contest_content_id: c.id, rank: p.rank }));
            }
          });
          return entries;
        })),
      ]);
      setRows({
        measurement,
        rankByMeasurementKey: Object.fromEntries(
          measurementRankEntries.flat().map((e) => [`${e.team_id}|${e.contest_content_id}`, e.rank])
        ),
        combat: combatPerContent.flatMap((c) => c.standingsRows),
        combatMatchRows: combatPerContent.flatMap((c) => c.matchRows),
        combatMatches: combatPerContent.flatMap((c) => c.matches
          .filter((m) => m.winner_id || m.is_draw || (m.details?.status && m.details.status !== 'scheduled'))
          .map((m) => ({ match: m, content: c.content }))),
      });
    } catch (e) {
      setRowsError(e.message || 'Lỗi tải báo cáo.');
    } finally {
      setRowsLoading(false);
    }
  };

  // Gộp theo (đội × nội dung) rồi nhóm theo trường/trung tâm — 1 đội có thể
  // thi nhiều nội dung khác nhau trong cùng cuộc thi nên không gộp theo đội
  // đơn thuần (tránh trộn lẫn điểm 2 nội dung khác nhau vào 1 dòng).
  const groups = useMemo(() => {
    if (!rows) return [];
    const byTeam = new Map();
    for (const r of rows.measurement || []) {
      const key = `${r.team_id}|${r.contest_content_id}`;
      if (!byTeam.has(key)) {
        byTeam.set(key, {
          key, team_id: r.team_id, team_name: r.team_name,
          school: r.schools?.name || 'Chưa có trường',
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
        content_name: r.content_name, contest_content_id: r.contest_content_id,
        format: 'combat', content_format: r.content_format, total_score: r.total_score, total_time: null, rounds: r.played,
        wins: r.wins, draws: r.draws, losses: r.losses, match_points: r.match_points,
      });
    }
    const teams = Array.from(byTeam.values());
    const byGroup = new Map();
    for (const t of teams) {
      const g = t.school;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(t);
    }
    return Array.from(byGroup.entries())
      .map(([name, teamsList]) => ({
        name,
        teams: teamsList.sort((a, b) => b.total_score - a.total_score),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const compName = competitions.find((c) => c.id === selectedComp)?.name || '';
  const contentName = contents.find((c) => c.id === selectedContent)?.name || 'Tất cả nội dung';

  // Xuất PDF CHI TIẾT (đầy đủ phiếu điểm từng đội, theo đúng mẫu Score Sheet)
  // cho toàn bộ đội thuộc 1 group (1 trường/trung tâm hoặc 1 HLV) — không phải
  // bảng tổng hợp điểm. CHỈ áp dụng đội thi nội dung đo lường (mẫu ScoreSheetTable
  // không dùng được cho đối kháng) — phiếu đối kháng đã có sẵn ở trang "Trận đối
  // kháng" (xuất theo từng trận, đúng mẫu Battle of Stars/Fly Smart Cup riêng).
  const handleExportGroupPdf = async (group) => {
    const measurementTeams = group.teams.filter((t) => t.format !== 'combat');
    if (measurementTeams.length === 0) {
      showAlert('Nhóm này chỉ có đội thi đối kháng — xuất phiếu đối kháng ở trang "Trận đối kháng".', 'error');
      return;
    }
    setExportingGroup(group.name);
    try {
      const tasksCache = new Map();
      const sheets = [];
      for (const t of measurementTeams) {
        const contentId = t.contest_content_id;
        if (contentId && !tasksCache.has(contentId)) {
          tasksCache.set(contentId, await api.getTasks(contentId).catch(() => []));
        }
        const teamScores = contentId
          ? await api.getScores({ teamId: t.team_id, contestContentId: contentId }).catch(() => [])
          : [];
        const contentObj = contents.find((c) => c.id === contentId) || { name: t.content_name };
        sheets.push({
          key: `${t.team_id}-${contentId}`,
          scores: teamScores,
          content: contentObj,
          tasks: tasksCache.get(contentId) || [],
        });
      }
      setPendingExport(sheets);
      // Chờ React render xong các sheet ẩn rồi mới chụp (2 rAF cho chắc đã paint)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = sheets.map((s) => document.getElementById(`export-sheet-${s.key}`));
      const slug = group.name.replace(/\s+/g, '-').toLowerCase();
      await exportMultipleToPdf(nodes, `phieu-diem-${slug}`);
    } finally {
      setPendingExport(null);
      setExportingGroup(null);
    }
  };

  // Xuất TOÀN BỘ bảng điểm của 1 group (1 trường/trung tâm) — mọi đội, mọi
  // nội dung đội đó đã thi trong phạm vi báo cáo đang xem, thành 1 file Excel
  // NHIỀU SHEET (1 sheet/nội dung, đúng thứ tự order_index) thay vì phải bấm
  // từng nút riêng theo từng nội dung như trước. Nội dung đo lường ra 1
  // dòng/thí sinh theo lượt 1/2 (mẫu REPORT_EXCEL_HEADER); nội dung đối kháng
  // ra 1 dòng/TRẬN cho mỗi đội (mẫu COMBAT_MATCH_EXCEL_HEADER) — 1 đội đấu
  // vòng tròn N trận sẽ có N dòng, không gộp thành 1 dòng tổng kết.
  const handleExportGroupExcel = async (group) => {
    setExportingExcelGroup(group.name);
    try {
      const measurementRows = (rows.measurement || []).filter((r) => (r.schools?.name || 'Chưa có trường') === group.name);
      const combatRows = (rows.combatMatchRows || []).filter((r) => r.school === group.name);
      const contentIdsInScope = new Set([
        ...measurementRows.map((r) => r.contest_content_id),
        ...combatRows.map((r) => r.contest_content_id),
      ]);
      if (contentIdsInScope.size === 0) {
        showAlert('Nhóm này chưa có dữ liệu điểm để xuất.', 'error');
        return;
      }
      const orderedContents = contents.filter((c) => contentIdsInScope.has(c.id));

      const measurementContentIds = [...new Set(measurementRows.map((r) => r.contest_content_id))];
      const [students, teamsArrays] = await Promise.all([
        measurementContentIds.length ? api.getStudents() : Promise.resolve([]),
        Promise.all(measurementContentIds.map((cid) => api.getTeams(cid))),
      ]);
      const teamsById = new Map(teamsArrays.flat().map((t) => [t.id, t]));
      const compLocation = competitions.find((c) => c.id === selectedComp)?.location || '';

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
          ? `${group.name} – Bảng tổng hợp kết quả vòng tròn theo đội`
          : `${group.name} – Bảng tổng hợp kết quả chấm điểm theo đội`;

        let dataRows;
        if (isCombat) {
          const matchRowsForContent = combatRows
            .filter((r) => r.contest_content_id === content.id)
            .sort((a, b) => a.team_name.localeCompare(b.team_name) || a.opponent_name.localeCompare(b.opponent_name));
          dataRows = matchRowsForContent.map((r, idx) => [
            idx + 1, r.team_name, r.opponent_name, r.school, r.board_name, r.coach_name,
            r.field_names, r.group_label, r.result_label, r.my_score, r.opp_score, r.match_points,
            r.total_wins, r.total_draws, r.total_losses, formatRankLabel(r.rank),
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
                idx === 0 ? formatRankLabel(rows.rankByMeasurementKey?.[`${team.id}|${content.id}`]) : '',
              ]);
            });
          }
        }

        buildStyledSheet(workbook, safeSheetName(content.name, usedNames), {
          title, subtitle,
          header: isCombat ? COMBAT_MATCH_EXCEL_HEADER : REPORT_EXCEL_HEADER,
          columnKinds: isCombat ? COMBAT_MATCH_COLUMN_KINDS : REPORT_COLUMN_KINDS,
          columnWidths: isCombat
            ? [6, 22, 22, 20, 14, 20, 12, 16, 12, 12, 14, 14, 10, 10, 10, 12]
            : [6, 22, 20, 20, 12, 20, 26, 14, 10, 12, 10, 12, 10, 12, 12],
          rows: dataRows,
        });
      }

      const slug = group.name.replace(/\s+/g, '-').toLowerCase();
      await downloadWorkbook(workbook, `bao-cao-diem-${slug}.xlsx`);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setExportingExcelGroup(null);
    }
  };

  // Xuất PDF toàn bộ phiếu điểm trận đối kháng đang trong phạm vi báo cáo
  // (mọi trận, mọi đội, cả 2 định dạng Battle of Stars/Fly Smart Cup nếu có) —
  // dùng đúng mẫu Score Sheet đã có sẵn ở trang "Trận đối kháng" (mục 767 ở
  // đó), chỉ khác là gộp theo phạm vi báo cáo (cuộc thi/nội dung đang chọn)
  // thay vì phải vào từng nội dung riêng.
  const handleExportCombatPdf = async () => {
    const items = rows?.combatMatches || [];
    if (!items.length) return;
    setExportingCombatPdf(true);
    try {
      setPendingCombatExport(items);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = items.map((it) => document.getElementById(`combat-report-export-${it.match.id}`));
      const slug = (contentName || 'doi-khang').replace(/\s+/g, '-').toLowerCase();
      await exportMultipleToPdf(nodes, `phieu-doi-khang-${slug}`);
    } finally {
      setPendingCombatExport(null);
      setExportingCombatPdf(false);
    }
  };

  if (loading) return <div className="nhutin-admin"><p style={{ padding: 24 }}>Đang tải...</p></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Báo cáo điểm</h1>
          <p className="page-subtitle">Chọn nội dung để xem theo từng trường/trung tâm, tải PDF chi tiết phiếu điểm ngay trong từng nhóm</p>
        </div>
      </div>

      {error && <div className="no-print"><ErrorBox error={error} onRetry={reload} /></div>}

      <div className="card no-print" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Cuộc thi <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="form-input form-select" value={selectedComp} onChange={(e) => { setSelectedComp(e.target.value); setSelectedContent(''); setRows(null); }}>
              <option value="">-- Chọn cuộc thi --</option>
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Nội dung thi</label>
            <select className="form-input form-select" value={selectedContent} onChange={(e) => { setSelectedContent(e.target.value); setRows(null); }} disabled={!selectedComp}>
              <option value="">Tất cả nội dung</option>
              {contentsForComp.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-primary" onClick={loadReport} disabled={!selectedComp || rowsLoading} style={{ alignSelf: 'flex-end' }}>
            {rowsLoading ? 'Đang tải...' : 'Xem báo cáo'}
          </button>
        </div>
      </div>

      {rowsError && <div className="no-print"><ErrorBox error={rowsError} onRetry={loadReport} /></div>}

      {rows && (
        <div className="report-page">
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#0f172a' }}>Báo cáo điểm — {compName}</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>
              {contentName} · Nhóm theo trung tâm · Xem lúc {new Date().toLocaleString('vi-VN')}
            </p>
            {rows.combatMatches?.length > 0 && (
              <button
                type="button"
                className="btn btn-primary no-print"
                style={{ marginTop: 12 }}
                onClick={handleExportCombatPdf}
                disabled={exportingCombatPdf}
              >
                {exportingCombatPdf ? 'Đang xuất...' : `Xuất PDF trận đối kháng (${rows.combatMatches.length} trận)`}
              </button>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>Chưa có dữ liệu điểm.</div>
          ) : groups.map((g) => (
            <div className="card report-group" key={g.name} style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">{g.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="page-subtitle">{g.teams.length} đội</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleExportGroupExcel(g)}
                    disabled={exportingExcelGroup === g.name}
                  >
                    {exportingExcelGroup === g.name ? 'Đang xuất...' : 'Xuất bảng điểm (Excel)'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleExportGroupPdf(g)}
                    disabled={exportingGroup === g.name}
                  >
                    {exportingGroup === g.name ? 'Đang xuất...' : 'Xuất phiếu điểm'}
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      <th>Nội dung</th>
                      <th style={{ width: 90 }}>Số lượt/trận</th>
                      <th style={{ width: 100 }}>Tổng điểm</th>
                      <th style={{ width: 140 }}>Kết quả (đối kháng)</th>
                      <th style={{ width: 120 }}>Tổng thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.teams.map((t) => (
                      <tr key={t.key}>
                        <td>{t.team_name}</td>
                        <td>{t.content_name}</td>
                        <td>{t.rounds}</td>
                        <td><strong>{t.total_score}</strong></td>
                        <td>{t.format === 'combat' ? `W${t.wins} D${t.draws} L${t.losses} · ${t.match_points} MP` : '-'}</td>
                        <td>{t.format === 'combat' ? '-' : (formatSecondsAsMinutes(String(t.total_time)) || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Render ẩn (ngoài màn hình) toàn bộ phiếu điểm chi tiết của group đang
          xuất, để html2canvas chụp từng phiếu rồi gộp thành 1 file PDF. */}
      {pendingExport && (
        <div style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1 }}>
          {pendingExport.map((s) => (
            <div key={s.key} id={`export-sheet-${s.key}`}>
              <ScoreSheetTable scores={s.scores} content={s.content} tasks={s.tasks} />
            </div>
          ))}
        </div>
      )}

      {/* Render ẩn từng phiếu điểm trận đối kháng để html2canvas chụp — mẫu
          khác nhau theo content_format (combat_stars/combat_drone), giống hệt
          renderSheet() ở trang "Trận đối kháng". */}
      {pendingCombatExport && (
        <div style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1 }}>
          {pendingCombatExport.map((it) => (
            <div key={it.match.id} id={`combat-report-export-${it.match.id}`}>
              {it.content.content_format === 'combat_stars'
                ? <CombatStarsSheetTable match={it.match} sheetRef={null} />
                : <CombatDroneSheetTable match={it.match} sheetRef={null} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
