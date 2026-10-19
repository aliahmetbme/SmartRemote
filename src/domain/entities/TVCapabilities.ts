export type CapabilityState = 'supported' | 'unsupported' | 'unknown';

export interface TVCapabilities {
  volumeControl: CapabilityState;
  channelControl: CapabilityState;
  muteControl: CapabilityState;
  navigation: CapabilityState;
  powerOff: CapabilityState;
  powerOn: CapabilityState;
  pointerControl: CapabilityState;
  keyboardInput: CapabilityState;
  appLaunching: CapabilityState;
  inputSwitching: CapabilityState;
}

export type TVCapability = keyof TVCapabilities;

/** Unverified state where capabilities have not yet been established. */
export const UNKNOWN_CAPABILITIES: Readonly<TVCapabilities> = Object.freeze({
  volumeControl: 'unknown',
  channelControl: 'unknown',
  muteControl: 'unknown',
  navigation: 'unknown',
  powerOff: 'unknown',
  powerOn: 'unknown',
  pointerControl: 'unknown',
  keyboardInput: 'unknown',
  appLaunching: 'unknown',
  inputSwitching: 'unknown',
});

/** Authoritatively unsupported state. */
export const NO_CAPABILITIES: Readonly<TVCapabilities> = Object.freeze({
  volumeControl: 'unsupported',
  channelControl: 'unsupported',
  muteControl: 'unsupported',
  navigation: 'unsupported',
  powerOff: 'unsupported',
  powerOn: 'unsupported',
  pointerControl: 'unsupported',
  keyboardInput: 'unsupported',
  appLaunching: 'unsupported',
  inputSwitching: 'unsupported',
});

/**
 * Creates capabilities. Accepts three-state values or legacy booleans for backward compatibility.
 */
export function createCapabilities(
  overrides: Partial<Record<TVCapability, CapabilityState | boolean>> = {},
  base: TVCapabilities = NO_CAPABILITIES,
): TVCapabilities {
  const result: TVCapabilities = { ...base };
  for (const [key, val] of Object.entries(overrides)) {
    if (val === true) {
      result[key as TVCapability] = 'supported';
    } else if (val === false) {
      result[key as TVCapability] = 'unsupported';
    } else if (val !== undefined) {
      result[key as TVCapability] = val;
    }
  }
  return result;
}

export function isCapabilitySupported(capabilities: TVCapabilities, capability: TVCapability): boolean {
  return capabilities[capability] === 'supported';
}

export function isCapabilityUnsupported(capabilities: TVCapabilities, capability: TVCapability): boolean {
  return capabilities[capability] === 'unsupported';
}

export function isCapabilityUnknown(capabilities: TVCapabilities, capability: TVCapability): boolean {
  return capabilities[capability] === 'unknown';
}

/**
 * Indicates whether an operation may be attempted: supported or unverified (unknown).
 * Only explicitly unsupported capabilities are disallowed.
 */
export function canAttemptCapability(capabilities: TVCapabilities, capability: TVCapability): boolean {
  return capabilities[capability] !== 'unsupported';
}

/**
 * Backward-compatible helper: checks if capability is strictly verified as supported.
 */
export function hasCapability(capabilities: TVCapabilities, capability: TVCapability): boolean {
  return capabilities[capability] === 'supported';
}
