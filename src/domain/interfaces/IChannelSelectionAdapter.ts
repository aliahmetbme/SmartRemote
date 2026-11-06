export type ChannelSelectionResult =
  | 'confirmed'
  | 'accepted-unverified'
  | 'readback-unavailable'
  | 'mismatch'
  | 'unsupported'
  | 'permission-denied'
  | 'source-unavailable'
  | 'channel-unavailable'
  | 'rejected'
  | 'transport-error';

export interface IChannelSelectionAdapter {
  selectChannel(number: string, isCurrent: () => boolean): Promise<ChannelSelectionResult>;
}
