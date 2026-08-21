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
  if (topN && rank <= topN) return 'phu';
  return null;
}

// Có đạt chuẩn "HLV xuất sắc" không, dựa trên danh sách các đội đã qua
// classifyRank() (mỗi phần tử có `tier`: 'major' | 'phu').
export function isOutstandingCoach(entries) {
  const majorCount = entries.filter((e) => e.tier === 'major').length;
  return majorCount >= 1 || entries.length >= 3;
}
