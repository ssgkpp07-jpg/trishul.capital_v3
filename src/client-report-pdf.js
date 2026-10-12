import html2pdf from 'html2pdf.js';

export async function createClientReportPdf(element, filename) {
  const blob = await html2pdf()
    .set({
      filename,
      margin: [12, 12, 12, 12],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        backgroundColor: '#050505',
        scale: 2,
        useCORS: true,
        logging: false,
        ignoreElements: node => node.classList?.contains('pdf-exclude')
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.account-section', '.stat'] }
    })
    .from(element)
    .outputPdf('blob');

  if (!(blob instanceof Blob) || blob.type !== 'application/pdf') {
    throw new Error('The client report PDF could not be generated.');
  }

  return new File([blob], filename, { type: 'application/pdf' });
}
