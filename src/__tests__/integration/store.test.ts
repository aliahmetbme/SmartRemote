import { createContainer } from '../../di/container';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { createAppStore } from '../../store';
import { makeWebOSDevice, makeMockDevice } from '../../testing/fixtures';
import { selectIsReady, makeSelectCanUse } from '../../store/selectors';
import { tvActions } from '../../store/slices/tvSlice';
import { remoteActions } from '../../store/slices/remoteSlice';

describe('store', () => {
  it('has the expected initial state', () => {
    const state = createAppStore().getState();
    expect(state.connection.status).toBe(TVConnectionState.Disconnected);
    expect(state.tv.discoveryStatus).toBe('idle');
    expect(state.remote.selectedRemoteMode).toBe('buttons');
  });

  it('upserts discovered devices by id', () => {
    const store = createAppStore();
    store.dispatch(tvActions.deviceDiscovered(makeMockDevice({ name: 'A' })));
    store.dispatch(tvActions.deviceDiscovered(makeMockDevice({ name: 'B' })));
    expect(store.getState().tv.discoveredDevices).toHaveLength(1);
    expect(store.getState().tv.discoveredDevices[0].name).toBe('B');
  });

  it('keeps remote state serializable', () => {
    const store = createAppStore();
    store.dispatch(remoteActions.volumeChanged(12));
    expect(JSON.parse(JSON.stringify(store.getState()))).toEqual(store.getState());
  });
});

describe('container wiring (integration)', () => {
  it('mirrors connection lifecycle and capabilities into Redux', async () => {
    const { store, useCases } = createContainer();
    expect(makeSelectCanUse('volumeControl')(store.getState())).toBe(false);

    await useCases.pairTV.execute(makeMockDevice());
    const state = store.getState();
    expect(selectIsReady(state)).toBe(true);
    expect(state.connection.pairingStatus).toBe(PairingStatus.Paired);
    expect(state.connection.lastConnectedDeviceId).toBe('mock-1');
    expect(makeSelectCanUse('volumeControl')(state)).toBe(true);
    expect(makeSelectCanUse('powerOn')(state)).toBe(false);

    await useCases.disconnectTV.execute();
    expect(store.getState().connection.status).toBe(TVConnectionState.Disconnected);
    expect(store.getState().tv.capabilities).toBeNull();
  });

  it('records unsupported devices as an error without storing class instances', async () => {
    const { store, useCases } = createContainer();
    await expect(useCases.connectTV.execute(makeWebOSDevice())).rejects.toBeDefined();
    const { connection } = store.getState();
    expect(connection.status).toBe(TVConnectionState.Error);
    expect(connection.error).toEqual({
      code: 'unsupported_operation',
      message: expect.any(String),
    });
  });

  it('sends commands through the container', async () => {
    const { useCases } = createContainer();
    await useCases.connectTV.execute(makeMockDevice());
    await expect(useCases.sendRemoteCommand.execute({ type: 'volumeUp' })).resolves.toBeUndefined();
    await expect(useCases.sendRemoteCommand.execute({ type: 'powerOn' })).rejects.toMatchObject({
      code: 'unsupported_operation',
    });
  });
});
