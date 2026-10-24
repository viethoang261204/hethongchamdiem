import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// App dùng HashRouter (trang thật nằm sau dấu #, vd /#/tra-cuu). Người dùng
// hay gõ/chia sẻ dạng không có # (/tra-cuu, /admin...) — server luôn trả
// index.html cho mọi đường dẫn, nên chuyển sang đúng dạng # trước khi render.
if (window.location.pathname !== '/' && !window.location.hash) {
  window.location.replace(`/#${window.location.pathname}${window.location.search}`);
}

// Sau mỗi lần deploy, tên file JS (hash) đổi — tab đang mở bản cũ khi tải
// module động (exceljs, jszip...) sẽ lỗi "Failed to fetch dynamically
// imported module". Tự tải lại trang để lấy bản mới; chỉ 1 lần / 30 giây
// để không lặp vô hạn nếu lỗi do mất mạng.
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('chunkReloadAt')) || 0; } catch { /* bỏ qua */ }
  if (Date.now() - last < 30000) return;
  try { sessionStorage.setItem('chunkReloadAt', String(Date.now())); } catch { /* bỏ qua */ }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
