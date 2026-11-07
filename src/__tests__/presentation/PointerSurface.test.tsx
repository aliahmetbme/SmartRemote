import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, Platform, StyleSheet } from 'react-native';
import * as RN from 'react-native';
import { Provider } from 'react-redux';
import { PointerSurface } from '../../presentation/components/PointerSurface';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeWebOSDevice } from '../../testing/fixtures';
import { POINTER_RESUME_DELAY_MS } from '../../presentation/hooks/useHybridPointer';
import { remoteActions } from '../../store/slices/remoteSlice';
import { MotionPointerController } from '../../presentation/controllers/MotionPointerController';
import type {
  DeviceMotionSample,
  IMotionSensorService,
  MotionSampleListener,
} from '../../domain/interfaces/IMotionSensorService';

class Sensor implements IMotionSensorService {
  available = true;
  tracking = false;
  failStart = false;
  listener: MotionSampleListener | null = null;
  interrupted = new Set<() => void>();
  isAvailable = jest.fn(async () => this.available);
  start = jest.fn(async (_interval: number, listener: MotionSampleListener) => {
    if (this.failStart) throw new Error('Sensor failed');
    this.listener = listener;
    this.tracking = true;
  });
  stop = jest.fn(async () => {
    this.tracking = false;
    this.listener = null;
  });
  isTracking = () => this.tracking;
  onInterrupted = (listener: () => void) => {
    this.interrupted.add(listener);
    return () => {
      this.interrupted.delete(listener);
    };
  };
  emit(timestamp: number) {
    const sample: DeviceMotionSample = {
      timestamp,
      attitude: { pitch: 0, roll: 0, yaw: 0 },
      rotationRate: { x: 0.6, y: 0.6, z: 0 },
      gravity: { x: 0, y: -1, z: 0 },
    };
    this.listener?.(sample);
  }
}
const event = (x = 100, y = 100) => ({
  nativeEvent: {
    pageX: x,
    pageY: y,
    locationX: 20,
    locationY: 20,
    identifier: 0,
    touches: [],
  },
  touchHistory: {
    mostRecentTimeStamp: Date.now(),
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    touchBank: [
      {
        touchActive: true,
        startPageX: x,
        startPageY: y,
        startTimeStamp: Date.now(),
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: Date.now(),
        previousPageX: x,
        previousPageY: y,
        previousTimeStamp: Date.now(),
      },
    ],
  },
});

