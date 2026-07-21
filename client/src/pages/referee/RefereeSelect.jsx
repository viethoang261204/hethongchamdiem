import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { createCachedApi } from '../../apiCache';
import './RefereeLayout.css';

const capi = createCachedApi(api);

export default function RefereeSelect() {
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [boards, setBoards] = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [step, setStep] = useState('competition'); // competition | content | board
  const [selectedComp, setSelectedComp] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    capi.getCompetitions().then(setCompetitions).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedComp) return;
    capi.getContents(selectedComp.id).then(setContents).catch(console.error);
  }, [selectedComp?.id]);

  const selectCompetition = (c) => {
    setSelectedComp(c);
    setStep('content');
  };

  const goToTeams = (boardId) => {
    navigate(`/referee/competition/${selectedComp.id}/content/${selectedContent.id}/region/${boardId}/teams`);
  };

  const selectContent = async (c) => {
    setSelectedContent(c);
    setBoardsLoading(true);
    try {
      const [contentBoards, myBoardIds] = await Promise.all([
        capi.getBoards(c.id),
        api.getMyBoards().catch(() => []),
      ]);
      // Chỉ được phân quyền vào một số bảng cụ thể → chỉ hiện các bảng đó.
      // Chưa được phân quyền bảng nào (mảng rỗng) → coi như chưa giới hạn, hiện tất cả.
      const allowed = myBoardIds.length ? contentBoards.filter(b => myBoardIds.includes(b.id)) : contentBoards;
      if (allowed.length === 0) {
        // Nội dung này không có bảng đấu (hoặc không có bảng nào được phân quyền) → vào thẳng danh sách đội
        navigate(`/referee/competition/${selectedComp.id}/content/${c.id}/region/all/teams`);
        return;
      }
      setBoards(allowed);
      setStep('board');
    } catch (e) {
      console.error(e);
      navigate(`/referee/competition/${selectedComp.id}/content/${c.id}/region/all/teams`);
    } finally {
      setBoardsLoading(false);
    }
  };

  const back = () => {
    if (step === 'board') {
      setStep('content');
      setBoards([]);
      return;
    }
    setStep('competition');
    setSelectedComp(null);
    setSelectedContent(null);
  };

  return (
    <div>
      <h1 className="referee-page-title">Chấm điểm</h1>
      <div className="referee-steps">
        <span className={`step ${step === 'competition' ? 'active' : ''}`}>1. Chọn cuộc thi</span>
        <span className={`step ${step === 'content' ? 'active' : ''}`}>2. Chọn nội dung</span>
        <span className={`step ${step === 'board' ? 'active' : ''}`}>3. Chọn bảng đấu</span>
      </div>
      {step !== 'competition' && (
        <button type="button" className="btn-ghost" onClick={back} style={{ marginBottom: '1rem' }}>← Quay lại</button>
      )}

      {step === 'competition' && (
        <div className="referee-grid">
          {competitions.filter(c => c.is_active !== false).map((c) => (
            <button key={c.id} type="button" className="referee-card" onClick={() => selectCompetition(c)}>
              <h3>{c.name}</h3>
              <p>{c.location} · {c.start_date}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'content' && selectedComp && (
        <div className="referee-grid">
          {contents.map((c) => (
            <button key={c.id} type="button" className="referee-card" onClick={() => selectContent(c)} disabled={boardsLoading}>
              <h3>{c.name}</h3>
              <p>{c.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'board' && selectedContent && (
        <div className="referee-grid">
          <button type="button" className="referee-card" onClick={() => goToTeams('all')}>
            <h3>Tất cả bảng</h3>
            <p>Xem tất cả đội bạn được phân công trong nội dung này</p>
          </button>
          {boards.map((b) => (
            <button key={b.id} type="button" className="referee-card" onClick={() => goToTeams(b.id)}>
              <h3>{b.name}</h3>
              <p>{b.age_group || ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
