import {
  inferAppPackageFromOcr,
  INFERRED_PACKAGES,
  isFullBrowserSearchContext,
  isMessengerChatContext,
  shouldOverridePackageWithOcrInference,
} from '../src/utils/inferAppPackageFromOcr';
import { shouldNeutralizeLauncherWidgetCapture } from '../src/utils/launcherCaptureContext';

describe('inferAppPackageFromOcr', () => {
  it('detects Messenger chat from MIUI misreported capture', () => {
    const text =
      'rayen Active 1 hour ago W fateh kolou me ysakerlich | 25 ngataalou sormou Bousli';
    expect(isMessengerChatContext(text)).toBe(true);
    expect(inferAppPackageFromOcr(text)).toBe(INFERRED_PACKAGES.messenger);
  });

  it('detects full Google porn search (not recents thumbnail)', () => {
    const text =
      '2% google.com/sea + Q porn PH Mode IA Tous Images Vidéos Vidéos Pornhub Google P';
    expect(isFullBrowserSearchContext(text)).toBe(true);
    expect(inferAppPackageFromOcr(text)).toBe(INFERRED_PACKAGES.chrome);
    expect(shouldNeutralizeLauncherWidgetCapture('com.miui.home', text)).toBe(false);
  });

  it('still neutralizes tiny Chrome recents card on home', () => {
    const text =
      ': O Chrome O 23 pornhub.com/vi + Step Sis Related Porn hub Blowjob Sis Loves Me';
    expect(shouldNeutralizeLauncherWidgetCapture('com.miui.home', text)).toBe(true);
  });

  it('overrides stale Messenger cache when OCR is a Chrome porn search', () => {
    const text =
      ': O google.com/sea + porn PH V Mode lA Tous Images Vidéos Vidéos Pornhub Google ';
    expect(inferAppPackageFromOcr(text)).toBe(INFERRED_PACKAGES.chrome);
    expect(
      shouldOverridePackageWithOcrInference(
        INFERRED_PACKAGES.messenger,
        INFERRED_PACKAGES.chrome,
        text,
      ),
    ).toBe(true);
  });

  it('detects pornhub URL in browser OCR', () => {
    const text =
      'a porn Mode lA Tous Images Vidéos Vidéos VPH Pornhub https://www.pornhub.com';
    expect(isFullBrowserSearchContext(text)).toBe(true);
    expect(inferAppPackageFromOcr(text)).toBe(INFERRED_PACKAGES.chrome);
  });
});
