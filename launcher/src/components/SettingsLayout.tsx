/**
 * Building blocks for the Settings page: titled sections holding a card of rows.
 * A row has a title and optional description on the left and its control on the
 * right; anything passed as children renders full width underneath.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import React, { useId, useState } from 'react';

import { COLLAPSE_TRANSITION } from '../constants/motion';

export const SettingsSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="settings-section" aria-label={title}>
    <h2 className="settings-section__title">{title}</h2>
    <div className="settings-card">{children}</div>
  </section>
);

type SettingRowProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  /** Shown before the text (the account avatar). */
  leading?: React.ReactNode;
  titleId?: string;
  children?: React.ReactNode;
};

export const SettingRow = ({ title, description, control, leading, titleId, children }: SettingRowProps) => (
  <div className="setting-row">
    <div className="setting-row__main">
      {leading && <div className="setting-row__leading">{leading}</div>}
      <div className="setting-row__text">
        <p id={titleId} className="setting-row__title">{title}</p>
        {description && <p className="setting-row__description">{description}</p>}
      </div>
      {control && <div className="setting-row__control">{control}</div>}
    </div>
    {children && <div className="setting-row__body">{children}</div>}
  </div>
);

type CollapsibleRowProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

/** A row whose header toggles extra content below it, with an animated height reveal. */
export const CollapsibleRow = ({ title, description, children }: CollapsibleRowProps) => {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const contentId = useId();

  return (
    <div className="setting-row">
      <button
        type="button"
        className={`setting-row__main setting-row__disclosure${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="setting-row__text">
          <span className="setting-row__title">{title}</span>
          {description && <span className="setting-row__description">{description}</span>}
        </span>
        <span className="setting-row__chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            id={contentId}
            className="setting-row__collapse"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : COLLAPSE_TRANSITION}
          >
            <div className="setting-row__body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
