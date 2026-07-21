import { useState, useMemo } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, ErrorBox } from '../../hooks/useApiLoader.jsx';
import './AdminLayout.css';

export default function AdminBoards() {
  const { showAlert } = useNotify();
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
  const [attached, setAttached] = useState([]); // board id đã thêm vào nội dung đang chọn
  const [loadingAttached, setLoadingAttached] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const contentsForComp = useMemo(
    () => contents.filter((c) => !filterComp || c.competition_id === filterComp),
    [contents, filterComp]
  );

  const selectContent = async (contentId) => {
    setFilterContent(contentId);
    if (!contentId) { setAttached([]); return; }
    setLoadingAttached(true);
    try {
      const list = await api.getBoards(contentId);
      setAttached(list.map((b) => b.id));
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
        await api.postBoard(filterContent, boardId);
        setAttached((prev) => [...prev, boardId]);
      } else {
        await api.deleteBoard(filterContent, boardId);
        setAttached((prev) => prev.filter((id) => id !== boardId));
      }
    } catch (e) {
      showAlert(e.message || 'Lỗi khi cập nhật bảng đấu.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bảng đấu</h1>
          <p className="page-subtitle">5 bảng cố định theo độ tuổi (A–E), dùng chung toàn hệ thống — chọn nội dung thi để thêm/bớt bảng áp dụng</p>
        </div>
      </div>

      <div className="filters-bar">
        <select
          className="filter-select"
          value={filterComp}
          onChange={(e) => { setFilterComp(e.target.value); setFilterContent(''); setAttached([]); }}
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
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Áp dụng</th>
                  <th>Bảng</th>
                  <th>Độ tuổi</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={attached.includes(b.id)}
                        disabled={savingId === b.id}
                        onChange={(e) => toggleBoard(b.id, e.target.checked)}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td>{b.age_group || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
