import type {
  DataSourceModule,
  SourceReadinessContext,
  SourceReadinessResult,
  SourceSummary,
} from '../../shared/source';

const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SourceRegistryErrorCode =
  | 'INVALID_SOURCE_ID'
  | 'DUPLICATE_SOURCE_ID'
  | 'UNKNOWN_SOURCE_ID';

export class SourceRegistryError extends Error {
  constructor(
    public readonly code: SourceRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SourceRegistryError';
  }
}

export class SourceRegistry {
  private readonly sources = new Map<string, DataSourceModule>();

  register(source: DataSourceModule): void {
    if (!SOURCE_ID_PATTERN.test(source.id)) {
      throw new SourceRegistryError(
        'INVALID_SOURCE_ID',
        `Source ID must use lowercase hyphenated form: ${source.id}`,
      );
    }

    if (this.sources.has(source.id)) {
      throw new SourceRegistryError(
        'DUPLICATE_SOURCE_ID',
        `Source is already registered: ${source.id}`,
      );
    }

    this.sources.set(source.id, source);
  }

  get(sourceId: string): DataSourceModule {
    const source = this.sources.get(sourceId);

    if (!source) {
      throw new SourceRegistryError(
        'UNKNOWN_SOURCE_ID',
        `Unknown source: ${sourceId}`,
      );
    }

    return source;
  }

  list(): readonly DataSourceModule[] {
    return Array.from(this.sources.values());
  }

  async getSummaries(
    context: SourceReadinessContext,
  ): Promise<SourceSummary[]> {
    return Promise.all(
      this.list().map(async (source) => {
        const readiness = await this.checkReadinessSafely(
          source,
          context,
        );

        return {
          source_id: source.id,
          source_name: source.name,
          source_mode: source.sourceMode,
          dataset_types: [...source.datasetTypes],
          capabilities: source.getCapabilities(),
          readiness,
        };
      }),
    );
  }

  private async checkReadinessSafely(
    source: DataSourceModule,
    context: SourceReadinessContext,
  ): Promise<SourceReadinessResult> {
    try {
      return await source.checkReadiness(context);
    } catch (error: unknown) {
      return {
        source_id: source.id,
        readiness_status: 'ERROR',
        checked_at: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : 'Unknown source readiness error.',
      };
    }
  }
}
