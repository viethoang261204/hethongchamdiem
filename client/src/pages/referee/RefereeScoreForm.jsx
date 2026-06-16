import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api';
import TaskScoringWizard from './TaskScoringWizard';
import InventionTrailScoreForm from './InventionTrailScoreForm';
import './RefereeLayout.css';

export default function RefereeScoreForm() {
  const { competitionId, contentId, teamId } = useParams();
  const [team, setTeam] = useState(null);
  const [content, setContent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [memberNames, setMemberNames] = useState('');
  const [existing, setExisting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getContents(competitionId).then(list => list.find(c => c.id === contentId)),
      api.getTeams(contentId).then(list => list.find(t => t.id === teamId)),
      api.getActiveTasks(contentId).catch(() => []),
      api.getTeamScores(teamId).catch(() => []),
      api.getStudents().catch(() => []),
    ]).then(([contentData, teamData, tasksData, scores, students]) => {
      if (!contentData || !teamData) {
        setNotFound(true);
        return;
      }
      setContent(contentData);
      setTeam(teamData);
      setTasks(tasksData);
      setExisting(scores);
      if (teamData?.student_ids?.length) {
        const names = teamData.student_ids
          .map(id => students.find(s => s.id === id))
          .filter(Boolean)
          .map(s => s.full_name)
          .join(', ');
        setMemberNames(names);
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
        <a href={`/referee/competition/${competitionId}/content/${contentId}/region/all/teams`} className="ts-btn ts-btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          ← Quay lại
        </a>
      </div>
    </div>
  );

  const region = 'all';

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
