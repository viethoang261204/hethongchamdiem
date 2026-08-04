// So sánh before_data/after_data (snapshot toàn bộ dòng scores dạng jsonb, xem
// server/routes.cjs score_edits) để hiện đúng "đã đổi mục gì" thay vì chỉ
// đổi điểm — dùng chung cho AdminScoreDetail (xem trong hệ thống) và
// ScoreSheetTable (in báo cáo/PDF).

import { formatSecondsAsMinutes } from './time';

const FIELD_LABELS = {
  score: 'Điểm',
  time: 'Thời gian',
  retry_count: 'Số lần chạy lại',
  bonus_points: 'Điểm thưởng',
  notes: 'Ghi chú',
  arena_entry_time: 'Thời gian bắt đầu vào sân',
  head_referee_name: 'Trưởng ban trọng tài',
  scorekeeper_name: 'Người ghi điểm',
  objection: 'Kiến nghị',
  round: 'Lượt',
};

const TIME_FIELDS = new Set(['time']);

function formatValue(field, v) {
  if (v === null || v === undefined || v === '') return '(trống)';
  if (TIME_FIELDS.has(field)) return formatSecondsAsMinutes(v) || v;
  return String(v);
}

// Trả về mảng { field, label, before, after } cho các cột thực sự đổi giá trị.
// criteria_scores (chi tiết chấm từng nhiệm vụ) không so sánh từng phần —
// chỉ báo có đổi hay không, tránh liệt kê rối mắt.
export function diffScoreEdit(before, after) {
  if (!before || !after) return [];
  const changes = [];
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const b = before[field] ?? null;
    const a = after[field] ?? null;
    if (String(b ?? '') !== String(a ?? '')) {
      changes.push({ field, label, before: formatValue(field, b), after: formatValue(field, a) });
    }
  }
  if (JSON.stringify(before.criteria_scores || {}) !== JSON.stringify(after.criteria_scores || {})) {
    changes.push({ field: 'criteria_scores', label: 'Chi tiết chấm điểm', before: '—', after: 'Đã thay đổi' });
  }
  return changes;
}
