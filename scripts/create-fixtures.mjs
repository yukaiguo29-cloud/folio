import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
const dir = new URL('../test-fixtures/', import.meta.url);
await mkdir(dir, { recursive: true });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const serif = await pdf.embedFont(StandardFonts.TimesRoman);
const pages = [
  [
    'The quiet art of reading',
    'Folio acceptance test: real selectable PDF content.',
    'A good book is a conversation that continues after the last page.',
    'Highlight this sentence and leave a thought beside it.',
  ],
  [
    'A place for your thoughts',
    'Search marker: serendipity lives between the lines.',
    'Local annotations preserve the original PDF document.',
    'Page two is used to verify reading progress restoration.',
  ],
  [
    'Begin again',
    'The end of a page is the beginning of another idea.',
    'Test marker: offline-first reading and reliable persistence.',
    'Thank you for reading.',
  ],
];
pages.forEach((lines, i) => {
  const p = pdf.addPage([595, 842]);
  p.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.98, 0.98, 0.96) });
  p.drawText('F O L I O  /  R E A D I N G  N O T E S', {
    x: 65,
    y: 760,
    size: 9,
    font,
    color: rgb(0.4, 0.49, 0.42),
  });
  p.drawText(lines[0], { x: 65, y: 672, size: 29, font: serif, color: rgb(0.22, 0.29, 0.24) });
  lines
    .slice(1)
    .forEach((l, n) =>
      p.drawText(l, { x: 65, y: 600 - n * 45, size: 12, font, color: rgb(0.27, 0.3, 0.28) }),
    );
  p.drawText(String(i + 1), { x: 290, y: 45, size: 10, font, color: rgb(0.5, 0.55, 0.5) });
});
await writeFile(new URL('Folio-reading-test.pdf', dir), await pdf.save());
await writeFile(new URL('corrupt.pdf', dir), 'This is intentionally not a PDF.');
await writeFile(
  new URL('Reading-notes.md', dir),
  '# Reading notes\n\n## A quiet beginning\n\nThis is a **real Markdown file** with a search marker: serendipity.\n\n> Knowledge grows through attention.\n\n## A second thought\n\nSelect this paragraph to test persistent highlighting.\n\n| Feature | Storage |\n| --- | --- |\n| Notes | Local SQLite |\n',
);
await writeFile(
  new URL('Reading-notes.txt', dir),
  'Folio plain text acceptance test.\n\nReading position and notes stay on this computer.\nSearch marker: serendipity.',
);
await writeFile(
  new URL('Safe-reading.html', dir),
  '<h1>HTML reading test</h1><p>Safe local document content.</p><script>window.FOLIO_UNSAFE=true</script><img src="https://example.com/tracker.png" onerror="alert(1)"><p>Remote images and scripts must be removed.</p>',
);
const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip');
zip.file(
  'META-INF/container.xml',
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
zip.file(
  'OEBPS/content.opf',
  '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">folio-test</dc:identifier><dc:title>A quiet book</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-26T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
);
zip.file(
  'OEBPS/nav.xhtml',
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">A quiet beginning</a></li><li><a href="two.xhtml">Another thought</a></li></ol></nav></body></html>',
);
for (const [name, title, text] of [
  ['one', 'A quiet beginning', 'A real EPUB chapter. Search marker: serendipity.'],
  ['two', 'Another thought', 'A second chapter with reflowable text and reliable annotations.'],
])
  zip.file(
    'OEBPS/' + name + '.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1><p>${text}</p></body></html>`,
  );
await writeFile(new URL('Quiet-book.epub', dir), await zip.generateAsync({ type: 'uint8array' }));
const docx = new JSZip();
docx.file(
  '[Content_Types].xml',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
docx.file(
  '_rels/.rels',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
docx.file(
  'word/document.xml',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Folio DOCX reading test</w:t></w:r></w:p><w:p><w:r><w:t>A real Word document. Search marker: serendipity.</w:t></w:r></w:p></w:body></w:document>',
);
await writeFile(
  new URL('Word-reading-test.docx', dir),
  await docx.generateAsync({ type: 'uint8array' }),
);
console.log('Created real PDF, EPUB, DOCX, TXT, Markdown, HTML and corrupt fixtures.');
