import { useMemo, useState } from 'react';
import { useAllLookup } from './useAllLookup';
import { normalizeText } from '../../lib/lookup';
import { NO_SCHOOL, STATUS, buildChinaReport, exportChinaReportBySchool, exportChinaReportExcel, pct } from '../../lib/chinaReport';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

const STATUS_STYLE = {
  lan1: { color: '#fbbf24', borderColor: 'rgba(251,191,36,.5)' },
  lan2: { color: '#34d399', borderColor: 'rgba(52,211,153,.5)' },
  none: { color: '#94a3b8' },
};

function SummaryTable({ title, list, totals }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 12px' }}>{title}</h3>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{title.includes('nội dung') ? 'Nội dung' : 'Giải đấu'}</th>
              <th className="viewer-num">Đăng ký</th><th className="viewer-num">Đã thi</th>
              <th className="viewer-num">Đi lần 1</th><th className="viewer-num">Đi lần 2</th>
              <th className="viewer-num">Tổng được đi</th><th className="viewer-num">Tỷ lệ</th>
              <th className="viewer-num">Không giải</th><th className="viewer-num">HS được đi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.key}>
                <td><strong>{x.name}</strong></td>
                <td className="viewer-num">{x.registered}</td>
                <td className="viewer-num">{x.played}</td>
                <td className="viewer-num"><strong style={{ color: '#fbbf24' }}>{x.lan1}</strong><div className="viewer-sub">chính {x.major} · phụ {x.minor}</div></td>
                <td className="viewer-num"><strong style={{ color: '#34d399' }}>{x.lan2}</strong></td>
                <td className="viewer-num"><strong>{x.going}</strong></td>
                <td className="viewer-num">{pct(x.going, x.registered)}</td>
                <td className="viewer-num">{x.none}</td>
                <td className="viewer-num">{x.students}</td>
              </tr>
            ))}
            {totals && (
              <tr style={{ borderTop: '2px solid rgba(148,163,184,.3)' }}>
                <td><strong>Tổng cộng</strong></td>
                <td className="viewer-num"><strong>{totals.registered}</strong></td>
                <td className="viewer-num"><strong>{totals.played}</strong></td>
                <td className="viewer-num"><strong>{totals.lan1}</strong><div className="viewer-sub">chính {totals.major} · phụ {totals.minor}</div></td>
                <td className="viewer-num"><strong>{totals.lan2}</strong></td>
                <td className="viewer-num"><strong>{totals.going}</strong></td>
                <td className="viewer-num"><strong>{pct(totals.going, totals.registered)}</strong></td>
                <td className="viewer-num"><strong>{totals.none}</strong></td>
                <td className="viewer-num"><strong>{totals.students}</strong></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tổng hợp theo trường / trung tâm — có tìm kiếm + phân trang (≈150 đơn vị);
// bấm tên trường để lọc danh sách chi tiết bên dưới.
function SchoolTable({ schools, onPick }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = normalizeText(q);
    return n ? schools.filter((x) => normalizeText(x.name).includes(n)) : schools;
  }, [schools, q]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(list, 15);
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Theo trường / trung tâm ({schools.length})</h3>
        <div className="search-box" style={{ minWidth: 280 }}><input type="text" placeholder="Tìm trường / trung tâm..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Trường / Trung tâm</th><th className="viewer-num">Đăng ký</th><th className="viewer-num">Đi lần 1</th>
              <th className="viewer-num">Đi lần 2</th><th className="viewer-num">Tổng được đi</th><th className="viewer-num">Tỷ lệ được đi</th>
              <th className="viewer-num">Không giải</th><th className="viewer-num">HS được đi</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((x) => (
              <tr key={x.key}>
                <td><button type="button" className="viewer-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => onPick(x.key)}><strong>{x.name}</strong></button></td>
                <td className="viewer-num">{x.registered}</td>
                <td className="viewer-num"><strong style={{ color: '#fbbf24' }}>{x.lan1}</strong><div className="viewer-sub">chính {x.major} · phụ {x.minor}</div></td>
                <td className="viewer-num"><strong style={{ color: '#34d399' }}>{x.lan2}</strong></td>
                <td className="viewer-num"><strong>{x.going}</strong></td>
                <td className="viewer-num"><strong>{pct(x.going, x.registered)}</strong></td>
                <td className="viewer-num">{x.none}</td>
                <td className="viewer-num">{x.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
    </div>
  );
}

// Báo cáo số đội được đi Trung Quốc so với số đội đăng ký — chi tiết từng
// đội: đi lần 1 (có giải), đi lần 2 (xét điểm lần 2) hay không giải.
export default function ViewerChinaReport() {
  const { lookup, error } = useAllLookup();
  const report = useMemo(() => buildChinaReport(lookup), [lookup]);
  const [f, setF] = useState({ q: '', giai: '', nhom: '', truong: '', trangThai: '' });
  const [exporting, setExporting] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const filtered = useMemo(() => {
    const q = normalizeText(f.q);
    return report.rows.filter((r) => {
      if (f.giai && r.competition?.id !== f.giai) return false;
      if (f.nhom && r.contentKey !== f.nhom) return false;
      if (f.truong && (r.team.school_name || NO_SCHOOL) !== f.truong) return false;
      if (f.trangThai === 'chinh' && r.tier !== 'chinh') return false;
      if (f.trangThai === 'phu' && r.tier !== 'phu') return false;
      if (['lan1', 'lan2', 'none'].includes(f.trangThai) && r.status !== f.trangThai) return false;
      if (f.trangThai === 'di' && r.status === 'none') return false;
      if (!q) return true;
      return [r.team.name, r.team.school_name, r.team.coach_name, ...r.team.students.map((s) => s.full_name)]
        .some((v) => normalizeText(v).includes(q));
    });
  }, [report, f]);
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 30);

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!lookup || !report.totals) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải dữ liệu các giải...</p>;
  const t = report.totals;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Báo cáo đi Trung Quốc</h1>
        <p className="referee-page-subtitle">
          Số đội được đi Trung Quốc so với số đội đăng ký ở mọi giải. <strong>Đi lần 1</strong>: đội có giải thưởng chính thức
          (giải chính: Nhất / Nhì / Ba; giải phụ: Rising Star, Top 5 / Top 10...). <strong>Đi lần 2</strong>: đội được chọn ở màn
          Xét điểm lần 2. Còn lại là <strong>không giải</strong>.
        </p>
      </div>

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{t.registered}</div><div className="rt-stat-label">Đội đăng ký</div></div>
        <div className="rt-stat"><div className="rt-stat-value" style={{ color: '#fbbf24' }}>{t.lan1}</div><div className="rt-stat-label">Đi lần 1 (giải chính {t.major} · giải phụ {t.minor})</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{t.lan2}</div><div className="rt-stat-label">Đi lần 2 (xét điểm lần 2)</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{t.going}</div><div className="rt-stat-label">Tổng được đi — {pct(t.going, t.registered)} số đội đăng ký</div></div>
        <div className="rt-stat rt-stat-pending"><div className="rt-stat-value">{t.none}</div><div className="rt-stat-label">Không giải</div></div>
      </div>

      <SummaryTable title="Theo giải đấu" list={report.byComp} totals={t} />
      <SummaryTable title="Theo nội dung thi (gộp các giải)" list={report.byContent} />
      <SchoolTable schools={report.bySchool} onPick={(name) => { set('truong', name); setTimeout(() => document.getElementById('china-report-detail')?.scrollIntoView({ behavior: 'smooth' }), 0); }} />

      <div className="filters-bar viewer-filters" id="china-report-detail">
        <div className="search-box"><input type="text" placeholder="Tên đội, học sinh, trường, HLV..." value={f.q} onChange={(e) => set('q', e.target.value)} /></div>
        <select className="filter-select" value={f.giai} onChange={(e) => set('giai', e.target.value)}>
          <option value="">Tất cả giải</option>
          {report.byComp.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={f.nhom} onChange={(e) => set('nhom', e.target.value)}>
          <option value="">Tất cả nội dung</option>
          {report.byContent.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={f.truong} onChange={(e) => set('truong', e.target.value)}>
          <option value="">Tất cả trường / trung tâm</option>
          {report.bySchool.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
        </select>
        <select className="filter-select" value={f.trangThai} onChange={(e) => set('trangThai', e.target.value)}>
          <option value="">Mọi trạng thái</option>
          <option value="di">Được đi (lần 1 + lần 2)</option>
          <option value="lan1">Đi lần 1</option>
          <option value="chinh">— Đi lần 1: giải chính</option>
          <option value="phu">— Đi lần 1: giải phụ</option>
          <option value="lan2">Đi lần 2</option>
          <option value="none">Không giải</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={!!exporting}
          onClick={async () => { setExporting('giai'); try { await exportChinaReportExcel(report); } finally { setExporting(''); } }}>
          {exporting === 'giai' ? 'Đang xuất...' : 'Xuất Excel theo giải'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={!!exporting}
          onClick={async () => {
            setExporting('truong');
            try { await exportChinaReportBySchool(f.truong ? report.bySchool.filter((x) => x.key === f.truong) : report.bySchool); } finally { setExporting(''); }
          }}>
          {exporting === 'truong' ? 'Đang xuất...' : f.truong ? 'Xuất Excel trường này' : 'Xuất Excel theo trường'}
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Trạng thái</th><th style={{ minWidth: 190 }}>Đội</th><th>Giải đấu</th><th>Nội dung · Bảng</th><th>Kết quả</th><th>Giải thưởng / ghi chú</th></tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có đội nào.</td></tr>
              ) : pageItems.map((r) => (
                <tr key={r.team.id}>
                  <td><span className="viewer-chip" style={STATUS_STYLE[r.status]}>{STATUS[r.status].label}</span></td>
                  <td>
                    <strong>{r.team.name}</strong>
                    <div className="viewer-sub">{[r.team.school_name, r.team.coach_name && `HLV ${r.team.coach_name}`].filter(Boolean).join(' · ')}</div>
                    <div className="viewer-sub">{r.team.students.map((s) => s.full_name).join(', ')}</div>
                  </td>
                  <td className="viewer-sub">{r.competition?.name}</td>
                  <td>{r.contentName}<div className="viewer-sub">{r.board}</div></td>
                  <td className="viewer-nowrap">{r.result || <span className="viewer-sub">—</span>}{r.hostRank && <div className="viewer-sub">hạng {r.hostRank} tại host</div>}</td>
                  <td>
                    {r.status === 'lan1'
                      ? <div className="viewer-chips">{r.team.awards.map((a) => <span key={a.label} className={`viewer-chip ${a.tier === 'major' ? 'viewer-chip-gold' : ''}`}>{a.label}</span>)}</div>
                      : r.status === 'lan2' ? <strong style={{ color: '#34d399' }}>Xét điểm lần 2</strong> : null}
                    {r.note && <div className="viewer-sub">{r.note}</div>}
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
