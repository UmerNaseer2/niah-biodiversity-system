import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Print from 'expo-print';
import jsQR from 'jsqr';
import { AccessibilityInfo } from 'react-native';
import { Path } from 'react-native-svg';

import { QrTag } from '@/components/qr-tag';
import { parseTagQr } from '@/lib/qr';
import { QUIET_ZONE } from '@/lib/qr-code';
import type { PlantRecord } from '@/types/plant-record';

jest.mock('expo-print', () => ({ printAsync: jest.fn() }));

const printAsync = jest.mocked(Print.printAsync);

const record: PlantRecord = {
  id: 'c8f4a0e2-3d5b-4f7c-9e1a-2b4d6f8a0c31',
  tagCode: 'NNP-C8F4A0',
  speciesName: 'Ficus benjamina',
  condition: 'healthy',
  photoCount: 0,
  recordedAt: '2026-10-31T01:00:00.000Z',
  syncStatus: 'synced',
  reviewStatus: 'published',
};

const WEBSITE = 'https://niah.example.org';

/** What the drawn path says, read back by a scanner. */
function scanDrawnCode() {
  const d: string = screen.UNSAFE_getByType(Path).props.d;
  const moves = [...d.matchAll(/M(\d+) (\d+)h(\d+)/g)].map((m) => m.slice(1).map(Number));
  const count = Math.max(...moves.map(([x, , width]) => x + width));
  const scale = 4;
  const size = (count + QUIET_ZONE * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const [x, y, width] of moves) {
    for (let py = (y + QUIET_ZONE) * scale; py < (y + QUIET_ZONE + 1) * scale; py++) {
      const start = (py * size + (x + QUIET_ZONE) * scale) * 4;
      pixels.fill(0, start, start + width * scale * 4);
      for (let i = start + 3; i < start + width * scale * 4; i += 4) {
        pixels[i] = 255;
      }
    }
  }
  return jsQR(pixels, size, size)?.data;
}

