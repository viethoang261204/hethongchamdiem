import { useRef, useEffect, useState, useCallback } from 'react';
import './SignaturePad.css';

/**
 * Ô ký tên cảm ứng chuyên nghiệp tối ưu cho Tablet/iPad & Mobile.
 *
 * <SignatureBox label="Học sinh ký" value={dataUrl} onChange={setDataUrl} />
 *   - Hiện preview chữ ký nếu đã ký kèm mốc "✓ Đã ký tên"
 *   - Bấm vào mở modal canvas retina nét mượt để ký hoặc ký lại bằng tay / Apple Pencil
 */

function SignatureModal({ title, onClose, onConfirm }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Khởi tạo Canvas theo devicePixelRatio để đường nét cực kỳ sắc nét trên iPad Retina
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch (_) { /* browser fallback */ }
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
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
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
        <div className="sigpad-header">
          <div>
            <div className="sigpad-title">{title}</div>
            <div className="sigpad-hint">Sign with your finger or a stylus / Apple Pencil in the box below</div>
          </div>
          <button type="button" className="sigpad-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="sigpad-canvas-wrapper">
          <canvas
            ref={canvasRef}
            className="sigpad-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="sigpad-baseline">
            <span>Signature Baseline</span>
          </div>
        </div>

        <div className="sigpad-actions">
          <button type="button" className="sigpad-btn sigpad-btn-ghost" onClick={clear}>
            ↺ Sign again
          </button>
          <div className="sigpad-actions-right">
            <button type="button" className="sigpad-btn sigpad-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="sigpad-btn sigpad-btn-primary" onClick={confirm} disabled={isEmpty}>
              ✓ Confirm Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignatureBox({ label, value, onChange, required = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sigbox">
      <div className="sigbox-header">
        <span className="sigbox-label">
          {label} {required && <span className="sigbox-req">*</span>}
        </span>
        {value ? (
          <span className="sigbox-status signed">✓ Signed</span>
        ) : (
          <span className="sigbox-status pending">✍ Not signed</span>
        )}
      </div>
      <button type="button" className={`sigbox-area ${value ? 'signed' : ''}`} onClick={() => setOpen(true)}>
        {value ? (
          <img src={value} alt="Signature" className="sigbox-img" />
        ) : (
          <div className="sigbox-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Tap here to sign</span>
          </div>
        )}
      </button>
      {value && (
        <button type="button" className="sigbox-clear" onClick={() => onChange('')}>
          ✕ Clear & sign again
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

