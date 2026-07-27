import { useState, useEffect } from 'react';
import { api } from '../../api';
import { formatSecondsAsMinutes } from '../../lib/time';
import '../referee/InventionTrailScoreForm.css';

/**
 * Score Sheet cho các phiếu chấm bằng TaskScoringWizard (đa số phiếu hiện nay) —
 * theo đúng mẫu "Phiếu điểm Mẫu.docx": 1 phiếu gộp cả 2 lượt (round 1 + round 2)
 * cạnh nhau, đọc lại từng nhiệm vụ từ bảng tasks (nếu nhiệm vụ đã bị xóa thì
 * vẫn hiện điểm, chỉ mất tên/mô tả).
 *
 * Props:
 *   scores  — mảng các phiếu (round 1 + round 2) của cùng đội/nội dung
 *   content — object nội dung thi
 *   tasks   — (tuỳ chọn) danh sách nhiệm vụ đã fetch sẵn; nếu không truyền,
 *             component tự fetch theo contentId (dùng khi xem lẻ 1 phiếu).
 *             Truyền sẵn khi export hàng loạt nhiều đội để tránh gọi API lặp lại.
 *   sheetRef — ref gắn vào root element, dùng để html2canvas chụp xuất PDF.
 */
export default function ScoreSheetTable({ scores, content, tasks: tasksProp, sheetRef }) {
  const [tasksState, setTasksState] = useState(tasksProp || []);
  const round1 = scores.find((s) => s.round === 1) || null;
  const round2 = scores.find((s) => s.round === 2) || null;
  const team = round1?.team || round2?.team;
  const contentId = round1?.contest_content_id || round2?.contest_content_id || content?.id;

  useEffect(() => {
    if (tasksProp) { setTasksState(tasksProp); return; }
    if (!contentId) return;
    api.getTasks(contentId).then(setTasksState).catch(() => setTasksState([]));
  }, [contentId, tasksProp]);

  const tasks = tasksProp || tasksState;
  const cs1 = round1?.criteria_scores || {};
  const cs2 = round2?.criteria_scores || {};

  const rows = tasks
    .slice()
    .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999))
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      maxScore: t.max_score,
      round1Points: cs1.taskScores?.[t.id],
      round2Points: cs2.taskScores?.[t.id],
    }));

  const totalMaxScore = tasks.reduce((sum, t) => sum + (Number(t.max_score) || 0), 0);

  const bonus1 = Number(round1?.bonus_points ?? cs1.extraReward) || 0;
  const bonus2 = Number(round2?.bonus_points ?? cs2.extraReward) || 0;
  const retry1 = round1?.retry_count ?? cs1.rerunCount ?? 0;
  const retry2 = round2?.retry_count ?? cs2.rerunCount ?? 0;

  const contestantName = cs2.teamMembers || cs1.teamMembers || '';

  const headReferee = round2?.head_referee_name || round1?.head_referee_name || 'Mr Ly Quang Van';
  const scorekeeper = round2?.scorekeeper_name || round1?.scorekeeper_name || '';

  const recommendation = [
    round1?.objection ? `Round 1: ${round1.objection}` : '',
    round2?.objection ? `Round 2: ${round2.objection}` : '',
  ].filter(Boolean).join(' — ');

  return (
    <table className="ss-sheet" ref={sheetRef}>
      <tbody>
        <tr><td colSpan={7} className="ss-title">Score Sheet: {content?.name || ''}</td></tr>

        <tr>
          <td colSpan={4}><span className="ss-label">Team name:</span> {team?.name || ''}</td>
          <td colSpan={3}>
            <div><span className="ss-label">Field:</span> {team?.fields?.name || ''}</div>
            <div><span className="ss-label">No.:</span> {team?.order_index != null ? team.order_index + 1 : ''}</div>
          </td>
        </tr>

        <tr>
          <td colSpan={4}><span className="ss-label">Contestant name:</span> {contestantName}</td>
          <td colSpan={3}>
            <div className="ss-label">Time entering the field:</div>
            <div>Round 1: {round1?.arena_entry_time || ''}</div>
            <div>Round 2: {round2?.arena_entry_time || ''}</div>
          </td>
        </tr>

        <tr className="ss-header-row">
          <th>Task</th>
          <th colSpan={3}>Description</th>
          <th className="ss-center">Max score</th>
          <th className="ss-center">Round 1 score</th>
          <th className="ss-center">Round 2 score</th>
        </tr>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="ss-label">{r.name}</td>
            <td colSpan={3}>{r.description}</td>
            <td className="ss-center">{r.maxScore}</td>
            <td className="ss-center"><strong>{r.round1Points ?? ''}</strong></td>
            <td className="ss-center"><strong>{r.round2Points ?? ''}</strong></td>
          </tr>
        ))}
        <tr className="ss-row-extra">
          <td className="ss-label">Extra reward</td>
          <td colSpan={3}>
            40 &minus; 10 &times; Number of retries (&gt;0)
            <div className="ss-small">Retries — Round 1: <strong>{retry1}</strong> · Round 2: <strong>{retry2}</strong></div>
          </td>
          <td></td>
          <td className="ss-center"><strong>{bonus1}</strong></td>
          <td className="ss-center"><strong>{bonus2}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Total score</td>
          <td colSpan={3}></td>
          <td className="ss-center"><strong>{totalMaxScore}</strong></td>
          <td className="ss-center"><strong>{round1?.score ?? ''}</strong></td>
          <td className="ss-center"><strong>{round2?.score ?? ''}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Time spent</td>
          <td colSpan={3}></td>
          <td></td>
          <td className="ss-center"><strong>{round1 ? formatSecondsAsMinutes(round1.time) : ''}</strong></td>
          <td className="ss-center"><strong>{round2 ? formatSecondsAsMinutes(round2.time) : ''}</strong></td>
        </tr>

        <tr><td colSpan={7} className="ss-section">Scoring confirmation</td></tr>
        <tr><td colSpan={7} className="ss-confirm-text">I hereby confirm that the scores above are correct and valid, with no objection.</td></tr>
        <tr>
          <td colSpan={2}>
            <div className="ss-label">Team's confirmation</div>
            <div>
              Round 1: <strong>{cs1.teamMembers || ''}</strong>
              {cs1.studentSignatureImage && <div><img src={cs1.studentSignatureImage} alt="Team signature — round 1" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              Round 2: <strong>{cs2.teamMembers || ''}</strong>
              {cs2.studentSignatureImage && <div><img src={cs2.studentSignatureImage} alt="Team signature — round 2" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
          <td colSpan={5}>
            <div className="ss-label">Referee's confirmation</div>
            <div>
              Round 1: <strong>{cs1.refereeSignature || ''}</strong>
              {cs1.refereeSignatureImage && <div><img src={cs1.refereeSignatureImage} alt="Referee signature — round 1" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              Round 2: <strong>{cs2.refereeSignature || ''}</strong>
              {cs2.refereeSignatureImage && <div><img src={cs2.refereeSignatureImage} alt="Referee signature — round 2" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
        </tr>

        <tr>
          <td className="ss-label">Recommendation</td>
          <td colSpan={6}>{recommendation}</td>
        </tr>
        <tr>
          <td className="ss-label">Head Referee</td>
          <td colSpan={2}>{headReferee}</td>
          <td className="ss-label">Scorekeeper</td>
          <td colSpan={3}>{scorekeeper}</td>
        </tr>
      </tbody>
    </table>
  );
}
