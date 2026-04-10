import { useRef, useState } from 'react';
import { exportToPdf } from '../referee/exportPdf';
import '../referee/InventionTrailScoreForm.css';

const IT_TASKS = [
  { id: 'compass',     name: 'La bàn',              nameEn: 'Compass',               maxScore: 50  },
  { id: 'papermaking', name: 'Làm giấy',             nameEn: 'Papermaking',           maxScore: 60  },
  { id: 'gunpower',    name: 'Thuốc súng',           nameEn: 'Gunpower',              maxScore: 40  },
  { id: 'printing',    name: 'In chữ rời',           nameEn: 'Movable-Type printing', maxScore: 40, maxScoreNote: '40/lượt' },
  { id: 'seismoscope', name: 'Máy đo địa chấn',      nameEn: 'Seismoscope',           maxScore: 40  },
  { id: 'pyramid',     name: 'Kim tự tháp',          nameEn: 'Pyramid',               maxScore: 60  },
  { id: 'greatwall',   name: 'Vạn lý trường thành',  nameEn: 'GreatWall',             maxScore: 60  },
  { id: 'bonus_task',  name: 'Nhiệm vụ thưởng',      nameEn: 'Bonus task',            maxScore: 100 },
];

const IT_TASK_DESCS = {
  compass:     'Hình chiếu thẳng đứng của kim đô thăng hàng với miếng màu vàng bên dưới.',
  papermaking: 'Tờ giấy rời hoàn toàn khỏi bảng trên và nằm trên bảng dưới.',
  gunpower:    'Viên đạn rời hoàn toàn vào khung vuông và chạm vào mặt đáy.',
  printing:    'Khối chữ được đặt vào vị trí nam châm và cả hai nam châm đều hút chặt.',
  seismoscope: 'Viên bi thép rơi vào khung bao quanh phía dưới (không chạm vào mặt đáy hoặc mặt sàn).',
  pyramid:     'Kim tự tháp được đặt trên bệ thứ hai và đáy chỉ chạm bệ này.',
  greatwall:   'Vật liệu xây dựng được đặt lên trên Vạn Lý Trường Thành và chỉ chạm vào mô hình này.',
  bonus_task:  'Được thông báo ngay trong cuộc thi đấu.',
};

