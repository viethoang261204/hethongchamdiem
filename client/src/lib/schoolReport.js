// Báo cáo riêng cho 1 trường / trung tâm — file Excel theo mẫu cố định để gửi
// thẳng cho trường: đầu trang (BTC, ngày xuất, tiêu đề, tên trường) →
// I. Tổng quan → II. Theo giải đấu → III. Chi tiết đội thi → IV. Học sinh được
// đi Trung Quốc → Ghi chú. Bảng màu theo mẫu bao-cao-mau.xlsx (navy / xanh
// ngọc) như mọi báo cáo khác. Dữ liệu: 1 phần tử bySchool của buildChinaReport.
// Báo cáo gửi trường CHỈ ghi "Được đi / Không" — không tách đi lần 1 / lần 2,
// giải chính / giải phụ (đội xét điểm lần 2 tính chung là được đi).
import { downloadBlob } from './excelReport';
import { fmtDate, validDob } from './china';

const NAVY = 'FF1F3864';
const TEAL = 'FF0F7A82';
const WHITE = 'FFFFFFFF';
const LIGHT = 'FFEEF2F8';
const GREEN_BG = 'FFE3F5EC';
export const goingLabel = (r) => (r.status !== 'none' ? 'Được đi' : 'Không');
export const awardLabel = (r) => (r.status === 'lan1' ? r.award : '');
const BORDER = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BOX = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const FONT = 'Arial';
const COLS = 11; // mọi khối dùng chung 11 cột A..K
const WIDTHS = [6, 26, 24, 26, 10, 24, 15, 12, 24, 14, 34];

export const ORGANIZER = 'BAN TỔ CHỨC CUỘC THI ENJOY AI VIỆT NAM 2026';

// Tỷ lệ lưu dạng SỐ (định dạng 0.0%) — không để Excel cảnh báo "số lưu dạng chữ"
const ratio = (a, b) => (b ? a / b : null);
const PCT_FMT = '0.0%';

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const schoolReportFilename = (name) => `Bao cao - ${String(name).replace(/[\\/:*?"<>|]+/g, '-').trim()}.xlsx`;

function mergedRow(ws, row, text, style, height) {
  ws.mergeCells(row, 1, row, COLS);
  const c = ws.getCell(row, 1);
  c.value = text;
  Object.assign(c, style);
  if (height) ws.getRow(row).height = height;
}

function sectionTitle(ws, row, text) {
  mergedRow(ws, row, text, {
    font: { name: FONT, size: 12, bold: true, color: { argb: NAVY } },
    alignment: { vertical: 'middle' },
    border: { bottom: { style: 'medium', color: { argb: NAVY } } },
  }, 22);
  return row + 1;
}

// Bảng: header nền navy; `spans` = số cột mỗi ô chiếm (gộp ngang) để bảng ít
// cột vẫn trải đủ chiều rộng trang; `fill(rowIdx)` tô nền theo dòng
function table(ws, row, { header, rows, spans, align, fill, numFmt }) {
  const sp = spans || header.map(() => 1);
  const startCols = sp.reduce((acc, n, i) => [...acc, i ? acc[i - 1] + sp[i - 1] : 1], []);
  const put = (r, values, style) => {
    values.forEach((v, i) => {
      const from = startCols[i];
      const to = from + sp[i] - 1;
      if (to > from) ws.mergeCells(r, from, r, to);
      const c = ws.getCell(r, from);
      c.value = v === '' || v === undefined ? null : v;
      Object.assign(c, style(i));
      for (let k = from; k <= to; k++) ws.getCell(r, k).border = BOX;
    });
  };
  put(row, header, () => ({
    font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  }));
  ws.getRow(row).height = 30;
  rows.forEach((values, idx) => {
    const r = row + 1 + idx;
    const bg = fill?.(idx);
    put(r, values, (i) => ({
      font: { name: FONT, size: 10, bold: !!values.__bold },
      alignment: { horizontal: align?.[i] || 'left', vertical: 'middle', wrapText: true },
      ...(bg ? { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } } } : {}),
      ...(numFmt?.[i] ? { numFmt: numFmt[i] } : {}),
    }));
  });
  return row + 1 + rows.length;
}

const tally = (rows) => {
  const going = rows.filter((r) => r.status !== 'none').length;
  return { registered: rows.length, going, none: rows.length - going };
};

