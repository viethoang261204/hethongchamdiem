import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi } from '../../apiCache';
import TaskScoringWizard from './TaskScoringWizard';
import InventionTrailScoreForm from './InventionTrailScoreForm';
import './RefereeLayout.css';

const capi = createCachedApi(api);

export default function RefereeScoreForm() {
  const { competitionId, contentId, teamId, region } = useParams();
  const location = useLocation();
  // memberNames được truyền từ RefereeTeams qua navigation state — tránh gọi getStudents() lại
  const [team, setTeam] = useState(null);
  const [content, setContent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [memberNames, setMemberNames] = useState(location.state?.memberNames || '');
  const [existing, setExisting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
    <div className="ts-wrapper">
      <div className="ts-loading">
        <div className="ts-spinner" />
        <p>Đang tải phiếu chấm...</p>
      </div>
    </div>
  );

  if (notFound) return (
    <div className="ts-wrapper">
      <div className="ts-card" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#f87171' }}>Không tìm thấy đội hoặc nội dung thi.</p>
        <a href={`/referee/competition/${competitionId}/content/${contentId}/region/${region}/teams`} className="ts-btn ts-btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          ← Quay lại
        </a>
      </div>
    </div>
  );

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

  // Mặc định: dùng TaskScoringWizard mới
  return (
    <TaskScoringWizard
      team={team}
      content={content}
      tasks={tasks}
      competitionId={competitionId}
      contentId={contentId}
      region={region}
      memberNames={memberNames}
      existing={existing}
    />
  );
}
