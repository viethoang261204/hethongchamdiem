import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './HomePage.css';

export default function HomePage() {
  const [competitions, setCompetitions] = useState([]);
  const [leaderboards, setLeaderboards] = useState({}); // { contentId: [...] }
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
      <header className="home-header">
        <div className="home-header-inner container">
          <Link to="/" className="home-logo">
            <img src="/images/logo1.png" alt="ENJOY AI" className="home-logo-img" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.add('show'); }} />
            <span className="home-logo-text">ENJOY AI ASIA OPEN</span>
          </Link>
          <nav className="home-nav">
            <Link to="/">Trang chủ</Link>
            <Link to="/admin">Đăng nhập Admin</Link>
            <Link to="/referee">Trọng tài</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="hero-bg" />
        <div className="container hero-inner">
          <img src="/images/logo2.png" alt="" className="hero-logo" onError={(e) => { e.target.style.display = 'none'; }} />
          <h1 className="hero-title">ENJOY AI ASIA OPEN</h1>
          <p className="hero-sub">Nền tảng thi đấu lập trình chuẩn quốc tế · Việt Nam</p>
          <div className="hero-boxes">
            <div className="hero-box">Nền tảng thi đấu lập trình chuẩn quốc tế</div>
            <div className="hero-box">Đấu trí thực lực — chiến lược lên ngôi</div>
            <div className="hero-box">Phần thưởng xứng tầm dành cho nhà vô địch</div>
            <div className="hero-box">Bước khởi đầu vững chắc cho tương lai</div>
          </div>
        </div>
      </section>

      <section className="bxh-section">
        <div className="container">
          <h2 className="bxh-title">Bảng xếp hạng</h2>
          <p className="bxh-desc">Kết quả theo từng nội dung thi của từng cuộc thi</p>

          {loading ? (
            <p className="bxh-loading">Đang tải...</p>
          ) : (
            <>
              {competitions.length === 0 && (
                <p className="bxh-empty">Chưa có cuộc thi nào đang mở.</p>
              )}
              {competitions.map((comp) => (
                <div key={comp.id} className="bxh-comp card">
                  <h3 className="bxh-comp-name">{comp.name}</h3>
                  <p className="bxh-comp-meta">{comp.location} · {comp.startDate} – {comp.endDate}</p>
                  {entries
                    .filter(e => e.content.competitionId === comp.id)
                    .sort((a, b) => (a.content.order || 0) - (b.content.order || 0))
                    .map(({ content, list }) => (
                      <div key={content.id} className="bxh-content-block">
                        <h4 className="bxh-content-name">{content.name}</h4>
                        <div className="table-wrap">
                          <table className="bxh-table">
                            <thead>
                              <tr>
                                <th>Hạng</th>
                                <th>Đội</th>
                                <th>Thời gian</th>
                                <th>Điểm</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.slice(0, 20).map((row, i) => (
                                <tr key={row.id}>
                                  <td>{i + 1}</td>
                                  <td>{row.team?.name || '-'}</td>
                                  <td>{row.time || '-'}</td>
                                  <td><strong>{row.score ?? '-'}</strong></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {list.length === 0 && <p className="bxh-no-score">Chưa có điểm</p>}
                      </div>
                    ))}
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <footer className="home-footer">
        <div className="container">
          <p>ENJOY AI ASIA OPEN · Hệ thống chấm điểm</p>
          <p className="home-contact">Liên hệ: info@enjoyai.vn</p>
        </div>
      </footer>
    </div>
  );
}
