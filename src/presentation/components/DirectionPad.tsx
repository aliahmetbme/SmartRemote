import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { NavigationDirection } from '../../domain/enums/RemoteKey';
import { theme } from '../theme';

export interface DirectionPadProps {
  onNavigate: (direction: NavigationDirection) => void;
  onSelect: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: number;
  centerDiameter?: number;
}

export const DirectionPad: React.FC<DirectionPadProps> = ({
  onNavigate,
  onSelect,
  disabled = false,
  style,
  size = 196,
  centerDiameter,
}) => {
  const centerSize = centerDiameter ?? (size >= 180 ? 72 : 64);
  return (
    <View style={[styles.dpadContainer, { width: size, height: size, borderRadius: size / 2 }, style]} testID="dpad-cluster">
      {/* Up */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadUp, centerDiameter !== undefined && styles.compactVerticalArrow, disabled && styles.controlDisabled]}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => onNavigate(NavigationDirection.Up)}
        testID="btn-nav-up"
        accessibilityLabel="Navigate Up"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText} allowFontScaling={false}>▲</Text>
      </TouchableOpacity>

      {/* Down */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadDown, centerDiameter !== undefined && styles.compactVerticalArrow, disabled && styles.controlDisabled]}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => onNavigate(NavigationDirection.Down)}
        testID="btn-nav-down"
        accessibilityLabel="Navigate Down"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText} allowFontScaling={false}>▼</Text>
      </TouchableOpacity>

      {/* Left */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadLeft, centerDiameter !== undefined && styles.compactHorizontalArrow, disabled && styles.controlDisabled]}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => onNavigate(NavigationDirection.Left)}
        testID="btn-nav-left"
        accessibilityLabel="Navigate Left"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText} allowFontScaling={false}>◀</Text>
      </TouchableOpacity>

      {/* Right */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadRight, centerDiameter !== undefined && styles.compactHorizontalArrow, disabled && styles.controlDisabled]}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => onNavigate(NavigationDirection.Right)}
        testID="btn-nav-right"
        accessibilityLabel="Navigate Right"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText} allowFontScaling={false}>▶</Text>
      </TouchableOpacity>

      {/* Center OK */}
      <TouchableOpacity
        style={[styles.dpadCenter, { width: centerSize, height: centerSize, borderRadius: centerSize / 2 }, disabled && styles.controlDisabled]}
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={onSelect}
        testID="btn-nav-ok"
        accessibilityLabel="OK / Select"
        accessibilityRole="button"
      >
        <Text
          style={styles.dpadCenterText}
          numberOfLines={centerDiameter === undefined ? undefined : 1}
          adjustsFontSizeToFit={centerDiameter !== undefined}
        >
          OK
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  dpadContainer: {
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: '#121620',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  compactVerticalArrow: { width: 48 },
  compactHorizontalArrow: { height: 48 },
  dpadArrow: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadUp: {
    top: 0,
    width: 60,
    height: 48,
  },
  dpadDown: {
    bottom: 0,
    width: 60,
    height: 48,
  },
  dpadLeft: {
    left: 0,
    width: 48,
    height: 60,
  },
  dpadRight: {
    right: 0,
    width: 48,
    height: 60,
  },
  arrowText: {
    fontSize: 18,
    color: theme.colors.controlLabel,
  },
  dpadCenter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#263045',
    borderWidth: 2,
    borderColor: '#3F4E70',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  dpadCenterText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  controlDisabled: {
    opacity: theme.remoteDisabledOpacity,
  },
});
