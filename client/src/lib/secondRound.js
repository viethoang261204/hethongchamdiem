// Xét điểm lần 2 — BXH TỔNG gộp mọi host thi trực tiếp (Hà Nội, Đà Nẵng,
// TP HCM, Asian Open...; bỏ ENJOY AI ONLINE) theo (nội dung × bảng đấu), rồi
// lấy 10% số đội KHÔNG có giải thưởng nào (làm tròn lên) có điểm cao nhất.
//  - Nội dung gộp giữa các host theo contentGroup() (Inventions Trail = Con
//    đường phát minh...); bảng đấu khớp theo tên (Bảng A..E).
//  - Xếp hạng đúng luật BXH chính thức: compareRankedTeams (tổng điểm 2 lượt
//    → tổng thời gian → số lần chạy lại → lượt cao nhất).
//  - Bỏ Battle of Stars / Fly Smart Cup: đấu vòng tròn trong từng host, đội ở
//    host khác nhau không đấu với nhau nên không xếp chung được.
//  - Host có gộp bảng khi xếp hạng / trao giải (lib/boardMerge.js, vd Đà
//    Nẵng: Bầu trời B+C, D+E) → đội của bảng gộp xếp vào bảng CAO NHẤT của
//    nhóm (B+C → C), đúng cách host đó đã trao giải.
//  - Đội đã có giải ở host khác trong cùng nội dung × bảng (trùng tên đội,
//    hoặc có học sinh trùng họ tên + ngày sinh) → coi như đã có giải, không
//    chiếm suất xét lần 2.
//  - Đội bằng điểm tuyệt đối với đội cuối cùng được chọn → được xét cùng.
import { compareRankedTeams, getMergeGroupsForContent } from './boardMerge';
import { contentGroup, normalizeText } from './lookup';
import { buildStyledSheet, downloadWorkbook } from './excelReport';
import { fmtDate, validDob } from './china';

export const SECOND_ROUND_RATE = 0.1;
export const isOnlineCompetition = (c) => /online/i.test(c?.name || '');

const CONTENT_ORDER = ['inventions', 'mining', 'ancient', 'skyline'];
const fold = (v) => normalizeText(v).replace(/[^a-z0-9]+/g, '');
const personKeys = (team) => new Set(team.students
  .filter((st) => validDob(st.birth_date))
  .map((st) => `${fold(st.full_name)}|${st.birth_date}`));

// Bảng dùng để xếp chung: bảng gốc, hoặc bảng cao nhất nếu host gộp bảng
function sectionBoard(lookup, t, cache) {
  const content = t.content;
  if (!cache.has(content.id)) {
    const contentBoards = lookup.boards.filter((b) => b.contest_content_id === content.id);
    const map = new Map();
    for (const group of getMergeGroupsForContent(content.competition_id, content.name, contentBoards)) {
      const top = group.map((b) => b.name).sort((a, b) => a.localeCompare(b, 'vi')).pop();
      group.forEach((b) => map.set(b.name, top));
    }
    cache.set(content.id, map);
  }
  return cache.get(content.id).get(t.boardName) || t.boardName;
}
const contentRank = (key) => { const i = CONTENT_ORDER.indexOf(key); return i < 0 ? 99 : i; };

export function buildSecondRound(lookup) {
  if (!lookup) return { sections: [], hosts: [], hostsWithoutAwards: [] };
  const hosts = lookup.competitions.filter((c) => !isOnlineCompetition(c));
  const hostIds = new Set(hosts.map((c) => c.id));
  const bySection = new Map();
  const mergeCache = new Map();
  for (const t of lookup.teams) {
    if (!t.content || !hostIds.has(t.content.competition_id) || t.isCombat) continue;
    const g = contentGroup(t.content);
    const board = sectionBoard(lookup, t, mergeCache) || 'Chưa xếp bảng';
    const key = `${g.key}|${board}`;
    if (!bySection.has(key)) bySection.set(key, { key, contentKey: g.key, contentName: g.name, board, teams: [] });
    bySection.get(key).teams.push(t);
  }

  const sections = [...bySection.values()].map((s) => {
    const ranked = s.teams.filter((t) => t.total).sort((a, b) => compareRankedTeams(a.total, b.total));
    const rows = ranked.map((t, i) => ({
      team: t, overallRank: i + 1, hasAward: t.awards.length > 0, selected: false,
      fromBoard: t.boardName !== s.board ? t.boardName : '',
    }));
    // Đội không giải ở host này nhưng đã có giải ở host khác (cùng nội dung × bảng)
    const awardedNames = new Map();
    const awardedPeople = new Map();
    for (const r of rows.filter((x) => x.hasAward)) {
      awardedNames.set(fold(r.team.name), r.team);
      personKeys(r.team).forEach((k) => awardedPeople.set(k, r.team));
    }
    for (const r of rows.filter((x) => !x.hasAward)) {
      const twin = awardedNames.get(fold(r.team.name))
        || [...personKeys(r.team)].map((k) => awardedPeople.get(k)).find(Boolean);
      if (twin && twin.id !== r.team.id) r.awardElsewhere = twin;
    }
    const noAward = rows.filter((r) => !r.hasAward && !r.awardElsewhere);
    const quota = noAward.length ? Math.ceil(noAward.length * SECOND_ROUND_RATE) : 0;
    let picked = noAward.slice(0, quota);
    const last = picked[picked.length - 1];
    if (last) {
      // Bằng điểm tuyệt đối với đội cuối danh sách → không loại bỏ được, xét cùng
      const ties = noAward.slice(quota).filter((r) => compareRankedTeams(r.team.total, last.team.total) === 0);
      picked = picked.concat(ties);
    }
    picked.forEach((r, i) => { r.selected = true; r.selectedOrder = i + 1; });
    return {
      ...s,
      rows,
      hosts: [...new Set(s.teams.map((t) => t.competition?.name).filter(Boolean))],
      totalTeams: s.teams.length,
      scoredTeams: ranked.length,
      unscored: s.teams.length - ranked.length,
      awardTeams: rows.filter((r) => r.hasAward).length,
      awardElsewhereTeams: rows.filter((r) => r.awardElsewhere).length,
      movedTeams: rows.filter((r) => r.fromBoard).length,
      noAwardTeams: noAward.length,
      quota,
      selected: picked,
      tieExtra: picked.length - quota,
    };
  }).sort((a, b) => contentRank(a.contentKey) - contentRank(b.contentKey)
    || a.contentName.localeCompare(b.contentName, 'vi') || a.board.localeCompare(b.board, 'vi'));

  return {
    sections,
    hosts,
    // Host chưa có dữ liệu giải thưởng → mọi đội ở đó bị coi là "không giải"
    hostsWithoutAwards: hosts.filter((c) => !lookup.compsWithAwards.has(c.id)),
  };
}

