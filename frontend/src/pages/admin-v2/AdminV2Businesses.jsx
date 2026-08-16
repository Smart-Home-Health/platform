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
import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  BuildingIcon,
  BusinessesIcon,
  PhoneIcon,
  MailIcon,
  GlobeIcon,
} from '../../components/Icons';
import EntityCard from '../../components/vc/EntityCard';
import EntityToolbar from '../../components/vc/EntityToolbar';
import EntityModal, { EmField, EmRow } from '../../components/vc/EntityModal';
import './AdminV2.css';

const AdminV2Businesses = () => {
  const { user } = useAuth();

  // State
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter state
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [businessTypes, setBusinessTypes] = useState([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    business_types: [],
    phone: '',
    fax: '',
    email: '',
    website: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    notes: ''
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const businessTypeOptions = [
    'hospital', 'clinic', 'pharmacy', 'dme', 'school', 'therapy',
    'insurance', 'lab', 'imaging', 'home_health', 'hospice', 'rehab', 'other'
  ];

  // Toggle a type in the business_types array
  const toggleBusinessType = (type) => {
    setFormData(prev => {
      const types = prev.business_types || [];
      if (types.includes(type)) {
        return { ...prev, business_types: types.filter(t => t !== type) };
      } else {
        return { ...prev, business_types: [...types, type] };
      }
    });
  };

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Fetch business types on mount
  useEffect(() => {
    fetchBusinessTypes();
  }, []);

  // Fetch businesses when the type filter changes
  useEffect(() => {
    fetchBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on filter change only
  }, [filterType]);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch active + inactive together so the count tabs are accurate;
      // the tab split happens client-side.
      let url = `${config.apiUrl}/api/businesses?active_only=false`;
      if (filterType) {
        url += `&business_type=${encodeURIComponent(filterType)}`;
      }

      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setBusinesses(data);
      } else {
        setError('Failed to load businesses');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching businesses:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const types = await response.json();
        setBusinessTypes(types);
      }
    } catch (err) {
      console.error('Error fetching business types:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate at least one type selected
    if (!formData.business_types || formData.business_types.length === 0) {
      setFormError('Please select at least one business type');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      const endpoint = selectedBusiness
        ? `${config.apiUrl}/api/businesses/${selectedBusiness.id}`
        : `${config.apiUrl}/api/businesses`;

      const method = selectedBusiness ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchBusinesses();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to save business');
      }
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (business) => {
    setFormData({
      name: business.name || '',
      business_types: business.business_types || (business.business_type ? [business.business_type] : []),
      phone: business.phone || '',
      fax: business.fax || '',
      email: business.email || '',
      website: business.website || '',
      address_line1: business.address_line1 || '',
      address_line2: business.address_line2 || '',
      city: business.city || '',
      state: business.state || '',
      zip_code: business.zip_code || '',
      notes: business.notes || ''
    });
    setSelectedBusiness(business);
    setShowCreateModal(true);
  };

  const handleDelete = async (businessId) => {
    if (!window.confirm('Are you sure you want to deactivate this business?')) return;

    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/${businessId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        fetchBusinesses();
      }
    } catch (err) {
      console.error('Error deleting business:', err);
    }
  };

  const handleActivate = async (businessId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/${businessId}/activate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchBusinesses();
      }
    } catch (err) {
      console.error('Error activating business:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      business_types: [],
      phone: '',
      fax: '',
      email: '',
      website: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      zip_code: '',
      notes: ''
    });
    setFormError(null);
    setSelectedBusiness(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const matchesSearch = (business) => {
    const typesStr = (business.business_types || []).join(' ').toLowerCase();
    const q = searchTerm.toLowerCase();
    return (
      business.name.toLowerCase().includes(q) ||
      typesStr.includes(q) ||
      business.city?.toLowerCase().includes(q) ||
      business.state?.toLowerCase().includes(q)
    );
  };

  const activeCount = businesses.filter((b) => b.active).length;
  const inactiveCount = businesses.length - activeCount;
  const filteredBusinesses = businesses.filter(
    (b) => (activeTab === 'active' ? b.active : !b.active) && matchesSearch(b)
  );

  const typeLabel = (t) => t.replace('_', ' ').toUpperCase();

  const businessAddress = (business) => {
    const cityStateZip = [
      business.city,
      [business.state, business.zip_code].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');
    return [business.address_line1, business.address_line2, cityStateZip]
      .filter(Boolean)
      .join(', ');
  };

  const websiteHref = (website) =>
    /^https?:\/\//i.test(website) ? website : `https://${website}`;

  const businessMenu = (business) => {
    const items = [];
    if (hasPermission('businesses.update')) {
      items.push({ label: 'Edit', onClick: () => handleEdit(business) });
      if (!business.active) {
        items.push({ label: 'Activate', onClick: () => handleActivate(business.id) });
      }
    }
    if (business.active && hasPermission('businesses.delete')) {
      items.push({ label: 'Deactivate', onClick: () => handleDelete(business.id), danger: true });
    }
    return items;
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {error && <div className="em-error ec-page-alert">{error}</div>}

        <EntityToolbar
          counts={[
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'inactive', label: 'Inactive', count: inactiveCount },
          ]}
          activeCount={activeTab}
          onCountChange={setActiveTab}
          search={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search businesses"
          filter={{
            value: filterType,
            onChange: setFilterType,
            label: 'Type',
            options: [
              { value: '', label: 'All types' },
              ...businessTypes.map((t) => ({ value: t, label: typeLabel(t) })),
            ],
          }}
          onAdd={hasPermission('businesses.create') ? openCreateModal : undefined}
          addLabel="Add business"
        />

        {loading ? (
          <div className="ec-empty">Loading businesses…</div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="ec-empty">
            {searchTerm
              ? 'No businesses match your search.'
              : `No ${activeTab} businesses.`}
          </div>
        ) : (
          <div className="ec-grid">
            {filteredBusinesses.map((business) => (
              <EntityCard
                key={business.id}
                icon={<BusinessesIcon size={22} />}
                title={business.name}
                badges={(business.business_types || [business.business_type]).filter(Boolean).map(typeLabel)}
                inactive={!business.active}
                details={[
                  { icon: <BuildingIcon size={18} />, label: 'Address', value: businessAddress(business) },
                  ...(business.fax
                    ? [{ icon: <PhoneIcon size={18} />, label: 'Fax', value: business.fax }]
                    : []),
                ]}
                quickActions={[
                  ...(business.phone
                    ? [{ icon: <PhoneIcon size={18} />, label: `Call ${business.phone}`, href: `tel:${business.phone}` }]
                    : []),
                  ...(business.email
                    ? [{ icon: <MailIcon size={18} />, label: `Email ${business.email}`, href: `mailto:${business.email}` }]
                    : []),
                  ...(business.website
                    ? [{ icon: <GlobeIcon size={18} />, label: 'Website', href: websiteHref(business.website), external: true }]
                    : []),
                ]}
                menu={businessMenu(business)}
              />
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <EntityModal
          open={showCreateModal}
          onOpenChange={(o) => { if (!o) { setShowCreateModal(false); resetForm(); } }}
          title={selectedBusiness ? 'Edit business' : 'Add business'}
          wide
        >
          <form onSubmit={handleSubmit} className="em-form">
            {formError && <div className="em-error">{formError}</div>}

            <EmField label="Business types (select all that apply)" required>
              <EmRow>
                {businessTypeOptions.map(type => (
                  <label key={type} className="em-check-row">
                    <input
                      type="checkbox"
                      className="em-check"
                      checked={(formData.business_types || []).includes(type)}
                      onChange={() => toggleBusinessType(type)}
                    />
                    <span className="em-check-label">{typeLabel(type)}</span>
                  </label>
                ))}
              </EmRow>
              {formData.business_types?.length === 0 && (
                <div className="em-error">Please select at least one type</div>
              )}
            </EmField>

            <EmRow>
              <EmField label="Business name" required htmlFor="biz-name">
                <input id="biz-name" className="em-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </EmField>
              <EmField label="Phone" htmlFor="biz-phone">
                <input id="biz-phone" className="em-input" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Fax" htmlFor="biz-fax">
                <input id="biz-fax" className="em-input" type="tel" value={formData.fax} onChange={(e) => setFormData({ ...formData, fax: e.target.value })} />
              </EmField>
              <EmField label="Email" htmlFor="biz-email">
                <input id="biz-email" className="em-input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Website" htmlFor="biz-website">
                <input id="biz-website" className="em-input" type="url" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://" />
              </EmField>
              <EmField label="Address line 1" htmlFor="biz-addr1">
                <input id="biz-addr1" className="em-input" value={formData.address_line1} onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Address line 2" htmlFor="biz-addr2">
                <input id="biz-addr2" className="em-input" value={formData.address_line2} onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })} />
              </EmField>
              <EmField label="City" htmlFor="biz-city">
                <input id="biz-city" className="em-input" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="State" htmlFor="biz-state">
                <input id="biz-state" className="em-input" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} maxLength="2" />
              </EmField>
              <EmField label="ZIP code" htmlFor="biz-zip">
                <input id="biz-zip" className="em-input" value={formData.zip_code} onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })} />
              </EmField>
            </EmRow>

            <EmField label="Notes" htmlFor="biz-notes">
              <textarea
                id="biz-notes"
                className="em-input"
                rows={4}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this business..."
              />
            </EmField>

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="em-submit" disabled={saving}>
                {saving ? 'Saving…' : (selectedBusiness ? 'Update business' : 'Add business')}
              </button>
            </div>
          </form>
        </EntityModal>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Businesses;
