import jsQR from 'jsqr';

import { QUIET_ZONE, qrPath, qrSquares, qrViewBox, tagPrintHtml } from '@/lib/qr-code';
import { parseTagQr, tagQrText } from '@/lib/qr';

const SCALE = 4;

/** Reads a code the way a camera would: a picture of squares with the blank border around them. */
function scan(squares: boolean[][]) {
  const size = (squares.length + QUIET_ZONE * 2) * SCALE;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  squares.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) {
        return;
      }
      for (let py = (y + QUIET_ZONE) * SCALE; py < (y + QUIET_ZONE + 1) * SCALE; py++) {
        for (let px = (x + QUIET_ZONE) * SCALE; px < (x + QUIET_ZONE + 1) * SCALE; px++) {
          pixels.fill(0, (py * size + px) * 4, (py * size + px) * 4 + 3);
        }
      }
    }),
  );
  return jsQR(pixels, size, size)?.data;
}

/** The squares a path really draws, so a mistake in merging them can't hide. */
function squaresFromPath(path: string, size: number) {
  const squares = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const drawn = path.replace(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g, (_match, x, y, width, back) => {
    expect(back).toBe(width);
    for (let i = 0; i < Number(width); i++) {
      expect(squares[Number(y)][Number(x) + i]).toBe(false);
      squares[Number(y)][Number(x) + i] = true;
    }
    return '';
  });
  expect(drawn).toBe('');
  return squares;
}

describe('qrSquares', () => {
  it.each([
    ['a tag code', 'NNP-3F2A9C'],
    ['a link', 'https://niah.example.org/tag/NNP-3F2A9C'],
    ['a long link', `https://${'a'.repeat(180)}.example.org/tag/NNP-3F2A9C`],
  ])('makes a code a scanner reads back, holding %s', (_what, text) => {
    expect(scan(qrSquares(text))).toBe(text);
  });

  it('gives the Scan tab back the code it was made from', () => {
    const text = tagQrText('NNP-3F2A9C', 'https://niah.example.org');
    expect(parseTagQr(scan(qrSquares(text)) ?? '')).toBe('NNP-3F2A9C');
  });

  it('still reads with some of the code rubbed off', () => {
    const squares = qrSquares('https://niah.example.org/tag/NNP-3F2A9C');
    // A block in the middle, away from the corner marks a scanner looks for first.
    const middle = Math.floor(squares.length / 2);
    for (let y = middle - 3; y <= middle + 3; y++) {
      for (let x = middle - 3; x <= middle + 3; x++) {
        squares[y][x] = false;
      }
    }
    expect(scan(squares)).toBe('https://niah.example.org/tag/NNP-3F2A9C');
  });
});

describe('qrPath', () => {
  it('draws every dark square and nothing else', () => {
    const squares = qrSquares('https://niah.example.org/tag/NNP-3F2A9C');
    expect(squaresFromPath(qrPath(squares), squares.length)).toEqual(squares);
  });

  it('shares one rectangle between squares next to each other', () => {
    expect(qrPath([[true, true, false, true]])).toBe('M0 0h2v1h-2zM3 0h1v1h-1z');
  });

  it('draws nothing for a row with no dark squares', () => {
    expect(qrPath([[false, false]])).toBe('');
  });

  it('leaves the blank border around the code', () => {
    expect(qrViewBox(21)).toBe('-4 -4 29 29');
  });
});

describe('tagPrintHtml', () => {
  const html = tagPrintHtml('NNP-3F2A9C', 'https://niah.example.org/tag/NNP-3F2A9C');

  it('has the code in words and the QR code in the page itself', () => {
    expect(html).toContain('<p class="code">NNP-3F2A9C</p>');
    const path = /<path fill="#000" d="([^"]+)"/.exec(html)?.[1] ?? '';
    const squares = qrSquares('https://niah.example.org/tag/NNP-3F2A9C');
    expect(path).toBe(qrPath(squares));
    expect(html).toContain(`viewBox="${qrViewBox(squares.length)}"`);
  });

  it("doesn't load anything from outside the page", () => {
    expect(html).not.toMatch(/<(img|link|script)\b/);
    expect(html).not.toMatch(/\bsrc=|url\(/);
  });

  it('escapes what goes in the page', () => {
    const odd = tagPrintHtml('<b>&"\'', 'NNP-3F2A9C');
    expect(odd).toContain('<p class="code">&lt;b&gt;&amp;&quot;&#39;</p>');
    expect(odd).not.toContain('<b>');
  });
});
