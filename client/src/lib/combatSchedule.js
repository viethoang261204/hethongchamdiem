// Xếp lịch vòng tròn đối kháng theo LƯỢT chạy song song trên nhiều sân.
//
// Mô hình: các sân của 1 group chạy song song, trận cùng STT (match_no) trên
// các sân = cùng 1 lượt (diễn ra cùng lúc). Vì vậy STT được đánh THẲNG HÀNG
// giữa các sân (lượt k → STT k trên mọi sân), không đếm riêng từng sân.
//
// Ràng buộc cứng: 1 đội KHÔNG BAO GIỜ đá 2 lượt liền nhau (giữa 2 trận của
// cùng 1 đội phải có ≥ 1 lượt nghỉ), và tất nhiên không đá 2 trận trong cùng
// 1 lượt. Ưu tiên thử nghỉ ≥ 2 lượt trước; không xếp được thì hạ xuống ≥ 1
// lượt; vẫn không lấp đầy được mọi sân thì cho phép lượt thiếu trận (kéo dài
// thêm vài lượt) chứ không vi phạm. Chỉ khi nhóm quá ít đội không thể tránh
// (VD 2-3 đội) mới chấp nhận đá liền.
//
// Thuật toán: greedy ngẫu nhiên có trọng số (ưu tiên đội còn nhiều trận / đã
// chờ lâu), chạy nhiều seed, lấy phương án ít lượt nhất.

function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// pairs: [{ teamAId, teamBId, ... }]; lastSlot: Map teamId → lượt gần nhất đã
// đá (tính theo STT tuyệt đối, có thể có từ trận cũ). Trả về mảng lượt
// (mỗi lượt là mảng pair) hoặc null nếu không xếp được theo đúng ràng buộc.
function buildSlots(pairs, fieldCount, gap, allowPartial, startSlot, lastSlot, rand) {
  const left = pairs.slice();
  const last = new Map(lastSlot);
  const remaining = new Map();
  for (const p of pairs) {
    for (const t of [p.teamAId, p.teamBId]) remaining.set(t, (remaining.get(t) || 0) + 1);
  }
  const minSlots = Math.ceil(pairs.length / fieldCount);
  const slots = [];
  const maxSlots = pairs.length + 5;
  while (left.length) {
    if (slots.length >= maxSlots) return null;
    const s = startSlot + slots.length;
    const used = new Set();
    const ok = (t) => !used.has(t) && (!last.has(t) || s - last.get(t) >= gap);
    const slotsLeft = Math.max(1, minSlots - slots.length);
    const cur = [];
    while (cur.length < fieldCount && left.length) {
      let best = -1, bestScore = -Infinity;
      for (let i = 0; i < left.length; i++) {
        const p = left[i];
        if (!ok(p.teamAId) || !ok(p.teamBId)) continue;
        const urgency = (t) => (remaining.get(t) / slotsLeft) * 10 + Math.min(s - (last.get(t) ?? s - 10), 10) * 0.5;
        const score = urgency(p.teamAId) + urgency(p.teamBId) + rand() * 2;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0) break;
      const [p] = left.splice(best, 1);
      cur.push(p);
      for (const t of [p.teamAId, p.teamBId]) {
        used.add(t);
        last.set(t, s);
        remaining.set(t, remaining.get(t) - 1);
      }
    }
    if (!cur.length) {
      if (!allowPartial) return null;
      slots.push([]); // lượt trống — chờ đội nghỉ đủ (hiếm, chỉ khi rất ít đội)
      continue;
    }
    if (!allowPartial && cur.length < fieldCount && left.length) return null;
    slots.push(cur);
  }
  // Bỏ lượt trống ở cuối (không có), giữ lượt trống ở giữa để giữ khoảng nghỉ
  return slots;
}

function scheduleSlots(pairs, fieldCount, startSlot, lastSlot) {
  const attempts = [
    { gap: 3, partial: false, seeds: 300 },
    { gap: 2, partial: false, seeds: 1500 },
    { gap: 2, partial: true, seeds: 300 },
    { gap: 1, partial: true, seeds: 50 },
  ];
  for (const a of attempts) {
    let best = null;
    for (let seed = 1; seed <= a.seeds; seed++) {
      const slots = buildSlots(pairs, fieldCount, a.gap, a.partial, startSlot, lastSlot, makeRng(seed));
      if (!slots) continue;
      if (!best || slots.length < best.length) best = slots;
      if (!a.partial) break; // full slots = số lượt tối thiểu, không cần thử thêm
    }
    if (best) return best;
  }
  return pairs.map((p) => [p]); // không bao giờ tới đây (gap 1 + partial luôn xếp được)
}

