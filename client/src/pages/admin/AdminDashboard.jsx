import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import './AdminLayout.css';

const ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4 0v-4m0-4h4l1-6H7l1 6h4v4M5 7h14M7 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>,
  ranking: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ competitions: 0, students: 0, referees: 0, scores: 0 });
  const [competitions, setCompetitions] = useState([]);
  const [contentsByComp, setContentsByComp] = useState({});
  const [scoreboards, setScoreboards] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [comps, students, users, scores] = await Promise.all([
          api.getCompetitions(),
          api.getStudents(),
          api.getUsers('referee'),
          api.getScores(),
        ]);
        setStats({
          competitions: comps.length,
          students: students.length,
          referees: users.length,
          scores: scores.length,
        });
        setCompetitions(comps.filter(c => c.isActive !== false));

        const contentsMap = {};
        const scoreboardsMap = {};

        for (const comp of comps) {
          const contents = await api.getContents(comp.id);
          contentsMap[comp.id] = contents;

          for (const content of contents) {
            const sb = await api.getScoreboard(content.id);
            if (sb.length > 0) {
              scoreboardsMap[content.id] = sb.slice(0, 5);
            }
          }
        }

        setContentsByComp(contentsMap);
        setScoreboards(scoreboardsMap);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="nhutin-admin dashboard-page">
      <div className="page-header">
        <div>
          <h1 className="welcome-text">Chào mừng trở lại, {user?.fullName || user?.username}!</h1>
          <p className="welcome-sub">Tổng quan hệ thống ENJOY AI • {today}</p>
        </div>
      </div>

      <div className="stats-grid">
        <Link to="/admin/competitions" className="stat-card stat-card-link">
          <div className="stat-icon blue">{ICONS.trophy}</div>
          <div className="stat-value">{stats.competitions}</div>
          <div className="stat-label">Cuộc thi</div>
        </Link>
        <Link to="/admin/students" className="stat-card stat-card-link">
          <div className="stat-icon green">{ICONS.users}</div>
          <div className="stat-value">{stats.students}</div>
          <div className="stat-label">Học sinh</div>
        </Link>
        <Link to="/admin/referee-accounts" className="stat-card stat-card-link">
          <div className="stat-icon orange">{ICONS.user}</div>
          <div className="stat-value">{stats.referees}</div>
          <div className="stat-label">Tài khoản trọng tài</div>
        </Link>
        <Link to="/admin/scores" className="stat-card stat-card-link">
          <div className="stat-icon purple">{ICONS.file}</div>
          <div className="stat-value">{stats.scores}</div>
          <div className="stat-label">Phiếu điểm</div>
        </Link>
      </div>

      <div className="two-columns">
        <div style={{ flex: 2 }}>
          {loading ? (
            <p>Đang tải...</p>
          ) : competitions.length === 0 ? (
            <div className="card">
              <p style={{ padding: 24, textAlign: 'center', color: '#888' }}>Chưa có cuộc thi nào đang mở.</p>
            </div>
          ) : (
            competitions.map((comp) => {
              const contents = contentsByComp[comp.id] || [];
              const hasScoreboard = contents.some(c => scoreboards[c.id]?.length > 0);

              return (
                <div key={comp.id} className="card" style={{ marginBottom: 24 }}>
                  <div className="card-header">
                    <h3 className="card-title">{comp.name}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link to={`/admin/competitions/${comp.id}/contents`} className="card-badge">Quản lý nội dung</Link>
                      <Link to={`/admin/teams`} className="card-badge">Quản lý đội</Link>
                    </div>
                  </div>
                  {contents.length === 0 ? (
                    <p style={{ padding: '1rem', color: '#888' }}>Chưa có nội dung thi.</p>
                  ) : (
                    <div className="scoreboard-sections">
                      {contents.map((content) => {
                        const scores = scoreboards[content.id] || [];
                        if (scores.length === 0) return null;

                        return (
                          <div key={content.id} className="scoreboard-section">
                            <div className="scoreboard-header">
                              <h4 className="scoreboard-title">{content.name}</h4>
                              <Link to={`/admin/competitions/${comp.id}/contents/${content.id}/scoreboard`} className="card-badge">Xem chi tiết</Link>
                            </div>
                            <table className="scoreboard-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 50 }}>Hạng</th>
                                  <th>Đội</th>
                                  <th style={{ width: 80 }}>Điểm</th>
                                </tr>
                              </thead>
                              <tbody>
                                {scores.map((s, i) => (
                                  <tr key={s.id}>
                                    <td>
                                      <span className={`rank-badge rank-${i + 1}`}>{i + 1}</span>
                                    </td>
                                    <td>{s.team?.name || '-'}</td>
                                    <td><strong>{s.score ?? '-'}</strong></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                      {!hasScoreboard && (
                        <p style={{ padding: '1rem', color: '#888', textAlign: 'center' }}>Chưa có điểm nào.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Thao tác nhanh</h3>
            </div>
            <div className="quick-actions">
              <Link to="/admin/competitions" className="quick-action">
                <div className="quick-icon blue">{ICONS.trophy}</div>
                <div className="quick-info">
                  <div className="quick-title">Quản lý cuộc thi</div>
                  <div className="quick-desc">Tạo và quản lý cuộc thi, nội dung</div>
                </div>
              </Link>
              <Link to="/admin/teams" className="quick-action">
                <div className="quick-icon blue">{ICONS.users}</div>
                <div className="quick-info">
                  <div className="quick-title">Quản lý đội thi</div>
                  <div className="quick-desc">Thêm/sửa đội thi</div>
                </div>
              </Link>
              <Link to="/admin/students" className="quick-action">
                <div className="quick-icon blue">{ICONS.users}</div>
                <div className="quick-info">
                  <div className="quick-title">Quản lý học sinh</div>
                  <div className="quick-desc">Thêm/sửa học sinh tham gia thi</div>
                </div>
              </Link>
              <Link to="/admin/referee-accounts" className="quick-action">
                <div className="quick-icon blue">{ICONS.user}</div>
                <div className="quick-info">
                  <div className="quick-title">Tài khoản trọng tài</div>
                  <div className="quick-desc">Thêm/sửa tài khoản trọng tài</div>
                </div>
              </Link>
              <Link to="/admin/scores" className="quick-action">
                <div className="quick-icon blue">{ICONS.file}</div>
                <div className="quick-info">
                  <div className="quick-title">Phiếu điểm</div>
                  <div className="quick-desc">Xem và quản lý phiếu điểm</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
