import * as XLSX from 'xlsx';

// ============================================================
// Đọc/ghi file Excel cho tính năng "Nhập từ Excel" ở Admin.
//
// Khớp cột theo TÊN (label) chính xác, không phân biệt hoa/thường và
// khoảng trắng thừa — không làm fuzzy-match bỏ dấu (phức tạp, lợi ích
// không chắc). Luôn khuyến khích dùng "Tải file mẫu" để tránh gõ sai
// tên cột.
//
// columns: [{ key, label, required, example }]
// ============================================================

function normalizeHeader(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Đọc 1 file Excel/CSV, trả về { rows, errors }
//   rows   — mảng object đã map theo `key` của columns, kèm __row (số dòng
//            trong file, tính cả dòng tiêu đề, để báo lỗi đúng vị trí) và
//            __valid (true/false)
//   errors — mảng lỗi tổng quát cấp file (không đọc được file, thiếu cột...)
export function parseExcelFile(file, columns) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) {
          resolve({ rows: [], errors: ['File không có sheet dữ liệu nào.'] });
          return;
        }
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        if (raw.length === 0) {
          resolve({ rows: [], errors: ['File không có dữ liệu (chỉ có dòng tiêu đề hoặc trống).'] });
          return;
        }

        // Map tên cột trong file (header gốc) -> key đã định nghĩa, theo normalizeHeader
        const fileHeaders = Object.keys(raw[0]);
        const headerToKey = {};
        for (const col of columns) {
          const match = fileHeaders.find((h) => normalizeHeader(h) === normalizeHeader(col.label));
          if (match) headerToKey[match] = col.key;
        }

        const missingRequiredCols = columns.filter((c) => c.required && !Object.values(headerToKey).includes(c.key));
        if (missingRequiredCols.length) {
          resolve({
            rows: [],
            errors: [`File thiếu cột bắt buộc: ${missingRequiredCols.map((c) => c.label).join(', ')}. Hãy tải file mẫu để có đúng tên cột.`],
          });
          return;
        }

        const rows = raw.map((rawRow, i) => {
          const row = { __row: i + 2, __errors: [] }; // +2: dòng 1 = tiêu đề, data bắt đầu dòng 2
          for (const [header, key] of Object.entries(headerToKey)) {
            row[key] = String(rawRow[header] ?? '').trim();
          }
          for (const col of columns) {
            if (col.required && !row[col.key]) {
              row.__errors.push(`thiếu "${col.label}"`);
            }
          }
          row.__valid = row.__errors.length === 0;
          return row;
        });

        resolve({ rows, errors: [] });
      } catch (err) {
        reject(new Error('File không đúng định dạng Excel/CSV hợp lệ.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Tải file mẫu .xlsx — dòng 1 = tên cột, dòng 2 = ví dụ (nếu có)
export function downloadExcelTemplate(columns, filename) {
  const header = columns.map((c) => c.label + (c.required ? ' *' : ''));
  const example = columns.map((c) => c.example ?? '');
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  ws['!cols'] = columns.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mẫu');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
