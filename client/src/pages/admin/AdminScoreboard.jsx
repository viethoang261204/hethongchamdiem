import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, LoaderFull, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { formatSecondsAsMinutes } from '../../lib/time';
import { computeGroupStandings } from '../../lib/battleScoring';
import { computeGroupStandings as computeDroneStandings } from '../../lib/flySmartCupScoring';
import { safeSheetName, buildStyledSheet, downloadWorkbook } from '../../lib/excelReport';
import './AdminLayout.css';

const COMBAT_FORMATS = ['combat_stars', 'combat_drone'];

function MeasurementTable({ teams }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>Hạng</th>
            <th>Đội</th>
            <th style={{ width: 90 }}>Lượt 1</th>
            <th style={{ width: 90 }}>Lượt 2</th>
            <th style={{ width: 100 }}>Tổng điểm</th>
            <th style={{ width: 110 }}>Tổng thời gian</th>
            <th style={{ width: 100 }}>Chạy lại</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.team_id}>
              <td>
                <span className={`rank-badge rank-${i + 1}`}>{i + 1}</span>
                {t.needs_playoff && <span className="badge badge-red" style={{ marginLeft: 6 }}>Cần chạy thử</span>}
              </td>
              <td>{t.team_name}</td>
              <td>{t.round1 ? t.round1.score : <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td>{t.round2 ? t.round2.score : <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td><strong>{t.total_score}</strong></td>
              <td>{formatSecondsAsMinutes(String(t.total_time)) || '-'}</td>
              <td>{t.total_retry}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CombatBracket({ data }) {
  const rounds = useMemo(() => {
    const byRound = new Map();
    for (const m of data.matches || []) {
      if (!byRound.has(m.round_no)) byRound.set(m.round_no, []);
      byRound.get(m.round_no).push(m);
    }
    return Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);
  }, [data]);
  const totalRounds = rounds.length ? Math.max(...rounds.map(([r]) => r)) : 0;
  const roundLabel = (r) => (r === totalRounds ? 'Chung kết' : r === totalRounds - 1 ? 'Bán kết' : `Vòng ${r}`);

  if (!data.matches?.length) {
    return <p style={{ padding: 16, color: '#888' }}>Chưa có nhánh đấu — vào "Bảng đấu" để tạo nhánh.</p>;
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {rounds.map(([r, matches]) => (
        <div key={r} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6, fontSize: 13 }}>{roundLabel(r)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.sort((a, b) => a.bracket_slot - b.bracket_slot).map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                <span>{m.team_a_name || '—'} vs {m.team_b_name || '—'}</span>
                <strong style={{ color: m.winner_id ? '#16a34a' : m.is_draw ? '#dc2626' : '#94a3b8' }}>
                  {m.winner_id ? m.winner_name : m.is_draw ? 'Hòa' : 'Chưa đấu'}
                </strong>
              </div>
            ))}
          </div>
        </div>
      ))}
      {data.bracket_resolved && data.placements?.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6, fontSize: 13 }}>Kết quả chung cuộc</div>
          <table>
            <tbody>
              {data.placements.map((p) => {
                const name = data.matches.find((m) => m.team_a_id === p.team_id)?.team_a_name
                  || data.matches.find((m) => m.team_b_id === p.team_id)?.team_b_name || p.team_id;
                return (
                  <tr key={p.team_id}><td style={{ padding: '4px 12px 4px 0' }}><strong>Hạng {p.rank}</strong></td><td>{name}</td></tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// BXH theo Board (Division tuổi) cho Battle of Stars / Fly Smart Cup — tính từ
// TẤT CẢ trận của nội dung (không lọc theo Group vòng tròn), vì các Group có
// thể ghép nhiều Board lại với nhau để đủ số đội thi đấu; khi xếp hạng để trao
// giải thì vẫn phải tách riêng theo từng Board. BXH theo Group (giữ nguyên,
// không đổi) vẫn xem ở trang "Trận đối kháng".
function CombatBoardTable({ standings, isStars }) {
  if (standings.length === 0) return <p style={{ padding: 16, color: '#888' }}>Chưa có đội nào ở Division này.</p>;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>Hạng</th>
            <th>Đội</th>
            <th style={{ width: 70 }}>Trận</th>
            <th style={{ width: 60 }}>W</th>
            <th style={{ width: 60 }}>D</th>
            <th style={{ width: 60 }}>L</th>
            {isStars ? (
              <>
                <th style={{ width: 100 }}>Match Points</th>
                <th style={{ width: 100 }}>Total Score</th>
                <th style={{ width: 90 }}>Meteor</th>
                <th style={{ width: 90 }}>Direct Win</th>
                <th style={{ width: 80 }}>Retries</th>
              </>
            ) : (
              <>
                <th style={{ width: 100 }}>Match Points</th>
                <th style={{ width: 100 }}>Total Score</th>
                <th style={{ width: 130 }}>Status</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.teamId}>
              <td><span className={`rank-badge rank-${s.rank}`}>{s.rank}</span></td>
              <td>{s.teamName}</td>
              <td>{s.played}</td>
              <td>{s.wins}</td>
              <td>{s.draws}</td>
              <td>{s.losses}</td>
              {isStars ? (
                <>
                  <td><strong>{s.matchPoints}</strong></td>
                  <td>{s.totalScore}</td>
                  <td>{s.meteorCompleted}</td>
                  <td>{s.directWins}</td>
                  <td>{s.retries}</td>
                </>
              ) : (
                <>
                  <td><strong>{s.matchPoints}</strong></td>
                  <td>{s.totalScore}</td>
                  <td>
                    {s.tieBreakRequired
                      ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12 }}>TIE-BREAK REQUIRED</span>
                      : s.headToHeadWinner ? <span style={{ color: '#16a34a', fontSize: 12 }}>H2H</span> : ''}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminScoreboard() {
  const { showAlert } = useNotify();
  const [selectedComp, setSelectedComp] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('');
  const [rankings, setRankings] = useState({}); // boardId -> ranking data
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);

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
  const selectedContentObj = contents.find((c) => c.id === selectedContent) || null;
  const isCombatContent = selectedContentObj?.content_format === 'combat_stars' || selectedContentObj?.content_format === 'combat_drone';
  const isStarsContent = selectedContentObj?.content_format === 'combat_stars';

  // Đội chưa được phân bảng — không nằm trong hệ thống xếp hạng theo bảng, hiện riêng
  // (chỉ áp dụng nội dung chấm điểm đo lường — combat dùng combat_matches riêng).
  const { data: flatScoreboard } = useApiLoader(
    async () => selectedContent && !isCombatContent ? await api.getScoreboard(selectedContent) : [],
    [selectedContent, isCombatContent]
  );
  const unassignedRows = (flatScoreboard || []).filter((s) => !s.boards?.id);

  // Battle of Stars / Fly Smart Cup: lấy toàn bộ đội + trận của nội dung, tính
  // BXH theo Board ngay tại client (không qua route /ranking — route đó chỉ
  // phục vụ content_format='scoring').
  const { data: combatData, loading: combatLoading, error: combatError, reload: combatReload } = useApiLoader(async () => {
    if (!selectedContent || !isCombatContent) return null;
    const [teams, matches] = await Promise.all([api.getTeams(selectedContent), api.getCombatMatches(selectedContent)]);
    return { teams, matches };
  }, [selectedContent, isCombatContent]);

  const combatBoardStandings = useMemo(() => {
    if (!isCombatContent || !combatData) return {};
    const result = {};
    for (const b of boards) {
      const boardTeams = combatData.teams.filter((t) => t.board_id === b.id);
      result[b.id] = isStarsContent
        ? computeGroupStandings(boardTeams, combatData.matches)
        : computeDroneStandings(boardTeams, combatData.matches);
    }
    return result;
  }, [isCombatContent, isStarsContent, combatData, boards]);
  const combatUnassignedTeams = isCombatContent && combatData ? combatData.teams.filter((t) => !t.board_id) : [];

  useEffect(() => { setSelectedContent(''); }, [selectedComp]);
  useEffect(() => { setSelectedBoard(''); }, [selectedContent]);

  useEffect(() => {
    if (!selectedContent || boards.length === 0 || isCombatContent) { setRankings({}); return; }
    setRankingsLoading(true);
    Promise.all(boards.map((b) => api.getRanking(selectedContent, b.id).then((r) => [b.id, r]).catch(() => [b.id, null])))
      .then((pairs) => setRankings(Object.fromEntries(pairs)))
      .finally(() => setRankingsLoading(false));
  }, [selectedContent, boards, isCombatContent]);

  const visibleBoards = selectedBoard ? boards.filter((b) => b.id === selectedBoard) : boards;

  // Xuất TOÀN BỘ bảng xếp hạng của cuộc thi đang chọn — mọi nội dung × mọi
  // bảng đấu, không phụ thuộc nội dung/bảng đang xem trên màn hình — thành 1
  // file Excel nhiều sheet (1 sheet/nội dung×bảng đấu). Tự đi lấy dữ liệu
  // riêng cho từng nội dung (không dùng state đang hiển thị, vì state đó chỉ
  // scope theo đúng 1 nội dung đang chọn).
  const handleExportFullScoreboard = async () => {
    if (!selectedComp) { showAlert('Chọn cuộc thi trước.', 'error'); return; }
    setExportingFull(true);
    try {
      const allContents = await api.getContents(selectedComp);
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const usedNames = new Set();
      let sheetCount = 0;

      for (const content of allContents) {
        const contentBoards = await api.getBoards(content.id).catch(() => []);
        if (!contentBoards.length) continue;
        const isCombat = COMBAT_FORMATS.includes(content.content_format);
        const isStars = content.content_format === 'combat_stars';

        let combatTeams = null, combatMatches = null;
        if (isCombat) {
          [combatTeams, combatMatches] = await Promise.all([api.getTeams(content.id), api.getCombatMatches(content.id)]);
        }

        for (const board of contentBoards) {
          let header, columnKinds, columnWidths, dataRows;

          if (isCombat) {
            const boardTeams = combatTeams.filter((t) => t.board_id === board.id);
            if (!boardTeams.length) continue;
            const standings = isStars
              ? computeGroupStandings(boardTeams, combatMatches)
              : computeDroneStandings(boardTeams, combatMatches);
            header = isStars
              ? ['Hạng', 'Đội', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Match Points', 'Total Score', 'Meteor', 'Direct Win', 'Retries']
              : ['Hạng', 'Đội', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Match Points', 'Total Score'];
            columnKinds = isStars
              ? ['index', 'text', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']
              : ['index', 'text', 'number', 'number', 'number', 'number', 'number', 'number'];
            columnWidths = isStars ? [8, 26, 10, 10, 10, 10, 14, 14, 12, 12, 10] : [8, 26, 10, 10, 10, 10, 14, 14];
            dataRows = standings.map((s) => (isStars
              ? [s.rank, s.teamName, s.played, s.wins, s.draws, s.losses, s.matchPoints, s.totalScore, s.meteorCompleted, s.directWins, s.retries]
              : [s.rank, s.teamName, s.played, s.wins, s.draws, s.losses, s.matchPoints, s.totalScore]));
          } else {
            const r = await api.getRanking(content.id, board.id).catch(() => null);
            if (!r) continue;
            if (r.ranking_format === 'measurement') {
              if (!r.teams?.length) continue;
              header = ['Hạng', 'Đội', 'Lượt 1', 'Lượt 2', 'Tổng điểm', 'Tổng thời gian', 'Chạy lại'];
              columnKinds = ['index', 'text', 'number', 'number', 'number', 'number', 'number'];
              columnWidths = [8, 28, 12, 12, 12, 14, 10];
              dataRows = r.teams.map((t, idx) => [
                idx + 1, t.team_name,
                t.round1 ? t.round1.score : '', t.round2 ? t.round2.score : '',
                t.total_score, t.total_time, t.total_retry,
              ]);
            } else {
              // Nhánh đấu loại trực tiếp (ranking_format='combat' cho nội dung
              // đo lường) — chỉ xuất được khi đã đấu xong hết nhánh.
              if (!r.bracket_resolved || !r.placements?.length) continue;
              header = ['Hạng', 'Đội'];
              columnKinds = ['index', 'text'];
              columnWidths = [8, 28];
              dataRows = r.placements.map((p) => {
                const name = r.matches.find((m) => m.team_a_id === p.team_id)?.team_a_name
                  || r.matches.find((m) => m.team_b_id === p.team_id)?.team_b_name || p.team_id;
                return [p.rank, name];
              });
            }
          }

          buildStyledSheet(workbook, safeSheetName(`${content.name} - ${board.name}`, usedNames), {
            title: `BẢNG XẾP HẠNG – ${(content.name || '').toUpperCase()}`,
            subtitle: `${board.name}${board.age_group ? ` — ${board.age_group}` : ''}`,
            header, columnKinds, columnWidths, rows: dataRows,
          });
          sheetCount++;
        }
      }

      if (sheetCount === 0) {
        showAlert('Chưa có dữ liệu bảng xếp hạng nào để xuất.', 'error');
        return;
      }
      const compName = competitions.find((c) => c.id === selectedComp)?.name || 'bang-xep-hang';
      const slug = compName.replace(/\s+/g, '-').toLowerCase();
      await downloadWorkbook(workbook, `bang-xep-hang-${slug}.xlsx`);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xuất Excel.', 'error');
    } finally {
      setExportingFull(false);
    }
  };

  const loading = compsLoading;
  const error = compsError || contentsError || boardsError;
  const reload = () => { compsReload(); contentsReload(); boardsReload(); };

  if (loading) return <LoaderFull />;
  if (error) return <div className="nhutin-admin"><ErrorBox error={error} onRetry={reload} /></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bảng xếp hạng</h1>
          <p className="page-subtitle">Chọn cuộc thi và nội dung để xem bảng xếp hạng</p>
        </div>
        {selectedComp && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExportFullScoreboard}
            disabled={exportingFull}
          >
            {exportingFull ? 'Đang xuất...' : 'Xuất Excel toàn bộ BXH'}
          </button>
        )}
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
            </select>
          </div>
        </div>
      </div>

      {selectedContent && (
        <>
          <div className="page-header" style={{ marginTop: 24 }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 20 }}>Bảng xếp hạng</h2>
              <p className="page-subtitle">Mỗi bảng xếp hạng riêng · tổng điểm/thời gian gộp 2 lượt</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={`/admin/competitions/${selectedComp}/contents/${selectedContent}/teams`} className="btn btn-secondary">Quản lý đội</Link>
              <Link to="/admin/boards" className="btn btn-secondary">Quản lý bảng đấu</Link>
            </div>
          </div>

          {isCombatContent ? (
            combatLoading ? (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>Đang tải...</div>
            ) : combatError ? (
              <ErrorBox error={combatError} onRetry={combatReload} />
            ) : visibleBoards.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>Nội dung này chưa có bảng đấu nào.</div>
            ) : visibleBoards.map((b) => (
              <div className="card" key={b.id} style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <h3 className="card-title">
                    {b.name}{b.age_group ? ` — ${b.age_group}` : ''}
                    <span className="badge badge-blue" style={{ marginLeft: 8 }}>{isStarsContent ? 'Battle of Stars' : 'Fly Smart Cup'}</span>
                  </h3>
                  <span className="page-subtitle">{(combatBoardStandings[b.id] || []).length} đội</span>
                </div>
                <CombatBoardTable standings={combatBoardStandings[b.id] || []} isStars={isStarsContent} />
              </div>
            ))
          ) : rankingsLoading ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>Đang tải...</div>
          ) : visibleBoards.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>Nội dung này chưa có bảng đấu nào.</div>
          ) : visibleBoards.map((b) => {
            const r = rankings[b.id];
            return (
              <div className="card" key={b.id} style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <h3 className="card-title">
                    {b.name}{b.age_group ? ` — ${b.age_group}` : ''}
                    {b.ranking_format === 'combat' && <span className="badge badge-blue" style={{ marginLeft: 8 }}>Đối kháng</span>}
                  </h3>
                  {r?.ranking_format === 'measurement' && <span className="page-subtitle">{r.teams.length} đội</span>}
                </div>
                {!r ? (
                  <p style={{ padding: 16, color: '#888' }}>Không tải được dữ liệu.</p>
                ) : r.ranking_format === 'combat' ? (
                  <CombatBracket data={r} />
                ) : r.teams.length === 0 ? (
                  <p style={{ padding: 16, color: '#888' }}>Chưa có điểm nào.</p>
                ) : (
                  <MeasurementTable teams={r.teams} />
                )}
              </div>
            );
          })}

          {isCombatContent && combatUnassignedTeams.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">Chưa gán Division</h3>
                <span className="page-subtitle">{combatUnassignedTeams.length} đội</span>
              </div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Đội</th></tr></thead>
                  <tbody>
                    {combatUnassignedTeams.map((t) => <tr key={t.id}><td>{t.name}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {unassignedRows.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 className="card-title">Chưa phân bảng</h3>
                <span className="page-subtitle">{unassignedRows.length} phiếu điểm</span>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Đội</th>
                      <th style={{ width: 80 }}>Lượt</th>
                      <th style={{ width: 100 }}>Thời gian</th>
                      <th style={{ width: 100 }}>Điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedRows.map((s) => (
                      <tr key={s.id}>
                        <td>{s.team?.name || '-'}</td>
                        <td>{s.round}</td>
                        <td>{formatSecondsAsMinutes(s.time) || '-'}</td>
                        <td><strong>{s.score}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