// Gán sân cho các trận trong 1 lượt: mỗi trận 1 sân khác nhau, ưu tiên sân
// nằm trong field đã gán cho 2 đội, cân bằng số trận mỗi đội đá ở từng sân.
function assignFields(slot, groupFields, candidatesOf, teamFieldUsage) {
  const cost = (p, f) => {
    const allowed = candidatesOf(p);
    const penalty = allowed.has(f.id) ? 0 : 1000;
    const a = teamFieldUsage.get(`${p.teamAId}:${f.id}`) || 0;
    const b = teamFieldUsage.get(`${p.teamBId}:${f.id}`) || 0;
    return penalty + a * a + b * b;
  };
  let bestAssign = null, bestCost = Infinity;
  const used = new Set();
  const cur = [];
  // Số sân/lượt nhỏ (thường 1-4) → duyệt hết hoán vị; nhiều sân thì greedy.
  if (groupFields.length <= 6) {
    const rec = (i, acc) => {
      if (acc >= bestCost) return;
      if (i === slot.length) { bestCost = acc; bestAssign = cur.slice(); return; }
      for (const f of groupFields) {
        if (used.has(f.id)) continue;
        used.add(f.id); cur.push(f);
        rec(i + 1, acc + cost(slot[i], f));
        used.delete(f.id); cur.pop();
      }
    };
    rec(0, 0);
  } else {
    bestAssign = slot.map((p) => {
      let best = null, bc = Infinity;
      for (const f of groupFields) {
        if (used.has(f.id)) continue;
        const c = cost(p, f);
        if (c < bc) { bc = c; best = f; }
      }
      used.add(best.id);
      return best;
    });
  }
  bestAssign.forEach((f, i) => {
    for (const t of [slot[i].teamAId, slot[i].teamBId]) {
      const key = `${t}:${f.id}`;
      teamFieldUsage.set(key, (teamFieldUsage.get(key) || 0) + 1);
    }
  });
  return bestAssign;
}

// Lập lịch cho các cặp còn thiếu của 1 group.
//   pairs        — [{ teamAId, teamBId }] (đúng thứ tự đội Đỏ/Xanh muốn lưu)
//   teamsById    — Map teamId → team (có team.fields = sân đã gán cho đội)
//   allFields    — danh sách sân của cuộc thi
//   matches      — trận đã có của nội dung (để nối tiếp STT và khoảng nghỉ)
// Trả về [{ pair, field, matchNo }] theo đúng thứ tự lượt.
export function planGroupSchedule({ pairs, teamsById, allFields, matches }) {
  if (!pairs.length) return [];
  const teamIds = new Set(pairs.flatMap((p) => [p.teamAId, p.teamBId]));
  const fieldIdsOfTeams = new Set();
  for (const id of teamIds) for (const f of teamsById.get(id)?.fields || []) fieldIdsOfTeams.add(f.id);
  let groupFields = allFields.filter((f) => fieldIdsOfTeams.has(f.id));
  if (!groupFields.length) groupFields = allFields.slice();
  groupFields.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));

  const candidatesOf = (p) => {
    const ids = new Set([...(teamsById.get(p.teamAId)?.fields || []), ...(teamsById.get(p.teamBId)?.fields || [])].map((f) => f.id));
    return ids.size ? ids : new Set(groupFields.map((f) => f.id));
  };

  // Nối tiếp sau các trận đã có trên những sân này (STT thẳng hàng giữa
  // các sân) và tính khoảng nghỉ với trận cũ của chính các đội trong group.
  const groupFieldIds = new Set(groupFields.map((f) => f.id));
  let startSlot = 1;
  const lastSlot = new Map();
  const teamFieldUsage = new Map();
  for (const m of matches) {
    const no = parseInt(m.match_no, 10);
    if (m.field_id && groupFieldIds.has(m.field_id) && !Number.isNaN(no)) startSlot = Math.max(startSlot, no + 1);
    for (const t of [m.team_a_id, m.team_b_id]) {
      if (!teamIds.has(t)) continue;
      if (!Number.isNaN(no)) lastSlot.set(t, Math.max(lastSlot.get(t) ?? -Infinity, no));
      if (m.field_id) teamFieldUsage.set(`${t}:${m.field_id}`, (teamFieldUsage.get(`${t}:${m.field_id}`) || 0) + 1);
    }
  }

  const fieldCount = Math.max(1, groupFields.length);
  const slots = scheduleSlots(pairs, fieldCount, startSlot, lastSlot);
  const result = [];
  slots.forEach((slot, idx) => {
    if (!slot.length) return;
    const fields = groupFields.length ? assignFields(slot, groupFields, candidatesOf, teamFieldUsage) : slot.map(() => null);
    slot.forEach((pair, i) => result.push({ pair, field: fields[i], matchNo: startSlot + idx }));
  });
  return result;
}

// Thứ tự hiển thị/xuất trận: theo STT (match_no, số) rồi theo tên sân — trận
// cùng STT ở các sân là cùng 1 lượt. Trận chưa có STT xếp cuối.
export function compareMatchOrder(a, b) {
  const no = (m) => { const n = parseInt(m.match_no, 10); return Number.isNaN(n) ? Infinity : n; };
  const d = no(a) - no(b);
  if (d) return d;
  return (a.field?.name || '').localeCompare(b.field?.name || '', undefined, { numeric: true });
}