const roundText = (t, n) => {
  const r = t.rounds[n];
  return r ? `${r.score} đ · ${r.time}s` : '';
};

// Excel: sheet 1 = đội được xét lần 2 (mỗi học sinh 1 dòng, kèm ngày sinh /
// SĐT / email); sheet 2 = BXH tổng đầy đủ của mọi (nội dung × bảng).
export async function exportSecondRoundExcel(sections, filename = 'xet-diem-lan-2.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const picked = sections.flatMap((s) => s.selected.map((r) => [s, r]));
  const studentRows = [];
  for (const [s, r] of picked) {
    const t = r.team;
    const list = t.students.length ? t.students : [null];
    list.forEach((st) => studentRows.push([
      studentRows.length + 1, s.contentName, s.board, r.selectedOrder, r.overallRank, t.name, t.competition?.name || '',
      t.total.total_score, t.total.total_time, t.rank ? `Hạng ${t.rank}` : '',
      st?.full_name || '', st && validDob(st.birth_date) ? fmtDate(st.birth_date) : '', st?.phone || '', st?.phone_source || '',
      st?.email || '', st?.email_source || '', t.school_name || '', t.coach_name || '',
    ]));
  }
  buildStyledSheet(workbook, 'Xét điểm lần 2', {
    title: 'DANH SÁCH ĐỘI ĐƯỢC XÉT ĐIỂM LẦN 2',
    subtitle: `${picked.length} đội — 10% số đội không có giải (làm tròn lên) của BXH tổng mỗi nội dung × bảng, gộp các host thi trực tiếp (không tính Online)`,
    header: ['STT', 'Nội dung', 'Bảng', 'Thứ tự xét', 'Hạng tổng', 'Đội', 'Host', 'Tổng điểm', 'Tổng thời gian (s)', 'Hạng tại host',
      'Học sinh', 'Ngày sinh', 'SĐT', 'Nguồn SĐT', 'Email', 'Nguồn email', 'Trường / Trung tâm', 'HLV'],
    columnKinds: ['index', 'text', 'label', 'number', 'number', 'text', 'text', 'number', 'number', 'label',
      'text', 'label', 'text-nowrap', 'label', 'text', 'label', 'text', 'text'],
    columnWidths: [6, 26, 10, 10, 10, 24, 24, 10, 12, 12, 26, 12, 14, 11, 30, 11, 28, 22],
    rows: studentRows,
  });

  const all = sections.flatMap((s) => s.rows.map((r) => [s, r]));
  buildStyledSheet(workbook, 'BXH tổng', {
    title: 'BẢNG XẾP HẠNG TỔNG CÁC HOST THI TRỰC TIẾP (KHÔNG TÍNH ONLINE)',
    subtitle: 'Xếp theo nội dung × bảng đấu (host gộp bảng → bảng cao nhất của nhóm): tổng điểm 2 lượt → tổng thời gian → số lần chạy lại → lượt cao nhất',
    header: ['STT', 'Nội dung', 'Bảng', 'Hạng tổng', 'Đội', 'Host', 'Lượt 1', 'Lượt 2', 'Tổng điểm', 'Tổng thời gian (s)',
      'Giải thưởng', 'Xét lần 2', 'Trường / Trung tâm', 'HLV', 'Học sinh'],
    columnKinds: ['index', 'text', 'label', 'number', 'text', 'text', 'label', 'label', 'number', 'number',
      'text', 'label', 'text', 'text', 'text'],
    columnWidths: [6, 26, 10, 10, 24, 24, 14, 14, 10, 12, 22, 10, 28, 22, 40],
    rows: all.map(([s, r], i) => [
      i + 1, s.contentName, s.board, r.overallRank, r.team.name, r.team.competition?.name || '',
      roundText(r.team, 1), roundText(r.team, 2), r.team.total.total_score, r.team.total.total_time,
      r.team.award || (r.awardElsewhere ? `Đã có giải ở host khác: ${r.awardElsewhere.award} (${r.awardElsewhere.competition?.name || ''})` : ''),
      r.selected ? 'Được xét' : '', r.team.school_name || '', r.team.coach_name || '',
      r.team.students.map((st) => st.full_name).join(', '),
    ]),
  });
  await downloadWorkbook(workbook, filename);
}
