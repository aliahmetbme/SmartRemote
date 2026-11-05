import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { ForgetTVUseCase } from '../../application/usecases/ForgetTVUseCase';
import { WakeTVUseCase } from '../../application/usecases/WakeTVUseCase';
import { TVConnectionState as State } from '../../domain/enums/TVConnectionState';
import { ConnectionStateListener } from '../../domain/interfaces/ITVRemoteAdapter';
import { WakeOnLanService } from '../../infrastructure/services/WakeOnLanService';
import { WakeResult } from '../../domain/interfaces/ITVWakeService';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { createContainer } from '../../di/container';
import { makeWebOSDevice } from '../../testing/fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const first = makeWebOSDevice({ id: 'first', macAddress: '02:11:22:33:44:55' });
const second = makeWebOSDevice({ id: 'second', ipAddress: '192.168.1.32' });
const sent = { success: true, packetsSent: 3, destinations: ['192.168.1.255'] };

describe('Phase 14B wake and connection ownership', () => {
  it.each(['switch', 'forget'] as const)('does not restore the old TV after %s during UDP send', async action => {
    const gate = deferred<WakeResult>();
    const create = jest.fn(() => new MockTVAdapter());
    const app = createContainer({ adapterFactory: { supports: () => true, create } });
    await app.deviceRepository.save(first);
    const wake = new WakeTVUseCase(
      { wake: () => gate.promise, isSupported: async () => true },
      app.connectionManager,
    );
    const pending = wake.execute(first, { initialBootDelayMs: 0 });
    const outcome = pending.catch((error: unknown) => error);
    if (action === 'switch') {
      await app.useCases.connectTV.execute(second);
    } else {
      await new ForgetTVUseCase(app.deviceRepository, app.connectionManager).execute(first.id);
    }
    gate.resolve(sent);
    expect(await outcome).toMatchObject({ code: 'cancelled' });
    expect(create).toHaveBeenCalledTimes(action === 'switch' ? 1 : 0);
    expect(app.connectionManager.getDevice()?.id).toBe(action === 'switch' ? second.id : undefined);
    if (action === 'forget') {
      expect(await app.deviceRepository.getById(first.id)).toBeNull();
      await expect(app.connectionManager.reconnect()).rejects.toMatchObject({ code: 'no_device' });
    }
    await app.connectionManager.disconnect();
  });

  it('blocks wake probes in the background and coalesces repeat power-on taps', async () => {
    jest.useFakeTimers();
    try {
      const create = jest.fn(() => new MockTVAdapter());
      const manager = new TVConnectionManager({ supports: () => true, create });
      const transmit = jest.fn().mockResolvedValue(sent);
      const wake = new WakeTVUseCase({ wake: transmit, isSupported: async () => true }, manager);
      const options = { initialBootDelayMs: 50, probeIntervalMs: 50 };
      const pending = wake.execute(first, options);
      expect(wake.execute(first, options)).toBe(pending);
      manager.handleAppBackground();
      await jest.advanceTimersByTimeAsync(250);
      expect(create).not.toHaveBeenCalled();
      expect(manager.getState()).toBe(State.Disconnected);
      await manager.handleAppForeground();
      await jest.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toMatchObject({ restored: true });
      expect(transmit).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      await manager.disconnect();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a failed foreground probe from the previous TV', async () => {
    const gate = deferred<boolean>();
    const oldAdapter = new MockTVAdapter();
    jest.spyOn(oldAdapter, 'checkLiveness').mockReturnValue(gate.promise);
    const create = jest.fn().mockReturnValueOnce(oldAdapter).mockImplementation(() => new MockTVAdapter());
    const manager = new TVConnectionManager({ supports: () => true, create });
    await manager.connect(first);
    manager.handleAppBackground();
    const foreground = manager.handleAppForeground();
    await manager.connect(second);
    gate.resolve(false);
    await foreground;
    expect(manager.getState()).toBe(State.Connected);
    expect(manager.getDevice()?.id).toBe(second.id);
    expect(create).toHaveBeenCalledTimes(2);
    await manager.disconnect();
  });

  it('ignores a queued close callback from an adapter replaced by automatic retry', async () => {
    jest.useFakeTimers();
    try {
      const oldAdapter = new MockTVAdapter();
      const listener = jest.spyOn(oldAdapter, 'onConnectionStateChange');
      const create = jest.fn().mockReturnValueOnce(oldAdapter).mockImplementation(() => new MockTVAdapter());
      const manager = new TVConnectionManager({ supports: () => true, create });
      await manager.connect(first);
      const lateClose: ConnectionStateListener = listener.mock.calls[0][0];
      oldAdapter.simulateConnectionLoss();
      await jest.advanceTimersByTimeAsync(1000);
      expect(manager.getState()).toBe(State.Connected);
      lateClose(State.Disconnected);
      await jest.advanceTimersByTimeAsync(1000);
      expect(manager.getState()).toBe(State.Connected);
      expect(create).toHaveBeenCalledTimes(2);
      await manager.disconnect();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports native network failure and allows a subsequent wake', async () => {
    const native = {
      isAvailable: async () => true,
      sendMagicPacket: jest.fn()
        .mockRejectedValueOnce(new Error('Network is unreachable'))
        .mockResolvedValueOnce(sent),
    };
    const create = jest.fn(() => new MockTVAdapter());
    const manager = new TVConnectionManager({ supports: () => true, create });
    const wake = new WakeTVUseCase(new WakeOnLanService(native), manager);
    await expect(wake.execute(first)).rejects.toMatchObject({ code: 'wol_failed' });
    expect(create).not.toHaveBeenCalled();
    expect(manager.isWakeInProgress()).toBe(false);
    await expect(wake.execute(first, { initialBootDelayMs: 0 })).resolves.toMatchObject({ restored: true });
    await manager.disconnect();
  });

  it('does not persist a connection after Forget supersedes its metadata read', async () => {
    const app = createContainer({ adapterFactory: { supports: () => true, create: () => new MockTVAdapter() } });
    await app.deviceRepository.save(first);
    const gate = deferred<null>();
    const read = jest.spyOn(app.deviceRepository, 'getById').mockReturnValue(gate.promise);
    const connected = deferred<void>();
    const unsubscribe = app.connectionManager.subscribe(snapshot => {
      if (snapshot.state === State.Connected) connected.resolve();
    });
    const pending = app.useCases.connectTV.execute(first);
    const outcome = pending.catch((error: unknown) => error);
    await connected.promise;
    unsubscribe();
    await app.useCases.forgetTV.execute(first.id);
    gate.resolve(null);
    expect(await outcome).toMatchObject({ code: 'cancelled' });
    read.mockRestore();
    expect(await app.deviceRepository.getById(first.id)).toBeNull();
    expect(await app.deviceRepository.getLastSelectedId()).toBeNull();
  });

  it('keeps an edited MAC through connection metadata writes and switches selection', async () => {
    const app = createContainer({ adapterFactory: { supports: () => true, create: () => new MockTVAdapter() } });
    await app.deviceRepository.save(first);
    await app.deviceRepository.save(second);
    await app.useCases.updateTVMac.execute(first.id, '02-11-22-33-44-66');
    await app.useCases.connectTV.execute(first);
    expect((await app.deviceRepository.getById(first.id))?.macAddress).toBe('02:11:22:33:44:66');
    await app.useCases.connectTV.execute(second);
    expect(app.store.getState().tv.selectedDeviceId).toBe(second.id);
    expect(await app.deviceRepository.getLastSelectedId()).toBe(second.id);
    await app.connectionManager.disconnect();
  });

  it('coalesces Power Off, then sends Power On only after the session drops', async () => {
    const gate = deferred<void>();
    const adapter = new MockTVAdapter();
    const off = jest.spyOn(adapter, 'powerOff').mockReturnValueOnce(gate.promise);
    const transmit = jest.fn().mockResolvedValue(sent);
    const app = createContainer({
      adapterFactory: { supports: () => true, create: () => adapter },
      wakeService: { wake: transmit, isSupported: async () => true },
    });
    await app.useCases.connectTV.execute(first);
    const a = app.useCases.powerTV.execute(first);
    const b = app.useCases.powerTV.execute(first);
    expect(off).toHaveBeenCalledTimes(1);
    expect(transmit).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([a, b]);
    adapter.simulateConnectionLoss();
    await expect(app.useCases.powerTV.execute(first, { initialBootDelayMs: 0 }))
      .resolves.toMatchObject({ action: 'wake', restored: true });
    expect(transmit).toHaveBeenCalledTimes(1);
    await app.connectionManager.disconnect();
  });
});
