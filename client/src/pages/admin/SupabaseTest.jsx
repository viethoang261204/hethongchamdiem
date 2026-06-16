import { useState } from 'react';
import { api } from '../../api';
import { supabase } from '../../lib/supabase';
import './AdminLayout.css';

const STEPS = [
  { key: 'env',   label: 'Biến môi trường' },
  { key: 'auth',  label: 'Xác thực (Auth API)' },
  { key: 'db',    label: 'Truy vấn Database' },
  { key: 'storage', label: 'Storage bucket' },
];

// Helper: thêm timeout cho promise
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout sau ${ms / 1000}s — Supabase không phản hồi (${label}). Có thể mạng bị chặn, sai URL, hoặc project đang ngủ.`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export default function SupabaseTest() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({});

  const run = async () => {
    setRunning(true);
    setResults({});
    const out = {};

    out.env = (() => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const isPlaceholder = !url || !key || url.includes('your-project-id') || key.includes('your-anon-key');
      return {
        ok: !isPlaceholder,
        info: {
          VITE_SUPABASE_URL: url || '(trống)',
          VITE_SUPABASE_ANON_KEY: key ? `${key.slice(0, 8)}…(${key.length} ký tự)` : '(trống)',
          mode: import.meta.env.MODE,
        },
        error: isPlaceholder ? 'Biến môi trường chưa được cấu hình hoặc còn là giá trị mẫu.' : null,
      };
    })();
    setResults({ ...out });

    if (out.env.ok) {
      // Auth
      try {
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          10000,
          'Auth API'
        );
        out.auth = {
          ok: !error,
          info: {
            hasSession: !!session,
            userEmail: session?.user?.email || '(chưa đăng nhập)',
            expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString('vi-VN') : '-',
          },
          error: error?.message || null,
        };
      } catch (e) {
        out.auth = { ok: false, info: {}, error: e.message };
      }
      setResults({ ...out });

      // Database
      try {
        const { data, error } = await withTimeout(
          supabase.from('competitions').select('id, name, is_active').limit(5),
          15000,
          'Database'
        );
        out.db = {
          ok: !error,
          info: {
            rowCount: data?.length ?? 0,
            sample: data?.slice(0, 3) || [],
          },
          error: error?.message || null,
        };
      } catch (e) {
        out.db = { ok: false, info: {}, error: e.message };
      }
      setResults({ ...out });

      // Storage
      try {
        const { data, error } = await withTimeout(
          supabase.storage.listBuckets(),
          15000,
          'Storage'
        );
        const bucket = (data || []).find(b => b.id === 'score-images');
        out.storage = {
          ok: !error && !!bucket,
          info: {
            totalBuckets: data?.length ?? 0,
            hasScoreImages: !!bucket,
            public: bucket?.public ?? false,
            all: (data || []).map(b => `${b.id}${b.public ? ' (public)' : ''}`),
          },
          error: error?.message || (bucket ? null : 'Chưa có bucket "score-images".'),
        };
      } catch (e) {
        out.storage = { ok: false, info: {}, error: e.message };
      }
      setResults({ ...out });
    }

    setRunning(false);
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kiểm tra kết nối Supabase</h1>
          <p className="page-subtitle">Chạy tuần tự 4 bước chẩn đoán để xác định lỗi cấu hình.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          {running ? 'Đang chạy...' : 'Chạy kiểm tra'}
        </button>
      </div>

      <div className="diag-list">
        {STEPS.map((step) => {
          const r = results[step.key];
          const status = !r ? 'idle' : r.ok ? 'ok' : 'fail';
          return (
            <div key={step.key} className={`diag-card diag-${status}`}>
              <div className="diag-head">
                <span className={`diag-dot diag-dot-${status}`} />
                <span className="diag-title">{step.label}</span>
                <span className="diag-status">
                  {status === 'idle' && '—'}
                  {status === 'ok' && 'OK'}
                  {status === 'fail' && 'Lỗi'}
                </span>
              </div>
              {r && (
                <div className="diag-body">
                  {r.error && <div className="diag-error">{r.error}</div>}
                  {Object.keys(r.info || {}).length > 0 && (
                    <pre className="diag-info">{JSON.stringify(r.info, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.values(results).some(r => r && !r.ok) && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #ef4444' }}>
          <h3 style={{ marginTop: 0, color: '#991b1b' }}>Gợi ý xử lý</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: '#334155' }}>
            {!results.env?.ok && (
              <li>Tạo file <code>client/.env</code> từ <code>.env.example</code> và điền URL/ANON_KEY thật từ Supabase Dashboard → Settings → API.</li>
            )}
            {results.env?.ok && !results.auth?.ok && (
              <li>Kiểm tra lại ANON_KEY (đảm bảo copy đúng "anon public", không phải service_role).</li>
            )}
            {results.db && !results.db.ok && (
              <li>Chưa chạy <code>supabase/schema.sql</code> trong SQL Editor, hoặc RLS chặn truy vấn.</li>
            )}
            {results.storage && !results.storage.ok && (
              <li>Tạo bucket <code>score-images</code> (public) trong Storage, hoặc chạy câu SQL trong <code>schema.sql</code> mục 6.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
