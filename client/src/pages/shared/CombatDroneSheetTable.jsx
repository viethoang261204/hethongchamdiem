import { useLang, t } from '../../lib/i18n';
import '../referee/InventionTrailScoreForm.css';

/**
 * Score Sheet cho nội dung content_format = 'combat_drone' (Fly Smart Cup) —
 * theo đúng mẫu giấy "Scoring Sheet of Drone Cup" (Appendix I): Red/Blue,
 * hiệp 1/hiệp 2, điểm, đá luân lưu (nếu có), đội thắng. Render tiếng Anh hay
 * tiếng Việt theo user.language của người đang đăng nhập (referee) —
 * client/src/lib/i18n.js. Admin (chưa có language) luôn thấy bản tiếng Anh.
 *
 * Props:
 *   match    — 1 dòng combat_matches (đã có nested team_a/team_b/boards)
 *   sheetRef — ref gắn vào root, dùng để html2canvas chụp xuất PDF
 */
export default function CombatDroneSheetTable({ match, sheetRef }) {
  const lang = useLang();
  const d = match?.details || {};
  const firstHalfA = Number(d.firstHalfA) || 0;
  const firstHalfB = Number(d.firstHalfB) || 0;
  const secondHalfA = Number(d.secondHalfA) || 0;
  const secondHalfB = Number(d.secondHalfB) || 0;
  const refereeAwardedA = Number(d.refereeAwardedA) || 0;
  const refereeAwardedB = Number(d.refereeAwardedB) || 0;
  const pointsA = firstHalfA + secondHalfA + refereeAwardedA;
  const pointsB = firstHalfB + secondHalfB + refereeAwardedB;
  const shootoutRounds = Array.isArray(d.shootoutRounds) ? d.shootoutRounds : [];
  // Dữ liệu cũ (trước khi có shootoutRounds) — vẫn hiển thị được nếu có.
  const legacyPenaltyA = Array.isArray(d.penaltyA) ? d.penaltyA : [];
  const legacyPenaltyB = Array.isArray(d.penaltyB) ? d.penaltyB : [];

  const isVoid = d.status === 'cancelled' || d.status === 'disqualified';
  const half1RedTeam = d.half1RedTeam === 'B' ? 'B' : 'A';
  const half2RedTeam = d.half2RedTeam === 'B' ? 'B' : 'A';
  const colorFor = (side, half) => t(lang, ...((half === 1 ? half1RedTeam : half2RedTeam) === side ? ['Red', 'Đỏ'] : ['Blue', 'Xanh']));
  const winnerName = match?.winner_id
    ? (match.winner_id === match?.team_a_id ? match?.team_a?.name : match.winner_id === match?.team_b_id ? match?.team_b?.name : '')
    : '';
  const winnerNo = match?.winner_id === match?.team_a_id ? match?.team_a_no : match?.winner_id === match?.team_b_id ? match?.team_b_no : '';

  const legacyPenaltyRow = (label, attempts) => (
    <tr key={label}>
      <td className="ss-label" colSpan={2}>{label}</td>
      {[0, 1, 2].map((i) => (
        <td key={i} className="ss-center">
          {attempts[i] ? `${attempts[i].score ?? ''} / ${attempts[i].time ?? ''}` : ''}
        </td>
      ))}
      <td colSpan={2}></td>
    </tr>
  );

  return (
    <table className="ss-sheet" ref={sheetRef}>
      <tbody>
        <tr><td colSpan={7} className="ss-title">{t(lang, 'Scoring Sheet of Drone Cup', 'Phiếu điểm Fly Smart Cup')}</td></tr>

        {isVoid && (
          <tr>
            <td colSpan={7} className="ss-section" style={{ color: '#b91c1c', fontWeight: 700 }}>
              {d.status === 'cancelled' ? t(lang, 'MATCH CANCELLED', 'TRẬN ĐÃ HỦY') : t(lang, 'MATCH — TEAM DISQUALIFIED', 'TRẬN — ĐỘI BỊ TRUẤT QUYỀN')}
              {d.disqualifiedTeam && ` (${d.disqualifiedTeam === 'A' ? match?.team_a?.name : match?.team_b?.name})`}
              {d.disqualificationReason ? ` — ${d.disqualificationReason}` : ''}
            </td>
          </tr>
        )}

        <tr>
          <td colSpan={3}><span className="ss-label">Division:</span> {d.division || ''}</td>
          <td colSpan={2}><span className="ss-label">{t(lang, 'Preliminary / Intermediate:', 'Vòng bảng / Vòng giữa:')}</span> {match?.stage || ''}</td>
          <td colSpan={2}><span className="ss-label">{t(lang, 'Team:', 'Đội:')}</span> {match?.match_no || ''}</td>
        </tr>

        <tr>
          <td colSpan={2}><span className="ss-label">{match?.team_a?.name || t(lang, 'Team 1', 'Đội 1')} {t(lang, 'No.:', 'Số báo danh:')}</span> {match?.team_a_no || ''}</td>
          <td colSpan={2}><span className="ss-label">{match?.team_b?.name || t(lang, 'Team 2', 'Đội 2')} {t(lang, 'No.:', 'Số báo danh:')}</span> {match?.team_b_no || ''}</td>
          <td colSpan={3}><span className="ss-label">{t(lang, 'Group:', 'Bảng:')}</span> {match?.group_label || ''}</td>
        </tr>

        <tr className="ss-header-row">
          <th colSpan={2}></th>
          <th className="ss-center">{match?.team_a?.name || t(lang, 'Team 1', 'Đội 1')}</th>
          <th className="ss-center" colSpan={2}></th>
          <th className="ss-center">{match?.team_b?.name || t(lang, 'Team 2', 'Đội 2')}</th>
          <th></th>
        </tr>
        <tr>
          <td className="ss-label" colSpan={2}>{t(lang, 'First-half scoring', 'Điểm Hiệp 1')}</td>
          <td className="ss-center"><strong>{firstHalfA}</strong> <span className="ss-small">({colorFor('A', 1)})</span></td>
          <td colSpan={2}></td>
          <td className="ss-center"><strong>{firstHalfB}</strong> <span className="ss-small">({colorFor('B', 1)})</span></td>
          <td></td>
        </tr>
        <tr>
          <td className="ss-label" colSpan={2}>{t(lang, 'Second-half scoring', 'Điểm Hiệp 2')}</td>
          <td className="ss-center"><strong>{secondHalfA}</strong> <span className="ss-small">({colorFor('A', 2)})</span></td>
          <td colSpan={2}></td>
          <td className="ss-center"><strong>{secondHalfB}</strong> <span className="ss-small">({colorFor('B', 2)})</span></td>
          <td></td>
        </tr>
        {(refereeAwardedA > 0 || refereeAwardedB > 0) && (
          <tr>
            <td className="ss-label" colSpan={2}>{t(lang, 'Referee Awarded Points', 'Điểm trọng tài thưởng')}</td>
            <td className="ss-center"><strong>{refereeAwardedA}</strong>{d.refereeAwardedReasonA ? <div className="ss-small">{d.refereeAwardedReasonA}</div> : null}</td>
            <td colSpan={2}></td>
            <td className="ss-center"><strong>{refereeAwardedB}</strong>{d.refereeAwardedReasonB ? <div className="ss-small">{d.refereeAwardedReasonB}</div> : null}</td>
            <td></td>
          </tr>
        )}
        <tr className="ss-row-total">
          <td className="ss-label" colSpan={2}>{t(lang, 'Total Score', 'Tổng điểm')}</td>
          <td className="ss-center" colSpan={5}><strong>{pointsA} : {pointsB}</strong></td>
        </tr>

        <tr>
          <td colSpan={7} className="ss-section">
            {t(lang, 'Penalty Shootout', 'Đá luân lưu')} ( {(shootoutRounds.length > 0 || d.penaltyShootout) ? t(lang, 'Yes ✓ / No ___', 'Có ✓ / Không ___') : t(lang, 'Yes ___ / No ✓', 'Có ___ / Không ✓')} )
          </td>
        </tr>
        {shootoutRounds.length > 0 ? (
          <>
            <tr className="ss-header-row">
              <th>{t(lang, 'Round', 'Vòng')}</th>
              <th className="ss-center" colSpan={2}>{match?.team_a?.name || t(lang, 'Team 1', 'Đội 1')} ({t(lang, 'success / time', 'thành công / thời gian')})</th>
              <th className="ss-center" colSpan={2}>{match?.team_b?.name || t(lang, 'Team 2', 'Đội 2')} ({t(lang, 'success / time', 'thành công / thời gian')})</th>
              <th colSpan={2}></th>
            </tr>
            {shootoutRounds.map((r) => (
              <tr key={r.roundNo}>
                <td>{r.roundNo}</td>
                <td className="ss-center" colSpan={2}>{r.aSuccess ? `✓ / ${r.aTimeSeconds ?? ''}s` : t(lang, 'MISS', 'TRƯỢT')}</td>
                <td className="ss-center" colSpan={2}>{r.bSuccess ? `✓ / ${r.bTimeSeconds ?? ''}s` : t(lang, 'MISS', 'TRƯỢT')}</td>
                <td colSpan={2}></td>
              </tr>
            ))}
          </>
        ) : d.penaltyShootout && (
          <>
            <tr className="ss-header-row">
              <th colSpan={2}>{t(lang, 'Attempt', 'Lượt sút')}</th>
              <th className="ss-center">1</th>
              <th className="ss-center">2</th>
              <th className="ss-center">3</th>
              <th colSpan={2}>{t(lang, 'Score / Time', 'Điểm / Thời gian')}</th>
            </tr>
            {legacyPenaltyRow(match?.team_a?.name || t(lang, 'Team 1', 'Đội 1'), legacyPenaltyA)}
            {legacyPenaltyRow(match?.team_b?.name || t(lang, 'Team 2', 'Đội 2'), legacyPenaltyB)}
          </>
        )}

        <tr>
          <td className="ss-label" colSpan={2}>{t(lang, 'Winner', 'Đội thắng')}</td>
          <td colSpan={5}>
            {isVoid ? <strong style={{ color: '#b91c1c' }}>{t(lang, 'N/A', 'Không có')} — {d.status}</strong> : (
              <>
                <strong>{winnerName || (match?.is_draw ? t(lang, 'Draw', 'Hòa') : '')}</strong>
                {winnerNo ? ` — ${t(lang, 'No.', 'Số')} ${winnerNo}` : ''}
              </>
            )}
          </td>
        </tr>

        <tr><td colSpan={7} className="ss-section">{t(lang, 'Scoring confirmation', 'Xác nhận điểm')}</td></tr>
        <tr><td colSpan={7} className="ss-confirm-text">{t(lang, 'I hereby confirm that the scores above are correct and valid, with no objection.', 'Tôi xác nhận điểm số ở trên là chính xác và hợp lệ, không có khiếu nại.')}</td></tr>
        <tr>
          <td colSpan={4}>
            <div className="ss-label">{t(lang, "Team's confirmation", 'Xác nhận của đội')}</div>
            <div>
              {match?.team_a?.name || t(lang, 'Team 1', 'Đội 1')}: <strong>{d.teamMembersA || ''}</strong>
              {d.studentSignatureImageA && <div><img src={d.studentSignatureImageA} alt={`${match?.team_a?.name || 'Team 1'} signature`} style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              {match?.team_b?.name || t(lang, 'Team 2', 'Đội 2')}: <strong>{d.teamMembersB || ''}</strong>
              {d.studentSignatureImageB && <div><img src={d.studentSignatureImageB} alt={`${match?.team_b?.name || 'Team 2'} signature`} style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
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
          <td className="ss-label" colSpan={2}>{t(lang, 'Recommendation', 'Kiến nghị')}</td>
          <td colSpan={5}>{d.objection || ''}</td>
        </tr>
        <tr>
          <td className="ss-label" colSpan={2}>{t(lang, 'Head Referee', 'Trưởng ban trọng tài')}</td>
          <td colSpan={2}>{d.headRefereeName || 'Mr Ly Quang Van'}</td>
          <td className="ss-label">{t(lang, 'Scorekeeper', 'Người ghi điểm')}</td>
          <td colSpan={2}>{d.scorekeeperName || ''}</td>
        </tr>
        {d.remarks && (
          <tr>
            <td className="ss-label" colSpan={2}>{t(lang, 'Remarks', 'Ghi chú')}</td>
            <td colSpan={5}>{d.remarks}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
