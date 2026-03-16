import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import './RefereeLayout.css';

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

  return (
    <div className="app-container nhutin-admin referee-panel">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/images/logo1.png" alt="Logo" className="sidebar-logo-img" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.add('show'); }} />
          <div className="logo-icon sidebar-logo-fallback">
            <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
          </div>
          <span className="logo-text">Trọng tài</span>
        </div>
        <nav className="nav-menu">
          <div className="nav-section">
            <div className="nav-section-title">Chấm điểm</div>
            <NavLink to="/referee" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-item-label">Nhập phiếu điểm</span>
            </NavLink>
            <NavLink to="/referee/history" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-item-label">Lịch sử nhập điểm</span>
            </NavLink>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-details">
              <div className="user-name">{user?.fullName || user?.username}</div>
              <div className="user-email">Trọng tài</div>
            </div>
          </div>
          <button type="button" className="nav-item logout-btn" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
