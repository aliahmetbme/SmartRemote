import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, StyleSheet, Text } from 'react-native';
import { TVWakeSetupScreen } from '../../presentation/screens/TVWakeSetupScreen';
import { SettingsScreen } from '../../presentation/screens/SettingsScreen';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { makeWebOSDevice } from '../../testing/fixtures';
import { tvActions } from '../../store/slices/tvSlice';
import type {
  WakeTVExecutionOptions,
  WakeTVResult,
} from '../../application/usecases/WakeTVUseCase';

const metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 24, bottom: 24, left: 0, right: 0 },
};
const sent: WakeTVResult = {
  success: false,
  restored: false,
  packetsSent: 3,
  destinations: ['sensitive.broadcast.address'],
};
describe('TV Wake Setup', () => {
  let tree: Renderer.ReactTestRenderer | null = null;
  let listeners: Set<(state: 'active' | 'background') => void>;
  const dispose: (() => void)[] = [];
  beforeEach(() => {
    listeners = new Set();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        listeners.add(listener);
        return {
          remove: () => {
            listeners.delete(listener);
          },
        };
      });
  });
  afterEach(async () => {
    if (tree)
      await act(async () => {
        tree!.unmount();
      });
    tree = null;
    dispose.splice(0).forEach(callback => callback());
    jest.restoreAllMocks();
  });
  const setup = async (
    macAddress: string | undefined = '02:11:22:33:44:55',
    supported = true,
    selected = true,
  ) => {
    const container = createContainer({
      wakeService: {
        isSupported: async () => supported,
        wake: jest.fn(async () => ({
          success: true,
          packetsSent: 3,
          destinations: [],
        })),
      },
    });
    dispose.push(
      container.disposeDiagnostics,
      container.remotePreferences.dispose,
    );
    const tv = makeWebOSDevice({
      id: 'wake-a',
      name: 'Living Room TV',
      ipAddress: '192.0.2.10',
      macAddress,
    });
    const other = makeWebOSDevice({
      id: 'wake-b',
      name: 'Bedroom TV',
      ipAddress: '192.0.2.20',
      macAddress: '02:66:77:88:99:AA',
    });
    await container.deviceRepository.save(tv);
    await container.deviceRepository.save(other);
    container.store.dispatch(tvActions.savedDevicesLoaded([tv, other]));
    container.store.dispatch(tvActions.deviceSelected(selected ? tv.id : null));
    const element = (isFocused = true) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <TVWakeSetupScreen
              deviceId={selected ? tv.id : undefined}
              isFocused={isFocused}
            />
          </ContainerProvider>
        </Provider>
      </SafeAreaProvider>
    );
    await act(async () => {
      tree = Renderer.create(element());
    });
    const button = (testID: string) => tree!.root.findByProps({ testID });
    const edit = async (value: string) => {
      await act(async () => {
        button('edit-mac-btn').props.onPress();
      });
      await act(async () => {
        button('settings-mac-input').props.onChangeText(value);
      });
    };
    const wake = jest
      .spyOn(container.useCases.wakeTV, 'execute')
      .mockResolvedValue(sent);
    return { container, tv, other, button, edit, wake, element };
  };
  it('shows one target name and keeps network addresses out of its summary', async () => {
    const { tv } = await setup();
    const card = tree!.root.findByProps({ testID: 'wake-target-card' });
    const json = JSON.stringify(
      card.findAllByType(Text).map(node => node.props.children),
    );
    expect(json).toContain(tv.name);
    expect(json).not.toContain(tv.ipAddress);
    expect(json).not.toContain(tv.macAddress!);
    expect(JSON.stringify(tree!.toJSON()).split(tv.name)).toHaveLength(2);
  });
  it('handles no selected TV even when other TVs are saved', async () => {
    const { button } = await setup(undefined, true, false);
    expect(JSON.stringify(tree!.toJSON())).toContain('Choose a TV first');
    expect(tree!.root.findAllByProps({ testID: 'test-wake-btn' })).toHaveLength(
      0,
    );
    expect(button('tv-wake-setup-screen')).toBeDefined();
  });
  it.each(['', 'bad', '00:00:00:00:00:00'])(
    'treats missing/invalid saved MAC as not configured (%s)',
    async mac => {
      const { wake, button } = await setup(mac);
      expect(JSON.stringify(tree!.toJSON())).toContain('TV wake is not set up');
      expect(button('test-wake-btn').props.disabled).toBe(true);
      await act(async () => {
        button('test-wake-btn').props.onPress();
      });
      expect(wake).not.toHaveBeenCalled();
    },
  );
  it('says configuration saved without asserting wake capability', async () => {
    await setup();
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('Wake configuration saved');
    expect(json).not.toMatch(
      /Wake Enabled|Fully Supported|All Detected|TV is ready|TV woke successfully/,
    );
  });
  it('validates an unsaved invalid address without invoking persistence', async () => {
    const { container, edit, button } = await setup();
    const save = jest.spyOn(container.useCases.updateTVMac, 'execute');
    await edit('not-a-mac');
    await act(async () => {
      button('save-mac-btn').props.onPress();
    });
    expect(button('wake-address-error').props.children).toContain('valid MAC');
    expect(save).not.toHaveBeenCalled();
  });
  it('persists a canonical address and synchronizes Redux for the original TV', async () => {
    const { container, tv, edit, button } = await setup('');
    await edit('02-AB-CD-EF-12-34');
    await act(async () => {
      await button('save-mac-btn').props.onPress();
    });
    expect((await container.deviceRepository.getById(tv.id))?.macAddress).toBe(
      '02:AB:CD:EF:12:34',
    );
    expect(
      container.store
        .getState()
        .tv.savedDevices.find(device => device.id === tv.id)?.macAddress,
    ).toBe('02:AB:CD:EF:12:34');
    expect(JSON.stringify(tree!.toJSON())).toContain('Network address saved');
  });
  it('has no enabled save action for unchanged data and Cancel discards only the draft', async () => {
    const { edit, button, tv, container } = await setup();
    await edit(tv.macAddress!);
    expect(button('save-mac-btn').props.disabled).toBe(true);
    await act(async () => {
      button('settings-mac-input').props.onChangeText('02:AA:BB:CC:DD:EE');
      button('cancel-mac-btn').props.onPress();
    });
    expect((await container.deviceRepository.getById(tv.id))?.macAddress).toBe(
      tv.macAddress,
    );
    expect(
      tree!.root.findAllByProps({ testID: 'settings-mac-input' }),
    ).toHaveLength(0);
  });
  it('explains model-dependent TV settings without remote configuration controls', async () => {
    const { button } = await setup();
    await act(async () => {
      button('wake-help-toggle').props.onPress();
    });
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('TV On With Mobile');
    expect(json).toContain('Quick Start+');
    expect(json).toContain('vary by model');
    expect(button('wake-help-toggle').props.accessibilityState.expanded).toBe(
      true,
    );
  });
  it('disables testing when the existing runtime reports unavailable, without declaring the TV unsupported', async () => {
    const { button, wake } = await setup('02:11:22:33:44:55', false);
    expect(button('test-wake-btn').props.disabled).toBe(true);
    await act(async () => {
      button('test-wake-btn').props.onPress();
    });
    expect(wake).not.toHaveBeenCalled();
    expect(JSON.stringify(tree!.toJSON())).not.toContain('TV unsupported');
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'Wake configuration saved',
    );
  });
  it('coalesces duplicate UI submissions and preserves existing execution options', async () => {
    const { button, wake, tv } = await setup();
    let resolve!: (result: WakeTVResult) => void;
    wake.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    await act(async () => {
      button('test-wake-btn').props.onPress();
      button('test-wake-btn').props.onPress();
    });
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(
      tv,
      expect.objectContaining({
        wakeTimeoutMs: 15000,
        probeIntervalMs: 1500,
        abortSignal: { aborted: false },
      }),
    );
    expect(button('test-wake-btn').props.accessibilityState.busy).toBe(true);
    await act(async () => {
      resolve(sent);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain('did not reconnect');
    expect(JSON.stringify(tree!.toJSON())).not.toContain('sensitive.broadcast');
  });
  it('reports packet sending separately from confirmed reconnection', async () => {
    const { button, wake } = await setup();
    await act(async () => {
      await button('test-wake-btn').props.onPress();
    });
    expect(JSON.stringify(tree!.toJSON())).toContain('Wake request sent');
    expect(JSON.stringify(tree!.toJSON())).not.toContain('TV reconnected');
    wake.mockResolvedValue({ ...sent, success: true, restored: true });
    await act(async () => {
      await button('test-wake-btn').props.onPress();
    });
    expect(JSON.stringify(tree!.toJSON())).toContain('TV reconnected');
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'does not by itself verify',
    );
  });
  it('reports an unsuccessful send without claiming a packet or TV response', async () => {
    const { button, wake } = await setup();
    wake.mockResolvedValue({ ...sent, packetsSent: 0 });
    await act(async () => {
      await button('test-wake-btn').props.onPress();
    });
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'No wake request was confirmed',
    );
    wake.mockRejectedValue(new Error('private socket destination'));
    await act(async () => {
      await button('test-wake-btn').props.onPress();
    });
    expect(JSON.stringify(tree!.toJSON())).not.toContain('private socket');
  });
  it('invalidates the pinned context when TVs switch, even if they switch back', async () => {
    const { container, other, tv, button, wake } = await setup();
    await act(async () => {
      container.store.dispatch(tvActions.deviceSelected(other.id));
    });
    expect(button('test-wake-btn').props.disabled).toBe(true);
    await act(async () => {
      container.store.dispatch(tvActions.deviceSelected(tv.id));
    });
    await act(async () => {
      button('test-wake-btn').props.onPress();
    });
    expect(wake).not.toHaveBeenCalled();
    expect(
      tree!.root.findByProps({ testID: 'wake-selection-changed' }),
    ).toBeDefined();
  });
  it.each(['switch', 'background', 'blur', 'unmount'] as const)(
    'cancels and ignores a pending test after %s',
    async reason => {
      const { container, other, button, wake, element } = await setup();
      let resolve!: (result: WakeTVResult) => void;
      let options!: WakeTVExecutionOptions;
      wake.mockImplementation((_device, opts) => {
        options = opts!;
        return new Promise(done => {
          resolve = done;
        });
      });
      await act(async () => {
        button('test-wake-btn').props.onPress();
      });
      await act(async () => {
        if (reason === 'switch')
          container.store.dispatch(tvActions.deviceSelected(other.id));
        if (reason === 'background')
          listeners.forEach(listener => listener('background'));
        if (reason === 'blur') tree!.update(element(false));
        if (reason === 'unmount') {
          tree!.unmount();
          tree = null;
        }
      });
      expect(options.abortSignal?.aborted).toBe(true);
      await act(async () => {
        options.onProgress?.('connected');
        resolve({ ...sent, success: true, restored: true });
      });
      if (tree)
        expect(JSON.stringify(tree.toJSON())).not.toContain('TV reconnected');
    },
  );
  it('keeps an in-flight save attached to its original TV after selection changes', async () => {
    const { container, tv, other, edit, button } = await setup();
    let resolve!: (device: typeof tv) => void;
    const save = jest
      .spyOn(container.useCases.updateTVMac, 'execute')
      .mockImplementation(
        () =>
          new Promise(done => {
            resolve = done;
          }),
      );
    await edit('02:AA:BB:CC:DD:EE');
    await act(async () => {
      button('save-mac-btn').props.onPress();
    });
    await act(async () => {
      container.store.dispatch(tvActions.deviceSelected(other.id));
      resolve({ ...tv, macAddress: '02:AA:BB:CC:DD:EE' });
    });
    expect(save).toHaveBeenCalledWith(tv.id, '02:AA:BB:CC:DD:EE');
    expect(
      container.store
        .getState()
        .tv.savedDevices.find(device => device.id === other.id)?.macAddress,
    ).toBe(other.macAddress);
    expect(JSON.stringify(tree!.toJSON())).not.toContain(
      'Network address saved',
    );
  });
  it('offers explicit cancellation without creating another wake submission', async () => {
    const { button, wake } = await setup();
    let resolve!: (result: WakeTVResult) => void;
    let options!: WakeTVExecutionOptions;
    wake.mockImplementation((_device, opts) => {
      options = opts!;
      return new Promise(done => {
        resolve = done;
      });
    });
    await act(async () => {
      button('test-wake-btn').props.onPress();
    });
    await act(async () => {
      button('cancel-wake-test').props.onPress();
      button('test-wake-btn').props.onPress();
    });
    expect(options.abortSignal?.aborted).toBe(true);
    expect(wake).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(sent);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain('Test cancelled');
  });
  it('retains 48-point controls and keyboard-aware scrolling on small screens', async () => {
    const { button, edit } = await setup();
    await edit('02:AA:BB:CC:DD:EE');
    expect(
      StyleSheet.flatten(button('settings-mac-input').props.style).minHeight,
    ).toBeGreaterThanOrEqual(48);
    expect(
      StyleSheet.flatten(button('save-mac-btn').props.style).minHeight,
    ).toBeGreaterThanOrEqual(48);
    expect(
      button('tv-wake-setup-screen').props.automaticallyAdjustKeyboardInsets,
    ).toBe(true);
    expect(button('test-wake-btn').props.accessibilityLabel).toBe(
      'Test TV Wake',
    );
  });
  it('main Settings keeps both saved TVs accessible and passes explicit identity to the wake route', async () => {
    const { container, tv, other } = await setup();
    const navigate = jest.fn();
    await act(async () => {
      tree!.update(
        <SafeAreaProvider initialMetrics={metrics}>
          <Provider store={container.store}>
            <ContainerProvider container={container}>
              <SettingsScreen onNavigateToWakeSetup={navigate} />
            </ContainerProvider>
          </Provider>
        </SafeAreaProvider>,
      );
    });
    expect(JSON.stringify(tree!.toJSON())).toContain(tv.name);
    expect(JSON.stringify(tree!.toJSON())).toContain(other.name);
    expect(JSON.stringify(tree!.toJSON())).toContain('Other saved TVs');
    await act(async () => {
      tree!.root.findByProps({ testID: 'tv-wake-setup-link' }).props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith(tv.id);
    expect(
      tree!.root.findAllByProps({ testID: 'settings-mac-input' }),
    ).toHaveLength(0);
  });
});
