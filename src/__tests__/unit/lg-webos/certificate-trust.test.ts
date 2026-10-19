import {
  LGTVCertificateTrustManager,
  NativeTLSModule,
  TLSStatus,
} from '../../../infrastructure/adapters/lg-webos/LGTVCertificateTrustManager';
import { InMemoryCredentialStorage } from '../../../infrastructure/storage/InMemoryCredentialStorage';

describe('LGTVCertificateTrustManager', () => {
  let storage: InMemoryCredentialStorage;

  beforeEach(() => {
    storage = new InMemoryCredentialStorage();
  });

  const validStatus: TLSStatus = {
    domain: '192.168.1.139',
    validationSuccess: true,
    leafSummary: 'LGE TV SSG',
    leafFingerprint: 'AA11BB22CC33DD44EE55FF66',
    errorDomain: '',
    errorCode: 0,
    errorDescription: '',
  };

  it('returns null when native module is unavailable or returns no domain', async () => {
    const manager = new LGTVCertificateTrustManager(storage, null as unknown as NativeTLSModule);
    expect(await manager.getLastStatus()).toBeNull();

    const emptyModule: NativeTLSModule = {
      getLastTLSStatus: async () => ({
        domain: '',
        validationSuccess: false,
        leafSummary: '',
        leafFingerprint: '',
        errorDomain: '',
        errorCode: 0,
        errorDescription: '',
      }),
    };
    const manager2 = new LGTVCertificateTrustManager(storage, emptyModule);
    expect(await manager2.getLastStatus()).toBeNull();
  });

  it('trusts and persists fingerprint on first use (TOFU)', async () => {
    const manager = new LGTVCertificateTrustManager(storage);
    const result = await manager.verifyTrust('tv-1', validStatus);

    expect(result).toEqual({
      trusted: true,
      isFirstUse: true,
      certificateChanged: false,
      fingerprint: 'AA11BB22CC33DD44EE55FF66',
    });
    expect(await storage.get('tls_fp_tv-1')).toBe('AA11BB22CC33DD44EE55FF66');
  });

  it('confirms subsequent connections with matching fingerprint', async () => {
    const manager = new LGTVCertificateTrustManager(storage);
    await storage.set('tls_fp_tv-1', 'AA11BB22CC33DD44EE55FF66');

    const result = await manager.verifyTrust('tv-1', validStatus);

    expect(result).toEqual({
      trusted: true,
      isFirstUse: false,
      certificateChanged: false,
      fingerprint: 'AA11BB22CC33DD44EE55FF66',
    });
  });

  it('detects and rejects changed certificate fingerprints', async () => {
    const manager = new LGTVCertificateTrustManager(storage);
    await storage.set('tls_fp_tv-1', 'DIFFERENT_FINGERPRINT_123');

    const result = await manager.verifyTrust('tv-1', validStatus);

    expect(result).toEqual({
      trusted: false,
      isFirstUse: false,
      certificateChanged: true,
      fingerprint: 'AA11BB22CC33DD44EE55FF66',
    });
  });

  it('allows non-TLS connections without storing fingerprint', async () => {
    const manager = new LGTVCertificateTrustManager(storage);
    const nonTLSStatus: TLSStatus = {
      domain: '192.168.1.139',
      validationSuccess: true,
      leafSummary: '',
      leafFingerprint: '',
      errorDomain: '',
      errorCode: 0,
      errorDescription: '',
    };

    const result = await manager.verifyTrust('tv-1', nonTLSStatus);

    expect(result).toEqual({
      trusted: true,
      isFirstUse: false,
      certificateChanged: false,
      fingerprint: '',
    });
    expect(await storage.get('tls_fp_tv-1')).toBeNull();
  });

  it('resets stored certificate trust', async () => {
    const manager = new LGTVCertificateTrustManager(storage);
    await storage.set('tls_fp_tv-1', 'AA11BB22CC33DD44EE55FF66');

    await manager.resetTrust('tv-1');
    expect(await storage.get('tls_fp_tv-1')).toBeNull();
  });
});
