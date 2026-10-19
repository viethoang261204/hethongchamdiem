import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { BOARD_AGE_LABEL, contentLabel, normalizeText, teamResultText } from '../../lib/lookup';
import { formatSecondsAsMinutes } from '../../lib/time';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import CombatStarsSheetTable from '../shared/CombatStarsSheetTable';
import CombatDroneSheetTable from '../shared/CombatDroneSheetTable';

// Bộ lọc lưu trên URL (?noiDung=&bang=&san=&truong=&hlv=&q=) — để trang
// Tổng quan / Trường-HLV dẫn link thẳng sang danh sách đã lọc sẵn, và người
// xem có thể copy link gửi cho người khác.
const FILTER_KEYS = ['q', 'giai', 'noiDung', 'bang', 'san', 'truong', 'hlv'];

export default function ViewerTeams() {
  const { lookup } = useLookupData();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const [openTeamId, setOpenTeamId] = useState(null);

  const filtered = useMemo(() => {
    if (!lookup) return [];
    const q = normalizeText(f.q);
    return lookup.teams.filter((t) => {
      if (f.giai && t.competition_id !== f.giai) return false;
      if (f.noiDung && t.contest_content_id !== f.noiDung) return false;
      if (f.bang && t.boardName !== f.bang) return false;
      if (f.san && !(t.fields || []).includes(f.san)) return false;
      if (f.truong && t.school_name !== f.truong) return false;
      if (f.hlv && t.coach_name !== f.hlv) return false;
      if (!q) return true;
      return [t.name, t.school_name, t.coach_name, ...t.students.map((s) => s.full_name)]
        .some((v) => normalizeText(v).includes(q));
    });
  }, [lookup, f.q, f.giai, f.noiDung, f.bang, f.san, f.truong, f.hlv]);

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 25);
  if (!lookup) return null;
  const boardsInUse = [...new Set(lookup.teams.map((t) => t.boardName).filter(Boolean))].sort();
  const hasFilter = FILTER_KEYS.some((k) => f[k]);
  const openTeam = openTeamId ? lookup.teamsById.get(openTeamId) : null;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Tra cứu đội thi & phiếu điểm</h1>
        <p className="referee-page-subtitle">Tìm theo tên đội, tên học sinh, trường / trung tâm hoặc HLV — bấm vào đội để xem điểm từng lượt và phiếu điểm.</p>
      </div>

      <div className="filters-bar viewer-filters">
        <div className="search-box">
          <input type="text" placeholder="Tên đội, học sinh, trường, HLV..." value={f.q} onChange={(e) => setFilter('q', e.target.value)} />
        </div>
        {lookup.all && (
          <select className="filter-select" value={f.giai} onChange={(e) => setFilter('giai', e.target.value)}>
            <option value="">Tất cả giải</option>
            {lookup.competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select className="filter-select" value={f.noiDung} onChange={(e) => setFilter('noiDung', e.target.value)}>
          <option value="">Tất cả nội dung</option>
          {lookup.contents.filter((c) => !f.giai || c.competition_id === f.giai).map((c) => <option key={c.id} value={c.id}>{contentLabel(lookup, c)}</option>)}
        </select>
        <select className="filter-select" value={f.bang} onChange={(e) => setFilter('bang', e.target.value)}>
          <option value="">Tất cả bảng</option>
          {boardsInUse.map((b) => <option key={b} value={b}>{b} — {BOARD_AGE_LABEL[b] || ''}</option>)}
        </select>
        <select className="filter-select" value={f.san} onChange={(e) => setFilter('san', e.target.value)}>
          <option value="">Tất cả sân</option>
          {lookup.fields.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="filter-select" value={f.truong} onChange={(e) => setFilter('truong', e.target.value)}>
          <option value="">Tất cả trường / TT</option>
          {lookup.schools.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="filter-select" value={f.hlv} onChange={(e) => setFilter('hlv', e.target.value)}>
          <option value="">Tất cả HLV</option>
          {lookup.coaches.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {hasFilter && <button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>Xóa lọc</button>}
      </div>

      <p className="viewer-count">{filtered.length} đội{hasFilter ? ` (trên tổng ${lookup.teams.length})` : ''}</p>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Đội</th>{lookup.all && <th>Giải</th>}<th>Nội dung</th><th>Bảng</th><th>Sân</th><th>Trường / Trung tâm</th><th>HLV</th><th>Kết quả</th><th className="viewer-num">Hạng</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={lookup.all ? 9 : 8} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không tìm thấy đội nào.</td></tr>
              ) : pageItems.map((t) => (
                <tr key={t.id} className="viewer-row" onClick={() => setOpenTeamId(t.id)}>
                  <td><strong>{t.name}</strong><div className="viewer-sub">{t.students.map((s) => s.full_name).join(', ')}</div></td>
                  {lookup.all && <td>{t.competition?.name || '—'}</td>}
                  <td>{t.content?.name}</td>
                  <td>{t.boardName}</td>
                  <td>{(t.fields || []).join(', ')}</td>
                  <td>{t.school_name || '—'}</td>
                  <td>{t.coach_name || '—'}</td>
                  <td className="viewer-result">{teamResultText(t)}</td>
                  <td className="viewer-num">{t.rank ? <span className={`rt-rank ${t.rank <= 3 ? `rt-rank-${t.rank}` : ''}`}>{t.rank}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>

      {openTeam && <TeamModal team={openTeam} onClose={() => setOpenTeamId(null)} />}
    </div>
  );
}

function TeamModal({ team: t, onClose }) {
  const [sheetMatch, setSheetMatch] = useState(null);
  const fmtTime = (v) => (v === null || v === undefined || v === '' ? '—' : `${v}s (${formatSecondsAsMinutes(v)})`);

  return (
    <div className="viewer-modal-overlay" onClick={onClose}>
      <div className="viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-modal-header">
          <div>
            <h2 className="viewer-modal-title">{t.name}</h2>
            <div className="viewer-sub">{t.competition ? `${t.competition.name} · ` : ''}{t.content?.name} · {t.boardName}{BOARD_AGE_LABEL[t.boardName] ? ` (${BOARD_AGE_LABEL[t.boardName]})` : ''} · Sân {(t.fields || []).join(', ') || '—'}</div>
          </div>
          <button type="button" className="viewer-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="viewer-modal-body">
          <div className="viewer-info-grid">
            <div><span>Trường / Trung tâm</span><strong>{t.school_name || '—'}</strong></div>
            <div><span>Huấn luyện viên</span><strong>{t.coach_name || '—'}</strong></div>
            <div><span>Thành viên</span><strong>{t.students.map((s) => s.full_name).join(', ') || '—'}</strong></div>
            <div><span>Hạng</span><strong>{t.rank ? `${t.rank}${t.rankScope ? ` (${t.rankScope})` : ''}` : 'Chưa xếp hạng'}{t.award ? ` · ${t.award}` : ''}</strong></div>
          </div>

          {!t.isCombat ? (
            <>
              <h3 className="viewer-h3">Điểm thi</h3>
              <div className="table-container">
                <table>
                  <thead><tr><th>Lượt</th><th className="viewer-num">Điểm</th><th>Thời gian</th><th className="viewer-num">Chạy lại</th><th>Trọng tài</th><th></th></tr></thead>
                  <tbody>
                    {[1, 2].map((r) => {
                      const s = t.rounds[r];
                      return (
                        <tr key={r}>
                          <td>Lượt {r}</td>
                          <td className="viewer-num">{s ? <strong>{s.score}</strong> : '—'}</td>
                          <td>{s ? fmtTime(s.time) : 'Chưa chấm'}</td>
                          <td className="viewer-num">{s ? s.retry_count ?? 0 : '—'}</td>
                          <td>{s?.referee_name || '—'}</td>
                          <td>{s && <Link className="btn btn-secondary viewer-btn-sm" to={`/tra-cuu/phieu/${s.id}`}>Xem phiếu điểm</Link>}</td>
                        </tr>
                      );
                    })}
                    {t.total && (
                      <tr className="viewer-total-row">
                        <td>Tổng</td>
                        <td className="viewer-num"><strong>{t.total.total_score}</strong></td>
                        <td>{fmtTime(t.total.total_time)}</td>
                        <td className="viewer-num">{t.total.total_retry}</td>
                        <td colSpan={2}></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <h3 className="viewer-h3">
                Các trận đấu {t.combat?.played ? `— ${t.combat.wins} thắng · ${t.combat.draws} hòa · ${t.combat.losses} thua · ${t.combat.matchPoints} điểm trận` : ''}
              </h3>
              <div className="table-container">
                <table>
                  <thead><tr><th>Sân</th><th className="viewer-num">STT</th><th>Đối thủ</th><th>Kết quả</th><th></th></tr></thead>
                  <tbody>
                    {t.matches.length === 0 ? (
                      <tr><td colSpan={5} style={{ color: '#94a3b8' }}>Chưa có trận nào.</td></tr>
                    ) : t.matches.map((m) => {
                      const isA = m.team_a_id === t.id;
                      const opp = isA ? m.team_b : m.team_a;
                      const played = !!m.winner_id || m.is_draw;
                      const res = !played ? 'Chưa đấu' : m.is_draw ? 'Hòa' : m.winner_id === t.id ? 'Thắng' : 'Thua';
                      return (
                        <tr key={m.id}>
                          <td>{m.field_name || '—'}</td>
                          <td className="viewer-num">{m.match_no || '—'}</td>
                          <td>{opp?.name || '—'}</td>
                          <td className={`viewer-res-${res === 'Thắng' ? 'win' : res === 'Thua' ? 'lose' : 'draw'}`}>{res}</td>
                          <td>{played && <button type="button" className="btn btn-secondary viewer-btn-sm" onClick={() => setSheetMatch(m)}>Xem phiếu</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {sheetMatch && (
            <div className="viewer-sheet">
              <div className="viewer-sheet-head">
                <strong>Phiếu điểm trận {sheetMatch.match_no ? `#${sheetMatch.match_no}` : ''} — Sân {sheetMatch.field_name || '—'}</strong>
                <button type="button" className="btn btn-ghost viewer-btn-sm" onClick={() => setSheetMatch(null)}>Đóng phiếu</button>
              </div>
              <div className="ref-sheet-scroll">
                {t.content?.content_format === 'combat_stars'
                  ? <CombatStarsSheetTable match={sheetMatch} />
                  : <CombatDroneSheetTable match={sheetMatch} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
