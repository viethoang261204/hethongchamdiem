import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { downloadBlob, downloadWorkbook } from '../../lib/excelReport';
import { loadReportRows, groupReportRows, buildGroupWorkbook, buildScoreboardWorkbook } from '../../lib/scoreExports';
import './AdminLayout.css';

// "Lưu trữ bảng điểm" — sắp xếp file như thư mục Drive để tải về gửi riêng
// cho từng trường / HLV:
//   <Cuộc thi>/
//     Bảng điểm lọc theo HLV/     bao-cao-diem-<HLV>.xlsx
//     Bảng điểm lọc theo nhóm/    bao-cao-diem-<Trường/Trung tâm>.xlsx
//     Bảng xếp hạng tổng <cuộc thi>  (bang-xep-hang-<cuộc thi>.xlsx)
// Không lưu file nào trên server — mỗi lần tải là dựng lại từ dữ liệu điểm
// mới nhất, bằng ĐÚNG các hàm xuất Excel của trang Báo cáo / Bảng xếp hạng.
const FOLDERS = {
  hlv: { groupBy: 'coach', name: 'Bảng điểm lọc theo HLV', hint: 'Mỗi HLV 1 file' },
  nhom: { groupBy: 'school', name: 'Bảng điểm lọc theo nhóm', hint: 'Mỗi trường / trung tâm 1 file' },
};

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#5f6368" aria-hidden="true">
    <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
  </svg>
);
const XlsxIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="#1e7e45" />
    <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const rowStyle = { cursor: 'pointer' };
const nameCell = { display: 'flex', alignItems: 'center', gap: 12, fontWeight: 500 };

