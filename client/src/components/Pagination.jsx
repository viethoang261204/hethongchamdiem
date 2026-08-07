// Thanh phân trang dùng chung cho cả Admin (nền sáng) và Trọng tài (nền tối)
// — style theo class .pagination-* định nghĩa riêng ở AdminLayout.css và
// RefereeLayout.css (mỗi bên tự phối màu theo theme của mình).
export default function Pagination({ page, pageCount, onChange, totalItems, pageSize }) {
  if (pageCount <= 1) return null;

  const pages = [];
  const windowSize = 1;
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - windowSize && p <= page + windowSize)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination-bar">
      <span className="pagination-info">Hiển thị {from}–{to} / {totalItems}</span>
      <div className="pagination-nav">
        <button type="button" className="pagination-arrow" onClick={() => onChange(page - 1)} disabled={page <= 1}>
          ← Trước
        </button>
        {pages.map((p, i) => (p === '…' ? (
          <span key={`e${i}`} className="pagination-ellipsis">…</span>
        ) : (
          <button
            type="button"
            key={p}
            className={`pagination-page ${p === page ? 'active' : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )))}
        <button type="button" className="pagination-arrow" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>
          Sau →
        </button>
      </div>
    </div>
  );
}
