import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useNotify } from '../../context/NotifyContext';
import { exportToPdf } from './exportPdf';
import './InventionTrailScoreForm.css';

const TASKS = [
  { id: 'compass',     name: 'Compass',               maxScore: 50,  description: "The compass needle's vertical projection aligns with the yellow marker below." },
  { id: 'papermaking', name: 'Papermaking',           maxScore: 60,  description: 'The sheet of paper fully separates from the upper board and rests on the lower board.' },
  { id: 'gunpower',    name: 'Gunpowder',             maxScore: 40,  description: 'The ball falls completely into the square frame and touches the bottom surface.' },
  { id: 'printing',    name: 'Movable-Type Printing', maxScore: 40,  maxScoreNote: '40/round', description: 'The type block is placed at the magnet position and both magnets hold it firmly.' },
  { id: 'seismoscope', name: 'Seismoscope',           maxScore: 40,  description: 'The steel ball falls into the surrounding frame below (without touching the bottom or the floor).' },
  { id: 'pyramid',     name: 'Pyramid',               maxScore: 60,  description: 'The pyramid is placed on the second platform, with its base touching only this platform.' },
  { id: 'greatwall',   name: 'Great Wall',            maxScore: 60,  description: 'The building material is placed on top of the Great Wall and touches only this model.' },
  { id: 'bonus_task',  name: 'Bonus Task',            maxScore: 100, description: 'Announced during the match.' },
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
      const teamName = (team?.name || 'sheet').replace(/\s+/g, '-').toLowerCase();
      await exportToPdf(sheetRef, `score-sheet-invention-trail-${teamName}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const timeSeconds = Number(timeSpent);
    if (!timeSpent || Number.isNaN(timeSeconds) || timeSeconds < 0) {
      showAlert('Please enter the completion time (in seconds).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.postScore({
        team_id: team.id,
        contest_content_id: contentId,
        referee_id: user?.id,
        time: String(Math.round(timeSeconds)),
        score: totalScore,
        // scores schema không có round/extraFields/studentSignature/refereeSignature
        // Lưu tất cả vào criteria_scores (jsonb) để giữ chi tiết
        criteria_scores: {
          taskScores,
          bangThi,
          rerunCount: rerunCount || '0',
          extraReward,
          teamMembers,
          chiefReferee,
          scorekeeper,
          remarks,
          refereeSignature: refereeSignature || user?.full_name || user?.username,
          studentSignature: teamMembers,
        },
        notes: remarks || null,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate(`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`);
      }, 2000);
    } catch (err) {
      showAlert(err.message || 'Failed to submit score', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const backUrl = `/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`;

  if (success) {
    return (
      <div className="it-success">
        <div className="it-success-icon">✓</div>
        <strong>Score submitted successfully!</strong>
        <p>Returning to the team list...</p>
      </div>
    );
  }

  return (
    <div className="it-wrapper">
      {/* ── Toolbar (không in) ── */}
      <div className="it-toolbar no-print">
        <a href={backUrl} className="btn-ghost">← Back to team list</a>
        <div className="it-toolbar-right">
          <button type="button" className="it-btn-print" onClick={handleExportPdf} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {exporting ? 'Exporting...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* ── Phiếu chấm điểm ── */}
      <form onSubmit={handleSubmit}>
        <div className="it-sheet" ref={sheetRef}>

          {/* Header */}
          <div className="it-header">
            <div className="it-header-title">
              <div className="it-title-main">SCORE SHEET</div>
              <div className="it-title-sub">Scoring Sheet of Inventions Trail</div>
            </div>
            <div className="it-header-round">
              Round
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
                <td className="it-info-label">No.</td>
                <td className="it-info-value" style={{ flex: 1 }}></td>
                <td className="it-info-label">Team</td>
                <td className="it-info-value" style={{ flex: 2, fontWeight: 700 }}>{team?.name}</td>
                <td className="it-info-label">Board</td>
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
          <div className="it-phu-luc">Appendix: <span className="it-phu-luc-line"></span></div>

          {/* Score table */}
          <table className="it-score-table">
            <thead>
              <tr>
                <th className="it-col-task">Task</th>
                <th className="it-col-desc">Task Description</th>
                <th className="it-col-max">Max Score</th>
                <th className="it-col-stt">No.</th>
                <th className="it-col-achieved">Score Achieved</th>
              </tr>
            </thead>
            <tbody>
              {TASKS.map((task, idx) => (
                <tr key={task.id}>
                  <td className="it-task-name">
                    <div>{task.name}</div>
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
                  <div>Bonus Points</div>
                </td>
                <td className="it-task-desc">
                  40 – 10 × Number of Reruns (&gt; 0)
                  <div style={{ marginTop: 4 }} className="no-print">
                    <span style={{ fontSize: 12, color: '#64748b' }}>Reruns: </span>
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
                    Reruns: {rerunCount || '___'}
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
                <td colSpan={3} className="it-total-label">Total Score</td>
                <td></td>
                <td className="it-total-value">{totalScore > 0 ? totalScore : ''}</td>
              </tr>

              {/* Time */}
              <tr className="it-row-time">
                <td colSpan={3} className="it-total-label">Time Spent</td>
                <td></td>
                <td className="it-total-value">
                  <input
                    type="number"
                    min={0}
                    className="it-score-input"
                    value={timeSpent}
                    onChange={e => setTimeSpent(e.target.value)}
                    placeholder="Seconds"
                    required
                    style={{ width: '100%' }}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Xác nhận điểm */}
          <div className="it-confirm-section">
            <div className="it-confirm-title">Score Confirmation</div>
            <div className="it-confirm-text">
              I hereby confirm that the scores recorded above are accurate, valid, and reflect the true results of the match. I have no objections.
            </div>
            <table className="it-sign-table">
              <tbody>
                <tr>
                  <td className="it-sign-label">Team Members:</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={teamMembers}
                      onChange={e => setTeamMembers(e.target.value)}
                      placeholder="Member names..."
                    />
                  </td>
                  <td className="it-sign-label">Referee:</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={refereeSignature}
                      onChange={e => setRefereeSignature(e.target.value)}
                      placeholder="Referee name..."
                    />
                  </td>
                </tr>
                <tr>
                  <td className="it-sign-label">Remarks</td>
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
                  <td className="it-sign-label">Chief Referee:</td>
                  <td className="it-sign-value">
                    <input
                      type="text"
                      className="it-sign-input"
                      value={chiefReferee}
                      onChange={e => setChiefReferee(e.target.value)}
                      placeholder="..."
                    />
                  </td>
                  <td className="it-sign-label">Scorekeeper:</td>
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
          <a href={backUrl} className="it-btn-cancel">Cancel</a>
          <button type="submit" className="it-btn-submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Score'}
          </button>
        </div>
      </form>
    </div>
  );
}
