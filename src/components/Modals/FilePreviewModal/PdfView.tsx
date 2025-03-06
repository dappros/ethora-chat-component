import React from 'react';

const PdfViewer = ({ pdfUrl }) => {
  const pdfJsViewer = 'https://mozilla.github.io/pdf.js/web/viewer.html';

  return (
    <iframe
      src={`${pdfJsViewer}?file=${encodeURIComponent(pdfUrl)}`}
      width="100%"
      height="100%"
      style={{ border: 'none' }}
    />
  );
};

export default PdfViewer;
