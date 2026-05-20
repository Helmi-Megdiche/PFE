import { isDevOverlayOcrText } from '../src/utils/devOverlayOcr';

describe('devOverlayOcr', () => {
  it('detects Metro console overlay text', () => {
    const text =
      'Console Error [ScreenCapture 18:48:46] Native error event Screen monitoring On-device OCR';
    expect(isDevOverlayOcrText(text)).toBe(true);
  });

  it('does not flag normal social feed OCR', () => {
    expect(isDevOverlayOcrText("7:49 majorcuddl3s Original audio That's him on god")).toBe(false);
  });
});
