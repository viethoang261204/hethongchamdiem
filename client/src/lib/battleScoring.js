// Logic chấm điểm & xếp hạng cho Battle of Stars (content_format = 'combat_stars')
// theo đúng luật ENJOY AI 2026: Battle of Stars — KHÔNG áp dụng cho Fly Smart Cup
// (combat_drone), file đó dùng công thức riêng trong AdminCombatMatches.jsx.
//
// Dùng chung bởi: RefereeCombatStars.jsx, AdminCombatMatches.jsx (nhánh isStars),
// CombatStarsSheetTable.jsx. Có bản port CommonJS song song ở
// server/battleScoring.cjs (backend tự xác thực lại, không tin client).

export const METEOR_TOWER_SCORE = 100;
export const ENERGY_BLOCK_SCORE = 10;
export const ENERGY_BLOCK_MAX = 8;
export const FIREPOWER_BALL_SCORE = 15;
export const FIREPOWER_BALL_MAX = 8;

// Extra Reward: 0 retry=+40, 1=+30, 2=+20, 3=+10, ≥4=+0
export function computeExtraReward(retryCount) {
  const r = Math.max(0, Number(retryCount) || 0);
  return Math.max(0, 40 - 10 * r);
}

// side = { meteorCompleted, energyBlocks, firepowerBalls, retryCount, pointsLost, directWin }
export function computeTaskScore(side) {
  const meteorCompleted = !!side?.meteorCompleted;
  const energyBlocks = Math.min(ENERGY_BLOCK_MAX, Math.max(0, Number(side?.energyBlocks) || 0));
  const firepowerBalls = Math.min(FIREPOWER_BALL_MAX, Math.max(0, Number(side?.firepowerBalls) || 0));
  const retryCount = Math.max(0, Number(side?.retryCount) || 0);
  const pointsLost = Math.max(0, Number(side?.pointsLost) || 0);

  const meteorScore = meteorCompleted ? METEOR_TOWER_SCORE : 0;
  const energyScore = energyBlocks * ENERGY_BLOCK_SCORE;
  const firepowerScore = firepowerBalls * FIREPOWER_BALL_SCORE;
  const extraReward = computeExtraReward(retryCount);
  const taskScore = meteorScore + energyScore + firepowerScore + extraReward - pointsLost;

  return { meteorCompleted, energyBlocks, firepowerBalls, retryCount, pointsLost, meteorScore, energyScore, firepowerScore, extraReward, taskScore };
}

// Vòng bảng — đúng 3 bước mục 3 luật. Trả về 'A' | 'B' | 'DRAW'.
export function determineGroupMatchResult(a, b) {
  const sa = computeTaskScore(a);
  const sb = computeTaskScore(b);
  const directA = !!a?.directWin;
  const directB = !!b?.directWin;

  // Bước 1: Direct Win (Final Fortress) — thắng ngay, kết thúc.
  if (directA && !directB) return { result: 'A', scoreA: sa, scoreB: sb };
  if (directB && !directA) return { result: 'B', scoreA: sa, scoreB: sb };

  // Bước 2: so Task Score.
  if (sa.taskScore > sb.taskScore) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.taskScore > sa.taskScore) return { result: 'B', scoreA: sa, scoreB: sb };

  // Bước 3: bằng Task Score → so Meteor Tower.
  if (sa.meteorCompleted && !sb.meteorCompleted) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.meteorCompleted && !sa.meteorCompleted) return { result: 'B', scoreA: sa, scoreB: sb };

  // Cả hai cùng hoàn thành hoặc cùng không hoàn thành → Draw.
  return { result: 'DRAW', scoreA: sa, scoreB: sb };
}

// Finals (knockout) — đúng 5 bước mục 8 luật. Trả về 'A' | 'B' | 'TIE_BREAK'.
export function determineFinalsMatchResult(a, b) {
  const sa = computeTaskScore(a);
  const sb = computeTaskScore(b);
  const directA = !!a?.directWin;
  const directB = !!b?.directWin;

  // Bước 1: Direct Win.
  if (directA && !directB) return { result: 'A', scoreA: sa, scoreB: sb };
  if (directB && !directA) return { result: 'B', scoreA: sa, scoreB: sb };

  // Bước 2: điểm cao hơn trong current round (Task Score).
  if (sa.taskScore > sb.taskScore) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.taskScore > sa.taskScore) return { result: 'B', scoreA: sa, scoreB: sb };

  // Bước 3: Full Firepower score cao hơn.
  if (sa.firepowerScore > sb.firepowerScore) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.firepowerScore > sa.firepowerScore) return { result: 'B', scoreA: sa, scoreB: sb };

  // Bước 4: hoàn thành Meteor Tower.
  if (sa.meteorCompleted && !sb.meteorCompleted) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.meteorCompleted && !sa.meteorCompleted) return { result: 'B', scoreA: sa, scoreB: sb };

  // Bước 5: ít Retries hơn.
  if (sa.retryCount < sb.retryCount) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.retryCount < sa.retryCount) return { result: 'B', scoreA: sa, scoreB: sb };

  // Vẫn bằng → TIE-BREAK (không tự bịa thêm tiêu chí).
  return { result: 'TIE_BREAK', scoreA: sa, scoreB: sb };
}

