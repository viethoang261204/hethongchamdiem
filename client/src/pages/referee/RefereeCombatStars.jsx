import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

// Danh sách trận Battle of Stars (content_format = 'combat_stars') — bấm vào
// 1 trận sẽ mở HẲN trang chấm điểm riêng (xem RefereeCombatMatchScore.jsx),
// không mở dropdown tại chỗ.
export default function RefereeCombatStars() {
  const { competitionId, contentId } = useParams();
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getCombatMatches(contentId).catch(() => [])
      .then((m) => setMatches(m))
      .finally(() => setLoading(false));
  }, [contentId]);

  const openMatch = (m) => {
    navigate(`/referee/competition/${competitionId}/content/${contentId}/combat-stars/match/${m.id}`);
  };

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Loading...</p>;

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Battle of Stars — Combat</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Select a match to score both teams. The win/draw result is calculated automatically from the scores.</p>

      {matches.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>No matches yet — please contact the admin.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matches.map((m) => {
            const done = !!m.winner_id || m.is_draw;
            return (
              <div
                key={m.id}
                className="ts-card ts-match-card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                onClick={() => openMatch(m)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMatch(m); } }}
              >
                <strong style={{ color: '#f1f5f9', fontSize: 14 }}>
                  {m.team_a?.name || '—'} <span style={{ color: '#64748b' }}>vs</span> {m.team_b?.name || '—'}
                </strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {m.stage && <span className="ts-board-chip">{m.stage}</span>}
                  {m.group_label && <span className="ts-board-chip">{m.group_label}</span>}
                  {done && (
                    <span className="rt-badge rt-badge-done">
                      {m.is_draw ? 'Draw' : `Winner: ${m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
