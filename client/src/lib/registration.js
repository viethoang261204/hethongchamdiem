// Đọc file "Danh sách đăng ký đội thi EAVN" (nhiều sheet theo host: HN, Đà
// Nẵng, HCM, Asian Open, Online...) → mỗi học sinh 1 dòng gọn gửi lên server
// để khớp với học sinh trong hệ thống (POST /students/registration-import).
//
// File đăng ký KHÔNG có SĐT/email riêng của học sinh (trừ "Email thí sinh" ở
// sheet Online) nên liên hệ lấy theo thứ tự ưu tiên, kèm nguồn:
//   Thí sinh → Phụ huynh (người nộp phí là cha/mẹ) → HLV → Đơn vị (người nộp
//   phí khác: hiệu trưởng, giám đốc...)
// Giới tính chỉ có ở sheet "Danh sách thành viên quốc tế" (cột Sex).
import * as XLSX from 'xlsx';
import { normalizeText } from './lookup';

export const CONTACT_SOURCES = ['Thí sinh', 'Phụ huynh', 'HLV', 'Đơn vị'];

const SKIP_SHEETS = /không thành công|nháp/i;

// Tiêu đề cột trong file có nhiều dòng (VN + EN) — chỉ so dòng đầu, bỏ dấu
const headerKey = (v) => normalizeText(String(v ?? '').split('\n')[0]).replace(/\s+/g, ' ');

function findCol(header, ...tests) {
  for (const t of tests) {
    const i = header.findIndex((h) => (typeof t === 'string' ? h === t : t.test(h)));
    if (i >= 0) return i;
  }
  return -1;
}

const cellText = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v) {
  const s = cellText(v).toLowerCase().replace(/\s/g, '');
  return EMAIL_RE.test(s) ? s : '';
}

// 907971768 (số, mất số 0 đầu) → 0907971768; giữ nguyên dạng +84/84...
function cleanPhone(v) {
  if (v == null || v === '') return '';
  let s = typeof v === 'number' ? String(Math.round(v)) : String(v);
  s = s.split(/[/;,]|\s-\s/)[0].replace(/[^\d+]/g, '');
  if (/^[1-9]\d{8}$/.test(s)) s = `0${s}`;
  return s.replace(/\D/g, '').length >= 9 ? s : '';
}

const pad = (n) => String(n).padStart(2, '0');
function isoDate(y, m, d) {
  if (!(y >= 1990 && y <= 2030 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Ô ngày sinh: số serial Excel, hoặc chữ dd/mm/yyyy, dd-mm-yy, gõ thiếu dấu
// như "31/052014"; ô ghi lớp ("6A1", "Lớp 5") hoặc chỉ ghi năm → bỏ qua
function parseBirth(v) {
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? isoDate(p.y, p.m, p.d) : null;
  }
  const m = cellText(v).match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2})|(\d{4}))$/);
  if (!m) return null;
  const y = m[3] || m[4];
  return isoDate(y.length === 2 ? 2000 + +y : +y, +m[2], +m[1]);
}

function parseGender(v) {
  const s = normalizeText(v);
  if (/^(male|nam|m)$/.test(s)) return 'Nam';
  if (/^(female|nu|f)$/.test(s)) return 'Nữ';
  return '';
}

const PARENT_RE = /^(me|cha|bo|ba|phu huynh)\b|phu huynh/;

// Chọn email + SĐT tốt nhất của 1 dòng theo thứ tự ưu tiên nguồn
function pickContact({ studentEmail, payerRole, payerEmail, payerPhone, coachEmail, coachPhone }) {
  const parent = PARENT_RE.test(normalizeText(payerRole));
  const emails = [
    ['Thí sinh', studentEmail],
    ['Phụ huynh', parent ? payerEmail : ''],
    ['HLV', coachEmail],
    ['Đơn vị', parent ? '' : payerEmail],
  ];
  const phones = [
    ['Phụ huynh', parent ? payerPhone : ''],
    ['HLV', coachPhone],
    ['Đơn vị', parent ? '' : payerPhone],
  ];
  const e = emails.find(([, v]) => v) || [];
  const p = phones.find(([, v]) => v) || [];
  return { email: e[1] || '', email_source: e[0] || '', phone: p[1] || '', phone_source: p[0] || '' };
}

