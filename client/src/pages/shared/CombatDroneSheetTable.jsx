import '../referee/InventionTrailScoreForm.css';

/**
 * Score Sheet cho nội dung content_format = 'combat_drone' (Fly Smart Cup) —
 * theo đúng mẫu giấy "Scoring Sheet of Drone Cup" (Appendix I): Red/Blue,
 * hiệp 1/hiệp 2, điểm, đá luân lưu (nếu có), đội thắng.
 *
 * Props:
 *   match    — 1 dòng combat_matches (đã có nested team_a/team_b/boards)
 *   sheetRef — ref gắn vào root, dùng để html2canvas chụp xuất PDF
 */
export default function CombatDroneSheetTable({ match, sheetRef }) {
  const d = match?.details || {};
  const firstHalfA = Number(d.firstHalfA) || 0;
  const firstHalfB = Number(d.firstHalfB) || 0;
  const secondHalfA = Number(d.secondHalfA) || 0;
  const secondHalfB = Number(d.secondHalfB) || 0;
  const pointsA = firstHalfA + secondHalfA;
  const pointsB = firstHalfB + secondHalfB;
  const penaltyA = Array.isArray(d.penaltyA) ? d.penaltyA : [];
  const penaltyB = Array.isArray(d.penaltyB) ? d.penaltyB : [];

  const winnerSide = match?.winner_id
    ? (match.winner_id === match?.team_a_id ? 'Red' : match.winner_id === match?.team_b_id ? 'Blue' : '')
    : '';
  const winnerNo = winnerSide === 'Red' ? match?.team_a_no : winnerSide === 'Blue' ? match?.team_b_no : '';

  const penaltyRow = (label, attempts) => (
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
        <tr><td colSpan={7} className="ss-title">Scoring Sheet of Drone Cup</td></tr>

        <tr>
          <td colSpan={3}><span className="ss-label">Division:</span> {d.division || ''}</td>
          <td colSpan={2}><span className="ss-label">Preliminary / Intermediate:</span> {match?.stage || ''}</td>
          <td colSpan={2}><span className="ss-label">Team:</span> {match?.match_no || ''}</td>
        </tr>

        <tr>
          <td colSpan={2}><span className="ss-label">Red No.:</span> {match?.team_a_no || ''}</td>
          <td colSpan={2}><span className="ss-label">Blue No.:</span> {match?.team_b_no || ''}</td>
          <td colSpan={3}><span className="ss-label">Group:</span> {match?.group_label || ''}</td>
        </tr>

        <tr>
          <td colSpan={3}><span className="ss-label">Red team:</span> {match?.team_a?.name || ''}</td>
          <td colSpan={4}><span className="ss-label">Blue team:</span> {match?.team_b?.name || ''}</td>
        </tr>

        <tr className="ss-header-row">
          <th colSpan={2}></th>
          <th className="ss-center">Red</th>
          <th className="ss-center" colSpan={2}></th>
          <th className="ss-center">Blue</th>
          <th></th>
        </tr>
        <tr>
          <td className="ss-label" colSpan={2}>First-half scoring</td>
          <td className="ss-center"><strong>{firstHalfA}</strong></td>
          <td colSpan={2}></td>
          <td className="ss-center"><strong>{firstHalfB}</strong></td>
          <td></td>
        </tr>
        <tr>
          <td className="ss-label" colSpan={2}>Second-half scoring</td>
          <td className="ss-center"><strong>{secondHalfA}</strong></td>
          <td colSpan={2}></td>
          <td className="ss-center"><strong>{secondHalfB}</strong></td>
          <td></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label" colSpan={2}>Points</td>
          <td className="ss-center" colSpan={5}><strong>{pointsA} : {pointsB}</strong></td>
        </tr>

        <tr>
          <td colSpan={7} className="ss-section">
            Penalty Shootout ( {d.penaltyShootout ? 'Yes ✓ / No ___' : 'Yes ___ / No ✓'} )
          </td>
        </tr>
        {d.penaltyShootout && (
          <>
            <tr className="ss-header-row">
              <th colSpan={2}>Attempt</th>
              <th className="ss-center">1</th>
              <th className="ss-center">2</th>
              <th className="ss-center">3</th>
              <th colSpan={2}>Score / Time</th>
            </tr>
            {penaltyRow('Red', penaltyA)}
            {penaltyRow('Blue', penaltyB)}
          </>
        )}

        <tr>
          <td className="ss-label" colSpan={2}>Winner</td>
          <td colSpan={5}>
            <strong>{winnerSide ? `${winnerSide} Side` : (match?.is_draw ? 'Draw' : '')}</strong>
            {winnerNo ? ` — No. ${winnerNo}` : ''}
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
          <td className="ss-label" colSpan={2}>Recommendation</td>
          <td colSpan={5}>{d.objection || ''}</td>
        </tr>
        <tr>
          <td className="ss-label" colSpan={2}>Head Referee</td>
          <td colSpan={2}>{d.headRefereeName || 'Mr Ly Quang Van'}</td>
          <td className="ss-label">Scorekeeper</td>
          <td colSpan={2}>{d.scorekeeperName || ''}</td>
        </tr>
        {d.remarks && (
          <tr>
            <td className="ss-label" colSpan={2}>Remarks</td>
            <td colSpan={5}>{d.remarks}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
