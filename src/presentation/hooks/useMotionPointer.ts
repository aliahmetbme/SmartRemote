import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import {
  MotionPointerController,
  MotionDiagnosticData,
} from '../controllers/MotionPointerController';

export interface UseMotionPointerOptions {
  onActiveChange?: (active: boolean) => void;
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
  const [sensitivity, setSensitivityState] = useState<number>(1.0);
  const [invertX, setInvertXState] = useState<boolean>(false);
  const [invertY, setInvertYState] = useState<boolean>(false);
  const [isDiagMode, setIsDiagModeState] = useState<boolean>(false);
  const [diagData, setDiagData] = useState<MotionDiagnosticData | null>(null);

  const samplingOnAim = container.motionSamplingOnAim;
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
        if (!isConnectedRef.current || !isPointerSupportedRef.current) return;
        const generation = controller.getMovementGeneration();
        const session = container.connectionManager.getOperationRevision();
        if (samplingOnAim && engagedConnectionRevision.current !== session) return;
        await container.useCases.sendRemoteCommand.execute({
          type: 'movePointer',
          isCurrent: () => controller.getIsRunning() && controller.getIsEngaged() &&
            controller.getMovementGeneration() === generation && isConnectedRef.current &&
            container.connectionManager.getOperationRevision() === session,
          deltaX,
          deltaY,
        });
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
  const setSensitivity = useCallback((value: number) => {
    setSensitivityState(value);
    controllerRef.current?.setSensitivity(value);
  }, []);

  const setInvertX = useCallback((value: boolean) => {
    setInvertXState(value);
    controllerRef.current?.setInvertX(value);
  }, []);

  const setInvertY = useCallback((value: boolean) => {
    setInvertYState(value);
    controllerRef.current?.setInvertY(value);
  }, []);

  const setIsDiagMode = useCallback((value: boolean) => {
    setIsDiagModeState(value);
    controllerRef.current?.setDiagnosticMode(value);
  }, []);

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
        setSensorStartFailed(true);
        setIsAiming(false);
        onActiveChangeRef.current?.(false);
      }
    });
  }, [samplingOnAim, invalidateAim, container.connectionManager]);

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

  // 4. Handle AppState backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        controllerRef.current?.performanceMetrics.interruption('appState');
        setEngaged(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [setEngaged]);

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
