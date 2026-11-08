import type { FailureCategory } from '../domain/entities/ConnectionDiagnostic';
export function connectionGuidance(category: FailureCategory) {
  switch (category) {
    case 'NETWORK_UNAVAILABLE':
      return {
        title: 'Connect to a local network',
        message:
          'Your phone needs local network access to communicate with your TV.',
        action: 'Open Settings',
      };
    case 'TLS_TRUST_FAILURE':
      return {
        title: "Secure connection couldn't be verified",
        message:
          'Check that you selected the correct TV, then review its details in Settings.',
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
          'Check your TV for a connection request, then try again.',
        action: 'Pair Again',
      };
    case 'CONNECTION_TIMEOUT':
      return {
        title: "Can't connect to your TV",
        message:
          'Make sure your TV is on and both devices can communicate over the same local network.',
        action: 'Try Again',
      };
    case 'CONNECTION_REFUSED':
      return {
        title: 'TV connection was refused',
        message:
          'Check that remote connections are allowed on your TV, then try again.',
        action: 'Try Again',
      };
    default:
      return {
        title: "Can't connect to your TV",
        message:
          'Your TV may be in standby; make sure it is on and both devices can communicate over the local network.',
        action: 'Try Again',
      };
  }
}
