// Ghép xếp hạng của nhiều bảng đấu (Board, theo tuổi) vào 1 bảng xếp hạng
// chung — dùng khi 1 số bảng quá ít đội nên BTC quyết định thi đấu/xếp hạng
// chung. CHỈ áp dụng cho ĐÚNG cuộc thi Enjoy AI Đà Nẵng — khớp theo
// competition_id (KHÔNG phải theo tên nội dung không thôi), vì HCM/các cuộc
// thi khác copy nguyên nội dung từ Đà Nẵng nên TRÙNG TÊN nội dung tiếng Việt
// ("Con đường phát minh", "Cuộc phiêu lưu trên bầu trời"...) nhưng KHÔNG gộp
// bảng — mỗi cuộc thi tự quyết định gộp hay không, không suy diễn từ tên.
//
// Dùng chung bởi:
//  - AdminScoreboard.jsx (xuất Excel toàn bộ BXH)
//  - AdminOutstandingCoaches.jsx (xét giải HLV xuất sắc — phải dùng ĐÚNG
//    hạng đã gộp, không xét theo bảng tách, vì hạng tách ra có thể sai lệch
//    khi 1 bảng chỉ có vài đội)
//  - AdminReports.jsx (Báo cáo điểm — tính hạng khớp Bảng xếp hạng)
const DA_NANG_COMPETITION_ID = 'ed4f9128-9531-4e11-84d7-0c198f6c0332';

export const BOARD_MERGE_GROUPS = {
  [DA_NANG_COMPETITION_ID]: {
    'Con đường phát minh': [['Bảng D', 'Bảng E']],
    'Cuộc phiêu lưu trên bầu trời': [['Bảng B', 'Bảng C'], ['Bảng D', 'Bảng E']],
  },
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

// Trả về mảng các nhóm bảng cần gộp CHO đúng (cuộc thi × nội dung) này, đã
// lọc theo những bảng thực sự tồn tại trong `boards` (bảng chưa được thêm
// vào nội dung thì bỏ qua nhóm đó, không gộp thiếu).
export function getMergeGroupsForContent(competitionId, contentName, boards) {
  const config = (BOARD_MERGE_GROUPS[competitionId] || {})[contentName] || [];
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