export function buildSchoolWorkbook(ExcelJS, school) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ENJOY AI Việt Nam';
  const ws = wb.addWorksheet('Báo cáo', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: `&L${school.name}&RTrang &P / &N` },
  });
  ws.columns = WIDTHS.map((width) => ({ width }));

  // ---- Đầu trang
  ws.mergeCells(1, 1, 1, 6);
  Object.assign(ws.getCell(1, 1), { value: ORGANIZER, font: { name: FONT, size: 10, bold: true, color: { argb: NAVY } } });
  ws.mergeCells(1, 7, 1, COLS);
  Object.assign(ws.getCell(1, 7), {
    value: `Ngày xuất báo cáo: ${today()}`,
    font: { name: FONT, size: 10, italic: true }, alignment: { horizontal: 'right' },
  });
  mergedRow(ws, 3, 'BÁO CÁO KẾT QUẢ THI ĐẤU VÀ DANH SÁCH ĐI TRUNG QUỐC', {
    font: { name: FONT, size: 16, bold: true, color: { argb: WHITE } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  }, 32);
  mergedRow(ws, 4, `Trường / Trung tâm: ${school.name}`, {
    font: { name: FONT, size: 13, bold: true, color: { argb: TEAL } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  }, 24);
  const comps = [...new Map(school.rows.map((r) => [r.competition?.id, r.competition?.name])).values()].filter(Boolean);
  const coaches = [...new Set(school.rows.map((r) => r.team.coach_name).filter(Boolean))];
  mergedRow(ws, 5, `Giải đấu tham gia: ${comps.join(', ')}${coaches.length ? `   ·   Huấn luyện viên: ${coaches.join(', ')}` : ''}`, {
    font: { name: FONT, size: 10, italic: true, color: { argb: TEAL } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  }, 30);

  // ---- I. Tổng quan
  let row = sectionTitle(ws, 7, 'I. TỔNG QUAN');
  row = table(ws, row, {
    header: ['Đội đăng ký', 'Đã thi', 'Được đi Trung Quốc', 'Tỷ lệ được đi', 'Không được đi', 'Học sinh được đi'],
    spans: [2, 1, 2, 2, 2, 2],
    align: Array(6).fill('center'),
    numFmt: { 3: PCT_FMT },
    rows: [Object.assign([school.registered, school.played, school.going, ratio(school.going, school.registered), school.none, school.students], { __bold: true })],
  });

  // ---- II. Theo giải đấu
  row = sectionTitle(ws, row + 1, 'II. THEO GIẢI ĐẤU');
  const byComp = comps.map((name) => ({ name, ...tally(school.rows.filter((r) => r.competition?.name === name)) }));
  row = table(ws, row, {
    header: ['STT', 'Giải đấu', 'Đội đăng ký', 'Được đi Trung Quốc', 'Tỷ lệ được đi', 'Không được đi'],
    spans: [1, 3, 2, 2, 2, 1],
    align: ['center', 'left', 'center', 'center', 'center', 'center'],
    numFmt: { 4: PCT_FMT },
    rows: [
      ...byComp.map((c, i) => [i + 1, c.name, c.registered, c.going, ratio(c.going, c.registered), c.none]),
      Object.assign(['', 'Tổng cộng', school.registered, school.going, ratio(school.going, school.registered), school.none], { __bold: true }),
    ],
    fill: (i) => (i === byComp.length ? LIGHT : null),
  });

  // ---- III. Chi tiết đội thi
  row = sectionTitle(ws, row + 1, 'III. CHI TIẾT ĐỘI THI');
  row = table(ws, row, {
    header: ['STT', 'Tên đội', 'Giải đấu', 'Nội dung thi', 'Bảng', 'Huấn luyện viên', 'Kết quả', 'Hạng tại giải', 'Giải thưởng', 'Đi Trung Quốc'],
    spans: [1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
    align: ['center', 'left', 'left', 'left', 'center', 'left', 'center', 'center', 'left', 'center'],
    rows: school.rows.map((r, i) => [i + 1, r.team.name, r.competition?.name || '', r.contentName, r.board, r.team.coach_name || '',
      r.result, r.hostRank ? `Hạng ${r.hostRank}` : '', awardLabel(r), goingLabel(r)]),
    fill: (i) => (school.rows[i].status !== 'none' ? GREEN_BG : null),
  });

  // ---- IV. Học sinh được đi Trung Quốc
  row = sectionTitle(ws, row + 1, 'IV. DANH SÁCH HỌC SINH ĐƯỢC ĐI TRUNG QUỐC');
  const going = school.rows.filter((r) => r.status !== 'none');
  const studentRows = going.flatMap((r) => (r.team.students.length ? r.team.students : [null]).map((st) => [
    st?.full_name || '(chưa có tên học sinh)', st && validDob(st.birth_date) ? fmtDate(st.birth_date) : '', r.team.name,
    r.competition?.name || '', r.contentName, r.board, awardLabel(r),
  ]));
  row = table(ws, row, {
    header: ['STT', 'Họ và tên học sinh', 'Ngày sinh', 'Tên đội', 'Giải đấu', 'Nội dung thi', 'Bảng', 'Giải thưởng'],
    spans: [1, 1, 1, 1, 2, 2, 1, 2],
    align: ['center', 'left', 'center', 'left', 'left', 'left', 'center', 'left'],
    rows: studentRows.length ? studentRows.map((x, i) => [i + 1, ...x]) : [['', 'Chưa có học sinh được đi', '', '', '', '', '', '']],
  });

  // ---- Ghi chú
  row += 1;
  const notes = [
    'Ghi chú:',
    '• Được đi Trung Quốc: đội có tên trong danh sách được Ban tổ chức công bố.',
    '• Tỷ lệ được đi = Số đội được đi / Số đội đăng ký.',
  ];
  notes.forEach((t, i) => mergedRow(ws, row + i, t, { font: { name: FONT, size: 9, italic: i > 0, bold: i === 0 }, alignment: { wrapText: true, vertical: 'middle' } }));
  return wb;
}

export async function downloadSchoolReport(school) {
  const { default: ExcelJS } = await import('exceljs');
  const buf = await buildSchoolWorkbook(ExcelJS, school).xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), schoolReportFilename(school.name));
}

// Mỗi trường 1 file riêng, gộp trong 1 .zip
export async function downloadSchoolReportsZip(schools, onProgress) {
  const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([import('exceljs'), import('jszip')]);
  const zip = new JSZip();
  const used = new Set();
  for (let i = 0; i < schools.length; i++) {
    onProgress?.(i + 1, schools.length);
    let name = schoolReportFilename(schools[i].name);
    while (used.has(name)) name = name.replace(/\.xlsx$/, ' (2).xlsx');
    used.add(name);
    zip.file(name, await buildSchoolWorkbook(ExcelJS, schools[i]).xlsx.writeBuffer());
  }
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'Bao cao theo truong - ENJOY AI 2026.zip');
}
