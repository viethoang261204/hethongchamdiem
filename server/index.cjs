// Backend API + serve frontend build (client/dist).
// Chạy: node index.cjs (cần server/.env chứa DATABASE_URL, JWT_SECRET)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const compression = require('compression');
const path = require('path');
const { securityHeaders, corsGuard, apiLimiter } = require('./security.cjs');

const { router: authRouter, attachUser } = require('./auth.cjs');
const apiRouter = require('./routes.cjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Render đứng sau 1 lớp proxy — để req.ip là IP thật của người dùng (rate limit)
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
// Nén gzip mọi phản hồi (JSON, JS, CSS) — trước đây gửi nguyên, file JS chính
// 1.7MB + JSON danh sách lớn làm băng thông Render tăng vọt.
app.use(compression());
app.use('/api', corsGuard, apiLimiter);
app.use(express.json({ limit: '2mb' }));
app.use(attachUser);

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Serve frontend build
const distDir = path.join(__dirname, '..', 'client', 'dist');
// File trong /assets/ có mã hash trong tên (mỗi bản build đổi tên) → cho
// trình duyệt giữ 1 năm, khỏi tải lại mỗi lần mở trang. index.html thì luôn
// hỏi lại server để nhận bản build mới.
app.use(express.static(distDir, {
  setHeaders(res, filePath) {
    if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

// Error handler (multer, JSON parse, ...)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server]', err.message);
  const status = err.name === 'MulterError' ? 400 : err.status || err.statusCode || 500;
  // Lỗi 5xx: không trả chi tiết nội bộ ra ngoài (chỉ ghi log server)
  res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ.' : (err.expose === false ? 'Yêu cầu không hợp lệ.' : err.message || 'Yêu cầu không hợp lệ.') });
});

// Migration nhỏ, chạy lại không sao (add column if not exists) — để deploy
// tự có cột mới mà không cần chạy tay db:setup. Đồng bộ với db/schema.sql.
const STARTUP_MIGRATIONS = `
  alter table students add column if not exists email text;
  alter table students add column if not exists phone text;
  alter table students add column if not exists email_source text;
  alter table students add column if not exists phone_source text;`;

require('./db.cjs').query(STARTUP_MIGRATIONS)
  .catch((err) => console.error('[migrate]', err.message))
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server chạy tại http://localhost:${PORT} (API: /api, DB: Neon)`);
    });
  });
