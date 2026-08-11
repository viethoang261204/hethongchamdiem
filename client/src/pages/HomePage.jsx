import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './HomePage.css';

export default function HomePage() {
  const [competitions, setCompetitions] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const comps = await api.getCompetitions();
        const active = comps.filter(c => c.is_active !== false);
        setCompetitions(active);
        const boards = {};
        for (const comp of active) {
          const contents = await api.getContents(comp.id);
          for (const content of contents) {
            try {
              const list = await api.getScoreboard(content.id);
              boards[content.id] = { content, list };
            } catch {
              boards[content.id] = { content, list: [] };
            }
          }
        }
        setLeaderboards(boards);
      } catch (e) {
        console.error(e);
      }
    }
    load();

    // Auto-refresh dữ liệu mỗi 60 giây
    const interval = setInterval(load, 60000);

    // Refresh lại khi tab quay về active
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        console.log('[HomePage] Tab visible — refreshing data');
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const entries = Object.values(leaderboards);

  const tickerItems = [
    'ENJOY AI SCORING SYSTEM',
    'LIVE SCOREBOARD',
    'PRECISION GRADING',
    'INTERNATIONAL STANDARD',
    'AI PROGRAMMING CHAMPIONSHIP',
    'REAL-TIME RESULTS',
    'AI COMPETITION PLATFORM',
  ];

  const meteors = Array.from({ length: 6 }).map((_, i) => ({
    id: i,
    top: `${-5 + Math.random() * 35}%`,
    left: `${45 + Math.random() * 55}%`,
    delay: `${i * 4 + Math.random() * 8}s`,
    dur: `${1.4 + Math.random() * 1}s`,
    size: `${100 + Math.random() * 120}px`,
  }));

  const universeStars = Array.from({ length: 120 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 2,
    dur: 2 + Math.random() * 4,
    delay: Math.random() * 8,
    op: 0.2 + Math.random() * 0.7,
  }));

  return (
    <div className="homepage">

      {/* UNIVERSE BACKGROUND */}
      <div className="universe-bg" aria-hidden="true">
        {universeStars.map(s => (
          <span key={s.id} className="uni-star" style={{
            '--x': `${s.x}%`, '--y': `${s.y}%`,
            '--size': `${s.size}px`, '--d': `${s.dur}s`,
            '--delay': `${s.delay}s`, '--op': s.op,
          }} />
        ))}
        {meteors.map(m => (
          <span key={m.id} className="meteor" style={{
            '--top': m.top, '--left': m.left,
            '--delay': m.delay, '--dur': m.dur,
            '--size': m.size,
          }} />
        ))}
      </div>

      {/* HEADER */}
      <header className={`home-header${scrolled ? ' scrolled' : ''}`}>
        <div className="home-header-inner container">
          <Link to="/" className="home-logo">
            <img
              src="/images/logo1.png"
              alt="ENJOY AI"
              className="home-logo-img"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.add('show'); }}
            />
            <span className="home-logo-text">ENJOY AI</span>
          </Link>
          <nav className="home-nav">
            <Link to="/" className="nav-link active">Home</Link>
            <Link to="/admin" className="nav-link nav-link-admin">Admin</Link>
            <Link to="/referee" className="nav-link nav-link-outline">Referee</Link>
          </nav>
        </div>
      </header>

      {/* TICKER */}
      <div className="ticker-bar">
        <div className="ticker-inner">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-dot" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
        <div className="container hero-inner">

          {/* Left column: text + stats */}
          <div className="hero-left">
            <div className="hero-label">
              <span className="hero-label-dot" />
              ENJOY AI OFFICIAL PLATFORM
            </div>
            <h1 className="hero-title">
              SCORING<br />
              <span className="hero-title-accent">SYSTEM</span>
            </h1>
            <p className="hero-sub">
              International AI Programming Competition<br />
              Real-time precision grading for every match
            </p>

            {/* Stats — editorial style */}
            <div className="hero-stats-row">
              <div className="hero-stat-block">
                <div className="hero-stat-number">{competitions.length || '—'}</div>
                <div className="hero-stat-label">Competitions</div>
              </div>
              <div className="hero-stat-sep" />
              <div className="hero-stat-block">
                <div className="hero-stat-number">{entries.length || '—'}</div>
                <div className="hero-stat-label">Categories</div>
              </div>
              <div className="hero-stat-sep" />
              <div className="hero-stat-block">
                <div className="hero-stat-number">
                  {entries.reduce((s, e) => s + (e.list?.length || 0), 0) || '—'}
                </div>
                <div className="hero-stat-label">Teams</div>
              </div>
            </div>
          </div>

          {/* Right column: logo */}
          <div className="hero-right">
            <img
              src="/images/logo2.png"
              alt=""
              className="hero-logo"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.add('show'); }}
            />
            <div className="hero-logo-text">ENJOY AI</div>
          </div>

        </div>

        {/* Features strip */}
        <div className="container">
          <div className="features-strip">
            <div className="features-line" />
            <div className="features-items">
              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="9" stroke="#22d3ee" strokeWidth="1.5"/>
                    <polyline points="7,11 10,14 15,8" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="11" cy="11" r="2" fill="#22d3ee" opacity="0.4"/>
                  </svg>
                </div>
                <div className="feature-text">
                  <div className="feature-title">Real-Time</div>
                  <div className="feature-desc">Live score updates</div>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="9" stroke="#a78bfa" strokeWidth="1.5"/>
                    <circle cx="11" cy="11" r="5" stroke="#a78bfa" strokeWidth="1.5"/>
                    <circle cx="11" cy="11" r="1.5" fill="#a78bfa"/>
                    <line x1="11" y1="2" x2="11" y2="5" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="11" y1="17" x2="11" y2="20" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="2" y1="11" x2="5" y2="11" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="17" y1="11" x2="20" y2="11" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="feature-text">
                  <div className="feature-title">Precision</div>
                  <div className="feature-desc">Accurate grading</div>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="2" y="5" width="18" height="12" rx="2" stroke="#fbbf24" strokeWidth="1.5"/>
                    <line x1="6" y1="5" x2="6" y2="3" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="16" y1="5" x2="16" y2="3" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="2" y1="9" x2="20" y2="9" stroke="#fbbf24" strokeWidth="1" opacity="0.4"/>
                    <circle cx="11" cy="13" r="1.5" fill="#fbbf24"/>
                  </svg>
                </div>
                <div className="feature-text">
                  <div className="feature-title">International</div>
                  <div className="feature-desc">Global standard</div>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <path d="M11 2L13.5 8H20L14.5 12L16.5 18L11 14L5.5 18L7.5 12L2 8H8.5L11 2Z"
                        stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M11 8L12.2 11H15.5L12.8 12.8L13.8 16L11 14L8.2 16L9.2 12.8L6.5 11H9.8L11 8Z"
                      fill="#34d399" opacity="0.25"/>
                  </svg>
                </div>
                <div className="feature-text">
                  <div className="feature-title">Rewards</div>
                  <div className="feature-desc">Attractive prizes</div>
                </div>
              </div>
            </div>
            <div className="features-line" />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="home-footer">
        <div className="container home-footer-inner">
          <div className="footer-brand">
            <img
              src="/images/logo1.png"
              alt="ENJOY AI"
              className="footer-logo"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <div className="footer-brand-name">ENJOY AI</div>
              <div className="footer-brand-sub">Scoring System · International AI Competition</div>
            </div>
          </div>
          <div className="footer-links">
            <Link to="/" className="footer-link">Home</Link>
            <Link to="/admin" className="footer-link">Admin</Link>
            <Link to="/referee" className="footer-link">Referee</Link>
          </div>
          <div className="footer-contact">
            <a href="mailto:info@enjoyai.vn" className="footer-email">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="3" width="12" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <polyline points="1,3.5 7,8.5 13,3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              info@enjoyai.vn
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2025 ENJOY AI Scoring System · All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
