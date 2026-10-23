/**
 * Structured diagnostic recording for SmartRemote connection sessions.
 * Never logs credentials, pairing keys, or sensitive payloads.
 */

export interface ConnectionDiagnosticRecord {
  socketType: 'SSAP' | 'Pointer';
  generation: number;
  connectedAt: number | null;
  disconnectedAt: number | null;
  durationMs: number | null;
  closeCode: number | null;
  closeReason: string | null;
  errorDomain: string | null;
  errorCode: number | null;
  lastInbound: string | null;
  lastOutbound: string | null;
  reconnectTrigger: string | null;
}

export class ConnectionDiagnosticsTracker {
  private static instance: ConnectionDiagnosticsTracker;
  private readonly records: ConnectionDiagnosticRecord[] = [];

  static getInstance(): ConnectionDiagnosticsTracker {
    if (!ConnectionDiagnosticsTracker.instance) {
      ConnectionDiagnosticsTracker.instance = new ConnectionDiagnosticsTracker();
    }
    return ConnectionDiagnosticsTracker.instance;
  }

  recordSession(record: ConnectionDiagnosticRecord): void {
    this.records.push(record);
    if (this.records.length > 50) {
      this.records.shift();
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const durSec = record.durationMs !== null ? `${(record.durationMs / 1000).toFixed(1)}s` : 'n/a';
      console.log(
        `[SmartRemote][Diagnostics] Session Ended: ` +
          `type=${record.socketType}, gen=${record.generation}, duration=${durSec}, ` +
          `closeCode=${record.closeCode ?? 'none'}, reason='${record.closeReason ?? 'none'}', ` +
          `error=${record.errorDomain ? `${record.errorDomain}:${record.errorCode}` : 'none'}, ` +
          `lastOutbound='${record.lastOutbound ?? 'none'}', lastInbound='${record.lastInbound ?? 'none'}', ` +
          `trigger='${record.reconnectTrigger ?? 'none'}'`,
      );
    }
  }

  getRecords(): readonly ConnectionDiagnosticRecord[] {
    return this.records;
  }
}

/** Sanitize an outbound SSAP or Pointer frame for diagnostics without leaking keys or credentials. */
export function sanitizeOutboundSummary(raw: unknown): string {
  if (typeof raw !== 'string') return typeof raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.uri) return `uri:${parsed.uri}`;
    if (parsed.type) return `type:${parsed.type}${parsed.id ? `#${parsed.id}` : ''}`;
    return 'unknown_json';
  } catch {
    // Non-JSON (e.g. pointer frame like 'type:button\nname:HOME\n\n')
    const match = /^type:([^\n]+)/.exec(raw);
    return match ? `pointer:${match[1]}` : 'raw_frame';
  }
}

/** Sanitize an inbound SSAP or Pointer frame for diagnostics without leaking payloads. */
export function sanitizeInboundSummary(raw: unknown): string {
  if (typeof raw !== 'string') return typeof raw;
  try {
    const parsed = JSON.parse(raw);
    const parts = [parsed.type ? `type:${parsed.type}` : null, parsed.id ? `id:${parsed.id}` : null]
      .filter(Boolean)
      .join(' ');
    return parts || 'json_frame';
  } catch {
    return 'raw_inbound';
  }
}
