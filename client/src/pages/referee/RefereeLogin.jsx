import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { api } from '../../api';
import '../admin/AdminLogin.css';

export default function RefereeLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.login(username, password);
      if (user.role !== 'referee') {
        setError('Chỉ tài khoản Trọng tài được đăng nhập tại đây.');
        setLoading(false);
        return;
      }
      login(user);
      navigate('/referee', { replace: true });
    } catch (err) {
      setError(err.message || 'Sai tên đăng nhập hoặc mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-left">
          <div className="admin-login-brand">
            <div className="admin-login-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <span className="admin-login-brand-text">ENJOY AI · Trọng tài</span>
          </div>
          <h2 className="admin-login-left-title">Khu vực Trọng tài</h2>
          <p className="admin-login-left-desc">Đăng nhập để nhập phiếu điểm cho từng đội theo cuộc thi, nội dung và khu vực.</p>
          <ul className="admin-login-features">
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>Chọn cuộc thi → nội dung → khu vực</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Nhập Thời gian & Điểm cho từng đội</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Xác nhận chữ ký học sinh & trọng tài</span>
            </li>
          </ul>
        </div>
        <div className="admin-login-right">
          <h1 className="admin-login-form-title">Đăng nhập Trọng tài</h1>
          <p className="admin-login-form-sub">Vui lòng nhập tài khoản trọng tài</p>
          {error && (
            <div className="admin-login-error-box">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="admin-login-form">
            <div className="form-group">
              <label>Tên đăng nhập</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" required autoComplete="username" />
            </div>
            <div className="form-group">
              <label>Mật khẩu</label>
              <div className="admin-login-password-wrap">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
                <button type="button" className="admin-login-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập Trọng tài'}
            </button>
          </form>
          <div className="admin-login-security">
            Lưu ý bảo mật: Chỉ sử dụng tài khoản trọng tài được cấp. Không chia sẻ thông tin đăng nhập.
          </div>
          <p className="admin-login-back"><a href="/">← Về trang chủ</a></p>
        </div>
      </div>
    </div>
  );
}
