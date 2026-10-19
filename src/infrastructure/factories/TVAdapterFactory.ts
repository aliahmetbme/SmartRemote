import { TVDevice } from '../../domain/entities/TVDevice';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { TVUnsupportedOperationError } from '../../domain/errors/TVUnsupportedOperationError';
import { ITVAdapterFactory } from '../../domain/interfaces/ITVAdapterFactory';
import { ITVRemoteAdapter } from '../../domain/interfaces/ITVRemoteAdapter';
import { LGWebOSAdapter, LGWebOSAdapterDependencies } from '../adapters/lg-webos/LGWebOSAdapter';
import { MockTVAdapter } from '../adapters/mock/MockTVAdapter';

export interface AdapterRegistration {
  /** Unique name, used for diagnostics and to prevent double registration. */
  id: string;
  /** Must match on BOTH protocol and platform; never on brand alone. */
  supports(device: TVDevice): boolean;
  create(device: TVDevice): ITVRemoteAdapter;
}

/** Registry-style factory. Devices with no matching registration are rejected, never guessed. */
export class TVAdapterFactory implements ITVAdapterFactory {
  private readonly registrations: AdapterRegistration[] = [];

  register(registration: AdapterRegistration): this {
    if (this.registrations.some(r => r.id === registration.id)) {
      throw new Error(`Adapter "${registration.id}" is already registered`);
    }
    this.registrations.push(registration);
    return this;
  }

  supports(device: TVDevice): boolean {
    return this.find(device) !== undefined;
  }

  create(device: TVDevice): ITVRemoteAdapter {
    const registration = this.find(device);
    if (!registration) {
      throw new TVUnsupportedOperationError(
        'connect',
        `no adapter for protocol "${device.protocol}" on platform "${device.platform}"`,
      );
    }
    return registration.create(device);
  }

  private find(device: TVDevice): AdapterRegistration | undefined {
    return this.registrations.find(r => r.supports(device));
  }
}

export const mockAdapterRegistration: AdapterRegistration = {
  id: 'mock',
  supports: d => d.protocol === TVProtocol.Mock && d.platform === TVPlatform.Mock,
  create: () => new MockTVAdapter(),
};

export function createLGWebOSRegistration(deps: LGWebOSAdapterDependencies): AdapterRegistration {
  return {
    id: 'lg-webos',
    supports: d => d.protocol === TVProtocol.LGWebOSSSAP && d.platform === TVPlatform.WebOS,
    create: () => new LGWebOSAdapter(deps),
  };
}

export interface DefaultAdapterFactoryOptions {
  /**
   * LG webOS is registered only when its dependencies (notably secure credential
   * storage) are supplied; otherwise webOS devices are rejected as unsupported.
   */
  lgWebOS?: LGWebOSAdapterDependencies;
}

export function createDefaultAdapterFactory(
  options: DefaultAdapterFactoryOptions = {},
): TVAdapterFactory {
  const factory = new TVAdapterFactory().register(mockAdapterRegistration);
  if (options.lgWebOS) {
    factory.register(createLGWebOSRegistration(options.lgWebOS));
  }
  return factory;
}
