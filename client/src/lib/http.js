// HTTP client gọi backend API (server/ — kết nối Neon).
// Thay thế hoàn toàn Supabase SDK.
//
// - Prod: frontend + API cùng origin (server serve client/dist) → base = ''
// - Dev: vite proxy /api → http://localhost:3000 (xem vite.config.js)

const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'enjoy-ai-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function request(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (_) {
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // response không phải JSON (hiếm)
  }

  if (!res.ok) {
    throw new Error(data?.error || `Lỗi máy chủ (HTTP ${res.status})`);
  }
  if (data === null) {
    // 200 nhưng body không phải JSON → thường do deploy sai (static site
    // không có backend /api) hoặc proxy trả HTML
    throw new Error('Máy chủ không trả dữ liệu hợp lệ — kiểm tra backend API đã được deploy chưa.');
  }
  return data;
}

// ---- Auth ----

// Một số component đọc user.fullName (camelCase) — thêm alias bên cạnh full_name
function normalizeUser(user) {
  return user ? { ...user, fullName: user.full_name } : user;
}

// Đăng nhập → lưu token, trả về profile user
export async function signIn(email, password) {
  const { token, user } = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setToken(token);
  return normalizeUser(user);
}

// Kiểm tra token còn hạn không, trả profile mới nhất (null nếu hết hạn)
export async function getMe() {
  if (!getToken()) return null;
  try {
    const { user } = await request('/auth/me');
    return normalizeUser(user);
  } catch (_) {
    setToken(null);
    return null;
  }
}

export function signOut() {
  setToken(null);
}
