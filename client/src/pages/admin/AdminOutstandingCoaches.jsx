import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import { computeGroupStandings } from '../../lib/battleScoring';
import { computeGroupStandings as computeDroneStandings } from '../../lib/flySmartCupScoring';
import { classifyRank, isOutstandingCoach } from '../../lib/outstandingCoach';
import './AdminLayout.css';

const COMBAT_FORMATS = ['combat_stars', 'combat_drone'];
const TIER_LABEL = { major: 'Giải chính (Top 1-3)', phu: 'Giải phụ' };

// Quét TOÀN BỘ nội dung × bảng đấu của 1 cuộc thi, tính hạng thật của từng
// đội (đo lường qua /ranking, đối kháng qua computeGroupStandings/
// computeDroneStandings theo đúng bảng đấu — xem client/src/lib/outstandingCoach.js
// để biết luật xét giải chính/giải phụ theo từng nội dung), rồi gộp theo HLV
// (team.coach_id). Trả về Map coachId -> mảng các đội đạt giải của HLV đó.
async function computeQualifyingEntries(competitionId) {
  const contents = await api.getContents(competitionId);
  const entriesByCoach = new Map();
  const addEntry = (coachId, entry) => {
    if (!coachId) return;
    if (!entriesByCoach.has(coachId)) entriesByCoach.set(coachId, []);
    entriesByCoach.get(coachId).push(entry);
  };

  for (const content of contents) {
    const [boards, teams] = await Promise.all([
      api.getBoards(content.id).catch(() => []),
      api.getTeams(content.id).catch(() => []),
    ]);
    if (!boards.length || !teams.length) continue;
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const isCombat = COMBAT_FORMATS.includes(content.content_format);
    const isStars = content.content_format === 'combat_stars';

    if (isCombat) {
      const matches = await api.getCombatMatches(content.id).catch(() => []);
      boards.forEach((board) => {
        const boardTeams = teams.filter((t) => t.board_id === board.id);
        if (!boardTeams.length) return;
        const standings = isStars
          ? computeGroupStandings(boardTeams, matches)
          : computeDroneStandings(boardTeams, matches);
        standings.forEach((s) => {
          const tier = classifyRank(content.name, board.name, s.rank);
          if (!tier) return;
          const team = teamById.get(s.teamId);
          addEntry(team?.coach_id, {
            team_name: s.teamName, content_name: content.name, board_name: board.name, rank: s.rank, tier,
          });
        });
      });
    } else {
      await Promise.all(boards.map(async (board) => {
        const r = await api.getRanking(content.id, board.id).catch(() => null);
        if (!r) return;
        if (r.ranking_format === 'measurement') {
          (r.teams || []).forEach((t, idx) => {
            const rank = idx + 1;
            const tier = classifyRank(content.name, board.name, rank);
            if (!tier) return;
            const team = teamById.get(t.team_id);
            addEntry(team?.coach_id, {
              team_name: t.team_name, content_name: content.name, board_name: board.name, rank, tier,
            });
          });
        } else if (r.ranking_format === 'combat' && r.bracket_resolved) {
          (r.placements || []).forEach((p) => {
            const tier = classifyRank(content.name, board.name, p.rank);
            if (!tier) return;
            const team = teamById.get(p.team_id);
            const name = r.matches.find((m) => m.team_a_id === p.team_id)?.team_a_name
              || r.matches.find((m) => m.team_b_id === p.team_id)?.team_b_name || team?.name || '';
            addEntry(team?.coach_id, {
              team_name: name, content_name: content.name, board_name: board.name, rank: p.rank, tier,
            });
          });
        }
      }));
    }
  }

  return entriesByCoach;
}

