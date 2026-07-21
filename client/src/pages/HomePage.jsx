import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './HomePage.css';

export default function HomePage() {
  const [competitions, setCompetitions] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [loading, setLoading] = useState(true);
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
      } finally {
        setLoading(false);
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

  const rankBadge = (i) => {
    if (i === 0) return <span className="rank-badge gold">1</span>;
    if (i === 1) return <span className="rank-badge silver">2</span>;
    if (i === 2) return <span className="rank-badge bronze">3</span>;
    return <span className="rank-num">{i + 1}</span>;
  };

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

      {/* LEADERBOARD */}
      <section className="bxh-section">
        <div className="container">
          <div className="bxh-section-header">
            <div className="bxh-section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="bxh-section-icon">
                <path d="M2 14V6M6 14V2M10 14V4M14 14V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              LEADERBOARD
            </div>
            <h2 className="bxh-title">Live Rankings</h2>
            <p className="bxh-desc">
              Real-time results by category across all active competitions
            </p>
          </div>

          {loading ? (
            <div className="bxh-loading-wrap">
              <div className="bxh-spinner" />
              <p className="bxh-loading-text">Loading results...</p>
            </div>
          ) : (
            <>
              {competitions.length === 0 && (
                <div className="bxh-empty-wrap">
                  <div className="bxh-empty-graphic">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                      <rect x="4" y="4" width="72" height="72" rx="12" stroke="#1e293b" strokeWidth="2"/>
                      <path d="M24 56V28L36 16L48 28V56" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M44 40L52 48" stroke="#334155" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="36" cy="36" r="8" stroke="#475569" strokeWidth="2"/>
                    </svg>
                  </div>
                  <p className="bxh-empty">No active competitions</p>
                  <p className="bxh-empty-sub">Check back soon for live results and rankings.</p>
                </div>
              )}
              {competitions.map((comp) => {
                const compEntries = entries
                  .filter(e => e.content.competition_id === comp.id)
                  .sort((a, b) => (a.content.order || 0) - (b.content.order || 0));
                return (
                  <div key={comp.id} className="comp-block">
                    <div className="comp-header">
                      <div className="comp-meta-left">
                        <div className="comp-icon-wrap">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5L10 2Z"
                              fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="comp-info">
                          <h3 className="comp-name">{comp.name}</h3>
                          <div className="comp-chips">
                            {comp.location && (
                              <span className="comp-chip">
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <circle cx="5" cy="4" r="2" stroke="currentColor" strokeWidth="1"/>
                                  <path d="M5 10C5 10 2 7 2 4C2 2 3.5 1 5 1C6.5 1 8 2 8 4C8 7 5 10 5 10Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                                </svg>
                                {comp.location}
                              </span>
                            )}
                            {(comp.start_date || comp.end_date) && (
                              <span className="comp-chip">
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <rect x="1" y="2" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1"/>
                                  <line x1="1" y1="4.5" x2="9" y2="4.5" stroke="currentColor" strokeWidth="1"/>
                                  <line x1="3.5" y1="1" x2="3.5" y2="3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                                  <line x1="6.5" y1="1" x2="6.5" y2="3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                                </svg>
                                {comp.start_date}{comp.end_date ? ` – ${comp.end_date}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="comp-count-badge">
                        {compEntries.reduce((s, e) => s + (e.list?.length || 0), 0)} teams
                      </div>
                    </div>

                    <div className="comp-body">
                      {compEntries.length === 0 && (
                        <div className="comp-no-content">No categories available for this competition.</div>
                      )}
                      <div className="contents-grid">
                        {compEntries.map(({ content, list }) => (
                          <div key={content.id} className="content-card">
                            <div className="content-card-top">
                              <div className="content-card-label">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="content-card-bar" />
                                {content.name}
                              </div>
                              <div className="content-card-meta">{list.length} teams</div>
                            </div>
                            {list.length === 0 ? (
                              <div className="content-no-score">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                  <circle cx="10" cy="10" r="8" stroke="#334155" strokeWidth="1.2"/>
                                  <line x1="7" y1="10" x2="13" y2="10" stroke="#334155" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                                No scores yet
                              </div>
                            ) : (
                              <table className="content-table">
                                <thead>
                                  <tr>
                                    <th className="th-rank">#</th>
                                    <th className="th-team">Team</th>
                                    <th className="th-time">Time</th>
                                    <th className="th-score">Score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {list.slice(0, 10).map((row, i) => (
                                    <tr key={row.id} className={i < 3 ? `top-row top-${i + 1}` : ''}>
                                      <td className="rank-cell">{rankBadge(i)}</td>
                                      <td className="team-cell">{row.teams?.name || row.team?.name || '—'}</td>
                                      <td className="time-cell">{row.time || '—'}</td>
                                      <td className="score-cell">
                                        <span className={`score-badge${i === 0 ? ' score-gold' : i === 1 ? ' score-silver' : i === 2 ? ' score-bronze' : ''}`}>
                                          {row.score ?? '—'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
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
