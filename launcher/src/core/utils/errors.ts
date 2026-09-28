/**
 * An error whose message is written for players and can be shown in the UI
 * as-is. `detail` carries the developer-facing cause for the log file.
 */
export class UserFacingError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}
