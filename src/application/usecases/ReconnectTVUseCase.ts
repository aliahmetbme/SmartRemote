import { TVConnectionManager } from '../services/TVConnectionManager';

export class ReconnectTVUseCase {
  constructor(private readonly manager: TVConnectionManager) {}

  execute(): Promise<void> {
    return this.manager.reconnect();
  }
}
