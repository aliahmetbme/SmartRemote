export { layoutTokens, getTabBarLayout, getPresentationLayout, getControlGeometry, getRemoteGeometry, getRemoteCardLayout, useRemoteDensity, remoteDensity, usePresentationLayout, platformPresentation } from './layout';

export const theme = {
  colors: {
    background: '#0B0D11',
    surface: '#15181E',
    surfaceSubtle: '#1C2027',
    surfaceHighlight: '#262B35',
    border: '#2C323E',
    borderActive: '#444D5E',

    // Accents
    primary: '#E31B23', // Magic Remote Red Accent
    primaryGlow: 'rgba(227, 27, 35, 0.25)',
    secondary: '#00D2FF', // Cyan accent
    secondaryGlow: 'rgba(0, 210, 255, 0.2)',

    // State Colors
    connected: '#00E676',
    connecting: '#FFB300',
    pairing: '#9C27B0',
    pairingText: '#D4A1E5',
    disconnected: '#757575',
    error: '#FF5252',

    // Typography
    textPrimary: '#FFFFFF',
    textSecondary: '#A2A9B8',
    textMuted: '#8993A6',
    textDisabled: '#8A92A3',

    // Remote surfaces and label hierarchy
    remoteCard: '#141821',
    remoteCardEdge: '#1D2330',
    modeTrack: '#131722',
    modeTrackEdge: '#1D2433',
    modeSelected: '#242D40',
    modeUnavailable: '#697488',
    controlLabel: '#C8D0DF',
    controlActionLabel: '#DCE2EE',
    controlDigit: '#E5EAF3',
    controlSectionLabel: '#A7B5CC',
    controlMute: '#E9947D',

    // D-Pad / Remote Controls
    buttonActive: '#2B3344',
    buttonInactive: '#1B202B',
    buttonBorder: '#282F3E',
    buttonBorderActive: '#44516B',
    dpadBackground: '#13171F',
    dpadButton: '#1E2430',
  },
  remoteDisabledOpacity: 0.55,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 20,
    xl: 28,
    full: 9999,
  },
  typography: {
    title: {
      fontSize: 20,
      fontWeight: '700' as const,
      letterSpacing: 0.3,
    },
    subtitle: {
      fontSize: 15,
      fontWeight: '600' as const,
      letterSpacing: 0.2,
    },
    body: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
  },
} as const;

export type Theme = typeof theme;
