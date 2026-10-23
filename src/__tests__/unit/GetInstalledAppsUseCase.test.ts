import { GetInstalledAppsUseCase } from '../../application/usecases/GetInstalledAppsUseCase';
import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice } from '../../testing/fixtures';

describe('GetInstalledAppsUseCase & App Launch Resolution', () => {
  it('discovers installed apps from connected TV adapter', async () => {
    const adapter = new MockTVAdapter({
      capabilities: { appLaunching: 'supported' },
    });
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => adapter,
    });
    await manager.connect(makeMockDevice());

    const useCase = new GetInstalledAppsUseCase(manager);
    const apps = await useCase.execute();

    expect(apps).toHaveLength(3);
    expect(apps.map(a => a.id)).toEqual(['youtube.leanback.v4', 'netflix', 'amazon']);
  });

  it('resolves youtube alias to youtube.leanback.v4 when installed on webOS', async () => {
    const adapter = new MockTVAdapter({
      capabilities: { appLaunching: 'supported' },
    });
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => adapter,
    });
    await manager.connect(makeMockDevice());

    const useCase = new GetInstalledAppsUseCase(manager);
    const resolvedYoutube = await useCase.resolveAppId('youtube');
    expect(resolvedYoutube).toBe('youtube.leanback.v4');
  });

  it('resolves amazon alias to amazon ID or title matching Prime Video', async () => {
    const adapter = new MockTVAdapter({
      capabilities: { appLaunching: 'supported' },
    });
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => adapter,
    });
    await manager.connect(makeMockDevice());

    const useCase = new GetInstalledAppsUseCase(manager);
    const resolvedAmazon = await useCase.resolveAppId('amazon');
    expect(resolvedAmazon).toBe('amazon');
  });

  it('falls back to candidate list if TV does not report installed apps', async () => {
    const adapter = new MockTVAdapter({
      capabilities: { appLaunching: 'supported' },
    });
    // simulate adapter without listApps
    delete (adapter as unknown as { getInstalledApps?: unknown }).getInstalledApps;
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => adapter,
    });
    await manager.connect(makeMockDevice());

    const useCase = new GetInstalledAppsUseCase(manager);
    const resolved = await useCase.resolveAppId('youtube');
    expect(resolved).toBe('youtube.leanback.v4');
  });
});
