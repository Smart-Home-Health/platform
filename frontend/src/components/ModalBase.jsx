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

/**
 * Reusable modal component that can display various content
 */
const ModalBase = ({ isOpen, onClose, title, children }) => {
  const [isMobile, setIsMobile] = useState(false);

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

  return (
    <div className={`dashboard-modal-overlay ${isMobile ? 'mobile' : ''}`} onClick={!isMobile ? handleClose : undefined}>
      <div className={`modal-container ${isMobile ? 'mobile' : ''}`} onClick={e => e.stopPropagation()}>
        <div className={`modal-header ${isMobile ? 'mobile' : ''}`}>
          {isMobile && (
            <button className="modal-back-button" onClick={handleClose}>
              ← Back
            </button>
          )}
          <h2 className="modal-title">{title}</h2>
          {!isMobile && (
            <button className="modal-close" onClick={handleClose}>×</button>
          )}
        </div>
        <div className={`modal-body ${isMobile ? 'mobile' : ''}`}>
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
  children: PropTypes.node.isRequired
};

export default ModalBase;