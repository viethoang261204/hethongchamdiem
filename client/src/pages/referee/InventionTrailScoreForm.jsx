import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { exportToPdf } from './exportPdf';
import './InventionTrailScoreForm.css';

const TASKS = [
  { id: 'compass',     name: 'La bàn',              nameEn: 'Compass',               maxScore: 50,  description: 'Hình chiếu thẳng đứng của kim đô thăng hàng với miếng màu vàng bên dưới.' },
  { id: 'papermaking', name: 'Làm giấy',             nameEn: 'Papermaking',           maxScore: 60,  description: 'Tờ giấy rời hoàn toàn khỏi bảng trên và nằm trên bảng dưới.' },
  { id: 'gunpower',    name: 'Thuốc súng',           nameEn: 'Gunpower',              maxScore: 40,  description: 'Viên đạn rời hoàn toàn vào khung vuông và chạm vào mặt đáy.' },
  { id: 'printing',    name: 'In chữ rời',           nameEn: 'Movable-Type printing', maxScore: 40,  maxScoreNote: '40/lượt', description: 'Khối chữ được đặt vào vị trí nam châm và cả hai nam châm đều hút chặt.' },
  { id: 'seismoscope', name: 'Máy đo địa chấn',      nameEn: 'Seismoscope',           maxScore: 40,  description: 'Viên bi thép rơi vào khung bao quanh phía dưới (không chạm vào mặt đáy hoặc mặt sàn).' },
  { id: 'pyramid',     name: 'Kim tự tháp',          nameEn: 'Pyramid',               maxScore: 60,  description: 'Kim tự tháp được đặt trên bệ thứ hai và đáy chỉ chạm bệ này.' },
  { id: 'greatwall',   name: 'Vạn lý trường thành',  nameEn: 'GreatWall',             maxScore: 60,  description: 'Vật liệu xây dựng được đặt lên trên Vạn Lý Trường Thành và chỉ chạm vào mô hình này.' },
  { id: 'bonus_task',  name: 'Nhiệm vụ thưởng',      nameEn: 'Bonus task',            maxScore: 100, description: 'Được thông báo ngay trong cuộc thi đấu.' },
];

