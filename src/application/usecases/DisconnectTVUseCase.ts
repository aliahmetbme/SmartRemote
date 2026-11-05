import { TVConnectionManager } from '../services/TVConnectionManager';

export class DisconnectTVUseCase {
  constructor(
    private readonly manager: TVConnectionManager,
    private readonly invalidateHydration?: () => void,
  ) {}

  execute(): Promise<void> {
    this.invalidateHydration?.();
    return this.manager.disconnect();
  }
}
