/**
 * Microsoft OAuth client ID loaded from bundled client-config.json at startup.
 */
import { loadClientConfig } from '../core/utils/clientConfig';
import { logger } from '../core/utils/logger';

import { MICROSOFT_REDIRECT_URI } from '../constants/launcher';

export { MICROSOFT_REDIRECT_URI as redirectURI };

let microsoftClientId = '';

export const getMicrosoftClientId = (): string => microsoftClientId;

export const loadMicrosoftClientId = async (): Promise<void> => {
  try {
    const cfg = await loadClientConfig();
    microsoftClientId = cfg.microsoftClientId ?? '';
    if (!microsoftClientId) {
      logger.warn(
        '[auth] microsoftClientId is not set in client-config.json; Microsoft login is unavailable until it is configured.',
      );
    }
  } catch (error) {
    logger.error('[auth] Failed to load microsoftClientId: ' + (error as Error)?.message);
  }
};