export function computeMatchPoints(result) {
  if (result === 'WIN') return 3;
  if (result === 'DRAW') return 1;
  return 0;
}

// Đọc dữ liệu 1 bên (A hoặc B) từ combat_matches.details
export function sideFromDetails(details, side) {
  const d = details || {};
  const suf = side; // 'A' | 'B'
  return {
    meteorCompleted: !!d[`meteorCompleted${suf}`],
    energyBlocks: Number(d[`energyBlocks${suf}`]) || 0,
    firepowerBalls: Number(d[`firepowerBalls${suf}`]) || 0,
    retryCount: Number(d[`retryCount${suf}`]) || 0,
    pointsLost: Number(d[`pointsLost${suf}`]) || 0,
    directWin: !!d[`directWin${suf}`],
  };
}

// Tính bảng xếp hạng CHO 1 GROUP (đội + trận đã lọc sẵn cùng group đó).
// teams: [{id, name}], matches: combat_matches rows (group_label khớp group này).
// Sort đúng mục 5 luật: Match Points → Direct Wins → Total Score → Meteor
// Completed → Retries (tăng dần) → còn bằng thì đánh dấu tieBreak.
export function computeGroupStandings(teams, matches) {
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, {
      teamId: t.id, teamName: t.name,
      played: 0, wins: 0, draws: 0, losses: 0,
      matchPoints: 0, totalScore: 0, meteorCompleted: 0, directWins: 0, retries: 0,
    });
  }

  for (const m of matches) {
    if (!stats.has(m.team_a_id) || !stats.has(m.team_b_id)) continue;
    const a = sideFromDetails(m.details, 'A');
    const b = sideFromDetails(m.details, 'B');
    const { result, scoreA, scoreB } = determineGroupMatchResult(a, b);

    const sA = stats.get(m.team_a_id);
    const sB = stats.get(m.team_b_id);
    sA.played++; sB.played++;
    sA.totalScore += scoreA.taskScore; sB.totalScore += scoreB.taskScore;
    if (scoreA.meteorCompleted) sA.meteorCompleted++;
    if (scoreB.meteorCompleted) sB.meteorCompleted++;
    sA.retries += scoreA.retryCount; sB.retries += scoreB.retryCount;
    if (a.directWin) sA.directWins++;
    if (b.directWin) sB.directWins++;

    if (result === 'A') { sA.wins++; sB.losses++; sA.matchPoints += 3; }
    else if (result === 'B') { sB.wins++; sA.losses++; sB.matchPoints += 3; }
    else { sA.draws++; sB.draws++; sA.matchPoints += 1; sB.matchPoints += 1; }
  }

  const standings = Array.from(stats.values());
  standings.sort((x, y) =>
    y.matchPoints - x.matchPoints ||
    y.directWins - x.directWins ||
    y.totalScore - x.totalScore ||
    y.meteorCompleted - x.meteorCompleted ||
    x.retries - y.retries
  );
  standings.forEach((s, i) => {
    if (i > 0 && s.played > 0) {
      const prev = standings[i - 1];
      s.tieBreak = prev.matchPoints === s.matchPoints && prev.directWins === s.directWins &&
        prev.totalScore === s.totalScore && prev.meteorCompleted === s.meteorCompleted && prev.retries === s.retries;
      if (s.tieBreak) prev.tieBreak = true;
    }
    s.rank = i + 1;
  });
  return standings;
}

// Circle method — chia N đội thành các Round vòng tròn, mỗi Round là mảng cặp
// [teamIdA, teamIdB]. Số đội lẻ → thêm 1 "bye" (đội đó nghỉ vòng đó, không sinh trận).
export function generateRoundRobin(teamIds) {
  const ids = teamIds.slice();
  if (ids.length < 2) return [];
  if (ids.length % 2 !== 0) ids.push(null);
  const n = ids.length;
  const rounds = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return rounds;
}
