/**
 * Connection lifecycle.
 *
 * - Connecting:  transport (socket) is being established.
 * - Pairing:     transport is up, waiting for the TV to accept/validate pairing.
 * - Connected:   transport is up AND pairing is complete AND the TV is ready to
 *                accept remote commands. It is never entered earlier.
 */
export enum TVConnectionState {
  Disconnected = 'disconnected',
  Discovering = 'discovering',
  Connecting = 'connecting',
  Pairing = 'pairing',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Error = 'error',
}

const S = TVConnectionState;

const VALID_TRANSITIONS: Readonly<Record<TVConnectionState, readonly TVConnectionState[]>> = {
  [S.Disconnected]: [S.Discovering, S.Connecting, S.Reconnecting],
  [S.Discovering]: [S.Disconnected, S.Connecting, S.Error],
  [S.Connecting]: [S.Pairing, S.Connected, S.Disconnected, S.Error],
  [S.Pairing]: [S.Connected, S.Disconnected, S.Reconnecting, S.Error],
  [S.Connected]: [S.Disconnected, S.Reconnecting, S.Error],
  [S.Reconnecting]: [S.Pairing, S.Connected, S.Disconnected, S.Error],
  [S.Error]: [S.Disconnected, S.Discovering, S.Connecting, S.Reconnecting],
};

export function canTransition(from: TVConnectionState, to: TVConnectionState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
