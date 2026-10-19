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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
