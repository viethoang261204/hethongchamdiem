import RefereeScoreboard from '../referee/RefereeScoreboard';
import { useLookupData } from './ViewerLayout';

// Bảng xếp hạng chính thức (dùng lại đúng màn của trọng tài) cho giải đang
// chọn ở sidebar cổng Tra cứu.
export default function ViewerScoreboard() {
  const { compId } = useLookupData();
  return <RefereeScoreboard key={compId} competitionId={compId} />;
}
