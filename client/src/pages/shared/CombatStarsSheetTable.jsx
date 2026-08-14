import { useLang, t } from '../../lib/i18n';
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
 * Render tiếng Anh hay tiếng Việt theo user.language (client/src/lib/i18n.js).
 *
 * Props:
 *   match    — 1 dòng combat_matches (đã có nested team_a/team_b/boards)
 *   sheetRef — ref gắn vào root, dùng để html2canvas chụp xuất PDF
 */
export default function CombatStarsSheetTable({ match, sheetRef }) {
  const lang = useLang();
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
        <tr><td colSpan={7} className="ss-title">{t(lang, 'Scoring Sheet of Battle of Stars', 'Phiếu điểm Battle of Stars')}</td></tr>

        <tr>
          <td colSpan={4}><span className="ss-label">{t(lang, 'Red team:', 'Đội Đỏ:')}</span> {match?.team_a?.name || ''}</td>
          <td colSpan={3}><span className="ss-label">Division:</span> {d.division || ''}</td>
        </tr>
        <tr>
          <td colSpan={4}><span className="ss-label">{t(lang, 'Blue team:', 'Đội Xanh:')}</span> {match?.team_b?.name || ''}</td>
          <td colSpan={3}><span className="ss-label">{t(lang, 'Stage:', 'Vòng đấu:')}</span> {match?.stage || match?.group_label || ''}</td>
        </tr>

        <tr className="ss-header-row">
          <th>{t(lang, 'Task', 'Nhiệm vụ')}</th>
          <th colSpan={2}>{t(lang, 'Description', 'Mô tả')}</th>
          <th className="ss-center">{t(lang, 'Points (max)', 'Điểm (tối đa)')}</th>
          <th className="ss-center">{t(lang, 'Red', 'Đỏ')}</th>
          <th className="ss-center" colSpan={2}>{t(lang, 'Blue', 'Xanh')}</th>
        </tr>

        {taskRow('Meteor Tower', t(lang, 'Completed = 100, not completed = 0', 'Hoàn thành = 100, chưa hoàn thành = 0'),
          sideA.meteorCompleted ? t(lang, 'Completed', 'Hoàn thành') : t(lang, 'Not completed', 'Chưa hoàn thành'),
          sideB.meteorCompleted ? t(lang, 'Completed', 'Hoàn thành') : t(lang, 'Not completed', 'Chưa hoàn thành'),
          scoreA.meteorScore, scoreB.meteorScore)}
        {taskRow('Energy Defense', `${ENERGY_BLOCK_SCORE} ${t(lang, 'pts / block', 'đ/khối')} (${t(lang, 'max', 'tối đa')} ${ENERGY_BLOCK_MAX})`,
          `${sideA.energyBlocks} ${t(lang, 'blocks', 'khối')}`, `${sideB.energyBlocks} ${t(lang, 'blocks', 'khối')}`,
          scoreA.energyScore, scoreB.energyScore)}
        {taskRow('Full Firepower', `${FIREPOWER_BALL_SCORE} ${t(lang, 'pts / star power ball', 'đ/quả năng lượng')} (${t(lang, 'max', 'tối đa')} ${FIREPOWER_BALL_MAX})`,
          `${sideA.firepowerBalls} ${t(lang, 'balls', 'quả')}`, `${sideB.firepowerBalls} ${t(lang, 'balls', 'quả')}`,
          scoreA.firepowerScore, scoreB.firepowerScore)}
        {taskRow('Final Fortress', t(lang, 'No points — valid energy ball capture = Direct Win', 'Không tính điểm — thu năng lượng hợp lệ = Direct Win'),
          sideA.directWin ? 'Direct Win' : '—', sideB.directWin ? 'Direct Win' : '—', '', '')}

        <tr className="ss-row-extra">
          <td className="ss-label">{t(lang, 'Extra reward', 'Điểm thưởng thêm')}</td>
          <td colSpan={2}>
            {t(lang, '0 retry = 40, 1 = 30, 2 = 20, 3 = 10, ≥4 = 0', '0 lần thử lại = 40, 1 = 30, 2 = 20, 3 = 10, ≥4 = 0')}
            <div className="ss-small">{t(lang, 'Retries', 'Số lần thử lại')} — {t(lang, 'Red', 'Đỏ')}: <strong>{sideA.retryCount}</strong> · {t(lang, 'Blue', 'Xanh')}: <strong>{sideB.retryCount}</strong></div>
          </td>
          <td></td>
          <td className="ss-center"><strong>{scoreA.extraReward}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{scoreB.extraReward}</strong></td>
        </tr>
        <tr>
          <td className="ss-label">{t(lang, 'Points lost', 'Điểm bị trừ')}</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{sideA.pointsLost}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{sideB.pointsLost}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">{t(lang, 'Task Score', 'Điểm nhiệm vụ')}</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{scoreA.taskScore}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{scoreB.taskScore}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">{t(lang, 'Total duration', 'Tổng thời gian')}</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{d.durationA ? formatSecondsAsMinutes(d.durationA) : ''}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{d.durationB ? formatSecondsAsMinutes(d.durationB) : ''}</strong></td>
        </tr>

        <tr>
          <td className="ss-label">{t(lang, 'Winner', 'Đội thắng')}</td>
          <td colSpan={6}>
            <strong>
              {winnerSide === 'Red' ? match?.team_a?.name
                : winnerSide === 'Blue' ? match?.team_b?.name
                : match?.is_draw ? t(lang, 'Draw', 'Hòa') : ''}
            </strong>
          </td>
        </tr>

        <tr><td colSpan={7} className="ss-section">{t(lang, 'Scoring confirmation', 'Xác nhận điểm')}</td></tr>
        <tr><td colSpan={7} className="ss-confirm-text">{t(lang, 'I hereby confirm that the scores above are correct and valid, with no objection.', 'Tôi xác nhận điểm số ở trên là chính xác và hợp lệ, không có khiếu nại.')}</td></tr>
        <tr>
          <td colSpan={4}>
            <div className="ss-label">{t(lang, "Team's confirmation", 'Xác nhận của đội')}</div>
            <div>
              {t(lang, 'Red', 'Đỏ')}: <strong>{d.teamMembersA || ''}</strong>
              {d.studentSignatureImageA && <div><img src={d.studentSignatureImageA} alt="Red team signature" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              {t(lang, 'Blue', 'Xanh')}: <strong>{d.teamMembersB || ''}</strong>
              {d.studentSignatureImageB && <div><img src={d.studentSignatureImageB} alt="Blue team signature" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
          <td colSpan={3}>
            <div className="ss-label">{t(lang, "Referee's confirmation", 'Xác nhận của trọng tài')}</div>
            <div>
              <strong>{d.refereeSignature || ''}</strong>
              {d.refereeSignatureImage && <div><img src={d.refereeSignatureImage} alt="Referee signature" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
        </tr>

        <tr>
          <td className="ss-label">{t(lang, 'Recommendation', 'Kiến nghị')}</td>
          <td colSpan={6}>{d.objection || ''}</td>
        </tr>
        <tr>
          <td className="ss-label">{t(lang, 'Head Referee', 'Trưởng ban trọng tài')}</td>
          <td colSpan={2}>{d.headRefereeName || 'Mr Ly Quang Van'}</td>
          <td className="ss-label">{t(lang, 'Scorekeeper', 'Người ghi điểm')}</td>
          <td colSpan={3}>{d.scorekeeperName || ''}</td>
        </tr>
        {d.remarks && (
          <tr>
            <td className="ss-label">{t(lang, 'Remarks', 'Ghi chú')}</td>
            <td colSpan={6}>{d.remarks}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
