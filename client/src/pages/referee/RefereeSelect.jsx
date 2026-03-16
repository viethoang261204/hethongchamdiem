import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './RefereeLayout.css';

export default function RefereeSelect() {
  const [competitions, setCompetitions] = useState([]);
  const [contents, setContents] = useState([]);
  const [step, setStep] = useState('competition'); // competition | content | region
  const [selectedComp, setSelectedComp] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getCompetitions().then(setCompetitions).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedComp) return;
    api.getContents(selectedComp.id).then(setContents).catch(console.error);
  }, [selectedComp?.id]);

  const selectCompetition = (c) => {
    setSelectedComp(c);
    setSelectedContent(null);
    setSelectedRegion(null);
    setStep('content');
  };

  const selectContent = (c) => {
    setSelectedContent(c);
    setSelectedRegion(null);
    setStep('region');
  };

  const selectRegion = (r) => {
    setSelectedRegion(r);
    navigate(`/referee/competition/${selectedComp.id}/content/${selectedContent.id}/region/${r}/teams`);
  };

  const back = () => {
    if (step === 'region') setStep('content'), setSelectedContent(null);
    else if (step === 'content') setStep('competition'), setSelectedComp(null);
  };

  return (
    <div>
      <h1 className="referee-page-title">Chấm điểm</h1>
      <div className="referee-steps">
        <span className={`step ${step === 'competition' ? 'active' : ''}`}>1. Chọn cuộc thi</span>
        <span className={`step ${step === 'content' ? 'active' : ''}`}>2. Chọn nội dung</span>
        <span className={`step ${step === 'region' ? 'active' : ''}`}>3. Chọn vùng</span>
      </div>
      {step !== 'competition' && (
        <button type="button" className="btn-ghost" onClick={back} style={{ marginBottom: '1rem' }}>← Quay lại</button>
      )}

      {step === 'competition' && (
        <div className="referee-grid">
          {competitions.filter(c => c.isActive).map((c) => (
            <button key={c.id} type="button" className="referee-card" onClick={() => selectCompetition(c)}>
              <h3>{c.name}</h3>
              <p>{c.location} · {c.startDate}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'content' && selectedComp && (
        <div className="referee-grid">
          {contents.map((c) => (
            <button key={c.id} type="button" className="referee-card" onClick={() => selectContent(c)}>
              <h3>{c.name}</h3>
              <p>{c.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'region' && selectedContent && (
        <div className="referee-grid">
          {['bac', 'trung', 'nam'].map((r) => (
            <button key={r} type="button" className="referee-card" onClick={() => selectRegion(r)}>
              <h3>{r === 'bac' ? 'Bắc' : r === 'trung' ? 'Trung' : 'Nam'}</h3>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
