import {
  APP_OWN_PACKAGE,
  resolveEffectiveForegroundForSwitch,
  shouldCaptureAfterLauncherReturn,
} from '../src/utils/appSwitchCapture';

describe('appSwitchCapture', () => {
  it('uses own package while SafeGuard AppState is active', () => {
    expect(
      resolveEffectiveForegroundForSwitch('active', 'com.android.chrome'),
    ).toBe(APP_OWN_PACKAGE);
  });

  it('uses UsageStats package when SafeGuard is in background', () => {
    expect(
      resolveEffectiveForegroundForSwitch('background', 'com.android.chrome'),
    ).toBe('com.android.chrome');
  });

  it('returns null for unknown UsageStats when in background', () => {
    expect(resolveEffectiveForegroundForSwitch('background', 'unknown')).toBeNull();
  });

  it('detects return to same app after launcher', () => {
    expect(
      shouldCaptureAfterLauncherReturn(true, 'com.android.chrome', 'com.android.chrome'),
    ).toBe(true);
  });

  it('does not capture when launcher was not visited', () => {
    expect(
      shouldCaptureAfterLauncherReturn(false, 'com.android.chrome', 'com.android.chrome'),
    ).toBe(false);
  });
});