export default function AdminArchive() {
  const { showAlert } = useNotify();
  const [params, setParams] = useSearchParams();
  const compId = params.get('giai') || '';
  const folderKey = FOLDERS[params.get('thu-muc')] ? params.get('thu-muc') : '';
  const go = (giai, thuMuc) => {
    const next = {};
    if (giai) next.giai = giai;
    if (thuMuc) next['thu-muc'] = thuMuc;
    setParams(next);
  };

  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, contents] = await Promise.all([api.getCompetitions(), api.getAllContents()]);
    return { comps, contents };
  }, []);
  const comps = data?.comps || [];
  const contents = data?.contents || [];
  const comp = comps.find((c) => c.id === compId) || null;

  // Dữ liệu điểm của cuộc thi đang mở (dùng chung cho 2 thư mục) — tải 1 lần
  const [report, setReport] = useState({ compId: '', rows: null, error: '' });
  const reportReq = useRef('');
  const loadReport = (id) => {
    reportReq.current = id;
    setReport({ compId: id, rows: null, error: '' });
    return loadReportRows({ compId: id, contents })
      .then((rows) => { if (reportReq.current === id) setReport({ compId: id, rows, error: '' }); return rows; })
      .catch((e) => { if (reportReq.current === id) setReport({ compId: id, rows: null, error: e.message || 'Lỗi tải dữ liệu điểm.' }); throw e; });
  };
  useEffect(() => {
    // Rời giải → bỏ dữ liệu cũ, mở lại sẽ tải điểm mới nhất
    if (!comp && report.compId) { reportReq.current = ''; setReport({ compId: '', rows: null, error: '' }); }
    if (folderKey && comp && report.compId !== comp.id) loadReport(comp.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderKey, comp?.id, contents.length]);

  const folder = folderKey ? FOLDERS[folderKey] : null;
  const groups = useMemo(
    () => (folder && report.rows && report.compId === compId ? groupReportRows(report.rows, folder.groupBy) : []),
    [folder, report, compId]
  );
  const [q, setQ] = useState('');
  const shown = groups.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase()));

  const [busy, setBusy] = useState(''); // khoá đang tải (tên file / 'zip')
  const [progress, setProgress] = useState('');
  const compLocation = comp?.location || '';

  const fileOf = (g) => `bao-cao-diem-${g.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`;

  const downloadGroup = async (g) => {
    setBusy(g.name);
    try {
      const built = await buildGroupWorkbook({ rows: report.rows, groupName: g.name, groupBy: folder.groupBy, contents, compLocation });
      if (!built) { showAlert('Nhóm này chưa có dữ liệu điểm để xuất.', 'error'); return; }
      await downloadWorkbook(built.workbook, built.filename);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setBusy('');
    }
  };

  const downloadScoreboard = async () => {
    setBusy('scoreboard');
    try {
      const built = await buildScoreboardWorkbook({ compId: comp.id, compName: comp.name });
      if (!built) { showAlert('Chưa có dữ liệu bảng xếp hạng nào để xuất.', 'error'); return; }
      await downloadWorkbook(built.workbook, built.filename);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setBusy('');
    }
  };

  // Tải nhiều file gộp 1 .zip — `which`: 'hlv' | 'nhom' | 'all' (cả cuộc thi:
  // 2 thư mục + bảng xếp hạng tổng). Dựng tuần tự từng file để khỏi treo máy.
  const downloadZip = async (which) => {
    setBusy('zip');
    try {
      const rows = report.compId === comp.id && report.rows ? report.rows : await loadReport(comp.id);
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const keys = which === 'all' ? Object.keys(FOLDERS) : [which];
      const jobs = keys.flatMap((k) => groupReportRows(rows, FOLDERS[k].groupBy).map((g) => [k, g]));
      let done = 0;
      for (const [k, g] of jobs) {
        done += 1;
        setProgress(`${done}/${jobs.length}`);
        const built = await buildGroupWorkbook({ rows, groupName: g.name, groupBy: FOLDERS[k].groupBy, contents, compLocation });
        if (!built) continue;
        const dir = which === 'all' ? zip.folder(FOLDERS[k].name) : zip;
        dir.file(built.filename, await built.workbook.xlsx.writeBuffer());
      }
      if (which === 'all') {
        setProgress('bảng xếp hạng tổng');
        const sb = await buildScoreboardWorkbook({ compId: comp.id, compName: comp.name });
        if (sb) zip.file(sb.filename, await sb.workbook.xlsx.writeBuffer());
      }
      if (!Object.keys(zip.files).length) { showAlert('Chưa có dữ liệu điểm để xuất.', 'error'); return; }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${which === 'all' ? 'Bảng điểm' : FOLDERS[which].name} - ${comp.name}.zip`);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi tạo file .zip.', 'error');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  const zipLabel = (label) => (busy === 'zip' ? `Đang tạo .zip${progress ? ` (${progress})` : ''}...` : label);

  if (error) return <div className="nhutin-admin"><ErrorBox error={error} onRetry={reload} /></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lưu trữ bảng điểm</h1>
          <p className="page-subtitle">Tải bảng điểm theo từng HLV, từng trường / trung tâm và bảng xếp hạng tổng của mỗi giải để gửi riêng — file luôn lấy theo điểm mới nhất.</p>
        </div>
        {comp && (
          <div style={{ display: 'flex', gap: 8 }}>
            {folder ? (
              <button type="button" className="btn btn-primary" disabled={!!busy || !report.rows} onClick={() => downloadZip(folderKey)}>
                {zipLabel(`Tải cả thư mục (.zip, ${groups.length} file)`)}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => downloadZip('all')}>
                {zipLabel('Tải cả giải (.zip)')}
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="archive-crumbs" aria-label="Đường dẫn thư mục">
        <button type="button" onClick={() => go()} disabled={!comp}>Lưu trữ</button>
        {comp && <><span>›</span><button type="button" onClick={() => go(comp.id)} disabled={!folder}>{comp.name}</button></>}
        {comp && folder && <><span>›</span><strong>{folder.name}</strong></>}
      </nav>

      {folder && (
        <div className="filters-bar">
          <div className="search-box"><input type="text" placeholder={folder.groupBy === 'coach' ? 'Tìm tên HLV...' : 'Tìm tên trường / trung tâm...'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table className="archive-table">
            <thead>
              <tr><th>Tên</th><th style={{ width: 260 }}>Nội dung</th><th style={{ width: 160 }} /></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : !comp ? (
                comps.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có cuộc thi nào.</td></tr>
                ) : comps.map((c) => (
                  <tr key={c.id} style={rowStyle} onClick={() => go(c.id)}>
                    <td><div style={nameCell}><FolderIcon />Bảng điểm {c.name}</div></td>
                    <td style={{ color: '#64748b' }}>{contents.filter((x) => x.competition_id === c.id).length} nội dung thi</td>
                    <td />
                  </tr>
                ))
              ) : !folder ? (
                <>
                  {Object.entries(FOLDERS).map(([k, f]) => (
                    <tr key={k} style={rowStyle} onClick={() => go(comp.id, k)}>
                      <td><div style={nameCell}><FolderIcon />{f.name}</div></td>
                      <td style={{ color: '#64748b' }}>{f.hint}</td>
                      <td />
                    </tr>
                  ))}
                  <tr>
                    <td><div style={nameCell}><XlsxIcon />Bảng xếp hạng tổng {comp.name}</div></td>
                    <td style={{ color: '#64748b' }}>Mọi nội dung × bảng đấu, 1 sheet</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={downloadScoreboard}>
                        {busy === 'scoreboard' ? 'Đang xuất...' : 'Tải xuống'}
                      </button>
                    </td>
                  </tr>
                </>
              ) : report.error ? (
                <tr><td colSpan={3}><ErrorBox error={report.error} onRetry={() => loadReport(comp.id).catch(() => {})} /></td></tr>
              ) : !report.rows ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24 }}>Đang tổng hợp điểm của giải...</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#888' }}>{groups.length ? 'Không tìm thấy.' : 'Giải này chưa có dữ liệu điểm.'}</td></tr>
              ) : shown.map((g) => (
                <tr key={g.name}>
                  <td>
                    <div style={nameCell}><XlsxIcon />{fileOf(g)}</div>
                  </td>
                  <td style={{ color: '#64748b' }}>
                    {g.teams.length} đội · {new Set(g.teams.map((t) => t.content_name)).size} nội dung
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => downloadGroup(g)}>
                      {busy === g.name ? 'Đang xuất...' : 'Tải xuống'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
