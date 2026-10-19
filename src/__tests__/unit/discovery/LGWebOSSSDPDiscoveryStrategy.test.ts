import { TVBrand } from '../../../domain/enums/TVBrand';
import { TVPlatform } from '../../../domain/enums/TVPlatform';
import { TVProtocol } from '../../../domain/enums/TVProtocol';
import { TVDiscoveryError } from '../../../domain/errors/TVDiscoveryError';
import { LGWebOSSSDPDiscoveryStrategy } from '../../../infrastructure/discovery/discovery-strategies/LGWebOSSSDPDiscoveryStrategy';
import { FakeUdpSocketTransport } from '../../../testing/FakeUdpSocketTransport';

describe('LGWebOSSSDPDiscoveryStrategy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const validResponse = [
    'HTTP/1.1 200 OK',
    'Location: http://192.168.1.100:1924/',
    'ST: urn:lge-com:service:webos-second-screen:1',
    'USN: uuid:11111111-2222-3333-4444-555555555555::urn:lge-com:service:webos-second-screen:1',
    '',
  ].join('\r\n');

  it('broadcasts M-SEARCH and discovers an LG TV with UPnP metadata', async () => {
    const transport = new FakeUdpSocketTransport();
    const fakeXml = `
      <device>
        <friendlyName>[LG] OLED TV</friendlyName>
        <modelName>OLED55C1</modelName>
      </device>
    `;
    const xmlFetcher = jest.fn().mockResolvedValue(fakeXml);

    const strategy = new LGWebOSSSDPDiscoveryStrategy(transport, {
      xmlFetcher,
      defaultTimeoutMs: 3000,
    });

    const onDeviceFound = jest.fn();
    const discoverPromise = strategy.discover({ onDeviceFound });

    // Allow bind and send to process
    await Promise.resolve();

    expect(transport.bound).toBe(true);
    expect(transport.sentDatagrams).toHaveLength(1);
    expect(transport.sentDatagrams[0].message).toContain('M-SEARCH');
    expect(transport.sentDatagrams[0].address).toBe('239.255.255.250');

    // Simulate incoming response
    transport.simulateIncoming(validResponse, {
      address: '192.168.1.100',
      port: 1900,
      family: 'IPv4',
      size: validResponse.length,
    });

    // Advance event loop for async xml fetch
    await Promise.resolve();
    await Promise.resolve();

    expect(onDeviceFound).toHaveBeenCalledTimes(1);
    const foundDevice = onDeviceFound.mock.calls[0][0];
    expect(foundDevice).toMatchObject({
      id: 'lg-11111111-2222-3333-4444-555555555555',
      name: '[LG] OLED TV',
      brand: TVBrand.LG,
      platform: TVPlatform.WebOS,
      protocol: TVProtocol.LGWebOSSSAP,
      ipAddress: '192.168.1.100',
      model: 'OLED55C1',
    });

    // Fast-forward timeout to complete discovery
    jest.advanceTimersByTime(3000);
    const devices = await discoverPromise;

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe('lg-11111111-2222-3333-4444-555555555555');
    expect(transport.closed).toBe(true);
  });

  it('deduplicates multiple SSDP responses from the same TV', async () => {
    const transport = new FakeUdpSocketTransport();
    const strategy = new LGWebOSSSDPDiscoveryStrategy(transport, {
      xmlFetcher: async () => '',
      defaultTimeoutMs: 2000,
    });

    const onDeviceFound = jest.fn();
    const discoverPromise = strategy.discover({ onDeviceFound });
    await Promise.resolve();

    // Send twice
    transport.simulateIncoming(validResponse, { address: '192.168.1.100', port: 1900 });
    transport.simulateIncoming(validResponse, { address: '192.168.1.100', port: 1900 });

    await Promise.resolve();
    await Promise.resolve();

    expect(onDeviceFound).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000);
    const devices = await discoverPromise;
    expect(devices).toHaveLength(1);
  });

  it('ignores non-LG devices and public internet addresses', async () => {
    const transport = new FakeUdpSocketTransport();
    const strategy = new LGWebOSSSDPDiscoveryStrategy(transport, {
      defaultTimeoutMs: 1000,
    });

    const onDeviceFound = jest.fn();
    const discoverPromise = strategy.discover({ onDeviceFound });
    await Promise.resolve();

    // 1. Response for Philips/Sonos/etc.
    const nonLg = [
      'HTTP/1.1 200 OK',
      'Location: http://192.168.1.20:1924/',
      'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
      'USN: uuid:99999999-9999::urn:schemas-upnp-org...',
      '',
    ].join('\r\n');
    transport.simulateIncoming(nonLg, { address: '192.168.1.20', port: 1900 });

    // 2. Response with public IP address (SSRF attempt)
    const publicIp = [
      'HTTP/1.1 200 OK',
      'Location: http://8.8.8.8:1924/',
      'ST: urn:lge-com:service:webos-second-screen:1',
      'USN: uuid:88888888-8888::urn:lge-com:service:webos-second-screen:1',
      '',
    ].join('\r\n');
    transport.simulateIncoming(publicIp, { address: '8.8.8.8', port: 1900 });

    await Promise.resolve();

    expect(onDeviceFound).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    const devices = await discoverPromise;
    expect(devices).toHaveLength(0);
  });

  it('supports cancellation via AbortSignal', async () => {
    const transport = new FakeUdpSocketTransport();
    const strategy = new LGWebOSSSDPDiscoveryStrategy(transport, { defaultTimeoutMs: 5000 });

    const controller = new AbortController();
    const discoverPromise = strategy.discover({ signal: controller.signal });
    await Promise.resolve();

    controller.abort();
    const devices = await discoverPromise;

    expect(devices).toEqual([]);
    expect(transport.closed).toBe(true);
  });

  it('throws TVDiscoveryError when UDP transport is unavailable', async () => {
    const transport = new FakeUdpSocketTransport({ available: false });
    const strategy = new LGWebOSSSDPDiscoveryStrategy(transport);

    expect(strategy.isAvailable()).toBe(false);
    await expect(strategy.discover()).rejects.toBeInstanceOf(TVDiscoveryError);
  });
});
