// Helpers dùng chung để xuất các báo cáo Excel có style (bảng điểm, bảng xếp
// hạng...) — dựng bằng `exceljs` (KHÔNG phải `xlsx`/SheetJS bản miễn phí,
// thư viện đó không ghi được style khi xuất file, đã kiểm chứng thực tế).
// Bảng màu/kiểu chữ lấy nguyên từ file mẫu báo cáo (bao-cao-mau.xlsx) người
// dùng cung cấp: tiêu đề nền xanh navy chữ trắng đậm, dòng phụ đề chữ xanh
// ngọc nghiêng, dòng tiêu đề cột nền navy chữ trắng đậm, dữ liệu viền xám
// mảnh, đóng băng 4 dòng đầu, ẩn đường kẻ lưới.

const REPORT_NAVY = 'FF1F3864';
const REPORT_TEAL = 'FF0F7A82';
const REPORT_WHITE = 'FFFFFFFF';
const REPORT_BORDER_GRAY = 'FFBFBFBF';
const REPORT_THIN_BORDER = { style: 'thin', color: { argb: REPORT_BORDER_GRAY } };
const REPORT_CELL_BORDER = { top: REPORT_THIN_BORDER, bottom: REPORT_THIN_BORDER, left: REPORT_THIN_BORDER, right: REPORT_THIN_BORDER };

// "Top N" cho cột Thứ hạng — để trống (không phải "Top null") khi đội chưa
// có hạng (chưa gán Bảng đấu, hoặc nhánh đấu loại trực tiếp chưa đấu xong).
export function formatRankLabel(rank) {
  return rank ? `Top ${rank}` : '';
}

// Tên sheet Excel tối đa 31 ký tự, không chứa \ / * ? : [ ], và không trùng
// nhau trong cùng 1 workbook — tên nội dung/bảng đấu có thể vi phạm cả 3.
export function safeSheetName(name, used) {
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

// Dựng 1 sheet theo đúng bố cục mẫu: dòng 1 tiêu đề lớn (merge hết chiều
// rộng), dòng 2 phụ đề, dòng 3 để trống, dòng 4 tiêu đề cột, từ dòng 5 là dữ
// liệu. `columnKinds` quyết định canh lề/định dạng số cho từng cột (song song
// với `header`) — 'index' = số thứ tự (căn giữa, số nguyên); 'text' = văn bản
// dài (căn trái, tự xuống dòng); 'number' = số liệu (căn giữa); 'label' = văn
// bản ngắn cần căn giữa, không xuống dòng. `rows` là mảng dữ liệu THÔ, KHÔNG
// kèm dòng tiêu đề.
export function buildStyledSheet(workbook, sheetName, { title, subtitle, header, columnKinds, columnWidths, rows }) {
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
export async function downloadWorkbook(workbook, filename) {
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
