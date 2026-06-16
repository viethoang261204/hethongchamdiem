import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================
// useOnlineStatus — theo dõi trạng thái mạng
// ============================================================
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return isOnline;
}

// ============================================================
// useApiLoader — hook chuẩn hoá việc load + error UX cho toàn admin.
//
// Trước đây: try/catch chỉ console.error, user thấy trang trống / "Đang tải..." mãi.
// Sau này: error có UI rõ ràng + nút "Thử lại".
//
// Usage:
//   const { data, loading, error, reload } = useApiLoader(
//     () => api.getCompetitions(),
//     []
//   );
//
//   if (loading) return <Spinner />;
//   if (error)   return <ErrorBox error={error} onRetry={reload} />;
//   return <List items={data} />;
// ============================================================
export function useApiLoader(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  // Tự động reload khi mạng quay lại
  const isOnline = useOnlineStatus();
  useEffect(() => {
    if (isOnline && error && !loading) {
      console.log('[useApiLoader] Network back online — auto retry');
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.resolve()
      .then(() => fetcher())
      .then((result) => {
        if (cancelled || !aliveRef.current) return;
        setData(result ?? null);
      })
      .catch(async (err) => {
        if (cancelled || !aliveRef.current) return;
        console.error('[useApiLoader]', err);

        // Thử refresh session một lần trước khi báo lỗi
        const msg = err?.message || '';
        const isAuthError = [
          'JWS signature verification',
          'Invalid JWT',
          'expired',
          'signature',
          'unauthorized',
        ].some((fatal) => msg.toLowerCase().includes(fatal.toLowerCase()));

        if (isAuthError) {
          console.log('[useApiLoader] Auth error detected — attempting session refresh');
          try {
            await supabase.auth.refreshSession();
            console.log('[useApiLoader] Session refreshed — retrying fetcher');
            const result = await fetcher();
            if (!cancelled && aliveRef.current) {
              setData(result ?? null);
              setError(null);
              setLoading(false);
            }
            return;
          } catch (retryErr) {
            console.error('[useApiLoader] Retry after refresh failed:', retryErr);
          }
        }

        setError(err?.message || 'Lỗi không xác định');
      })
      .finally(() => {
        if (cancelled || !aliveRef.current) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, reload, setData };
}

// ============================================================
// UI components dùng kèm hook — đẹp + nhất quán.
// ============================================================
export function LoaderFull({ label = 'Đang tải dữ liệu...' }) {
  return (
    <div className="api-loader api-loader--full">
      <div className="api-loader__spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorBox({ error, onRetry, title = 'Không tải được dữ liệu' }) {
  return (
    <div className="api-error" role="alert">
      <div className="api-error__icon" aria-hidden="true">!</div>
      <div className="api-error__body">
        <h4 className="api-error__title">{title}</h4>
        <p className="api-error__msg">{error}</p>
        {onRetry && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title = 'Chưa có dữ liệu', desc, action }) {
  return (
    <div className="api-empty">
      <p className="api-empty__title">{title}</p>
      {desc && <p className="api-empty__desc">{desc}</p>}
      {action}
    </div>
  );
}
