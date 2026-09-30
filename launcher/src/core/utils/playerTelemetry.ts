/**
 * Admin-side visibility into who is playing.
 *
 * When `telemetry.trackingUrl` is set, every successful Play press POSTs the
 * player's username, UUID and login type to that URL (your own
 * log_launch.php, storing rows in MySQL — see the db-telemetry files) with
 * `telemetry.trackingSecret` as the X-Telemetry-Secret header. Best-effort
 * only: a slow or failing endpoint, or an empty URL, never delays or fails
 * the actual launch.
 */
import { isAllowedUrl } from '../modpack/manifest';
import { logger } from './logger';

const REQUEST_TIMEOUT_MS = 5_000;

export type LaunchTelemetryEvent = {
  username: string;
  uuid: string;
  loginType: 'microsoft' | 'offline';
};

export const reportLaunch = async (trackingUrl: string, secret: string, event: LaunchTelemetryEvent): Promise<void> => {
  const url = trackingUrl.trim();
  if (!url) return;

  if (!isAllowedUrl(url)) {
    logger.error(`telemetry.trackingUrl is not a valid HTTPS URL, ignoring: ${url}`);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Telemetry-Secret': secret,
      },
      body: JSON.stringify({
        username: event.username,
        uuid: event.uuid,
        loginType: event.loginType,
      }),
    });
    if (!response.ok) {
      logger.error(`Launch telemetry endpoint returned HTTP ${response.status}`);
    }
  } catch (e) {
    // Never let a network hiccup here affect the launch itself.
    logger.error('Failed to post launch telemetry: ' + (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
};
