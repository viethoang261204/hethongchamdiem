import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { formatSecondsAsMinutes } from '../../lib/time';
import { exportMultipleToPdf } from '../referee/exportPdf';
import ScoreSheetTable from '../shared/ScoreSheetTable';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';
import { computeGroupStandings } from '../../lib/battleScoring';
import { computeGroupStandings as computeDroneStandings } from '../../lib/flySmartCupScoring';
import './AdminLayout.css';

// Cột file Excel "Báo cáo điểm" — khớp đúng tên/thứ tự cột theo file mẫu do
// người dùng cung cấp (kể cả 2 cột trùng tên "Tên đội thi" ở vị trí 3 và 5 —
// giữ nguyên tiêu đề gốc của mẫu, không tự "sửa" vì hệ thống nhận file này
// có thể đang đọc theo đúng VỊ TRÍ cột chứ không theo tên). Cột 3 trong mẫu
// gốc là ngày sinh thí sinh — hệ thống đã bỏ trường ngày sinh nên để trống.
const REPORT_EXCEL_HEADER = [
  'Stt', 'Tên trường/ tổ chức', 'Tên đội thi', 'Tổ chức/ Trường', 'Tên đội thi',
  'Bảng đấu', 'Huấn luyện viên', 'Địa điểm đăng ký dự thi', 'Sa bàn',
  'Điểm lần 1', 'Thời gian lần 1', 'Điểm lần 2', 'Thời gian lần 2',
  'Tổng điểm', 'Tổng thời gian',
];

// Mẫu Excel riêng cho 2 nội dung đối kháng — không có sẵn mẫu tham chiếu
// (khác với REPORT_EXCEL_HEADER là mẫu người dùng cung cấp), tự thiết kế dựa
// trên đúng dữ liệu bảng xếp hạng đã tính sẵn (computeGroupStandings/
// computeDroneStandings — Match Points 3/1/0, Total Score) — không thêm cột
// "Xếp hạng" vì standings ở đây tính theo TOÀN BỘ đội của content (không
// tách riêng từng bảng vòng tròn), nên xếp hạng theo cách này sẽ sai lệch
// nếu 1 nội dung có nhiều bảng — giữ đúng những số liệu đã được tin dùng
// trên màn hình báo cáo (không phát sinh số liệu mới có thể gây hiểu nhầm.
const COMBAT_EXCEL_HEADER = [
  'Stt', 'Tên đội thi', 'Trường/Trung tâm', 'Bảng đấu', 'Huấn luyện viên',
  'Sân', 'Bảng vòng tròn', 'Số trận', 'Thắng', 'Hòa', 'Thua', 'Match Points', 'Tổng điểm',
];

