import { Platform, useWindowDimensions } from 'react-native';

export const layoutTokens = {
  minimumTouchTarget: 48,
  pageMaxWidth: 600,
  remoteMaxWidth: 480,
  sectionGap: 16,
  controlGap: 8,
} as const;

export const remoteDensity = {
  smallControlRadius: 10,
  tileRadius: 12,
  modeRadius: 16,
  cardRadius: 16,
  borderWidth: 1,
  cardPadding: 8,
  sectionGap: 8,
  keyGap: 4,
  segmentPadding: 2,
  statusPadding: 1,
  systemButtonPadding: 6,
  displayPadding: 4,
  keyHorizontalPadding: 6,
  chipPadding: 4,
  chipTracking: 0.2,
  minDpad: 148,
  preferredDpad: 156,
  centerSize: 48,
} as const;

// Android uses the denser surfaces. iOS retains its established spacing and 48pt targets.
export function useRemoteDensity() {
  return Platform.OS === 'android' ? remoteDensity : undefined;
}

/** Resolve the actual card inset once for both rendering and width estimation. */
export function getRemoteCardLayout(
  layout: Pick<ReturnType<typeof getPresentationLayout>, 'remoteWidth' | 'cardPadding'>,
  density: typeof remoteDensity | undefined,
) {
  const padding = density?.cardPadding ?? layout.cardPadding;
  const borderWidth = density?.borderWidth ?? 1.5;
  return {
    padding,
    borderWidth,
    innerWidth: Math.max(0, layout.remoteWidth - 2 * (padding + borderWidth)),
  };
}

export function getRemoteGeometry(width: number, viewportHeight: number, fontScale: number, dense: boolean) {
  if (!dense) return getControlGeometry(width, fontScale);
  const { minimumTouchTarget, controlGap } = layoutTokens;
  const rockerWidth = Math.max(minimumTouchTarget, Math.ceil(36 * fontScale + 8));
  const inlineWidth = width - 2 * (rockerWidth + controlGap);
  const stacked = inlineWidth < remoteDensity.minDpad;
  const preferred = viewportHeight < 700 ? remoteDensity.minDpad : remoteDensity.preferredDpad;
  const dpadSize = Math.max(remoteDensity.minDpad, Math.min(preferred, inlineWidth));
  return { stacked, rockerWidth, dpadSize, rockerHeight: Math.max(dpadSize, 3 * minimumTouchTarget + 2) };
}

/** Width budgets derive from controls/text, not a device brand or aspect ratio. */
export function getPresentationLayout(width: number, fontScale = 1) {
  const compact = width < 164 + 2 * 52 + 2 * 8 + 4 * 16 + 3;
  const pagePadding = compact ? 12 : 16;
  const contentWidth = Math.min(layoutTokens.pageMaxWidth, Math.max(0, width - pagePadding * 2));
  const remoteWidth = Math.min(layoutTokens.remoteMaxWidth, contentWidth);
  const cardPadding = compact ? 12 : 16;
  const formWidth = contentWidth - cardPadding * 2 - 2;
  return {
    pagePadding, cardPadding, contentWidth, remoteWidth, fontScale,
    stackForms: formWidth < 280 * fontScale + layoutTokens.controlGap,
    stackDetails: formWidth < 320 * fontScale,
    headerStacked: contentWidth < 200 * fontScale + 48,
    modeStacked: contentWidth < 3 * (53 * fontScale + 8) + 8,
    chipBasis: Math.max(80, Math.ceil(56 * Math.max(1, fontScale) + 16)),
  };
}

export function getControlGeometry(availableWidth: number, fontScale = 1) {
  const gap = layoutTokens.controlGap;
  const rockerWidth = Math.max(52, Math.ceil(36 * fontScale + 8));
  const minDpad = 164; // 48 + 64 center + 48, plus separation
  const stacked = availableWidth < minDpad + 2 * rockerWidth + 2 * gap;
  const dpadSize = Math.max(minDpad, Math.min(196,
    stacked ? availableWidth : availableWidth - 2 * rockerWidth - 2 * gap));
  return { stacked, rockerWidth, dpadSize, rockerHeight: Math.max(dpadSize, 3 * layoutTokens.minimumTouchTarget) };
}

export function usePresentationLayout(horizontalInsets = 0) {
  const { width, fontScale } = useWindowDimensions();
  return getPresentationLayout(width - horizontalInsets, fontScale);
}

export const platformPresentation = {
  get keyboardDismissMode() { return Platform.select({ ios: 'interactive' as const, default: 'on-drag' as const }); },
};

/** Tabs are in normal navigation layout flow and own the bottom system inset once. */
export function getTabBarLayout(bottomInset: number, fontScale: number) {
  return {
    height: Math.max(56, 36 + Math.ceil(14 * fontScale)) + bottomInset,
    paddingBottom: bottomInset,
    paddingTop: 6,
  };
}
