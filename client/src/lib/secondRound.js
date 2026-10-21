// Xét điểm lần 2 — BXH TỔNG gộp mọi host thi trực tiếp (Hà Nội, Đà Nẵng,
// TP HCM, Asian Open...; bỏ ENJOY AI ONLINE) theo (nội dung × bảng đấu), rồi
// lấy 10% số đội KHÔNG có giải thưởng nào (làm tròn lên) có điểm cao nhất.
//  - Nội dung gộp giữa các host theo contentGroup() (Inventions Trail = Con
//    đường phát minh...); bảng đấu khớp theo tên (Bảng A..E).
//  - Xếp hạng đúng luật BXH chính thức: compareRankedTeams (tổng điểm 2 lượt
//    → tổng thời gian → số lần chạy lại → lượt cao nhất).
//  - Battle of Stars / Fly Smart Cup: chỉ dựng BXH tổng để tham khảo (Match
//    Points → Total Score → số trận thắng), KHÔNG xét lần 2 — đấu vòng tròn
//    trong từng host, đội ở host khác nhau không gặp nhau.
//  - Host có gộp bảng khi xếp hạng / trao giải (lib/boardMerge.js, vd Đà
//    Nẵng: Bầu trời B+C, D+E) → đội của bảng gộp xếp vào bảng CAO NHẤT của
//    nhóm (B+C → C), đúng cách host đó đã trao giải.
//  - Đội đã có giải ở host khác trong cùng nội dung × bảng (trùng tên đội,
//    hoặc có học sinh trùng họ tên + ngày sinh) → coi như đã có giải, không
//    chiếm suất xét lần 2.
//  - Đội nước ngoài (đơn vị đăng ký là tên nước — Taiwan, China, Mongolia...)
//    vẫn nằm trong BXH tổng nhưng KHÔNG được xét lần 2 và không tính vào số
//    đội làm cơ sở 10%.
//  - Đội bằng điểm tuyệt đối với đội cuối cùng được chọn → được xét cùng.
import { compareRankedTeams, getMergeGroupsForContent } from './boardMerge';
import { contentGroup, normalizeText } from './lookup';
import { isForeignTeam } from './foreign';
import { downloadWorkbook, safeSheetName, writeStyledBlock } from './excelReport';
import { fmtDate, validDob } from './china';

export const SECOND_ROUND_RATE = 0.1;
export const isOnlineCompetition = (c) => /online/i.test(c?.name || '');

export { isForeignTeam } from './foreign';

const CONTENT_ORDER = ['inventions', 'mining', 'ancient', 'skyline', 'battle', 'fly'];
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
const compareCombat = (a, b) => b.combat.matchPoints - a.combat.matchPoints
  || b.combat.totalScore - a.combat.totalScore
  || b.combat.wins - a.combat.wins;

