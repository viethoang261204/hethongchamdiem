// Tiêu chí "HLV xuất sắc" (ENJOY AI Asian Open 2026) — HLV đạt danh hiệu nếu
// thỏa MỘT trong hai điều kiện:
//   (a) có ít nhất 1 đội đạt giải Nhất/Nhì/Ba (Top 1-3) ở BẤT KỲ bảng đấu nào, hoặc
//   (b) có ít nhất 3 đội nằm trong "Top + giải phụ" (gộp cả giải chính lẫn giải phụ).
//
// "Giải phụ" là dải hạng MỞ RỘNG sau Top 3, CHỈ áp dụng cho đúng các (nội dung
// × bảng đấu) được liệt kê dưới đây — "Top 5" nghĩa là hạng 4-5-6-7-8 (Top 5
// SAU Top 3, không phải hạng 1-5); "Top 10" nghĩa là hạng 4..13. Các bảng đấu
// không có trong danh sách này chỉ xét Top 1-3 (không có giải phụ).
const GIAI_PHU_TOPN_BY_KEY = {
  'Ancient Civilizations|Bảng A': 5,
  'Fly Smart Cup|Bảng A': 5,
  'Mining Expedition|Bảng B': 10,
  'Mining Expedition|Bảng C': 10,
  'Battle of Stars|Bảng D': 10,
  'Skyline Adventures|Bảng D': 5,
  // Enjoy AI Đà Nẵng (tên nội dung tiếng Việt — không đụng key tiếng Anh ở
  // trên). Bảng đã gộp (xem lib/boardMerge.js) dùng đúng nhãn gộp làm key,
  // vì hạng được tính trên tập đội đã gộp, không phải bảng tách.
  'Cuộc thám hiểm khai khoáng|Bảng B': 5,
  'Cuộc thám hiểm khai khoáng|Bảng C': 5,
  'Con đường phát minh|Bảng C': 10,
  'Cuộc phiêu lưu trên bầu trời|Bảng D + Bảng E': 10,
};

// Inventions Trail: TẤT CẢ bảng đấu đều xét Top 10 (không phân biệt bảng nào).
function giaiPhuTopN(contentName, boardName) {
  if (contentName === 'Inventions Trail') return 10;
  return GIAI_PHU_TOPN_BY_KEY[`${contentName}|${boardName}`] ?? null;
}

// Phân loại 1 hạng cụ thể (trong đúng 1 nội dung × bảng đấu) — trả về
// 'major' (giải chính, Top 1-3), 'phu' (giải phụ, trong dải mở rộng), hoặc
// null (không tính).
export function classifyRank(contentName, boardName, rank) {
  if (!rank || rank < 1) return null;
  if (rank <= 3) return 'major';
  const topN = giaiPhuTopN(contentName, boardName);
  // "Top 5" = 5 hạng NGAY SAU Top 3 (hạng 4..3+5=8), "Top 10" = hạng 4..13 —
  // xem comment GIAI_PHU_TOPN_BY_KEY ở trên. (rank <= topN đơn thuần sẽ SAI —
  // với topN=5 chỉ khớp hạng 4-5 thay vì đúng 5 hạng 4-8.)
  if (topN && rank <= 3 + topN) return 'phu';
  return null;
}

// Nhãn hạng để hiển thị/xuất báo cáo — Top 1/2/3 hiện đúng số, hạng trong dải
// giải phụ hiện gộp thành "Top 5"/"Top 10" (không hiện riêng "Top 4"/"Top 6"
// .../), hạng ngoài mọi dải giải phụ (kể cả không có bảng nào được cấu hình)
// thì để TRỐNG — không có ý nghĩa giải thưởng nên không ghi số hạng ra.
export function formatRankLabel(contentName, boardName, rank) {
  if (!rank || rank < 1) return '';
  if (rank <= 3) return `Top ${rank}`;
  const topN = giaiPhuTopN(contentName, boardName);
  if (topN && rank <= 3 + topN) return `Top ${topN}`;
  return '';
}

// Có đạt chuẩn "HLV xuất sắc" không, dựa trên danh sách các đội đã qua
// classifyRank() (mỗi phần tử có `tier`: 'major' | 'phu').
export function isOutstandingCoach(entries) {
  const majorCount = entries.filter((e) => e.tier === 'major').length;
  return majorCount >= 1 || entries.length >= 3;
}

// Giải "Rising Star" — giải đặc biệt do BTC chọn thủ công (không dựa vào xếp
// hạng thi đấu), đội đạt giải này thì HLV cũng được tính vào "HLV xuất sắc"
// (coi như giải chính, tương đương Top 1-3). Enjoy AI Đà Nẵng — khớp theo
// đúng tên đội (case-sensitive).
export const RISING_STAR_TEAMS = ['FPT ĐN 12', 'Brave Lions', 'STEM SQUARE 07'];

export function isRisingStarTeam(teamName) {
  return RISING_STAR_TEAMS.includes(teamName);
}
