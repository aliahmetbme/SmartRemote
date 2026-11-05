import { TVDevice } from '../../domain/entities/TVDevice';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';

export interface HydrationResult {
  savedDevices: TVDevice[];
  selectedDeviceId: string | null;
  selectedDevice: TVDevice | null;
  superseded?: boolean;
}

/**
 * Single authoritative use case for loading persistent TV devices and
 * resolving the active selected TV on application startup or settings refresh.
 *
 * Guarantees:
 * - Coalesces concurrent calls into a single in-flight promise.
 * - Protects against stale asynchronous overwrites using revision tracking.
 * - Handles storage errors gracefully without destroying in-memory state.
 * - Resolves the active selected TV deterministically (lastSelectedId -> first saved -> null).
 */
export class HydrateDevicesUseCase {
  private inFlight: Promise<HydrationResult> | null = null;
  private currentRevision = 0;

  constructor(private readonly repository: ITVDeviceRepository) {}

  /**
   * Invalidates any in-flight hydration so that newer user operations
   * (device selection, MAC update, TV forget) cannot be overwritten by stale reads.
   */
  invalidate(): void {
    this.currentRevision += 1;
    this.inFlight = null;
  }

  getRevision(): number {
    return this.currentRevision;
  }

  async execute(options?: { force?: boolean }): Promise<HydrationResult> {
    if (this.inFlight && !options?.force) {
      return this.inFlight;
    }

    const expectedRevision = this.currentRevision;

    const promise = (async () => {
      const [savedDevices, lastSelectedId] = await Promise.all([
        this.repository.getAll(),
        this.repository.getLastSelectedId(),
      ]);

      // If an invalidating mutation occurred while reading storage, abort stale hydration
      if (expectedRevision !== this.currentRevision) {
        return {
          savedDevices: [],
          selectedDeviceId: null,
          selectedDevice: null,
          superseded: true,
        };
      }

      // Determine authoritative selected device
      let selectedDeviceId: string | null = null;
      let selectedDevice: TVDevice | null = null;

      if (lastSelectedId && savedDevices.some(d => d.id === lastSelectedId)) {
        selectedDeviceId = lastSelectedId;
        selectedDevice = savedDevices.find(d => d.id === lastSelectedId) ?? null;
      } else if (savedDevices.length > 0) {
        selectedDeviceId = savedDevices[0].id;
        selectedDevice = savedDevices[0];
      }

      return {
        savedDevices,
        selectedDeviceId,
        selectedDevice,
      };
    })();

    this.inFlight = promise;
    const clearInFlight = () => {
      if (this.inFlight === promise) {
        this.inFlight = null;
      }
    };
    promise.then(clearInFlight, clearInFlight);

    return promise;
  }
}
