import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './HomePage.css';

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line h-20 w-60" />
      <div className="skeleton-line w-40" />
      <div className="skeleton-line w-100" style={{ marginTop: 20 }} />
      <div className="skeleton-line w-80" />
      <div className="skeleton-line w-100" />
    </div>
  );
}

function RankCell({ rank }) {
  if (rank === 1) return <span className="rank-medal">🥇</span>;
  if (rank === 2) return <span className="rank-medal">🥈</span>;
  if (rank === 3) return <span className="rank-medal">🥉</span>;
  return <span className="rank-num">{rank}</span>;
}

export default function HomePage() {
  const [competitions, setCompetitions] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="homepage">
      {/* ── Header ── */}
      <header className="home-header">
        <div className="home-header-inner container">
          <Link to="/" className="home-logo">
            <img
              src="/images/logo1.png"
              alt="ENJOY AI"
              className="home-logo-img"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextElementSibling?.classList.add('show');
              }}
            />
            <span className="home-logo-text">ENJOY AI</span>
          </Link>
          <nav className="home-nav">
            <Link to="/">Trang chủ</Link>
            <Link to="/admin" className="nav-cta">Đăng nhập Admin</Link>
            <Link to="/referee">Trọng tài</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="container hero-inner">
          <img
            src="/images/logo2.png"
            alt=""
            className="hero-logo"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h1 className="hero-title">ENJOY AI ASIA OPEN</h1>
          <p className="hero-sub">Nền tảng thi đấu lập trình chuẩn quốc tế · Việt Nam</p>
          <div className="hero-boxes">
            <div className="hero-box">
              <span className="hero-box-icon">🌏</span>
              <div className="hero-box-label">Tiêu chuẩn</div>
              <div className="hero-box-text">Nền tảng thi đấu lập trình chuẩn quốc tế</div>
            </div>
            <div className="hero-box">
              <span className="hero-box-icon">⚡</span>
              <div className="hero-box-label">Tranh tài</div>
              <div className="hero-box-text">Đấu trí thực lực — chiến lược lên ngôi</div>
            </div>
            <div className="hero-box">
              <span className="hero-box-icon">🏆</span>
              <div className="hero-box-label">Giải thưởng</div>
              <div className="hero-box-text">Phần thưởng xứng tầm dành cho nhà vô địch</div>
            </div>
            <div className="hero-box">
              <span className="hero-box-icon">🚀</span>
              <div className="hero-box-label">Tương lai</div>
              <div className="hero-box-text">Bước khởi đầu vững chắc cho tương lai</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Leaderboard ── */}
      <section className="bxh-section">
        <div className="container">
          <div className="bxh-header">
            <div className="bxh-header-left">
              <h2 className="bxh-title">
                <span className="bxh-title-icon">🏅</span>
                Bảng xếp hạng
              </h2>
              <p className="bxh-desc">Kết quả theo từng nội dung thi của từng cuộc thi</p>
            </div>
            {!loading && competitions.length > 0 && (
              <div className="bxh-live-badge">
                <span className="live-dot" />
                Đang diễn ra
              </div>
            )}
          </div>

          {loading ? (
            <div className="bxh-loading">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <>
              {competitions.length === 0 && (
                <div className="bxh-empty">
                  <span className="bxh-empty-icon">📭</span>
                  <p className="bxh-empty-text">Chưa có cuộc thi nào đang mở.</p>
                </div>
              )}

              {competitions.map((comp) => {
                const compEntries = entries
                  .filter(e => e.content.competitionId === comp.id)
                  .sort((a, b) => (a.content.order || 0) - (b.content.order || 0));

                return (
                  <div key={comp.id} className="bxh-comp">
                    <div className="bxh-comp-header">
                      <div>
                        <h3 className="bxh-comp-name">{comp.name}</h3>
                        <p className="bxh-comp-meta">
                          <span>📍 {comp.location}</span>
                          <span>📅 {comp.startDate} – {comp.endDate}</span>
                        </p>
                      </div>
                      <span className="bxh-comp-tag">Active</span>
                    </div>

                    {compEntries.map(({ content, list }) => (
                      <div key={content.id} className="bxh-content-block">
                        <h4 className="bxh-content-name">{content.name}</h4>
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
                              {list.slice(0, 20).map((row, i) => {
                                const rank = i + 1;
                                return (
                                  <tr key={row.id} className={rank <= 3 ? `rank-${rank}` : ''}>
                                    <td className="rank-cell">
                                      <RankCell rank={rank} />
                                    </td>
                                    <td className="team-name">{row.team?.name || '—'}</td>
                                    <td>{row.time || '—'}</td>
                                    <td className="score-cell">{row.score ?? '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {list.length === 0 && (
                          <p className="bxh-no-score">Chưa có điểm số nào được ghi nhận.</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="container">
          <div className="home-footer-inner">
            <div>
              <p className="home-footer-brand">ENJOY AI ASIA OPEN</p>
              <p className="home-footer-tagline">Hệ thống chấm điểm thi lập trình</p>
            </div>
            <nav className="home-footer-links">
              <Link to="/">Trang chủ</Link>
              <Link to="/admin">Admin</Link>
              <Link to="/referee">Trọng tài</Link>
            </nav>
            <div className="home-footer-contact">
              <p>Liên hệ</p>
              <p><a href="mailto:info@enjoyai.vn">info@enjoyai.vn</a></p>
            </div>
          </div>
          <div className="home-footer-bottom">
            © {new Date().getFullYear()} ENJOY AI ASIA OPEN. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
