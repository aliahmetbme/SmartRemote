import { createSelector } from '@reduxjs/toolkit';
import { hasCapability, TVCapability } from '../../domain/entities/TVCapabilities';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import type { RootState } from '../index';

export const selectConnectionStatus = (s: RootState) => s.connection.status;
export const selectConnectionError = (s: RootState) => s.connection.error;
export const selectIsReady = (s: RootState) => s.connection.status === TVConnectionState.Connected;
export const selectDiscoveredDevices = (s: RootState) => s.tv.discoveredDevices;
export const selectSavedDevices = (s: RootState) => s.tv.savedDevices;
export const selectCapabilities = (s: RootState) => s.tv.capabilities;
export const selectDiscoveryStatus = (s: RootState) => s.tv.discoveryStatus;
export const selectDiscoveryError = (s: RootState) => s.tv.discoveryError;
export const selectSelectedDeviceId = (s: RootState) => s.tv.selectedDeviceId;

export const selectSelectedDevice = createSelector(
  [(s: RootState) => s.tv.savedDevices, (s: RootState) => s.tv.discoveredDevices, (s: RootState) => s.tv.selectedDeviceId],
  (saved, discovered, id) =>
    id ? [...discovered, ...saved].find(d => d.id === id) ?? null : null,
);

/** A control is usable only when connected AND the TV reports the capability. */
export const makeSelectCanUse = (capability: TVCapability) => (s: RootState) =>
  selectIsReady(s) && s.tv.capabilities !== null && hasCapability(s.tv.capabilities, capability);
