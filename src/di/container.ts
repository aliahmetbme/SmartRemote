import { DiscoveryManager } from '../application/services/DiscoveryManager';
import { TVConnectionManager } from '../application/services/TVConnectionManager';
import { Scheduler } from '../domain/interfaces/IScheduler';
import { ConnectTVUseCase } from '../application/usecases/ConnectTVUseCase';
import { DisconnectTVUseCase } from '../application/usecases/DisconnectTVUseCase';
import { DiscoverTVsUseCase } from '../application/usecases/DiscoverTVsUseCase';
import { ForgetTVUseCase } from '../application/usecases/ForgetTVUseCase';
import { PairTVUseCase } from '../application/usecases/PairTVUseCase';
import { ProbeManualIPUseCase } from '../application/usecases/ProbeManualIPUseCase';
import { ReconnectTVUseCase } from '../application/usecases/ReconnectTVUseCase';
import { RestoreLastTVUseCase } from '../application/usecases/RestoreLastTVUseCase';
import { SendRemoteCommandUseCase } from '../application/usecases/SendRemoteCommandUseCase';
import { GetInstalledAppsUseCase } from '../application/usecases/GetInstalledAppsUseCase';
import { StartupRestorationUseCase } from '../application/usecases/StartupRestorationUseCase';
import { tvActions } from '../store/slices/tvSlice';
import { ICredentialStorage } from '../domain/interfaces/ICredentialStorage';
import { ITVAdapterFactory } from '../domain/interfaces/ITVAdapterFactory';
import { ITVDeviceRepository } from '../domain/interfaces/ITVDeviceRepository';
import { ITVDiscoveryService } from '../domain/interfaces/ITVDiscoveryService';
import { LGWebOSSSDPDiscoveryStrategy } from '../infrastructure/discovery/discovery-strategies/LGWebOSSSDPDiscoveryStrategy';
import { ManualIPDiscoveryStrategy } from '../infrastructure/discovery/discovery-strategies/ManualIPDiscoveryStrategy';
import { NativeUdpSocketTransport } from '../infrastructure/discovery/transport/NativeUdpSocketTransport';
import { TVDiscoveryService } from '../infrastructure/discovery/TVDiscoveryService';
import { createDefaultAdapterFactory } from '../infrastructure/factories/TVAdapterFactory';
import { LocalTVDeviceRepository } from '../infrastructure/repositories/LocalTVDeviceRepository';
import { AsyncStorageKeyValueStorage } from '../infrastructure/storage/AsyncStorageKeyValueStorage';
import { IKeyValueStorage } from '../infrastructure/storage/IKeyValueStorage';
import { InMemoryCredentialStorage } from '../infrastructure/storage/InMemoryCredentialStorage';
import { InMemoryKeyValueStorage } from '../infrastructure/storage/InMemoryKeyValueStorage';
import { SecureCredentialStorage } from '../infrastructure/storage/SecureCredentialStorage';
import { IMotionSensorService } from '../domain/interfaces/IMotionSensorService';
import { CoreMotionSensorService } from '../infrastructure/sensors/CoreMotionSensorService';
import { AppStore, createAppStore } from '../store';
import { bindConnectionToStore } from './bindConnectionToStore';

export interface ContainerOverrides {
  keyValueStorage?: IKeyValueStorage;
  adapterFactory?: ITVAdapterFactory;
  scheduler?: Scheduler;
  /** Secure credential storage. LG webOS is registered when this is provided. */
  credentialStorage?: ICredentialStorage;
  discoveryService?: ITVDiscoveryService;
  manualStrategy?: ManualIPDiscoveryStrategy;
  motionSensorService?: IMotionSensorService;
}

export function createContainer(overrides: ContainerOverrides = {}) {
  const store: AppStore = createAppStore();
  const credentialStorage: ICredentialStorage =
    overrides.credentialStorage ?? new InMemoryCredentialStorage();
  const deviceRepository: ITVDeviceRepository = new LocalTVDeviceRepository(
    overrides.keyValueStorage ?? new InMemoryKeyValueStorage(),
  );
  const adapterFactory =
    overrides.adapterFactory ??
    createDefaultAdapterFactory({
      lgWebOS: overrides.credentialStorage
        ? { credentialStorage: overrides.credentialStorage, scheduler: overrides.scheduler }
        : undefined,
    });
  const connectionManager = new TVConnectionManager(adapterFactory, {
    scheduler: overrides.scheduler,
  });
  bindConnectionToStore(connectionManager, store.dispatch, deviceRepository);

  const manualStrategy = overrides.manualStrategy ?? new ManualIPDiscoveryStrategy();
  const discoveryService: ITVDiscoveryService =
    overrides.discoveryService ??
    new TVDiscoveryService({
      strategies: [new LGWebOSSSDPDiscoveryStrategy(new NativeUdpSocketTransport())],
      manualStrategy,
    });
  const motionSensorService: IMotionSensorService =
    overrides.motionSensorService ?? new CoreMotionSensorService();

  const connectTV = new ConnectTVUseCase(connectionManager, deviceRepository);
  const restoreLastTV = new RestoreLastTVUseCase(connectionManager, deviceRepository);
  const discoverTVs = new DiscoverTVsUseCase(discoveryService);
  const probeManualIP = new ProbeManualIPUseCase(manualStrategy);
  const startupRestoration = new StartupRestorationUseCase(deviceRepository, restoreLastTV);
  const discoveryManager = new DiscoveryManager(discoverTVs, {
    onDiscoveryStarted: () => store.dispatch(tvActions.discoveryStarted()),
    onDeviceDiscovered: device => store.dispatch(tvActions.deviceDiscovered(device)),
    onDiscoveryCompleted: () => store.dispatch(tvActions.discoveryCompleted()),
    onDiscoveryFailed: err => store.dispatch(tvActions.discoveryFailed(err)),
  });
  const getInstalledApps = new GetInstalledAppsUseCase(connectionManager);
  const forgetTV = new ForgetTVUseCase(deviceRepository, connectionManager, credentialStorage);

  return {
    store,
    adapterFactory,
    deviceRepository,
    connectionManager,
    discoveryService,
    discoveryManager,
    motionSensorService,
    credentialStorage,
    useCases: {
      connectTV,
      pairTV: new PairTVUseCase(connectTV),
      disconnectTV: new DisconnectTVUseCase(connectionManager),
      reconnectTV: new ReconnectTVUseCase(connectionManager),
      restoreLastTV,
      sendRemoteCommand: new SendRemoteCommandUseCase(connectionManager),
      discoverTVs,
      probeManualIP,
      startupRestoration,
      getInstalledApps,
      forgetTV,
    },
  };
}

/**
 * Factory for production containers using native Keychain, AsyncStorage, and native networking.
 */
export function createProductionContainer() {
  return createContainer({
    credentialStorage: new SecureCredentialStorage(),
    keyValueStorage: new AsyncStorageKeyValueStorage(),
  });
}

export type AppContainer = ReturnType<typeof createContainer>;