const COMBAT_FORMATS = ['combat_stars', 'combat_drone'];
const COMBAT_FORMAT_LABEL = { combat_stars: 'Battle of Stars', combat_drone: 'Fly Smart Cup' };

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
  const [rows, setRows] = useState(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState(null);
  // Tên group (trường/HLV) đang xuất PDF chi tiết — dùng để disable đúng nút đó
  const [exportingGroup, setExportingGroup] = useState(null);
  // Danh sách phiếu điểm chi tiết (đã fetch đủ scores + tasks) đang chờ render
  // ẩn để html2canvas chụp từng phiếu, gộp thành 1 PDF cho cả group.
  const [pendingExport, setPendingExport] = useState(null);
  // Tên group (trường/HLV) đang xuất Excel riêng — dùng để disable đúng nút đó
  const [exportingExcelGroup, setExportingExcelGroup] = useState(null);
  // key `${group.name}:${content_format}` đang xuất Excel đối kháng riêng
  const [exportingCombatExcelKey, setExportingCombatExcelKey] = useState(null);
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
      const scopedCombatContents = (selectedContent ? contents.filter((c) => c.id === selectedContent) : contentsForComp)
        .filter((c) => COMBAT_FORMATS.includes(c.content_format));
      const [measurement, combatPerContent] = await Promise.all([
        api.getReportScores({ competitionId: selectedComp, contentId: selectedContent || undefined }),
        Promise.all(scopedCombatContents.map(async (c) => {
          const [teams, matches] = await Promise.all([api.getTeams(c.id), api.getCombatMatches(c.id)]);
          const standings = c.content_format === 'combat_stars'
            ? computeGroupStandings(teams, matches)
            : computeDroneStandings(teams, matches);
          const standingsRows = standings.map((s) => ({
            team_id: s.teamId, team_name: s.teamName,
            school: teams.find((t) => t.id === s.teamId)?.schools?.name || 'Chưa có trường',
            content_name: c.name, contest_content_id: c.id, content_format: c.content_format,
            played: s.played, wins: s.wins, draws: s.draws, losses: s.losses,
            match_points: s.matchPoints, total_score: s.totalScore,
          }));
          return { content: c, matches, standingsRows };
        })),
      ]);
      setRows({
        measurement,
        combat: combatPerContent.flatMap((c) => c.standingsRows),
        combatMatches: combatPerContent.flatMap((c) => c.matches.map((m) => ({ match: m, content: c.content }))),
      });
    } catch (e) {
      setRowsError(e.message || 'Lỗi tải báo cáo.');
    } finally {
      setRowsLoading(false);
    }
  };

  // Gộp theo (đội × nội dung) rồi nhóm theo trường/trung tâm — 1 đội có thể
  // thi nhiều nội dung khác nhau trong cùng cuộc thi nên không gộp theo đội
  // đơn thuần (tránh trộn lẫn điểm 2 nội dung khác nhau vào 1 dòng).
  const groups = useMemo(() => {
    if (!rows) return [];
    const byTeam = new Map();
    for (const r of rows.measurement || []) {
      const key = `${r.team_id}|${r.contest_content_id}`;
      if (!byTeam.has(key)) {
        byTeam.set(key, {
          key, team_id: r.team_id, team_name: r.team_name,
          school: r.schools?.name || 'Chưa có trường',
          content_name: r.content_name, contest_content_id: r.contest_content_id,
          format: 'measurement', total_score: 0, total_time: 0, rounds: 0,
        });
      }
      const t = byTeam.get(key);
      t.total_score += Number(r.score) || 0;
      t.total_time += Number(r.time) || 0;
      t.rounds += 1;
    }
    for (const r of rows.combat || []) {
      const key = `${r.team_id}|${r.contest_content_id}`;
      byTeam.set(key, {
        key, team_id: r.team_id, team_name: r.team_name, school: r.school,
        content_name: r.content_name, contest_content_id: r.contest_content_id,
        format: 'combat', content_format: r.content_format, total_score: r.total_score, total_time: null, rounds: r.played,
        wins: r.wins, draws: r.draws, losses: r.losses, match_points: r.match_points,
      });
    }
    const teams = Array.from(byTeam.values());
    const byGroup = new Map();
    for (const t of teams) {
      const g = t.school;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(t);
    }
    return Array.from(byGroup.entries())
      .map(([name, teamsList]) => ({
        name,
        teams: teamsList.sort((a, b) => b.total_score - a.total_score),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

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

  // Xuất Excel RIÊNG cho 1 group (1 trường/trung tâm) — đội thi đo lường (có
  // lượt 1/lượt 2) của group đó, đúng theo mẫu Excel đã cung cấp (1 dòng/thí
  // sinh, STT theo từng ĐỘI). Không áp dụng đội đối kháng (không có khái
  // niệm lượt 1/2 kiểu này) — cùng phạm vi với nút "Xuất phiếu điểm" cạnh nó.
  const handleExportExcel = async (group) => {
    const measurementTeams = group.teams.filter((t) => t.format !== 'combat');
    if (measurementTeams.length === 0) {
      showAlert('Nhóm này chỉ có đội thi đối kháng — không có lượt 1/lượt 2 để xuất Excel.', 'error');
      return;
    }
    setExportingExcelGroup(group.name);
    try {
      const contentIds = [...new Set(measurementTeams.map((t) => t.contest_content_id).filter(Boolean))];
      const teamIdsInGroup = new Set(measurementTeams.map((t) => t.team_id));
      const [students, teamsArrays] = await Promise.all([
        api.getStudents(),
        Promise.all(contentIds.map((cid) => api.getTeams(cid))),
      ]);
      const teamsById = new Map(teamsArrays.flat().map((t) => [t.id, t]));
      const compLocation = competitions.find((c) => c.id === selectedComp)?.location || '';

      const scoresByTeam = new Map();
      for (const r of rows.measurement || []) {
        if (!teamIdsInGroup.has(r.team_id)) continue;
        if (!scoresByTeam.has(r.team_id)) scoresByTeam.set(r.team_id, {});
        scoresByTeam.get(r.team_id)[r.round] = r;
      }

      const teamsSorted = Array.from(scoresByTeam.keys())
        .map((id) => teamsById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      const aoa = [REPORT_EXCEL_HEADER];
      let stt = 0;
      for (const team of teamsSorted) {
        stt++;
        const rs = scoresByTeam.get(team.id) || {};
        const r1 = rs[1], r2 = rs[2];
        const totalScore = (Number(r1?.score) || 0) + (Number(r2?.score) || 0);
        const totalTime = (Number(r1?.time) || 0) + (Number(r2?.time) || 0);
        const members = (team.student_ids || []).map((id) => students.find((s) => s.id === id)).filter(Boolean);
        const displayMembers = members.length ? members : [null];
        displayMembers.forEach((mem, idx) => {
          aoa.push([
            idx === 0 ? stt : '',
            mem?.full_name || '',
            '',
            team.schools?.name || '',
            team.name,
            team.boards?.name || '',
            team.coaches?.name || '',
            compLocation,
            (team.fields || []).map((f) => f.name).join(', '),
            r1?.score ?? '', r1?.time ?? '',
            r2?.score ?? '', r2?.time ?? '',
            totalScore, totalTime,
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = REPORT_EXCEL_HEADER.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo điểm');
      const slug = group.name.replace(/\s+/g, '-').toLowerCase();
      XLSX.writeFile(wb, `bao-cao-diem-${slug}.xlsx`);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setExportingExcelGroup(null);
    }
  };

  // Xuất Excel RIÊNG cho 1 group (1 trường/trung tâm) × 1 nội dung đối kháng
  // cụ thể (Battle of Stars HOẶC Fly Smart Cup — 2 luật tính điểm khác nhau
  // nên KHÔNG gộp chung 1 mẫu như measurement). Dùng đúng số liệu standings
  // đã tính sẵn ở rows.combat (computeGroupStandings/computeDroneStandings).
  const handleExportCombatExcel = async (group, contentFormat) => {
    const teamsForFormat = group.teams.filter((t) => t.format === 'combat' && t.content_format === contentFormat);
    if (teamsForFormat.length === 0) return;
    const key = `${group.name}:${contentFormat}`;
    setExportingCombatExcelKey(key);
    try {
      const contentIds = [...new Set(teamsForFormat.map((t) => t.contest_content_id))];
      const teamsArrays = await Promise.all(contentIds.map((cid) => api.getTeams(cid)));
      const teamsById = new Map(teamsArrays.flat().map((t) => [t.id, t]));

      const sorted = teamsForFormat.slice().sort((a, b) =>
        (teamsById.get(a.team_id)?.combat_group || '').localeCompare(teamsById.get(b.team_id)?.combat_group || '') ||
        a.team_name.localeCompare(b.team_name)
      );

      const aoa = [COMBAT_EXCEL_HEADER];
      sorted.forEach((t, idx) => {
        const team = teamsById.get(t.team_id);
        aoa.push([
          idx + 1, t.team_name, t.school, team?.boards?.name || '', team?.coaches?.name || '',
          (team?.fields || []).map((f) => f.name).join(', '),
          team?.combat_group || '',
          t.rounds, t.wins, t.draws, t.losses, t.match_points, t.total_score,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = COMBAT_EXCEL_HEADER.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      const formatLabel = COMBAT_FORMAT_LABEL[contentFormat];
      XLSX.utils.book_append_sheet(wb, ws, formatLabel);
      const slug = `${group.name}-${formatLabel}`.replace(/\s+/g, '-').toLowerCase();
      XLSX.writeFile(wb, `bao-cao-${slug}.xlsx`);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setExportingCombatExcelKey(null);
    }
  };

  // Xuất PDF toàn bộ phiếu điểm trận đối kháng đang trong phạm vi báo cáo
  // (mọi trận, mọi đội, cả 2 định dạng Battle of Stars/Fly Smart Cup nếu có) —
  // dùng đúng mẫu Score Sheet đã có sẵn ở trang "Trận đối kháng" (mục 767 ở
  // đó), chỉ khác là gộp theo phạm vi báo cáo (cuộc thi/nội dung đang chọn)
  // thay vì phải vào từng nội dung riêng.
  const handleExportCombatPdf = async () => {
    const items = rows?.combatMatches || [];
    if (!items.length) return;
    setExportingCombatPdf(true);
    try {
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
          <p className="page-subtitle">Chọn nội dung để xem theo từng trường/trung tâm, tải PDF chi tiết phiếu điểm ngay trong từng nhóm</p>
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
              {contentName} · Nhóm theo trung tâm · Xem lúc {new Date().toLocaleString('vi-VN')}
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
          ) : groups.map((g) => (
            <div className="card report-group" key={g.name} style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">{g.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="page-subtitle">{g.teams.length} đội</span>
                  {g.teams.some((t) => t.format !== 'combat') && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleExportExcel(g)}
                      disabled={exportingExcelGroup === g.name}
                    >
                      {exportingExcelGroup === g.name ? 'Đang xuất...' : 'Xuất Excel (đo lường)'}
                    </button>
                  )}
                  {COMBAT_FORMATS.filter((fmt) => g.teams.some((t) => t.content_format === fmt)).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleExportCombatExcel(g, fmt)}
                      disabled={exportingCombatExcelKey === `${g.name}:${fmt}`}
                    >
                      {exportingCombatExcelKey === `${g.name}:${fmt}` ? 'Đang xuất...' : `Xuất Excel (${COMBAT_FORMAT_LABEL[fmt]})`}
                    </button>
                  ))}
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
