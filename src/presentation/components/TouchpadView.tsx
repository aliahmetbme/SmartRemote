import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  GestureResponderHandlers,
} from 'react-native';
import { theme } from '../theme';

export interface TouchpadViewProps {
  panHandlers?: GestureResponderHandlers;
  isPressing?: boolean;
  isConnected?: boolean;
  isAvailable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pure presentational component for Touchpad surface rendering,
 * grid indicator, center dot, gestures indicator, and disabled overlay.
 * Has zero dependencies on DI container or network services.
 */
export const TouchpadView: React.FC<TouchpadViewProps> = ({
  panHandlers,
  isPressing = false,
  isConnected = true,
  isAvailable = true,
  style,
}) => {
  if (!isAvailable) {
    return (
      <View style={[styles.container, styles.containerDisabled, style]} testID="touchpad-disabled">
        <Text style={styles.disabledText}>Pointer Control Unsupported by TV</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isPressing && styles.containerActive,
        !isConnected && styles.containerDisabled,
        style,
      ]}
      testID="touchpad-surface"
      {...panHandlers}
    >
      <View style={styles.gridIndicator}>
        <View style={styles.centerDot} />
      </View>

      <View style={styles.gesturesIndicator}>
        <Text style={styles.gesturesText}>
          {isPressing ? 'DRAGGING' : 'SWIPE TO MOVE  •  TAP TO CLICK'}
        </Text>
      </View>

      {!isConnected && (
        <View style={styles.disabledOverlay}>
          <Text style={styles.disabledText}>Connect to TV to use pointer</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 320,
    backgroundColor: '#121622',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: '#252D3F',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  containerActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: '#151B2A',
  },
  containerDisabled: {
    opacity: 0.5,
  },
  gridIndicator: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#252D3F',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3D4A66',
  },
  gesturesIndicator: {
    position: 'absolute',
    bottom: 16,
    alignItems: 'center',
  },
  gesturesText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#65738E',
    letterSpacing: 0.8,
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 15, 23, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
