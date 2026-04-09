import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import './RefereeLayout.css';

const NAV_ICONS = {
  score: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

export default function RefereeLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showConfirm } = useNotify();

  const handleLogout = async () => {
    const ok = await showConfirm({ message: 'Đăng xuất?', confirmText: 'Đăng xuất', cancelText: 'Hủy', danger: true });
    if (ok) {
      logout();
      navigate('/referee');
    }
  };

  const initials = (user?.fullName || user?.username || 'R').charAt(0).toUpperCase();

  return (
    <div className="app-container nhutin-admin referee-panel">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img
            src="/images/logo1.png"
            alt="Logo"
            className="sidebar-logo-img"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <span className="logo-text">
            ENJOY AI
            <small>Trọng tài</small>
          </span>
        </div>

        <nav className="nav-menu">
          <div className="nav-section">
            <div className="nav-section-title">Chấm điểm</div>
            <NavLink to="/referee" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-item-icon">{NAV_ICONS.score}</span>
              <span>Nhập phiếu điểm</span>
            </NavLink>
            <NavLink to="/referee/history" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-item-icon">{NAV_ICONS.history}</span>
              <span>Lịch sử nhập điểm</span>
            </NavLink>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.fullName || user?.username}</div>
              <div className="user-email">Trọng tài</div>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            {NAV_ICONS.logout}
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
