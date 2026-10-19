import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { TVUnsupportedOperationError } from '../../domain/errors/TVUnsupportedOperationError';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import {
  createDefaultAdapterFactory,
  TVAdapterFactory,
} from '../../infrastructure/factories/TVAdapterFactory';
import { makeMockDevice, makeWebOSDevice } from '../../testing/fixtures';

describe('TVAdapterFactory', () => {
  it('selects the mock adapter for mock devices', () => {
    const factory = createDefaultAdapterFactory();
    expect(factory.create(makeMockDevice())).toBeInstanceOf(MockTVAdapter);
  });

  it('never falls back to another adapter for unsupported devices', () => {
    const factory = createDefaultAdapterFactory();
    const webos = makeWebOSDevice();
    expect(factory.supports(webos)).toBe(false);
    expect(() => factory.create(webos)).toThrow(TVUnsupportedOperationError);
  });

  it('requires protocol AND platform to match', () => {
    const factory = createDefaultAdapterFactory();
    const mismatched = makeMockDevice({ platform: TVPlatform.Tizen });
    expect(factory.supports(mismatched)).toBe(false);
  });

  it('supports extensible registration and rejects duplicates', () => {
    const adapter = new MockTVAdapter();
    const factory = new TVAdapterFactory().register({
      id: 'fake-webos',
      supports: d => d.protocol === TVProtocol.LGWebOSSSAP && d.platform === TVPlatform.WebOS,
      create: () => adapter,
    });
    expect(factory.create(makeWebOSDevice())).toBe(adapter);
    expect(() =>
      factory.register({ id: 'fake-webos', supports: () => false, create: () => adapter }),
    ).toThrow();
  });
});
