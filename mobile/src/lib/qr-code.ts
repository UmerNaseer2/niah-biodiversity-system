// The squares of a tag's QR code, as a path the app can draw and as a page it can print. The text
// that goes in it comes from lib/qr.ts. Everything here works with no signal.
import createQrCode from 'qrcode-generator';

/** The blank border every scanner needs around a QR code, in squares. */
export const QUIET_ZONE = 4;

/**
 * Which squares are dark, row by row. Level Q can lose about a quarter of the code and still read,
 * because a tag on a tree gets dirty and scratched.
 */
export function qrSquares(text: string) {
  const code = createQrCode(0, 'Q');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => code.isDark(row, column)),
  );
}

/** One SVG path for all the dark squares. Squares next to each other in a row share a rectangle. */
export function qrPath(squares: boolean[][]) {
  let path = '';
  squares.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (row[end]) {
        end++;
      }
      path += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return path;
}

/** The viewBox that leaves the blank border around a code with this many squares a side. */
export function qrViewBox(size: number) {
  return `${-QUIET_ZONE} ${-QUIET_ZONE} ${size + QUIET_ZONE * 2} ${size + QUIET_ZONE * 2}`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The page that gets printed: one tag with a line to cut along. The species stays off it on
 * purpose, because anyone walking past can read a tag and some of these plants are protected.
 * Printing on iOS can't load local files, so the code goes in the page itself.
 */
export function tagPrintHtml(tagCode: string, qrText: string) {
  const squares = qrSquares(qrText);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 15mm; color: #000; background: #fff; font-family: Helvetica, Arial, sans-serif; }
  .tag { box-sizing: border-box; width: 70mm; padding: 5mm; border: 0.3mm dashed #777; text-align: center; }
  .park { margin: 0 0 2mm; font-size: 11pt; font-weight: 600; }
  svg { display: block; width: 56mm; height: 56mm; margin: 0 auto; }
  .code { margin: 2mm 0 0; font-size: 20pt; font-weight: 700; letter-spacing: 0.5mm; }
</style>
</head>
<body>
<div class="tag">
  <p class="park">Niah National Park</p>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="${qrViewBox(squares.length)}" shape-rendering="crispEdges" role="img" aria-label="QR code for tag ${escapeHtml(tagCode)}">
    <path fill="#000" d="${qrPath(squares)}"/>
  </svg>
  <p class="code">${escapeHtml(tagCode)}</p>
</div>
</body>
</html>`;
}
