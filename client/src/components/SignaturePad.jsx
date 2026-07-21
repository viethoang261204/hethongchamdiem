import { useRef, useEffect, useState, useCallback } from 'react';
import './SignaturePad.css';

/**
 * Ô ký tên cảm ứng cho iPad/điện thoại.
 *
 * <SignatureBox label="Học sinh ký" value={dataUrl} onChange={setDataUrl} />
 *   - Hiện chữ ký (ảnh) nếu đã ký, bấm vào mở modal canvas để ký/ký lại
 *   - value là data URL PNG (nền trong suốt), '' = chưa ký
 */

function SignatureModal({ title, onClose, onConfirm }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Canvas theo devicePixelRatio cho nét mượt trên màn retina
  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    // setPointerCapture có thể ném lỗi (pointer không active) trên vài trình duyệt
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch (_) { /* bỏ qua */ }
    drawingRef.current = true;
    lastRef.current = getPos(e);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
    setIsEmpty(false);
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!drawingRef.current) return;
    // Chấm 1 điểm (tap) cũng tính là nét
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    drawingRef.current = false;
    setIsEmpty(false);
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const confirm = () => {
    if (isEmpty) return;
    onConfirm(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div className="sigpad-overlay" onClick={onClose}>
      <div className="sigpad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sigpad-title">{title}</div>
        <div className="sigpad-hint">Ký bằng ngón tay hoặc bút cảm ứng vào khung bên dưới</div>
        <canvas
          ref={canvasRef}
          className="sigpad-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="sigpad-actions">
          <button type="button" className="sigpad-btn sigpad-btn-ghost" onClick={onClose}>Hủy</button>
          <button type="button" className="sigpad-btn sigpad-btn-ghost" onClick={clear}>Ký lại</button>
          <button type="button" className="sigpad-btn sigpad-btn-primary" onClick={confirm} disabled={isEmpty}>
            ✓ Xác nhận chữ ký
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignatureBox({ label, value, onChange, required = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sigbox">
      <div className="sigbox-label">
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </div>
      <button type="button" className={`sigbox-area ${value ? 'signed' : ''}`} onClick={() => setOpen(true)}>
        {value ? (
          <img src={value} alt="Chữ ký" className="sigbox-img" />
        ) : (
          <span className="sigbox-placeholder">✍ Bấm để ký</span>
        )}
      </button>
      {value && (
        <button type="button" className="sigbox-clear" onClick={() => onChange('')}>
          Xóa chữ ký
        </button>
      )}
      {open && (
        <SignatureModal
          title={label}
          onClose={() => setOpen(false)}
          onConfirm={(dataUrl) => { onChange(dataUrl); setOpen(false); }}
        />
      )}
    </div>
  );
}
