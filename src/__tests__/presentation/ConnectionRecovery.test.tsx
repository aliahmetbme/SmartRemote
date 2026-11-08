import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import {
  ConnectionRecovery,
  connectionGuidance,
} from '../../presentation/components/ConnectionRecovery';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice } from '../../testing/fixtures';
import { TVTimeoutError } from '../../domain/errors/TVConnectionError';
import { connectionActions } from '../../store/slices/connectionSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

describe('Connection recovery guidance', () => {
  let tree: Renderer.ReactTestRenderer | null = null;
  const cleanup: (() => void)[] = [];
  afterEach(async () => {
    if (tree)
      await act(async () => {
        tree!.unmount();
      });
    tree = null;
    cleanup.splice(0).forEach(fn => fn());
  });
  const setup = async () => {
    const adapter = new MockTVAdapter({
      connectError: new TVTimeoutError(
        'sensitive error clientKey=secret 192.168.1.1',
      ),
    });
    const container = createContainer({
      adapterFactory: { create: () => adapter, supports: () => true },
    });
    cleanup.push(
      container.disposeDiagnostics,
      container.remotePreferences.dispose,
    );
    await expect(
      container.useCases.connectTV.execute(makeMockDevice()),
    ).rejects.toThrow();
    const find = jest.fn();
    const settings = jest.fn();
    await act(async () => {
      tree = Renderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <ConnectionRecovery onFindTV={find} onSettings={settings} />
          </ContainerProvider>
        </Provider>,
      );
    });
    return { container, find, settings };
  };
  it('shows safe timeout guidance and routes Try Again through the existing coordinator', async () => {
    const { container } = await setup();
    expect(JSON.stringify(tree!.toJSON())).not.toMatch(
      /secret|clientKey|192\.168/,
    );
    const retry = jest
      .spyOn(container.useCases.reconnectTV, 'execute')
      .mockResolvedValue();
    await act(async () => {
      tree!.root.findByProps({ testID: 'connection-retry' }).props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('shows reconnect progress without a competing retry action', async () => {
    const { container } = await setup();
    await act(async () => {
      container.store.dispatch(
        connectionActions.statusChanged(TVConnectionState.Reconnecting),
      );
    });
    expect(
      tree!.root.findAllByProps({ testID: 'connection-retry' }),
    ).toHaveLength(0);
    expect(JSON.stringify(tree!.toJSON())).toContain('trying to reconnect');
  });
  it('ignores a stale recovery callback after selecting a different TV', async () => {
    const { container } = await setup();
    const callback = tree!.root.findByProps({ testID: 'connection-retry' })
      .props.onPress;
    const retry = jest
      .spyOn(container.useCases.reconnectTV, 'execute')
      .mockResolvedValue();
    const { tvActions } = require('../../store/slices/tvSlice');
    await act(async () => {
      container.store.dispatch(tvActions.deviceSelected('another-tv'));
      await callback();
    });
    expect(retry).not.toHaveBeenCalled();
  });
  it('offers secure TV Settings guidance rather than validation bypass', () => {
    const guidance = connectionGuidance('TLS_TRUST_FAILURE');
    expect(guidance.action).toBe('TV Settings');
    expect(guidance.message).toContain('Settings');
    expect(guidance.action).not.toMatch(/bypass|disable|trust anyway/i);
  });
  it('does not equate a network failure with TV power or public internet speed', () => {
    const guidance = connectionGuidance('TV_UNREACHABLE');
    expect(guidance.message).toContain('may');
    expect(guidance.message).not.toMatch(
      /TV is off|internet speed|different SSID/,
    );
  });
});
