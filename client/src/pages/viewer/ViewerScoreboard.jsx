import { useState } from 'react';
import RefereeScoreboard from '../referee/RefereeScoreboard';
import { useLookupData } from './ViewerLayout';

// Bảng xếp hạng chính thức (dùng lại đúng màn của trọng tài). Xếp hạng luôn
// tính trong TỪNG giải — khi sidebar đang ở "Tất cả các giải" thì cho chọn
// giải ngay tại đây.
export default function ViewerScoreboard() {
  const { compId, competitions } = useLookupData();
  const [pickedId, setPickedId] = useState(() => competitions.find((c) => c.is_active !== false)?.id || competitions[0]?.id || '');
  const effectiveId = compId === 'all' ? pickedId : compId;

  return (
    <>
      {compId === 'all' && (
        <div className="form-group" style={{ maxWidth: 360, marginBottom: 8 }}>
          <label className="form-label">Xem bảng xếp hạng của giải</label>
          <select className="form-input form-select" value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
            {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active === false ? ' (đã kết thúc)' : ''}</option>)}
          </select>
        </div>
      )}
      {effectiveId && <RefereeScoreboard key={effectiveId} competitionId={effectiveId} />}
    </>
  );
}
