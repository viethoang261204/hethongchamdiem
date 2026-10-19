// Danh sách đội đủ điều kiện đi Trung Quốc (đội có giải thưởng chính thức)
// — dùng chung cho cổng Tra cứu (chỉ xem) và trang admin (sửa/nhập thông tin
// học sinh). Mỗi học sinh cần: họ tên, ngày sinh, SĐT, email.
//
// 1 em có thể thi nhiều giải (HN, Asian Open, Online...) và mỗi giải lại có
// 1 bản ghi học sinh riêng → buildPeople() gộp về 1 người (xem quy tắc ở đó).
import { awardOrder } from './outstandingCoach';
import { contentGroup, normalizeText } from './lookup';
import { buildStyledSheet, downloadWorkbook } from './excelReport';

// 'YYYY-MM-DD' → 'dd/mm/yyyy'
export function fmtDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// 'dd/mm/yyyy' | 'd-m-yyyy' | 'YYYY-MM-DD' → 'YYYY-MM-DD' ('' nếu không hợp lệ)
export function parseDateInput(s) {
  const v = String(s || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

// Ngày sinh thật của thí sinh (≤ THPT) — loại ngày giả kiểu 01/01/2000 mà
// 1 số file nhập điền tạm cho đủ cột
export const validDob = (d) => /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) && String(d) >= '2005-01-01';

export const studentMissing = (s) => [
  !validDob(s.birth_date) && 'ngày sinh',
  !s.phone && 'SĐT',
  !s.email && 'email',
].filter(Boolean);

export function prepareChinaRows(rows) {
  return (rows || []).map((r) => {
    const awards = (r.awards || []).slice().sort((a, b) => awardOrder(a) - awardOrder(b));
    const students = (r.students || []).map((s) => ({ ...s, missing: studentMissing(s) }));
    return {
      ...r,
      awards,
      students,
      awardText: awards.join(' + '),
      studentNames: students.map((s) => s.full_name).join(', '),
      contentGroup: contentGroup({ name: r.content_name, name_en: r.content_name_en }),
      complete: students.length > 0 && students.every((s) => !s.missing.length),
    };
  });
}

const SOURCE_RANK = { Admin: 0, 'Thí sinh': 1, 'Phụ huynh': 2, HLV: 3, 'Đơn vị': 4 };
const rankOf = (src) => SOURCE_RANK[src] ?? 9;
const nameKey = (v) => normalizeText(v).replace(/[^a-z0-9]+/g, ' ').trim();
const linkKeys = (teams) => new Set(teams.flatMap((t) => [
  t.coach_name && `hlv:${nameKey(t.coach_name)}`,
  t.school_name && `truong:${nameKey(t.school_name)}`,
]).filter(Boolean));

// 2015-07-09 ↔ 2015-09-07: file đăng ký các host hay gõ lẫn ngày/tháng
function swapDayMonth(iso) {
  const [y, m, d] = iso.split('-');
  return +d <= 12 ? `${y}-${d}-${m}` : null;
}

// Lọc trùng học sinh giữa các đội / các giải. Cùng 1 người khi cùng họ tên
// (bỏ dấu) VÀ:
//   - cùng ngày sinh (ngày sinh thật, kể cả bị gõ đảo ngày ↔ tháng), hoặc
//   - 1 bên chưa có ngày sinh (hoặc ngày giả) nhưng cùng HLV hoặc cùng
//     trường / trung tâm — trùng tên mà khác ngày sinh, hoặc không có gì
//     chung thì coi là 2 em khác nhau (VD 2 em "Nguyễn Anh Minh" 2016/2018).
// Trả mỗi người: { key, ids, full_name, birth_date, phone, email (+ nguồn),
//   entries: [đội đạt giải của em đó], missing }
export function buildPeople(teamRows) {
  const byId = new Map();
  for (const r of teamRows) {
    for (const s of r.students) {
      if (!byId.has(s.id)) byId.set(s.id, { s, teams: [] });
      byId.get(s.id).teams.push(r);
    }
  }
  const byName = new Map();
  for (const rec of byId.values()) {
    const k = nameKey(rec.s.full_name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(rec);
  }

  const people = [];
  for (const recs of byName.values()) {
    // Bản ghi có ngày sinh thật xử lý trước để làm "neo" cho bản ghi thiếu
    recs.sort((a, b) => Number(validDob(b.s.birth_date)) - Number(validDob(a.s.birth_date)));
    const groups = [];
    for (const rec of recs) {
      const dob = validDob(rec.s.birth_date) ? rec.s.birth_date : null;
      const links = linkKeys(rec.teams);
      const shares = (g) => [...links].some((k) => g.links.has(k));
      let target = dob ? groups.find((g) => g.dob === dob || g.dob === swapDayMonth(dob)) : null;
      if (!target) {
        const cands = groups.filter((g) => (!dob || !g.dob) && shares(g));
        if (cands.length === 1) [target] = cands;
      }
      if (!target) { target = { dob, recs: [], links: new Set() }; groups.push(target); }
      target.recs.push(rec);
      if (dob && !target.dob) target.dob = dob;
      links.forEach((k) => target.links.add(k));
    }
    groups.forEach((g) => people.push(makePerson(g)));
  }
  return people.sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
}

function makePerson(g) {
  const students = g.recs.map((r) => r.s);
  const best = (field) => students
    .filter((s) => s[field])
    .sort((a, b) => rankOf(a[`${field}_source`]) - rankOf(b[`${field}_source`]))[0];
  const phone = best('phone');
  const email = best('email');
  const entries = [...new Map(g.recs.flatMap((r) => r.teams).map((t) => [t.id, t])).values()];
  const person = {
    key: students.map((s) => s.id).sort().join('|'),
    ids: students.map((s) => s.id),
    full_name: students[0].full_name,
    birth_date: g.dob || '',
    phone: phone?.phone || '', phone_source: phone?.phone_source || '',
    email: email?.email || '', email_source: email?.email_source || '',
    entries,
    competitions: [...new Set(entries.map((t) => t.competition_name))],
    schools: [...new Set(entries.map((t) => t.school_name).filter(Boolean))],
    coaches: [...new Set(entries.map((t) => t.coach_name).filter(Boolean))],
  };
  person.missing = studentMissing(person);
  return person;
}

// f.q / f.thongTin lọc theo NGƯỜI (các bộ lọc giải / nội dung / loại giải đã
// lọc ở cấp đội trước khi gộp)
export function filterPeople(people, f) {
  const q = normalizeText(f.q);
  return people.filter((p) => {
    if (f.thongTin === 'du' && p.missing.length) return false;
    if (f.thongTin === 'thieu' && !p.missing.length) return false;
    if (!q) return true;
    return [p.full_name, p.phone, p.email, ...p.schools, ...p.coaches, ...p.entries.map((t) => t.name)]
      .some((v) => normalizeText(v).includes(q));
  });
}

export function chinaStats(rows) {
  const people = buildPeople(rows);
  return {
    teams: rows.length,
    records: new Set(rows.flatMap((r) => r.students.map((s) => s.id))).size,
    students: people.length,
    complete: people.filter((p) => !p.missing.length).length,
    noPhone: people.filter((p) => !p.phone).length,
    multi: people.filter((p) => p.entries.length > 1).length,
  };
}

// f: { q, giai, nhom, loai ('chinh'|'phu'|'rising'), thongTin ('du'|'thieu') }
export function filterChinaRows(rows, f) {
  const q = normalizeText(f.q);
  return rows.filter((r) => {
    if (f.giai && r.competition_id !== f.giai) return false;
    if (f.nhom && r.contentGroup.key !== f.nhom) return false;
    if (f.loai === 'chinh' && !r.has_major) return false;
    if (f.loai === 'phu' && r.has_major) return false;
    if (f.loai === 'rising' && !r.awards.includes('Rising Star')) return false;
    if (f.thongTin === 'du' && !r.complete) return false;
    if (f.thongTin === 'thieu' && r.complete) return false;
    if (!q) return true;
    return [r.name, r.school_name, r.coach_name, ...r.students.flatMap((s) => [s.full_name, s.email, s.phone])]
      .some((v) => normalizeText(v).includes(q));
  });
}

export const entryText = (t) => `${t.competition_name} · ${t.content_name}${t.board_name ? ` (${t.board_name})` : ''} · đội ${t.name}: ${t.awardText}`;

// File xuất: mỗi HỌC SINH (đã lọc trùng) 1 dòng, các đội / giải em đạt gộp
// chung 1 ô. Cột "Mã HS" = mọi bản ghi của em đó (cách nhau dấu phẩy) — admin
// điền ô trống rồi "Nhập từ Excel đã xuất", hệ thống ghi cho mọi bản ghi.
export const CHINA_IMPORT_COLUMNS = [
  { key: 'student_id', label: 'Mã HS', required: true, example: '(giữ nguyên từ file xuất)' },
  { key: 'birth_date', label: 'Ngày sinh', required: false, example: '25/12/2014' },
  { key: 'phone', label: 'SĐT', required: false, example: '0900000000' },
  { key: 'email', label: 'Email', required: false, example: 'phuhuynh@example.com' },
];

// Dòng nhập từ file xuất → mỗi Mã HS 1 dòng gửi server
export const expandImportRows = (list) => list.flatMap((r) => String(r.student_id || '')
  .split(/[,;\s]+/).filter(Boolean)
  .map((id) => ({ ...r, student_id: id, birth_date: parseDateInput(r.birth_date) })));

export async function exportChinaExcel(rows, filename = 'hoc-sinh-di-trung-quoc.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const people = buildPeople(rows);
  buildStyledSheet(workbook, 'Đi Trung Quốc', {
    title: 'DANH SÁCH HỌC SINH ĐẠT GIẢI ĐI TRUNG QUỐC',
    subtitle: `${people.length} học sinh (đã lọc trùng em thi nhiều giải) · ${rows.length} đội — "Nguồn" cho biết SĐT/email là của thí sinh, phụ huynh, HLV hay đơn vị. Điền ô trống rồi nhập lại hệ thống (giữ nguyên cột Mã HS).`,
    header: ['STT', 'Họ và tên', 'Ngày sinh', 'SĐT', 'Nguồn SĐT', 'Email', 'Nguồn email',
      'Số giải đạt', 'Đội / giải thưởng', 'Trường / Trung tâm', 'HLV', 'Mã HS'],
    columnKinds: ['index', 'text', 'label', 'text-nowrap', 'label', 'text', 'label',
      'number', 'text', 'text', 'text', 'text-nowrap'],
    columnWidths: [6, 26, 12, 14, 11, 30, 11, 9, 60, 30, 24, 40],
    rows: people.map((p, i) => [
      i + 1, p.full_name, fmtDate(p.birth_date), p.phone, p.phone_source, p.email, p.email_source,
      p.entries.length, p.entries.map(entryText).join('\n'), p.schools.join(', '), p.coaches.join(', '),
      p.ids.join(', '),
    ]),
  });
  await downloadWorkbook(workbook, filename);
}
