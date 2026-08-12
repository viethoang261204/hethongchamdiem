// Logic xếp hạng cho Fly Smart Cup (content_format = 'combat_drone') — CHỈ áp
// dụng cho Fly Smart Cup, không dùng cho Battle of Stars (xem battleScoring.js).
// Công thức gốc nằm ở client/src/pages/admin/AdminCombatMatches.jsx (nhánh
// combat_drone) — file này tách riêng phần tính điểm/points để dùng lại được
// ở nơi khác (vd bảng xếp hạng theo Board tại trang "Bảng xếp hạng").

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;
export const LOSS_POINTS = 0;

// Điểm 1 trận = tổng hiệp 1 + hiệp 2 (đá luân lưu không cộng điểm, chỉ tham khảo).
export function matchPoints(match) {
  const d = match.details || {};
  return {
    a: (Number(d.firstHalfA) || 0) + (Number(d.secondHalfA) || 0),
    b: (Number(d.firstHalfB) || 0) + (Number(d.secondHalfB) || 0),
  };
}

// Chỉ cần MỘT bên nằm trong `teams` truyền vào là tính — cho phép gọi hàm này
// với `teams` = các đội thuộc 1 Division trong khi `matches` = TẤT CẢ trận của
// nội dung (không lọc theo Group), để lấy đủ record từng đội kể cả khi Group
// của họ ghép nhiều Division khác nhau.
export function computeDroneStandings(teams, matches) {
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, { teamId: t.id, teamName: t.name, played: 0, wins: 0, draws: 0, losses: 0, points: 0, highestPoints: 0 });
  }

  for (const m of matches) {
    const aIn = stats.has(m.team_a_id);
    const bIn = stats.has(m.team_b_id);
    if (!aIn && !bIn) continue;
    const pts = matchPoints(m);

    if (aIn) {
      const s = stats.get(m.team_a_id);
      s.played++;
      if (m.winner_id) { if (m.winner_id === m.team_a_id) { s.wins++; s.points += WIN_POINTS; } else { s.losses++; s.points += LOSS_POINTS; } }
      else if (m.is_draw) { s.draws++; s.points += DRAW_POINTS; }
      if (pts) s.highestPoints += pts.a;
    }
    if (bIn) {
      const s = stats.get(m.team_b_id);
      s.played++;
      if (m.winner_id) { if (m.winner_id === m.team_b_id) { s.wins++; s.points += WIN_POINTS; } else { s.losses++; s.points += LOSS_POINTS; } }
      else if (m.is_draw) { s.draws++; s.points += DRAW_POINTS; }
      if (pts) s.highestPoints += pts.b;
    }
  }

  const standings = Array.from(stats.values());
  standings.sort((a, b) => b.points - a.points || b.highestPoints - a.highestPoints);
  standings.forEach((s, i) => { s.rank = i + 1; });
  return standings;
}
