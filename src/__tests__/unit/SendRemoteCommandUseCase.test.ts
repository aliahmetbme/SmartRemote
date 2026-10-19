import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { SendRemoteCommandUseCase } from '../../application/usecases/SendRemoteCommandUseCase';
import { NavigationDirection, RemoteKey } from '../../domain/enums/RemoteKey';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { TVUnsupportedOperationError } from '../../domain/errors/TVUnsupportedOperationError';
import { MockTVAdapter, MockTVAdapterOptions } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice } from '../../testing/fixtures';

async function setup(options?: MockTVAdapterOptions) {
  const adapter = new MockTVAdapter(options);
  const manager = new TVConnectionManager({ supports: () => true, create: () => adapter });
  const useCase = new SendRemoteCommandUseCase(manager);
  return { adapter, manager, useCase, connect: () => manager.connect(makeMockDevice()) };
}

describe('SendRemoteCommandUseCase', () => {
  it('rejects commands while not connected', async () => {
    const { useCase } = await setup();
    await expect(useCase.execute({ type: 'volumeUp' })).rejects.toBeInstanceOf(TVConnectionError);
  });

  it('forwards supported commands to the adapter', async () => {
    const { adapter, useCase, connect } = await setup();
    await connect();
    await useCase.execute({ type: 'volumeUp' });
    await useCase.execute({ type: 'navigate', direction: NavigationDirection.Left });
    await useCase.execute({ type: 'key', key: RemoteKey.Home });
    await useCase.execute({ type: 'launchApp', appId: 'netflix' });
    expect(adapter.commands).toEqual([
      { command: 'volumeUp', args: [] },
      { command: 'navigate', args: [NavigationDirection.Left] },
      { command: 'sendKey', args: [RemoteKey.Home] },
      { command: 'launchApp', args: ['netflix'] },
    ]);
  });

  it('refuses commands whose capability is not available instead of faking success', async () => {
    const { adapter, useCase, connect } = await setup({ capabilities: { navigation: true } });
    await connect();
    await expect(useCase.execute({ type: 'powerOn' })).rejects.toBeInstanceOf(
      TVUnsupportedOperationError,
    );
    await expect(useCase.execute({ type: 'volumeUp' })).rejects.toBeInstanceOf(
      TVUnsupportedOperationError,
    );
    await expect(
      useCase.execute({ type: 'key', key: RemoteKey.VolumeUp }),
    ).rejects.toBeInstanceOf(TVUnsupportedOperationError);
    expect(adapter.commands).toEqual([]);
  });

  it('the mock adapter itself also rejects unsupported operations', async () => {
    const adapter = new MockTVAdapter({ capabilities: { navigation: true } });
    await adapter.connect(makeMockDevice());
    await expect(adapter.channelUp()).rejects.toBeInstanceOf(TVUnsupportedOperationError);
  });

  it('rejects when the adapter lacks the optional interface even if capability is claimed', async () => {
    const base = new MockTVAdapter({ capabilities: { powerOn: true } });
    // Hide powerOn to mimic an adapter that declares the capability but does not implement it.
    const adapter = Object.create(base, { powerOn: { value: undefined } });
    const manager = new TVConnectionManager({ supports: () => true, create: () => adapter });
    await manager.connect(makeMockDevice());
    await expect(new SendRemoteCommandUseCase(manager).execute({ type: 'powerOn' })).rejects.toBeInstanceOf(
      TVUnsupportedOperationError,
    );
  });
});
