// Bản port CommonJS của client/src/lib/battleScoring.js — CHỈ phần backend
// cần để tự xác thực/tính lại kết quả trận Battle of Stars (content_format =
// 'combat_stars'), không tin winner_id/is_draw client gửi lên (mục 10 luật:
// "Không cho sửa chương trình/logic scoring ở phía client để làm sai kết quả").
// Giữ 2 file đồng bộ về logic nếu luật thay đổi — KHÔNG áp dụng cho combat_drone.

const METEOR_TOWER_SCORE = 100;
const ENERGY_BLOCK_SCORE = 10;
const ENERGY_BLOCK_MAX = 8;
const FIREPOWER_BALL_SCORE = 15;
const FIREPOWER_BALL_MAX = 8;

function computeExtraReward(retryCount) {
  const r = Math.max(0, Number(retryCount) || 0);
  return Math.max(0, 40 - 10 * r);
}

function computeTaskScore(side) {
  const meteorCompleted = !!(side && side.meteorCompleted);
  const energyBlocks = Math.min(ENERGY_BLOCK_MAX, Math.max(0, Number(side && side.energyBlocks) || 0));
  const firepowerBalls = Math.min(FIREPOWER_BALL_MAX, Math.max(0, Number(side && side.firepowerBalls) || 0));
  const retryCount = Math.max(0, Number(side && side.retryCount) || 0);
  const pointsLost = Math.max(0, Number(side && side.pointsLost) || 0);

  const meteorScore = meteorCompleted ? METEOR_TOWER_SCORE : 0;
  const energyScore = energyBlocks * ENERGY_BLOCK_SCORE;
  const firepowerScore = firepowerBalls * FIREPOWER_BALL_SCORE;
  const extraReward = computeExtraReward(retryCount);
  const taskScore = meteorScore + energyScore + firepowerScore + extraReward - pointsLost;

  return { meteorCompleted, energyBlocks, firepowerBalls, retryCount, pointsLost, meteorScore, energyScore, firepowerScore, extraReward, taskScore };
}

function determineGroupMatchResult(a, b) {
  const sa = computeTaskScore(a);
  const sb = computeTaskScore(b);
  const directA = !!(a && a.directWin);
  const directB = !!(b && b.directWin);

  if (directA && !directB) return { result: 'A', scoreA: sa, scoreB: sb };
  if (directB && !directA) return { result: 'B', scoreA: sa, scoreB: sb };

  if (sa.taskScore > sb.taskScore) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.taskScore > sa.taskScore) return { result: 'B', scoreA: sa, scoreB: sb };

  if (sa.meteorCompleted && !sb.meteorCompleted) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.meteorCompleted && !sa.meteorCompleted) return { result: 'B', scoreA: sa, scoreB: sb };

  return { result: 'DRAW', scoreA: sa, scoreB: sb };
}

function determineFinalsMatchResult(a, b) {
  const sa = computeTaskScore(a);
  const sb = computeTaskScore(b);
  const directA = !!(a && a.directWin);
  const directB = !!(b && b.directWin);

  if (directA && !directB) return { result: 'A', scoreA: sa, scoreB: sb };
  if (directB && !directA) return { result: 'B', scoreA: sa, scoreB: sb };

  if (sa.taskScore > sb.taskScore) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.taskScore > sa.taskScore) return { result: 'B', scoreA: sa, scoreB: sb };

  if (sa.firepowerScore > sb.firepowerScore) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.firepowerScore > sa.firepowerScore) return { result: 'B', scoreA: sa, scoreB: sb };

  if (sa.meteorCompleted && !sb.meteorCompleted) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.meteorCompleted && !sa.meteorCompleted) return { result: 'B', scoreA: sa, scoreB: sb };

  if (sa.retryCount < sb.retryCount) return { result: 'A', scoreA: sa, scoreB: sb };
  if (sb.retryCount < sa.retryCount) return { result: 'B', scoreA: sa, scoreB: sb };

  return { result: 'TIE_BREAK', scoreA: sa, scoreB: sb };
}

function sideFromDetails(details, side) {
  const d = details || {};
  return {
    meteorCompleted: !!d[`meteorCompleted${side}`],
    energyBlocks: Number(d[`energyBlocks${side}`]) || 0,
    firepowerBalls: Number(d[`firepowerBalls${side}`]) || 0,
    retryCount: Number(d[`retryCount${side}`]) || 0,
    pointsLost: Number(d[`pointsLost${side}`]) || 0,
    directWin: !!d[`directWin${side}`],
  };
}

// Validate raw `details` trước khi tính — mục 10 luật. Trả về string lỗi đầu
// tiên gặp phải, hoặc null nếu hợp lệ.
function validateDetails(details) {
  const d = details || {};
  if (d.directWinA && d.directWinB) return 'Không thể cả hai đội cùng Direct Win.';
  for (const side of ['A', 'B']) {
    const retry = Number(d[`retryCount${side}`]) || 0;
    if (retry < 0) return 'Retry không được âm.';
    const energy = Number(d[`energyBlocks${side}`]) || 0;
    if (energy < 0 || energy > ENERGY_BLOCK_MAX) return `Energy Block phải từ 0 đến ${ENERGY_BLOCK_MAX}.`;
    const fire = Number(d[`firepowerBalls${side}`]) || 0;
    if (fire < 0 || fire > FIREPOWER_BALL_MAX) return `Star Power Ball phải từ 0 đến ${FIREPOWER_BALL_MAX}.`;
  }
  return null;
}

// Tính lại winner_id/is_draw có thẩm quyền từ `details` — dùng group_label để
// biết đây là trận vòng bảng (áp luật 3 bước) hay trận Finals/knockout (áp
// luật 5 bước, group_label rỗng theo đúng quy ước DB hiện có).
function resolveMatchResult({ details, groupLabel, teamAId, teamBId }) {
  const a = sideFromDetails(details, 'A');
  const b = sideFromDetails(details, 'B');
  const { result } = groupLabel
    ? determineGroupMatchResult(a, b)
    : determineFinalsMatchResult(a, b);

  if (result === 'A') return { winner_id: teamAId, is_draw: false };
  if (result === 'B') return { winner_id: teamBId, is_draw: false };
  if (result === 'DRAW') return { winner_id: null, is_draw: true };
  return { winner_id: null, is_draw: false }; // TIE_BREAK — chưa có kết quả
}

module.exports = {
  computeTaskScore,
  determineGroupMatchResult,
  determineFinalsMatchResult,
  sideFromDetails,
  validateDetails,
  resolveMatchResult,
};
