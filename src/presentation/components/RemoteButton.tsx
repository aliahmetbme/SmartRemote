import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../theme';

export interface RemoteButtonProps {
  label?: string;
  icon?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityLabel: string;
  variant?: 'default' | 'power' | 'circle' | 'primary' | 'chip';
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export const RemoteButton: React.FC<RemoteButtonProps> = ({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  testID,
  accessibilityLabel,
  variant = 'default',
  style,
  labelStyle,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.secondary} />
      ) : icon ? (
        <Text style={[styles.iconText, variant === 'power' && styles.powerIcon, labelStyle]}>
          {icon}
        </Text>
      ) : (
        <Text style={[styles.labelText, variant === 'power' && styles.powerLabel, labelStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  default: {
    backgroundColor: '#1E2536',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2F3A52',
  },
  power: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#261418',
    borderWidth: 1.5,
    borderColor: '#4A1C23',
  },
  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1C2232',
    borderWidth: 1.5,
    borderColor: '#2B354C',
  },
  primary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  chip: {
    backgroundColor: '#1E2536',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: '#2F3A52',
  },
  disabled: {
    opacity: 0.45,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B6BECE',
    letterSpacing: 0.5,
  },
  iconText: {
    fontSize: 20,
    color: '#D4DAE8',
  },
  powerIcon: {
    fontSize: 22,
    color: '#FF453A',
    fontWeight: 'bold',
  },
  powerLabel: {
    color: '#FF453A',
  },
});
