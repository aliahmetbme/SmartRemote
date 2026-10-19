import {
  canAttemptCapability,
  createCapabilities,
  hasCapability,
  isCapabilitySupported,
  isCapabilityUnknown,
  isCapabilityUnsupported,
  NO_CAPABILITIES,
  UNKNOWN_CAPABILITIES,
} from '../../domain/entities/TVCapabilities';
import { canTransition, TVConnectionState as S } from '../../domain/enums/TVConnectionState';
import {
  supportsPointer,
  supportsPowerOn,
} from '../../domain/interfaces/ITVRemoteAdapter';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';

describe('capabilities', () => {
  it('assumes nothing is supported by default in NO_CAPABILITIES', () => {
    expect(Object.values(NO_CAPABILITIES).every(v => v === 'unsupported')).toBe(true);
  });

  it('provides UNKNOWN_CAPABILITIES where all are unknown', () => {
    expect(Object.values(UNKNOWN_CAPABILITIES).every(v => v === 'unknown')).toBe(true);
  });

  it('distinguishes supported, unsupported, and unknown states', () => {
    const caps = createCapabilities({
      volumeControl: 'supported',
      channelControl: 'unknown',
      powerOn: 'unsupported',
    });
    expect(isCapabilitySupported(caps, 'volumeControl')).toBe(true);
    expect(isCapabilityUnknown(caps, 'channelControl')).toBe(true);
    expect(isCapabilityUnsupported(caps, 'powerOn')).toBe(true);

    // canAttemptCapability allows supported and unknown
    expect(canAttemptCapability(caps, 'volumeControl')).toBe(true);
    expect(canAttemptCapability(caps, 'channelControl')).toBe(true);
    expect(canAttemptCapability(caps, 'powerOn')).toBe(false);

    // hasCapability strictly requires supported
    expect(hasCapability(caps, 'volumeControl')).toBe(true);
    expect(hasCapability(caps, 'channelControl')).toBe(false);
    expect(hasCapability(caps, 'powerOn')).toBe(false);
  });

  it('only enables what is explicitly declared', () => {
    const caps = createCapabilities({ volumeControl: true });
    expect(hasCapability(caps, 'volumeControl')).toBe(true);
    expect(hasCapability(caps, 'powerOn')).toBe(false);
  });
});

describe('connection state transitions', () => {
  it('allows the normal path', () => {
    expect(canTransition(S.Disconnected, S.Connecting)).toBe(true);
    expect(canTransition(S.Connecting, S.Pairing)).toBe(true);
    expect(canTransition(S.Pairing, S.Connected)).toBe(true);
    expect(canTransition(S.Connected, S.Reconnecting)).toBe(true);
  });

  it('rejects invalid jumps', () => {
    expect(canTransition(S.Disconnected, S.Connected)).toBe(false);
    expect(canTransition(S.Disconnected, S.Pairing)).toBe(false);
    expect(canTransition(S.Connected, S.Connecting)).toBe(false);
    expect(canTransition(S.Error, S.Connected)).toBe(false);
  });
});

describe('optional adapter guards', () => {
  it('detects optional interfaces by implementation', () => {
    const adapter = new MockTVAdapter();
    expect(supportsPowerOn(adapter)).toBe(true);
    expect(supportsPointer(adapter)).toBe(true);
    const bare = { connect: jest.fn() } as never;
    expect(supportsPowerOn(bare)).toBe(false);
  });
});
