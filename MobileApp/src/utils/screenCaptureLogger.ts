/** Logs appear in Metro terminal with prefix [ScreenCapture] */
export function scLog(step: string, detail?: Record<string, unknown> | string | number | boolean | null): void {
  const ts = new Date().toISOString().slice(11, 23);
  if (detail === undefined) {
    console.log(`[ScreenCapture ${ts}] ${step}`);
    return;
  }
  if (typeof detail === 'object' && detail !== null) {
    console.log(`[ScreenCapture ${ts}] ${step}`, detail);
    return;
  }
  console.log(`[ScreenCapture ${ts}] ${step}`, detail);
}

export function scWarn(step: string, detail?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`[ScreenCapture ${ts}] ${step}`, detail ?? '');
}

export function scError(step: string, err: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[ScreenCapture ${ts}] ${step}`, { message, stack });
}
