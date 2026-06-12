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
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  UsersIcon,
  CheckIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import './AdminV2.css';

// Radix Select forbids an empty-string value, so use a sentinel for "none".
const NONE = '__none__';

// Label/value row used inside the provider cards.
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

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
  }, [selectedPatient, activeTab, filterType]);

  const fetchProviders = async () => {
    if (!selectedPatient) return;

    try {
      setLoading(true);
      setError(null);

      let url = `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=${activeTab === 'active'}`;
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

  const filteredProviders = providers.filter(provider =>
    provider.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.specialty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.provider_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (provider.business && provider.business.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
            {error && (
              <div className="tw mb-4">
                <Alert variant="destructive">{error}</Alert>
              </div>
            )}

            {/* Tabs and Filters */}
            <div className="admin-v2-controls-bar">
              <div className="admin-v2-tabs">
                <button
                  className={`admin-v2-tab ${activeTab === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveTab('active')}
                >
                  Active ({providers.filter(p => p.active).length})
                </button>
                <button
                  className={`admin-v2-tab ${activeTab === 'inactive' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inactive')}
                >
                  Inactive ({providers.filter(p => !p.active).length})
                </button>
              </div>

              <div className="admin-v2-filters">
                <input
                  type="text"
                  placeholder="Search providers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="admin-v2-search-input"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="admin-v2-filter-select"
                >
                  <option value="">All Types</option>
                  {providerTypes.map(type => (
                    <option key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {hasPermission('providers.create') && (
                <button
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={openCreateModal}
                >
                  <PlusIcon size={16} /> Add Provider
                </button>
              )}
            </div>

            {/* Provider Cards Grid */}
            <div className="tw mt-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading providers...</p>
              ) : filteredProviders.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
                  <UsersIcon size={48} />
                  <h3 className="text-base font-semibold text-foreground">
                    {searchTerm ? 'No providers found matching your search.' : 'No providers found for this patient.'}
                  </h3>
                  {hasPermission('providers.create') && (
                    <Button onClick={openCreateModal}>
                      <PlusIcon size={16} /> Add First Provider
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProviders.map(provider => (
                    <Card key={provider.id} className={cn(!provider.active && "opacity-60")}>
                      <CardHeader className="gap-2 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm">
                            {provider.title} {provider.first_name} {provider.last_name}
                          </CardTitle>
                          {provider.is_primary && <Badge variant="info">PRIMARY</Badge>}
                        </div>
                        <Badge variant="secondary" className="w-fit">
                          {provider.provider_type.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                        {provider.specialty && <Row label="Specialty" value={provider.specialty} />}
                        {provider.business && <Row label="Business" value={provider.business.name} />}
                        {provider.department && <Row label="Department" value={provider.department} />}
                        {provider.phone && <Row label="Phone" value={provider.phone} />}
                        {provider.email && <Row label="Email" value={provider.email} />}
                        {provider.license_number && <Row label="License" value={provider.license_number} />}
                      </CardContent>

                      <CardFooter className="flex-wrap justify-start gap-2 py-3">
                        {hasPermission('providers.update') && (
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(provider)}>
                            <EditIcon size={14} /> Edit
                          </Button>
                        )}
                        {!provider.is_primary && provider.active && hasPermission('providers.update') && (
                          <Button size="sm" variant="ghost" onClick={() => handleSetPrimary(provider.id)}>
                            <CheckIcon size={14} /> Set Primary
                          </Button>
                        )}
                        {provider.active ? (
                          hasPermission('providers.delete') && (
                            <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleDelete(provider.id)}>
                              <TrashIcon size={14} /> Deactivate
                            </Button>
                          )
                        ) : (
                          hasPermission('providers.update') && (
                            <Button size="sm" variant="ghost" className="text-[#3fb950] hover:text-[#3fb950]" onClick={() => handleActivate(provider.id)}>
                              <CheckIcon size={14} /> Activate
                            </Button>
                          )
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <UsersIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their care team.</p>
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) { setShowCreateModal(false); resetForm(); } }}>
          <DialogContent className="sm:max-w-[680px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{selectedProvider ? 'Edit Provider' : 'Add New Provider'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <FormRow>
                <Field label="First Name" required htmlFor="prov-first">
                  <Input id="prov-first" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
                </Field>
                <Field label="Last Name" required htmlFor="prov-last">
                  <Input id="prov-last" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} required />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Title" htmlFor="prov-title">
                  <Input id="prov-title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Dr., RN, PT, OT, etc." />
                </Field>
                <Field label="Provider Type" required>
                  <Select value={formData.provider_type} onValueChange={(v) => setFormData({ ...formData, provider_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providerTypeOptions.map(type => (
                        <SelectItem key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Specialty" htmlFor="prov-specialty">
                  <Input id="prov-specialty" value={formData.specialty} onChange={(e) => setFormData({ ...formData, specialty: e.target.value })} placeholder="Cardiologist, Physical Therapist, etc." />
                </Field>
                <Field label="Associated Business">
                  <Select
                    value={formData.business_id ? String(formData.business_id) : NONE}
                    onValueChange={(v) => setFormData({ ...formData, business_id: v === NONE ? '' : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="No Business Association" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No Business Association</SelectItem>
                      {businesses.map(business => (
                        <SelectItem key={business.id} value={String(business.id)}>
                          {business.name} ({business.business_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Phone" htmlFor="prov-phone">
                  <Input id="prov-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </Field>
                <Field label="Email" htmlFor="prov-email">
                  <Input id="prov-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Fax" htmlFor="prov-fax">
                  <Input id="prov-fax" type="tel" value={formData.fax} onChange={(e) => setFormData({ ...formData, fax: e.target.value })} />
                </Field>
                <Field label="License Number" htmlFor="prov-license">
                  <Input id="prov-license" value={formData.license_number} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="NPI Number" htmlFor="prov-npi">
                  <Input id="prov-npi" value={formData.npi_number} onChange={(e) => setFormData({ ...formData, npi_number: e.target.value })} />
                </Field>
                <Field label="Department" htmlFor="prov-dept">
                  <Input id="prov-dept" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} />
                </Field>
              </FormRow>

              <Field label="Notes" htmlFor="prov-notes">
                <Textarea id="prov-notes" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </Field>

              <label className="flex w-fit cursor-pointer items-center gap-2">
                <Checkbox checked={formData.is_primary} onCheckedChange={(v) => setFormData({ ...formData, is_primary: v === true })} />
                <span className="text-sm text-foreground">Primary provider for this type</span>
              </label>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : (selectedProvider ? 'Update Provider' : 'Add Provider')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Providers;
