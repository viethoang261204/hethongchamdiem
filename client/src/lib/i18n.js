// Ngôn ngữ giao diện chấm điểm cho trọng tài — 'en' (mặc định) hoặc 'vi',
// lấy từ user.language (đăng nhập). Không đổi hành vi hiện tại cho referee
// chưa được admin gán 'vi' (mặc định DB là 'en').
//
// Cách dùng: const lang = useLang(); ...{t(lang, 'Half 1', 'Hiệp 1')}
import { useAuth } from '../App';

export function useLang() {
  const { user } = useAuth();
  return user?.language === 'vi' ? 'vi' : 'en';
}

export function t(lang, en, vi) {
  return lang === 'vi' ? vi : en;
}
