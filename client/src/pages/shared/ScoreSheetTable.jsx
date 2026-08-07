import { useState, useEffect } from 'react';
import { api } from '../../api';
import { formatSecondsAsMinutes } from '../../lib/time';
import { diffScoreEdit } from '../../lib/scoreEditDiff';
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
  const [edits, setEdits] = useState([]);
  const round1 = scores.find((s) => s.round === 1) || null;
  const round2 = scores.find((s) => s.round === 2) || null;
  const team = round1?.team || round2?.team;
  const contentId = round1?.contest_content_id || round2?.contest_content_id || content?.id;

  useEffect(() => {
    if (tasksProp) { setTasksState(tasksProp); return; }
    if (!contentId) return;
    api.getTasks(contentId).then(setTasksState).catch(() => setTasksState([]));
  }, [contentId, tasksProp]);

  // Lịch sử sửa điểm — chỉ admin xem được (GET /scores/:id/edits requireAdmin),
  // trọng tài sẽ nhận lỗi quyền và section này tự ẩn (không hiện gì, không crash).
  useEffect(() => {
    const ids = [round1?.id, round2?.id].filter(Boolean);
    if (!ids.length) { setEdits([]); return; }
    Promise.all(ids.map((id) => api.getScoreEdits(id).catch(() => [])))
      .then((lists) => setEdits(lists.flat().sort((a, b) => new Date(b.edited_at) - new Date(a.edited_at))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round1?.id, round2?.id]);

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
      round1Tier: cs1.taskTier?.[t.id],
      round2Tier: cs2.taskTier?.[t.id],
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
            <td className="ss-center">
              <strong>{r.round1Points ?? ''}</strong>
              {r.round1Tier && <div className="ss-small">{r.round1Tier}</div>}
            </td>
            <td className="ss-center">
              <strong>{r.round2Points ?? ''}</strong>
              {r.round2Tier && <div className="ss-small">{r.round2Tier}</div>}
            </td>
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

        {edits.length > 0 && (
          <>
            <tr><td colSpan={7} className="ss-section">Edit history</td></tr>
            {edits.map((e) => {
              const changes = diffScoreEdit(e.before_data, e.after_data);
              return (
                <tr key={e.id}>
                  <td colSpan={7} style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12.5 }}>
                      <strong>{e.edited_at ? new Date(e.edited_at).toLocaleString('vi-VN') : ''}</strong>
                      {' · '}Round {e.round || '-'}
                      {' · '}Reviewed &amp; edited by: <strong>{e.reviewer_name || e.users?.full_name || '-'}</strong>
                    </div>
                    {changes.length > 0 && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
                        {changes.map((c) => (
                          <li key={c.field}>{c.label}: {c.before} → <strong>{c.after}</strong></li>
                        ))}
                      </ul>
                    )}
                    {e.note && <div style={{ marginTop: 4, fontSize: 12.5 }}>Note: {e.note}</div>}
                    {e.reviewer_signature && (
                      <div style={{ marginTop: 4 }}>
                        <img src={e.reviewer_signature} alt="Reviewer signature" style={{ maxHeight: 44, maxWidth: '100%' }} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </>
        )}
      </tbody>
    </table>
  );
}
