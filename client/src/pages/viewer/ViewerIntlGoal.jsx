import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';

const fmtTime = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Mục tiêu ENJOY AI QUỐC TẾ 2026: thanh tiến độ lớn (tổng số người đăng ký /
// mục tiêu) + nhập thêm từng đợt; mỗi đợt sửa / xoá được. Dữ liệu lưu server
// (bảng intl_registrations) nên mọi người cùng thấy 1 con số.
export default function ViewerIntlGoal() {
  const { showAlert, showConfirm } = useNotify();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, count, note }

  const load = useCallback(() => {
    api.getIntlGoal().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message || 'Không tải được dữ liệu.'));
  }, []);
  useEffect(load, [load]);

  const add = async (e) => {
    e.preventDefault();
    const n = Number(count);
    if (!Number.isInteger(n) || n <= 0) { showAlert('Nhập số người là số nguyên lớn hơn 0.', 'error'); return; }
    setSaving(true);
    try {
      await api.addIntlEntry({ count: n, note: note.trim() });
      setCount(''); setNote('');
      load();
    } catch (err) {
      showAlert(err.message || 'Không thêm được.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    const n = Number(editing.count);
    if (!Number.isInteger(n) || n <= 0) { showAlert('Nhập số người là số nguyên lớn hơn 0.', 'error'); return; }
    try {
      await api.updateIntlEntry(editing.id, { count: n, note: (editing.note || '').trim() });
      setEditing(null);
      load();
    } catch (err) {
      showAlert(err.message || 'Không lưu được.', 'error');
    }
  };

  const remove = async (entry) => {
    const ok = await showConfirm({ message: `Xoá dòng ${entry.count} người${entry.note ? ` (${entry.note})` : ''}?`, confirmText: 'Xoá', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    try { await api.deleteIntlEntry(entry.id); load(); } catch (err) { showAlert(err.message || 'Không xoá được.', 'error'); }
  };

  if (error) return <div className="card" style={{ padding: 24, color: '#f87171' }}>{error}</div>;
  if (!data) return <p style={{ color: '#94a3b8', padding: 24 }}>Đang tải...</p>;

  const percent = data.target ? (data.total / data.target) * 100 : 0;
  const remaining = Math.max(0, data.target - data.total);
  const done = data.total >= data.target;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Mục tiêu {data.title}</h1>
        <p className="referee-page-subtitle">Theo dõi số người đã đăng ký so với mục tiêu {data.target} người. Nhập số người mỗi đợt đăng ký rồi bấm Thêm.</p>
      </div>

      <div className="card intl-goal-card">
        <div className="intl-goal-head">
          <div>
            <div className="intl-goal-label">Đã đăng ký</div>
            <div className="intl-goal-number"><span>{data.total}</span> / {data.target} người</div>
          </div>
          <div className={`intl-goal-percent ${done ? 'is-done' : ''}`}>{percent.toFixed(1)}%</div>
        </div>
        <div className="intl-goal-track" role="progressbar" aria-valuemin={0} aria-valuemax={data.target} aria-valuenow={data.total}>
          <div className={`intl-goal-fill ${done ? 'is-done' : ''}`} style={{ width: `${Math.min(100, percent)}%` }} />
          {[25, 50, 75].map((m) => <div key={m} className="intl-goal-tick" style={{ left: `${m}%` }} />)}
        </div>
        <div className="intl-goal-scale">
          {[0, 25, 50, 75, 100].map((m) => <span key={m} style={{ left: `${m}%` }}>{Math.round((data.target * m) / 100)}</span>)}
        </div>
        <div className="intl-goal-foot">
          {done ? <strong style={{ color: '#34d399' }}>Đã đạt mục tiêu! Vượt {data.total - data.target} người.</strong>
            : <>Còn thiếu <strong>{remaining}</strong> người để đạt mục tiêu</>}
        </div>
      </div>

      <form className="filters-bar viewer-filters" onSubmit={add}>
        <input className="filter-select" type="number" min="1" step="1" placeholder="Số người đã đăng ký" value={count}
          onChange={(e) => setCount(e.target.value)} style={{ maxWidth: 220 }} />
        <div className="search-box"><input type="text" placeholder="Ghi chú (không bắt buộc) — vd tên trường, đợt đăng ký..." value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></div>
        <button type="submit" className="btn btn-primary" disabled={saving || !count}>{saving ? 'Đang thêm...' : 'Thêm'}</button>
      </form>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Thời gian</th><th className="viewer-num">Số người</th><th>Ghi chú</th><th>Người nhập</th><th /></tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Chưa có lượt đăng ký nào — nhập số người rồi bấm Thêm.</td></tr>
              ) : data.entries.map((en) => (editing?.id === en.id ? (
                <tr key={en.id}>
                  <td className="viewer-sub viewer-nowrap">{fmtTime(en.created_at)}</td>
                  <td className="viewer-num">
                    <input className="filter-select" type="number" min="1" step="1" value={editing.count} style={{ width: 110 }} autoFocus
                      onChange={(e) => setEditing({ ...editing, count: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                  </td>
                  <td>
                    <input className="filter-select" type="text" value={editing.note || ''} maxLength={200} style={{ width: '100%' }}
                      onChange={(e) => setEditing({ ...editing, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                  </td>
                  <td className="viewer-sub">{en.created_by || '—'}</td>
                  <td className="viewer-nowrap" style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-primary viewer-btn-sm" onClick={saveEdit}>Lưu</button>{' '}
                    <button type="button" className="btn btn-secondary viewer-btn-sm" onClick={() => setEditing(null)}>Hủy</button>
                  </td>
                </tr>
              ) : (
                <tr key={en.id}>
                  <td className="viewer-sub viewer-nowrap">{fmtTime(en.created_at)}{en.updated_at && en.updated_at !== en.created_at && new Date(en.updated_at) - new Date(en.created_at) > 1000 && <div>đã sửa {fmtTime(en.updated_at)}</div>}</td>
                  <td className="viewer-num"><strong>+{en.count}</strong></td>
                  <td>{en.note || <span className="viewer-sub">—</span>}</td>
                  <td className="viewer-sub">{en.created_by || '—'}</td>
                  <td className="viewer-nowrap" style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-secondary viewer-btn-sm" onClick={() => setEditing({ id: en.id, count: String(en.count), note: en.note || '' })}>Sửa</button>{' '}
                    <button type="button" className="btn btn-secondary viewer-btn-sm" style={{ color: '#f87171' }} onClick={() => remove(en)}>Xoá</button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
