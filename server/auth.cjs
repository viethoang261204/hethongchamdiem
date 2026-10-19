// Auth: đăng nhập bằng email/username + password (bcrypt hash trong DB,
// verify bằng pgcrypto: password = crypt($input, password)), cấp JWT.
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('./db.cjs');
const { loginAccountLimiter, loginIpLimiter } = require('./security.cjs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[auth] Thiếu JWT_SECRET trong .env');
  process.exit(1);
}
const TOKEN_TTL = '7d';

const PROFILE_FIELDS = 'id, email, username, full_name, role, area_id, can_view_scoreboard, language';

// "Phiên bản mật khẩu" gắn vào token — đổi mật khẩu (hash đổi) thì mọi token
// cũ tự hết hiệu lực, không phải chờ hết hạn. Chỉ là dấu vân tay của hash,
// không lộ được mật khẩu.
const passwordVersion = (hash) => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);

function signToken(user, passwordHash) {
  return jwt.sign({ sub: user.id, role: user.role, pv: passwordVersion(passwordHash) }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// ---- Middleware ----

// Đọc token nếu có (không bắt buộc) — gắn req.user
async function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const { rows } = await query(`select ${PROFILE_FIELDS}, password as __pw from users where id = $1`, [payload.sub]);
    const row = rows[0];
    if (row && payload.pv === passwordVersion(row.__pw)) {
      delete row.__pw;
      req.user = row;
    }
  } catch (_) {
    // token hỏng/hết hạn → coi như chưa đăng nhập
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ admin mới có quyền thực hiện thao tác này.' });
  next();
}

// ---- Routes ----
const router = express.Router();

// POST /api/auth/login { email, password }
router.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu.' });
    }
    if (email.length > 200 || password.length > 200) return res.status(400).json({ error: 'Thông tin đăng nhập không hợp lệ.' });
    const { rows } = await query(
      `select ${PROFILE_FIELDS}, password as __pw from users
       where (lower(email) = lower($1) or lower(username) = lower($1))
         and password is not null
         and password = crypt($2, password)`,
      [email.trim(), password]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu.' });
    const pw = user.__pw;
    delete user.__pw;
    loginAccountLimiter.reset(req);
    res.json({ token: signToken(user, pw), user });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi đăng nhập.' });
  }
});

// GET /api/auth/me — xác thực token còn hạn, trả profile mới nhất
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = { router, attachUser, requireAuth, requireAdmin };
