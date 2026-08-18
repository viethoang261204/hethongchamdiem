import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../App';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';
import { computeTaskScore, sideFromDetails as starsSideFromDetails } from '../../lib/battleScoring';
import { computeSideScore, sideFromDetails as droneSideFromDetails, effectiveStatus } from '../../lib/flySmartCupScoring';
import './RefereeLayout.css';

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

// Trận đối kháng (Battle of Stars / Fly Smart Cup) không có cột referee_id
// riêng trên combat_matches (xem db/schema.sql) — chữ ký trọng tài trong
// details.refereeSignature là tín hiệu duy nhất để biết "ai đã chấm trận này",
// nên dùng nó để lọc lịch sử thay vì so theo id.
function matchIsMine(match, user) {
  const sig = (match.details?.refereeSignature || '').trim().toLowerCase();
  if (!sig) return false;
  const name = (user?.fullName || '').trim().toLowerCase();
  const username = (user?.username || '').trim().toLowerCase();
  return (!!name && sig === name) || (!!username && sig === username);
}

export default function RefereeScoreHistory() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    Promise.all([
      api.getScores({ refereeId: user.id }),
      api.getCompetitions().then((comps) =>
        Promise.all(comps.map((comp) =>
          api.getContents(comp.id).then((contents) => contents.map((c) => ({ ...c, competitionId: comp.id })))
        )).then((arrays) => arrays.flat())
      ),
    ]).then(async ([scoreList, contents]) => {
      const contentNames = {};
      contents.forEach((c) => { contentNames[c.id] = c.name; });

      const scoreItems = scoreList.map((s) => ({
        kind: 'scoring',
        id: s.id,
        timestamp: s.submitted_at,
        teamText: s.team?.name || '—',
        contentText: contentNames[s.contest_content_id] || s.contest_content_id,
        roundText: `Lượt ${s.round || 1}`,
        scoreText: `${s.score ?? '-'}đ`,
        url: `/referee/history/${s.id}`,
      }));

      const combatContents = contents.filter((c) => c.content_format === 'combat_stars' || c.content_format === 'combat_drone');
      const combatLists = await Promise.all(
        combatContents.map((c) => api.getCombatMatches(c.id).catch(() => []).then((matches) => ({ content: c, matches })))
      );

      const combatItems = [];
      combatLists.forEach(({ content, matches }) => {
        const isStars = content.content_format === 'combat_stars';
        matches.forEach((m) => {
          if (effectiveStatus(m) !== 'completed') return;
          if (!matchIsMine(m, user)) return;
          let scoreText;
          if (isStars) {
            const scoreA = computeTaskScore(starsSideFromDetails(m.details, 'A'));
            const scoreB = computeTaskScore(starsSideFromDetails(m.details, 'B'));
            scoreText = `${scoreA.taskScore} - ${scoreB.taskScore}`;
          } else {
            const scoreA = computeSideScore(droneSideFromDetails(m.details, 'A'));
            const scoreB = computeSideScore(droneSideFromDetails(m.details, 'B'));
            scoreText = `${scoreA.total} - ${scoreB.total}`;
          }
          combatItems.push({
            kind: 'combat',
            id: m.id,
            timestamp: m.updated_at,
            teamText: `${m.team_a?.name || '—'} vs ${m.team_b?.name || '—'}`,
            contentText: content.name,
            roundText: m.group_label || m.stage || '—',
            scoreText,
            url: `/referee/competition/${content.competitionId}/content/${content.id}/${isStars ? 'combat-stars' : 'combat-drone'}/match/${m.id}`,
          });
        });
      });

      if (cancelled) return;
      const merged = [...scoreItems, ...combatItems].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      setItems(merged);
    })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(items, 10);

  if (loading) return <p className="referee-page-title">Đang tải...</p>;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Lịch sử nhập điểm</h1>
        <p className="referee-page-subtitle">Danh sách tất cả các phiếu điểm bạn đã thực hiện chấm và gửi lên hệ thống.</p>
      </div>

      {items.length === 0 ? (
        <div className="card referee-empty-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
          </svg>
          <p>Bạn chưa gửi phiếu điểm nào.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="bxh-table">
              <thead>
                <tr>
                  <th>Thời gian nộp</th>
                  <th>Đội thi</th>
                  <th>Nội dung</th>
                  <th>Lượt thi</th>
                  <th>Điểm số</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((it) => (
                  <tr key={`${it.kind}-${it.id}`}>
                    <td>{formatDate(it.timestamp)}</td>
                    <td><strong style={{ color: '#ffffff' }}>{it.teamText}</strong></td>
                    <td>{it.contentText}</td>
                    <td><span className="meta-badge">{it.roundText}</span></td>
                    <td><strong style={{ color: '#38bdf8', fontSize: 16 }}>{it.scoreText}</strong></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={it.url} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13, minHeight: 34 }}>
                        Xem phiếu điểm →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px' }}>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
          </div>
        </div>
      )}
    </div>
  );
}
