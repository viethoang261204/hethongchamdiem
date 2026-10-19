// Danh sách đội đủ điều kiện đi Trung Quốc (đội có giải thưởng chính thức)
// — dùng chung cho cổng Tra cứu (chỉ xem) và trang admin (sửa/nhập thông tin
// học sinh). Mỗi học sinh cần: họ tên, ngày sinh, giới tính, SĐT, email.
import { awardOrder } from './outstandingCoach';
import { contentGroup, normalizeText } from './lookup';
import { buildStyledSheet, downloadWorkbook } from './excelReport';

export const GENDERS = ['Nam', 'Nữ'];

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

export function normalizeGender(s) {
  const v = normalizeText(s);
  if (/^(nam|male|m)$/.test(v)) return 'Nam';
  if (/^(nu|female|f)$/.test(v)) return 'Nữ';
  return '';
}

export const studentMissing = (s) => [
  !s.birth_date && 'ngày sinh',
  !s.gender && 'giới tính',
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

export function chinaStats(rows) {
  const seen = new Map();
  rows.forEach((r) => r.students.forEach((s) => seen.set(s.id, s)));
  const all = [...seen.values()];
  return {
    teams: rows.length,
    students: all.length,
    complete: all.filter((s) => !s.missing.length).length,
    noGender: all.filter((s) => !s.gender).length,
    noPhone: all.filter((s) => !s.phone).length,
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

// File xuất: mỗi học sinh 1 dòng. Cột "Mã HS" giữ nguyên — admin điền các ô
// còn trống vào chính file này rồi "Nhập từ Excel đã xuất" (khớp theo Mã HS).
export const CHINA_IMPORT_COLUMNS = [
  { key: 'student_id', label: 'Mã HS', required: true, example: '(giữ nguyên từ file xuất)' },
  { key: 'birth_date', label: 'Ngày sinh', required: false, example: '25/12/2014' },
  { key: 'gender', label: 'Giới tính', required: false, example: 'Nam' },
  { key: 'phone', label: 'SĐT', required: false, example: '0900000000' },
  { key: 'email', label: 'Email', required: false, example: 'phuhuynh@example.com' },
];

export async function exportChinaExcel(rows, filename = 'hoc-sinh-doi-di-trung-quoc.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const lines = rows.flatMap((r) => r.students.map((s) => [r, s]));
  buildStyledSheet(workbook, 'Đi Trung Quốc', {
    title: 'DANH SÁCH HỌC SINH CÁC ĐỘI ĐẠT GIẢI ĐI TRUNG QUỐC',
    subtitle: `${rows.length} đội · ${lines.length} học sinh — "Nguồn" cho biết SĐT/email là của thí sinh, phụ huynh, HLV hay đơn vị. Điền ô trống rồi nhập lại hệ thống (giữ nguyên cột Mã HS).`,
    header: ['STT', 'Họ và tên', 'Ngày sinh', 'Giới tính', 'SĐT', 'Nguồn SĐT', 'Email', 'Nguồn email',
      'Đội', 'Giải thưởng', 'Giải đấu', 'Nội dung', 'Bảng', 'Trường / Trung tâm', 'HLV', 'Mã HS'],
    columnKinds: ['index', 'text', 'label', 'label', 'text-nowrap', 'label', 'text', 'label',
      'text', 'text', 'text', 'text', 'label', 'text', 'text', 'text-nowrap'],
    columnWidths: [6, 26, 12, 9, 14, 11, 30, 11, 24, 20, 24, 24, 10, 28, 22, 38],
    rows: lines.map(([r, s], i) => [
      i + 1, s.full_name, fmtDate(s.birth_date), s.gender || '', s.phone || '', s.phone_source || '',
      s.email || '', s.email_source || '', r.name, r.awardText, r.competition_name, r.content_name,
      r.board_name || '', r.school_name || '', r.coach_name || '', s.id,
    ]),
  });
  await downloadWorkbook(workbook, filename);
}
