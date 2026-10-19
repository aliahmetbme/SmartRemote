import { NativeModules, Platform } from 'react-native';
import { ICredentialStorage } from '../../../domain/interfaces/ICredentialStorage';

export interface TLSStatus {
  domain: string;
  validationSuccess: boolean;
  leafSummary: string;
  leafFingerprint: string;
  errorDomain: string;
  errorCode: number;
  errorDescription: string;
}

export interface CertificateTrustResult {
  trusted: boolean;
  isFirstUse: boolean;
  certificateChanged: boolean;
  fingerprint: string;
}

export interface NativeTLSModule {
  getLastTLSStatus(): Promise<TLSStatus>;
  probeEndpoint?(host: string, port: number): Promise<Record<string, unknown>>;
}

const FINGERPRINT_KEY_PREFIX = 'tls_fp_';

export class LGTVCertificateTrustManager {
  private readonly nativeModule: NativeTLSModule | null;

  constructor(
    private readonly storage: ICredentialStorage,
    nativeModule?: NativeTLSModule,
  ) {
    if (nativeModule !== undefined) {
      this.nativeModule = nativeModule;
    } else if (Platform.OS === 'ios' && NativeModules?.LGTVTLSModule) {
      this.nativeModule = NativeModules.LGTVTLSModule as NativeTLSModule;
    } else {
      this.nativeModule = null;
    }
  }

  /**
   * Retrieves the latest native TLS evaluation status.
   */
  async getLastStatus(): Promise<TLSStatus | null> {
    if (!this.nativeModule?.getLastTLSStatus) {
      return null;
    }
    try {
      const status = await this.nativeModule.getLastTLSStatus();
      if (!status || !status.domain) {
        return null;
      }
      return status;
    } catch {
      return null;
    }
  }

  /**
   * Evaluates the certificate fingerprint against device storage:
   * - First use: Trusts and persists the fingerprint.
   * - Returning device: Verifies fingerprint matches previously trusted certificate.
   * - Changed certificate: Rejects to protect against rogue substitution or MITM.
   */
  async verifyTrust(deviceId: string, status: TLSStatus): Promise<CertificateTrustResult> {
    const fingerprint = status.leafFingerprint;
    if (!fingerprint) {
      // If no fingerprint was captured (e.g. non-TLS ws connection), allow but do not pin
      return {
        trusted: status.validationSuccess,
        isFirstUse: false,
        certificateChanged: false,
        fingerprint: '',
      };
    }

    const storageKey = `${FINGERPRINT_KEY_PREFIX}${deviceId}`;
    const stored = await this.storage.get(storageKey);

    if (!stored) {
      // First-time trust (TOFU anchored to LG CA)
      if (status.validationSuccess) {
        await this.storage.set(storageKey, fingerprint);
      }
      return {
        trusted: status.validationSuccess,
        isFirstUse: true,
        certificateChanged: false,
        fingerprint,
      };
    }

    if (stored === fingerprint) {
      // Certificate matches previously trusted fingerprint
      return {
        trusted: status.validationSuccess,
        isFirstUse: false,
        certificateChanged: false,
        fingerprint,
      };
    }

    // Fingerprint changed!
    return {
      trusted: false,
      isFirstUse: false,
      certificateChanged: true,
      fingerprint,
    };
  }

  /**
   * Clears stored fingerprint when re-pairing or resetting trust.
   */
  async resetTrust(deviceId: string): Promise<void> {
    const storageKey = `${FINGERPRINT_KEY_PREFIX}${deviceId}`;
    await this.storage.remove(storageKey).catch(() => {});
  }
}
