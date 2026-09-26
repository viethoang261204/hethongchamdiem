// Tiêu chí "HLV xuất sắc" — HLV đạt danh hiệu nếu thỏa MỘT trong hai điều
// kiện:
//   (a) có ít nhất 1 đội đạt giải Nhất/Nhì/Ba (Top 1-3) ở BẤT KỲ bảng đấu nào, hoặc
//   (b) có ít nhất 3 đội nằm trong "Top + giải phụ" (gộp cả giải chính lẫn giải phụ).
//
// "Giải phụ" là dải hạng MỞ RỘNG sau Top 3, CHỈ áp dụng cho đúng các (cuộc thi
// × nội dung × bảng đấu) được liệt kê dưới đây — "Top 5" nghĩa là hạng 4-5-6-
// 7-8 (Top 5 SAU Top 3, không phải hạng 1-5); "Top 10" nghĩa là hạng 4..13.
// Bảng đấu không có trong danh sách chỉ xét Top 1-3 (không có giải phụ).
//
// Khớp theo (competition_id × ...) — KHÔNG chỉ theo tên nội dung/đội, vì các
// cuộc thi sau (Đà Nẵng, HCM...) copy nguyên nội dung + trùng tên đội từ cuộc
// thi khác (VD "Unity", "Con đường phát minh" đều xuất hiện ở ≥ 2 cuộc thi) —
// khớp theo tên không thôi sẽ làm rò rỉ cấu hình của cuộc thi này sang cuộc
// thi khác (đã từng là bug thật, xem lib/boardMerge.js).
const ASIAN_OPEN = '1e274560-6ea8-40d7-a9e6-c5a597b5468e';
const DA_NANG = 'ed4f9128-9531-4e11-84d7-0c198f6c0332';
const HCM = '6d54f129-be85-472c-b147-c90ffb9907cc';

const GIAI_PHU_TOPN_BY_COMPETITION = {
  [ASIAN_OPEN]: {
    'Ancient Civilizations|Bảng A': 5,
    'Fly Smart Cup|Bảng A': 5,
    'Mining Expedition|Bảng B': 10,
    'Mining Expedition|Bảng C': 10,
    'Battle of Stars|Bảng D': 10,
    'Skyline Adventures|Bảng D': 5,
  },
  [DA_NANG]: {
    'Cuộc thám hiểm khai khoáng|Bảng B': 5,
    'Cuộc thám hiểm khai khoáng|Bảng C': 5,
    'Con đường phát minh|Bảng C': 10,
    'Cuộc phiêu lưu trên bầu trời|Bảng D + Bảng E': 10,
  },
  // Enjoy AI TP HCM — theo đúng BXH_ONESPACE_ACADEMY.pdf: chỉ 3 bảng có giải
  // phụ Top 10 (Nền văn minh cổ đại Bảng B, Con đường phát minh Bảng C và D);
  // Cuộc thám hiểm khai khoáng, Fly Smart Cup, Con đường phát minh Bảng B/E
  // chỉ xét Top 1-3 (không có giải phụ) — KHÁC Đà Nẵng dù trùng tên nội dung.
  [HCM]: {
    'Nền văn minh cổ đại|Bảng B': 10,
    'Con đường phát minh|Bảng C': 10,
    'Con đường phát minh|Bảng D': 10,
  },
};

function giaiPhuTopN(competitionId, contentName, boardName) {
  // Inventions Trail (Asian Open): TẤT CẢ bảng đấu đều xét Top 10.
  if (competitionId === ASIAN_OPEN && contentName === 'Inventions Trail') return 10;
  return (GIAI_PHU_TOPN_BY_COMPETITION[competitionId] || {})[`${contentName}|${boardName}`] ?? null;
}

// Phân loại 1 hạng cụ thể (trong đúng 1 cuộc thi × nội dung × bảng đấu) —
// trả về 'major' (giải chính, Top 1-3), 'phu' (giải phụ, trong dải mở rộng),
// hoặc null (không tính).
export function classifyRank(competitionId, contentName, boardName, rank) {
  if (!rank || rank < 1) return null;
  if (rank <= 3) return 'major';
  const topN = giaiPhuTopN(competitionId, contentName, boardName);
  // "Top 5" = 5 hạng NGAY SAU Top 3 (hạng 4..3+5=8), "Top 10" = hạng 4..13 —
  // xem comment ở trên. (rank <= topN đơn thuần sẽ SAI — với topN=5 chỉ khớp
  // hạng 4-5 thay vì đúng 5 hạng 4-8.)
  if (topN && rank <= 3 + topN) return 'phu';
  return null;
}

// Nhãn hạng để hiển thị/xuất báo cáo — Top 1/2/3 hiện đúng số, hạng trong dải
// giải phụ hiện gộp thành "Top 5"/"Top 10" (không hiện riêng "Top 4"/"Top 6"
// .../), hạng ngoài mọi dải giải phụ (kể cả không có bảng nào được cấu hình)
// thì để TRỐNG — không có ý nghĩa giải thưởng nên không ghi số hạng ra.
export function formatRankLabel(competitionId, contentName, boardName, rank) {
  if (!rank || rank < 1) return '';
  if (rank <= 3) return `Top ${rank}`;
  const topN = giaiPhuTopN(competitionId, contentName, boardName);
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
// (coi như giải chính, tương đương Top 1-3). Khớp theo (competition_id × tên
// đội) — cùng lý do scoping ở trên (VD "Unity" là 2 đội khác nhau ở Asian
// Open và HCM).
const RISING_STAR_TEAMS_BY_COMPETITION = {
  [DA_NANG]: ['FPT ĐN 12', 'Brave Lions', 'STEM SQUARE 07'],
  [HCM]: [
    'Bricklab_Kraken', 'F2ST', 'Bricklab_Beast', 'Unity', 'Aurora',
    'CodewithKim', 'Bricklab_TechTitans', 'TrH CP 2', 'TiH CP 1',
  ],
};

export function isRisingStarTeam(competitionId, teamName) {
  return (RISING_STAR_TEAMS_BY_COMPETITION[competitionId] || []).includes(teamName);
}
