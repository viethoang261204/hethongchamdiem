import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Chụp element ref thành PDF và tải xuống.
 * @param {React.RefObject} ref - ref của element cần xuất
 * @param {string} filename - tên file PDF (không cần .pdf)
 */
export async function exportToPdf(ref, filename = 'phieu-cham-diem') {
  const el = ref?.current;
  if (!el) return;

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageW - margin * 2;
  const imgH = (canvas.height * usableW) / canvas.width;

  // Nếu nội dung dài hơn 1 trang thì tự cắt trang
  let yOffset = 0;
  while (yOffset < imgH) {
    if (yOffset > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin - yOffset, usableW, imgH);
    yOffset += pageH - margin * 2;
  }

  pdf.save(`${filename}.pdf`);
}

/**
 * Chụp NHIỀU element (mỗi element 1 phiếu điểm) thành 1 file PDF duy nhất —
 * dùng cho xuất hàng loạt (VD: toàn bộ phiếu điểm của 1 trường/trung tâm).
 * Mỗi element luôn bắt đầu ở 1 trang mới (không dồn chung như exportToPdf),
 * chỉ tự cắt thêm trang nếu bản thân element đó cao hơn 1 trang A4.
 * @param {Array<HTMLElement>} elements
 * @param {string} filename
 */
export async function exportMultipleToPdf(elements, filename = 'bao-cao') {
  const list = (elements || []).filter(Boolean);
  if (!list.length) return;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageW - margin * 2;

  let isFirstPage = true;
  for (const el of list) {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    const imgH = (canvas.height * usableW) / canvas.width;

    let yOffset = 0;
    while (yOffset < imgH) {
      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;
      pdf.addImage(imgData, 'PNG', margin, margin - yOffset, usableW, imgH);
      yOffset += pageH - margin * 2;
    }
  }

  pdf.save(`${filename}.pdf`);
}
