import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { formatSecondsAsMinutes } from '../../lib/time';
import { exportMultipleToPdf } from '../referee/exportPdf';
import ScoreSheetTable from '../shared/ScoreSheetTable';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';
import { downloadWorkbook } from '../../lib/excelReport';
import { loadReportRows, groupReportRows, buildGroupWorkbook } from '../../lib/scoreExports';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import './AdminLayout.css';

export default function AdminReports() {
  const { showAlert } = useNotify();
  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, allContents] = await Promise.all([api.getCompetitions(), api.getAllContents()]);
    return { competitions: comps, contents: allContents };
  }, []);
  const competitions = data?.competitions || [];
  const contents = data?.contents || [];

  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  // Nhóm báo cáo theo Trường/Trung tâm (mặc định) hoặc theo Huấn luyện viên —
  // đổi qua lại chỉ đổi cách gộp nhóm để xem/xuất Excel, không đổi dữ liệu.
  const [groupBy, setGroupBy] = useState('school');
  const [rows, setRows] = useState(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState(null);
  // Tên group (trường/HLV) đang xuất PDF chi tiết — dùng để disable đúng nút đó
  const [exportingGroup, setExportingGroup] = useState(null);
  // Danh sách phiếu điểm chi tiết (đã fetch đủ scores + tasks) đang chờ render
  // ẩn để html2canvas chụp từng phiếu, gộp thành 1 PDF cho cả group.
  const [pendingExport, setPendingExport] = useState(null);
  // Tên group (trường/HLV) đang xuất Excel bảng điểm — dùng để disable đúng nút đó
  const [exportingExcelGroup, setExportingExcelGroup] = useState(null);
  // Đang xuất PDF toàn bộ phiếu điểm trận đối kháng (mọi trận, mọi đội, mọi
  // nội dung đối kháng đang trong phạm vi báo cáo) + danh sách trận đang chờ
  // render ẩn để html2canvas chụp, gộp thành 1 PDF.
  const [exportingCombatPdf, setExportingCombatPdf] = useState(false);
  const [pendingCombatExport, setPendingCombatExport] = useState(null);

  const contentsForComp = useMemo(
    () => contents.filter((c) => !selectedComp || c.competition_id === selectedComp),
    [contents, selectedComp]
  );

  // content_format='scoring' (đo lường) đi qua /reports/scores như cũ. Nội
  // dung đối kháng (combat_stars/combat_drone) KHÔNG có row nào trong bảng
  // `scores` — phải tự lấy teams+combat_matches rồi tính bằng đúng luật riêng
  // của từng format (giống AdminScoreboard.jsx), không có route report riêng.
  const loadReport = async () => {
    if (!selectedComp) return;
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadReportRows({ compId: selectedComp, contentId: selectedContent, contents }));
    } catch (e) {
      setRowsError(e.message || 'Lỗi tải báo cáo.');
    } finally {
      setRowsLoading(false);
    }
  };

  // Gộp theo (đội × nội dung) rồi nhóm theo Trường/Trung tâm hoặc Huấn luyện
  // viên (tùy `groupBy`) — 1 đội có thể thi nhiều nội dung khác nhau trong
  // cùng cuộc thi nên không gộp theo đội đơn thuần (tránh trộn lẫn điểm 2
  // nội dung khác nhau vào 1 dòng).
  const groups = useMemo(() => {
    return groupReportRows(rows, groupBy);
  }, [rows, groupBy]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(groups, 10);

  const compName = competitions.find((c) => c.id === selectedComp)?.name || '';
  const contentName = contents.find((c) => c.id === selectedContent)?.name || 'Tất cả nội dung';

  // Xuất PDF CHI TIẾT (đầy đủ phiếu điểm từng đội, theo đúng mẫu Score Sheet)
  // cho toàn bộ đội thuộc 1 group (1 trường/trung tâm hoặc 1 HLV) — không phải
  // bảng tổng hợp điểm. CHỈ áp dụng đội thi nội dung đo lường (mẫu ScoreSheetTable
  // không dùng được cho đối kháng) — phiếu đối kháng đã có sẵn ở trang "Trận đối
  // kháng" (xuất theo từng trận, đúng mẫu Battle of Stars/Fly Smart Cup riêng).
  const handleExportGroupPdf = async (group) => {
    const measurementTeams = group.teams.filter((t) => t.format !== 'combat');
    if (measurementTeams.length === 0) {
      showAlert('Nhóm này chỉ có đội thi đối kháng — xuất phiếu đối kháng ở trang "Trận đối kháng".', 'error');
      return;
    }
    setExportingGroup(group.name);
    try {
      const tasksCache = new Map();
      const sheets = [];
      for (const t of measurementTeams) {
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

  // Xuất TOÀN BỘ bảng điểm của 1 group (1 trường/trung tâm) — mọi đội, mọi
  // nội dung đội đó đã thi trong phạm vi báo cáo đang xem, thành 1 file Excel
  // NHIỀU SHEET (1 sheet/nội dung, đúng thứ tự order_index) thay vì phải bấm
  // từng nút riêng theo từng nội dung như trước. Nội dung đo lường ra 1
  // dòng/thí sinh theo lượt 1/2 (mẫu REPORT_EXCEL_HEADER); nội dung đối kháng
  // ra 1 dòng/TRẬN cho mỗi đội (mẫu COMBAT_MATCH_EXCEL_HEADER) — 1 đội đấu
  // vòng tròn N trận sẽ có N dòng, không gộp thành 1 dòng tổng kết.
  const handleExportGroupExcel = async (group) => {
    setExportingExcelGroup(group.name);
    try {
      const compLocation = competitions.find((c) => c.id === selectedComp)?.location || '';
      const built = await buildGroupWorkbook({ rows, groupName: group.name, groupBy, contents, compLocation });
      if (!built) {
        showAlert('Nhóm này chưa có dữ liệu điểm để xuất.', 'error');
        return;
      }
      await downloadWorkbook(built.workbook, built.filename);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setExportingExcelGroup(null);
    }
  };

  // Xuất PDF toàn bộ phiếu điểm trận đối kháng đang trong phạm vi báo cáo
  // (mọi trận, mọi đội, cả 2 định dạng Battle of Stars/Fly Smart Cup nếu có) —
  // dùng đúng mẫu Score Sheet đã có sẵn ở trang "Trận đối kháng" (mục 767 ở
  // đó), chỉ khác là gộp theo phạm vi báo cáo (cuộc thi/nội dung đang chọn)
  // thay vì phải vào từng nội dung riêng.
  const handleExportCombatPdf = async () => {
    const listed = rows?.combatMatches || [];
    if (!listed.length) return;
    setExportingCombatPdf(true);
    try {
      // Dữ liệu báo cáo là danh sách trận đã lược ảnh chữ ký — in phiếu thì
      // lấy bản ĐẦY ĐỦ của từng nội dung đối kháng (chỉ lúc xuất PDF)
      const contentIds = [...new Set(listed.map((it) => it.content.id))];
      const fullLists = await Promise.all(contentIds.map((id) => api.getCombatMatches(id, { full: true })));
      const fullById = new Map(fullLists.flat().map((m) => [m.id, m]));
      const items = listed.map((it) => ({ ...it, match: fullById.get(it.match.id) || it.match }));
      setPendingCombatExport(items);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = items.map((it) => document.getElementById(`combat-report-export-${it.match.id}`));
      const slug = (contentName || 'doi-khang').replace(/\s+/g, '-').toLowerCase();
      await exportMultipleToPdf(nodes, `phieu-doi-khang-${slug}`);
    } finally {
      setPendingCombatExport(null);
      setExportingCombatPdf(false);
    }
  };

  if (loading) return <div className="nhutin-admin"><p style={{ padding: 24 }}>Đang tải...</p></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Báo cáo điểm</h1>
          <p className="page-subtitle">Chọn nội dung để xem theo từng trường/trung tâm hoặc huấn luyện viên, tải PDF chi tiết phiếu điểm ngay trong từng nhóm</p>
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
              <option value="school">Trường/Trung tâm</option>
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
            <h2 style={{ margin: 0, color: '#0f172a' }}>Báo cáo điểm — {compName}</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>
              {contentName} · Nhóm theo {groupBy === 'coach' ? 'huấn luyện viên' : 'trường/trung tâm'} · Xem lúc {new Date().toLocaleString('vi-VN')}
            </p>
            {rows.combatMatches?.length > 0 && (
              <button
                type="button"
                className="btn btn-primary no-print"
                style={{ marginTop: 12 }}
                onClick={handleExportCombatPdf}
                disabled={exportingCombatPdf}
              >
                {exportingCombatPdf ? 'Đang xuất...' : `Xuất PDF trận đối kháng (${rows.combatMatches.length} trận)`}
              </button>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>Chưa có dữ liệu điểm.</div>
          ) : pageItems.map((g) => (
            <div className="card report-group" key={g.name} style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">{g.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="page-subtitle">{g.teams.length} đội</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleExportGroupExcel(g)}
                    disabled={exportingExcelGroup === g.name}
                  >
                    {exportingExcelGroup === g.name ? 'Đang xuất...' : 'Xuất bảng điểm (Excel)'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleExportGroupPdf(g)}
                    disabled={exportingGroup === g.name}
                  >
                    {exportingGroup === g.name ? 'Đang xuất...' : 'Xuất phiếu điểm'}
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      <th>Nội dung</th>
                      <th style={{ width: 90 }}>Số lượt/trận</th>
                      <th style={{ width: 100 }}>Tổng điểm</th>
                      <th style={{ width: 140 }}>Kết quả (đối kháng)</th>
                      <th style={{ width: 120 }}>Tổng thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.teams.map((t) => (
                      <tr key={t.key}>
                        <td>{t.team_name}</td>
                        <td>{t.content_name}</td>
                        <td>{t.rounds}</td>
                        <td><strong>{t.total_score}</strong></td>
                        <td>{t.format === 'combat' ? `W${t.wins} D${t.draws} L${t.losses} · ${t.match_points} MP` : '-'}</td>
                        <td>{t.format === 'combat' ? '-' : (formatSecondsAsMinutes(String(t.total_time)) || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {groups.length > 0 && <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />}
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

      {/* Render ẩn từng phiếu điểm trận đối kháng để html2canvas chụp — mẫu
          khác nhau theo content_format (combat_stars/combat_drone), giống hệt
          renderSheet() ở trang "Trận đối kháng". */}
      {pendingCombatExport && (
        <div style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1 }}>
          {pendingCombatExport.map((it) => (
            <div key={it.match.id} id={`combat-report-export-${it.match.id}`}>
              {it.content.content_format === 'combat_stars'
                ? <CombatStarsSheetTable match={it.match} sheetRef={null} />
                : <CombatDroneSheetTable match={it.match} sheetRef={null} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