function InventionTrailSheet({ score, sheetRef }) {
  const ef = score.extraFields || {};
  const taskScores = ef.taskScores || {};
  const extraReward = Number(ef.extraReward) || 0;

  return (
    <div className="it-sheet" ref={sheetRef}>
      <div className="it-header">
        <div className="it-header-title">
          <div className="it-title-main">PHIẾU CHẤM ĐIỂM</div>
          <div className="it-title-sub">Scoring Sheet of Inventions Trail</div>
        </div>
        <div className="it-header-round">
          Lượt thi <strong>{score.round || '___'}</strong>
        </div>
      </div>

      <table className="it-info-table">
        <tbody>
          <tr>
            <td className="it-info-label">STT</td>
            <td className="it-info-value" style={{ flex: 1 }}></td>
            <td className="it-info-label">Đội</td>
            <td className="it-info-value" style={{ flex: 2, fontWeight: 700 }}>{score.team?.name || '-'}</td>
            <td className="it-info-label">Bảng thi</td>
            <td className="it-info-value"><strong>{ef.bangThi || '___'}</strong></td>
          </tr>
        </tbody>
      </table>

      <div className="it-phu-luc">Phụ lục: <span className="it-phu-luc-line"></span></div>

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
          {IT_TASKS.map((task, idx) => (
            <tr key={task.id}>
              <td className="it-task-name">
                <div>{task.name}</div>
                <div className="it-task-name-en">({task.nameEn})</div>
              </td>
              <td className="it-task-desc">{IT_TASK_DESCS[task.id]}</td>
              <td className="it-task-max">{task.maxScoreNote || task.maxScore}</td>
              <td className="it-task-stt">{idx + 1}</td>
              <td className="it-task-achieved">
                <strong>{taskScores[task.id] !== '' && taskScores[task.id] !== undefined ? taskScores[task.id] : ''}</strong>
              </td>
            </tr>
          ))}
          <tr className="it-row-extra">
            <td className="it-task-name">
              <div>Điểm thưởng</div>
              <div className="it-task-name-en">(Extra reward)</div>
            </td>
            <td className="it-task-desc">
              40 – 10 × Số lần Chạy lại (&gt; 0)
              <div style={{ fontSize: 12, marginTop: 3 }}>Số lần chạy lại: <strong>{ef.rerunCount || '0'}</strong></div>
            </td>
            <td className="it-task-max"></td>
            <td className="it-task-stt"></td>
            <td className="it-task-achieved"><strong>{extraReward > 0 ? extraReward : ''}</strong></td>
          </tr>
          <tr className="it-row-total">
            <td colSpan={3} className="it-total-label">Tổng điểm (Total Score)</td>
            <td></td>
            <td className="it-total-value"><strong>{score.score ?? ''}</strong></td>
          </tr>
          <tr className="it-row-time">
            <td colSpan={3} className="it-total-label">Thời gian (Time Spent)</td>
            <td></td>
            <td className="it-total-value"><strong>{score.time || ''}</strong></td>
          </tr>
        </tbody>
      </table>

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
              <td className="it-sign-value"><strong>{ef.teamMembers || score.studentSignature || ''}</strong></td>
              <td className="it-sign-label">Trọng tài (Referee):</td>
              <td className="it-sign-value"><strong>{score.refereeSignature || ''}</strong></td>
            </tr>
            <tr>
              <td className="it-sign-label">Ghi chú (Remarks)</td>
              <td colSpan={3} className="it-sign-value">{ef.remarks || ''}</td>
            </tr>
            <tr>
              <td className="it-sign-label">Trọng tài trưởng (Chief referee):</td>
              <td className="it-sign-value">{ef.chiefReferee || ''}</td>
              <td className="it-sign-label">Thư ký (Scorekeeper):</td>
              <td className="it-sign-value">{ef.scorekeeper || ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GenericSheet({ score, content, sheetRef }) {
  const fields = content?.scoreSheetTemplate?.fields || [
    { id: 'thoi_gian', label: 'Thời gian' },
    { id: 'diem', label: 'Điểm' },
  ];
  const getValue = (field) => {
    if (field.id === 'thoi_gian') return score.time;
    if (field.id === 'diem') return score.score;
    return score.extraFields?.[field.id];
  };

  return (
    <div ref={sheetRef} style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', maxWidth: 560 }}>
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
          {score.team?.name || 'Đội'} · {content?.name || score.contestContentId}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Lượt thi: {score.round || '-'} · Nộp lúc {score.submittedAt ? new Date(score.submittedAt).toLocaleString('vi-VN') : '-'}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {fields.map(f => (
            <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '10px 8px', fontWeight: 600, color: '#475569', fontSize: 13, width: '40%' }}>{f.label}</td>
              <td style={{ padding: '10px 8px', color: '#1e293b', fontSize: 13, fontWeight: 700 }}>
                {typeof getValue(f) === 'boolean' ? (getValue(f) ? 'Có' : 'Không') : (getValue(f) ?? '-')}
              </td>
            </tr>
          ))}
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '10px 8px', fontWeight: 600, color: '#475569', fontSize: 13 }}>Học sinh ký</td>
            <td style={{ padding: '10px 8px', color: '#1e293b', fontSize: 13 }}>{score.studentSignature || '-'}</td>
          </tr>
          <tr>
            <td style={{ padding: '10px 8px', fontWeight: 600, color: '#475569', fontSize: 13 }}>Trọng tài ký</td>
            <td style={{ padding: '10px 8px', color: '#1e293b', fontSize: 13 }}>{score.refereeSignature || '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dùng chung cho cả Admin và Referee.
 * Props:
 *   score    — object điểm đã fetch
 *   content  — object nội dung thi (có templateType, scoreSheetTemplate)
 *   backLink — element nút quay lại (Link hoặc button)
 */
export default function ScoreDetailView({ score, content, backLink }) {
  const sheetRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const isInventionTrail = content?.templateType === 'invention_trail';

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const teamName = (score?.team?.name || 'phieu').replace(/\s+/g, '-').toLowerCase();
      const slug = isInventionTrail ? 'invention-trail' : 'phieu-cham-diem';
      await exportToPdf(sheetRef, `${slug}-${teamName}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        {backLink}
        <button type="button" className="it-btn-print" onClick={handleExportPdf} disabled={exporting}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {exporting ? 'Đang xuất...' : 'Tải PDF'}
        </button>
      </div>

      {isInventionTrail
        ? <InventionTrailSheet score={score} sheetRef={sheetRef} />
        : <GenericSheet score={score} content={content} sheetRef={sheetRef} />
      }
    </div>
  );
}
