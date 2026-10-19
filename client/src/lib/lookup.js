// Dựng dữ liệu cho cổng Tra cứu (/tra-cuu) từ GET /lookup/:competitionId —
// gắn đội ↔ học sinh ↔ phiếu điểm/trận đối kháng, tính tổng điểm + hạng theo
// ĐÚNG cách Bảng xếp hạng chính thức đang tính:
//  - Nội dung chấm điểm: cộng 2 lượt, tie-break compareRankedTeams (khớp
//    server /ranking), gộp bảng theo lib/boardMerge.js nếu cuộc thi có cấu hình.
//  - Đối kháng: xếp theo từng Bảng (board) bằng computeGroupStandings của
//    Battle of Stars / Fly Smart Cup (giống RefereeScoreboard.jsx).
import { compareRankedTeams, getMergeGroupsForContent } from './boardMerge';
import { computeGroupStandings as computeStarsStandings } from './battleScoring';
import { computeGroupStandings as computeDroneStandings } from './flySmartCupScoring';

// Nhãn bảng đấu theo tuổi — dùng chung trên mọi trang tra cứu
export const BOARD_AGE_LABEL = {
  'Bảng A': 'Mầm non – Tiền tiểu học',
  'Bảng B': 'Tiểu học khối dưới',
  'Bảng C': 'Tiểu học khối trên',
  'Bảng D': 'THCS',
  'Bảng E': 'THPT',
};

export const isCombatFormat = (fmt) => fmt === 'combat_stars' || fmt === 'combat_drone';

// Bỏ dấu tiếng Việt + chữ thường — để tìm "nguyen" ra "Nguyễn"
export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim();
}

export function buildLookup(data) {
  if (!data) return null;
  // Báo cáo tổng thể (all) gồm nhiều giải — mọi phép xếp hạng/gộp bảng vẫn
  // tính riêng trong ĐÚNG giải của từng nội dung (content.competition_id).
  const competitions = data.competitions || [data.competition];
  const competitionsById = new Map(competitions.map((c) => [c.id, c]));
  const contentsById = new Map(data.contents.map((c) => [c.id, c]));
  const boardNameById = new Map(data.boards.map((b) => [b.id, b.name]));
  const studentsById = new Map(data.students.map((s) => [s.id, s]));

  const teams = data.teams.map((t) => {
    const content = contentsById.get(t.contest_content_id);
    return {
      ...t,
      content,
      competition: competitionsById.get(content?.competition_id) || null,
      isCombat: isCombatFormat(content?.content_format),
      boardName: boardNameById.get(t.board_id) || '',
      students: (t.student_ids || []).map((id) => studentsById.get(id)).filter(Boolean),
      rounds: {},
      matches: [],
      total: null,
      rank: null,
      rankScope: '',
      combat: null,
    };
  });
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  // ---- Phiếu điểm (nội dung chấm điểm) ----
  for (const s of data.scores) {
    const t = teamsById.get(s.team_id);
    if (t) t.rounds[s.round] = s;
  }
  for (const t of teams) {
    const present = [t.rounds[1], t.rounds[2]].filter(Boolean);
    if (!present.length) continue;
    const scores = present.map((r) => Number(r.score) || 0);
    t.total = {
      team_id: t.id,
      rounds_done: present.length,
      total_score: scores.reduce((a, b) => a + b, 0),
      total_time: present.reduce((a, r) => a + (Number(r.time) || 0), 0),
      total_retry: present.reduce((a, r) => a + (Number(r.retry_count) || 0), 0),
      best_round_score: Math.max(...scores),
    };
  }

  // ---- Trận đối kháng ----
  const matchesByContent = new Map();
  for (const m of data.matches) {
    const a = teamsById.get(m.team_a_id);
    const b = teamsById.get(m.team_b_id);
    const enriched = { ...m, team_a: a ? { name: a.name } : null, team_b: b ? { name: b.name } : null };
    if (a) a.matches.push(enriched);
    if (b) b.matches.push(enriched);
    if (!matchesByContent.has(m.contest_content_id)) matchesByContent.set(m.contest_content_id, []);
    matchesByContent.get(m.contest_content_id).push(enriched);
  }
  const matchNo = (m) => { const n = parseInt(m.match_no, 10); return Number.isNaN(n) ? Infinity : n; };
  for (const t of teams) t.matches.sort((x, y) => matchNo(x) - matchNo(y));

  // ---- Xếp hạng ----
  for (const content of data.contents) {
    const contentBoards = data.boards.filter((b) => b.contest_content_id === content.id);
    const contentTeams = teams.filter((t) => t.contest_content_id === content.id);
    if (isCombatFormat(content.content_format)) {
      const matches = matchesByContent.get(content.id) || [];
      const compute = content.content_format === 'combat_stars' ? computeStarsStandings : computeDroneStandings;
      for (const b of contentBoards) {
        const boardTeams = contentTeams.filter((t) => t.board_id === b.id);
        if (!boardTeams.length) continue;
        compute(boardTeams, matches).forEach((s, i) => {
          const t = teamsById.get(s.teamId);
          if (!t) return;
          t.combat = s;
          if (s.played > 0) { t.rank = s.rank ?? i + 1; t.rankScope = b.name; }
        });
      }
      continue;
    }
    // Chấm điểm — gộp bảng (nếu cuộc thi có cấu hình) rồi các bảng còn lại
    const merged = getMergeGroupsForContent(content.competition_id, content.name, contentBoards);
    const mergedIds = new Set(merged.flat().map((b) => b.id));
    const units = [...merged, ...contentBoards.filter((b) => !mergedIds.has(b.id)).map((b) => [b])];
    for (const unit of units) {
      const ids = new Set(unit.map((b) => b.id));
      const ranked = contentTeams.filter((t) => ids.has(t.board_id) && t.total).sort((x, y) => compareRankedTeams(x.total, y.total));
      ranked.forEach((t, i) => { t.rank = i + 1; t.rankScope = unit.map((b) => b.name).join(' + '); });
    }
  }

  // ---- Học sinh ↔ đội ----
  const students = data.students.map((s) => ({ ...s, teams: [] }));
  const studentObjById = new Map(students.map((s) => [s.id, s]));
  for (const t of teams) for (const id of t.student_ids || []) studentObjById.get(id)?.teams.push(t);
  students.sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));

  return {
    all: !!data.all,
    competition: data.competition,
    competitions,
    competitionsById,
    contents: data.contents,
    boards: data.boards,
    teams,
    teamsById,
    students,
    schools: [...new Set(teams.map((t) => t.school_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    coaches: [...new Set(teams.map((t) => t.coach_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    fields: [...new Set(teams.flatMap((t) => t.fields || []))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  };
}

// Tên nội dung kèm tên giải khi đang xem tổng thể nhiều giải (tránh nhầm các
// nội dung trùng tên giữa các giải, vd "Con đường phát minh" ở ĐN/HCM/HN).
export function contentLabel(lookup, content) {
  if (!content) return '';
  if (!lookup?.all) return content.name;
  const comp = lookup.competitionsById.get(content.competition_id);
  return comp ? `${content.name} — ${comp.name}` : content.name;
}

// Kết quả ngắn gọn của 1 đội để hiện trong bảng
export function teamResultText(t) {
  if (t.isCombat) {
    const c = t.combat;
    if (!c || !c.played) return 'Chưa thi đấu';
    return `${c.wins} thắng · ${c.draws} hòa · ${c.losses} thua (${c.matchPoints} điểm trận)`;
  }
  if (!t.total) return 'Chưa có phiếu';
  return `${t.total.total_score} điểm · ${t.total.total_time}s`;
}
