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
        const active = comps.filter(c => c.isActive !== false);
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
  }, []);

  const entries = Object.values(leaderboards);

  const rankBadge = (i) => {
    if (i === 0) return <span className="rank-badge gold">1</span>;
    if (i === 1) return <span className="rank-badge silver">2</span>;
    if (i === 2) return <span className="rank-badge bronze">3</span>;
    return <span className="rank-num">{i + 1}</span>;
  };

  const tickerItems = [
    'ENJOY AI ASIA OPEN',
    'Kết quả thời gian thực',
    'Chấm điểm chính xác',
    'Chuẩn quốc tế',
    'Giải đấu lập trình AI hàng đầu',
    'Live Scoreboard',
    'AI Competition Platform',
  ];

  // Generate meteors — fall from top-right → bottom-left, infrequent
  const meteors = Array.from({ length: 6 }).map((_, i) => ({
    id: i,
    top: `${-5 + Math.random() * 35}%`,
    left: `${45 + Math.random() * 55}%`,
    delay: `${i * 4 + Math.random() * 8}s`,
    dur: `${1.4 + Math.random() * 1}s`,
    size: `${100 + Math.random() * 120}px`,
  }));

  // Universe stars (static across whole page)
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

      {/* UNIVERSE BACKGROUND — full page */}
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
            <Link to="/" className="nav-link active">Trang chủ</Link>
            <Link to="/admin" className="nav-link">Admin</Link>
            <Link to="/referee" className="nav-link nav-link-outline">Trọng tài</Link>
          </nav>
        </div>
      </header>

      {/* TICKER */}
      <div className="ticker-bar">
        <div className="ticker-inner">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="ticker-item">
              {item}
              <span className="ticker-sep">|</span>
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
          <div className="hero-badge">
            Giải đấu lập trình AI hàng đầu Việt Nam
          </div>
          <img
            src="/images/logo2.png"
            alt=""
            className="hero-logo"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h1 className="hero-title">
            ENJOY AI<br />
            <span className="hero-title-accent">ASIA OPEN</span>
          </h1>
          <p className="hero-sub">
            Nền tảng thi đấu lập trình chuẩn quốc tế · Việt Nam
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">{competitions.length || '—'}</div>
              <div className="hero-stat-label">Cuộc thi</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <div className="hero-stat-value">{entries.length || '—'}</div>
              <div className="hero-stat-label">Nội dung</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <div className="hero-stat-value">
                {entries.reduce((s, e) => s + (e.list?.length || 0), 0) || '—'}
              </div>
              <div className="hero-stat-label">Đội thi</div>
            </div>
          </div>
          <div className="hero-features">
            <div className="hero-feature">
              <span className="hero-feature-icon">⚡</span>
              <span>Kết quả thời gian thực</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">🎯</span>
              <span>Chấm điểm chính xác</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">🌏</span>
              <span>Chuẩn quốc tế</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">🏅</span>
              <span>Phần thưởng hấp dẫn</span>
            </div>
          </div>
        </div>
      </section>

      {/* LEADERBOARD */}
      <section className="bxh-section">
        <div className="container">
          <div className="bxh-header">
            <div>
              <h2 className="bxh-title">Bảng xếp hạng</h2>
              <p className="bxh-desc">Kết quả theo từng nội dung thi của từng cuộc thi</p>
            </div>
          </div>

          {loading ? (
            <div className="bxh-loading-wrap">
              <div className="bxh-spinner" />
              <p>Đang tải dữ liệu...</p>
            </div>
          ) : (
            <>
              {competitions.length === 0 && (
                <div className="bxh-empty-wrap">
                  <div className="bxh-empty-icon">🏁</div>
                  <p className="bxh-empty">Chưa có cuộc thi nào đang mở.</p>
                  <p className="bxh-empty-sub">Hãy quay lại sau để xem kết quả thi đấu.</p>
                </div>
              )}
              {competitions.map((comp) => {
                const compEntries = entries
                  .filter(e => e.content.competitionId === comp.id)
                  .sort((a, b) => (a.content.order || 0) - (b.content.order || 0));
                return (
                  <div key={comp.id} className="bxh-comp-wrap">
                  <div className="bxh-comp">
                    <div className="bxh-comp-header">
                      <div className="bxh-comp-icon">🏆</div>
                      <div>
                        <h3 className="bxh-comp-name">{comp.name}</h3>
                        <p className="bxh-comp-meta">
                          {comp.location && <span className="meta-chip">📍 {comp.location}</span>}
                          {(comp.startDate || comp.endDate) && (
                            <span className="meta-chip">📅 {comp.startDate} – {comp.endDate}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="bxh-comp-body">
                      {compEntries.length === 0 && (
                        <p className="bxh-no-content">Chưa có nội dung thi.</p>
                      )}

                      <div className="bxh-contents-grid">
                        {compEntries.map(({ content, list }) => (
                          <div key={content.id} className="bxh-content-card">
                            <div className="bxh-content-header">
                              <h4 className="bxh-content-name">{content.name}</h4>
                              <span className="bxh-content-count">{list.length} đội</span>
                            </div>
                            {list.length === 0 ? (
                              <div className="bxh-no-score">Chưa có điểm</div>
                            ) : (
                              <div className="table-wrap">
                                <table className="bxh-table">
                                  <thead>
                                    <tr>
                                      <th>Hạng</th>
                                      <th>Đội thi</th>
                                      <th>Thời gian</th>
                                      <th>Điểm</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {list.slice(0, 20).map((row, i) => (
                                      <tr key={row.id} className={i < 3 ? `top-row top-${i + 1}` : ''}>
                                        <td className="rank-cell">{rankBadge(i)}</td>
                                        <td className="team-cell">{row.team?.name || '—'}</td>
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
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
              <div className="footer-brand-name">ENJOY AI ASIA OPEN</div>
              <div className="footer-brand-sub">Hệ thống chấm điểm thi đấu</div>
            </div>
          </div>
          <div className="footer-links">
            <Link to="/" className="footer-link">Trang chủ</Link>
            <Link to="/admin" className="footer-link">Quản trị</Link>
            <Link to="/referee" className="footer-link">Trọng tài</Link>
          </div>
          <div className="footer-contact">
            <span>📧 info@enjoyai.vn</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2025 ENJOY AI ASIA OPEN · All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
