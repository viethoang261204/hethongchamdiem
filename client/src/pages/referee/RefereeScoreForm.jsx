import { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi } from '../../apiCache';
import TaskScoringWizard from './TaskScoringWizard';
import InventionTrailScoreForm from './InventionTrailScoreForm';
import './RefereeLayout.css';

const capi = createCachedApi(api);

export default function RefereeScoreForm() {
  const { competitionId, contentId, teamId, region, roundNo } = useParams();
  const round = Number(roundNo) === 2 ? 2 : 1;
  const location = useLocation();
  // memberNames được truyền từ RefereeTeams qua navigation state — tránh gọi getStudents() lại
  const [team, setTeam] = useState(null);
  const [content, setContent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [memberNames, setMemberNames] = useState(location.state?.memberNames || '');
  const [existing, setExisting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    Promise.all([
      capi.getContents(competitionId).then(list => list.find(c => c.id === contentId)),
      capi.getTeams(contentId).then(list => list.find(t => t.id === teamId)),
      capi.getActiveTasks(contentId).catch(() => []),
      api.getTeamScores(teamId).catch(() => []),
    ]).then(([contentData, teamData, tasksData, scores]) => {
      if (!contentData || !teamData) {
        setNotFound(true);
        return;
      }
      setContent(contentData);
      setTeam(teamData);
      setTasks(tasksData);
      setExisting(scores);
      // Nếu chưa có memberNames từ navigation state, fetch students lần này thôi
      if (!location.state?.memberNames && teamData?.student_ids?.length) {
        capi.getStudents().then(students => {
          const names = teamData.student_ids
            .map(id => students.find(s => s.id === id))
            .filter(Boolean)
            .map(s => s.full_name)
            .join(', ');
          setMemberNames(names);
        }).catch(() => {});
      }
    }).catch((e) => {
      console.error(e);
      setNotFound(true);
    }).finally(() => setLoading(false));
  }, [competitionId, contentId, teamId]);

  if (loading) return (
    <div className="ts-wrapper ts-center-screen">
      <div className="ts-loading">
        <div className="ts-spinner" />
        <p>Đang tải phiếu chấm...</p>
      </div>
    </div>
  );

  if (notFound) return (
    <div className="ts-wrapper ts-center-screen">
      <div className="ts-card ts-gate-card">
        <p style={{ color: '#f87171' }}>Không tìm thấy đội hoặc nội dung thi.</p>
        <a href={`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`} className="ts-btn ts-btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          ← Quay lại
        </a>
      </div>
    </div>
  );

  // Trọng tài không được sửa phiếu sau khi đã gửi — chỉ admin mới sửa được
  // (xem server/routes.cjs PUT /scores/:id). Lượt này đã có phiếu → chỉ cho xem lại
  // (lượt còn lại vẫn chấm bình thường vì mỗi lượt là 1 phiếu độc lập).
  const existingScore = existing.find((s) => s.contest_content_id === contentId && s.round === round) || null;
  if (existingScore) {
    return (
      <div className="ts-wrapper ts-center-screen">
        <div className="ts-card ts-gate-card">
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Đội này đã có phiếu điểm lượt {round}.</p>
          <p style={{ color: '#94a3b8', marginBottom: 20 }}>
            Sau khi gửi, trọng tài không thể sửa lại phiếu. Nếu chấm nhầm, vui lòng liên hệ admin.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to={`/referee/history/${existingScore.id}`} className="ts-btn ts-btn-secondary">Xem phiếu đã chấm</Link>
            <Link to={`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`} className="ts-btn ts-btn-ghost">← Quay lại danh sách đội</Link>
          </div>
        </div>
      </div>
    );
  }

  // Legacy: Invention Trail vẫn dùng form cũ (vì có logic riêng)
  if (content?.templateType === 'invention_trail') {
    return (
      <InventionTrailScoreForm
        team={team}
        content={content}
        competitionId={competitionId}
        contentId={contentId}
        region={region}
        memberNames={memberNames}
      />
    );
  }

  // Trước khi vào chấm 1 lượt mới, yêu cầu trọng tài bấm "Bắt đầu" — hệ thống
  // tự ghi nhận thời điểm đó (started_at), không cho nhập tay để tránh sai lệch.
  if (!startedAt) {
    return (
      <div className="ts-wrapper ts-center-screen">
        <div className="ts-card ts-gate-card">
          <div className="ts-gate-badge">
            <span className="ts-gate-round">Lượt {round}</span>
            {team?.boards?.name && <span className="ts-gate-board">{team.boards.name}</span>}
          </div>
          
          <div className="ts-gate-eyebrow">{content?.name}</div>
          <h2 className="ts-gate-team">{team?.name}</h2>
          
          {memberNames && (
            <div className="ts-gate-members">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span>Thành viên: <strong>{memberNames}</strong></span>
            </div>
          )}

          <div className="ts-gate-action">
            <button
              type="button"
              className="ts-btn ts-btn-primary ts-btn-xl ts-gate-start-btn"
              onClick={() => setStartedAt(new Date().toISOString())}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M8 5v14l11-7z"/>
              </svg>
              BẮT ĐẦU LƯỢT THI {round}
            </button>
            <p className="ts-gate-hint">
              ⏱ Hệ thống sẽ tự động ghi nhận thời gian bắt đầu chấm điểm lượt thi này.
            </p>
          </div>

          <div className="ts-gate-footer">
            <Link to={`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`} className="ts-btn ts-btn-ghost">
              ← Quay lại danh sách đội
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Mặc định: dùng TaskScoringWizard mới
  return (
    <TaskScoringWizard
      team={team}
      content={content}
      tasks={tasks}
      competitionId={competitionId}
      contentId={contentId}
      region={region}
      round={round}
      memberNames={memberNames}
      existing={existing}
      startedAt={startedAt}
    />
  );
}