describe('Smart Hybrid Pointer', () => {
  let tree: Renderer.ReactTestRenderer | null;
  let listeners: Set<(state: 'active' | 'background' | 'inactive') => void>;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(2000);
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
        tree?.unmount();
      });
    tree = null;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const setup = async (
    available = true,
    automaticMotion = true,
    failStart = false,
  ) => {
    const sensor = new Sensor();
    sensor.available = available;
    sensor.failStart = failStart;
    const adapter = new MockTVAdapter({
      capabilities: { pointerControl: true, navigation: true },
    });
    const container = createContainer({
      motionSensorService: sensor,
      adapterFactory: { create: () => adapter, supports: () => true },
    });
    await container.remotePreferences.ready;
    container.store.dispatch(
      remoteActions.motionPreferencesChanged({ automaticMotion }),
    );
    await container.useCases.connectTV.execute(makeWebOSDevice());
    const command = jest.spyOn(container.useCases.sendRemoteCommand, 'execute');
    const active = jest.fn();
    await act(async () => {
      tree = Renderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <PointerSurface onActiveChange={active} />
          </ContainerProvider>
        </Provider>,
      );
    });
    const touchpad = () =>
      tree!.root.findByProps({ testID: 'touchpad-surface' });
    const select = () => tree!.root.findByProps({ testID: 'pointer-select' });
    const advance = async (ms = POINTER_RESUME_DELAY_MS) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };
    const grant = async () => {
      await act(async () => {
        touchpad().props.onResponderGrant(event());
      });
    };
    const release = async () => {
      await act(async () => {
        touchpad().props.onResponderRelease(event());
      });
    };
    const emit = async () => {
      await act(async () => {
        sensor.emit(1000);
        sensor.emit(1025);
      });
    };
    const clicks = () =>
      command.mock.calls.filter(([c]) => c.type === 'select');
    const moves = () =>
      command.mock.calls.filter(([c]) => c.type === 'movePointer');
    return {
      sensor,
      container,
      adapter,
      command,
      active,
      touchpad,
      select,
      advance,
      grant,
      release,
      emit,
      clicks,
      moves,
    };
  };
  it.each(['ios', 'android'])(
    'activates automatic Motion when entering Pointer on %s',
    async platform => {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: platform,
      });
      try {
        const env = await setup();
        expect(env.sensor.tracking).toBe(true);
        await env.emit();
        expect(env.moves().length).toBeGreaterThan(0);
      } finally {
        Object.defineProperty(Platform, 'OS', {
          configurable: true,
          value: original,
        });
      }
    },
  );
  it('touchpad takeover immediately invalidates Motion output and sends drag deltas exclusively', async () => {
    const env = await setup();
    await env.emit();
    const old = env.moves().at(-1)![0];
    await env.grant();
    expect(env.sensor.tracking).toBe(false);
    if (old.type === 'movePointer') expect(old.isCurrent?.()).toBe(false);
    await env.advance(30);
    await act(async () => {
      env.touchpad().props.onResponderMove(event(120, 130));
    });
    expect(env.moves().at(-1)![0]).toEqual(
      expect.objectContaining({ type: 'movePointer', deltaX: 20, deltaY: 30 }),
    );
    await env.release();
    expect(env.clicks()).toHaveLength(0);
    expect(env.sensor.tracking).toBe(false);
    await env.advance();
    expect(env.sensor.tracking).toBe(true);
  });
  it('restarts from a fresh baseline after touchpad release without replaying old deltas', async () => {
    const env = await setup();
    await env.emit();
    await env.grant();
    await env.advance(300);
    await env.release();
    const count = env.moves().length;
    await env.advance();
    await act(async () => {
      env.sensor.emit(100000);
    });
    expect(env.moves()).toHaveLength(count); // first new sample anchors; it cannot move.
    await act(async () => {
      env.sensor.emit(100025);
    });
    expect(env.moves().length).toBeGreaterThan(count);
  });
  it('touchpad tap selects once and stabilizes Motion until the bounded resumption', async () => {
    const env = await setup();
    await env.grant();
    await env.advance(50);
    await env.release();
    expect(env.clicks()).toHaveLength(1);
    expect(env.sensor.tracking).toBe(false);
    await env.advance(POINTER_RESUME_DELAY_MS - 1);
    expect(env.sensor.tracking).toBe(false);
    await env.advance(1);
    expect(env.sensor.tracking).toBe(true);
  });
  it('Select sends one click, pauses movement and restores automatic Motion', async () => {
    const env = await setup();
    await env.emit();
    const old = env.moves().at(-1)![0];
    await act(async () => {
      env.select().props.onPressIn();
    });
    expect(env.sensor.tracking).toBe(false);
    expect(env.clicks()).toHaveLength(0);
    await act(async () => {
      env.select().props.onPressOut();
      env.select().props.onPress();
    });
    expect(env.clicks()).toHaveLength(1);
    expect(env.sensor.tracking).toBe(false);
    if (old.type === 'movePointer') expect(old.isCurrent?.()).toBe(false);
    await env.advance();
    expect(env.sensor.tracking).toBe(true);
  });
  it('rapid Select presses each send exactly one click without competing motion', async () => {
    const env = await setup();
    for (let i = 0; i < 5; ++i)
      await act(async () => {
        env.select().props.onPress();
      });
    expect(env.clicks()).toHaveLength(5);
    expect(env.sensor.tracking).toBe(false);
    await env.advance();
    expect(env.sensor.tracking).toBe(true);
  });
  it('Recenter invokes existing calibration without clicking', async () => {
    const recenter = jest.spyOn(MotionPointerController.prototype, 'recenter');
    const env = await setup();
    recenter.mockClear();
    await act(async () => {
      tree!.root.findByProps({ testID: 'pointer-recenter' }).props.onPress();
    });
    expect(recenter).toHaveBeenCalled();
    expect(env.clicks()).toHaveLength(0);
    await env.advance();
    expect(env.sensor.tracking).toBe(true);
  });
  it('Automatic Motion disabled leaves sensors inactive and touchpad/select usable', async () => {
    const env = await setup(true, false);
    expect(env.sensor.start).not.toHaveBeenCalled();
    await env.grant();
    await env.release();
    expect(env.clicks()).toHaveLength(1);
    await env.advance();
    expect(env.sensor.tracking).toBe(false);
    await act(async () => {
      env.select().props.onPress();
    });
    expect(env.clicks()).toHaveLength(2);
  });
  it('live preference changes stop and restore automatic Motion', async () => {
    const env = await setup();
    await act(async () => {
      env.container.store.dispatch(
        remoteActions.motionPreferencesChanged({ automaticMotion: false }),
      );
    });
    expect(env.sensor.tracking).toBe(false);
    await act(async () => {
      env.container.store.dispatch(
        remoteActions.motionPreferencesChanged({ automaticMotion: true }),
      );
    });
    expect(env.sensor.tracking).toBe(true);
  });
  it('unsupported sensors gracefully retain touchpad and Select', async () => {
    const env = await setup(false);
    expect(env.sensor.start).not.toHaveBeenCalled();
    await env.grant();
    await env.release();
    expect(env.clicks()).toHaveLength(1);
    await act(async () => {
      env.select().props.onPress();
    });
    expect(env.clicks()).toHaveLength(2);
    expect(
      tree!.root.findByProps({ testID: 'pointer-feedback' }),
    ).toBeDefined();
  });
  it('background stops motion immediately; foreground restores only the valid source', async () => {
    const env = await setup();
    await env.emit();
    const old = env.moves().at(-1)![0];
    await act(async () => {
      listeners.forEach(listener => listener('background'));
    });
    expect(env.sensor.tracking).toBe(false);
    if (old.type === 'movePointer') expect(old.isCurrent?.()).toBe(false);
    await act(async () => {
      listeners.forEach(listener => listener('active'));
    });
    expect(env.sensor.tracking).toBe(true);
  });
  it('disconnect stops motion and guards Select', async () => {
    const env = await setup();
    await act(async () => {
      await env.container.connectionManager.disconnect();
    });
    expect(env.sensor.tracking).toBe(false);
    expect(env.select().props.disabled).toBe(true);
    await act(async () => {
      env.select().props.onPress();
    });
    expect(env.clicks()).toHaveLength(0);
  });
  it('TV switching discards old movement and restores motion only for the valid new session', async () => {
    const env = await setup();
    await env.emit();
    const old = env.moves().at(-1)![0];
    await act(async () => {
      await env.container.useCases.connectTV.execute(
        makeWebOSDevice({ id: 'second' }),
      );
    });
    if (old.type === 'movePointer') expect(old.isCurrent?.()).toBe(false);
    expect(env.sensor.tracking).toBe(true);
  });
  it('unmount stops sensors and all stale motion callbacks become invalid', async () => {
    const env = await setup();
    await env.emit();
    const old = env.moves().at(-1)![0];
    await act(async () => {
      tree!.unmount();
    });
    tree = null;
    if (old.type === 'movePointer') expect(old.isCurrent?.()).toBe(false);
    await env.advance();
    expect(env.sensor.tracking).toBe(false);
  });
  it('touchpad cancellation never selects and restores Motion after the transition', async () => {
    const env = await setup();
    await env.grant();
    await act(async () => {
      env.touchpad().props.onResponderTerminate(event());
    });
    await env.release();
    expect(env.clicks()).toHaveLength(0);
    await env.advance();
    expect(env.sensor.tracking).toBe(true);
  });
  it('background invalidates a touchpad tap rather than clicking after foreground', async () => {
    const env = await setup();
    await env.grant();
    await act(async () => {
      listeners.forEach(listener => listener('background'));
      listeners.forEach(listener => listener('active'));
    });
    await env.release();
    expect(env.clicks()).toHaveLength(0);
  });
  it('sensor failure is nonfatal and does not cause an automatic startup loop', async () => {
    const env = await setup(true, true, true);
    expect(env.sensor.tracking).toBe(false);
    const attempts = env.sensor.start.mock.calls.length;
    await env.advance(1000);
    expect(env.sensor.start).toHaveBeenCalledTimes(attempts);
    await env.grant();
    await env.release();
    expect(env.clicks()).toHaveLength(1);
  });
  it('pointer socket failure stops Motion; explicit new touch interaction can recover', async () => {
    const env = await setup();
    env.command.mockRejectedValueOnce(new Error('pointer unavailable'));
    await env.emit();
    expect(env.sensor.tracking).toBe(false);
    await env.advance(1000);
    expect(env.sensor.tracking).toBe(false);
    await env.grant();
    await env.release();
    expect(env.clicks()).toHaveLength(1);
    await env.advance();
    expect(env.sensor.tracking).toBe(true);
  });
  it('a delayed selection completion cannot take ownership from a newer touch', async () => {
    const env = await setup();
    let resolve!: () => void;
    env.command.mockImplementationOnce(
      () =>
        new Promise<void>(done => {
          resolve = done;
        }),
    );
    await act(async () => {
      env.select().props.onPress();
    });
    await env.grant();
    await act(async () => {
      resolve();
    });
    await env.advance(1000);
    expect(env.sensor.tracking).toBe(false);
  });
  it.each([
    [320, 640, 1.6],
    [430, 932, 1],
  ])(
    'keeps compact controls accessible at %s x %s font %s',
    async (width, height, fontScale) => {
      jest
        .spyOn(RN, 'useWindowDimensions')
        .mockReturnValue({ width, height, fontScale, scale: 3 });
      const env = await setup();
      expect(tree!.root.findAllByProps({ testID: 'pointer-aim' })).toHaveLength(
        0,
      );
      expect(
        tree!.root.findAllByProps({ testID: 'pointer-exit' }),
      ).toHaveLength(0);
      expect(
        tree!.root.findAllByProps({ testID: 'pointer-method-selector' }),
      ).toHaveLength(0);
      expect(
        StyleSheet.flatten(env.select().props.style).minHeight,
      ).toBeGreaterThanOrEqual(48);
      expect(env.touchpad().props.accessibilityLabel).toBe(
        'Move television pointer.',
      );
    },
  );
  it('releasing a Select press cannot steal ownership from a newer touchpad contact', async () => {
    const env = await setup();
    await act(async () => {
      env.select().props.onPressIn();
    });
    await env.grant();
    await act(async () => {
      env.select().props.onPressOut();
      env.select().props.onPress();
    });
    await env.advance(30);
    await act(async () => {
      env.touchpad().props.onResponderMove(event(120, 130));
    });
    expect(env.moves().at(-1)![0]).toEqual(
      expect.objectContaining({ deltaX: 20, deltaY: 30 }),
    );
    expect(env.clicks()).toHaveLength(0);
  });
});
