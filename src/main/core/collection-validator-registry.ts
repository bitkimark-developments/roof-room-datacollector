import type {
  CollectionValidator,
} from '../../shared/collection';

const SOURCE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CollectionValidatorRegistryErrorCode =
  | 'INVALID_SOURCE_ID'
  | 'DUPLICATE_SOURCE_ID'
  | 'UNKNOWN_SOURCE_ID';

export class CollectionValidatorRegistryError
  extends Error
{
  constructor(
    public readonly code:
      CollectionValidatorRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      'CollectionValidatorRegistryError';
  }
}

export class CollectionValidatorRegistry {
  private readonly validators =
    new Map<string, CollectionValidator>();

  register(
    sourceId: string,
    validator: CollectionValidator,
  ): void {
    if (!SOURCE_ID_PATTERN.test(sourceId)) {
      throw new CollectionValidatorRegistryError(
        'INVALID_SOURCE_ID',
        `Source ID must use lowercase hyphenated form: ${sourceId}`,
      );
    }

    if (this.validators.has(sourceId)) {
      throw new CollectionValidatorRegistryError(
        'DUPLICATE_SOURCE_ID',
        `Validator is already registered for source: ${sourceId}`,
      );
    }

    this.validators.set(
      sourceId,
      validator,
    );
  }

  get(sourceId: string): CollectionValidator {
    const validator =
      this.validators.get(sourceId);

    if (!validator) {
      throw new CollectionValidatorRegistryError(
        'UNKNOWN_SOURCE_ID',
        `No validator is registered for source: ${sourceId}`,
      );
    }

    return validator;
  }
}
