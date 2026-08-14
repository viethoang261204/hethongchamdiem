import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import { useLang } from '../../lib/i18n';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

// Danh sách trận Fly Smart Cup (content_format = 'combat_drone') — bấm vào
// 1 trận sẽ mở HẲN trang chấm điểm riêng (xem RefereeCombatMatchScore.jsx),
// không mở dropdown tại chỗ.
export default function RefereeCombatDrone() {
  const { competitionId, contentId } = useParams();
  const navigate = useNavigate();
  const lang = useLang();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getCombatMatches(contentId).then(setMatches).catch(() => setMatches([])).finally(() => setLoading(false));
  }, [contentId]);

  const openMatch = (m) => {
    navigate(`/referee/competition/${competitionId}/content/${contentId}/combat-drone/match/${m.id}`);
  };

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>{lang === 'vi' ? 'Đang tải...' : 'Loading...'}</p>;

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Fly Smart Cup — {lang === 'vi' ? 'Đối kháng' : 'Combat'}</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>
        {lang === 'vi'
          ? 'Chọn 1 trận để nhập điểm Hiệp 1/2, đá luân lưu (nếu có), và đội thắng.'
          : 'Select a match to enter round 1/2 scores, penalty shootout (if any), and the winning team.'}
      </p>

      {matches.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          {lang === 'vi' ? 'Chưa có trận nào — liên hệ admin.' : 'No matches yet — please contact the admin.'}
        </div>
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
                <strong style={{ color: '#f1f5f9' }}>
                  {m.team_a?.name || '—'} <span style={{ color: '#64748b' }}>vs</span> {m.team_b?.name || '—'}
                </strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {m.stage && <span className="ts-board-chip">{m.stage}</span>}
                  {done && (
                    <span className="rt-badge rt-badge-done">
                      {m.is_draw ? (lang === 'vi' ? 'Hòa' : 'Draw') : `${lang === 'vi' ? 'Thắng' : 'Winner'}: ${m.winner_id === m.team_a_id ? m.team_a?.name : m.team_b?.name}`}
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