export default function AdminOutstandingCoaches() {
  const { showAlert } = useNotify();

  const { data: compsData, loading: compsLoading, error: compsError, reload: compsReload } = useApiLoader(
    () => api.getCompetitions(), []
  );
  const competitions = compsData || [];
  const { data: coachesData } = useApiLoader(() => api.getCoaches(), []);
  const coaches = coachesData || [];

  const [selectedComp, setSelectedComp] = useState('');
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState(null);
  const [entriesByCoach, setEntriesByCoach] = useState(null); // coachId -> entries[]

  // Ghi chú tự do (không ảnh hưởng việc có đạt chuẩn hay không — chỉ để BTC
  // note thêm lý do/ngữ cảnh) — lưu riêng trong bảng outstanding_coaches.
  const { data: notesData, reload: notesReload } = useApiLoader(
    async () => (selectedComp ? await api.getOutstandingCoaches(selectedComp) : []),
    [selectedComp]
  );
  const noteByCoachId = useMemo(() => {
    const m = new Map();
    (notesData || []).forEach((row) => m.set(row.coach_id, row));
    return m;
  }, [notesData]);

  const runCompute = useCallback(async () => {
    if (!selectedComp) { setEntriesByCoach(null); return; }
    setComputing(true);
    setComputeError(null);
    try {
      const result = await computeQualifyingEntries(selectedComp);
      setEntriesByCoach(result);
    } catch (e) {
      setComputeError(e.message || 'Lỗi khi tính danh sách HLV xuất sắc.');
    } finally {
      setComputing(false);
    }
  }, [selectedComp]);

  useEffect(() => { runCompute(); }, [runCompute]);

  const qualifyingList = useMemo(() => {
    if (!entriesByCoach) return [];
    const coachById = new Map(coaches.map((c) => [c.id, c]));
    const list = [];
    entriesByCoach.forEach((entries, coachId) => {
      if (!isOutstandingCoach(entries)) return;
      const coach = coachById.get(coachId);
      const majorCount = entries.filter((e) => e.tier === 'major').length;
      const phuCount = entries.length - majorCount;
      list.push({
        coachId,
        coachName: coach?.name || '(HLV đã bị xóa)',
        coachPhone: coach?.phone || '',
        entries: entries.slice().sort((a, b) => a.rank - b.rank),
        majorCount, phuCount, totalCount: entries.length,
        note: noteByCoachId.get(coachId)?.note || '',
      });
    });
    list.sort((a, b) => b.majorCount - a.majorCount || b.totalCount - a.totalCount || a.coachName.localeCompare(b.coachName));
    return list;
  }, [entriesByCoach, coaches, noteByCoachId]);

  const [noteModal, setNoteModal] = useState(null); // { coachId, coachName, text }
  const [savingNote, setSavingNote] = useState(false);

  const openNoteModal = (row) => setNoteModal({ coachId: row.coachId, coachName: row.coachName, text: row.note });

  const saveNote = async () => {
    if (!noteModal) return;
    setSavingNote(true);
    try {
      const existing = noteByCoachId.get(noteModal.coachId);
      const text = noteModal.text.trim() || null;
      if (existing) {
        await api.putOutstandingCoach(existing.id, { note: text });
      } else {
        const row = qualifyingList.find((r) => r.coachId === noteModal.coachId);
        await api.postOutstandingCoach(selectedComp, { coach_id: noteModal.coachId, award_team_count: row?.totalCount || 0, note: text });
      }
      setNoteModal(null);
      notesReload();
      showAlert('Đã lưu ghi chú.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi lưu ghi chú.', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const loading = compsLoading;

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">HLV xuất sắc</h1>
          <p className="page-subtitle">
            Tự động xét theo kết quả thi đấu thật — đạt giải Nhất/Nhì/Ba ở bất kỳ bảng đấu nào,
            hoặc có từ 3 đội trở lên nằm trong Top + giải phụ (theo đúng bảng đấu quy định giải phụ).
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={runCompute} disabled={!selectedComp || computing}>
          {computing ? 'Đang tính...' : 'Tính lại'}
        </button>
      </div>

      {compsError && <ErrorBox error={compsError} onRetry={compsReload} />}

      <div className="filters-bar">
        <div className="form-group" style={{ marginBottom: 0, minWidth: 280 }}>
          <label className="form-label">Cuộc thi <span style={{ color: '#dc2626' }}>*</span></label>
          <select className="form-input form-select" value={selectedComp} onChange={(e) => setSelectedComp(e.target.value)}>
            <option value="">-- Chọn cuộc thi --</option>
            {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {computeError && <ErrorBox error={computeError} onRetry={runCompute} />}

      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>Đang tải...</div>
      ) : !selectedComp ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>
          Chọn cuộc thi để xem danh sách HLV xuất sắc.
        </div>
      ) : computing ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>Đang quét kết quả thi đấu toàn bộ nội dung...</div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Hạng</th>
                  <th>Tên HLV</th>
                  <th style={{ width: 130 }}>SĐT</th>
                  <th style={{ width: 160 }}>Số đội đạt giải</th>
                  <th>Chi tiết</th>
                  <th>Ghi chú</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {qualifyingList.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Chưa có HLV nào đạt chuẩn "HLV xuất sắc" cho cuộc thi này.</td></tr>
                ) : qualifyingList.map((row, i) => (
                  <tr key={row.coachId}>
                    <td><span className={`rank-badge rank-${i + 1}`}>{i + 1}</span></td>
                    <td style={{ fontWeight: 600 }}>{row.coachName}</td>
                    <td>{row.coachPhone || '-'}</td>
                    <td>
                      <strong>{row.totalCount}</strong> đội
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{row.majorCount} giải chính · {row.phuCount} giải phụ</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {row.entries.map((e, idx) => (
                        <div key={idx}>
                          <strong>Top {e.rank}</strong> — {e.team_name} ({e.content_name} · {e.board_name})
                          {e.tier === 'phu' && <span style={{ color: '#94a3b8' }}> — giải phụ</span>}
                        </div>
                      ))}
                    </td>
                    <td style={{ fontSize: 13, color: '#64748b' }}>{row.note || '-'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openNoteModal(row)}>Ghi chú</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="modal-overlay" onClick={() => !savingNote && setNoteModal(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Ghi chú — {noteModal.coachName}</h3>
              <button type="button" className="form-modal-close" onClick={() => setNoteModal(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea
                  className="form-input" rows={4} value={noteModal.text}
                  onChange={(e) => setNoteModal({ ...noteModal, text: e.target.value })}
                  placeholder="VD: lý do đặc biệt, ghi nhận thêm..."
                  autoFocus
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setNoteModal(null)} disabled={savingNote}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={saveNote} disabled={savingNote}>
                {savingNote ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
