// Logic chấm điểm & xếp hạng cho Fly Smart Cup (content_format = 'combat_drone')
// theo đúng luật ENJOY AI 2026 — Fly Smart Cup — KHÔNG áp dụng cho Battle of
// Stars (combat_stars, xem client/src/lib/battleScoring.js). Đây là bộ luật
// RIÊNG, độc lập hoàn toàn: không Meteor Tower, không Direct Win, không Task
// Score, không Retry bonus. Fly Smart Cup chỉ dùng:
//   GOALS/SCORE → MATCH RESULT → MATCH POINTS → GROUP RANKING → KNOCKOUT →
//   PENALTY SHOOTOUT.
//
// Dùng chung bởi: RefereeCombatMatchScore.jsx (nhánh drone), AdminCombatMatches.jsx
// (nhánh isDrone), CombatDroneSheetTable.jsx. Có bản port CommonJS song song ở
// server/flySmartCup.cjs (backend tự xác thực lại, không tin client — mục 20 luật).
//
// Quy ước field trong combat_matches.details (giữ nguyên tên field cũ đã lưu
// dữ liệu thật — firstHalf*/secondHalf* — chỉ THÊM field mới, không đổi tên):
//   firstHalfA/firstHalfB, secondHalfA/secondHalfB   — số bàn thắng mỗi hiệp
//   refereeAwardedA/refereeAwardedB                  — điểm trọng tài cộng thêm (mục 12)
//   refereeAwardedReasonA/refereeAwardedReasonB      — lý do cộng điểm
//   shootoutRounds: [{ roundNo, aSuccess, aTimeSeconds, bSuccess, bTimeSeconds }]
//   disqualifiedTeam: 'A' | 'B' | null, disqualificationReason
//
// Màu đội KHÔNG cấu hình theo từng trận — theo đúng quy ước sẵn có của toàn hệ
// thống (Team A luôn là Red, Team B luôn là Blue, giống mọi UI/phiếu điểm
// khác), để không phải sửa hàng loạt nơi đang hiển thị "(Red)"/"(Blue)".
export const TEAM_A_COLOR = 'Red';
export const TEAM_B_COLOR = 'Blue';

export const PENALTY_MAX_SECONDS = 30;

// ── Điểm số 1 bên (mục 4 + mục 12) ──
// Total Score = Half 1 + Half 2 + điểm trọng tài công nhận (nếu có).
export function computeSideScore(side) {
  const half1 = Math.max(0, Number(side?.half1) || 0);
  const half2 = Math.max(0, Number(side?.half2) || 0);
  const refereeAwarded = Math.max(0, Number(side?.refereeAwarded) || 0);
  const total = half1 + half2 + refereeAwarded;
  return { half1, half2, refereeAwarded, total };
}

// ── Match Status (mục 2/13 luật) — LƯU TRONG details.status (jsonb), KHÔNG
// phải cột riêng trên combat_matches, để không cần migrate schema. Trận cũ
// (chấm trước khi có khái niệm status) không có details.status → suy ra
// 'completed' nếu đã có winner_id/is_draw (đúng như Battle of Stars vẫn làm
// từ trước), ngược lại 'scheduled'.
export function effectiveStatus(m) {
  if (m?.details?.status) return m.details.status;
  if (m?.winner_id || m?.is_draw) return 'completed';
  return 'scheduled';
}

export function sideFromDetails(details, side) {
  const d = details || {};
  const suf = side; // 'A' | 'B'
  return {
    half1: Number(d[`firstHalf${suf}`]) || 0,
    half2: Number(d[`secondHalf${suf}`]) || 0,
    refereeAwarded: Number(d[`refereeAwarded${suf}`]) || 0,
    refereeAwardedReason: d[`refereeAwardedReason${suf}`] || '',
  };
}

// ── Vòng sơ loại (group_label có giá trị) — mục 5 luật ──
// CHỈ so Total Score, KHÔNG dùng bất kỳ tiêu chí nào của Battle of Stars.
// Luôn phân định được WIN/LOSS/DRAW — không có khái niệm TIE_BREAK ở cấp 1
// trận (tie-break chỉ áp dụng ở cấp XẾP HẠNG, xem computeGroupStandings).
export function determineGroupMatchResult(a, b) {
  const sa = computeSideScore(a);
  const sb = computeSideScore(b);
  if (sa.total > sb.total) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.total > sa.total) return { result: 'B', scoreA: sa, scoreB: sb };
  return { result: 'DRAW', scoreA: sa, scoreB: sb };
}

