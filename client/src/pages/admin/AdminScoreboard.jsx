import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useApiLoader, LoaderFull, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

const UNASSIGNED = '__unassigned__';

export default function AdminScoreboard() {
  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('');
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
  const { data: boardsData, error: boardsError, reload: boardsReload } = useApiLoader(
    async () => selectedContent ? await api.getBoards(selectedContent) : [],
    [selectedContent]
  );
  const boards = boardsData || [];
  const { data: scoreboardData, error: sbError, reload: sbReload } = useApiLoader(
    async () => selectedContent ? await api.getScoreboard(selectedContent) : [],
    [selectedContent]
  );
  const scoreboard = scoreboardData || [];

  useEffect(() => { setSelectedContent(''); }, [selectedComp]);
  useEffect(() => { setSelectedBoard(''); }, [selectedContent]);

  // Mỗi bảng đấu xếp hạng riêng — không so điểm chéo giữa các bảng độ tuổi khác nhau
  const groups = useMemo(() => {
    const rows = selectedBoard
      ? scoreboard.filter((s) => (s.boards?.id || UNASSIGNED) === selectedBoard)
      : scoreboard;
    const byBoard = new Map();
    for (const s of rows) {
      const key = s.boards?.id || UNASSIGNED;
      if (!byBoard.has(key)) byBoard.set(key, { board: s.boards || null, rows: [] });
      byBoard.get(key).rows.push(s);
    }
    const orderIndex = new Map(boards.map((b, idx) => [b.id, idx]));
    return Array.from(byBoard.values()).sort((a, b) => {
      const ai = a.board ? (orderIndex.get(a.board.id) ?? 999) : 1000;
      const bi = b.board ? (orderIndex.get(b.board.id) ?? 999) : 1000;
      return ai - bi;
    });
  }, [scoreboard, selectedBoard, boards]);

  const loading = compsLoading;
  const error = compsError || contentsError || boardsError || sbError;
  const reload = () => { compsReload(); contentsReload(); boardsReload(); sbReload(); };

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
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="form-label">Bảng đấu</label>
            <select className="form-input form-select" value={selectedBoard} onChange={(e) => setSelectedBoard(e.target.value)} disabled={!selectedContent}>
              <option value="">-- Tất cả bảng --</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}{b.age_group ? ` — ${b.age_group}` : ''}</option>)}
              <option value={UNASSIGNED}>Chưa phân bảng</option>
            </select>
          </div>
        </div>
      </div>

      {selectedContent && (
        <>
          <div className="page-header" style={{ marginTop: 24 }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 20 }}>Bảng xếp hạng</h2>
              <p className="page-subtitle">{scoreboard.length} đội · xếp hạng riêng theo từng bảng đấu</p>
            </div>
            <Link to={`/admin/competitions/${selectedComp}/contents/${selectedContent}/teams`} className="btn btn-secondary">Quản lý đội</Link>
          </div>

          {groups.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>Chưa có điểm nào.</div>
          ) : groups.map((g) => (
            <div className="card" key={g.board?.id || UNASSIGNED} style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">
                  {g.board ? `${g.board.name}${g.board.age_group ? ` — ${g.board.age_group}` : ''}` : 'Chưa phân bảng'}
                </h3>
                <span className="page-subtitle">{g.rows.length} đội</span>
              </div>
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
                    {g.rows.map((s, i) => (
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
          ))}
        </>
      )}
    </div>
  );
}
