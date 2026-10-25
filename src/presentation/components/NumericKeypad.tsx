import React, { useCallback } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useContainer } from '../context/ContainerContext';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { RemoteKey } from '../../domain/enums/RemoteKey';
import { useNumericKeypadBuffer } from '../hooks/useNumericKeypadBuffer';
import { NumericKeypadView } from './NumericKeypadView';

export interface NumericKeypadProps {
  style?: StyleProp<ViewStyle>;
  bufferTimeoutMs?: number;
  onSendDigit?: (digit: number) => Promise<void>;
  onSendKey?: (key: RemoteKey) => Promise<void>;
  isConnected?: boolean;
  isAvailable?: boolean;
}

/**
 * Container component: connects useNumericKeypadBuffer to SendRemoteCommandUseCase
 * and Redux connection/capability state, rendering presentational NumericKeypadView.
 */
export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  style,
  bufferTimeoutMs = 3500,
  onSendDigit: customOnSendDigit,
  onSendKey: customOnSendKey,
  isConnected: customIsConnected,
  isAvailable: customIsAvailable,
}) => {
  const container = useContainer();
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const capabilities = useAppSelector(selectCapabilities);

  const isConnected =
    customIsConnected !== undefined
      ? customIsConnected
      : connectionStatus === TVConnectionState.Connected;

  const isChannelCapable = capabilities?.channelControl !== 'unsupported';
  const isAvailable =
    customIsAvailable !== undefined ? customIsAvailable : isConnected && isChannelCapable;

  const defaultSendDigit = useCallback(
    async (digit: number) => {
      await container.useCases.sendRemoteCommand.execute({
        type: 'digit',
        digit,
      });
    },
    [container],
  );

  const defaultSendKey = useCallback(
    async (key: RemoteKey) => {
      await container.useCases.sendRemoteCommand.execute({
        type: 'key',
        key,
      });
    },
    [container],
  );

  const { channelBuffer, handleDigit, handleBackspace, handleOk } = useNumericKeypadBuffer({
    onSendDigit: customOnSendDigit ?? defaultSendDigit,
    onSendKey: customOnSendKey ?? defaultSendKey,
    isAvailable,
    isConnected,
    bufferTimeoutMs,
  });

  return (
    <NumericKeypadView
      channelBuffer={channelBuffer}
      isAvailable={isAvailable}
      isConnected={isConnected}
      onDigitPress={handleDigit}
      onBackspacePress={handleBackspace}
      onOkPress={handleOk}
      style={style}
    />
  );
};
