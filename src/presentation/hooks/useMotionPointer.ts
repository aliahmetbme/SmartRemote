import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { remoteActions, defaultMotionPreferences } from '../../store/slices/remoteSlice';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import {
  MotionPointerController,
  MotionDiagnosticData,
} from '../controllers/MotionPointerController';

export interface UseMotionPointerOptions {
  onActiveChange?: (active: boolean) => void;
  sampleOnlyWhileEngaged?: boolean;
  isInputCurrent?: () => boolean;
  onInterruption?: () => void;
}

export interface UseMotionPointerResult {
  isConnected: boolean;
  isPointerSupported: boolean;
  isSensorAvailable: boolean | null;
  isAiming: boolean;
  sensorStartFailed: boolean;
  sensitivity: number;
  setSensitivity: (value: number) => void;
  invertX: boolean;
  setInvertX: (value: boolean) => void;
  invertY: boolean;
  setInvertY: (value: boolean) => void;
  isDiagMode: boolean;
  setIsDiagMode: (value: boolean) => void;
  diagData: MotionDiagnosticData | null;
  setEngaged: (engaged: boolean) => void;
  recenter: () => void;
  getPerformanceSnapshot: () => ReturnType<MotionPointerController['getPerformanceSnapshot']>;
}

/**
 * Focused hook separating MotionPointerController lifecycle, sensor management,
 * AppState transitions, and aiming engagement from UI rendering.
 */
