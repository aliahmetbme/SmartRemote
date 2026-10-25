import { TVDevice } from '../entities/TVDevice';

export interface ProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface IManualIPProber {
  probe(ipAddress: string, options?: ProbeOptions): Promise<TVDevice>;
}
