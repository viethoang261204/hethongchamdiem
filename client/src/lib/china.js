// Danh sách đội đủ điều kiện đi Trung Quốc (đội có giải thưởng chính thức)
// — dùng chung cho cổng Tra cứu (chỉ xem) và trang admin (sửa/nhập liên hệ).
import { awardOrder } from './outstandingCoach';
import { contentGroup, normalizeText } from './lookup';
import { buildStyledSheet, downloadWorkbook } from './excelReport';

export function prepareChinaRows(rows) {
  return (rows || []).map((r) => {
    const awards = (r.awards || []).slice().sort((a, b) => awardOrder(a) - awardOrder(b));
    return {
      ...r,
      awards,
      awardText: awards.join(' + '),
      contentGroup: contentGroup({ name: r.content_name, name_en: r.content_name_en }),
      hasEmail: !!(r.contact_email || '').trim(),
      hasPhone: !!(r.contact_phone || '').trim(),
    };
  });
}

// f: { q, giai, nhom, loai ('chinh'|'phu'|'rising'), lienHe ('du'|'thieu') }
export function filterChinaRows(rows, f) {
  const q = normalizeText(f.q);
  return rows.filter((r) => {
    if (f.giai && r.competition_id !== f.giai) return false;
    if (f.nhom && r.contentGroup.key !== f.nhom) return false;
    if (f.loai === 'chinh' && !r.has_major) return false;
    if (f.loai === 'phu' && r.has_major) return false;
    if (f.loai === 'rising' && !r.awards.includes('Rising Star')) return false;
    if (f.lienHe === 'du' && !(r.hasEmail && r.hasPhone)) return false;
    if (f.lienHe === 'thieu' && r.hasEmail && r.hasPhone) return false;
    if (!q) return true;
    return [r.name, r.school_name, r.coach_name, r.students, r.contact_email, r.contact_phone]
      .some((v) => normalizeText(v).includes(q));
  });
}

// Cột "Mã đội" giữ nguyên trong file — admin điền Email/SĐT vào chính file
// này rồi "Nhập liên hệ từ Excel" (khớp theo Mã đội).
export const CHINA_IMPORT_COLUMNS = [
  { key: 'team_id', label: 'Mã đội', required: true, example: '(giữ nguyên từ file xuất)' },
  { key: 'contact_email', label: 'Email liên hệ', required: false, example: 'phuhuynh@example.com' },
  { key: 'contact_phone', label: 'SĐT liên hệ', required: false, example: '0900000000' },
];

export async function exportChinaExcel(rows, filename = 'doi-du-dieu-kien-di-trung-quoc.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  buildStyledSheet(workbook, 'Đi Trung Quốc', {
    title: 'DANH SÁCH ĐỘI ĐỦ ĐIỀU KIỆN ĐI TRUNG QUỐC',
    subtitle: `${rows.length} đội có giải thưởng chính thức — điền Email/SĐT rồi nhập lại hệ thống (giữ nguyên cột Mã đội)`,
    header: ['STT', 'Giải đấu', 'Nội dung', 'Bảng', 'Đội', 'Học sinh', 'Trường / Trung tâm', 'HLV', 'Giải thưởng', 'Email liên hệ', 'SĐT liên hệ', 'Mã đội'],
    columnKinds: ['index', 'text', 'text', 'label', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text-nowrap'],
    columnWidths: [6, 24, 26, 10, 26, 34, 28, 22, 22, 28, 16, 38],
    rows: rows.map((r, i) => [
      i + 1, r.competition_name, r.content_name, r.board_name || '', r.name, r.students || '', r.school_name || '',
      r.coach_name || '', r.awardText, r.contact_email || '', r.contact_phone || '', r.id,
    ]),
  });
  await downloadWorkbook(workbook, filename);
}
