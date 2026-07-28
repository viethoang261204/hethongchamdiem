import { useState, useEffect } from 'react';
import { api } from '../../api';
import { formatSecondsAsMinutes } from '../../lib/time';
import '../referee/InventionTrailScoreForm.css';

const DEFAULT_BONUS_CONFIG = { label: 'Extra reward', base: 40, per_retry: 10 };

/**
 * Score Sheet cho nội dung content_format = 'combat_stars' (Battle of Stars) —
 * theo mẫu giấy: Red/Blue cùng chấm chung 1 bộ nhiệm vụ (tái dùng `tasks` của
 * nội dung), điểm thưởng theo `bonus_config`, Points lost nhập tay, Total
 * duration, đội thắng.
 *
 * Props:
 *   match    — 1 dòng combat_matches (đã có nested team_a/team_b/boards)
 *   content  — object nội dung thi (dùng bonus_config, name)
 *   tasks    — (tuỳ chọn) danh sách nhiệm vụ đã fetch sẵn; nếu không truyền,
 *              component tự fetch theo content.id (dùng khi xem lẻ 1 trận).
 *   sheetRef — ref gắn vào root, dùng để html2canvas chụp xuất PDF
 */
export default function CombatStarsSheetTable({ match, content, tasks: tasksProp, sheetRef }) {
  const [tasksState, setTasksState] = useState(tasksProp || []);
  const contentId = content?.id || match?.contest_content_id;

  useEffect(() => {
    if (tasksProp) { setTasksState(tasksProp); return; }
    if (!contentId) return;
    api.getTasks(contentId).then(setTasksState).catch(() => setTasksState([]));
  }, [contentId, tasksProp]);

  const tasks = (tasksProp || tasksState).slice().sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));
  const d = match?.details || {};
  const bonusCfg = content?.bonus_config || DEFAULT_BONUS_CONFIG;

  const taskScoresA = d.taskScoresA || {};
  const taskScoresB = d.taskScoresB || {};
  const taskQtyA = d.taskQtyA || {};
  const taskQtyB = d.taskQtyB || {};
  const retryA = Number(d.retryCountA) || 0;
  const retryB = Number(d.retryCountB) || 0;
  const extraA = Math.max(0, (Number(bonusCfg.base) || 0) - (Number(bonusCfg.per_retry) || 0) * retryA);
  const extraB = Math.max(0, (Number(bonusCfg.base) || 0) - (Number(bonusCfg.per_retry) || 0) * retryB);
  const lostA = Number(d.pointsLostA) || 0;
  const lostB = Number(d.pointsLostB) || 0;
  const taskSumA = tasks.reduce((s, t) => s + (Number(taskScoresA[t.id]) || 0), 0);
  const taskSumB = tasks.reduce((s, t) => s + (Number(taskScoresB[t.id]) || 0), 0);
  const scoredA = taskSumA + extraA - lostA;
  const scoredB = taskSumB + extraB - lostB;

  const winnerSide = match?.winner_id
    ? (match.winner_id === match?.team_a_id ? 'Red' : match.winner_id === match?.team_b_id ? 'Blue' : '')
    : '';

  return (
    <table className="ss-sheet" ref={sheetRef}>
      <tbody>
        <tr><td colSpan={7} className="ss-title">Scoring Sheet of Battle of Stars</td></tr>

        <tr>
          <td colSpan={4}><span className="ss-label">Red team:</span> {match?.team_a?.name || ''}</td>
          <td colSpan={3}><span className="ss-label">Division:</span> {d.division || ''}</td>
        </tr>
        <tr>
          <td colSpan={4}><span className="ss-label">Blue team:</span> {match?.team_b?.name || ''}</td>
          <td colSpan={3}><span className="ss-label">Stage:</span> {match?.stage || ''}</td>
        </tr>

        <tr className="ss-header-row">
          <th>Task</th>
          <th colSpan={2}>Description</th>
          <th className="ss-center">Points (max)</th>
          <th className="ss-center">Red — Qty / Points</th>
          <th className="ss-center" colSpan={2}>Blue — Qty / Points</th>
        </tr>
        {tasks.map((t) => (
          <tr key={t.id}>
            <td className="ss-label">{t.name}</td>
            <td colSpan={2}>{t.description || ''}</td>
            <td className="ss-center">{t.max_score}</td>
            <td className="ss-center">
              {t.scoring_type === 'count' ? `${taskQtyA[t.id] ?? 0} / ` : ''}
              <strong>{taskScoresA[t.id] ?? ''}</strong>
            </td>
            <td className="ss-center" colSpan={2}>
              {t.scoring_type === 'count' ? `${taskQtyB[t.id] ?? 0} / ` : ''}
              <strong>{taskScoresB[t.id] ?? ''}</strong>
            </td>
          </tr>
        ))}

        <tr className="ss-row-extra">
          <td className="ss-label">{bonusCfg.label || 'Extra reward'}</td>
          <td colSpan={2}>
            {bonusCfg.base} &minus; {bonusCfg.per_retry} &times; number of retries (&ge;0)
            <div className="ss-small">Retries — Red: <strong>{retryA}</strong> · Blue: <strong>{retryB}</strong></div>
          </td>
          <td></td>
          <td className="ss-center"><strong>{extraA}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{extraB}</strong></td>
        </tr>
        <tr>
          <td className="ss-label">Points lost</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{lostA}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{lostB}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Points scored</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{scoredA}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{scoredB}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Total duration</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{d.durationA ? formatSecondsAsMinutes(d.durationA) : ''}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{d.durationB ? formatSecondsAsMinutes(d.durationB) : ''}</strong></td>
        </tr>

        <tr>
          <td className="ss-label">Winner</td>
          <td colSpan={6}>
            <strong>
              {winnerSide === 'Red' ? match?.team_a?.name
                : winnerSide === 'Blue' ? match?.team_b?.name
                : match?.is_draw ? 'Draw' : ''}
            </strong>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
