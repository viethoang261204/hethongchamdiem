import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import { useApiLoader, LoaderFull, ErrorBox } from '../../hooks/useApiLoader.jsx';
import ScoreDetailView from '../shared/ScoreDetailView';
import './AdminLayout.css';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminScoreDetail() {
  const { scoreId } = useParams();
  const { showConfirm, showAlert } = useNotify();
  const [uploading, setUploading] = useState(false);
  const { data, loading, error, reload } = useApiLoader(async () => {
    const score = await api.getScore(scoreId);
    const imgs = await api.getScoreImages(scoreId);
    const edits = await api.getScoreEdits(scoreId).catch(() => []);
    const contentId = score?.contest_content_id || score?.team?.contest_content_id;
    let content = null;
    if (contentId) {
      try {
        const allContents = await api.getAllContents();
        content = allContents.find(x => x.id === contentId) || null;
      } catch (_) {}
    }
    return { score, content, images: imgs, edits };
  }, [scoreId]);
  const score = data?.score;
  const content = data?.content;
  const images = data?.images || [];
  const edits = data?.edits || [];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadScoreImage({ scoreId, file });
      showAlert('Đã tải ảnh lên.', 'success');
      reload();
    } catch (err) {
      showAlert(err.message || 'Lỗi upload.', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteImage = async (img) => {
    const ok = await showConfirm({ message: 'Xóa ảnh này?', confirmText: 'Xóa', cancelText: 'Hủy', danger: true });
    if (!ok) return;
    try {
      await api.deleteScoreImage(img.id, img.storage_path);
      showAlert('Đã xóa ảnh.', 'success');
      reload();
    } catch (err) {
      showAlert(err.message || 'Lỗi', 'error');
    }
  };

  if (loading) return <div className="nhutin-admin"><LoaderFull /></div>;
  if (error) return <div className="nhutin-admin"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!score) return <div className="nhutin-admin"><p>Không tìm thấy phiếu điểm.</p></div>;

  return (
    <div className="nhutin-admin">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Chi tiết phiếu điểm</h1>
          <p className="page-subtitle">
            {score.team?.name || '-'} · {content?.name || score.contest_content_id} · Nộp lúc {formatDate(score.submitted_at || score.submittedAt)}
          </p>
        </div>
      </div>

      <ScoreDetailView
        score={score}
        content={content}
        backLink={
          <Link to="/admin/scores" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← Quay lại danh sách
          </Link>
        }
      />

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 className="card-title">Ảnh đính kèm ({images.length})</h3>
          <label className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={handleUpload}
            />
            {uploading ? 'Đang tải lên...' : '+ Thêm ảnh'}
          </label>
        </div>

        {images.length === 0 ? (
          <div className="image-empty">Chưa có ảnh đính kèm. Tải lên ảnh chứng minh cho phiếu điểm (tối đa 5MB/ảnh).</div>
        ) : (
          <div className="image-grid">
            {images.map(img => (
              <div key={img.id} className="image-card">
                <a href={img.public_url} target="_blank" rel="noreferrer">
                  <img src={img.public_url} alt={img.file_name || ''} loading="lazy" />
                </a>
                <div className="image-overlay">
                  <button type="button" className="btn btn-danger" onClick={() => handleDeleteImage(img)}>Xóa</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ marginBottom: 16 }}>
          <h3 className="card-title">Lịch sử sửa điểm ({edits.length})</h3>
        </div>
        {edits.length === 0 ? (
          <p style={{ color: '#888' }}>Chưa có lần sửa nào.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Thời gian sửa</th>
                  <th>Người sửa</th>
                  <th>Lượt</th>
                  <th>Điểm (trước → sau)</th>
                  <th>Thời gian thi (trước → sau)</th>
                </tr>
              </thead>
              <tbody>
                {edits.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.edited_at)}</td>
                    <td>{e.users?.full_name || '-'}</td>
                    <td>{e.round || '-'}</td>
                    <td>{e.before_data?.score} → <strong>{e.after_data?.score}</strong></td>
                    <td>{e.before_data?.time || '-'} → <strong>{e.after_data?.time || '-'}</strong></td>
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
