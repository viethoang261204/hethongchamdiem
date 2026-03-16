import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import './AdminLayout.css';

export default function AdminScoreboard() {
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const [scoreboard, setScoreboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadComps() {
      try {
        const comps = await api.getCompetitions();
        setCompetitions(comps.filter(c => c.isActive !== false));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadComps();
  }, []);

  useEffect(() => {
    async function loadContents() {
      if (!selectedComp) {
        setContents([]);
        return;
      }
      try {
        const list = await api.getContents(selectedComp);
        setContents(list);
        setSelectedContent('');
        setScoreboard([]);
      } catch (e) {
        console.error(e);
      }
    }
    loadContents();
  }, [selectedComp]);

  useEffect(() => {
    async function loadScoreboard() {
      if (!selectedContent) {
        setScoreboard([]);
        return;
      }
      try {
        const data = await api.getScoreboard(selectedContent);
        setScoreboard(data);
      } catch (e) {
        console.error(e);
      }
    }
    loadScoreboard();
  }, [selectedContent]);

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bảng xếp hạng</h1>
          <p className="page-subtitle">Chọn cuộc thi và nội dung để xem bảng xếp hạng</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Cuộc thi</label>
            <select className="form-input form-select" value={selectedComp} onChange={(e) => setSelectedComp(e.target.value)}>
              <option value="">-- Chọn cuộc thi --</option>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Nội dung thi</label>
            <select className="form-input form-select" value={selectedContent} onChange={(e) => setSelectedContent(e.target.value)} disabled={!selectedComp}>
              <option value="">-- Chọn nội dung --</option>
              {contents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedContent && (
        <>
          <div className="page-header" style={{ marginTop: 24 }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 20 }}>Bảng xếp hạng</h2>
              <p className="page-subtitle">{scoreboard.length} đội</p>
            </div>
            <Link to={`/admin/competitions/${selectedComp}/contents/${selectedContent}/teams`} className="btn btn-secondary">Quản lý đội</Link>
          </div>

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Hạng</th>
                    <th>Đội</th>
                    <th style={{ width: 100 }}>Thời gian</th>
                    <th style={{ width: 100 }}>Điểm</th>
                    <th style={{ width: 150 }}>Ngày chấm</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreboard.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có điểm nào.</td></tr>
                  ) : scoreboard.map((s, i) => (
                    <tr key={s.id}>
                      <td>
                        <span className={`rank-badge rank-${i + 1}`}>{i + 1}</span>
                      </td>
                      <td>{s.team?.name || '-'}</td>
                      <td>{s.time || '-'}</td>
                      <td><strong>{s.score}</strong></td>
                      <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString('vi-VN') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
