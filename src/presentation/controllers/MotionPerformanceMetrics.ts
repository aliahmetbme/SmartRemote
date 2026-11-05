/** JS-clock observations only. Collection is disabled in release builds. */
export class MotionPerformanceMetrics {
  private readonly enabled = typeof __DEV__ !== 'undefined' && __DEV__;
  private arrivals: number[] = [];
  private dispatches: number[] = [];
  private processingTimes: number[] = [];
  private durations: number[] = [];
  private lastArrival?: number;
  private lastDispatch?: number;
  public rejected = 0;
  private invalidated = 0;
  private coalesced = 0;
  private maxBacklog = 0;
  private interruptions: Record<string, number> = {};
  interruption(reason: 'connection' | 'appState') {
    if (this.enabled) this.interruptions[reason] = (this.interruptions[reason] ?? 0) + 1;
  }

  private add(buffer: number[], value: number) {
    if (!this.enabled) return;
    if (buffer.length === 128) buffer.shift();
    buffer.push(value);
  }
  arrival(now: number) {
    if (!this.enabled) return;
    if (this.lastArrival !== undefined) this.add(this.arrivals, now - this.lastArrival);
    this.lastArrival = now;
  }
  dispatch(now: number) {
    if (!this.enabled) return;
    if (this.lastDispatch !== undefined) this.add(this.dispatches, now - this.lastDispatch);
    this.lastDispatch = now;
  }
  processing(ms: number) { this.add(this.processingTimes, ms); }
  completion(ms: number) { this.add(this.durations, ms); }
  backlog(x: number, y: number, inFlight: boolean) {
    if (!this.enabled) return;
    this.maxBacklog = Math.max(this.maxBacklog, Math.abs(x), Math.abs(y));
    if (inFlight) this.coalesced++;
  }
  invalidate(x: number, y: number) {
    if (this.enabled && (Math.round(x) !== 0 || Math.round(y) !== 0)) this.invalidated++;
    this.lastArrival = this.lastDispatch = undefined;
  }
  snapshot(timer: boolean, inFlight: boolean) {
    if (!this.enabled) return undefined;
    const stats = (values: number[]) => {
      if (!values.length) return null;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return { count: values.length, meanMs: mean,
        p95Ms: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1],
        varianceMs2: values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length };
    };
    const arrival = stats(this.arrivals);
    return { sensorArrival: arrival, effectiveSensorHz: arrival && arrival.meanMs > 0 ? 1000 / arrival.meanMs : null,
      dispatch: stats(this.dispatches), processing: stats(this.processingTimes),
      commandPromiseDuration: stats(this.durations), coalescedSamples: this.coalesced,
      maxBacklogPxPerAxis: this.maxBacklog, invalidatedBacklogs: this.invalidated,
      rejectedCommands: this.rejected, interruptions: { ...this.interruptions }, pendingTimers: Number(timer), inFlight };
  }
}
