import { InstalledApp } from '../../domain/entities/InstalledApp';
import { supportsAppLaunch } from '../../domain/interfaces/ITVRemoteAdapter';
import { TVConnectionManager } from '../services/TVConnectionManager';

/**
 * Standard candidate app IDs for well-known streaming services across LG webOS versions.
 * Ordered by preference / most common LG webOS package identifier.
 */
export const WELL_KNOWN_APP_CANDIDATES: Record<string, string[]> = {
  youtube: ['youtube.leanback.v4', 'youtube', 'com.webos.app.youtube'],
  amazon: ['amazon', 'amazon.prime.video', 'com.amazon.ignition.arm', 'com.webos.app.amazon'],
  netflix: ['netflix', 'com.webos.app.netflix'],
};

export class GetInstalledAppsUseCase {
  constructor(private readonly manager: TVConnectionManager) {}

  async execute(): Promise<InstalledApp[]> {
    const adapter = this.manager.getReadyAdapter();
    if (!supportsAppLaunch(adapter) || !adapter.getInstalledApps) {
      return [];
    }
    return adapter.getInstalledApps();
  }

  /**
   * Resolves the best app ID for a target alias (e.g. 'youtube', 'amazon', 'netflix')
   * by matching against the TV's installed apps, falling back to candidates.
   */
  async resolveAppId(target: string): Promise<string> {
    const normalizedTarget = target.toLowerCase().trim();
    let installed: InstalledApp[] = [];
    try {
      installed = await this.execute();
    } catch {
      // Fallback to candidates if listing fails or is unsupported
    }

    if (installed.length > 0) {
      // 1. Direct match on ID
      const exactId = installed.find(a => a.id.toLowerCase() === normalizedTarget);
      if (exactId) return exactId.id;

      // 2. Known candidates matching installed
      const candidates = WELL_KNOWN_APP_CANDIDATES[normalizedTarget] ?? [normalizedTarget];
      for (const cand of candidates) {
        const found = installed.find(a => a.id.toLowerCase() === cand.toLowerCase());
        if (found) return found.id;
      }

      // 3. Match on title (e.g. "YouTube" or "Prime Video")
      const titleMatch = installed.find(a => {
        const title = a.title.toLowerCase();
        if (normalizedTarget === 'youtube' && title.includes('youtube')) return true;
        if (normalizedTarget === 'amazon' && (title.includes('prime') || title.includes('amazon'))) return true;
        if (normalizedTarget === 'netflix' && title.includes('netflix')) return true;
        return title === normalizedTarget;
      });
      if (titleMatch) return titleMatch.id;
    }

    // Fallback: Return primary candidate for webOS
    const fallbackList = WELL_KNOWN_APP_CANDIDATES[normalizedTarget];
    if (fallbackList && fallbackList.length > 0) {
      return fallbackList[0];
    }
    return target;
  }
}