export function useMotionPointer(options: UseMotionPointerOptions = {}): UseMotionPointerResult {
  const { onActiveChange } = options;
  const container = useContainer();

  const capabilities = useAppSelector(selectCapabilities);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const isConnected = connectionStatus === TVConnectionState.Connected;
  const pointerState = capabilities?.pointerControl ?? 'unknown';
  const isPointerSupported = pointerState !== 'unsupported';

  const [isSensorAvailable, setIsSensorAvailable] = useState<boolean | null>(null);
  const [sensorStartFailed, setSensorStartFailed] = useState(false);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const dispatch = useAppDispatch();
  const preferences = useAppSelector(state => state.remote.motionPreferences ?? defaultMotionPreferences);
  const { sensitivity, invertX, invertY, diagnosticMode: isDiagMode } = preferences;
  const [diagData, setDiagData] = useState<MotionDiagnosticData | null>(null);

  const samplingOnAim = options.sampleOnlyWhileEngaged ?? container.motionSamplingOnAim;
  const interruptRef = useRef<() => void>(() => undefined);
  const inputCurrentRef = useRef(options.isInputCurrent);
  inputCurrentRef.current = options.isInputCurrent;
  const onInterruptionRef = useRef(options.onInterruption);
  onInterruptionRef.current = options.onInterruption;
  const aimRevision = useRef(0);
  const invalidateAim = useCallback(() => ++aimRevision.current, []);
  const engagedConnectionRevision = useRef<number | null>(null);
  const samplingWork = useRef<Promise<unknown>>(Promise.resolve());
  const sensorAvailableRef = useRef(isSensorAvailable);
  sensorAvailableRef.current = isSensorAvailable;
  const controllerRef = useRef<MotionPointerController | null>(null);
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const isPointerSupportedRef = useRef(isPointerSupported);
  isPointerSupportedRef.current = isPointerSupported;

  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  // 1. Stable MotionPointerController lifecycle: created once per sensor service
  useEffect(() => {
    let isMounted = true;

    const controller = new MotionPointerController(
      container.motionSensorService,
      async (deltaX, deltaY) => {
        if (!isConnectedRef.current || !isPointerSupportedRef.current || inputCurrentRef.current?.() === false) return;
        const generation = controller.getMovementGeneration();
        const session = container.connectionManager.getOperationRevision();
        if (samplingOnAim && engagedConnectionRevision.current !== session) return;
        try {
          await container.useCases.sendRemoteCommand.execute({
            type: 'movePointer',
            isCurrent: () => controller.getIsRunning() && controller.getIsEngaged() &&
              controller.getMovementGeneration() === generation && isConnectedRef.current && inputCurrentRef.current?.() !== false &&
              container.connectionManager.getOperationRevision() === session,
            deltaX,
            deltaY,
          });
        } catch (error) {
          if (samplingOnAim && controller.getMovementGeneration() === generation &&
              container.connectionManager.getOperationRevision() === session) interruptRef.current();
          throw error;
        }
      },
      {
        sensitivity,
        invertX,
        invertY,
        diagnosticMode: isDiagMode,
        onDiagnosticSample: sample => {
          if (isMounted) {
            if (__DEV__) console.log('[SmartRemote][MotionPerformance]', controller.getPerformanceSnapshot());
            setDiagData(sample);
            dispatch(remoteActions.motionDiagnosticSampled(sample));
          }
        },
      },
    );

    controllerRef.current = controller;

    const initialize = samplingOnAim
      ? container.motionSensorService.isAvailable()
      : controller.start();
    initialize.then(available => {
      if (isMounted) {
        setIsSensorAvailable(available);
      }
    }).catch(() => {
      if (isMounted) {
        setIsSensorAvailable(false);
      }
    });

    const unsubscribe = container.motionSensorService.onInterrupted?.(() => {
      onInterruptionRef.current?.();
      invalidateAim();
      engagedConnectionRevision.current = null;
      controller.setEngaged(false);
      controller.stop().catch(() => undefined);
      setIsAiming(false);
      onActiveChangeRef.current?.(false);
    });
    return () => {
      isMounted = false;
      invalidateAim();
      unsubscribe?.();
      controller.stop().catch(() => undefined);
      controllerRef.current = null;
    };
    // Re-create controller only if sensor service changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.motionSensorService, samplingOnAim]);

  // 2. Dynamically apply settings without destroying controller
  useEffect(() => {
    controllerRef.current?.setSensitivity(sensitivity);
    controllerRef.current?.setInvertX(invertX);
    controllerRef.current?.setInvertY(invertY);
    controllerRef.current?.setDiagnosticMode(isDiagMode);
  }, [sensitivity, invertX, invertY, isDiagMode]);

  const setSensitivity = useCallback((value: number) => {
    dispatch(remoteActions.motionPreferencesChanged({ sensitivity: value }));
    controllerRef.current?.setSensitivity(value);
  }, [dispatch]);

  const setInvertX = useCallback((value: boolean) => {
    dispatch(remoteActions.motionPreferencesChanged({ invertX: value }));
    controllerRef.current?.setInvertX(value);
  }, [dispatch]);

  const setInvertY = useCallback((value: boolean) => {
    dispatch(remoteActions.motionPreferencesChanged({ invertY: value }));
    controllerRef.current?.setInvertY(value);
  }, [dispatch]);

  const setIsDiagMode = useCallback((value: boolean) => {
    dispatch(remoteActions.motionPreferencesChanged({ diagnosticMode: value }));
    controllerRef.current?.setDiagnosticMode(value);
  }, [dispatch]);

  const setEngaged = useCallback((engaged: boolean) => {
    const controller = controllerRef.current;
    const canEngage = engaged && isConnectedRef.current && isPointerSupportedRef.current &&
      (!samplingOnAim || sensorAvailableRef.current === true);
    const revision = invalidateAim();
    if (!canEngage || !controller) {
      engagedConnectionRevision.current = null;
      setIsAiming(false);
      controller?.setEngaged(false);
      if (samplingOnAim && controller) {
        const stop = controller.stop();
        samplingWork.current = Promise.allSettled([samplingWork.current, stop]);
      }
      onActiveChangeRef.current?.(false);
      return;
    }

    setIsAiming(true);
    onActiveChangeRef.current?.(true);
    if (!samplingOnAim) {
      controller.setEngaged(true);
      return;
    }

    engagedConnectionRevision.current = container.connectionManager.getOperationRevision();
    setSensorStartFailed(false);
    samplingWork.current = samplingWork.current.then(async () => {
      if (revision !== aimRevision.current) return;
      try {
        const available = await controller.start();
        if (revision !== aimRevision.current) return;
        if (!available) throw new Error('Motion sensors are unavailable');
        controller.setEngaged(true);
      } catch {
        if (revision !== aimRevision.current) return;
        engagedConnectionRevision.current = null;
        controller.setEngaged(false);
        await controller.stop().catch(() => undefined);
        if (revision !== aimRevision.current) return;
        onInterruptionRef.current?.();
        setSensorStartFailed(true);
        setIsAiming(false);
        onActiveChangeRef.current?.(false);
      }
    });
  }, [samplingOnAim, invalidateAim, container.connectionManager]);

  interruptRef.current = () => {
    setEngaged(false);
    onInterruptionRef.current?.();
  };

  const recenter = useCallback(() => {
    controllerRef.current?.recenter();
  }, []);

  // 3. If connection drops while aiming, disengage immediately
  useEffect(() => {
    if ((!isConnected || !isPointerSupported) && isAiming) {
      controllerRef.current?.performanceMetrics.interruption('connection');
      setEngaged(false);
    }
  }, [isConnected, isPointerSupported, isAiming, setEngaged]);

  // Stop Android sampling even if React batches a drop and reconnect into one render.
  useEffect(() => {
    if (!samplingOnAim) return;
    return container.connectionManager.subscribe(snapshot => {
      const revision = engagedConnectionRevision.current;
      if (revision !== null && (snapshot.state !== TVConnectionState.Connected ||
          revision !== container.connectionManager.getOperationRevision())) {
        controllerRef.current?.performanceMetrics.interruption('connection');
        setEngaged(false);
      }
    });
  }, [container.connectionManager, samplingOnAim, setEngaged]);

  // 4. Backgrounding ends a hold. Foreground checks availability without restarting input.
  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const request = ++revision;
      if (nextState !== 'active') {
        controllerRef.current?.performanceMetrics.interruption('appState');
        setEngaged(false);
      } else if (samplingOnAim) {
        container.motionSensorService.isAvailable().catch(() => false).then(available => {
          if (mounted && request === revision) setIsSensorAvailable(available);
        });
      }
    });
    return () => { mounted = false; ++revision; subscription.remove(); };
  }, [setEngaged, samplingOnAim, container.motionSensorService]);

  // 5. Clean up parent scroll lock on unmount
  useEffect(() => {
    return () => {
      onActiveChangeRef.current?.(false);
    };
  }, []);

  return {
    isConnected,
    isPointerSupported,
    isSensorAvailable,
    isAiming,
    sensorStartFailed,
    sensitivity,
    setSensitivity,
    invertX,
    setInvertX,
    invertY,
    setInvertY,
    isDiagMode,
    setIsDiagMode,
    diagData,
    setEngaged,
    recenter,
    getPerformanceSnapshot: () => controllerRef.current?.getPerformanceSnapshot(),
  };
}
