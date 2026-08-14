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
    Promise.all([capi.getContents(selectedComp.id), api.getMyPermissions()])
      .then(([allContents, perms]) => {
        const allowedContentIds = new Set(perms.map((p) => p.contest_content_id));
        setContents(allContents.filter((c) => allowedContentIds.has(c.id)));
      })
      .catch(console.error);
  }, [selectedComp?.id]);

  const selectCompetition = (c) => {
    setSelectedComp(c);
    setStep('content');
  };

  const goToTeams = (boardId) => {
    navigate(`/referee/competition/${selectedComp.id}/content/${selectedContent.id}/region/${boardId}/teams`);
  };

  const goToBoard = (board) => {
    if (board.ranking_format === 'combat') {
      navigate(`/referee/competition/${selectedComp.id}/content/${selectedContent.id}/region/${board.id}/matches`);
    } else {
      goToTeams(board.id);
    }
  };

  const selectContent = async (c) => {
    setSelectedContent(c);
    if (c.content_format === 'combat_drone') {
      navigate(`/referee/competition/${selectedComp.id}/content/${c.id}/combat-drone`);
      return;
    }
    if (c.content_format === 'combat_stars') {
      navigate(`/referee/competition/${selectedComp.id}/content/${c.id}/combat-stars`);
      return;
    }
    setBoardsLoading(true);
    try {
      // Bước chọn NỘI DUNG đã lọc theo referee_content_fields ở trên (chỉ hiện
      // nội dung trọng tài có ít nhất 1 dòng phân quyền). Trong 1 nội dung đã
      // được phép vào, bước chọn BẢNG ĐẤU/field vẫn không lọc ở đây — áp dụng
      // ở tầng dữ liệu (server tự lọc đội/trận theo field), rỗng field cho
      // nội dung đó = chưa giới hạn field nào, hiện đủ mọi bảng để chọn.
      const contentBoards = await capi.getBoards(c.id);
      if (contentBoards.length === 0) {
        navigate(`/referee/competition/${selectedComp.id}/content/${c.id}/region/all/teams`);
        return;
      }
      setBoards(contentBoards);
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
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Cổng Trọng Tài Chấm Điểm</h1>
        <p className="referee-page-subtitle">Chọn cuộc thi, nội dung thi đấu và bảng đấu để tiến hành chấm điểm cho các đội thi.</p>
      </div>

      {/* Stepper progress */}
      <div className="referee-steps">
        <div className={`step ${step === 'competition' ? 'active' : ''}`}>
          <span className="step-num">1</span>
          <span>Chọn cuộc thi</span>
        </div>
        <div className={`step ${step === 'content' ? 'active' : ''}`}>
          <span className="step-num">2</span>
          <span>Chọn nội dung</span>
        </div>
        <div className={`step ${step === 'board' ? 'active' : ''}`}>
          <span className="step-num">3</span>
          <span>Chọn bảng đấu</span>
        </div>
      </div>

      {step !== 'competition' && (
        <button type="button" className="btn btn-ghost" onClick={back} style={{ marginBottom: 20 }}>
          ← Quay lại bước trước
        </button>
      )}

      {step === 'competition' && (
        <div className="referee-grid">
          {competitions.filter(c => c.is_active !== false).map((c) => (
            <button key={c.id} type="button" className="referee-card" onClick={() => selectCompetition(c)}>
              <div className="card-badge">Cuộc thi</div>
              <h3>{c.name}</h3>
              <p>{c.location || 'Địa điểm chưa cập nhật'} · {c.start_date || 'Thời gian chưa cập nhật'}</p>
              <div className="card-action">Bắt đầu chọn nội dung →</div>
            </button>
          ))}
        </div>
      )}

      {step === 'content' && selectedComp && (
        contents.length === 0 ? (
          <p style={{ color: '#64748b', padding: '20px 0' }}>
            Bạn chưa được phân quyền chấm nội dung nào trong cuộc thi này — liên hệ Admin để được gán quyền.
          </p>
        ) : (
          <div className="referee-grid">
            {contents.map((c) => (
              <button key={c.id} type="button" className="referee-card" onClick={() => selectContent(c)} disabled={boardsLoading}>
                <div className="card-badge">Nội dung</div>
                <h3>{c.name}</h3>
                <p>{c.description || 'Chưa có mô tả chi tiết'}</p>
                <div className="card-action">Chọn bảng đấu & chấm điểm →</div>
              </button>
            ))}
          </div>
        )
      )}

      {step === 'board' && selectedContent && (
        <div className="referee-grid">
          <button type="button" className="referee-card" onClick={() => goToTeams('all')}>
            <div className="card-badge">Tất cả</div>
            <h3>Tất cả các bảng đấu</h3>
            <p>Xem toàn bộ danh sách các đội thi được phân công</p>
            <div className="card-action">Xem toàn bộ đội thi →</div>
          </button>
          {boards.map((b) => (
            <button key={b.id} type="button" className="referee-card" onClick={() => goToBoard(b)}>
              <div className="card-badge">{b.ranking_format === 'combat' ? 'Đối kháng' : 'Đo lường'}</div>
              <h3>{b.name}</h3>
              <p>{b.age_group ? `Lứa tuổi: ${b.age_group}` : 'Chưa có lứa tuổi'}</p>
              <div className="card-action">Vào bảng đấu →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

