import { useState } from 'react';

// Biểu đồ cột ngang (HTML/CSS, không thư viện) cho cổng Tra cứu — theo chuẩn
// dataviz: cột mảnh bo 4px ở đầu cột, khe 2px giữa các đoạn chồng nhau, số tổng
// ghi ngay cuối cột (màu chữ, không dùng màu dữ liệu), chú thích khi ≥ 2 loại,
// rê chuột / chạm vào hàng để xem chi tiết từng đoạn. Bảng màu nền tối đã
// kiểm tra bằng validate_palette.js (CVD ΔE ≥ 9.4, tương phản ≥ 3:1 trên nền thẻ).
export const SERIES_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'];

// rows: [{ key, label, sub?, values: { [seriesKey]: number } }]
// series: [{ key, label, color }]  (1 loại → không hiện chú thích)
export function HBarChart({ rows, series, unit = '', emptyText = 'Chưa có dữ liệu.' }) {
  const [hover, setHover] = useState(null);
  const totals = rows.map((r) => series.reduce((a, s) => a + (r.values[s.key] || 0), 0));
  const max = Math.max(1, ...totals);
  if (!rows.length || totals.every((t) => !t)) return <p className="viz-empty">{emptyText}</p>;

  return (
    <div className="viz-root">
      {series.length > 1 && (
        <div className="viz-legend">
          {series.map((s) => (
            <span key={s.key} className="viz-legend-item"><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
      <div className="viz-rows" onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => {
          const total = totals[i];
          const active = hover === r.key;
          return (
            <div key={r.key} className={`viz-row ${active ? 'is-active' : ''}`}
              onMouseEnter={() => setHover(r.key)} onClick={() => setHover(active ? null : r.key)}>
              <div className="viz-label" title={r.label}>{r.label}{r.sub && <span>{r.sub}</span>}</div>
              <div className="viz-track">
                <div className="viz-bar" style={{ width: `${(total / max) * 100}%` }}>
                  {series.map((s) => {
                    const v = r.values[s.key] || 0;
                    return v ? <div key={s.key} className="viz-seg" style={{ flexGrow: v, background: s.color }} /> : null;
                  })}
                </div>
                <span className="viz-total">{total.toLocaleString('vi-VN')}{unit}</span>
              </div>
              {active && series.length > 1 && (
                <div className="viz-tip" role="tooltip">
                  <strong>{r.label}</strong>
                  {series.map((s) => (
                    <div key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{(r.values[s.key] || 0).toLocaleString('vi-VN')}</b></div>
                  ))}
                  <div className="viz-tip-total">Tổng: <b>{total.toLocaleString('vi-VN')}{unit}</b></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
