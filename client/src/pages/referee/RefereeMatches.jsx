import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useNotify } from '../../context/NotifyContext';
import './RefereeLayout.css';
import './TaskScoringWizard.css';

export default function RefereeMatches() {
  const { competitionId, contentId, region } = useParams();
  const { showAlert } = useNotify();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    api.getBracket(contentId, region)
      .then(setData)
      .catch(() => setData({ matches: [], placements: [] }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [contentId, region]);

  const rounds = useMemo(() => {
    const byRound = new Map();
    for (const m of data?.matches || []) {
      if (!byRound.has(m.round_no)) byRound.set(m.round_no, []);
      byRound.get(m.round_no).push(m);
    }
    return Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);
  }, [data]);

  const roundLabel = (roundNo, total) => {
    if (roundNo === total) return 'Final';
    if (roundNo === total - 1) return 'Semifinal';
    return `Round ${roundNo}`;
  };

  const recordResult = async (match, winnerId, isDraw) => {
    setSavingId(match.id);
    try {
      await api.putMatchResult(match.id, { winnerId, isDraw });
      load();
    } catch (e) {
      showAlert(e.message || 'Failed to record result.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8', padding: 24 }}>Loading...</p>;

  const totalRounds = rounds.length ? Math.max(...rounds.map(([r]) => r)) : 0;

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/referee">Chấm điểm</Link>
      </div>
      <h1 className="referee-page-title">Matches — Combat</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Select the winning team (or draw if a rematch is needed) for each match.</p>

      {rounds.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          No bracket for this board yet — please contact the admin to create one.
        </div>
      ) : (
        rounds.map(([roundNo, matches]) => (
          <div className="ts-card" key={roundNo} style={{ marginBottom: 18 }}>
            <h3 className="ts-card-title">{roundLabel(roundNo, totalRounds)}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {matches.sort((a, b) => a.bracket_slot - b.bracket_slot).map((m) => {
                const ready = m.team_a_id && m.team_b_id;
                const done = !!m.winner_id || m.is_draw;
                return (
                  <div key={m.id} className="ts-task-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <strong style={{ color: '#f1f5f9' }}>
                        {m.team_a_name || (ready ? '—' : 'Awaiting team')} vs {m.team_b_name || (ready ? '—' : 'Awaiting team')}
                      </strong>
                      {done && (
                        <span className="rt-badge rt-badge-done">
                          {m.is_draw ? 'Draw — rematch needed' : `Winner: ${m.winner_name}`}
                        </span>
                      )}
                    </div>
                    {!ready ? (
                      <span className="ts-hint">Not enough teams yet (waiting on the previous round's result).</span>
                    ) : (
                      <div className="ts-bigbtns" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                        <button
                          type="button"
                          className={`ts-bigbtn ts-bigbtn-pass ${m.winner_id === m.team_a_id ? 'selected' : ''}`}
                          disabled={savingId === m.id}
                          onClick={() => recordResult(m, m.team_a_id, false)}
                        >
                          {m.team_a_name} wins
                        </button>
                        <button
                          type="button"
                          className={`ts-bigbtn ts-bigbtn-pass ${m.winner_id === m.team_b_id ? 'selected' : ''}`}
                          disabled={savingId === m.id}
                          onClick={() => recordResult(m, m.team_b_id, false)}
                        >
                          {m.team_b_name} wins
                        </button>
                        <button
                          type="button"
                          className={`ts-bigbtn ts-bigbtn-fail ${m.is_draw ? 'selected' : ''}`}
                          disabled={savingId === m.id}
                          onClick={() => recordResult(m, null, true)}
                        >
                          Draw
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {data?.bracket_resolved && data.placements.length > 0 && (
        <div className="ts-card">
          <h3 className="ts-card-title">Final Results</h3>
          <table className="ts-detail-table">
            <thead><tr><th>Rank</th><th>Team</th></tr></thead>
            <tbody>
              {data.placements.map((p) => {
                const name = data.matches.find((m) => m.team_a_id === p.team_id)?.team_a_name
                  || data.matches.find((m) => m.team_b_id === p.team_id)?.team_b_name
                  || p.team_id;
                return (
                  <tr key={p.team_id}>
                    <td><strong>{p.rank}</strong></td>
                    <td>{name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