function parseStudentSheet(name, aoa, out) {
  const hi = aoa.slice(0, 6).findIndex((r) => (r || []).some((c) => /^(ho va ten thi sinh|full name)/.test(headerKey(c))));
  if (hi < 0) return 0;
  const header = aoa[hi].map(headerKey);

  // Danh sách thành viên quốc tế: chỉ lấy thí sinh (Role = Contestant) để có giới tính
  const intl = findCol(header, 'sex') >= 0 && findCol(header, 'role') >= 0;
  const c = intl ? {
    name: findCol(header, /^full name/),
    gender: findCol(header, 'sex'),
    role: findCol(header, 'role'),
  } : {
    name: findCol(header, /^ho va ten thi sinh/),
    birth: findCol(header, /^ngay\/thang\/nam sinh/),
    team: findCol(header, 'ten doi thi'),
    teamAlt: findCol(header, 'ten doi thi tren he thong'),
    content: findCol(header, 'noi dung thi dau'),
    coachPhone: findCol(header, /^so dien thoai\s+hlv/),
    coachEmail: findCol(header, 'email huan luyen vien'),
    studentEmail: findCol(header, 'email thi sinh'),
    payerRole: findCol(header, 'chuc vu'),
    payerEmail: findCol(header, 'email'),
    payerPhone: findCol(header, 'so dien thoai'),
  };
  const get = (row, i) => (i >= 0 ? row[i] : null);

  let count = 0;
  let lastTeam = '';
  for (let i = hi + 1; i < aoa.length; i += 1) {
    const row = aoa[i] || [];
    const fullName = cellText(get(row, c.name));
    if (!fullName || /^\d+$/.test(fullName)) continue;
    if (intl) {
      if (!/contestant/i.test(cellText(get(row, c.role)))) continue;
      const gender = parseGender(get(row, c.gender));
      if (gender) { out.push({ sheet: name, row: i + 1, full_name: fullName, gender }); count += 1; }
      continue;
    }
    // Ô tên đội gộp (merge) chỉ có giá trị ở dòng đầu → dùng lại tên đội dòng trên
    const team = cellText(get(row, c.team)) || lastTeam;
    lastTeam = team;
    out.push({
      sheet: name,
      row: i + 1,
      full_name: fullName,
      birth_date: parseBirth(get(row, c.birth)),
      team,
      team_alt: cellText(get(row, c.teamAlt)),
      content: cellText(get(row, c.content)),
      ...pickContact({
        studentEmail: cleanEmail(get(row, c.studentEmail)),
        payerRole: get(row, c.payerRole),
        payerEmail: cleanEmail(get(row, c.payerEmail)),
        payerPhone: cleanPhone(get(row, c.payerPhone)),
        coachEmail: cleanEmail(get(row, c.coachEmail)),
        coachPhone: cleanPhone(get(row, c.coachPhone)),
      }),
    });
    count += 1;
  }
  return count;
}

// workbook: kết quả XLSX.read(...) — trả { rows, sheets: [{ name, count }] }
export function parseRegistrationWorkbook(workbook) {
  const rows = [];
  const sheets = [];
  for (const name of workbook.SheetNames) {
    if (SKIP_SHEETS.test(name)) continue;
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    const count = parseStudentSheet(name, aoa, rows);
    if (count) sheets.push({ name, count });
  }
  return { rows, sheets };
}

export function readRegistrationFile(file) {
  return file.arrayBuffer().then((buf) => parseRegistrationWorkbook(XLSX.read(buf, { type: 'array' })));
}