// ── Knockout (group_label rỗng) — mục 9 luật ──
// KHÔNG có Draw ở Knockout: bằng điểm → chuyển Penalty Shootout (mục 10).
// `shootoutRounds` (nếu có) được dùng để phân định khi bằng Total Score.
export function determineKnockoutResult(a, b, shootoutRounds) {
  const sa = computeSideScore(a);
  const sb = computeSideScore(b);
  if (sa.total > sb.total) return { result: 'A', scoreA: sa, scoreB: sb, shootoutNeeded: false };
  if (sb.total > sa.total) return { result: 'B', scoreA: sa, scoreB: sb, shootoutNeeded: false };

  const sw = resolveShootoutWinner(shootoutRounds);
  if (sw.winner) {
    return { result: sw.winner, scoreA: sa, scoreB: sb, shootoutNeeded: true, decidingShootoutRound: sw.decidingRound };
  }
  return { result: null, scoreA: sa, scoreB: sb, shootoutNeeded: true, shootoutPending: true };
}

// ── Penalty Shootout (mục 10 + 11) ──
// Mỗi round là 1 lượt "sudden death": ai ghi bàn với thời gian ngắn hơn thắng
// NGAY round đó (và thắng luôn shootout); ghi bàn thắng đội không ghi được;
// nếu cả 2 cùng ghi với thời gian bằng nhau, hoặc cả 2 đều MISS → hòa round
// đó, sang round tiếp theo. KHÔNG hard-code số round tối đa (mục 10).
export function resolveShootoutWinner(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  for (const r of list) {
    const aOk = !!r.aSuccess;
    const bOk = !!r.bSuccess;
    const aTime = aOk ? Number(r.aTimeSeconds) : null;
    const bTime = bOk ? Number(r.bTimeSeconds) : null;
    if (aOk && !bOk) return { winner: 'A', decidingRound: r.roundNo };
    if (bOk && !aOk) return { winner: 'B', decidingRound: r.roundNo };
    if (aOk && bOk) {
      if (aTime < bTime) return { winner: 'A', decidingRound: r.roundNo };
      if (bTime < aTime) return { winner: 'B', decidingRound: r.roundNo };
      // Thời gian bằng nhau → hòa round này, đấu tiếp.
    }
    // Cả 2 đều MISS → hòa round này, đấu tiếp.
  }
  return { winner: null };
}

// ── Match Points (mục 6) — CHỈ áp dụng vòng sơ loại, Knockout không dùng.
// `outcome` là kết quả CỦA ĐỘI ĐANG XÉT: 'WIN' | 'DRAW' | 'LOSS'.
export function computeMatchPoints(outcome) {
  if (outcome === 'WIN') return 3;
  if (outcome === 'DRAW') return 1;
  return 0;
}

// ── Validate `details` trước khi lưu (mục 20 — backend không tin client) ──
export function validateDetails(details) {
  const d = details || {};
  for (const side of ['A', 'B']) {
    const h1 = Number(d[`firstHalf${side}`]) || 0;
    const h2 = Number(d[`secondHalf${side}`]) || 0;
    if (h1 < 0 || h2 < 0) return 'Half 1/Half 2 score cannot be negative.';
    const awarded = d[`refereeAwarded${side}`];
    if (awarded !== undefined && awarded !== null && awarded !== '') {
      const n = Number(awarded);
      if (Number.isNaN(n) || n < 0) return 'Referee Awarded Points cannot be negative.';
      if (n > 0 && !String(d[`refereeAwardedReason${side}`] || '').trim()) {
        return 'A reason is required when awarding Referee Awarded Points.';
      }
    }
  }
  if (Array.isArray(d.shootoutRounds)) {
    for (const r of d.shootoutRounds) {
      if (r.aSuccess && (Number(r.aTimeSeconds) <= 0 || Number(r.aTimeSeconds) > PENALTY_MAX_SECONDS)) {
        return `Shootout time must be between 0 and ${PENALTY_MAX_SECONDS} seconds.`;
      }
      if (r.bSuccess && (Number(r.bTimeSeconds) <= 0 || Number(r.bTimeSeconds) > PENALTY_MAX_SECONDS)) {
        return `Shootout time must be between 0 and ${PENALTY_MAX_SECONDS} seconds.`;
      }
    }
  }
  if (d.disqualifiedTeam && !['A', 'B'].includes(d.disqualifiedTeam)) {
    return 'Invalid disqualified team.';
  }
  return null;
}

