import { formatSecondsAsMinutes } from '../../lib/time';
import {
  ENERGY_BLOCK_MAX, FIREPOWER_BALL_MAX, ENERGY_BLOCK_SCORE, FIREPOWER_BALL_SCORE, METEOR_TOWER_SCORE,
  computeTaskScore, sideFromDetails,
} from '../../lib/battleScoring';
import '../referee/InventionTrailScoreForm.css';

/**
 * Score Sheet cho nội dung content_format = 'combat_stars' (Battle of Stars) —
 * 4 nhiệm vụ cố định theo luật ENJOY AI 2026 (Meteor Tower / Energy Defense /
 * Full Firepower / Final Fortress) + Extra Reward theo retry + Direct Win.
 *
 * Props:
 *   match    — 1 dòng combat_matches (đã có nested team_a/team_b/boards)
 *   sheetRef — ref gắn vào root, dùng để html2canvas chụp xuất PDF
 */
export default function CombatStarsSheetTable({ match, sheetRef }) {
  const d = match?.details || {};
  const sideA = sideFromDetails(d, 'A');
  const sideB = sideFromDetails(d, 'B');
  const scoreA = computeTaskScore(sideA);
  const scoreB = computeTaskScore(sideB);

  const winnerSide = match?.winner_id
    ? (match.winner_id === match?.team_a_id ? 'Red' : match.winner_id === match?.team_b_id ? 'Blue' : '')
    : '';

  const taskRow = (label, hint, valueA, valueB, scoreCellA, scoreCellB) => (
    <tr>
      <td className="ss-label">{label}</td>
      <td colSpan={2}>{hint}</td>
      <td className="ss-center"></td>
      <td className="ss-center">{valueA} <strong>{scoreCellA}</strong></td>
      <td className="ss-center" colSpan={2}>{valueB} <strong>{scoreCellB}</strong></td>
    </tr>
  );

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
          <td colSpan={3}><span className="ss-label">Stage:</span> {match?.stage || match?.group_label || ''}</td>
        </tr>

        <tr className="ss-header-row">
          <th>Task</th>
          <th colSpan={2}>Description</th>
          <th className="ss-center">Points (max)</th>
          <th className="ss-center">Red</th>
          <th className="ss-center" colSpan={2}>Blue</th>
        </tr>

        {taskRow('Meteor Tower', 'Completed = 100, not completed = 0', sideA.meteorCompleted ? 'Completed' : 'Not completed', sideB.meteorCompleted ? 'Completed' : 'Not completed', scoreA.meteorScore, scoreB.meteorScore)}
        {taskRow('Energy Defense', `${ENERGY_BLOCK_SCORE} pts / block (max ${ENERGY_BLOCK_MAX})`, `${sideA.energyBlocks} blocks`, `${sideB.energyBlocks} blocks`, scoreA.energyScore, scoreB.energyScore)}
        {taskRow('Full Firepower', `${FIREPOWER_BALL_SCORE} pts / star power ball (max ${FIREPOWER_BALL_MAX})`, `${sideA.firepowerBalls} balls`, `${sideB.firepowerBalls} balls`, scoreA.firepowerScore, scoreB.firepowerScore)}
        {taskRow('Final Fortress', 'No points — valid energy ball capture = Direct Win', sideA.directWin ? 'Direct Win' : '—', sideB.directWin ? 'Direct Win' : '—', '', '')}

        <tr className="ss-row-extra">
          <td className="ss-label">Extra reward</td>
          <td colSpan={2}>
            0 retry = 40, 1 = 30, 2 = 20, 3 = 10, ≥4 = 0
            <div className="ss-small">Retries — Red: <strong>{sideA.retryCount}</strong> · Blue: <strong>{sideB.retryCount}</strong></div>
          </td>
          <td></td>
          <td className="ss-center"><strong>{scoreA.extraReward}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{scoreB.extraReward}</strong></td>
        </tr>
        <tr>
          <td className="ss-label">Points lost</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{sideA.pointsLost}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{sideB.pointsLost}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Task Score</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{scoreA.taskScore}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{scoreB.taskScore}</strong></td>
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

        <tr><td colSpan={7} className="ss-section">Scoring confirmation</td></tr>
        <tr><td colSpan={7} className="ss-confirm-text">I hereby confirm that the scores above are correct and valid, with no objection.</td></tr>
        <tr>
          <td colSpan={4}>
            <div className="ss-label">Team's confirmation</div>
            <div>
              Red: <strong>{d.teamMembersA || ''}</strong>
              {d.studentSignatureImageA && <div><img src={d.studentSignatureImageA} alt="Red team signature" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              Blue: <strong>{d.teamMembersB || ''}</strong>
              {d.studentSignatureImageB && <div><img src={d.studentSignatureImageB} alt="Blue team signature" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
          <td colSpan={3}>
            <div className="ss-label">Referee's confirmation</div>
            <div>
              <strong>{d.refereeSignature || ''}</strong>
              {d.refereeSignatureImage && <div><img src={d.refereeSignatureImage} alt="Referee signature" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
        </tr>

        <tr>
          <td className="ss-label">Recommendation</td>
          <td colSpan={6}>{d.objection || ''}</td>
        </tr>
        <tr>
          <td className="ss-label">Head Referee</td>
          <td colSpan={2}>{d.headRefereeName || 'Mr Ly Quang Van'}</td>
          <td className="ss-label">Scorekeeper</td>
          <td colSpan={3}>{d.scorekeeperName || ''}</td>
        </tr>
        {d.remarks && (
          <tr>
            <td className="ss-label">Remarks</td>
            <td colSpan={6}>{d.remarks}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
