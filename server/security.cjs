// Lớp bảo mật dùng chung cho server: header bảo mật (thay helmet, không thêm
// dependency), giới hạn tần suất request (in-memory — Render chạy 1 instance),
// và CORS chỉ cho đúng origin cho phép.

// ---- Header bảo mật ----
// CSP khớp đúng những gì frontend dùng: bundle Vite cùng origin, Google Fonts,
// ảnh data:/blob: (chữ ký, xuất PDF/Excel) và ảnh https bất kỳ (image_url
// nhiệm vụ cũ có thể là link ngoài). Không cho nhúng trang vào iframe.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // API không bao giờ được cache ở trình duyệt/proxy (dữ liệu cá nhân, điểm)
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// ---- Giới hạn tần suất (fixed window, theo khóa tuỳ ý) ----
function createLimiter({ windowMs, max, message, keyFn }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.min(windowMs, 60_000)).unref();

  const limiter = (req, res, next) => {
    const key = keyFn(req);
    if (!key) return next();
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count++;
    if (e.count > max) {
      res.setHeader('Retry-After', Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
  // Đăng nhập thành công thì xoá đếm của đúng tài khoản đó (không phạt người
  // gõ sai 1-2 lần rồi đăng nhập được).
  limiter.reset = (req) => hits.delete(keyFn(req));
  return limiter;
}

const ipOf = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

// Toàn bộ API: 600 request / phút / IP — đủ cho trọng tài thao tác nhanh,
// chặn spam/quét dữ liệu hàng loạt.
const apiLimiter = createLimiter({
  windowMs: 60_000, max: 600, keyFn: (req) => `api:${ipOf(req)}`,
  message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
});

// Đăng nhập: chống dò mật khẩu — theo (IP × tài khoản) và theo IP.
const loginAccountLimiter = createLimiter({
  windowMs: 15 * 60_000, max: 8,
  keyFn: (req) => `login:${ipOf(req)}:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: 'Sai mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.',
});
const loginIpLimiter = createLimiter({
  windowMs: 15 * 60_000, max: 100, keyFn: (req) => `loginip:${ipOf(req)}`,
  message: 'Quá nhiều lần đăng nhập từ thiết bị này. Vui lòng thử lại sau 15 phút.',
});

// Thao tác nhạy cảm (xác minh mã bảo mật xoá dữ liệu): 10 lần / 15 phút / IP
const sensitiveLimiter = createLimiter({
  windowMs: 15 * 60_000, max: 10, keyFn: (req) => `sens:${ipOf(req)}`,
  message: 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
});

// ---- CORS ----
// Frontend được serve cùng origin với API nên mặc định KHÔNG cho origin khác
// gọi API. Cần mở thêm thì khai báo ALLOWED_ORIGINS (phân tách bằng dấu phẩy).
function corsGuard(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const host = req.headers.host;
  const sameOrigin = (() => { try { return new URL(origin).host === host; } catch { return false; } })();
  if (sameOrigin || allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }
  if (req.method === 'OPTIONS') return res.sendStatus(403);
  // Origin lạ: vẫn xử lý (trình duyệt sẽ tự chặn đọc response do thiếu
  // header CORS), nhưng chặn hẳn các request ghi dữ liệu.
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(403).json({ error: 'Origin không được phép.' });
  next();
}

module.exports = {
  securityHeaders, corsGuard, apiLimiter, loginAccountLimiter, loginIpLimiter, sensitiveLimiter, createLimiter,
};