export default function InventionTrailScoreForm({ team, content, competitionId, contentId, region, memberNames }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert } = useNotify();

  const [round, setRound] = useState('');
  const [bangThi, setBangThi] = useState('');
  const [taskScores, setTaskScores] = useState(
    Object.fromEntries(TASKS.map(t => [t.id, '']))
  );
  const [rerunCount, setRerunCount] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [teamMembers, setTeamMembers] = useState('');

  useEffect(() => {
    if (memberNames) setTeamMembers(memberNames);
  }, [memberNames]);
  const [refereeSignature, setRefereeSignature] = useState(user?.fullName || user?.username || '');
  const [chiefReferee, setChiefReferee] = useState('');
  const [scorekeeper, setScorekeeper] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const sheetRef = useRef(null);

  const extraReward = (() => {
    const r = parseInt(rerunCount, 10);
    if (isNaN(r) || r <= 0) return 0;
    return Math.max(0, 40 - 10 * r);
  })();

  const totalScore = TASKS.reduce((sum, t) => {
    const v = parseFloat(taskScores[t.id]);
    return sum + (isNaN(v) ? 0 : v);
  }, 0) + extraReward;

  const handleTaskScore = (id, val) => {
    setTaskScores(prev => ({ ...prev, [id]: val }));
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const teamName = (team?.name || 'phieu').replace(/\s+/g, '-').toLowerCase();
      await exportToPdf(sheetRef, `phieu-cham-diem-invention-trail-${teamName}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!timeSpent) {
      showAlert('Vui lòng nhập Thời gian hoàn thành.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.postScore({
        teamId: team.id,
        contestContentId: contentId,
        refereeId: user?.id,
        time: timeSpent,
        score: totalScore,
        round: round ? parseInt(round) : 1,
        extraFields: {
          bangThi,
          taskScores,
          rerunCount: rerunCount || '0',
          extraReward,
          teamMembers,
          chiefReferee,
          scorekeeper,
          remarks,
        },
        studentSignature: teamMembers,
        refereeSignature: refereeSignature || user?.fullName || user?.username,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate(`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`);
      }, 2000);
    } catch (err) {
      showAlert(err.message || 'Gửi điểm thất bại', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const backUrl = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`;

  if (success) {
    return (
      <div className="it-success">
        <div className="it-success-icon">✓</div>
        <strong>Gửi điểm thành công!</strong>
        <p>Đang quay lại danh sách đội...</p>
      </div>
    );
  }

  return (
    <div className="it-wrapper">
      {/* ── Toolbar (không in) ── */}
      <div className="it-toolbar no-print">
        <a href={backUrl} className="btn-ghost">← Quay lại danh sách đội</a>
        <div className="it-toolbar-right">
          <button type="button" className="it-btn-print" onClick={handleExportPdf} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {exporting ? 'Đang xuất...' : 'Tải PDF'}
          </button>
        </div>
      </div>

      {/* ── Phiếu chấm điểm ── */}
      <form onSubmit={handleSubmit}>
        <div className="it-sheet" ref={sheetRef}>

          {/* Header */}
          <div className="it-header">
            <div className="it-header-title">
              <div className="it-title-main">PHIẾU CHẤM ĐIỂM</div>
              <div className="it-title-sub">Scoring Sheet of Inventions Trail</div>
            </div>
            <div className="it-header-round">
              Lượt thi
              <input
                className="it-inline-input"
                value={round}
                onChange={e => setRound(e.target.value)}
                placeholder="___"
                style={{ width: 48 }}
              />
            </div>
          </div>

          {/* Info row */}
          <table className="it-info-table">
            <tbody>
              <tr>
                <td className="it-info-label">STT</td>
                <td className="it-info-value" style={{ flex: 1 }}></td>
                <td className="it-info-label">Đội</td>
                <td className="it-info-value" style={{ flex: 2, fontWeight: 700 }}>{team?.name}</td>
                <td className="it-info-label">Bảng thi</td>
                <td className="it-info-value">
                  <input
                    className="it-inline-input"
                    value={bangThi}
                    onChange={e => setBangThi(e.target.value)}
                    placeholder="..."
                    style={{ width: 80 }}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Phụ lục */}
          <div className="it-phu-luc">Phụ lục: <span className="it-phu-luc-line"></span></div>

          {/* Score table */}
          <table className="it-score-table">
            <thead>
              <tr>
                <th className="it-col-task">Nhiệm vụ</th>
                <th className="it-col-desc">Mô tả nhiệm vụ</th>
                <th className="it-col-max">Điểm tối đa</th>
                <th className="it-col-stt">STT</th>
                <th className="it-col-achieved">Điểm đạt</th>
              </tr>
            </thead>
            <tbody>
              {TASKS.map((task, idx) => (
                <tr key={task.id}>
                  <td className="it-task-name">
                    <div>{task.name}</div>
                    <div className="it-task-name-en">({task.nameEn})</div>
                  </td>
                  <td className="it-task-desc">{task.description}</td>
                  <td className="it-task-max">{task.maxScoreNote || task.maxScore}</td>
                  <td className="it-task-stt">{idx + 1}</td>
                  <td className="it-task-achieved">
                    <input
                      type="number"
                      className="it-score-input"
                      min={0}
                      max={task.maxScore * 10}
                      value={taskScores[task.id]}
                      onChange={e => handleTaskScore(task.id, e.target.value)}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}

              {/* Extra reward */}
              <tr className="it-row-extra">
                <td className="it-task-name">
                  <div>Điểm thưởng</div>
                  <div className="it-task-name-en">(Extra reward)</div>
                </td>
                <td className="it-task-desc">
                  40 – 10 × Số lần Chạy lại (&gt; 0)
                  <div style={{ marginTop: 4 }} className="no-print">
                    <span style={{ fontSize: 12, color: '#64748b' }}>Số lần chạy lại: </span>
                    <input
                      type="number"
                      min={0}
                      value={rerunCount}
                      onChange={e => setRerunCount(e.target.value)}
                      className="it-score-input"
                      style={{ width: 60 }}
                      placeholder="0"
                    />
                  </div>
                  <div className="print-only" style={{ fontSize: 12 }}>
                    Số lần chạy lại: {rerunCount || '___'}
                  </div>
                </td>
                <td className="it-task-max"></td>
                <td className="it-task-stt"></td>
                <td className="it-task-achieved">
                  <span className="it-computed">{extraReward > 0 ? extraReward : ''}</span>
                </td>
              </tr>

              {/* Total */}
              <tr className="it-row-total">
                <td colSpan={3} className="it-total-label">Tổng điểm (Total Score)</td>
                <td></td>
                <td className="it-total-value">{totalScore > 0 ? totalScore : ''}</td>
              </tr>

              {/* Time */}
              <tr className="it-row-time">
                <td colSpan={3} className="it-total-label">Thời gian (Time Spent)</td>
                <td></td>
                <td className="it-total-value">
                  <input
                    type="text"
                    className="it-score-input"
                    value={timeSpent}
                    onChange={e => setTimeSpent(e.target.value)}
                    placeholder="mm:ss"
                    required
                    style={{ width: '100%' }}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Xác nhận điểm */}
          <div className="it-confirm-section">
            <div className="it-confirm-title">Xác nhận điểm (Score Confirmation)</div>
            <div className="it-confirm-text">
              Tôi xác nhận rằng các điểm số ghi trên là chính xác, hợp lệ và phản ánh đúng kết quả của trận đấu.<br/>
              Tôi không có ý kiến thắc mắc. <em>(I hereby confirm that the scores recorded above are accurate, valid, and reflect the true results of the match. I have no objections.)</em>
            </div>
            <table className="it-sign-table">
              <tbody>
                <tr>
                  <td className="it-sign-label">Thành viên đội thi (Team members):</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={teamMembers}
                      onChange={e => setTeamMembers(e.target.value)}
                      placeholder="Tên thành viên..."
                    />
                  </td>
                  <td className="it-sign-label">Trọng tài (Referee):</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={refereeSignature}
                      onChange={e => setRefereeSignature(e.target.value)}
                      placeholder="Tên trọng tài..."
                    />
                  </td>
                </tr>
                <tr>
                  <td className="it-sign-label">Ghi chú (Remarks)</td>
                  <td colSpan={3} className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="..."
                    />
                  </td>
                </tr>
                <tr>
                  <td className="it-sign-label">Trọng tài trưởng (Chief referee):</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={chiefReferee}
                      onChange={e => setChiefReferee(e.target.value)}
                      placeholder="..."
                    />
                  </td>
                  <td className="it-sign-label">Thư ký (Scorekeeper):</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={scorekeeper}
                      onChange={e => setScorekeeper(e.target.value)}
                      placeholder="..."
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Submit buttons */}
        <div className="it-actions no-print">
          <a href={backUrl} className="it-btn-cancel">Hủy</a>
          <button type="submit" className="it-btn-submit" disabled={submitting}>
            {submitting ? 'Đang gửi...' : 'Gửi điểm'}
          </button>
        </div>
      </form>
    </div>
  );
}
