/**
 * Last-resort error handlers for uncaught main-process failures.
 */
import { dialog } from 'electron';

import { logger } from '../core/utils/logger';
import { t } from '../i18n';

let hasShownGlobalError = false;

const showGlobalError = (title: string, detail: string): void => {
  logger.error(`${title}: ${detail}`);
  if (hasShownGlobalError) return;
  hasShownGlobalError = true;
  try {
    dialog.showMessageBox({
      type: 'error',
      title: t('errors.unexpected_title'),
      message: title,
      detail,
    }).finally(() => { hasShownGlobalError = false; });
  } catch {
    // UI may be unavailable during shutdown.
  }
};

export const registerCrashGuards = (): void => {
  process.on('uncaughtException', (err: unknown) => {
    const detail = err instanceof Error && err.stack ? err.stack : String(err);
    showGlobalError(t('errors.unexpected_error'), detail);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const detail = reason instanceof Error
      ? (reason.stack || reason.message)
      : (typeof reason === 'string' ? reason : JSON.stringify(reason));
    showGlobalError(t('errors.unexpected_promise_error'), detail);
  });
};
