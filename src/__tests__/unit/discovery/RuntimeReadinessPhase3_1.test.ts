import { Platform } from 'react-native';
import {
  canAttemptCapability,
  hasCapability,
  isCapabilityUnknown,
  isCapabilityUnsupported,
  UNKNOWN_CAPABILITIES,
} from '../../../domain/entities/TVCapabilities';
import { TVPlatform } from '../../../domain/enums/TVPlatform';
import { TVProtocol } from '../../../domain/enums/TVProtocol';
import { TVAuthorizationError } from '../../../domain/errors/TVAuthorizationError';
import { TVConnectionError, TVTimeoutError } from '../../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../../domain/errors/TVPairingError';
import { TVUnsupportedOperationError } from '../../../domain/errors/TVUnsupportedOperationError';
import { deriveCapabilities } from '../../../infrastructure/adapters/lg-webos/LGWebOSCommandMapper';
import { isLocalIPv4Address } from '../../../infrastructure/discovery/ssdp/SSDPParser';
import { NativeUdpSocketTransport } from '../../../infrastructure/discovery/transport/NativeUdpSocketTransport';
import { FakeWebOSServer } from '../../../testing/FakeWebOSServer';
import { makeMockDevice } from '../../../testing/fixtures';
import { LGWebOSAdapter } from '../../../infrastructure/adapters/lg-webos/LGWebOSAdapter';
import { InMemoryCredentialStorage } from '../../../infrastructure/storage/InMemoryCredentialStorage';

