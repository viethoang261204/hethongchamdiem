import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './AdminLayout.css';

export default function AdminScores() {
  const { showConfirm, showAlert } = useNotify();
  const [scores, setScores] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterComp, setFilterComp] = useState('');
  const [filterContent, setFilterContent] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const SECURITY_CODE = '26122004';

  const load = async () => {
    try {
      const [compList, scoreList] = await Promise.all([
        api.getCompetitions(),
        api.getScores(),
      ]);
      setCompetitions(compList);
      setScores(scoreList);
      const contentIds = [...new Set(scoreList.map(s => s.contestContentId))];
      const allContents = [];
      for (const c of compList) {
        const cont = await api.getContents(c.id);
        allContents.push(...cont);
      }
      setContents(allContents);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = scores;
    if (filterComp) list = list.filter(s => s.team?.competitionId === filterComp);
    if (filterContent) list = list.filter(s => s.contestContentId === filterContent);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      list = list.filter(x => (x.team?.name || '').toLowerCase().includes(s));
    }
    return list;
  }, [scores, filterComp, filterContent, search]);

  const contentName = (id) => contents.find(c => c.id === id)?.name || id;
  const compName = (id) => competitions.find(c => c.id === id)?.name || id;

  const remove = async (id) => {
    const ok = await showConfirm({ message: 'Xóa phiếu điểm này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    setDeleteConfirm({ id, securityCode: '' });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.securityCode !== SECURITY_CODE) {
      showAlert('Mã bảo mật không đúng!', 'error');
      return;
    }
    try {
      await api.deleteScore(deleteConfirm.id);
      setDeleteConfirm(null);
      load();
      showAlert('Đã xóa.', 'success');
    } catch (e) {
      showAlert(e.message || 'Lỗi', 'error');
    }
  };

  return (
    <div className="nhutin-admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý phiếu điểm</h1>
          <p className="page-subtitle">Tổng số: {filtered.length} phiếu</p>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <input type="text" placeholder="Tìm theo tên đội..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterComp} onChange={(e) => setFilterComp(e.target.value)}>
          <option value="">Tất cả cuộc thi</option>
          {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={filterContent} onChange={(e) => setFilterContent(e.target.value)}>
          <option value="">Tất cả nội dung</option>
          {contents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Cuộc thi</th>
                <th>Nội dung</th>
                <th>Đội</th>
                <th>Thời gian</th>
                <th>Điểm</th>
                <th>Ngày nộp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#888' }}>Không có phiếu điểm</td></tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{compName(s.team?.competitionId)}</td>
                    <td>{contentName(s.contestContentId)}</td>
                    <td>{s.team?.name || '-'}</td>
                    <td>{s.time || '-'}</td>
                    <td><strong>{s.score ?? '-'}</strong></td>
                    <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString('vi-VN') : '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link to={`/admin/scores/${s.id}`} className="btn btn-secondary" style={{ marginRight: 8 }}>Xem</Link>
                      <button type="button" className="btn btn-danger" onClick={() => remove(s.id)}>Xóa</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="form-modal-header">
              <h3 className="form-modal-title">Xác nhận xóa</h3>
              <button type="button" className="form-modal-close" onClick={() => setDeleteConfirm(null)} aria-label="Đóng">×</button>
            </div>
            <div className="form-modal-body">
              <p style={{ marginBottom: 16, color: '#374151' }}>Nhập mã bảo mật để xóa phiếu điểm:</p>
              <div className="form-group">
                <label className="form-label">Mã bảo mật</label>
                <input
                  type="password"
                  className="form-input"
                  value={deleteConfirm.securityCode}
                  onChange={(e) => setDeleteConfirm({ ...deleteConfirm, securityCode: e.target.value })}
                  placeholder="Nhập mã bảo mật"
                  autoFocus
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Hủy</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
