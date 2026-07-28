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
      </tbody>
    </table>
  );
}
