import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import './RefereeLayout.css';

export default function RefereeScoreForm() {
  const { competitionId, contentId, region, teamId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert } = useNotify();
  const [team, setTeam] = useState(null);
  const [content, setContent] = useState(null);
  const [existing, setExisting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ time: '', score: '', extraFields: {} });
  const [signatures, setSignatures] = useState({ studentSignature: '', refereeSignature: '' });

  useEffect(() => {
    Promise.all([
      api.getContents(competitionId).then(list => list.find(c => c.id === contentId)),
      api.getTeams(contentId).then(list => list.find(t => t.id === teamId)),
      api.getTeamScores(teamId),
    ]).then(([contentData, teamData, scores]) => {
      setContent(contentData);
      setTeam(teamData);
      setExisting(scores);
    }).catch(console.error).finally(() => setLoading(false));
  }, [competitionId, contentId, teamId]);

  const fields = content?.scoreSheetTemplate?.fields || [
    { id: 'thoi_gian', label: 'Thời gian', type: 'time', required: true },
    { id: 'diem', label: 'Điểm', type: 'number', required: true },
  ];

  const updateForm = (key, value) => {
    if (key === 'thoi_gian' || key === 'time') setForm(f => ({ ...f, time: value }));
    else if (key === 'diem' || key === 'score') setForm(f => ({ ...f, score: value }));
    else setForm(f => ({ ...f, extraFields: { ...f.extraFields, [key]: value } }));
  };

  const getFormValue = (field) => {
    if (field.id === 'thoi_gian') return form.time;
    if (field.id === 'diem') return form.score;
    return form.extraFields[field.id];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const time = form.time || form.extraFields?.thoi_gian;
    const score = form.score || form.extraFields?.diem;
    if (!time || score === '' || score === undefined) {
      showAlert('Vui lòng nhập đầy đủ Thời gian và Điểm (2 mục bắt buộc).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.postScore({
        teamId,
        contestContentId: contentId,
        refereeId: user?.id,
        time: String(time),
        score: Number(score),
        extraFields: form.extraFields,
        studentSignature: signatures.studentSignature,
        refereeSignature: signatures.refereeSignature || user?.fullName || user?.username,
        round: 1,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate(`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`);
      }, 1500);
    } catch (err) {
      showAlert(err.message || 'Gửi điểm thất bại', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const backUrl = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`;

  if (loading) return <p className="page-title">Đang tải...</p>;

  return (
    <div>
      <a href={backUrl} className="btn-ghost" style={{ display: 'inline-block', marginBottom: 16 }}>
        ← Quay lại danh sách đội
      </a>

      {success ? (
        <div className="score-form-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <strong style={{ color: '#059669', fontSize: 16 }}>Gửi điểm thành công!</strong>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>Đang quay lại danh sách đội...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="score-form-card">
          <div className="score-form-header">
            <h1 className="score-form-title">Phiếu chấm điểm – {team?.name}</h1>
          </div>
          <div className="score-form-body">
            <div className="score-form-section">
              <div className="score-section-title">Thông tin điểm</div>
              {fields.map((field) => (
                <div key={field.id} className="form-group">
                  <label className="form-label">
                    {field.label}
                    {field.required && <span className="required"> *</span>}
                  </label>
                  {field.type === 'time' && (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: 00:05:32 (giờ:phút:giây)"
                      value={getFormValue(field) || ''}
                      onChange={(e) => updateForm(field.id, e.target.value)}
                      required={field.required}
                    />
                  )}
                  {field.type === 'number' && (
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Nhập điểm"
                      value={getFormValue(field) ?? ''}
                      onChange={(e) => updateForm(field.id, e.target.value)}
                      required={field.required}
                    />
                  )}
                  {field.type === 'text' && (
                    <input
                      type="text"
                      className="form-input"
                      value={getFormValue(field) || ''}
                      onChange={(e) => updateForm(field.id, e.target.value)}
                      required={field.required}
                    />
                  )}
                  {field.type === 'boolean' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!getFormValue(field)}
                        onChange={(e) => updateForm(field.id, e.target.checked)}
                      />
                      <span>{field.label}</span>
                    </label>
                  )}
                </div>
              ))}
            </div>

            <div className="score-form-section">
              <div className="score-section-title">Xác nhận</div>
              <p className="form-note">Sau khi chấm, cho học sinh xem và ký xác nhận.</p>
              <div className="form-group">
                <label className="form-label">Học sinh ký</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Tên học sinh xác nhận"
                  value={signatures.studentSignature}
                  onChange={(e) => setSignatures(s => ({ ...s, studentSignature: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Trọng tài ký</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Tên trọng tài"
                  value={signatures.refereeSignature || user?.fullName || ''}
                  onChange={(e) => setSignatures(s => ({ ...s, refereeSignature: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-actions">
              <a href={backUrl} className="btn btn-secondary">Hủy</a>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Đang gửi...' : 'Gửi điểm'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
