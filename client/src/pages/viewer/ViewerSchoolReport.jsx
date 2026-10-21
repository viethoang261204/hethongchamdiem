import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAllLookup } from './useAllLookup';
import { normalizeText } from '../../lib/lookup';
import { buildChinaReport, pct } from '../../lib/chinaReport';
import { awardLabel, downloadSchoolReport, downloadSchoolReportsZip, goingLabel } from '../../lib/schoolReport';
import { fmtDate, validDob } from '../../lib/china';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

const goingStyle = (r) => (r.status !== 'none' ? { color: '#34d399', borderColor: 'rgba(52,211,153,.5)' } : { color: '#94a3b8' });

// Xem trước đúng các phần của file Excel báo cáo trường (lib/schoolReport.js)
function SchoolPreview({ school, onDownload, busy }) {
  const comps = [...new Map(school.rows.map((r) => [r.competition?.id, r.competition?.name])).values()].filter(Boolean);
  const going = school.rows.filter((r) => r.status !== 'none');
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{school.name}</h2>
          <div className="viewer-sub">{comps.join(' · ')}</div>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onDownload}>{busy ? 'Đang xuất...' : 'Tải báo cáo Excel'}</button>
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Tổng quan</h3>
      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{school.registered}</div><div className="rt-stat-label">Đội đăng ký</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{school.going}</div><div className="rt-stat-label">Được đi Trung Quốc</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{pct(school.going, school.registered)}</div><div className="rt-stat-label">Tỷ lệ được đi</div></div>
        <div className="rt-stat rt-stat-pending"><div className="rt-stat-value">{school.none}</div><div className="rt-stat-label">Không được đi</div></div>
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Chi tiết đội thi</h3>
      <div className="table-container">
        <table>
          <thead><tr><th>Đội</th><th>Giải đấu</th><th>Nội dung · Bảng</th><th>Kết quả</th><th>Giải thưởng</th><th>Đi Trung Quốc</th></tr></thead>
          <tbody>
            {school.rows.map((r) => (
              <tr key={r.team.id}>
                <td><strong>{r.team.name}</strong><div className="viewer-sub">{r.team.coach_name ? `HLV ${r.team.coach_name}` : ''}</div></td>
                <td className="viewer-sub">{r.competition?.name}</td>
                <td>{r.contentName}<div className="viewer-sub">{r.board}</div></td>
                <td className="viewer-nowrap">{r.result || '—'}{r.hostRank && <div className="viewer-sub">hạng {r.hostRank}</div>}</td>
                <td>{awardLabel(r) || <span className="viewer-sub">—</span>}</td>
                <td><span className="viewer-chip" style={goingStyle(r)}>{goingLabel(r)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Học sinh được đi Trung Quốc ({going.reduce((a, r) => a + r.team.students.length, 0)})</h3>
      <div className="table-container">
        <table>
          <thead><tr><th>Họ và tên</th><th>Ngày sinh</th><th>Đội</th><th>Giải thưởng</th></tr></thead>
          <tbody>
            {going.length === 0 ? (
              <tr><td colSpan={4} className="viewer-sub" style={{ textAlign: 'center', padding: 16 }}>Chưa có học sinh được đi.</td></tr>
            ) : going.flatMap((r) => r.team.students.map((st) => (
              <tr key={`${r.team.id}-${st.id}`}>
                <td>{st.full_name}</td>
                <td className="viewer-nowrap">{validDob(st.birth_date) ? fmtDate(st.birth_date) : <span className="viewer-missing">Chưa có</span>}</td>
                <td>{r.team.name}<div className="viewer-sub">{r.competition?.name} · {r.contentName} {r.board}</div></td>
                <td>{awardLabel(r) || <span className="viewer-sub">—</span>}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Báo cáo riêng từng trường / trung tâm: chọn trường → xem trước → tải file
// Excel theo mẫu (1 trường 1 file), hoặc tải tất cả trong 1 file .zip.
export default function ViewerSchoolReport() {
  const { lookup, error } = useAllLookup();
  const report = useMemo(() => buildChinaReport(lookup), [lookup]);
  const [params, setParams] = useSearchParams();
  const selectedKey = params.get('truong') || '';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');

  const schools = useMemo(() => {
    const n = normalizeText(q);
    return n ? report.bySchool.filter((x) => normalizeText(x.name).includes(n)) : report.bySchool;
  }, [report, q]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(schools, 20);
  const selected = report.bySchool.find((x) => x.key === selectedKey) || null;

  const download = async (school) => {
    setBusy(school.key);
    try { await downloadSchoolReport(school); } finally { setBusy(''); }
  };
  const downloadAll = async () => {
    setBusy('zip');
    try { await downloadSchoolReportsZip(schools, (i, n) => setProgress(`${i}/${n}`)); } finally { setBusy(''); setProgress(''); }
  };

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!lookup || !report.totals) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải dữ liệu các giải...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Báo cáo theo trường</h1>
        <p className="referee-page-subtitle">
          Mỗi trường / trung tâm 1 file Excel riêng theo mẫu: tổng quan (đội đăng ký, được đi Trung Quốc, tỷ lệ được đi), theo giải đấu,
          chi tiết từng đội và danh sách học sinh được đi Trung Quốc — gửi thẳng cho trường.
        </p>
      </div>

      {selected && <SchoolPreview school={selected} busy={busy === selected.key} onDownload={() => download(selected)} />}

      <div className="filters-bar viewer-filters">
        <div className="search-box"><input type="text" placeholder="Tìm trường / trung tâm..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button type="button" className="btn btn-secondary" disabled={!!busy || !schools.length} onClick={downloadAll}>
          {busy === 'zip' ? `Đang tạo .zip (${progress})...` : `Tải tất cả (${schools.length} file, .zip)`}
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Trường / Trung tâm</th><th className="viewer-num">Đội đăng ký</th><th className="viewer-num">Được đi</th>
                <th className="viewer-num">Tỷ lệ được đi</th><th className="viewer-num">Không được đi</th><th />
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không tìm thấy.</td></tr>
              ) : pageItems.map((x) => (
                <tr key={x.key} style={x.key === selectedKey ? { background: 'rgba(99,102,241,.12)' } : undefined}>
                  <td><strong>{x.name}</strong></td>
                  <td className="viewer-num">{x.registered}</td>
                  <td className="viewer-num">{x.going}</td>
                  <td className="viewer-num"><strong>{pct(x.going, x.registered)}</strong></td>
                  <td className="viewer-num">{x.none}</td>
                  <td className="viewer-nowrap" style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-secondary viewer-btn-sm" onClick={() => { setParams({ truong: x.key }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Xem</button>{' '}
                    <button type="button" className="btn btn-primary viewer-btn-sm" disabled={!!busy} onClick={() => download(x)}>{busy === x.key ? 'Đang xuất...' : 'Tải Excel'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
