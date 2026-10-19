import {
  createMSearchPacket,
  extractHostFromLocation,
  extractUUIDFromUSN,
  isLocalIPv4Address,
  LG_WEBOS_SSDP_ST,
  parseSSDPResponse,
  SSDP_MULTICAST_ADDRESS,
  SSDP_MULTICAST_PORT,
} from '../../../infrastructure/discovery/ssdp/SSDPParser';
import { parseUPnPDeviceXml } from '../../../infrastructure/discovery/ssdp/UPnPDeviceDescriptionParser';

describe('SSDPParser', () => {
  describe('createMSearchPacket', () => {
    it('generates a compliant SSDP M-SEARCH packet', () => {
      const packet = createMSearchPacket(LG_WEBOS_SSDP_ST, 3);
      expect(packet).toContain('M-SEARCH * HTTP/1.1');
      expect(packet).toContain(`HOST: ${SSDP_MULTICAST_ADDRESS}:${SSDP_MULTICAST_PORT}`);
      expect(packet).toContain('MAN: "ssdp:discover"');
      expect(packet).toContain('MX: 3');
      expect(packet).toContain(`ST: ${LG_WEBOS_SSDP_ST}`);
    });

    it('clamps MX between 1 and 5', () => {
      expect(createMSearchPacket(LG_WEBOS_SSDP_ST, 0)).toContain('MX: 1');
      expect(createMSearchPacket(LG_WEBOS_SSDP_ST, 10)).toContain('MX: 5');
    });
  });

  describe('parseSSDPResponse', () => {
    it('parses valid HTTP/1.1 200 OK responses with case-insensitive headers', () => {
      const raw = [
        'HTTP/1.1 200 OK',
        'Cache-Control: max-age=1800',
        'Location: http://192.168.1.50:1924/',
        'Server: Linux/3.10.19 webOS TV/05.80.55',
        'ST: urn:lge-com:service:webos-second-screen:1',
        'USN: uuid:12345678-1234-1234-1234-123456789abc::urn:lge-com:service:webos-second-screen:1',
        '',
      ].join('\r\n');

      const parsed = parseSSDPResponse(raw);
      expect(parsed).not.toBeNull();
      expect(parsed?.status).toBe(200);
      expect(parsed?.headers.st).toBe('urn:lge-com:service:webos-second-screen:1');
      expect(parsed?.headers.location).toBe('http://192.168.1.50:1924/');
      expect(parsed?.headers.usn).toBe(
        'uuid:12345678-1234-1234-1234-123456789abc::urn:lge-com:service:webos-second-screen:1',
      );
    });

    it('rejects malformed or non-200 responses', () => {
      expect(parseSSDPResponse('')).toBeNull();
      expect(parseSSDPResponse('garbage')).toBeNull();
      expect(parseSSDPResponse('HTTP/1.1 404 Not Found\r\n\r\n')).toBeNull();
      expect(parseSSDPResponse('HTTP/1.1 500 Internal Error\r\n\r\n')).toBeNull();
    });
  });

  describe('isLocalIPv4Address', () => {
    it('accepts valid private IPv4 addresses', () => {
      expect(isLocalIPv4Address('192.168.0.1')).toBe(true);
      expect(isLocalIPv4Address('192.168.1.150')).toBe(true);
      expect(isLocalIPv4Address('10.0.0.5')).toBe(true);
      expect(isLocalIPv4Address('10.254.1.1')).toBe(true);
      expect(isLocalIPv4Address('172.16.0.1')).toBe(true);
      expect(isLocalIPv4Address('172.31.255.255')).toBe(true);
      expect(isLocalIPv4Address('127.0.0.1')).toBe(true);
      expect(isLocalIPv4Address('169.254.10.20')).toBe(true);
    });

    it('rejects public internet IP addresses and invalid addresses', () => {
      expect(isLocalIPv4Address('8.8.8.8')).toBe(false);
      expect(isLocalIPv4Address('1.1.1.1')).toBe(false);
      expect(isLocalIPv4Address('172.32.0.1')).toBe(false); // outside 172.16-31
      expect(isLocalIPv4Address('172.15.255.255')).toBe(false);
      expect(isLocalIPv4Address('256.0.0.1')).toBe(false);
      expect(isLocalIPv4Address('192.168.1')).toBe(false);
      expect(isLocalIPv4Address('192.168.1.1.1')).toBe(false);
      expect(isLocalIPv4Address('localhost')).toBe(false);
      expect(isLocalIPv4Address('192.168.1.1; rm -rf /')).toBe(false);
      expect(isLocalIPv4Address('')).toBe(false);
    });
  });

  describe('extractUUIDFromUSN and extractHostFromLocation', () => {
    it('extracts UUID from USN', () => {
      expect(
        extractUUIDFromUSN('uuid:ABCDEF01-1234-5678-9ABC-DEF012345678::urn:lge-com:service:...'),
      ).toBe('abcdef01-1234-5678-9abc-def012345678');
      expect(extractUUIDFromUSN('urn:other')).toBeNull();
      expect(extractUUIDFromUSN(undefined)).toBeNull();
    });

    it('extracts host and port from location URL', () => {
      expect(extractHostFromLocation('http://192.168.1.50:1924/')).toEqual({
        host: '192.168.1.50',
        port: 1924,
      });
      expect(extractHostFromLocation('http://10.0.0.1/')).toEqual({
        host: '10.0.0.1',
        port: 80,
      });
      expect(extractHostFromLocation('not a url')).toBeNull();
      expect(extractHostFromLocation(undefined)).toBeNull();
    });
  });
});

describe('UPnPDeviceDescriptionParser', () => {
  it('extracts friendlyName and model details from UPnP XML', () => {
    const xml = `
      <?xml version="1.0"?>
      <root xmlns="urn:schemas-upnp-org:device-1-0">
        <device>
          <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
          <friendlyName>[LG] webOS TV OLED55C1PUB</friendlyName>
          <manufacturer>LG Electronics</manufacturer>
          <modelName>LG webOS TV</modelName>
          <modelNumber>OLED55C1PUB</modelNumber>
        </device>
      </root>
    `;

    const info = parseUPnPDeviceXml(xml);
    expect(info.friendlyName).toBe('[LG] webOS TV OLED55C1PUB');
    expect(info.manufacturer).toBe('LG Electronics');
    expect(info.modelName).toBe('LG webOS TV');
    expect(info.modelNumber).toBe('OLED55C1PUB');
  });

  it('handles CDATA and empty/missing tags gracefully', () => {
    const xml = `
      <device>
        <friendlyName><![CDATA[Living Room TV]]></friendlyName>
        <modelName></modelName>
      </device>
    `;
    const info = parseUPnPDeviceXml(xml);
    expect(info.friendlyName).toBe('Living Room TV');
    expect(info.modelName).toBeUndefined();
    expect(info.modelNumber).toBeUndefined();
  });

  it('handles invalid or empty XML without throwing', () => {
    expect(parseUPnPDeviceXml('')).toEqual({});
    expect(parseUPnPDeviceXml('random text')).toEqual({});
  });
});
