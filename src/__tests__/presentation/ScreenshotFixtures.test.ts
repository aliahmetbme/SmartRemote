import { createScreenshotContainer } from '../../development/ScreenshotApp';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

describe('Isolated screenshot fixtures', () => {
  it.each([false, true])('uses synthetic TVs and actual mock-manager readiness (recovery=%s)', async recovery => {
    const container = await createScreenshotContainer(recovery);
    const device = container.connectionManager.getDevice();
    expect(device?.name).toContain('Demo TV');
    expect(device?.ipAddress).toBe('192.0.2.10');
    expect(device?.macAddress).toBeUndefined();
    expect(container.connectionManager.getState()).toBe(recovery ? TVConnectionState.Error : TVConnectionState.Connected);
    if (recovery) expect(container.store.getState().connection.diagnostic?.category).toBe('CONNECTION_TIMEOUT');
    container.disposeDiagnostics(); container.remotePreferences.dispose(); await container.connectionManager.disconnect();
  });
});
