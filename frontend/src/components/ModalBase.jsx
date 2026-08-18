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
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useModalDock } from "../contexts/ModalDockContext";
import { ExpandPanelIcon, CollapsePanelIcon } from "./Icons";

/**
 * Reusable modal component that can display various content.
 *
 * Three shapes:
 *  - mobile (viewport <= 768px): full-screen sheet with a "Back" affordance
 *  - docked (desktop, inside a ModalDockProvider): a panel beside the host's
 *    content, narrow by default and expandable — see ModalDockContext
 *  - plain desktop: the original slab
 *
 * `dock={false}` opts an individual modal out of docking even inside a
 * provider (the unlock gate wants the whole board, not a side panel), and
 * `dock={true}` opts one *in* from outside a provider.
 */
const ModalBase = ({ isOpen, onClose, title, children, dock }) => {
  const [isMobile, setIsMobile] = useState(false);
  const { docked: dockAvailable, expanded, toggleExpand } = useModalDock();
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

    // Prevent body scroll when modal is open on mobile
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, isMobile]);

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

  return (
    <div className={`dashboard-modal-overlay ${variant}`} onClick={!isMobile && !docked ? handleClose : undefined}>
      <div className={`modal-container ${variant}${narrow}`} onClick={e => e.stopPropagation()}>
        <div className={`modal-header ${variant}`}>
          {isMobile && (
            <button className="modal-back-button" onClick={handleClose}>
              ← Back
            </button>
          )}
          <h2 className="modal-title">{title}</h2>
          {docked && toggleExpand && (
            <button
              type="button"
              className="modal-expand"
              onClick={toggleExpand}
              aria-label={expanded ? 'Collapse panel' : 'Expand panel over the charts'}
              aria-pressed={expanded}
              title={expanded ? 'Collapse panel' : 'Expand panel'}
            >
              {expanded ? <CollapsePanelIcon /> : <ExpandPanelIcon />}
            </button>
          )}
          {!isMobile && (
            <button className="modal-close" onClick={handleClose}>×</button>
          )}
        </div>
        <div className={`modal-body ${variant}`}>
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
  dock: PropTypes.bool
};

export default ModalBase;
