// Báo cáo đi Trung Quốc — trạng thái của MỌI đội đã đăng ký (mọi giải, kể cả
// Online) so với tổng số đội đăng ký:
//   - Đi lần 1: đội có giải thưởng chính thức (team_awards) — chia giải chính
//     (Nhất / Nhì / Ba, Rising Star...) và giải phụ (Top 5 / Top 10...)
//   - Đi lần 2: đội được chọn ở "Xét điểm lần 2" (lib/secondRound.js)
//   - Không giải: còn lại — ghi chú nếu đã có giải ở host khác / chưa thi
import { buildSecondRound } from './secondRound';
import { contentGroup } from './lookup';
import { buildStyledSheet, downloadWorkbook, safeSheetName, writeStyledBlock } from './excelReport';

export const STATUS = {
  lan1: { label: 'Đi lần 1', order: 0 },
  lan2: { label: 'Đi lần 2', order: 1 },
  none: { label: 'Không giải', order: 2 },
};

const resultText = (t) => {
  if (t.isCombat) return t.combat?.played ? `${t.combat.matchPoints} MP · ${t.combat.totalScore} TS` : '';
  return t.total ? `${t.total.total_score} đ · ${t.total.total_time}s` : '';
};

export function buildChinaReport(lookup) {
  if (!lookup) return { rows: [], byComp: [], byContent: [], totals: null };
  const second = buildSecondRound(lookup);
  const secondById = new Map();
  const elsewhereById = new Map();
  for (const s of second.sections) {
    for (const r of s.rows) {
      if (r.selected) secondById.set(r.team.id, { section: s, row: r });
      if (r.awardElsewhere) elsewhereById.set(r.team.id, r.awardElsewhere);
    }
  }

  const rows = lookup.teams.map((t) => {
    const g = contentGroup(t.content);
    const played = t.isCombat ? (t.combat?.played || 0) > 0 : !!t.total || !!t.rank;
    const base = {
      team: t, competition: t.competition, contentKey: g.key, contentName: g.name, board: t.boardName || '',
      played, result: resultText(t), hostRank: t.rank || null,
    };
    if (t.awards.length) {
      const major = t.awards.some((a) => a.tier === 'major');
      return { ...base, status: 'lan1', tier: major ? 'chinh' : 'phu', award: t.award, note: major ? 'Giải chính' : 'Giải phụ' };
    }
    const sel = secondById.get(t.id);
    if (sel) {
      return {
        ...base, status: 'lan2', tier: '', award: 'Xét điểm lần 2',
        note: `Hạng tổng ${sel.row.overallRank}/${sel.section.scoredTeams} · ${sel.section.contentName} ${sel.section.board} · xét ${sel.row.selectedOrder}/${sel.section.selected.length}`,
      };
    }
    const twin = elsewhereById.get(t.id);
    return {
      ...base, status: 'none', tier: '', award: '',
      note: twin ? `Đã có giải ở host khác: ${twin.award} (${twin.competition?.name || ''})` : played ? '' : 'Chưa thi / chưa có điểm',
    };
  }).sort((a, b) => STATUS[a.status].order - STATUS[b.status].order
    || String(a.competition?.name).localeCompare(String(b.competition?.name), 'vi')
    || a.contentName.localeCompare(b.contentName, 'vi') || a.board.localeCompare(b.board, 'vi')
    || a.team.name.localeCompare(b.team.name, 'vi'));

  const tally = (list) => {
    const n = (f) => list.filter(f).length;
    const lan1 = n((r) => r.status === 'lan1');
    const lan2 = n((r) => r.status === 'lan2');
    return {
      registered: list.length,
      played: n((r) => r.played),
      lan1, major: n((r) => r.tier === 'chinh'), minor: n((r) => r.tier === 'phu'),
      lan2, going: lan1 + lan2, none: list.length - lan1 - lan2,
      students: new Set(list.filter((r) => r.status !== 'none').flatMap((r) => r.team.student_ids || [])).size,
    };
  };
  const groupBy = (keyFn, nameFn) => {
    const m = new Map();
    rows.forEach((r) => { const k = keyFn(r); if (!m.has(k)) m.set(k, { key: k, name: nameFn(r), rows: [] }); m.get(k).rows.push(r); });
    return [...m.values()].map((x) => ({ ...x, ...tally(x.rows) }));
  };
  const compOrder = new Map(lookup.competitions.map((c, i) => [c.id, i]));
  return {
    rows,
    byComp: groupBy((r) => r.competition?.id || '', (r) => r.competition?.name || '—')
      .sort((a, b) => (compOrder.get(a.key) ?? 99) - (compOrder.get(b.key) ?? 99)),
    byContent: groupBy((r) => r.contentKey, (r) => r.contentName).sort((a, b) => b.registered - a.registered),
    totals: tally(rows),
  };
}

