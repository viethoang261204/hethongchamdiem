// Backend API + serve frontend build (client/dist).
// Chạy: node index.cjs (cần server/.env chứa DATABASE_URL, JWT_SECRET)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
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
app.use('/api', corsGuard, apiLimiter);
app.use(express.json({ limit: '2mb' }));
app.use(attachUser);

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Serve frontend build
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir));
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT} (API: /api, DB: Neon)`);
});
