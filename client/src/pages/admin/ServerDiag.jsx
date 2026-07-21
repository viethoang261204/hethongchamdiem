import { useState } from 'react';
import { api } from '../../api';
import { getToken } from '../../lib/http';
import './AdminLayout.css';

// Trang chẩn đoán: kiểm tra kết nối backend API + database Neon
export default function ServerDiag() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setRunning(true);
    const out = { token: !!getToken() };
    const t0 = Date.now();
    out.ping = await api.pingServer();
    out.totalMs = Date.now() - t0;
    setResult(out);
    setRunning(false);
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Chẩn đoán hệ thống</h1>
          <p className="page-subtitle">Kiểm tra kết nối Backend API → Neon PostgreSQL</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          {running ? 'Đang kiểm tra...' : 'Chạy kiểm tra'}
        </button>
      </div>

      {result && (
        <div className="card" style={{ padding: 20 }}>
          <table>
            <tbody>
              <tr>
                <td style={{ padding: 8, fontWeight: 600 }}>Token đăng nhập</td>
                <td style={{ padding: 8 }}>{result.token ? '✅ Có' : '⚠️ Không (chưa đăng nhập)'}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, fontWeight: 600 }}>Backend API</td>
                <td style={{ padding: 8 }}>{result.ping.ok ? '✅ Hoạt động' : `❌ Lỗi: ${result.ping.error}`}</td>
              </tr>
              {result.ping.ok && (
                <>
                  <tr>
                    <td style={{ padding: 8, fontWeight: 600 }}>Database</td>
                    <td style={{ padding: 8 }}>✅ {result.ping.db} — {result.ping.competitions} cuộc thi</td>
                  </tr>
                  <tr>
                    <td style={{ padding: 8, fontWeight: 600 }}>Độ trễ query DB</td>
                    <td style={{ padding: 8 }}>{result.ping.latencyMs}ms (tổng round-trip: {result.totalMs}ms)</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
