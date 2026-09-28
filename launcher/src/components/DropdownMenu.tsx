/**
 * Select with an animated menu (the Settings language picker).
 *
 * The panel is portalled to <body> with fixed positioning. Rendered inside the
 * Settings page it would extend that page's scroll area, so opening it made the
 * page scroll as well as the list. Here it floats above everything and shows
 * five options before scrolling. It opens below the field, or above it when
 * there isn't room below for those five.
 */
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { POPOVER_TRANSITION } from '../constants/motion';

export type DropdownItem = {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
};

type DropdownMenuProps = {
  items: DropdownItem[];
  placeholder?: string;
  value?: DropdownItem | null;
  onSelect: (item: DropdownItem) => void;
  className?: string;
};

type Placement = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

/** Gap between the field and the panel. */
const GAP = 8;
/** Keep the panel clear of the window edge (rounded, transparent corners). */
const EDGE = 16;
/** Options shown before the menu scrolls. */
const VISIBLE_OPTIONS = 5;

/** Below when the preferred height fits there; otherwise whichever side has more room. */
const place = (anchor: DOMRect, preferredHeight: number): Placement => {
  const spaceBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
  const spaceAbove = anchor.top - GAP - EDGE;
  const openUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.min(preferredHeight, openUp ? spaceAbove : spaceBelow);
  const top = openUp ? anchor.top - GAP - maxHeight : anchor.bottom + GAP;
  return { left: anchor.left, top, width: anchor.width, maxHeight, openUp };
};

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5L10 17.5L19 7" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DropdownMenu: React.FC<DropdownMenuProps> = ({ items, placeholder = '', value = null, onSelect, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const centeredRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const updatePlacement = useCallback(() => {
    const anchor = headerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    const list = listRef.current;
    if (!anchor || !panel || !list) return;
    // Height of the first VISIBLE_OPTIONS options (or the whole list when it is
    // shorter) plus the shell's padding. Offsets are within the list, so they
    // don't change while it is clipped or scrolled.
    const options = list.querySelectorAll<HTMLElement>('.dropdown-item');
    const last = options[Math.min(options.length, VISIBLE_OPTIONS) - 1];
    const listHeight = last && options.length > VISIBLE_OPTIONS ? last.offsetTop + last.offsetHeight : list.scrollHeight;
    const style = getComputedStyle(panel);
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    setPlacement(place(anchor, listHeight + padding));
  }, []);

  // Measure before paint so the panel never flashes in the wrong spot. The last
  // placement is kept after closing so the exit animation plays where it was.
  useLayoutEffect(() => {
    if (!isOpen) {
      centeredRef.current = false;
      return;
    }
    updatePlacement();
  }, [isOpen, updatePlacement]);

  // Once per open, if the list has to scroll, bring the current choice into view.
  // Sets the list's own scrollTop: scrollIntoView would also scroll <body>.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!isOpen || !placement || !list || centeredRef.current) return;
    centeredRef.current = true;
    const selected = list.querySelector<HTMLElement>('.dropdown-item.selected');
    if (selected && list.scrollHeight > list.clientHeight) {
      list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
    }
  }, [isOpen, placement]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    // Follow the field if the page behind it scrolls; ignore scrolling inside the list.
    const handleScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      updatePlacement();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, updatePlacement]);

  const handleSelect = (item: DropdownItem) => {
    onSelect(item);
    setIsOpen(false);
  };

  const panel = (
    <AnimatePresence>
      {isOpen && (
        // The shell owns the rounded corners, border and padding; the list inside it
        // scrolls, so its scrollbar stays inset instead of cutting through the corners.
        <motion.div
          ref={panelRef}
          className="dropdown-panel"
          style={{
            left: placement?.left ?? -9999,
            width: placement?.width,
            top: placement?.top,
            maxHeight: placement?.maxHeight,
            transformOrigin: placement?.openUp ? 'bottom center' : 'top center',
            visibility: placement ? 'visible' : 'hidden',
          }}
          initial={{ opacity: 0, y: placement?.openUp ? 4 : -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: placement?.openUp ? 4 : -4, scale: 0.98 }}
          transition={reduceMotion ? { duration: 0 } : POPOVER_TRANSITION}
        >
          <ul ref={listRef} className="dropdown-list custom-scrollbar" role="listbox">
            {items.map((item) => {
              const selected = item.value === value?.value;
              return (
                <li
                  key={item.value}
                  className={`dropdown-item${selected ? ' selected' : ''}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(item)}
                >
                  {item.icon && <span className="item-icon">{item.icon}</span>}
                  <span className="item-label">{item.label}</span>
                  {selected && <CheckIcon />}
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={containerRef} className={`dropdown-container ${className || ''}`}>
      <button
        ref={headerRef}
        type="button"
        className="dropdown-header"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="selected-label">{value ? value.label : placeholder}</span>
        <span className={`chevron-container${isOpen ? ' is-open' : ''}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {createPortal(panel, document.body)}
    </div>
  );
};

export default DropdownMenu;
