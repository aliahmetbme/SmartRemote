import React, { useCallback } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import { useTouchpadGestures } from '../hooks/useTouchpadGestures';
import { TouchpadView } from './TouchpadView';

export interface TouchpadProps {
  throttleMs?: number;
  style?: StyleProp<ViewStyle>;
  onActiveChange?: (active: boolean) => void;
  onMove?: (deltaX: number, deltaY: number) => void;
  onClick?: () => void;
  isConnected?: boolean;
  isAvailable?: boolean;
}

/**
 * Touchpad container component: connects useTouchpadGestures to
 * SendRemoteCommandUseCase and Redux state, rendering presentational TouchpadView.
 */
export const Touchpad: React.FC<TouchpadProps> = ({
  throttleMs = 25,
  style,
  onActiveChange,
  onMove: customOnMove,
  onClick: customOnClick,
  isConnected: customIsConnected,
  isAvailable: customIsAvailable,
}) => {
  const container = useContainer();
  const capabilities = useAppSelector(selectCapabilities);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const isConnected =
    customIsConnected !== undefined
      ? customIsConnected
      : connectionStatus === TVConnectionState.Connected;

  const pointerState = capabilities?.pointerControl ?? 'unknown';
  const isAvailable =
    customIsAvailable !== undefined ? customIsAvailable : pointerState !== 'unsupported';

  const defaultOnMove = useCallback(
    (deltaX: number, deltaY: number) => {
      container.useCases.sendRemoteCommand
        .execute({
          type: 'movePointer',
          deltaX,
          deltaY,
        })
        .catch(() => {
          // Non-fatal pointer drop
        });
    },
    [container],
  );

  const defaultOnClick = useCallback(() => {
    container.useCases.sendRemoteCommand.execute({ type: 'select' }).catch(() => undefined);
  }, [container]);

  const { panHandlers, isPressing } = useTouchpadGestures({
    onMove: customOnMove ?? defaultOnMove,
    onClick: customOnClick ?? defaultOnClick,
    onActiveChange,
    enabled: isConnected && isAvailable,
    throttleMs,
  });

  return (
    <TouchpadView
      panHandlers={panHandlers}
      isPressing={isPressing}
      isConnected={isConnected}
      isAvailable={isAvailable}
      style={style}
    />
  );
};
