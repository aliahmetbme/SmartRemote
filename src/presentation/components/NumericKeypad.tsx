import React, { useCallback } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useContainer } from '../context/ContainerContext';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus, selectSelectedDeviceId } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { ChannelSelectionResult } from '../../domain/interfaces/IChannelSelectionAdapter';
import { useNumericKeypadBuffer } from '../hooks/useNumericKeypadBuffer';
import { NumericKeypadView } from './NumericKeypadView';

export interface NumericKeypadProps {
  style?: StyleProp<ViewStyle>;
  bufferTimeoutMs?: number;
  onSelectChannel?: (number: string, isCurrent: () => boolean) => Promise<ChannelSelectionResult>;
  isConnected?: boolean;
  isAvailable?: boolean;
  targetDeviceId?: string | null;
}

/**
 * Container component: connects useNumericKeypadBuffer to SendRemoteCommandUseCase
 * and Redux connection/capability state, rendering presentational NumericKeypadView.
 */
export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  style,
  bufferTimeoutMs = 3500,
  onSelectChannel: customSelectChannel,
  isConnected: customIsConnected,
  isAvailable: customIsAvailable,
  targetDeviceId: customTargetDeviceId,
}) => {
  const container = useContainer();
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const capabilities = useAppSelector(selectCapabilities);
  const selectedDeviceId = useAppSelector(selectSelectedDeviceId);

  const targetDeviceId =
    customTargetDeviceId !== undefined ? customTargetDeviceId : selectedDeviceId;

  const isConnected =
    customIsConnected !== undefined
      ? customIsConnected
      : connectionStatus === TVConnectionState.Connected;

  const isChannelCapable = capabilities?.channelControl !== 'unsupported';
  const isAvailable =
    customIsAvailable !== undefined ? customIsAvailable : isConnected && isChannelCapable;

  const selectChannel = useCallback(
    (number: string, isCurrent: () => boolean) =>
      container.useCases.sendRemoteCommand.selectChannel(number, targetDeviceId, isCurrent),
    [container, targetDeviceId],
  );

  const subscribeToSession = useCallback((invalidate: () => void) =>
    container.connectionManager.subscribe(snapshot => {
      if (snapshot.state !== TVConnectionState.Connected) invalidate();
    }), [container]);
  const { channelBuffer, status, busy, handleDigit, handleBackspace, handleOk } = useNumericKeypadBuffer({
    onSelectChannel: customSelectChannel ?? selectChannel,
    isAvailable,
    isConnected,
    bufferTimeoutMs,
    targetDeviceId,
    subscribeToSession,
  });

  return (
    <NumericKeypadView
      channelBuffer={channelBuffer}
      status={status}
      busy={busy}
      isAvailable={isAvailable}
      isConnected={isConnected}
      onDigitPress={handleDigit}
      onBackspacePress={handleBackspace}
      onOkPress={handleOk}
      style={style}
    />
  );
};
