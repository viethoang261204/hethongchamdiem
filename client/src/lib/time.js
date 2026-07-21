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
