/*
 * Smart Home Health Hub
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
import React, { useState, useEffect } from 'react';
import config from '../../config';

const AdminBusinesses = () => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'inactive'
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [businessTypes, setBusinessTypes] = useState([]);
  
  const [newBusiness, setNewBusiness] = useState({
    name: '',
    business_type: 'hospital',
    phone: '',
    email: '',
    website: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'USA',
    description: '',
    hours_of_operation: '',
    emergency_contact: ''
  });

  useEffect(() => {
    fetchBusinesses();
    fetchBusinessTypes();
  }, [activeTab, filterType]);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      let url = `${config.apiUrl}/api/businesses?active_only=${activeTab === 'active'}`;
      if (filterType) {
        url += `&business_type=${encodeURIComponent(filterType)}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setBusinesses(data);
      }
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/types`);
      if (response.ok) {
        const types = await response.json();
        setBusinessTypes(types);
      }
    } catch (error) {
      console.error('Error fetching business types:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = editingBusiness 
        ? `${config.apiUrl}/api/businesses/${editingBusiness.id}`
        : `${config.apiUrl}/api/businesses`;
      
      const method = editingBusiness ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBusiness)
      });

      if (response.ok) {
        setShowAddForm(false);
        setEditingBusiness(null);
        setNewBusiness({
          name: '',
          business_type: 'hospital',
          phone: '',
          email: '',
          website: '',
          address_line1: '',
          address_line2: '',
          city: '',
          state: '',
          zip_code: '',
          country: 'USA',
          description: '',
          hours_of_operation: '',
          emergency_contact: ''
        });
        fetchBusinesses();
      }
    } catch (error) {
      console.error('Error saving business:', error);
    }
  };

  const handleEdit = (business) => {
    setNewBusiness({ ...business });
    setEditingBusiness(business);
    setShowAddForm(true);
  };

  const handleDelete = async (businessId) => {
    if (window.confirm('Are you sure you want to deactivate this business?')) {
      try {
        const response = await fetch(`${config.apiUrl}/api/businesses/${businessId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          fetchBusinesses();
        }
      } catch (error) {
        console.error('Error deleting business:', error);
      }
    }
  };

  const handleActivate = async (businessId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/${businessId}/activate`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchBusinesses();
      }
    } catch (error) {
      console.error('Error activating business:', error);
    }
  };

  const filteredBusinesses = businesses.filter(business =>
    business.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    business.business_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (business.city && business.city.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const businessTypeOptions = [
    'hospital', 'pharmacy', 'clinic', 'rehab', 'therapy', 'school', 
    'lab', 'radiology', 'specialist', 'emergency', 'urgent_care', 'other'
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Business Management</h1>
        <p className="admin-page-description">
          Manage healthcare facilities, pharmacies, schools, and other business entities
        </p>
      </div>

      <div className="admin-controls">
        <div className="admin-tabs">
          <button 
            className={`tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active Businesses ({businesses.filter(b => b.active).length})
          </button>
          <button 
            className={`tab ${activeTab === 'inactive' ? 'active' : ''}`}
            onClick={() => setActiveTab('inactive')}
          >
            Inactive Businesses ({businesses.filter(b => !b.active).length})
          </button>
        </div>

        <div className="admin-filters">
          <input
            type="text"
            placeholder="Search businesses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="">All Types</option>
            {businessTypes.map(type => (
              <option key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>
        </div>

        <button 
          className="btn btn-primary"
          onClick={() => {
            setShowAddForm(true);
            setEditingBusiness(null);
            setNewBusiness({
              name: '',
              business_type: 'hospital',
              phone: '',
              email: '',
              website: '',
              address_line1: '',
              address_line2: '',
              city: '',
              state: '',
              zip_code: '',
              country: 'USA',
              description: '',
              hours_of_operation: '',
              emergency_contact: ''
            });
          }}
        >
          Add Business
        </button>
      </div>

      {showAddForm && (
        <div className="business-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowAddForm(false);
            setEditingBusiness(null);
          }
        }}>
          <div className="business-modal-container">
            <form onSubmit={handleSubmit} className="business-form">
              <h3>
                {editingBusiness ? 'Edit Business' : 'Add New Business'}
                <button 
                  type="button" 
                  className="modal-close-btn"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingBusiness(null);
                  }}
                >
                  ×
                </button>
              </h3>
              
              <div className="form-grid">
                <div className="form-group">
                  <label>Business Name *</label>
                  <input
                    type="text"
                    value={newBusiness.name}
                    onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Business Type *</label>
                  <select
                    value={newBusiness.business_type}
                    onChange={(e) => setNewBusiness({ ...newBusiness, business_type: e.target.value })}
                    required
                  >
                    {businessTypeOptions.map(type => (
                      <option key={type} value={type}>
                        {type.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={newBusiness.phone}
                    onChange={(e) => setNewBusiness({ ...newBusiness, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newBusiness.email}
                    onChange={(e) => setNewBusiness({ ...newBusiness, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Website</label>
                  <input
                    type="url"
                    value={newBusiness.website}
                    onChange={(e) => setNewBusiness({ ...newBusiness, website: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Emergency Contact</label>
                  <input
                    type="text"
                    value={newBusiness.emergency_contact}
                    onChange={(e) => setNewBusiness({ ...newBusiness, emergency_contact: e.target.value })}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Address Line 1</label>
                  <input
                    type="text"
                    value={newBusiness.address_line1}
                    onChange={(e) => setNewBusiness({ ...newBusiness, address_line1: e.target.value })}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Address Line 2</label>
                  <input
                    type="text"
                    value={newBusiness.address_line2}
                    onChange={(e) => setNewBusiness({ ...newBusiness, address_line2: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>City</label>
                  <input
                    type="text"
                    value={newBusiness.city}
                    onChange={(e) => setNewBusiness({ ...newBusiness, city: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>State</label>
                  <input
                    type="text"
                    value={newBusiness.state}
                    onChange={(e) => setNewBusiness({ ...newBusiness, state: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>ZIP Code</label>
                  <input
                    type="text"
                    value={newBusiness.zip_code}
                    onChange={(e) => setNewBusiness({ ...newBusiness, zip_code: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Country</label>
                  <input
                    type="text"
                    value={newBusiness.country}
                    onChange={(e) => setNewBusiness({ ...newBusiness, country: e.target.value })}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea
                    value={newBusiness.description}
                    onChange={(e) => setNewBusiness({ ...newBusiness, description: e.target.value })}
                    rows="3"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Hours of Operation</label>
                  <textarea
                    value={newBusiness.hours_of_operation}
                    onChange={(e) => setNewBusiness({ ...newBusiness, hours_of_operation: e.target.value })}
                    rows="2"
                    placeholder="e.g., Mon-Fri 9AM-5PM, Sat 9AM-1PM"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingBusiness ? 'Update Business' : 'Add Business'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingBusiness(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="businesses-grid">
        {loading ? (
          <div className="loading">Loading businesses...</div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="no-data">
            {searchTerm ? 'No businesses found matching your search.' : 'No businesses found.'}
          </div>
        ) : (
          filteredBusinesses.map(business => (
            <div key={business.id} className="business-card">
              <div className="business-header">
                <h3>{business.name}</h3>
                <span className={`business-type ${business.business_type}`}>
                  {business.business_type.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              
              <div className="business-info">
                {business.phone && (
                  <div className="info-item">
                    <strong>Phone:</strong> {business.phone}
                  </div>
                )}
                {business.email && (
                  <div className="info-item">
                    <strong>Email:</strong> {business.email}
                  </div>
                )}
                {business.address_line1 && (
                  <div className="info-item">
                    <strong>Address:</strong>
                    <div className="address">
                      {business.address_line1}
                      {business.address_line2 && <br />}
                      {business.address_line2}
                      {(business.city || business.state || business.zip_code) && <br />}
                      {business.city && `${business.city}, `}
                      {business.state} {business.zip_code}
                    </div>
                  </div>
                )}
                {business.emergency_contact && (
                  <div className="info-item">
                    <strong>Emergency:</strong> {business.emergency_contact}
                  </div>
                )}
                {business.hours_of_operation && (
                  <div className="info-item">
                    <strong>Hours:</strong> {business.hours_of_operation}
                  </div>
                )}
                {business.description && (
                  <div className="info-item">
                    <strong>Description:</strong> {business.description}
                  </div>
                )}
              </div>

              <div className="business-actions">
                <button 
                  className="btn btn-sm btn-primary"
                  onClick={() => handleEdit(business)}
                >
                  Edit
                </button>
                {business.active ? (
                  <button 
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(business.id)}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button 
                    className="btn btn-sm btn-success"
                    onClick={() => handleActivate(business.id)}
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminBusinesses;
