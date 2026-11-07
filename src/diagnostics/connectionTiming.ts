export function connectionClock(): number {
  return (globalThis as { performance?: { now(): number } }).performance?.now?.() ?? Date.now();
}

/** Development measurements contain only fixed stage names, outcomes and durations. */
export function connectionTiming(stage: string, started: number, outcome = 'completed'): void {
  if (__DEV__) {
    console.debug('[SmartRemote][ConnectionTiming]', {
      stage, elapsedMs: Math.round(connectionClock() - started), outcome,
    });
  }
}

export async function timeConnectionStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  if (!__DEV__) return run();
  const started = connectionClock();
  try {
    const result = await run();
    connectionTiming(stage, started);
    return result;
  } catch (error) {
    connectionTiming(stage, started, 'failed');
    throw error;
  }
}
