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
import { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  UsersIcon,
  PhoneIcon,
  MailIcon,
  StethoscopeIcon,
  BusinessesIcon,
} from '../../components/Icons';
import EntityCard from '../../components/vc/EntityCard';
import EntityToolbar from '../../components/vc/EntityToolbar';
import PersonAvatar from '../../components/vc/PersonAvatar';
import EntityModal, { EmField, EmRow, EmSelect } from '../../components/vc/EntityModal';
import './AdminV2.css';

const AdminV2Providers = () => {
  const { user } = useAuth();
  const {
    selectedPatient: contextPatient,
    loadingPatients
  } = useAdminPatient();

  // Use context patient as the source of truth
  const selectedPatient = contextPatient;

  // Providers state
  const [providers, setProviders] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter state
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [providerTypes, setProviderTypes] = useState([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    business_id: '',
    first_name: '',
    last_name: '',
    title: '',
    specialty: '',
    provider_type: 'medical',
    phone: '',
    email: '',
    fax: '',
    license_number: '',
    npi_number: '',
    department: '',
    notes: '',
    is_primary: false
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const providerTypeOptions = [
    'medical', 'therapy', 'rehab', 'school', 'pharmacy', 'specialist',
    'nursing', 'social_worker', 'case_manager', 'other'
  ];

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Fetch businesses and provider types on mount
  useEffect(() => {
    fetchBusinesses();
    fetchProviderTypes();
  }, []);

  // Fetch providers when patient or filters change
  useEffect(() => {
    if (selectedPatient) {
      fetchProviders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient, filterType]);

  const fetchProviders = async () => {
    if (!selectedPatient) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch active + inactive together so the count tabs are accurate;
      // the tab split happens client-side.
      let url = `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=false`;
      if (filterType) {
        url += `&provider_type=${encodeURIComponent(filterType)}`;
      }

      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      } else {
        setError('Failed to load providers');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching providers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinesses = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses?active_only=true`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setBusinesses(data);
      }
    } catch (err) {
      console.error('Error fetching businesses:', err);
    }
  };

  const fetchProviderTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const types = await response.json();
        setProviderTypes(types);
      }
    } catch (err) {
      console.error('Error fetching provider types:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      setSaving(true);
      setFormError(null);

      const providerData = {
        ...formData,
        patient_id: selectedPatient.id,
        business_id: formData.business_id ? parseInt(formData.business_id) : null
      };

      const endpoint = selectedProvider
        ? `${config.apiUrl}/api/providers/${selectedProvider.id}`
        : `${config.apiUrl}/api/providers`;

      const method = selectedProvider ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(providerData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchProviders();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to save provider');
      }
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (provider) => {
    setFormData({
      business_id: provider.business_id || '',
      first_name: provider.first_name || '',
      last_name: provider.last_name || '',
      title: provider.title || '',
      specialty: provider.specialty || '',
      provider_type: provider.provider_type || 'medical',
      phone: provider.phone || '',
      email: provider.email || '',
      fax: provider.fax || '',
      license_number: provider.license_number || '',
      npi_number: provider.npi_number || '',
      department: provider.department || '',
      notes: provider.notes || '',
      is_primary: provider.is_primary || false
    });
    setSelectedProvider(provider);
    setShowCreateModal(true);
  };

  const handleDelete = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        fetchProviders();
        setSelectedProvider(null);
      }
    } catch (err) {
      console.error('Error deleting provider:', err);
    }
  };

  const handleActivate = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}/activate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchProviders();
      }
    } catch (err) {
      console.error('Error activating provider:', err);
    }
  };

  const handleSetPrimary = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}/set-primary`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchProviders();
      }
    } catch (err) {
      console.error('Error setting primary provider:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      business_id: '',
      first_name: '',
      last_name: '',
      title: '',
      specialty: '',
      provider_type: 'medical',
      phone: '',
      email: '',
      fax: '',
      license_number: '',
      npi_number: '',
      department: '',
      notes: '',
      is_primary: false
    });
    setFormError(null);
    setSelectedProvider(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const matchesSearch = (provider) => {
    const q = searchTerm.toLowerCase();
    return (
      provider.first_name.toLowerCase().includes(q) ||
      provider.last_name.toLowerCase().includes(q) ||
      provider.specialty?.toLowerCase().includes(q) ||
      provider.provider_type.toLowerCase().includes(q) ||
      (provider.business && provider.business.name.toLowerCase().includes(q))
    );
  };

  const activeCount = providers.filter((p) => p.active).length;
  const inactiveCount = providers.length - activeCount;
  const filteredProviders = providers.filter(
    (p) => (activeTab === 'active' ? p.active : !p.active) && matchesSearch(p)
  );

  const typeLabel = (t) => t.replace('_', ' ').toUpperCase();

  const providerMenu = (provider) => {
    const items = [];
    if (hasPermission('providers.update')) {
      items.push({ label: 'Edit', onClick: () => handleEdit(provider) });
      if (!provider.is_primary && provider.active) {
        items.push({ label: 'Set primary', onClick: () => handleSetPrimary(provider.id) });
      }
      if (!provider.active) {
        items.push({ label: 'Activate', onClick: () => handleActivate(provider.id) });
      }
    }
    if (provider.active && hasPermission('providers.delete')) {
      items.push({ label: 'Deactivate', onClick: () => handleDelete(provider.id), danger: true });
    }
    return items;
  };

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
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
              searchPlaceholder="Search providers"
              filter={{
                value: filterType,
                onChange: setFilterType,
                label: 'Type',
                options: [
                  { value: '', label: 'All types' },
                  ...providerTypes.map((t) => ({ value: t, label: typeLabel(t) })),
                ],
              }}
              onAdd={hasPermission('providers.create') ? openCreateModal : undefined}
              addLabel="Add provider"
            />

            {loading ? (
              <div className="ec-empty">Loading providers…</div>
            ) : filteredProviders.length === 0 ? (
              <div className="ec-empty">
                {searchTerm
                  ? 'No providers match your search.'
                  : `No ${activeTab} providers for this patient.`}
              </div>
            ) : (
              <div className="ec-grid">
                {filteredProviders.map((provider) => (
                  <EntityCard
                    key={provider.id}
                    avatar={<PersonAvatar kind="provider" id={provider.id} size={46} decorative />}
                    title={[provider.title, provider.first_name, provider.last_name].filter(Boolean).join(' ')}
                    badges={[typeLabel(provider.provider_type)]}
                    tag={provider.is_primary ? { label: 'Primary' } : undefined}
                    inactive={!provider.active}
                    details={[
                      { icon: <StethoscopeIcon size={18} />, label: 'Specialty', value: provider.specialty },
                      { icon: <BusinessesIcon size={18} />, label: 'Business', value: provider.business?.name },
                    ]}
                    quickActions={[
                      ...(provider.phone
                        ? [{ icon: <PhoneIcon size={18} />, label: `Call ${provider.phone}`, href: `tel:${provider.phone}` }]
                        : []),
                      ...(provider.email
                        ? [{ icon: <MailIcon size={18} />, label: `Email ${provider.email}`, href: `mailto:${provider.email}` }]
                        : []),
                    ]}
                    menu={providerMenu(provider)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <UsersIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their care team.</p>
          </div>
        )}

        {/* Create / Edit Dialog */}
        <EntityModal
          open={showCreateModal}
          onOpenChange={(o) => { if (!o) { setShowCreateModal(false); resetForm(); } }}
          title={selectedProvider ? 'Edit provider' : 'Add provider'}
          wide
        >
          <form onSubmit={handleSubmit} className="em-form">
            {formError && <div className="em-error">{formError}</div>}

            <EmRow>
              <EmField label="First name" required htmlFor="prov-first">
                <input id="prov-first" className="em-input" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
              </EmField>
              <EmField label="Last name" required htmlFor="prov-last">
                <input id="prov-last" className="em-input" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} required />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Title" htmlFor="prov-title">
                <input id="prov-title" className="em-input" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Dr., RN, PT, OT, etc." />
              </EmField>
              <EmField label="Provider type" required htmlFor="prov-type">
                <EmSelect id="prov-type" value={formData.provider_type} onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}>
                  {providerTypeOptions.map(type => (
                    <option key={type} value={type}>{typeLabel(type)}</option>
                  ))}
                </EmSelect>
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Specialty" htmlFor="prov-specialty">
                <input id="prov-specialty" className="em-input" value={formData.specialty} onChange={(e) => setFormData({ ...formData, specialty: e.target.value })} placeholder="Cardiologist, Physical Therapist, etc." />
              </EmField>
              <EmField label="Associated business" htmlFor="prov-business">
                <EmSelect
                  id="prov-business"
                  value={formData.business_id ? String(formData.business_id) : ''}
                  onChange={(e) => setFormData({ ...formData, business_id: e.target.value })}
                >
                  <option value="">No business association</option>
                  {businesses.map(business => (
                    <option key={business.id} value={String(business.id)}>
                      {business.name} ({business.business_type})
                    </option>
                  ))}
                </EmSelect>
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Phone" htmlFor="prov-phone">
                <input id="prov-phone" className="em-input" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </EmField>
              <EmField label="Email" htmlFor="prov-email">
                <input id="prov-email" className="em-input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Fax" htmlFor="prov-fax">
                <input id="prov-fax" className="em-input" type="tel" value={formData.fax} onChange={(e) => setFormData({ ...formData, fax: e.target.value })} />
              </EmField>
              <EmField label="License number" htmlFor="prov-license">
                <input id="prov-license" className="em-input" value={formData.license_number} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="NPI number" htmlFor="prov-npi">
                <input id="prov-npi" className="em-input" value={formData.npi_number} onChange={(e) => setFormData({ ...formData, npi_number: e.target.value })} />
              </EmField>
              <EmField label="Department" htmlFor="prov-dept">
                <input id="prov-dept" className="em-input" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} />
              </EmField>
            </EmRow>

            <EmField label="Notes" htmlFor="prov-notes">
              <textarea id="prov-notes" className="em-input" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </EmField>

            <label className="em-check-row">
              <input type="checkbox" className="em-check" checked={formData.is_primary} onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })} />
              <span className="em-check-label">Primary provider for this type</span>
            </label>

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="em-submit" disabled={saving}>
                {saving ? 'Saving…' : (selectedProvider ? 'Update provider' : 'Add provider')}
              </button>
            </div>
          </form>
        </EntityModal>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Providers;