export const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

// Excel: sheet "Tổng hợp" (theo giải + theo nội dung) rồi mỗi giải 1 sheet
// danh sách đội (đi lần 1 → đi lần 2 → không giải)
export async function exportChinaReportExcel(report, filename = 'bao-cao-di-trung-quoc.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const used = new Set();
  const SUM_HEADER = ['STT', 'Tên', 'Đội đăng ký', 'Đã thi', 'Đi lần 1', '— giải chính', '— giải phụ', 'Đi lần 2', 'Tổng được đi', 'Tỷ lệ / đăng ký', 'Không giải', 'Học sinh được đi'];
  const SUM_KINDS = ['index', 'text', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'label', 'number', 'number'];
  const sumRow = (x, i) => [i + 1, x.name, x.registered, x.played, x.lan1, x.major, x.minor, x.lan2, x.going, pct(x.going, x.registered), x.none, x.students];
  const t = report.totals;
  const ws = workbook.addWorksheet(safeSheetName('Tổng hợp', used), { views: [{ showGridLines: false }] });
  ws.columns = [6, 34, 12, 10, 10, 12, 12, 10, 12, 14, 11, 14].map((w) => ({ width: w }));
  let row = writeStyledBlock(ws, 1, {
    title: 'BÁO CÁO SỐ ĐỘI ĐƯỢC ĐI TRUNG QUỐC — THEO GIẢI',
    subtitle: `Tổng: ${t.going}/${t.registered} đội đăng ký được đi (${pct(t.going, t.registered)}) — lần 1: ${t.lan1} (giải chính ${t.major}, giải phụ ${t.minor}) · lần 2: ${t.lan2}`,
    header: SUM_HEADER, columnKinds: SUM_KINDS,
    rows: [...report.byComp.map(sumRow), ['', 'TỔNG CỘNG', t.registered, t.played, t.lan1, t.major, t.minor, t.lan2, t.going, pct(t.going, t.registered), t.none, t.students]],
  }) + 2;
  writeStyledBlock(ws, row, {
    title: 'THEO NỘI DUNG THI (GỘP CÁC GIẢI)',
    subtitle: 'Đi lần 2 chỉ áp dụng cho các nội dung chấm điểm ở các host thi trực tiếp',
    header: SUM_HEADER, columnKinds: SUM_KINDS, rows: report.byContent.map(sumRow),
  });

  for (const c of report.byComp) {
    buildStyledSheet(workbook, safeSheetName(c.name.replace(/^Enjoy AI /i, ''), used), {
      title: `${c.name.toUpperCase()} — DANH SÁCH ĐỘI`,
      subtitle: `${c.going}/${c.registered} đội được đi (${pct(c.going, c.registered)}) — lần 1: ${c.lan1} · lần 2: ${c.lan2} · không giải: ${c.none}`,
      header: ['STT', 'Trạng thái', 'Giải thưởng', 'Ghi chú', 'Đội', 'Nội dung', 'Bảng', 'Kết quả', 'Hạng tại host', 'Trường / Trung tâm', 'HLV', 'Học sinh'],
      columnKinds: ['index', 'label', 'text', 'text', 'text', 'text', 'label', 'label', 'label', 'text', 'text', 'text'],
      columnWidths: [6, 12, 22, 34, 24, 26, 9, 16, 10, 28, 22, 40],
      rows: c.rows.map((r, i) => [i + 1, STATUS[r.status].label, r.award, r.note, r.team.name, r.contentName, r.board, r.result,
        r.hostRank ? `Hạng ${r.hostRank}` : '', r.team.school_name || '', r.team.coach_name || '', r.team.students.map((s) => s.full_name).join(', ')]),
    });
  }
  await downloadWorkbook(workbook, filename);
}