export function buildSecondRound(lookup) {
  if (!lookup) return { sections: [], hosts: [], hostsWithoutAwards: [] };
  const hosts = lookup.competitions.filter((c) => !isOnlineCompetition(c));
  const hostIds = new Set(hosts.map((c) => c.id));
  const bySection = new Map();
  const mergeCache = new Map();
  for (const t of lookup.teams) {
    if (!t.content || !hostIds.has(t.content.competition_id)) continue;
    const g = contentGroup(t.content);
    const board = sectionBoard(lookup, t, mergeCache) || 'Chưa xếp bảng';
    const key = `${g.key}|${board}`;
    if (!bySection.has(key)) bySection.set(key, { key, contentKey: g.key, contentName: g.name, board, teams: [] });
    bySection.get(key).teams.push(t);
  }

  const sections = [...bySection.values()].map((s) => {
    const hostNames = [...new Set(s.teams.map((t) => t.competition?.name).filter(Boolean))];
    if (s.teams[0]?.isCombat) {
      // Đối kháng: chỉ BXH tổng, không xét lần 2
      const ranked = s.teams.filter((t) => t.combat?.played > 0).sort(compareCombat);
      const rows = ranked.map((t, i) => ({ team: t, overallRank: i + 1, hasAward: t.awards.length > 0, selected: false, fromBoard: '' }));
      return {
        ...s, combat: true, rows, hosts: hostNames, totalTeams: s.teams.length, scoredTeams: ranked.length,
        unscored: s.teams.length - ranked.length, awardTeams: rows.filter((r) => r.hasAward).length,
        awardElsewhereTeams: 0, foreignTeams: 0, movedTeams: 0, noAwardTeams: 0, quota: 0, selected: [], tieExtra: 0,
      };
    }
    const ranked = s.teams.filter((t) => t.total).sort((a, b) => compareRankedTeams(a.total, b.total));
    const rows = ranked.map((t, i) => ({
      team: t, overallRank: i + 1, hasAward: t.awards.length > 0, selected: false,
      fromBoard: t.boardName !== s.board ? t.boardName : '',
      foreign: isForeignTeam(t),
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
    const noAward = rows.filter((r) => !r.hasAward && !r.awardElsewhere && !r.foreign);
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
      hosts: hostNames,
      totalTeams: s.teams.length,
      scoredTeams: ranked.length,
      unscored: s.teams.length - ranked.length,
      awardTeams: rows.filter((r) => r.hasAward).length,
      awardElsewhereTeams: rows.filter((r) => r.awardElsewhere).length,
      foreignTeams: rows.filter((r) => r.foreign && !r.hasAward).length,
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

// Excel: sheet "Tổng hợp" (suất + đội được xét của mọi BXH) rồi MỖI (nội
// dung × bảng) 1 sheet riêng: khối trên = đội được xét lần 2 (mỗi học sinh 1
// dòng, kèm ngày sinh / SĐT / email), khối dưới = BXH tổng đầy đủ của bảng đó.
const SHORT_CONTENT = {
  inventions: 'Phát minh', mining: 'Khai khoáng', ancient: 'Văn minh cổ đại', skyline: 'Bầu trời',
  battle: 'Battle of Stars', fly: 'Fly Smart Cup',
};
const COMBAT_HEADER = ['Hạng tổng', 'Đội', 'Host', 'Hạng tại host', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Match Points', 'Total Score',
  'Giải thưởng', 'Trường / Trung tâm', 'HLV', 'Học sinh'];
const COMBAT_KINDS = ['index', 'text-nowrap', 'text-nowrap', 'label', 'number', 'number', 'number', 'number', 'number', 'number',
  'text-nowrap', 'text-nowrap', 'text-nowrap', 'text-nowrap'];
const combatRankRows = (s) => s.rows.map((r) => [
  r.overallRank, r.team.name, r.team.competition?.name || '', r.team.rank ? `Hạng ${r.team.rank}` : '',
  r.team.combat.played, r.team.combat.wins, r.team.combat.draws, r.team.combat.losses,
  r.team.combat.matchPoints, r.team.combat.totalScore, r.team.award || '',
  r.team.school_name || '', r.team.coach_name || '', r.team.students.map((st) => st.full_name).join(', '),
]);

const SELECTED_HEADER = ['STT', 'Thứ tự xét', 'Hạng tổng', 'Đội', 'Host', 'Tổng điểm', 'Thời gian (s)', 'Hạng tại host',
  'Học sinh', 'Ngày sinh', 'SĐT', 'Nguồn SĐT', 'Email', 'Nguồn email', 'Trường / Trung tâm', 'HLV'];
const SELECTED_KINDS = ['index', 'number', 'number', 'text-nowrap', 'text-nowrap', 'number', 'number', 'label',
  'text-nowrap', 'label', 'text-nowrap', 'label', 'text-nowrap', 'label', 'text-nowrap', 'text-nowrap'];
const RANK_HEADER = ['Hạng tổng', 'Đội', 'Host', 'Lượt 1', 'Lượt 2', 'Tổng điểm', 'Thời gian (s)', 'Giải thưởng', 'Xét lần 2',
  'Trường / Trung tâm', 'HLV', 'Học sinh'];
const RANK_KINDS = ['index', 'text-nowrap', 'text-nowrap', 'label', 'label', 'number', 'number', 'text-nowrap', 'label',
  'text-nowrap', 'text-nowrap', 'text-nowrap'];

function selectedRows(s) {
  const out = [];
  for (const r of s.selected) {
    const t = r.team;
    const list = t.students.length ? t.students : [null];
    list.forEach((st, i) => out.push([
      out.length + 1, i === 0 ? r.selectedOrder : '', i === 0 ? r.overallRank : '', i === 0 ? t.name : '',
      i === 0 ? t.competition?.name || '' : '', i === 0 ? t.total.total_score : '', i === 0 ? t.total.total_time : '',
      i === 0 && t.rank ? `Hạng ${t.rank}` : '',
      st?.full_name || '', st && validDob(st.birth_date) ? fmtDate(st.birth_date) : '', st?.phone || '', st?.phone_source || '',
      st?.email || '', st?.email_source || '', i === 0 ? t.school_name || '' : '', i === 0 ? t.coach_name || '' : '',
    ]));
  }
  return out;
}

const rankRows = (s) => s.rows.map((r) => [
  r.overallRank, r.team.name, r.team.competition?.name || '', roundText(r.team, 1), roundText(r.team, 2),
  r.team.total.total_score, r.team.total.total_time,
  r.team.award || (r.awardElsewhere ? `Đã có giải ở host khác: ${r.awardElsewhere.award} (${r.awardElsewhere.competition?.name || ''})` : ''),
  r.selected ? `Được xét (${r.selectedOrder})` : r.foreign && !r.hasAward ? 'Nước ngoài – không xét' : '',
  r.team.school_name || '', r.team.coach_name || '',
  r.team.students.map((st) => st.full_name).join(', '),
]);

// Ghi nhiều khối vào 1 sheet; độ rộng cột = nội dung dài nhất của cột đó
// trên mọi khối (giới hạn 48) — giống "Xuất Excel toàn bộ BXH" ở admin.
function writeBlocks(workbook, name, used, blocks) {
  const ws = workbook.addWorksheet(safeSheetName(name, used), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
  });
  const cols = Math.max(...blocks.map((b) => b.header.length));
  const width = new Array(cols).fill(8);
  for (const b of blocks) {
    b.header.forEach((h, i) => { width[i] = Math.max(width[i], String(h).length + 2); });
    b.rows.forEach((row) => row.forEach((v, i) => { width[i] = Math.max(width[i], Math.min(48, String(v ?? '').length + 2)); }));
  }
  ws.columns = width.map((w) => ({ width: w }));
  let row = 1;
  for (const b of blocks) row = writeStyledBlock(ws, row, b) + 2;
}

export async function exportSecondRoundExcel(sections, filename = 'xet-diem-lan-2.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const used = new Set();
  const sheetName = (s) => `${SHORT_CONTENT[s.contentKey] || s.contentName} - ${s.board}`;

  writeBlocks(workbook, 'Tổng hợp', used, [
    {
      title: 'XÉT ĐIỂM LẦN 2 — TỔNG HỢP',
      subtitle: 'BXH tổng các host thi trực tiếp (không tính Online) · 10% số đội Việt Nam không có giải, làm tròn lên (không xét đội nước ngoài) · mỗi nội dung × bảng xem chi tiết ở sheet riêng',
      header: ['STT', 'Nội dung', 'Bảng', 'Sheet', 'Host', 'Đội có điểm', 'Có giải', 'Có giải ở host khác', 'Không giải', 'Suất 10%', 'Được xét'],
      columnKinds: ['index', 'text-nowrap', 'label', 'text-nowrap', 'text-nowrap', 'number', 'number', 'number', 'number', 'number', 'number'],
      rows: sections.map((s, i) => [i + 1, s.contentName, s.board, sheetName(s), s.hosts.join(', '), s.scoredTeams, s.awardTeams,
        ...(s.combat ? ['', '', 'Chỉ BXH', ''] : [s.awardElsewhereTeams || 0, s.noAwardTeams, s.quota, s.selected.length])]),
    },
    {
      title: 'DANH SÁCH ĐỘI ĐƯỢC XÉT ĐIỂM LẦN 2',
      subtitle: `${sections.reduce((a, s) => a + s.selected.length, 0)} đội`,
      header: ['STT', 'Nội dung', 'Bảng', 'Thứ tự xét', 'Hạng tổng', 'Đội', 'Host', 'Tổng điểm', 'Thời gian (s)', 'Học sinh'],
      columnKinds: ['index', 'text-nowrap', 'label', 'number', 'number', 'text-nowrap', 'text-nowrap', 'number', 'number', 'text-nowrap'],
      rows: sections.flatMap((s) => s.selected.map((r) => [s, r])).map(([s, r], i) => [
        i + 1, s.contentName, s.board, r.selectedOrder, r.overallRank, r.team.name, r.team.competition?.name || '',
        r.team.total.total_score, r.team.total.total_time, r.team.students.map((st) => st.full_name).join(', '),
      ]),
    },
  ]);

  for (const s of sections) {
    if (s.combat) {
      writeBlocks(workbook, sheetName(s), used, [{
        title: `BXH TỔNG — ${s.contentName.toUpperCase()} — ${s.board.toUpperCase()}`,
        subtitle: `${s.scoredTeams} đội đã thi · host: ${s.hosts.join(', ')} · Match Points → Total Score → số trận thắng (đấu vòng tròn trong từng host)`,
        header: COMBAT_HEADER, columnKinds: COMBAT_KINDS, rows: combatRankRows(s),
      }]);
      continue;
    }
    writeBlocks(workbook, sheetName(s), used, [
      {
        title: `${s.contentName.toUpperCase()} — ${s.board.toUpperCase()}: ĐỘI ĐƯỢC XÉT ĐIỂM LẦN 2`,
        subtitle: `${s.selected.length} đội (suất 10% = ${s.quota} / ${s.noAwardTeams} đội không giải${s.tieExtra ? `, +${s.tieExtra} đội bằng điểm` : ''}) · host: ${s.hosts.join(', ')}`,
        header: SELECTED_HEADER, columnKinds: SELECTED_KINDS, rows: selectedRows(s),
      },
      {
        title: `BXH TỔNG — ${s.contentName.toUpperCase()} — ${s.board.toUpperCase()}`,
        subtitle: `${s.scoredTeams} đội có điểm · tổng điểm 2 lượt → thời gian → số lần chạy lại → lượt cao nhất`,
        header: RANK_HEADER, columnKinds: RANK_KINDS, rows: rankRows(s),
      },
    ]);
  }
  await downloadWorkbook(workbook, filename);
}
