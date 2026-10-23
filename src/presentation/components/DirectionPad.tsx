import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { NavigationDirection } from '../../domain/enums/RemoteKey';
import { theme } from '../theme';

export interface DirectionPadProps {
  onNavigate: (direction: NavigationDirection) => void;
  onSelect: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const DirectionPad: React.FC<DirectionPadProps> = ({
  onNavigate,
  onSelect,
  disabled = false,
  style,
}) => {
  return (
    <View style={[styles.dpadContainer, style]} testID="dpad-cluster">
      {/* Up */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadUp, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={() => onNavigate(NavigationDirection.Up)}
        testID="btn-nav-up"
        accessibilityLabel="Navigate Up"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>▲</Text>
      </TouchableOpacity>

      {/* Down */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadDown, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={() => onNavigate(NavigationDirection.Down)}
        testID="btn-nav-down"
        accessibilityLabel="Navigate Down"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>▼</Text>
      </TouchableOpacity>

      {/* Left */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadLeft, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={() => onNavigate(NavigationDirection.Left)}
        testID="btn-nav-left"
        accessibilityLabel="Navigate Left"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>◀</Text>
      </TouchableOpacity>

      {/* Right */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadRight, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={() => onNavigate(NavigationDirection.Right)}
        testID="btn-nav-right"
        accessibilityLabel="Navigate Right"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>▶</Text>
      </TouchableOpacity>

      {/* Center OK */}
      <TouchableOpacity
        style={[styles.dpadCenter, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={onSelect}
        testID="btn-nav-ok"
        accessibilityLabel="OK / Select"
        accessibilityRole="button"
      >
        <Text style={styles.dpadCenterText}>OK</Text>
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
  dpadArrow: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadUp: {
    top: 4,
    width: 60,
    height: 44,
  },
  dpadDown: {
    bottom: 4,
    width: 60,
    height: 44,
  },
  dpadLeft: {
    left: 4,
    width: 44,
    height: 60,
  },
  dpadRight: {
    right: 4,
    width: 44,
    height: 60,
  },
  arrowText: {
    fontSize: 18,
    color: '#B6BECE',
  },
  dpadCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
    opacity: 0.45,
  },
});
