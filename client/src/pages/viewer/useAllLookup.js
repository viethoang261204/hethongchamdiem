import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { buildLookup } from '../../lib/lookup';
import { useLookupData } from './ViewerLayout';

// Dữ liệu tra cứu của TẤT CẢ các giải — cho các báo cáo gộp nhiều giải (Xét
// điểm lần 2, Báo cáo đi Trung Quốc). Dùng lại dữ liệu của layout nếu đang ở
// chế độ tổng thể, không thì tự tải riêng (không đổi giải đang chọn ở sidebar).
export function useAllLookup() {
  const { lookup: layoutLookup } = useLookupData();
  const [ownRaw, setOwnRaw] = useState(null);
  const [error, setError] = useState('');
  const needOwn = layoutLookup && !layoutLookup.all;
  useEffect(() => {
    if (!needOwn || ownRaw) return;
    api.getLookup('all').then(setOwnRaw).catch((e) => setError(e.message || 'Không tải được dữ liệu.'));
  }, [needOwn, ownRaw]);
  const ownLookup = useMemo(() => buildLookup(ownRaw), [ownRaw]);
  return { lookup: layoutLookup?.all ? layoutLookup : ownLookup, error };
}