describe('QrTag', () => {
  beforeEach(() => {
    printAsync.mockReset();
    printAsync.mockResolvedValue();
    process.env.EXPO_PUBLIC_SITE_URL = WEBSITE;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SITE_URL;
    jest.restoreAllMocks();
  });

  it("draws a code holding a link to the plant's page", () => {
    render(<QrTag record={record} />);
    expect(scanDrawnCode()).toBe(`${WEBSITE}/tag/NNP-C8F4A0`);
    expect(parseTagQr(scanDrawnCode() ?? '')).toBe('NNP-C8F4A0');
  });

  it('names the tag for a screen reader', () => {
    render(<QrTag record={record} />);
    expect(screen.getByLabelText('QR code for tag NNP-C8F4A0')).toBeTruthy();
    expect(screen.getByText('NNP-C8F4A0')).toBeTruthy();
  });

  it('keeps the tile black on white', () => {
    render(<QrTag record={record} />);
    expect(screen.getByTestId('qr-tile')).toHaveStyle({ backgroundColor: '#ffffff' });
    expect(screen.UNSAFE_getByType(Path).props.fill).toBe('#000000');
  });

  it('draws the new code when the record gets a new tag', () => {
    render(<QrTag record={record} />);
    screen.rerender(<QrTag record={{ ...record, tagCode: 'NNP-0A1B2C' }} />);
    expect(scanDrawnCode()).toBe(`${WEBSITE}/tag/NNP-0A1B2C`);
  });

  it('holds only the code, and says so, when the build has no website', () => {
    delete process.env.EXPO_PUBLIC_SITE_URL;
    render(<QrTag record={record} />);
    expect(scanDrawnCode()).toBe('NNP-C8F4A0');
    expect(screen.getByText(/only holds the tag code/)).toBeTruthy();
    expect(screen.queryByText(/public page/)).toBeNull();
  });

  it('says a camera opens the public page once an officer approves it', () => {
    render(<QrTag record={record} />);
    expect(screen.getByText(/A normal phone camera opens the plant's public page/)).toBeTruthy();
    expect(screen.getByText(/The Scan tab opens this record, even with no signal/)).toBeTruthy();
  });

  it.each([
    ['still waiting', 'waiting' as const],
    ['not heard about yet', undefined],
  ])('says a camera finds nothing yet for a record %s', (_what, reviewStatus) => {
    render(<QrTag record={{ ...record, reviewStatus }} />);
    expect(screen.getByText(/no plant with that tag yet/)).toBeTruthy();
    expect(screen.queryByText(/isn't checked until/)).toBeNull();
  });

  it('says the website has no page for a rejected record', () => {
    render(<QrTag record={{ ...record, reviewStatus: 'rejected' }} />);
    expect(screen.getByText(/the website has no page for this tag/)).toBeTruthy();
  });

  it('shows the code with no signal, and warns it could change, before the upload', () => {
    render(<QrTag record={{ ...record, syncStatus: 'pending', reviewStatus: undefined }} />);
    expect(scanDrawnCode()).toBe(`${WEBSITE}/tag/NNP-C8F4A0`);
    expect(screen.getByText(/isn't checked until the record uploads/)).toBeTruthy();
    expect(screen.getByText('Print this tag')).toBeTruthy();
  });

  it.each([['not-allowed' as const], ['rejected' as const]])(
    'still shows the code when the upload problem is %s',
    (uploadProblem) => {
      render(
        <QrTag
          record={{ ...record, syncStatus: 'pending', reviewStatus: undefined, uploadProblem }}
        />,
      );
      expect(screen.getByText('Print this tag')).toBeTruthy();
    },
  );

  it.each([
    ['tag-clash' as const, /already has this tag code/],
    ['deleted' as const, /isn't on the server any more/],
  ])('shows no code to print when the upload problem is %s', (uploadProblem, reason) => {
    render(
      <QrTag
        record={{ ...record, syncStatus: 'pending', reviewStatus: undefined, uploadProblem }}
      />,
    );
    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.UNSAFE_queryByType(Path)).toBeNull();
    expect(screen.queryByText('Print this tag')).toBeNull();
  });

  it('prints a page with the code on it and no species', async () => {
    render(<QrTag record={record} />);
    await act(async () => fireEvent.press(screen.getByText('Print this tag')));
    expect(printAsync).toHaveBeenCalledTimes(1);
    const { html } = printAsync.mock.calls[0][0];
    expect(html).toContain('NNP-C8F4A0');
    expect(html).toContain('<svg');
    expect(html).not.toContain(record.speciesName);
  });

  it("doesn't call a closed print window a failure", async () => {
    printAsync.mockRejectedValue(
      Object.assign(new Error('Printing did not complete'), { code: 'ERR_PRINT_INCOMPLETE' }),
    );
    render(<QrTag record={record} />);
    await act(async () => fireEvent.press(screen.getByText('Print this tag')));
    expect(screen.queryByText(/Couldn't open the print window/)).toBeNull();
  });

  it('says so when printing really fails, and clears it on the next try', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    printAsync.mockRejectedValueOnce(new Error('No printer'));
    render(<QrTag record={record} />);
    await act(async () => fireEvent.press(screen.getByText('Print this tag')));
    expect(screen.getByText("Couldn't open the print window. Try again.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Couldn't open the print window. Try again.");

    await act(async () => fireEvent.press(screen.getByText('Print this tag')));
    expect(screen.queryByText(/Couldn't open the print window/)).toBeNull();
    expect(printAsync).toHaveBeenCalledTimes(2);
  });

  it('opens one print window for a double press', async () => {
    let finish = () => {};
    printAsync.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<QrTag record={record} />);
    fireEvent.press(screen.getByText('Print this tag'));
    fireEvent.press(screen.getByText('Print this tag'));
    expect(printAsync).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    fireEvent.press(screen.getByText('Print this tag'));
    expect(printAsync).toHaveBeenCalledTimes(2);
    await act(async () => {});
  });
});
