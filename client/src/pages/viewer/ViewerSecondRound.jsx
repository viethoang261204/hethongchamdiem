import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useLookupData } from './ViewerLayout';
import { buildLookup, normalizeText } from '../../lib/lookup';
import { buildSecondRound, exportSecondRoundExcel } from '../../lib/secondRound';
import { fmtDate, validDob } from '../../lib/china';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

const Missing = () => <span className="viewer-missing">Chưa có</span>;
const roundCell = (t, n) => (t.rounds[n] ? `${t.rounds[n].score} đ · ${t.rounds[n].time}s` : '—');

// Xét điểm lần 2: BXH tổng các host thi trực tiếp (không tính Online) theo
// nội dung × bảng, lấy 10% đội không có giải — xem lib/secondRound.js.
// Luôn cần dữ liệu TẤT CẢ các giải: dùng lại dữ liệu của layout nếu đang ở
// chế độ tổng thể, không thì tự tải riêng.
export default function ViewerSecondRound() {
  const { lookup: layoutLookup } = useLookupData();
  const [ownRaw, setOwnRaw] = useState(null);
  const [error, setError] = useState('');
  const needOwn = layoutLookup && !layoutLookup.all;
  useEffect(() => {
    if (!needOwn || ownRaw) return;
    api.getLookup('all').then(setOwnRaw).catch((e) => setError(e.message || 'Không tải được dữ liệu.'));
  }, [needOwn, ownRaw]);
  const ownLookup = useMemo(() => buildLookup(ownRaw), [ownRaw]);
  const lookup = layoutLookup?.all ? layoutLookup : ownLookup;

  const data = useMemo(() => buildSecondRound(lookup), [lookup]);
  const [view, setView] = useState('xet');
  const [nhom, setNhom] = useState('');
  const [bang, setBang] = useState('');
  const [q, setQ] = useState('');
  const [section, setSection] = useState('');
  const [exporting, setExporting] = useState(false);

  const contents = useMemo(() => [...new Map(data.sections.map((s) => [s.contentKey, s.contentName])).entries()], [data]);
  const boards = useMemo(() => [...new Set(data.sections.map((s) => s.board))].sort(), [data]);
  const sections = useMemo(
    () => data.sections.filter((s) => (!nhom || s.contentKey === nhom) && (!bang || s.board === bang)),
    [data, nhom, bang]
  );
  const qn = normalizeText(q);
  const matchTeam = (t) => !qn || [t.name, t.school_name, t.coach_name, t.competition?.name, ...t.students.map((s) => s.full_name)]
    .some((v) => normalizeText(v).includes(qn));
  const picked = useMemo(
    () => sections.flatMap((s) => s.selected.map((r) => ({ s, r }))).filter(({ r }) => matchTeam(r.team)),
    [sections, qn] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const current = data.sections.find((s) => s.key === section) || null;
  const rankRows = useMemo(() => (current ? current.rows.filter((r) => matchTeam(r.team)) : []), [current, qn]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = view === 'xet' ? picked : view === 'bxh' ? rankRows : sections;
  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(list, view === 'tonghop' ? 50 : 20);

  const totals = useMemo(() => ({
    sections: sections.length,
    scored: sections.reduce((a, s) => a + s.scoredTeams, 0),
    noAward: sections.reduce((a, s) => a + s.noAwardTeams, 0),
    selected: sections.reduce((a, s) => a + s.selected.length, 0),
  }), [sections]);

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!lookup) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải dữ liệu các giải...</p>;

  const openSection = (key) => { setSection(key); setView('bxh'); setQ(''); };

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Xét điểm lần 2</h1>
        <p className="referee-page-subtitle">
          BXH tổng gộp {data.hosts.map((h) => h.name).join(', ')} (không tính Online) theo nội dung × bảng đấu.
          Mỗi BXH lấy 10% số đội <strong>không có giải</strong> (làm tròn lên) có điểm cao nhất — đội đã có giải ở host khác
          (trùng tên đội, hoặc có học sinh trùng họ tên + ngày sinh) coi như đã có giải. Host gộp bảng khi trao giải thì đội
          của bảng gộp xếp vào bảng cao nhất của nhóm (vd Đà Nẵng: B+C → C, D+E → E). Không xét Battle of Stars và Fly Smart Cup
          vì 2 nội dung này đấu vòng tròn trong từng host, không xếp chung được.
        </p>
      </div>

      {data.hostsWithoutAwards.length > 0 && (
        <div className="card" style={{ padding: 14, color: '#fbbf24', marginBottom: 16 }}>
          Chưa có dữ liệu giải thưởng của: {data.hostsWithoutAwards.map((h) => h.name).join(', ')} — mọi đội ở đó đang bị tính là "không có giải".
        </div>
      )}

      <div className="rt-stats">
        <div className="rt-stat"><div className="rt-stat-value">{totals.sections}</div><div className="rt-stat-label">BXH (nội dung × bảng)</div></div>
        <div className="rt-stat"><div className="rt-stat-value">{totals.scored}</div><div className="rt-stat-label">Đội có điểm</div></div>
        <div className="rt-stat rt-stat-pending"><div className="rt-stat-value">{totals.noAward}</div><div className="rt-stat-label">Đội không có giải</div></div>
        <div className="rt-stat rt-stat-done"><div className="rt-stat-value">{totals.selected}</div><div className="rt-stat-label">Đội được xét lần 2</div></div>
      </div>

      <div className="filters-bar viewer-filters">
        <select className="filter-select" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="xet">Đội được xét lần 2</option>
          <option value="tonghop">Tổng hợp theo BXH</option>
          <option value="bxh">BXH tổng chi tiết</option>
        </select>
        {view === 'bxh' ? (
          <select className="filter-select" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">— Chọn nội dung × bảng —</option>
            {data.sections.map((s) => <option key={s.key} value={s.key}>{s.contentName} · {s.board}</option>)}
          </select>
        ) : (
          <>
            <select className="filter-select" value={nhom} onChange={(e) => setNhom(e.target.value)}>
              <option value="">Tất cả nội dung</option>
              {contents.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
            <select className="filter-select" value={bang} onChange={(e) => setBang(e.target.value)}>
              <option value="">Tất cả bảng</option>
              {boards.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </>
        )}
        {view !== 'tonghop' && (
          <div className="search-box"><input type="text" placeholder="Tên đội, học sinh, trường, HLV, host..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        )}
        <button type="button" className="btn btn-secondary" disabled={!totals.selected || exporting}
          onClick={async () => { setExporting(true); try { await exportSecondRoundExcel(sections); } finally { setExporting(false); } }}>
          {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          {view === 'xet' && (
            <table className="viewer-china-table">
              <thead>
                <tr><th style={{ minWidth: 170 }}>Nội dung · Bảng</th><th className="viewer-num">Hạng tổng</th><th style={{ minWidth: 190 }}>Đội</th><th className="viewer-num">Điểm</th><th style={{ minWidth: 160 }}>Học sinh</th><th>Ngày sinh</th><th>SĐT</th><th>Email</th></tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có đội nào.</td></tr>
                ) : pageItems.map(({ s, r }) => {
                  const t = r.team;
                  const list2 = t.students.length ? t.students : [null];
                  return list2.map((st, i) => (
                    <tr key={`${t.id}-${st?.id || i}`} className={i === 0 ? 'viewer-team-first' : ''}>
                      {i === 0 && (
                        <>
                          <td rowSpan={list2.length}>
                            <button type="button" className="viewer-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => openSection(s.key)}>
                              <strong>{s.contentName}</strong>
                            </button>
                            <div className="viewer-sub">{s.board} · xét {r.selectedOrder}/{s.selected.length}</div>
                          </td>
                          <td rowSpan={list2.length} className="viewer-num"><strong>{r.overallRank}</strong><div className="viewer-sub">/ {s.scoredTeams}</div></td>
                          <td rowSpan={list2.length}>
                            <strong>{t.name}</strong>
                            <div className="viewer-sub">{t.competition?.name}{t.rank ? ` · hạng ${t.rank} tại host` : ''}</div>
                            <div className="viewer-sub">{[t.school_name, t.coach_name && `HLV ${t.coach_name}`].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td rowSpan={list2.length} className="viewer-num viewer-nowrap"><strong>{t.total.total_score}</strong><div className="viewer-sub">{t.total.total_time}s</div></td>
                        </>
                      )}
                      {st ? (
                        <>
                          <td>{st.full_name}</td>
                          <td className="viewer-nowrap">{validDob(st.birth_date) ? fmtDate(st.birth_date) : <Missing />}</td>
                          <td className="viewer-nowrap">{st.phone || <Missing />}{st.phone && st.phone_source && <div className="viewer-sub">{st.phone_source}</div>}</td>
                          <td>{st.email || <Missing />}{st.email && st.email_source && <div className="viewer-sub">{st.email_source}</div>}</td>
                        </>
                      ) : <td colSpan={4} className="viewer-sub">Đội chưa có học sinh trong hệ thống</td>}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}

          {view === 'tonghop' && (
            <table>
              <thead>
                <tr><th>Nội dung</th><th>Bảng</th><th>Host</th><th className="viewer-num">Đội có điểm</th><th className="viewer-num">Có giải</th><th className="viewer-num">Có giải ở host khác</th><th className="viewer-num">Không giải</th><th className="viewer-num">Suất 10%</th><th className="viewer-num">Được xét</th><th /></tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có dữ liệu.</td></tr>
                ) : pageItems.map((s) => (
                  <tr key={s.key}>
                    <td><strong>{s.contentName}</strong></td>
                    <td>{s.board}</td>
                    <td className="viewer-sub">{s.hosts.join(', ')}</td>
                    <td className="viewer-num">{s.scoredTeams}{s.unscored ? <div className="viewer-sub">+{s.unscored} chưa có điểm</div> : null}</td>
                    <td className="viewer-num">{s.awardTeams}</td>
                    <td className="viewer-num">{s.awardElsewhereTeams || 0}</td>
                    <td className="viewer-num">{s.noAwardTeams}</td>
                    <td className="viewer-num">{s.quota}</td>
                    <td className="viewer-num"><strong style={{ color: '#34d399' }}>{s.selected.length}</strong>{s.tieExtra > 0 && <div className="viewer-sub">+{s.tieExtra} bằng điểm</div>}</td>
                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openSection(s.key)}>Xem BXH</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === 'bxh' && (
            !current ? (
              <p style={{ padding: 24, color: '#94a3b8', textAlign: 'center' }}>Chọn nội dung × bảng để xem BXH tổng.</p>
            ) : (
              <table>
                <thead>
                  <tr><th className="viewer-num">Hạng tổng</th><th>Đội</th><th>Host</th><th>Lượt 1</th><th>Lượt 2</th><th className="viewer-num">Tổng điểm</th><th className="viewer-num">Thời gian</th><th>Giải thưởng</th><th>Xét lần 2</th></tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không có đội nào.</td></tr>
                  ) : pageItems.map((r) => (
                    <tr key={r.team.id} style={r.selected ? { background: 'rgba(52, 211, 153, 0.08)' } : undefined}>
                      <td className="viewer-num"><strong>{r.overallRank}</strong></td>
                      <td><strong>{r.team.name}</strong><div className="viewer-sub">{[r.team.school_name, r.team.coach_name && `HLV ${r.team.coach_name}`].filter(Boolean).join(' · ')}</div>{r.fromBoard && <div className="viewer-sub">thi {r.fromBoard} (host gộp bảng)</div>}</td>
                      <td className="viewer-sub">{r.team.competition?.name}{r.team.rank ? <div>hạng {r.team.rank} tại host</div> : null}</td>
                      <td className="viewer-nowrap">{roundCell(r.team, 1)}</td>
                      <td className="viewer-nowrap">{roundCell(r.team, 2)}</td>
                      <td className="viewer-num"><strong>{r.team.total.total_score}</strong></td>
                      <td className="viewer-num">{r.team.total.total_time}s</td>
                      <td>
                        {r.team.awards.length ? <div className="viewer-chips">{r.team.awards.map((a) => <span key={a.label} className={`viewer-chip ${a.tier === 'major' ? 'viewer-chip-gold' : ''}`}>{a.label}</span>)}</div>
                          : r.awardElsewhere ? <span className="viewer-sub">Đã có giải ở host khác: {r.awardElsewhere.award} — {r.awardElsewhere.name} ({r.awardElsewhere.competition?.name})</span>
                            : <span className="viewer-sub">—</span>}
                      </td>
                      <td>{r.selected ? <span className="viewer-chip" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,.5)' }}>Được xét ({r.selectedOrder})</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
