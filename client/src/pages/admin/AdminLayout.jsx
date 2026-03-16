import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

const NAV_ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4 0v-4m0-4h4l1-6H7l1 6h4v4M5 7h14M7 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>,
  content: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  ranking: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
};

const NAV_SECTIONS = [
  {
    title: 'TỔNG QUAN',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'home', end: true },
    ],
  },
  {
    title: 'QUẢN LÝ',
    items: [
      { to: '/admin/competitions', label: 'Cuộc thi', icon: 'trophy' },
      { to: '/admin/contents', label: 'Nội dung thi', icon: 'content' },
      { to: '/admin/students', label: 'Học sinh', icon: 'users' },
      { to: '/admin/teams', label: 'Đội thi', icon: 'users' },
      { to: '/admin/scoreboard', label: 'Bảng xếp hạng', icon: 'ranking' },
      { to: '/admin/referee-accounts', label: 'Tài khoản trọng tài', icon: 'user' },
      { to: '/admin/scores', label: 'Phiếu điểm', icon: 'file' },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showConfirm } = useNotify();

  const handleLogout = async () => {
    const ok = await showConfirm({ message: 'Đăng xuất khỏi admin?', confirmText: 'Đăng xuất', cancelText: 'Hủy', danger: true });
    if (ok) {
      logout();
      navigate('/admin');
    }
  };

  return (
    <div className="app-container nhutin-admin">
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-header">
          <img src="/images/logo1.png" alt="Logo" className="sidebar-logo-img" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.add('show'); }} />
          <div className="logo-icon sidebar-logo-fallback">
            <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <span className="logo-text">ENJOY AI Admin</span>
        </div>
        <nav className="nav-menu">
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.title} className="nav-section">
              <div className="nav-section-title">{sec.title}</div>
              {sec.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                  <span className="nav-item-icon">{NAV_ICONS[item.icon] || NAV_ICONS.file}</span>
                  <span className="nav-item-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              <span>{ (user?.fullName || user?.username || 'A').charAt(0).toUpperCase() }</span>
            </div>
            <div className="user-details">
              <div className="user-name">{user?.fullName || user?.username}</div>
              <div className="user-email">{user?.username ? `${user.username}@enjoyai` : 'Admin'}</div>
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
