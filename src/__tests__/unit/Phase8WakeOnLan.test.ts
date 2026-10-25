import { TVDevice } from '../../domain/entities/TVDevice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { ITVWakeService } from '../../domain/interfaces/ITVWakeService';
import {
  canonicalizeMacAddress,
  extractHexMac,
  formatMacBytes,
  isValidMacAddress,
  parseMacBytes,
} from '../../domain/utils/macValidator';
import {
  buildMagicPacket,
  MAGIC_PACKET_HEADER_LENGTH,
  MAGIC_PACKET_LENGTH,
  MAC_ADDRESS_LENGTH,
  MAC_REPETITIONS,
  uint8ArrayToBase64,
} from '../../domain/utils/magicPacket';
import { WakeTVUseCase, WakeStage } from '../../application/usecases/WakeTVUseCase';
import { UpdateTVMacUseCase } from '../../application/usecases/UpdateTVMacUseCase';
import { PowerTVUseCase } from '../../application/usecases/PowerTVUseCase';
import { SendRemoteCommandUseCase } from '../../application/usecases/SendRemoteCommandUseCase';
import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { WakeOnLanService, IWakeOnLanNativeModule } from '../../infrastructure/services/WakeOnLanService';
import { LocalTVDeviceRepository } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { InMemoryCredentialStorage } from '../../infrastructure/storage/InMemoryCredentialStorage';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice, makeWebOSDevice } from '../../testing/fixtures';

