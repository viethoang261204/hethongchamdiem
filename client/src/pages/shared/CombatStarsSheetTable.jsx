import { useLang, t } from '../../lib/i18n';
import { formatSecondsAsMinutes } from '../../lib/time';
import {
  ENERGY_BLOCK_MAX, FIREPOWER_BALL_MAX, ENERGY_BLOCK_SCORE, FIREPOWER_BALL_SCORE, METEOR_TOWER_SCORE,
  computeTaskScore, sideFromDetails, STARS_MISSIONS,
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

  // Tên + mô tả + cột "Điểm (tối đa)" theo đúng phiếu giấy; giá trị trọng tài
  // nhập (hoàn thành / số khối / số quả) hiện kèm trong ô điểm từng đội.
  const taskRow = (mission, maxPoints, valueA, valueB, scoreCellA, scoreCellB) => (
    <tr>
      <td className="ss-label">{t(lang, mission.en, mission.vi)}</td>
      <td colSpan={2}>{t(lang, mission.descEn, mission.descVi)}</td>
      <td className="ss-center">{maxPoints}</td>
      <td className="ss-center">{valueA} <strong>{scoreCellA}</strong></td>
      <td className="ss-center" colSpan={2}>{valueB} <strong>{scoreCellB}</strong></td>
    </tr>
  );

  return (
    <table className="ss-sheet" ref={sheetRef}>
      <tbody>
        <tr><td colSpan={7} className="ss-title">{t(lang, 'Scoring Sheet of Battle of Stars', 'Phiếu chấm điểm: Đại Chiến Vì Sao')}</td></tr>

        <tr>
          <td colSpan={4}><span className="ss-label">{t(lang, 'Red team:', 'Đội Đỏ:')}</span> {match?.team_a?.name || ''}</td>
          <td colSpan={3}><span className="ss-label">{t(lang, 'Division:', 'Bảng thi:')}</span> {d.division || ''}</td>
        </tr>
        <tr>
          <td colSpan={4}><span className="ss-label">{t(lang, 'Blue team:', 'Đội Xanh:')}</span> {match?.team_b?.name || ''}</td>
          <td colSpan={3}><span className="ss-label">{t(lang, 'Stage:', 'Vòng thi:')}</span> {match?.stage || match?.group_label || ''}</td>
        </tr>

        <tr className="ss-header-row">
          <th>{t(lang, 'Task', 'Nhiệm vụ')}</th>
          <th colSpan={2}>{t(lang, 'Description', 'Mô tả')}</th>
          <th className="ss-center">{t(lang, 'Points (max)', 'Điểm (tối đa)')}</th>
          <th className="ss-center">{t(lang, 'Red', 'Đỏ')}</th>
          <th className="ss-center" colSpan={2}>{t(lang, 'Blue', 'Xanh')}</th>
        </tr>

        {taskRow(STARS_MISSIONS.meteor, METEOR_TOWER_SCORE,
          sideA.meteorCompleted ? t(lang, 'Completed', 'Hoàn thành') : t(lang, 'Not completed', 'Chưa hoàn thành'),
          sideB.meteorCompleted ? t(lang, 'Completed', 'Hoàn thành') : t(lang, 'Not completed', 'Chưa hoàn thành'),
          scoreA.meteorScore, scoreB.meteorScore)}
        {taskRow(STARS_MISSIONS.energy, `${ENERGY_BLOCK_SCORE} / ${t(lang, 'block', '1 khối')} (${t(lang, 'max', 'tối đa')} ${ENERGY_BLOCK_MAX})`,
          `${sideA.energyBlocks} ${t(lang, 'blocks', 'khối')}`, `${sideB.energyBlocks} ${t(lang, 'blocks', 'khối')}`,
          scoreA.energyScore, scoreB.energyScore)}
        {taskRow(STARS_MISSIONS.firepower, `${FIREPOWER_BALL_SCORE} / ${t(lang, 'ball', '1 quả')} (${t(lang, 'max', 'tối đa')} ${FIREPOWER_BALL_MAX})`,
          `${sideA.firepowerBalls} ${t(lang, 'balls', 'quả')}`, `${sideB.firepowerBalls} ${t(lang, 'balls', 'quả')}`,
          scoreA.firepowerScore, scoreB.firepowerScore)}
        {taskRow(STARS_MISSIONS.fortress, 'Direct Win',
          sideA.directWin ? 'Direct Win' : '—', sideB.directWin ? 'Direct Win' : '—', '', '')}

        <tr className="ss-row-extra">
          <td className="ss-label">{t(lang, 'Extra reward', 'Điểm thưởng')}</td>
          <td colSpan={2}>
            {t(lang, '40 − (retries) × 10, ≥ 0', '40 − (Số lần thử lại) × 10, ≥ 0')}
            <div className="ss-small">{t(lang, 'Retries', 'Số lần thử lại')} — {t(lang, 'Red', 'Đỏ')}: <strong>{sideA.retryCount}</strong> · {t(lang, 'Blue', 'Xanh')}: <strong>{sideB.retryCount}</strong></div>
          </td>
          <td className="ss-center">40</td>
          <td className="ss-center"><strong>{scoreA.extraReward}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{scoreB.extraReward}</strong></td>
        </tr>
        <tr>
          <td className="ss-label">{t(lang, 'Points lost', 'Điểm trừ')}</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="ss-center"><strong>{sideA.pointsLost}</strong></td>
          <td className="ss-center" colSpan={2}><strong>{sideB.pointsLost}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">{t(lang, 'Task Score', 'Điểm Nhiệm Vụ')}</td>
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
        <tr><td colSpan={7} className="ss-confirm-text">{t(lang, 'I hereby confirm that the scores above are correct and valid, with no objection.', 'Tôi xin xác nhận các điểm số ghi trên đây là chính xác, hợp lệ và không có ý kiến thắc mắc.')}</td></tr>
        <tr>
          <td colSpan={4}>
            <div className="ss-label">{t(lang, "Team's confirmation", 'Xác nhận của đội thi')}</div>
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
          <td className="ss-label">{t(lang, 'Recommendation', 'Đề xuất')}</td>
          <td colSpan={6}>{d.objection || ''}</td>
        </tr>
        <tr>
          <td className="ss-label">{t(lang, 'Head Referee', 'Trọng tài trưởng')}</td>
          <td colSpan={2}>{d.headRefereeName || t(lang, 'Mr Ly Quang Van', 'Ông Lý Quảng Văn')}</td>
          <td className="ss-label">{t(lang, 'Scorekeeper', 'Thư ký')}</td>
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
