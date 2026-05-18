import { createScreenEventSchema } from '../src/validators/screenEvents.validator';

describe('foreground app fields in screen events API', () => {
  it('accepts appPackage and appLabel from native UsageStats mock', () => {
    const { error, value } = createScreenEventSchema.validate({
      timestamp: new Date().toISOString(),
      appPackage: 'com.android.chrome',
      appLabel: 'Chrome',
      extractedTextPreview: 'test',
      riskFlag: false,
      combinedRiskScore: 12,
      category: 'neutral',
    });

    expect(error).toBeUndefined();
    expect(value.appPackage).toBe('com.android.chrome');
    expect(value.appLabel).toBe('Chrome');
  });

  it('rejects missing appPackage', () => {
    const { error } = createScreenEventSchema.validate({
      timestamp: new Date().toISOString(),
      appLabel: 'Chrome',
      extractedTextPreview: '',
      riskFlag: false,
    });
    expect(error).toBeDefined();
  });
});
