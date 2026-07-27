import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { formatSecondsAsMinutes } from '../../lib/time';
import { exportMultipleToPdf } from '../referee/exportPdf';
import ScoreSheetTable from '../shared/ScoreSheetTable';
import './AdminLayout.css';

export default function AdminReports() {
  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, allContents] = await Promise.all([api.getCompetitions(), api.getAllContents()]);
    return { competitions: comps, contents: allContents };
  }, []);
  const competitions = data?.competitions || [];
  const contents = data?.contents || [];

  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const [groupBy, setGroupBy] = useState('school'); // school | coach
  const [rows, setRows] = useState(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState(null);
  // Tên group (trường/HLV) đang xuất PDF chi tiết — dùng để disable đúng nút đó
  const [exportingGroup, setExportingGroup] = useState(null);
  // Danh sách phiếu điểm chi tiết (đã fetch đủ scores + tasks) đang chờ render
  // ẩn để html2canvas chụp từng phiếu, gộp thành 1 PDF cho cả group.
  const [pendingExport, setPendingExport] = useState(null);

  const contentsForComp = useMemo(
    () => contents.filter((c) => !selectedComp || c.competition_id === selectedComp),
    [contents, selectedComp]
  );

  const loadReport = async () => {
    if (!selectedComp) return;
    setRowsLoading(true);
    setRowsError(null);
    try {
      const data = await api.getReportScores({ competitionId: selectedComp, contentId: selectedContent || undefined });
      setRows(data);
    } catch (e) {
      setRowsError(e.message || 'Lỗi tải báo cáo.');
    } finally {
      setRowsLoading(false);
    }
  };

  // Gộp theo đội (tổng cả 2 lượt), rồi nhóm theo trường hoặc HLV
  const groups = useMemo(() => {
    if (!rows) return [];
    const byTeam = new Map();
    for (const r of rows) {
      if (!byTeam.has(r.team_id)) {
        byTeam.set(r.team_id, {
          team_id: r.team_id,
          team_name: r.team_name,
          school: r.schools?.name || 'Chưa có trường',
          coach: r.coaches?.name || 'Chưa có HLV',
          content_name: r.content_name,
          contest_content_id: r.contest_content_id,
          total_score: 0,
          total_time: 0,
          rounds: 0,
        });
      }
      const t = byTeam.get(r.team_id);
      t.total_score += Number(r.score) || 0;
      t.total_time += Number(r.time) || 0;
      t.rounds += 1;
    }
    const teams = Array.from(byTeam.values());
    const key = groupBy === 'coach' ? 'coach' : 'school';
    const byGroup = new Map();
    for (const t of teams) {
      const g = t[key];
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(t);
    }
    return Array.from(byGroup.entries())
      .map(([name, teamsList]) => ({
        name,
        teams: teamsList.sort((a, b) => b.total_score - a.total_score),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, groupBy]);

  const compName = competitions.find((c) => c.id === selectedComp)?.name || '';
  const contentName = contents.find((c) => c.id === selectedContent)?.name || 'Tất cả nội dung';

  // Xuất PDF CHI TIẾT (đầy đủ phiếu điểm từng đội, theo đúng mẫu Score Sheet)
  // cho toàn bộ đội thuộc 1 group (1 trường/trung tâm hoặc 1 HLV) — không phải
  // bảng tổng hợp điểm.
  const handleExportGroupPdf = async (group) => {
    setExportingGroup(group.name);
    try {
      const tasksCache = new Map();
      const sheets = [];
      for (const t of group.teams) {
        const contentId = t.contest_content_id;
        if (contentId && !tasksCache.has(contentId)) {
          tasksCache.set(contentId, await api.getTasks(contentId).catch(() => []));
        }
        const teamScores = contentId
          ? await api.getScores({ teamId: t.team_id, contestContentId: contentId }).catch(() => [])
          : [];
        const contentObj = contents.find((c) => c.id === contentId) || { name: t.content_name };
        sheets.push({
          key: `${t.team_id}-${contentId}`,
          scores: teamScores,
          content: contentObj,
          tasks: tasksCache.get(contentId) || [],
        });
      }
      setPendingExport(sheets);
      // Chờ React render xong các sheet ẩn rồi mới chụp (2 rAF cho chắc đã paint)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = sheets.map((s) => document.getElementById(`export-sheet-${s.key}`));
      const slug = group.name.replace(/\s+/g, '-').toLowerCase();
      await exportMultipleToPdf(nodes, `phieu-diem-${slug}`);
    } finally {
      setPendingExport(null);
      setExportingGroup(null);
    }
  };

  if (loading) return <div className="nhutin-admin"><p style={{ padding: 24 }}>Đang tải...</p></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Báo cáo điểm</h1>
          <p className="page-subtitle">Lọc theo trường/trung tâm hoặc huấn luyện viên, tải PDF chi tiết phiếu điểm ngay trong từng nhóm</p>
        </div>
      </div>

      {error && <div className="no-print"><ErrorBox error={error} onRetry={reload} /></div>}

      <div className="card no-print" style={{ marginBottom: 24 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Cuộc thi <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="form-input form-select" value={selectedComp} onChange={(e) => { setSelectedComp(e.target.value); setSelectedContent(''); setRows(null); }}>
              <option value="">-- Chọn cuộc thi --</option>
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 250 }}>
            <label className="form-label">Nội dung thi</label>
            <select className="form-input form-select" value={selectedContent} onChange={(e) => { setSelectedContent(e.target.value); setRows(null); }} disabled={!selectedComp}>
              <option value="">Tất cả nội dung</option>
              {contentsForComp.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label className="form-label">Nhóm theo</label>
            <select className="form-input form-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="school">Trung tâm (trường)</option>
              <option value="coach">Huấn luyện viên</option>
            </select>
          </div>
          <button type="button" className="btn btn-primary" onClick={loadReport} disabled={!selectedComp || rowsLoading} style={{ alignSelf: 'flex-end' }}>
            {rowsLoading ? 'Đang tải...' : 'Xem báo cáo'}
          </button>
        </div>
      </div>

      {rowsError && <div className="no-print"><ErrorBox error={rowsError} onRetry={loadReport} /></div>}

      {rows && (
        <div className="report-page">
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>Báo cáo điểm — {compName}</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>
              {contentName} · Nhóm theo {groupBy === 'coach' ? 'huấn luyện viên' : 'trung tâm'} · Xem lúc {new Date().toLocaleString('vi-VN')}
            </p>
          </div>

          {groups.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>Chưa có dữ liệu điểm.</div>
          ) : groups.map((g) => (
            <div className="card report-group" key={g.name} style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">{g.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="page-subtitle">{g.teams.length} đội</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleExportGroupPdf(g)}
                    disabled={exportingGroup === g.name}
                  >
                    {exportingGroup === g.name ? 'Đang xuất...' : 'Tải PDF'}
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      <th>Nội dung</th>
                      <th style={{ width: 90 }}>Số lượt</th>
                      <th style={{ width: 100 }}>Tổng điểm</th>
                      <th style={{ width: 120 }}>Tổng thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.teams.map((t) => (
                      <tr key={t.team_id}>
                        <td>{t.team_name}</td>
                        <td>{t.content_name}</td>
                        <td>{t.rounds}</td>
                        <td><strong>{t.total_score}</strong></td>
                        <td>{formatSecondsAsMinutes(String(t.total_time)) || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Render ẩn (ngoài màn hình) toàn bộ phiếu điểm chi tiết của group đang
          xuất, để html2canvas chụp từng phiếu rồi gộp thành 1 file PDF. */}
      {pendingExport && (
        <div style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1 }}>
          {pendingExport.map((s) => (
            <div key={s.key} id={`export-sheet-${s.key}`}>
              <ScoreSheetTable scores={s.scores} content={s.content} tasks={s.tasks} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
