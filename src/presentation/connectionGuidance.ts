import type { FailureCategory } from '../domain/entities/ConnectionDiagnostic';
export function connectionGuidance(category: FailureCategory) {
  switch (category) {
    case 'NETWORK_UNAVAILABLE':
      return {
        title: 'Connect to your local network',
        message:
          'Your phone currently reports no Wi-Fi or Ethernet connection. Check your network settings.',
        action: 'Open Settings',
      };
    case 'TLS_TRUST_FAILURE':
      return {
        title: "Secure connection couldn't be verified",
        message:
          'Check that you selected the correct TV. SmartRemote will not bypass certificate verification. Review TV details before trying again.',
        action: 'TV Settings',
      };
    case 'PAIRING_REJECTED':
      return {
        title: 'TV pairing was rejected',
        message:
          'Try again and approve the connection request shown on your television.',
        action: 'Pair Again',
      };
    case 'PAIRING_FAILED':
      return {
        title: "Pairing didn't complete",
        message:
          'Check the TV for a connection request. Pairing can also fail if credentials cannot be stored.',
        action: 'Pair Again',
      };
    case 'CONNECTION_TIMEOUT':
      return {
        title: "Can't reach your TV",
        message:
          'The connection attempt timed out. Check the TV, its saved address and local network access. A timeout does not establish whether the TV is off.',
        action: 'Try Again',
      };
    case 'CONNECTION_REFUSED':
      return {
        title: 'TV connection was refused',
        message:
          'The endpoint refused the connection. Check the selected TV and that remote connections are enabled.',
        action: 'Try Again',
      };
    default:
      return {
        title: "Can't reach your TV",
        message:
          'The TV may be in standby, or the devices may not be able to communicate on the local network. Check the TV address and local network access.',
        action: 'Try Again',
      };
  }
}
