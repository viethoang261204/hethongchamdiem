import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useApiLoader, LoaderFull, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

export default function AdminScoreboard() {
  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const { data: compsData, loading: compsLoading, error: compsError, reload: compsReload } = useApiLoader(
    () => api.getCompetitions(),
    []
  );
  const competitions = compsData || [];
  const { data: contentsData, error: contentsError, reload: contentsReload } = useApiLoader(
    async () => selectedComp ? await api.getContents(selectedComp) : [],
    [selectedComp]
  );
  const contents = contentsData || [];
  const { data: scoreboardData, error: sbError, reload: sbReload } = useApiLoader(
    async () => selectedContent ? await api.getScoreboard(selectedContent) : [],
    [selectedContent]
  );
  const scoreboard = scoreboardData || [];

  useEffect(() => { setSelectedContent(''); }, [selectedComp]);

  const loading = compsLoading;
  const error = compsError || contentsError || sbError;
  const reload = () => { compsReload(); contentsReload(); sbReload(); };

  if (loading) return <LoaderFull />;
  if (error) return <div className="nhutin-admin"><ErrorBox error={error} onRetry={reload} /></div>;

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
                      <td>{s.submitted_at ? new Date(s.submitted_at).toLocaleString('vi-VN') : '-'}</td>
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
