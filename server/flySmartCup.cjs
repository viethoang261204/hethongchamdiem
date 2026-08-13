// Bản port CommonJS của client/src/lib/flySmartCupScoring.js — CHỈ phần
// backend cần để tự xác thực/tính lại kết quả trận Fly Smart Cup
// (content_format = 'combat_drone'), không tin winner_id/is_draw/status
// client gửi lên (mục 20 luật: "Không để frontend có thể tự ý thay đổi
// Winner hoặc Match Points mà không qua backend validation").
// Giữ đồng bộ logic với client/src/lib/flySmartCupScoring.js nếu luật đổi —
// KHÔNG áp dụng cho combat_stars (xem server/battleScoring.cjs).

const PENALTY_MAX_SECONDS = 30;

function computeSideScore(side) {
  const half1 = Math.max(0, Number(side && side.half1) || 0);
  const half2 = Math.max(0, Number(side && side.half2) || 0);
  const refereeAwarded = Math.max(0, Number(side && side.refereeAwarded) || 0);
  const total = half1 + half2 + refereeAwarded;
  return { half1, half2, refereeAwarded, total };
}

function sideFromDetails(details, side) {
  const d = details || {};
  return {
    half1: Number(d[`firstHalf${side}`]) || 0,
    half2: Number(d[`secondHalf${side}`]) || 0,
    refereeAwarded: Number(d[`refereeAwarded${side}`]) || 0,
    refereeAwardedReason: d[`refereeAwardedReason${side}`] || '',
  };
}

// Vòng sơ loại — CHỈ so Total Score (mục 5), luôn phân định WIN/LOSS/DRAW.
function determineGroupMatchResult(a, b) {
  const sa = computeSideScore(a);
  const sb = computeSideScore(b);
  if (sa.total > sb.total) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.total > sa.total) return { result: 'B', scoreA: sa, scoreB: sb };
  return { result: 'DRAW', scoreA: sa, scoreB: sb };
}

function resolveShootoutWinner(rounds) {
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
    }
  }
  return { winner: null };
}

// Knockout — bằng Total Score → chuyển Penalty Shootout, KHÔNG có Draw (mục 9).
function determineKnockoutResult(a, b, shootoutRounds) {
  const sa = computeSideScore(a);
  const sb = computeSideScore(b);
  if (sa.total > sb.total) return { result: 'A', scoreA: sa, scoreB: sb, shootoutNeeded: false };
  if (sb.total > sa.total) return { result: 'B', scoreA: sa, scoreB: sb, shootoutNeeded: false };
  const sw = resolveShootoutWinner(shootoutRounds);
  if (sw.winner) return { result: sw.winner, scoreA: sa, scoreB: sb, shootoutNeeded: true, decidingShootoutRound: sw.decidingRound };
  return { result: null, scoreA: sa, scoreB: sb, shootoutNeeded: true, shootoutPending: true };
}

// Validate raw `details` trước khi tính — mục 20 luật.
function validateDetails(details) {
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

// Tính lại winner_id/is_draw + status có thẩm quyền từ `details`, dùng
// group_label để biết vòng sơ loại (round robin) hay Knockout — cùng quy ước
// đã có sẵn với Battle of Stars (group_label rỗng = Knockout/Finals).
function resolveMatchResult({ details, groupLabel, teamAId, teamBId, currentStatus }) {
  const a = sideFromDetails(details, 'A');
  const b = sideFromDetails(details, 'B');

  if (groupLabel) {
    const { result } = determineGroupMatchResult(a, b);
    if (result === 'A') return { winner_id: teamAId, is_draw: false, status: 'completed' };
    if (result === 'B') return { winner_id: teamBId, is_draw: false, status: 'completed' };
    return { winner_id: null, is_draw: true, status: 'completed' };
  }

  const details_ = details || {};
  const { result, shootoutNeeded, shootoutPending } = determineKnockoutResult(a, b, details_.shootoutRounds);
  if (result === 'A') return { winner_id: teamAId, is_draw: false, status: 'completed' };
  if (result === 'B') return { winner_id: teamBId, is_draw: false, status: 'completed' };
  // Bằng điểm, cần Penalty Shootout nhưng chưa có round nào phân định được —
  // KHÔNG có kết quả, giữ nguyên status hiện tại (không tự ý coi là completed).
  const base = currentStatus || 'scheduled';
  return { winner_id: null, is_draw: false, status: shootoutNeeded && shootoutPending ? (base === 'scheduled' ? 'live' : base) : base };
}

module.exports = {
  PENALTY_MAX_SECONDS,
  computeSideScore,
  sideFromDetails,
  determineGroupMatchResult,
  determineKnockoutResult,
  resolveShootoutWinner,
  validateDetails,
  resolveMatchResult,
};
