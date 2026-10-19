import { TVConnectionManager } from '../services/TVConnectionManager';

export class DisconnectTVUseCase {
  constructor(private readonly manager: TVConnectionManager) {}

  execute(): Promise<void> {
    return this.manager.disconnect();
  }
}
