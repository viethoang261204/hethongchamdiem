// Thời gian thi được trọng tài nhập theo GIÂY (số nguyên) và lưu nguyên dạng
// chuỗi số trong scores.time — hàm này chuyển sang định dạng phút:giây để hiển thị.
// Dữ liệu cũ (nhập trước khi đổi sang giây) có thể không phải số thuần —
// khi đó hiển thị nguyên trạng thay vì làm hỏng dữ liệu.
export function formatSecondsAsMinutes(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return trimmed;
  const totalSeconds = parseInt(trimmed, 10);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Giờ đồng hồ thực tế (HH:mm) theo múi giờ Việt Nam (GMT+7) — dùng để ghi
// nhận "Thời gian vào sân" ngay tại thời điểm trọng tài bấm Bắt đầu, không
// cho nhập tay để tránh sai lệch.
export function formatVietnamClockTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
}
