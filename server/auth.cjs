// Auth: đăng nhập bằng email/username + password (bcrypt hash trong DB,
// verify bằng pgcrypto: password = crypt($input, password)), cấp JWT.
const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('./db.cjs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[auth] Thiếu JWT_SECRET trong .env');
  process.exit(1);
}
const TOKEN_TTL = '30d';

const PROFILE_FIELDS = 'id, email, username, full_name, role, area_id';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// ---- Middleware ----

// Đọc token nếu có (không bắt buộc) — gắn req.user
async function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await query(`select ${PROFILE_FIELDS} from users where id = $1`, [payload.sub]);
    if (rows[0]) req.user = rows[0];
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu.' });
    const { rows } = await query(
      `select ${PROFILE_FIELDS} from users
       where (lower(email) = lower($1) or lower(username) = lower($1))
         and password is not null
         and password = crypt($2, password)`,
      [String(email).trim(), String(password)]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu.' });
    res.json({ token: signToken(user), user });
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
