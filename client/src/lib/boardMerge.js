// Ghép xếp hạng của nhiều bảng đấu (Board, theo tuổi) vào 1 bảng xếp hạng
// chung — dùng khi 1 số bảng quá ít đội nên BTC quyết định thi đấu/xếp hạng
// chung. Hiện chỉ áp dụng cho Enjoy AI Đà Nẵng (khớp theo tên nội dung tiếng
// Việt nên không đụng cuộc thi khác dùng tên tiếng Anh như Asian Open).
//
// Dùng chung bởi:
//  - AdminScoreboard.jsx (xuất Excel toàn bộ BXH)
//  - AdminOutstandingCoaches.jsx (xét giải HLV xuất sắc — phải dùng ĐÚNG
//    hạng đã gộp, không xét theo bảng tách, vì hạng tách ra có thể sai lệch
//    khi 1 bảng chỉ có vài đội)
export const BOARD_MERGE_GROUPS = {
  'Con đường phát minh': [['Bảng D', 'Bảng E']],
  'Cuộc phiêu lưu trên bầu trời': [['Bảng B', 'Bảng C'], ['Bảng D', 'Bảng E']],
};

// So sánh 2 đội để xếp hạng — ĐÚNG tie-break server dùng ở GET
// /contents/:id/boards/:id/ranking (server/routes.cjs): điểm giảm dần → thời
// gian tăng dần → số lần chạy lại tăng dần → điểm lượt tốt nhất giảm dần.
export function compareRankedTeams(a, b) {
  return b.total_score - a.total_score
    || a.total_time - b.total_time
    || a.total_retry - b.total_retry
    || b.best_round_score - a.best_round_score;
}

// Trả về mảng các nhóm bảng cần gộp CHO nội dung này, đã lọc theo những bảng
// thực sự tồn tại trong `boards` (bảng chưa được thêm vào nội dung thì bỏ
// qua nhóm đó, không gộp thiếu).
export function getMergeGroupsForContent(contentName, boards) {
  const config = BOARD_MERGE_GROUPS[contentName] || [];
  return config
    .map((names) => boards.filter((b) => names.includes(b.name)))
    .filter((groupBoards) => groupBoards.length >= 2 && !groupBoards.some((b) => b.ranking_format === 'combat'));
}

// Gộp danh sách teams từ nhiều board ranking (measurement) thành 1 mảng đã
// sắp xếp + đánh dấu needs_playoff lại từ đầu (không giữ needs_playoff cũ
// tính riêng theo từng bảng, vì gộp lại có thể xuất hiện/biến mất cặp hòa).
export function mergeMeasurementTeams(rankingResults) {
  const teams = [];
  rankingResults.forEach((r) => { if (r?.ranking_format === 'measurement') teams.push(...(r.teams || [])); });
  teams.sort(compareRankedTeams);
  for (let i = 0; i < teams.length; i++) delete teams[i].needs_playoff;
  for (let i = 1; i < teams.length; i++) {
    const prev = teams[i - 1], cur = teams[i];
    const tied = prev.total_score === cur.total_score && prev.total_time === cur.total_time
      && prev.total_retry === cur.total_retry && prev.best_round_score === cur.best_round_score;
    if (tied) { prev.needs_playoff = true; cur.needs_playoff = true; }
  }
  return teams;
}
