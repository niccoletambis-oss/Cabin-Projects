export class ApplicationError extends Error {}
export class StorageUnavailableError extends ApplicationError {
  constructor() {
    super("Private file storage is temporarily unavailable. Please try again.");
  }
}
