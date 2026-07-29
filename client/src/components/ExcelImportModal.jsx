import { useState, useRef } from 'react';
import { parseExcelFile, downloadExcelTemplate } from '../lib/excel';
import { useNotify } from '../context/NotifyContext';

/**
 * Modal "Nhập từ Excel" dùng chung cho mọi trang Admin.
 *
 * Props:
 *   title            — tiêu đề modal, VD: "Nhập trường học từ Excel"
 *   columns          — [{ key, label, required, example }]
 *   onImport(rows)   — nhận mảng dòng hợp lệ (đã lọc __valid), trả về
 *                       Promise<{ added, skipped, errors: [{row, message}], generated? }>
 *                       `generated` (tuỳ chọn) — mảng {username, password} tài khoản vừa
 *                       sinh mật khẩu tự động, hiện riêng ở bước kết quả.
 *   templateFilename — tên file mẫu tải xuống, VD: "mau-truong-hoc.xlsx"
 *   notePrereq       — (tuỳ chọn) ghi chú điều kiện cần có trước, hiện ở đầu modal
 *   onClose()        — đóng modal
 *   onDone()         — gọi sau khi nhập xong (để trang cha reload danh sách)
 */
export default function ExcelImportModal({ title, columns, onImport, templateFilename, notePrereq, onClose, onDone }) {
  const { showAlert } = useNotify();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('pick'); // pick | preview | result
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const validRows = rows.filter((r) => r.__valid);
  const invalidRows = rows.filter((r) => !r.__valid);

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const { rows: parsed, errors } = await parseExcelFile(file, columns);
      setRows(parsed);
      setParseErrors(errors);
      if (parsed.length > 0) setStep('preview');
    } catch (err) {
      showAlert(err.message || 'Lỗi khi đọc file.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (validRows.length === 0) {
      showAlert('Không có dòng hợp lệ nào để nhập.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await onImport(validRows);
      setResult(res);
      setStep('result');
      onDone?.();
    } catch (err) {
      showAlert(err.message || 'Lỗi khi nhập dữ liệu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep('pick');
    setFileName('');
    setRows([]);
    setParseErrors([]);
    setResult(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="form-modal-header">
          <h3 className="form-modal-title">{title}</h3>
          <button type="button" className="form-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="form-modal-body">
          {notePrereq && (
            <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 14 }}>
              {notePrereq}
            </div>
          )}

          {step === 'pick' && (
            <>
              <div className="form-group">
                <button type="button" className="btn btn-secondary" onClick={() => downloadExcelTemplate(columns, templateFilename)}>
                  ⬇ Tải file mẫu
                </button>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  Cột có dấu <strong>*</strong> là bắt buộc. Dùng đúng file mẫu để tránh sai tên cột.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Chọn file Excel/CSV (.xlsx, .xls, .csv)</label>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="form-input" onChange={handlePickFile} />
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              <p style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
                File <strong>{fileName}</strong>: {rows.length} dòng — <span style={{ color: '#16a34a' }}>{validRows.length} hợp lệ</span>
                {invalidRows.length > 0 && <span style={{ color: '#dc2626' }}>, {invalidRows.length} lỗi (sẽ bỏ qua)</span>}.
              </p>
              <div className="table-container" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>Dòng</th>
                      {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.__row} style={!r.__valid ? { background: '#fef2f2' } : undefined}>
                        <td>{r.__row}</td>
                        {columns.map((c) => <td key={c.key} style={{ fontSize: 13 }}>{r[c.key] || '-'}</td>)}
                        <td style={{ fontSize: 12, color: r.__valid ? '#16a34a' : '#dc2626' }}>
                          {r.__valid ? 'Hợp lệ' : r.__errors.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {step === 'result' && result && (
            <>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Đã thêm <strong style={{ color: '#16a34a' }}>{result.added}</strong> dòng
                {result.skipped > 0 && <> · bỏ qua <strong>{result.skipped}</strong> dòng trùng</>}
                {result.errors?.length > 0 && <> · <strong style={{ color: '#dc2626' }}>{result.errors.length}</strong> dòng lỗi</>}.
              </p>
              {result.errors?.length > 0 && (
                <div className="table-container" style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 14 }}>
                  <table>
                    <thead><tr><th style={{ width: 60 }}>Dòng</th><th>Lỗi</th></tr></thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i}><td>{e.row}</td><td style={{ fontSize: 13, color: '#dc2626' }}>{e.message}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.generated?.length > 0 && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
                    Mật khẩu tự sinh — chỉ hiện DUY NHẤT lần này, hãy chép lại ngay:
                  </p>
                  <div className="table-container" style={{ maxHeight: 240, overflowY: 'auto' }}>
                    <table>
                      <thead><tr><th>Tài khoản</th><th>Mật khẩu</th></tr></thead>
                      <tbody>
                        {result.generated.map((g, i) => (
                          <tr key={i}><td>{g.username}</td><td style={{ fontFamily: 'monospace' }}>{g.password}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="form-actions">
          {step === 'preview' && (
            <button type="button" className="btn btn-secondary" onClick={reset}>← Chọn file khác</button>
          )}
          {step === 'result' ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>Đóng</button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
              {step === 'preview' && (
                <button type="button" className="btn btn-primary" onClick={handleConfirmImport} disabled={submitting || validRows.length === 0}>
                  {submitting ? 'Đang nhập...' : `Xác nhận nhập (${validRows.length})`}
                </button>
              )}
            </>
          )}
        </div>
        {parseErrors.length > 0 && step === 'pick' && (
          <div style={{ padding: '0 24px 16px', color: '#dc2626', fontSize: 13 }}>
            {parseErrors.join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}
