import { useState, useMemo } from 'react';
import { api } from '../../api';
import { clearApiCache } from '../../apiCache';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

export default function AdminBoards() {
  const { showAlert, showConfirm } = useNotify();
  const { data, loading, error, reload } = useApiLoader(async () => {
    const [comps, allContents, allBoards] = await Promise.all([
      api.getCompetitions(),
      api.getAllContents(),
      api.getAllBoards(),
    ]);
    return { competitions: comps, contents: allContents, boards: allBoards };
  }, []);
  const competitions = data?.competitions || [];
  const contents = data?.contents || [];
  const boards = data?.boards || []; // 5 bảng cố định toàn hệ thống (Bảng A-E)

  const [filterComp, setFilterComp] = useState('');
  const [filterContent, setFilterContent] = useState('');
  const [attached, setAttached] = useState([]); // bảng đã thêm vào nội dung đang chọn, kèm ranking_format
  const [brackets, setBrackets] = useState({}); // boardId -> { matches, bracket_resolved } (chỉ bảng đối kháng)
  const [loadingAttached, setLoadingAttached] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const contentsForComp = useMemo(
    () => contents.filter((c) => !filterComp || c.competition_id === filterComp),
    [contents, filterComp]
  );

  // Fly Smart Cup / Battle of Stars (content_format khác 'scoring') dùng hẳn 1
  // hệ thống trận đấu riêng (trang "Trận đối kháng" — combat_matches), tách
  // biệt hoàn toàn với nhánh đấu loại trực tiếp chung (matches) ở trang này.
  // Luồng trọng tài đã điều hướng thẳng sang màn hình riêng cho 2 nội dung
  // này — nhánh đấu tạo ở đây sẽ KHÔNG bao giờ hiện cho trọng tài, nên phải
  // chặn để tránh nhầm lẫn (đã xảy ra 1 lần: admin tạo nhánh ở đây, trọng
  // tài không thấy gì vì đang đọc từ combat_matches trống).
  const selectedContentObj = contents.find((c) => c.id === filterContent);
  const isDedicatedCombat = selectedContentObj && selectedContentObj.content_format !== 'scoring';

  const loadBrackets = async (contentId, boardsList) => {
    const combatBoards = boardsList.filter((b) => b.ranking_format === 'combat');
    if (!combatBoards.length) { setBrackets({}); return; }
    const pairs = await Promise.all(
      combatBoards.map((b) => api.getBracket(contentId, b.id).then((r) => [b.id, r]).catch(() => [b.id, null]))
    );
    setBrackets(Object.fromEntries(pairs));
  };

  const selectContent = async (contentId) => {
    setFilterContent(contentId);
    if (!contentId) { setAttached([]); setBrackets({}); return; }
    setLoadingAttached(true);
    try {
      const list = await api.getBoards(contentId);
      setAttached(list);
      await loadBrackets(contentId, list);
    } catch (e) {
      showAlert(e.message || 'Lỗi tải bảng đấu của nội dung.', 'error');
    } finally {
      setLoadingAttached(false);
    }
  };

  const toggleBoard = async (boardId, checked) => {
    setSavingId(boardId);
    try {
      if (checked) {
        const b = await api.postBoard(filterContent, boardId);
        setAttached((prev) => [...prev, { ...b, ranking_format: 'measurement' }]);
      } else {
        await api.deleteBoard(filterContent, boardId);
        setAttached((prev) => prev.filter((b) => b.id !== boardId));
      }
      // Các trang khác (VD: Quản lý đội thi) cache getBoards 2 phút — xoá ngay
      // để dropdown chọn bảng ở đó thấy bảng vừa thêm/bớt mà không phải chờ.
      clearApiCache('getBoards');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi cập nhật bảng đấu.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const changeFormat = async (boardId, format) => {
    setSavingId(boardId);
    try {
      await api.putBoardRankingFormat(filterContent, boardId, format);
      setAttached((prev) => prev.map((b) => (b.id === boardId ? { ...b, ranking_format: format } : b)));
      clearApiCache('getBoards');
      const updated = attached.map((b) => (b.id === boardId ? { ...b, ranking_format: format } : b));
      await loadBrackets(filterContent, updated);
    } catch (e) {
      showAlert(e.message || 'Lỗi khi đổi luật xếp hạng.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const generateBracket = async (boardId) => {
    setSavingId(boardId);
    try {
      await api.generateBracket(filterContent, boardId);
      await loadBrackets(filterContent, attached);
      showAlert('Đã tạo nhánh đấu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi tạo nhánh.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const deleteBracket = async (boardId) => {
    const info = brackets[boardId];
    const hasPlayed = info?.matches?.some((m) => m.played_at);
    const ok = await showConfirm({
      message: hasPlayed
        ? 'Nhánh đấu đã có trận diễn ra. Xóa hết và tạo lại? Kết quả các trận đã đấu sẽ mất.'
        : 'Xóa nhánh đấu này?',
      confirmText: 'Xóa', cancelText: 'Hủy', danger: true,
    });
    if (!ok) return;
    setSavingId(boardId);
    try {
      await api.deleteBracket(filterContent, boardId, hasPlayed);
      await loadBrackets(filterContent, attached);
      showAlert('Đã xóa nhánh đấu.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi khi xóa nhánh.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bảng đấu</h1>
          <p className="page-subtitle">5 bảng cố định theo độ tuổi (A–E), dùng chung toàn hệ thống — chọn nội dung thi để thêm/bớt bảng áp dụng và đặt luật xếp hạng</p>
        </div>
      </div>

      <div className="filters-bar">
        <select
          className="filter-select"
          value={filterComp}
          onChange={(e) => { setFilterComp(e.target.value); setFilterContent(''); setAttached([]); setBrackets({}); }}
        >
          <option value="">-- Chọn cuộc thi --</option>
          {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          className="filter-select"
          value={filterContent}
          onChange={(e) => selectContent(e.target.value)}
          disabled={!filterComp}
        >
          <option value="">-- Chọn nội dung thi --</option>
          {contentsForComp.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="card">
        {!filterContent ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#888' }}>
            Chọn cuộc thi và nội dung thi để quản lý bảng đấu áp dụng cho nội dung đó.
          </p>
        ) : loading || loadingAttached ? (
          <p style={{ padding: 24, textAlign: 'center' }}>Đang tải...</p>
        ) : isDedicatedCombat ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#f59e0b' }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>
              "{selectedContentObj.name}" dùng bảng điểm đối kháng riêng ({selectedContentObj.content_format === 'combat_drone' ? 'Fly Smart Cup' : 'Battle of Stars'}).
            </p>
            <p style={{ color: '#94a3b8' }}>
              Luật xếp hạng/nhánh đấu ở trang này KHÔNG áp dụng cho nội dung này — trọng tài sẽ không thấy gì cả.
              Vào <strong>Trận đối kháng</strong> (menu bên trái) để tạo và quản lý trận đấu cho nội dung này.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Áp dụng</th>
                  <th>Bảng</th>
                  <th>Độ tuổi</th>
                  <th style={{ width: 200 }}>Luật xếp hạng</th>
                  <th style={{ width: 220 }}>Nhánh đối kháng</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => {
                  const att = attached.find((a) => a.id === b.id);
                  const isAttached = !!att;
                  const isCombat = att?.ranking_format === 'combat';
                  const bracket = brackets[b.id];
                  const hasBracket = !!bracket?.matches?.length;
                  return (
                    <tr key={b.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isAttached}
                          disabled={savingId === b.id}
                          onChange={(e) => toggleBoard(b.id, e.target.checked)}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{b.name}</td>
                      <td>{b.age_group || '-'}</td>
                      <td>
                        {isAttached ? (
                          <select
                            className="form-input form-select"
                            value={att.ranking_format}
                            disabled={savingId === b.id}
                            onChange={(e) => changeFormat(b.id, e.target.value)}
                          >
                            <option value="measurement">Đo lường (điểm/thời gian)</option>
                            <option value="combat">Đối kháng (thắng/thua)</option>
                          </select>
                        ) : '-'}
                      </td>
                      <td>
                        {!isAttached ? '-' : !isCombat ? (
                          <span style={{ color: '#94a3b8', fontSize: 13 }}>Không áp dụng</span>
                        ) : hasBracket ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className="badge badge-blue">{bracket.matches.length} trận</span>
                            <button type="button" className="btn btn-danger" disabled={savingId === b.id} onClick={() => deleteBracket(b.id)}>Xóa nhánh</button>
                          </div>
                        ) : (
                          <button type="button" className="btn btn-primary" disabled={savingId === b.id} onClick={() => generateBracket(b.id)}>
                            Tạo nhánh ngẫu nhiên
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
