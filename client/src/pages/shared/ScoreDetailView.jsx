import { useRef, useState, useEffect } from 'react';
import { api } from '../../api';
import { exportToPdf } from '../referee/exportPdf';
import { formatSecondsAsMinutes } from '../../lib/time';
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

function getScoreDetails(score) {
  // Tất cả thông tin mở rộng (extraFields, signatures, taskScores, ...) lưu trong criteria_scores (jsonb)
  // vì bảng scores không có các cột camelCase này.
  // Hỗ trợ cả 2 format để tương thích ngược với dữ liệu cũ.
  return {
    ef: score?.criteria_scores || score?.extraFields || {},
    signatures: {
      team: score?.criteria_scores?.studentSignature || score?.studentSignature || '',
      referee: score?.criteria_scores?.refereeSignature || score?.refereeSignature || '',
    },
  };
}

function InventionTrailSheet({ score, sheetRef }) {
  const { ef } = getScoreDetails(score);
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
            <td className="it-total-value"><strong>{formatSecondsAsMinutes(score.time)}</strong></td>
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
              <td className="it-sign-value">
                <strong>{ef.teamMembers || score.studentSignature || ''}</strong>
                {ef.studentSignatureImage && (
                  <div><img src={ef.studentSignatureImage} alt="Chữ ký học sinh" style={{ maxHeight: 60, maxWidth: '100%' }} /></div>
                )}
              </td>
              <td className="it-sign-label">Trọng tài (Referee):</td>
              <td className="it-sign-value">
                <strong>{score.refereeSignature || ''}</strong>
                {ef.refereeSignatureImage && (
                  <div><img src={ef.refereeSignatureImage} alt="Chữ ký trọng tài" style={{ maxHeight: 60, maxWidth: '100%' }} /></div>
                )}
              </td>
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

// Score Sheet cho các phiếu chấm bằng TaskScoringWizard (đa số phiếu hiện nay) —
// theo đúng mẫu "Phiếu điểm Mẫu.docx": 1 phiếu gộp cả 2 lượt (round 1 + round 2)
// cạnh nhau, đọc lại từng nhiệm vụ từ bảng tasks (nếu nhiệm vụ đã bị xóa thì
// vẫn hiện điểm, chỉ mất tên/mô tả).
function TaskWizardSheet({ scores, content, sheetRef }) {
  const [tasks, setTasks] = useState([]);
  const round1 = scores.find((s) => s.round === 1) || null;
  const round2 = scores.find((s) => s.round === 2) || null;
  const team = round1?.team || round2?.team;
  const contentId = round1?.contest_content_id || round2?.contest_content_id || content?.id;

  useEffect(() => {
    if (!contentId) return;
    api.getTasks(contentId).then(setTasks).catch(() => setTasks([]));
  }, [contentId]);

  const cs1 = round1?.criteria_scores || {};
  const cs2 = round2?.criteria_scores || {};

  const rows = tasks
    .slice()
    .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999))
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      maxScore: t.max_score,
      round1Points: cs1.taskScores?.[t.id],
      round2Points: cs2.taskScores?.[t.id],
    }));

  const totalMaxScore = tasks.reduce((sum, t) => sum + (Number(t.max_score) || 0), 0);

  const bonus1 = Number(round1?.bonus_points ?? cs1.extraReward) || 0;
  const bonus2 = Number(round2?.bonus_points ?? cs2.extraReward) || 0;
  const retry1 = round1?.retry_count ?? cs1.rerunCount ?? 0;
  const retry2 = round2?.retry_count ?? cs2.rerunCount ?? 0;

  const contestantName = cs2.teamMembers || cs1.teamMembers || '';

  const headReferee = round2?.head_referee_name || round1?.head_referee_name || 'Mr Ly Quang Van';
  const scorekeeper = round2?.scorekeeper_name || round1?.scorekeeper_name || '';

  const recommendation = [
    round1?.objection ? `Round 1: ${round1.objection}` : '',
    round2?.objection ? `Round 2: ${round2.objection}` : '',
  ].filter(Boolean).join(' — ');

  return (
    <table className="ss-sheet" ref={sheetRef}>
      <tbody>
        <tr><td colSpan={7} className="ss-title">Score Sheet: {content?.name || ''}</td></tr>

        <tr>
          <td colSpan={4}><span className="ss-label">Team name:</span> {team?.name || ''}</td>
          <td colSpan={3}>
            <div><span className="ss-label">Field:</span> {team?.fields?.name || ''}</div>
            <div><span className="ss-label">No.:</span> {team?.order_index != null ? team.order_index + 1 : ''}</div>
          </td>
        </tr>

        <tr>
          <td colSpan={4}><span className="ss-label">Contestant name:</span> {contestantName}</td>
          <td colSpan={3}>
            <div className="ss-label">Time entering the field:</div>
            <div>Round 1: {round1?.arena_entry_time || ''}</div>
            <div>Round 2: {round2?.arena_entry_time || ''}</div>
          </td>
        </tr>

        <tr className="ss-header-row">
          <th>Task</th>
          <th colSpan={3}>Description</th>
          <th className="ss-center">Max score</th>
          <th className="ss-center">Round 1 score</th>
          <th className="ss-center">Round 2 score</th>
        </tr>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="ss-label">{r.name}</td>
            <td colSpan={3}>{r.description}</td>
            <td className="ss-center">{r.maxScore}</td>
            <td className="ss-center"><strong>{r.round1Points ?? ''}</strong></td>
            <td className="ss-center"><strong>{r.round2Points ?? ''}</strong></td>
          </tr>
        ))}
        <tr className="ss-row-extra">
          <td className="ss-label">Extra reward</td>
          <td colSpan={3}>
            40 &minus; 10 &times; Number of retries (&gt;0)
            <div className="ss-small">Retries — Round 1: <strong>{retry1}</strong> · Round 2: <strong>{retry2}</strong></div>
          </td>
          <td></td>
          <td className="ss-center"><strong>{bonus1}</strong></td>
          <td className="ss-center"><strong>{bonus2}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Total score</td>
          <td colSpan={3}></td>
          <td className="ss-center"><strong>{totalMaxScore}</strong></td>
          <td className="ss-center"><strong>{round1?.score ?? ''}</strong></td>
          <td className="ss-center"><strong>{round2?.score ?? ''}</strong></td>
        </tr>
        <tr className="ss-row-total">
          <td className="ss-label">Time spent</td>
          <td colSpan={3}></td>
          <td></td>
          <td className="ss-center"><strong>{round1 ? formatSecondsAsMinutes(round1.time) : ''}</strong></td>
          <td className="ss-center"><strong>{round2 ? formatSecondsAsMinutes(round2.time) : ''}</strong></td>
        </tr>

        <tr><td colSpan={7} className="ss-section">Scoring confirmation</td></tr>
        <tr><td colSpan={7} className="ss-confirm-text">I hereby confirm that the scores above are correct and valid, with no objection.</td></tr>
        <tr>
          <td colSpan={2}>
            <div className="ss-label">Team's confirmation</div>
            <div>
              Round 1: <strong>{cs1.teamMembers || ''}</strong>
              {cs1.studentSignatureImage && <div><img src={cs1.studentSignatureImage} alt="Team signature — round 1" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              Round 2: <strong>{cs2.teamMembers || ''}</strong>
              {cs2.studentSignatureImage && <div><img src={cs2.studentSignatureImage} alt="Team signature — round 2" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
          <td colSpan={5}>
            <div className="ss-label">Referee's confirmation</div>
            <div>
              Round 1: <strong>{cs1.refereeSignature || ''}</strong>
              {cs1.refereeSignatureImage && <div><img src={cs1.refereeSignatureImage} alt="Referee signature — round 1" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
            <div>
              Round 2: <strong>{cs2.refereeSignature || ''}</strong>
              {cs2.refereeSignatureImage && <div><img src={cs2.refereeSignatureImage} alt="Referee signature — round 2" style={{ maxHeight: 50, maxWidth: '100%' }} /></div>}
            </div>
          </td>
        </tr>

        <tr>
          <td className="ss-label">Recommendation</td>
          <td colSpan={6}>{recommendation}</td>
        </tr>
        <tr>
          <td className="ss-label">Head Referee</td>
          <td colSpan={2}>{headReferee}</td>
          <td className="ss-label">Scorekeeper</td>
          <td colSpan={3}>{scorekeeper}</td>
        </tr>
      </tbody>
    </table>
  );
}

function GenericSheet({ score, content, sheetRef }) {
  const { ef, signatures } = getScoreDetails(score);
  const fields = content?.scoreSheetTemplate?.fields || [
    { id: 'thoi_gian', label: 'Thời gian' },
    { id: 'diem', label: 'Điểm' },
  ];
  const getValue = (field) => {
    if (field.id === 'thoi_gian') return formatSecondsAsMinutes(score.time);
    if (field.id === 'diem') return score.score;
    // Đọc từ criteria_scores trước, fallback extraFields cũ
    return score.criteria_scores?.[field.id] ?? score.extraFields?.[field.id];
  };

  return (
    <div ref={sheetRef} style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', maxWidth: 560 }}>
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
          {score.team?.name || 'Đội'} · {content?.name || score.contest_content_id}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Nộp lúc {score.submitted_at ? new Date(score.submitted_at).toLocaleString('vi-VN') : '-'}
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
            <td style={{ padding: '10px 8px', color: '#1e293b', fontSize: 13 }}>
              {signatures.team || '-'}
              {ef.studentSignatureImage && (
                <div><img src={ef.studentSignatureImage} alt="Chữ ký học sinh" style={{ maxHeight: 60, maxWidth: '100%' }} /></div>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '10px 8px', fontWeight: 600, color: '#475569', fontSize: 13 }}>Trọng tài ký</td>
            <td style={{ padding: '10px 8px', color: '#1e293b', fontSize: 13 }}>
              {signatures.referee || '-'}
              {ef.refereeSignatureImage && (
                <div><img src={ef.refereeSignatureImage} alt="Chữ ký trọng tài" style={{ maxHeight: 60, maxWidth: '100%' }} /></div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dùng chung cho cả Admin và Referee.
 * Props:
 *   score    — object điểm đã fetch (lượt hiện tại — dùng cho backLink/slug/legacy sheets)
 *   scores   — mảng tất cả lượt (round 1 + round 2) của cùng đội/nội dung, dùng để
 *              gộp cả 2 lượt lên 1 Score Sheet theo mẫu "Phiếu điểm Mẫu.docx".
 *              Nếu không truyền, mặc định chỉ có [score].
 *   content  — object nội dung thi (có templateType, scoreSheetTemplate)
 *   backLink — element nút quay lại (Link hoặc button)
 */
export default function ScoreDetailView({ score, scores, content, backLink }) {
  const sheetRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const allScores = scores && scores.length ? scores : (score ? [score] : []);
  const isInventionTrail = content?.templateType === 'invention_trail';
  const isTaskWizard = !isInventionTrail && allScores.some((s) => s?.criteria_scores?.taskScores);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const teamName = (score?.team?.name || 'phieu').replace(/\s+/g, '-').toLowerCase();
      const slug = isInventionTrail ? 'invention-trail' : 'score-sheet';
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
        : isTaskWizard
          ? <TaskWizardSheet scores={allScores} content={content} sheetRef={sheetRef} />
          : <GenericSheet score={score} content={content} sheetRef={sheetRef} />
      }
    </div>
  );
}
