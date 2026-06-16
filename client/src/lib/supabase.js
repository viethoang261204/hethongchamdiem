import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isPlaceholder =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('your-project-id') ||
  supabaseAnonKey.includes('your-anon-key');

if (isPlaceholder) {
  console.warn(
    '[Supabase] Chưa cấu hình .env — copy client/.env.example thành client/.env và điền URL/ANON_KEY từ Supabase Dashboard.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: !isPlaceholder,
      autoRefreshToken: !isPlaceholder,
      detectSessionInUrl: !isPlaceholder,
    },
  }
);

export const isSupabaseConfigured = !isPlaceholder;

// Tự động refresh session khi tab quay lại (visibility change)
if (!isPlaceholder) {
  let lastOnline = navigator.onLine;
  let refreshTimer = null;

  const forceRefresh = async () => {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) console.warn('[Supabase] refreshSession failed:', error.message);
      else console.log('[Supabase] Session refreshed successfully');
    } catch (e) {
      console.warn('[Supabase] refreshSession exception:', e.message);
    }
  };

  // Refresh khi tab quay lại active
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Supabase] Tab became visible — refreshing session');
      forceRefresh();
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(forceRefresh, 5000);
    }
  });

  // Refresh khi online trở lại
  window.addEventListener('online', () => {
    console.log('[Supabase] Network back online — refreshing session');
    forceRefresh();
  });

  window.addEventListener('offline', () => {
    console.warn('[Supabase] Network went offline');
  });
}

// Đăng nhập bằng Supabase Auth (email + password)
export const signIn = async (email, password) => {
  if (isPlaceholder) throw new Error('Chưa cấu hình Supabase. Vui lòng tạo file client/.env.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
};

// Lấy profile user từ bảng users sau khi đăng nhập
export const getUserProfile = async (authUser) => {
  if (isPlaceholder) throw new Error('Chưa cấu hình Supabase.');
  const { data, error } = await supabase
    .from('users')
    .select('id, username, full_name, role, area_id')
    .eq('id', authUser.id)
    .single();
  if (error) throw new Error('Không tìm thấy thông tin người dùng. Vui lòng liên hệ quản trị viên.');
  return data;
};