describe('Phase 8 — Wake-on-LAN & Automatic TV Power-On', () => {
  // =========================================================================
  // PART 5 — MAGIC PACKET & MAC ADDRESS VALIDATION
  // =========================================================================
  describe('Magic Packet & MAC Address Management (Domain Layer)', () => {
    const testMacColon = 'AA:BB:CC:DD:EE:FF';
    const testMacHyphen = 'aa-bb-cc-dd-ee-ff';
    const testMacDot = 'aabb.ccdd.eeff';
    const testMacPlain = 'aabbccddeeff';

    it('extracts hex and validates common MAC address formats', () => {
      expect(extractHexMac(testMacColon)).toBe('AABBCCDDEEFF');
      expect(extractHexMac(testMacHyphen)).toBe('AABBCCDDEEFF');
      expect(extractHexMac(testMacDot)).toBe('AABBCCDDEEFF');
      expect(extractHexMac(testMacPlain)).toBe('AABBCCDDEEFF');

      expect(isValidMacAddress(testMacColon)).toBe(true);
      expect(isValidMacAddress(testMacHyphen)).toBe(true);
      expect(isValidMacAddress(testMacDot)).toBe(true);
      expect(isValidMacAddress(testMacPlain)).toBe(true);
    });

    it('canonicalizes diverse inputs to uppercase colon-separated format', () => {
      expect(canonicalizeMacAddress(testMacColon)).toBe('AA:BB:CC:DD:EE:FF');
      expect(canonicalizeMacAddress(testMacHyphen)).toBe('AA:BB:CC:DD:EE:FF');
      expect(canonicalizeMacAddress(testMacDot)).toBe('AA:BB:CC:DD:EE:FF');
      expect(canonicalizeMacAddress(testMacPlain)).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('rejects invalid, broadcast, all-zero, and malformed MAC addresses', () => {
      expect(isValidMacAddress('')).toBe(false);
      expect(isValidMacAddress(null)).toBe(false);
      expect(isValidMacAddress(undefined)).toBe(false);
      expect(isValidMacAddress('00:00:00:00:00:00')).toBe(false);
      expect(isValidMacAddress('FF:FF:FF:FF:FF:FF')).toBe(false);
      expect(isValidMacAddress('ffffffffffff')).toBe(false);
      expect(isValidMacAddress('000000000000')).toBe(false);
      expect(isValidMacAddress('AA:BB:CC:DD:EE')).toBe(false); // short
      expect(isValidMacAddress('AA:BB:CC:DD:EE:FF:11')).toBe(false); // long
      expect(isValidMacAddress('GG:HH:II:JJ:KK:LL')).toBe(false); // non-hex
      expect(isValidMacAddress('192.168.1.50')).toBe(false); // IP address

      expect(() => canonicalizeMacAddress('invalid')).toThrow();
      expect(() => canonicalizeMacAddress('00:00:00:00:00:00')).toThrow();
      expect(() => canonicalizeMacAddress('FF:FF:FF:FF:FF:FF')).toThrow();
    });

    it('parses MAC address into 6 raw bytes correctly', () => {
      const bytes = parseMacBytes('1A:2B:3C:4D:5E:6F');
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(6);
      expect(bytes[0]).toBe(0x1a);
      expect(bytes[1]).toBe(0x2b);
      expect(bytes[2]).toBe(0x3c);
      expect(bytes[3]).toBe(0x4d);
      expect(bytes[4]).toBe(0x5e);
      expect(bytes[5]).toBe(0x6f);

      expect(formatMacBytes(bytes)).toBe('1A:2B:3C:4D:5E:6F');
    });

    it('constructs an exact 102-byte Magic Packet with 6x 0xFF and 16x MAC repetitions', () => {
      const mac = '00:11:22:33:44:55';
      const packet = buildMagicPacket(mac);

      // Exact length: 102 bytes
      expect(packet.length).toBe(MAGIC_PACKET_LENGTH);
      expect(packet).toBeInstanceOf(Uint8Array);

      // 1. Header: 6 bytes of 0xFF
      for (let i = 0; i < MAGIC_PACKET_HEADER_LENGTH; i++) {
        expect(packet[i]).toBe(0xff);
      }

      // 2. Body: 16 repetitions of 6-byte target MAC
      const expectedMacBytes = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55];
      for (let rep = 0; rep < MAC_REPETITIONS; rep++) {
        const offset = MAGIC_PACKET_HEADER_LENGTH + rep * MAC_ADDRESS_LENGTH;
        for (let b = 0; b < MAC_ADDRESS_LENGTH; b++) {
          expect(packet[offset + b]).toBe(expectedMacBytes[b]);
        }
      }
    });

    it('encodes raw binary packet to base64 for native bridge transport', () => {
      const packet = buildMagicPacket('AA:BB:CC:DD:EE:FF');
      const b64 = uint8ArrayToBase64(packet);
      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);

      // Verify header in base64: 6 bytes of 0xFF -> "//////"
      const globalBuffer = (globalThis as unknown as {
        Buffer: { from: (str: string, enc: string) => Uint8Array };
      }).Buffer;
      const decodedBuffer = globalBuffer.from(b64, 'base64');
      expect(decodedBuffer.length).toBe(102);
      expect(decodedBuffer[0]).toBe(0xff);
      expect(decodedBuffer[5]).toBe(0xff);
      expect(decodedBuffer[6]).toBe(0xaa);
      expect(decodedBuffer[11]).toBe(0xff);
    });

    it('throws error when building magic packet with invalid MAC', () => {
      expect(() => buildMagicPacket('invalid-mac')).toThrow();
      expect(() => buildMagicPacket('00:00:00:00:00:00')).toThrow();
    });
  });

  // =========================================================================
  // PART 3 — REPOSITORY & MAC PERSISTENCE
  // =========================================================================
  describe('Device Persistence & UpdateTVMacUseCase', () => {
    it('preserves existing device metadata and pairing credentials when updating MAC', async () => {
      const storage = new InMemoryKeyValueStorage();
      const credentials = new InMemoryCredentialStorage();
      const repo = new LocalTVDeviceRepository(storage);

      const device = makeWebOSDevice({
        id: 'tv-living-room',
        name: 'LG OLED Living Room',
        pairingStatus: PairingStatus.Paired,
      });

      // Save initial device without MAC
      await repo.save(device);
      await credentials.set(device.id, 'super-secret-client-key-12345');

      const updateUseCase = new UpdateTVMacUseCase(repo);
      const updated = await updateUseCase.execute(device.id, '48-87-05-AB-CD-EF');

      // Verify canonical MAC stored
      expect(updated.macAddress).toBe('48:87:05:AB:CD:EF');
      expect(updated.name).toBe('LG OLED Living Room');
      expect(updated.pairingStatus).toBe(PairingStatus.Paired);

      // Verify persisted in repository
      const fromRepo = await repo.getById(device.id);
      expect(fromRepo?.macAddress).toBe('48:87:05:AB:CD:EF');

      // Verify credentials untouched in Keychain
      const cred = await credentials.get(device.id);
      expect(cred).toBe('super-secret-client-key-12345');
    });

    it('rejects update when MAC address is invalid or device not found', async () => {
      const storage = new InMemoryKeyValueStorage();
      const repo = new LocalTVDeviceRepository(storage);
      const updateUseCase = new UpdateTVMacUseCase(repo);

      // Invalid MAC
      await expect(updateUseCase.execute('tv-1', 'bad-mac')).rejects.toThrow(TVConnectionError);

      // Non-existent device
      await expect(
        updateUseCase.execute('non-existent', 'AA:BB:CC:DD:EE:FF'),
      ).rejects.toThrow(TVConnectionError);
    });

    it('handles backward compatibility for legacy saved TVs without macAddress', async () => {
      const storage = new InMemoryKeyValueStorage();
      const repo = new LocalTVDeviceRepository(storage);

      const legacyDevice = makeMockDevice({ id: 'legacy-tv', name: 'Old TV' });
      delete (legacyDevice as Partial<TVDevice>).macAddress;

      await repo.save(legacyDevice);
      const loaded = await repo.getById('legacy-tv');

      expect(loaded).toBeDefined();
      expect(loaded?.macAddress).toBeUndefined();
    });
  });

  // =========================================================================
  // PART 4 — WAKE-ON-LAN INFRASTRUCTURE SERVICE & NATIVE BRIDGE
  // =========================================================================
  describe('WakeOnLanService (Infrastructure Layer)', () => {
    it('checks availability via native bridge', async () => {
      const mockBridge: IWakeOnLanNativeModule = {
        isAvailable: jest.fn().mockResolvedValue(true),
        sendMagicPacket: jest.fn(),
      };

      const service = new WakeOnLanService(mockBridge);
      expect(await service.isSupported()).toBe(true);
      expect(mockBridge.isAvailable).toHaveBeenCalled();
    });

    it('returns false for isSupported when native bridge is unavailable or throws', async () => {
      const serviceNoBridge = new WakeOnLanService(null as unknown as IWakeOnLanNativeModule);
      expect(await serviceNoBridge.isSupported()).toBe(false);

      const failingBridge: IWakeOnLanNativeModule = {
        isAvailable: jest.fn().mockRejectedValue(new Error('native error')),
        sendMagicPacket: jest.fn(),
      };
      const serviceFailing = new WakeOnLanService(failingBridge);
      expect(await serviceFailing.isSupported()).toBe(false);
    });

    it('passes canonical MAC, port, broadcast address, and repeat count to native module', async () => {
      const mockBridge: IWakeOnLanNativeModule = {
        isAvailable: jest.fn().mockResolvedValue(true),
        sendMagicPacket: jest.fn().mockResolvedValue({
          success: true,
          packetsSent: 3,
          destinations: ['192.168.1.255', '255.255.255.255'],
        }),
      };

      const service = new WakeOnLanService(mockBridge);
      const res = await service.wake('aa-bb-cc-dd-ee-ff', {
        port: 9,
        broadcastAddress: '192.168.1.255',
        repeatCount: 3,
        delayMs: 30,
      });

      expect(mockBridge.sendMagicPacket).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', {
        port: 9,
        broadcastAddress: '192.168.1.255',
        repeatCount: 3,
        delayMs: 30,
      });
      expect(res.success).toBe(true);
      expect(res.packetsSent).toBe(3);
      expect(res.destinations).toEqual(['192.168.1.255', '255.255.255.255']);
    });

    it('throws TVConnectionError if native UDP send fails', async () => {
      const mockBridge: IWakeOnLanNativeModule = {
        isAvailable: jest.fn().mockResolvedValue(true),
        sendMagicPacket: jest.fn().mockRejectedValue(new Error('Socket send failed: EHOSTUNREACH')),
      };

      const service = new WakeOnLanService(mockBridge);
      await expect(service.wake('AA:BB:CC:DD:EE:FF')).rejects.toThrow(TVConnectionError);
    });
  });

  // =========================================================================
  // PART 2 & 7 — WAKE-ON-LAN & AUTOMATIC CONNECTION RESTORATION (APPLICATION LAYER)
  // =========================================================================
  describe('WakeTVUseCase & Automatic Connection Restoration', () => {
    let mockWakeService: ITVWakeService;
    let mockAdapter: MockTVAdapter;
    let connectionManager: TVConnectionManager;

    beforeEach(() => {
      mockWakeService = {
        isSupported: jest.fn().mockResolvedValue(true),
        wake: jest.fn().mockResolvedValue({
          success: true,
          packetsSent: 3,
          destinations: ['192.168.1.255'],
        }),
      };

      mockAdapter = new MockTVAdapter();
      connectionManager = new TVConnectionManager({
        supports: () => true,
        create: () => mockAdapter,
      });
    });

    it('rejects wake when device has no MAC address or invalid MAC address', async () => {
      const useCase = new WakeTVUseCase(mockWakeService, connectionManager);
      const noMacDevice = makeWebOSDevice({ macAddress: undefined });

      await expect(useCase.execute(noMacDevice)).rejects.toThrow(
        /A valid TV MAC address is required/,
      );

      const invalidMacDevice = makeWebOSDevice({ macAddress: 'invalid-mac' });
      await expect(useCase.execute(invalidMacDevice)).rejects.toThrow(
        /A valid TV MAC address is required/,
      );
      expect(mockWakeService.wake).not.toHaveBeenCalled();
    });

    it('executes successful wake workflow: sends packet, waits, and connects once TV boots', async () => {
      const stages: WakeStage[] = [];
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });

      const useCase = new WakeTVUseCase(mockWakeService, connectionManager);
      const result = await useCase.execute(device, {
        initialBootDelayMs: 10,
        probeIntervalMs: 10,
        wakeTimeoutMs: 5000,
        onProgress: stage => stages.push(stage),
      });

      expect(mockWakeService.wake).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', expect.any(Object));
      expect(stages).toEqual(['sending', 'waiting', 'connecting', 'connected']);
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);
    });

    it('retries connection until TV boots when initial connection attempts fail', async () => {
      let attempts = 0;
      // Simulate TV taking 3 attempts to boot
      const failingUntilBootAdapter = new MockTVAdapter();
      const origConnect = failingUntilBootAdapter.connect.bind(failingUntilBootAdapter);
      failingUntilBootAdapter.connect = jest.fn().mockImplementation(async (dev: TVDevice) => {
        attempts++;
        if (attempts < 3) {
          throw new TVConnectionError('Connection refused (TV booting)');
        }
        return origConnect(dev);
      });

      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => failingUntilBootAdapter,
      });

      const stages: WakeStage[] = [];
      const device = makeWebOSDevice({ macAddress: '11:22:33:44:55:66' });
      const useCase = new WakeTVUseCase(mockWakeService, manager);

      const result = await useCase.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
        onProgress: stage => stages.push(stage),
      });

      expect(attempts).toBe(3);
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(manager.getState()).toBe(TVConnectionState.Connected);
      expect(stages).toContain('connecting');
      expect(stages[stages.length - 1]).toBe('connected');
    });

    it('reports failure when TV does not power on within wake timeout', async () => {
      const neverBootingAdapter = new MockTVAdapter();
      neverBootingAdapter.connect = jest
        .fn()
        .mockRejectedValue(new TVConnectionError('Host unreachable'));

      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => neverBootingAdapter,
      });

      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      const useCase = new WakeTVUseCase(mockWakeService, manager);

      const stages: WakeStage[] = [];
      const result = await useCase.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 15,
        wakeTimeoutMs: 50, // Short timeout for test
        onProgress: stage => stages.push(stage),
      });

      expect(result.success).toBe(false);
      expect(result.restored).toBe(false);
      expect(result.error).toBeDefined();
      expect(stages[stages.length - 1]).toBe('failed');
    });

    it('supports cancellation via abortSignal', async () => {
      const neverBootingAdapter = new MockTVAdapter();
      neverBootingAdapter.connect = jest
        .fn()
        .mockRejectedValue(new TVConnectionError('Host unreachable'));

      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => neverBootingAdapter,
      });

      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      const useCase = new WakeTVUseCase(mockWakeService, manager);

      const abortSignal = { aborted: false };
      // Cancel after 20ms
      setTimeout(() => {
        abortSignal.aborted = true;
      }, 20);

      await expect(
        useCase.execute(device, {
          initialBootDelayMs: 5,
          probeIntervalMs: 10,
          wakeTimeoutMs: 5000,
          abortSignal,
        }),
      ).rejects.toThrow(/cancelled/i);
    });

    it('coalesces duplicate in-flight wake workflows for the same device', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      const useCase = new WakeTVUseCase(mockWakeService, connectionManager);

      // Start two concurrent wake calls
      const p1 = useCase.execute(device, { initialBootDelayMs: 20, probeIntervalMs: 10 });
      const p2 = useCase.execute(device, { initialBootDelayMs: 20, probeIntervalMs: 10 });

      // They should return the exact same promise
      expect(p1).toBe(p2);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      // Magic packet only sent once
      expect(mockWakeService.wake).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // PHASE 8.2 — SINGLE POWER ACTION OWNER & RACE-SAFE COORDINATION
  // =========================================================================
  describe('PowerTVUseCase & Race-Safe Coordination (Phase 8.2)', () => {
    let mockWakeService: ITVWakeService;
    let mockAdapter: MockTVAdapter;
    let connectionManager: TVConnectionManager;
    let sendRemoteCommand: SendRemoteCommandUseCase;
    let wakeTV: WakeTVUseCase;
    let powerTV: PowerTVUseCase;

    beforeEach(() => {
      mockWakeService = {
        isSupported: jest.fn().mockResolvedValue(true),
        wake: jest.fn().mockResolvedValue({
          success: true,
          packetsSent: 3,
          destinations: ['192.168.1.255'],
        }),
      };

      mockAdapter = new MockTVAdapter();
      connectionManager = new TVConnectionManager({
        supports: () => true,
        create: () => mockAdapter,
      });

      sendRemoteCommand = new SendRemoteCommandUseCase(connectionManager);
      wakeTV = new WakeTVUseCase(mockWakeService, connectionManager);
      powerTV = new PowerTVUseCase(connectionManager, sendRemoteCommand, wakeTV);
    });

    it('1. Connected state -> Power press executes powerOff command, does not send wake packet', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      await connectionManager.connect(device);
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);

      const sendSpy = jest.spyOn(sendRemoteCommand, 'execute').mockResolvedValue(undefined);
      const wakeSpy = jest.spyOn(wakeTV, 'execute');

      const result = await powerTV.execute(device);

      expect(result.action).toBe('powerOff');
      expect(result.success).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith({ type: 'powerOff' });
      expect(wakeSpy).not.toHaveBeenCalled();
      expect(mockWakeService.wake).not.toHaveBeenCalled();
    });

    it('2. Disconnected state + valid MAC -> Power press initiates WakeTVUseCase', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      expect(connectionManager.getState()).toBe(TVConnectionState.Disconnected);

      const result = await powerTV.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
      });

      expect(result.action).toBe('wake');
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(mockWakeService.wake).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', expect.any(Object));
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);
    });

    it('3. Connecting state + valid MAC -> Power press initiates WakeTVUseCase without being blocked', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });

      // Simulate connectionManager stuck in Connecting
      mockAdapter.connect = jest.fn().mockImplementation(() => new Promise(() => {})); // hangs
      connectionManager.connect(device).catch(() => undefined);
      await Promise.resolve();
      await Promise.resolve();
      expect(connectionManager.getState()).toBe(TVConnectionState.Connecting);

      // Restore connect implementation for when TV boots after wake
      mockAdapter.connect = jest.fn().mockResolvedValue(undefined);

      const result = await powerTV.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
      });

      expect(result.action).toBe('wake');
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(mockWakeService.wake).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', expect.any(Object));
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);
    });

    it('4. Reconnecting state + valid MAC -> Power press initiates WakeTVUseCase', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      await connectionManager.connect(device);

      // Simulate connection loss -> Reconnecting
      mockAdapter.simulateConnectionLoss(new TVConnectionError('TV dropped connection'));

      const result = await powerTV.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
      });

      expect(result.action).toBe('wake');
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(mockWakeService.wake).toHaveBeenCalled();
    });

    it('5. Missing or invalid MAC -> returns macRequired action and does not send packet', async () => {
      const deviceNoMac = makeWebOSDevice({ macAddress: undefined });
      const res1 = await powerTV.execute(deviceNoMac);
      expect(res1.action).toBe('macRequired');
      expect(res1.success).toBe(false);
      expect(mockWakeService.wake).not.toHaveBeenCalled();

      const deviceBadMac = makeWebOSDevice({ macAddress: '00:00:00:00:00:00' });
      const res2 = await powerTV.execute(deviceBadMac);
      expect(res2.action).toBe('macRequired');
      expect(res2.success).toBe(false);
      expect(mockWakeService.wake).not.toHaveBeenCalled();
    });

    it('6. Concurrent startup connect and user wake: pre-wake attempt is cancelled and wake restores connection', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });

      // Startup connects to offline TV (hangs)
      let preWakeCancelled = false;
      mockAdapter.connect = jest.fn().mockImplementation(() => {
        return new Promise<void>(() => {});
      });

      const startupPromise = connectionManager.connect(device).catch(err => {
        if (err?.code === 'cancelled') {
          preWakeCancelled = true;
        }
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(connectionManager.getState()).toBe(TVConnectionState.Connecting);

      // User presses Power while startup connect is in flight
      // TV boots and succeeds
      mockAdapter.connect = jest.fn().mockResolvedValue(undefined);

      const result = await powerTV.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
      });

      await startupPromise;
      expect(preWakeCancelled).toBe(true);
      expect(result.action).toBe('wake');
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);
    });

    it('7. Duplicate Power taps: coalesced into a single wake workflow', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });

      const p1 = powerTV.execute(device, { initialBootDelayMs: 20, probeIntervalMs: 10 });
      const p2 = powerTV.execute(device, { initialBootDelayMs: 20, probeIntervalMs: 10 });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(mockWakeService.wake).toHaveBeenCalledTimes(1);
    });

    it('8. TV switching during wake: abortSignal cancels wake cleanly', async () => {
      const device1 = makeWebOSDevice({ id: 'tv-1', macAddress: 'AA:BB:CC:DD:EE:FF' });
      const abortSignal = { aborted: false };

      mockAdapter.connect = jest.fn().mockRejectedValue(new TVConnectionError('TV booting'));

      setTimeout(() => {
        abortSignal.aborted = true;
      }, 20);

      await expect(
        powerTV.execute(device1, {
          initialBootDelayMs: 5,
          probeIntervalMs: 10,
          wakeTimeoutMs: 3000,
          abortSignal,
        }),
      ).rejects.toThrow(/cancelled/i);
    });

    it('9. Foreground event during wake: does not launch competing parallel reconnect', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      const reconnectSpy = jest.spyOn(connectionManager, 'reconnect');

      // Start wake
      const wakePromise = powerTV.execute(device, {
        initialBootDelayMs: 10,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
      });

      // App comes to foreground while wake is in progress
      expect(connectionManager.isWakeInProgress(device.id)).toBe(true);
      await connectionManager.handleAppForeground();

      // Foreground should NOT have launched competing reconnect
      expect(reconnectSpy).not.toHaveBeenCalled();

      await wakePromise;
      expect(connectionManager.isWakeInProgress(device.id)).toBe(false);
    });

    it('10. Wake packet sent successfully but TV remains offline: reports timeout without false connected state', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      mockAdapter.connect = jest.fn().mockRejectedValue(new TVConnectionError('Host unreachable'));

      const result = await powerTV.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 50,
      });

      expect(result.action).toBe('wake');
      expect(result.success).toBe(false);
      expect(result.restored).toBe(false);
      expect(result.error).toBeDefined();
      expect(connectionManager.getState()).not.toBe(TVConnectionState.Connected);
    });

    it('11. Wake followed by successful authenticated SSAP connection: transitions to Connected', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      const stages: WakeStage[] = [];

      const result = await powerTV.execute(device, {
        initialBootDelayMs: 5,
        probeIntervalMs: 10,
        wakeTimeoutMs: 3000,
        onProgress: s => stages.push(s),
      });

      expect(stages).toContain('sending');
      expect(stages).toContain('waiting');
      expect(stages).toContain('connecting');
      expect(stages).toContain('connected');
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);
    });

    it('12. No regressions to remote command handling: commands function after wake reconnection', async () => {
      const device = makeWebOSDevice({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      await powerTV.execute(device, { initialBootDelayMs: 5, probeIntervalMs: 10 });
      expect(connectionManager.getState()).toBe(TVConnectionState.Connected);

      await sendRemoteCommand.execute({ type: 'volumeUp' });
      expect(mockAdapter.commands).toContainEqual(expect.objectContaining({ command: 'volumeUp' }));
    });
  });
});
