import { NativeModules, Platform } from 'react-native';
import type { LocalNetworkStatus } from '../../domain/entities/ConnectionDiagnostic';
export async function readLocalNetworkStatus(): Promise<LocalNetworkStatus> {
  const native = Platform.OS === 'android' ? NativeModules.LGAndroidWebSocketModule : null;
  if (!native?.getNetworkStatus) return { wifi: null, localTransport: null };
  const raw = await native.getNetworkStatus();
  return { wifi: typeof raw?.wifi === 'boolean' ? raw.wifi : null,
    localTransport: typeof raw?.localTransport === 'boolean' ? raw.localTransport : null };
}