describe('Phase 3.1 Runtime Readiness Tests', () => {
  describe('Capability Detection & Three-State Transitions', () => {
    it('does not assume core capabilities when getServiceList returns null', () => {
      const caps = deriveCapabilities(null, false);
      expect(isCapabilityUnknown(caps, 'volumeControl')).toBe(true);
      expect(isCapabilityUnknown(caps, 'channelControl')).toBe(true);
      expect(isCapabilityUnknown(caps, 'powerOff')).toBe(true);
      expect(isCapabilityUnknown(caps, 'appLaunching')).toBe(true);
      expect(isCapabilityUnsupported(caps, 'pointerControl')).toBe(true);
      expect(isCapabilityUnsupported(caps, 'powerOn')).toBe(true);
    });

    it('allows unknown capabilities to be attempted safely', () => {
      const caps = UNKNOWN_CAPABILITIES;
      expect(canAttemptCapability(caps, 'volumeControl')).toBe(true);
      expect(canAttemptCapability(caps, 'channelControl')).toBe(true);
      expect(hasCapability(caps, 'volumeControl')).toBe(false);
    });

    it('promotes an unknown capability to supported upon successful command execution', async () => {
      const server = new FakeWebOSServer({
        services: null, // Service list unavailable
      });
      const adapter = new LGWebOSAdapter({
        credentialStorage: new InMemoryCredentialStorage(),
        webSocketFactory: server.factory,
      });

      const device = makeMockDevice({
        platform: TVPlatform.WebOS,
        protocol: TVProtocol.LGWebOSSSAP,
        ipAddress: '192.168.1.10',
      });

      await adapter.connect(device);
      expect(adapter.getCapabilities().volumeControl).toBe('unknown');

      // Attempt volumeUp
      await adapter.volumeUp();

      // Successfully executed -> promoted to supported
      expect(adapter.getCapabilities().volumeControl).toBe('supported');
    });

    it('demotes an unknown capability to unsupported when the TV returns 404', async () => {
      const server = new FakeWebOSServer({
        services: null, // Service list unavailable
        unsupportedUris: ['ssap://system.launcher/launch'],
      });

      const adapter = new LGWebOSAdapter({
        credentialStorage: new InMemoryCredentialStorage(),
        webSocketFactory: server.factory,
      });

      const device = makeMockDevice({
        platform: TVPlatform.WebOS,
        protocol: TVProtocol.LGWebOSSSAP,
        ipAddress: '192.168.1.10',
      });

      await adapter.connect(device);
      expect(adapter.getCapabilities().appLaunching).toBe('unknown');

      // Attempt launchApp
      await expect(adapter.launchApp('netflix')).rejects.toBeInstanceOf(TVUnsupportedOperationError);

      // Now marked as unsupported to prevent future futile attempts
      expect(adapter.getCapabilities().appLaunching).toBe('unsupported');
    });

    it('does NOT mark a capability as unsupported when a 401 authorization error occurs', async () => {
      const server = new FakeWebOSServer({
        services: null, // Service list unavailable
        unauthorizedUris: ['ssap://system.launcher/launch'],
      });

      const adapter = new LGWebOSAdapter({
        credentialStorage: new InMemoryCredentialStorage(),
        webSocketFactory: server.factory,
      });

      const device = makeMockDevice({
        platform: TVPlatform.WebOS,
        protocol: TVProtocol.LGWebOSSSAP,
        ipAddress: '192.168.1.10',
      });

      await adapter.connect(device);
      expect(adapter.getCapabilities().appLaunching).toBe('unknown');

      // Attempt launchApp which returns 401
      await expect(adapter.launchApp('netflix')).rejects.toBeInstanceOf(TVAuthorizationError);

      // Capability MUST remain 'unknown' (or supported), NOT 'unsupported'
      expect(adapter.getCapabilities().appLaunching).toBe('unknown');
    });
  });

  describe('Error Classification Distinctions', () => {
    it('distinguishes unsupported, authorization, pairing, network, and timeout errors', () => {
      const unsupportedErr = new TVUnsupportedOperationError('pointer', 'not supported');
      const authErr = new TVAuthorizationError('401 unauthorized');
      const pairingErr = new TVPairingError('rejected key');
      const networkErr = new TVConnectionError('socket dropped', 'connection_failed');
      const timeoutErr = new TVTimeoutError('request timed out');

      expect(unsupportedErr.code).toBe('unsupported_operation');
      expect(authErr.code).toBe('unauthorized');
      expect(pairingErr.code).toBe('pairing_failed');
      expect(networkErr.code).toBe('connection_failed');
      expect(timeoutErr.code).toBe('timeout');

      expect(unsupportedErr).toBeInstanceOf(TVUnsupportedOperationError);
      expect(authErr).toBeInstanceOf(TVAuthorizationError);
      expect(pairingErr).toBeInstanceOf(TVPairingError);
      expect(networkErr).toBeInstanceOf(TVConnectionError);
      expect(timeoutErr).toBeInstanceOf(TVTimeoutError);
    });
  });

  describe('Strict IPv4 Validation', () => {
    it('accepts valid RFC 1918 and loopback addresses', () => {
      expect(isLocalIPv4Address('192.168.1.1')).toBe(true);
      expect(isLocalIPv4Address('10.0.0.1')).toBe(true);
      expect(isLocalIPv4Address('172.16.0.1')).toBe(true);
      expect(isLocalIPv4Address('172.31.255.255')).toBe(true);
      expect(isLocalIPv4Address('127.0.0.1')).toBe(true);
      expect(isLocalIPv4Address('169.254.1.1')).toBe(true);
    });

    it('rejects leading zeroes in octets to prevent octal ambiguity', () => {
      expect(isLocalIPv4Address('192.168.01.1')).toBe(false);
      expect(isLocalIPv4Address('10.001.0.1')).toBe(false);
      expect(isLocalIPv4Address('192.168.1.00')).toBe(false);
    });

    it('rejects invalid octets, public addresses, and malformed strings', () => {
      expect(isLocalIPv4Address('8.8.8.8')).toBe(false);
      expect(isLocalIPv4Address('1.1.1.1')).toBe(false);
      expect(isLocalIPv4Address('192.168.1.256')).toBe(false);
      expect(isLocalIPv4Address('192.168.1')).toBe(false);
      expect(isLocalIPv4Address('192.168.1.1.1')).toBe(false);
      expect(isLocalIPv4Address('192.168.1.foo')).toBe(false);
      expect(isLocalIPv4Address('')).toBe(false);
    });
  });

  describe('NativeUdpSocketTransport Behavior on iOS', () => {
    it('reports unavailable on iOS due to Apple multicast entitlement requirement', () => {
      const originalOS = Platform.OS;
      try {
        (Platform as unknown as { OS: string }).OS = 'ios';
        const transport = new NativeUdpSocketTransport();
        expect(transport.isAvailable()).toBe(false);
      } finally {
        (Platform as unknown as { OS: string }).OS = originalOS;
      }
    });

    it('throws TVDiscoveryError with unsupported_transport when bind is attempted on iOS', async () => {
      const originalOS = Platform.OS;
      try {
        (Platform as unknown as { OS: string }).OS = 'ios';
        const transport = new NativeUdpSocketTransport();
        await expect(transport.bind(0)).rejects.toMatchObject({
          code: 'unsupported_transport',
        });
      } finally {
        (Platform as unknown as { OS: string }).OS = originalOS;
      }
    });
  });
});
