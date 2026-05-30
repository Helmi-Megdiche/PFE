import { shouldAttemptOnDeviceArabicOcr } from '../src/utils/arabicOcrTrigger';

describe('shouldAttemptOnDeviceArabicOcr', () => {
  it('returns true when ML Kit output contains Arabic script', () => {
    expect(
      shouldAttemptOnDeviceArabicOcr('مرحبا بالعالم', 'مرحبا بالعالم'),
    ).toBe(true);
  });

  it('returns true for garbled Latin from Arabic pages (strong Arabizi, no Arabic Unicode)', () => {
    const garbled =
      'G 9ssir C3 google.com/searr + O Uppercase Alif S0) Partager Capture CWrabic CR';
    expect(shouldAttemptOnDeviceArabicOcr(garbled, garbled)).toBe(true);
  });

  it('returns false for plain English UI without Arabizi signals', () => {
    const english =
      'Screen monitoring On-device OCR and vision. Captures on app switch and periodic timer.';
    expect(shouldAttemptOnDeviceArabicOcr(english, english)).toBe(false);
  });

  it('returns false for UI timestamps and like counts only', () => {
    const ui = '3:51 PM · 308K views · 12 comments';
    expect(shouldAttemptOnDeviceArabicOcr(ui, ui)).toBe(false);
  });

  it('returns true when page mentions Arabic but OCR has no Arabic script', () => {
    const pinterest =
      'G Gssi 2% google.com/searr + Pinterest Arabic Text in Black and WhiteScrittura';
    expect(shouldAttemptOnDeviceArabicOcr(pinterest, pinterest)).toBe(true);
  });

  it('returns false for Messenger Latin Derja without Arabizi digits', () => {
    const messenger =
      'hssir Ok BUAY Souad Rebai MAY 24 AT Hani fel naser maa kachour w fateh MAY 25 AT';
    expect(
      shouldAttemptOnDeviceArabicOcr(messenger, messenger, {
        appPackage: 'com.facebook.orca',
      }),
    ).toBe(false);
  });

  it('returns false for Messenger with strong digit Arabizi (normalisation path only)', () => {
    expect(
      shouldAttemptOnDeviceArabicOcr('zebi 9a7ba w 3lik behi', 'zebi 9a7ba w 3lik behi', {
        appPackage: 'com.facebook.orca',
      }),
    ).toBe(false);
  });

  it('returns true for hssir garble on non-messaging apps (Chrome garbled Arabic)', () => {
    expect(shouldAttemptOnDeviceArabicOcr('hssir Ok', 'hssir Ok')).toBe(true);
  });

  it('returns true for Arabic script in Messenger', () => {
    expect(
      shouldAttemptOnDeviceArabicOcr('كيفك صاحبي', 'كيفك صاحبي', {
        appPackage: 'com.facebook.orca',
      }),
    ).toBe(true);
  });

  it('returns false for English adult site OCR in Chrome (no Arabic on page)', () => {
    const pornhub =
      'Pornhub Blowjob Brunette Creampie Related Recommended Comments ' +
      "Sit on the couch Im going to fuck you Leana Lovings tells Stepbro S23:E9 " +
      'Bratty Sis 6.5M views 27:29 his Dick was in the Pumpkin';
    expect(
      shouldAttemptOnDeviceArabicOcr(pornhub, pornhub, {
        appPackage: 'com.android.chrome',
      }),
    ).toBe(false);
  });
});