// ── Group Ranking (mục 7 + 8) ──
// teams: [{id, name}] trong group đang xét. matches: các trận group_label
// khớp group này (mọi lần gặp nhau, kể cả trận tie-break bổ sung — càng
// nhiều trận giữa 2 đội càng được cộng dồn record, tự nhiên phản ánh đúng
// mục 8 "trận đấu thêm cập nhật ranking" mà không cần bảng riêng).
// CHỈ trận status='completed' mới được tính — trận 'scheduled'/'live' chưa có
// kết quả, trận 'cancelled'/'disqualified' không tính là đã đấu (mục 13).
export function computeGroupStandings(teams, matches) {
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, {
      teamId: t.id, teamName: t.name,
      played: 0, wins: 0, draws: 0, losses: 0,
      matchPoints: 0, totalScore: 0,
    });
  }

  // Ghi nhận từng cặp đội đã gặp nhau (có thể gặp >1 lần nếu có trận tie-break
  // bổ sung) để tính Head-to-Head — mục 7 Priority 3.
  const h2h = new Map(); // key "idA|idB" (đã sort) -> { [teamId]: winCount }

  for (const m of matches) {
    if (effectiveStatus(m) !== 'completed') continue;
    const aIn = stats.has(m.team_a_id);
    const bIn = stats.has(m.team_b_id);
    if (!aIn && !bIn) continue;
    const a = sideFromDetails(m.details, 'A');
    const b = sideFromDetails(m.details, 'B');
    const { result, scoreA, scoreB } = determineGroupMatchResult(a, b);

    if (aIn) {
      const sA = stats.get(m.team_a_id);
      sA.played++;
      sA.totalScore += scoreA.total;
      if (result === 'A') { sA.wins++; sA.matchPoints += 3; }
      else if (result === 'B') { sA.losses++; }
      else { sA.draws++; sA.matchPoints += 1; }
    }
    if (bIn) {
      const sB = stats.get(m.team_b_id);
      sB.played++;
      sB.totalScore += scoreB.total;
      if (result === 'B') { sB.wins++; sB.matchPoints += 3; }
      else if (result === 'A') { sB.losses++; }
      else { sB.draws++; sB.matchPoints += 1; }
    }
    if (aIn && bIn && m.team_a_id !== m.team_b_id) {
      const key = [m.team_a_id, m.team_b_id].sort().join('|');
      if (!h2h.has(key)) h2h.set(key, {});
      const rec = h2h.get(key);
      const winnerId = result === 'A' ? m.team_a_id : result === 'B' ? m.team_b_id : null;
      if (winnerId) rec[winnerId] = (rec[winnerId] || 0) + 1;
    }
  }

  // Priority 1 + 2: Match Points desc, rồi Total Score desc.
  const standings = Array.from(stats.values());
  standings.sort((x, y) => y.matchPoints - x.matchPoints || y.totalScore - x.totalScore);

  // Priority 3 + 4: gom cụm bằng nhau (P1+P2), thử Head-to-Head NẾU cụm đúng
  // 2 đội; cụm ≥3 đội hoặc H2H vẫn không phân định được → Tie-break Required
  // (mục 8 — không tự bịa thuật toán head-to-head nhiều đội).
  let i = 0;
  while (i < standings.length) {
    let j = i + 1;
    while (j < standings.length &&
      standings[j].matchPoints === standings[i].matchPoints &&
      standings[j].totalScore === standings[i].totalScore) j++;
    const clusterSize = j - i;
    if (clusterSize === 2) {
      const x = standings[i], y = standings[j - 1];
      const key = [x.teamId, y.teamId].sort().join('|');
      const rec = h2h.get(key) || {};
      const xWins = rec[x.teamId] || 0;
      const yWins = rec[y.teamId] || 0;
      if (xWins > yWins) {
        y.tieBreakRequired = false; x.headToHeadWinner = true;
      } else if (yWins > xWins) {
        // Đội y thắng đối đầu — đổi chỗ để y xếp trên x.
        standings[i] = y; standings[j - 1] = x;
        standings[i].headToHeadWinner = true;
      } else {
        x.tieBreakRequired = true; y.tieBreakRequired = true;
        x.tiedWithTeamIds = [y.teamId]; y.tiedWithTeamIds = [x.teamId];
      }
    } else if (clusterSize > 2) {
      const ids = standings.slice(i, j).map((s) => s.teamId);
      for (let k = i; k < j; k++) {
        standings[k].tieBreakRequired = true;
        standings[k].tiedWithTeamIds = ids.filter((id) => id !== standings[k].teamId);
      }
    }
    i = j;
  }

  standings.forEach((s, idx) => { s.rank = idx + 1; });
  return standings;
}

// ── Round robin — DÙNG CHUNG với Battle of Stars, xem generateRoundRobin
// trong battleScoring.js (thuật toán vòng tròn không phụ thuộc luật scoring
// của format nào, không cần viết lại ở đây).
export { generateRoundRobin } from './battleScoring';
