import {
  isLauncherRecentsWidgetContext,
  shouldNeutralizeLauncherWidgetCapture,
} from '../src/utils/launcherCaptureContext';

describe('launcherCaptureContext', () => {
  it('detects Chrome recents card with pornhub on MIUI home', () => {
    const text =
      ': O Chrome O 23 pornhub.com/vi + Step Sis Related Porn hub Blowjob Sis Loves Me';
    expect(isLauncherRecentsWidgetContext(text)).toBe(true);
    expect(shouldNeutralizeLauncherWidgetCapture('com.miui.home', text)).toBe(true);
  });

  it('does not neutralize when Chrome is the real foreground app', () => {
    const text = '2% pornhub.com/vi + Step Sis Blowjob Related Porn hub';
    expect(shouldNeutralizeLauncherWidgetCapture('com.android.chrome', text)).toBe(
      false,
    );
  });

  it('does not neutralize plain launcher tray without adult thumb', () => {
    const text = 'Thu, 04 June Facebook Instagram Gallery Google WhatsApp';
    expect(shouldNeutralizeLauncherWidgetCapture('com.miui.home', text)).toBe(false);
  });

  it('does not neutralize full Google search porn results on MIUI home misreport', () => {
    const text =
      '2% google.com/sea + Q porn PH Mode IA Tous Images Vidéos Vidéos Pornhub Google P';
    expect(shouldNeutralizeLauncherWidgetCapture('com.miui.home', text)).toBe(false);
  });

  it('does not neutralize Messenger chat misreported as launcher', () => {
    const text =
      'rayen Active 52 minut... Efhem rouhek w koli sahbi khanaarf chnaaml w kh';
    expect(shouldNeutralizeLauncherWidgetCapture('com.miui.home', text)).toBe(false);
  });
});
