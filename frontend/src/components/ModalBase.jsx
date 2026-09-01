/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { useState, useEffect, useRef, useId } from "react";
import PropTypes from "prop-types";
import { useModalDock } from "../contexts/ModalDockContext";
import { ExpandPanelIcon, CollapsePanelIcon, XIcon, BackArrowIcon } from "./Icons";
import "./modal-base.css";

/* Selectors for a surface that sits ABOVE a ModalBase and owns the keyboard
 * while it is open. CareTaskModal and NutritionModal both render an
 * EntityModal *inside* a ModalBase, and EntityModal portals to <body> with its
 * own Radix focus scope — so without this, one Escape would close both, and
 * two focus traps would fight over the same Tab press.
 *
 * `.em-panel` is EntityModal's content, `.em-multi-pop` an EmMultiSelect
 * popover (the same yield EntityModal itself makes), `.nip-root` the
 * full-screen ItemPickerSheet, which deliberately renders outside EntityModal.
 */
const OVERLAY_ABOVE = '.em-panel, .em-multi-pop, .nip-root';

const somethingIsAbove = () =>
  typeof document !== 'undefined' && !!document.querySelector(OVERLAY_ABOVE);

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Reusable modal component that can display various content.
 *
 * Three shapes:
 *  - mobile (viewport <= 768px): full-screen sheet with a "Back" affordance
 *  - docked (desktop, inside a ModalDockProvider): a panel beside the host's
 *    content, narrow by default and expandable — see ModalDockContext
 *  - plain desktop: a centred panel
 *
 * `dock={false}` opts an individual modal out of docking even inside a
 * provider (the unlock gate wants the whole board, not a side panel), and
 * `dock={true}` opts one *in* from outside a provider.
 *
 * `dismissible={false}` is the hard-gate opt-out: no Escape, no overlay click.
 * Use it where onClose already refuses to close (the unlock prompt, the
 * patient picker) so the keyboard cannot do what the mouse cannot.
 *
 * Chrome lives in modal-base.css under the `mb-` prefix; the docked panel's
 * geometry is measured into --ld-panel-* by Dashboard.jsx and applied in
 * dashboard/live-dashboard.css.
 */
const ModalBase = ({ isOpen, onClose, title, children, dock, dismissible = true }) => {
  const [isMobile, setIsMobile] = useState(false);
  const { docked: dockAvailable, expanded, toggleExpand } = useModalDock();
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const titleId = useId();
  // `dock` is normally advisory (opt out with false). `true` forces the docked
  // treatment for a modal that renders *above* the dock provider in the React
  // tree but is portalled into the board — the PIN challenge does exactly that.
  const docked = (dock === true || dockAvailable) && dock !== false && !isMobile;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Prevent body scroll behind the full-screen sheet. Restore the value that
  // was actually there rather than hardcoding 'auto': this used to run on every
  // dep change and reset the body unconditionally, so a nested modal closing
  // released the outer one's lock and stomped whatever the page had set.
  useEffect(() => {
    if (!isOpen || !isMobile) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isOpen, isMobile]);

  // Focus: move into the panel on open, restore to the trigger on close.
  useEffect(() => {
    if (!isOpen) return undefined;
    restoreFocusRef.current = document.activeElement;
    const panel = panelRef.current;
    // Don't steal focus from a child that asked for it — React applies
    // autoFocus during commit, which has already happened by now.
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector(FOCUSABLE);
      (first || panel).focus?.();
    }
    return () => {
      const target = restoreFocusRef.current;
      if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus();
      }
    };
  }, [isOpen]);

  // Escape to close, and a Tab trap. Both stand down while a surface that owns
  // the keyboard is open above this one.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (somethingIsAbove()) return;
      if (e.key === 'Escape') {
        if (!dismissible) return;
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, dismissible, onClose]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  // A docked panel occupies a slice of the board, so `.mobile` is deliberately
  // NOT reused for it: that class's 100vw/100vh container fixes live inside
  // App.css's max-width:768px query and would not apply here.
  const variant = isMobile ? 'mobile' : (docked ? `docked${expanded ? ' expanded' : ''}` : '');
  // The narrow stop reflows content that assumes a wide slab (see
  // dashboard/dock-panel.css); expanding drops back to the normal layout.
  const narrow = docked && !expanded ? ' ld-dock-narrow' : '';
  const dismissOnOverlay = dismissible && !isMobile && !docked;

  return (
    <div className={`mb-overlay ${variant}`} onClick={dismissOnOverlay ? handleClose : undefined}>
      <div
        ref={panelRef}
        className={`mb-panel ${variant}${narrow}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className={`mb-head ${variant}`}>
          {isMobile && (
            <button className="mb-back" onClick={handleClose}>
              <BackArrowIcon size={13} />
              Back
            </button>
          )}
          <h2 className="mb-title" id={titleId}>{title}</h2>
          {docked && toggleExpand && (
            <button
              type="button"
              className="mb-expand"
              onClick={toggleExpand}
              aria-label={expanded ? 'Collapse panel' : 'Expand panel over the charts'}
              aria-pressed={expanded}
              title={expanded ? 'Collapse panel' : 'Expand panel'}
            >
              {expanded ? <CollapsePanelIcon /> : <ExpandPanelIcon />}
            </button>
          )}
          {!isMobile && (
            <button type="button" className="mb-close" onClick={handleClose} aria-label="Close">
              <XIcon size={16} />
            </button>
          )}
        </div>
        <div className={`mb-body ${variant}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

ModalBase.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  children: PropTypes.node.isRequired,
  dock: PropTypes.bool,
  dismissible: PropTypes.bool
};

export default ModalBase;
