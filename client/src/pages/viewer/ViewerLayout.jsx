import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { api } from '../../api';
import { buildLookup } from '../../lib/lookup';
import '../referee/RefereeLayout.css';
import './Viewer.css';

const ICON = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  teams: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  groups: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>,
  coach: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
  plane: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>,
  scoreboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 20V10M14 20V4M20 20v-7M4 20h16"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const NAV = [
  { to: '/tra-cuu', end: true, icon: ICON.overview, label: 'Tổng quan' },
  { to: '/tra-cuu/doi-thi', icon: ICON.teams, label: 'Tra cứu đội & điểm' },
  { to: '/tra-cuu/hoc-sinh', icon: ICON.students, label: 'Học sinh' },
  { to: '/tra-cuu/truong-hlv', icon: ICON.groups, label: 'Trường / Trung tâm / HLV' },
  { to: '/tra-cuu/hlv-xuat-sac', icon: ICON.coach, label: 'HLV xuất sắc' },
  { to: '/tra-cuu/di-trung-quoc', icon: ICON.plane, label: 'Đội đi Trung Quốc' },
  { to: '/tra-cuu/bang-xep-hang', icon: ICON.scoreboard, label: 'Bảng xếp hạng' },
];

const COMP_KEY = 'enjoy-ai-lookup-comp';

// Dữ liệu tra cứu dùng chung cho mọi trang con (qua Outlet context) — chỉ
// tải 1 lần cho mỗi cuộc thi đang chọn, không gọi lại khi chuyển trang.
export function useLookupData() {
  return useOutletContext();
}

export default function ViewerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showConfirm } = useNotify();
  const [competitions, setCompetitions] = useState([]);
  const [compId, setCompIdState] = useState(() => {
    try { return localStorage.getItem(COMP_KEY) || 'all'; } catch { return 'all'; }
  });
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setCompId = useCallback((id) => {
    setCompIdState(id);
    try { localStorage.setItem(COMP_KEY, id); } catch { /* bỏ qua */ }
  }, []);

  useEffect(() => {
    api.getCompetitions().then((list) => {
      const sorted = list.slice().sort((a, b) => (b.is_active === false ? 0 : 1) - (a.is_active === false ? 0 : 1)
        || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setCompetitions(sorted);
      if (compId !== 'all' && !sorted.some((c) => c.id === compId)) setCompId('all');
    }).catch(() => setCompetitions([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (!compId) return;
    setLoading(true); setError('');
    api.getLookup(compId)
      .then(setRaw)
      .catch((e) => { setRaw(null); setError(e.message || 'Không tải được dữ liệu.'); })
      .finally(() => setLoading(false));
  }, [compId]);
  useEffect(load, [load]);

  const lookup = useMemo(() => buildLookup(raw), [raw]);

  const handleLogout = async () => {
    const ok = await showConfirm({ message: 'Đăng xuất?', confirmText: 'Đăng xuất', cancelText: 'Hủy', danger: true });
    if (ok) { logout(); navigate('/tra-cuu'); }
  };

  const initials = (user?.fullName || user?.full_name || user?.username || 'T').charAt(0).toUpperCase();
  const compSelect = (
    <select className="form-input form-select viewer-comp-select" value={compId} onChange={(e) => setCompId(e.target.value)}>
      <option value="all">Tất cả các giải (tổng thể)</option>
      {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active === false ? ' (đã kết thúc)' : ''}</option>)}
    </select>
  );

  return (
    <div className="app-container referee-panel viewer-panel">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/images/logo1.png" alt="Logo" className="sidebar-logo-img" onError={(e) => { e.target.style.display = 'none'; }} />
          <span className="logo-text show">ENJOY AI<small>Tra cứu</small></span>
        </div>
        <div className="viewer-comp-box">
          <div className="nav-section-title">Giải đấu</div>
          {compSelect}
        </div>
        <nav className="nav-menu">
          <div className="nav-section">
            <div className="nav-section-title">Tra cứu</div>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <span className="nav-item-icon">{n.icon}</span>
                <span>{n.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.fullName || user?.full_name || user?.username}</div>
              <div className="user-email">Tra cứu</div>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={handleLogout}>{ICON.logout}<span>Đăng xuất</span></button>
        </div>
      </aside>

      <main className="main-content">
        <div className="referee-mobile-bar">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user?.fullName || user?.full_name || user?.username}</div>
              <div className="user-email">Tra cứu</div>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={handleLogout}>{ICON.logout}<span>Đăng xuất</span></button>
        </div>
        <div className="viewer-mobile-nav">
          {compSelect}
          <div className="viewer-mobile-tabs">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'viewer-mobile-tab' + (isActive ? ' active' : '')}>{n.label}</NavLink>
            ))}
          </div>
        </div>

        {error ? (
          <div className="card" style={{ padding: 24, color: '#f87171' }}>
            {error} <button type="button" className="btn btn-secondary" style={{ marginLeft: 12 }} onClick={load}>Thử lại</button>
          </div>
        ) : (loading || !lookup) && compId ? (
          <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải dữ liệu giải đấu...</p>
        ) : (
          <Outlet context={{ lookup, competitions, compId, reload: load }} />
        )}
      </main>
    </div>
  );
}
