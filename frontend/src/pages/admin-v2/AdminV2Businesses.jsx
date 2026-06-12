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
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  BuildingIcon,
  CheckIcon,
  SearchIcon
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
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Field, FormRow } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import './AdminV2.css';

// Label/value row used inside the business cards.
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

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

  // Fetch businesses on mount
  useEffect(() => {
    fetchBusinesses();
    fetchBusinessTypes();
  }, [activeTab, filterType]);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      setError(null);

      let url = `${config.apiUrl}/api/businesses?active_only=${activeTab === 'active'}`;
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

  const filteredBusinesses = businesses.filter(business => {
    const typesStr = (business.business_types || []).join(' ').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return business.name.toLowerCase().includes(searchLower) ||
      typesStr.includes(searchLower) ||
      business.city?.toLowerCase().includes(searchLower) ||
      business.state?.toLowerCase().includes(searchLower);
  });

  // Stats
  const activeCount = businesses.filter(b => b.active).length;
  const inactiveCount = businesses.filter(b => !b.active).length;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
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
              Active ({activeCount})
            </button>
            <button
              className={`admin-v2-tab ${activeTab === 'inactive' ? 'active' : ''}`}
              onClick={() => setActiveTab('inactive')}
            >
              Inactive ({inactiveCount})
            </button>
          </div>

          <div className="admin-v2-filters">
            <div className="admin-v2-search-wrapper">
              <SearchIcon size={16} />
              <input
                type="text"
                placeholder="Search businesses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="admin-v2-search-input"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="admin-v2-filter-select"
            >
              <option value="">All Types</option>
              {businessTypes.map(type => (
                <option key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          {hasPermission('businesses.create') && (
            <button
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={openCreateModal}
            >
              <PlusIcon size={16} /> Add Business
            </button>
          )}
        </div>

        {/* Business Cards Grid */}
        <div className="tw mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading businesses...</p>
          ) : filteredBusinesses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
              <BuildingIcon size={48} />
              <h3 className="text-base font-semibold text-foreground">
                {searchTerm ? 'No businesses found matching your search.' : 'No businesses found.'}
              </h3>
              {hasPermission('businesses.create') && (
                <Button onClick={openCreateModal}>
                  <PlusIcon size={16} /> Add First Business
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBusinesses.map(business => (
                <Card key={business.id} className={cn(!business.active && "opacity-60")}>
                  <CardHeader className="gap-2 py-3">
                    <CardTitle className="text-sm">{business.name}</CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {(business.business_types || [business.business_type]).filter(Boolean).map(type => (
                        <Badge key={type} variant="secondary">{type.replace('_', ' ').toUpperCase()}</Badge>
                      ))}
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                    {(business.address_line1 || business.city) && (
                      <Row
                        label="Address"
                        value={
                          <>
                            {business.address_line1 && <>{business.address_line1}<br /></>}
                            {business.address_line2 && <>{business.address_line2}<br /></>}
                            {business.city && `${business.city}, `}
                            {business.state} {business.zip_code}
                          </>
                        }
                      />
                    )}
                    {business.phone && <Row label="Phone" value={business.phone} />}
                    {business.fax && <Row label="Fax" value={business.fax} />}
                    {business.email && <Row label="Email" value={business.email} />}
                    {business.website && (
                      <Row
                        label="Website"
                        value={
                          <a className="text-ring underline-offset-4 hover:underline" href={business.website} target="_blank" rel="noopener noreferrer">
                            {business.website.replace('https://', '').replace('http://', '')}
                          </a>
                        }
                      />
                    )}
                    {business.provider_count > 0 && <Row label="Providers" value={business.provider_count} />}
                  </CardContent>

                  <CardFooter className="justify-start gap-2 py-3">
                    {hasPermission('businesses.update') && (
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(business)}>
                        <EditIcon size={14} /> Edit
                      </Button>
                    )}
                    {business.active ? (
                      hasPermission('businesses.delete') && (
                        <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleDelete(business.id)}>
                          <TrashIcon size={14} /> Deactivate
                        </Button>
                      )
                    ) : (
                      hasPermission('businesses.update') && (
                        <Button size="sm" variant="ghost" className="text-[#3fb950] hover:text-[#3fb950]" onClick={() => handleActivate(business.id)}>
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

        {/* Create / Edit Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) { setShowCreateModal(false); resetForm(); } }}>
          <DialogContent className="sm:max-w-[680px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{selectedBusiness ? 'Edit Business' : 'Add New Business'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <div className="flex flex-col gap-1.5">
                <Label>
                  Business Types <span className="text-xs font-normal text-muted-foreground">(select all that apply)</span>
                  <span className="text-destructive"> *</span>
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {businessTypeOptions.map(type => (
                    <label key={type} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={(formData.business_types || []).includes(type)}
                        onCheckedChange={() => toggleBusinessType(type)}
                      />
                      {type.replace('_', ' ').toUpperCase()}
                    </label>
                  ))}
                </div>
                {formData.business_types?.length === 0 && (
                  <p className="text-xs text-destructive">Please select at least one type</p>
                )}
              </div>

              <FormRow>
                <Field label="Business Name" required htmlFor="biz-name">
                  <Input id="biz-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </Field>
                <Field label="Phone" htmlFor="biz-phone">
                  <Input id="biz-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Fax" htmlFor="biz-fax">
                  <Input id="biz-fax" type="tel" value={formData.fax} onChange={(e) => setFormData({ ...formData, fax: e.target.value })} />
                </Field>
                <Field label="Email" htmlFor="biz-email">
                  <Input id="biz-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Website" htmlFor="biz-website">
                  <Input id="biz-website" type="url" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://" />
                </Field>
                <Field label="Address Line 1" htmlFor="biz-addr1">
                  <Input id="biz-addr1" value={formData.address_line1} onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Address Line 2" htmlFor="biz-addr2">
                  <Input id="biz-addr2" value={formData.address_line2} onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })} />
                </Field>
                <Field label="City" htmlFor="biz-city">
                  <Input id="biz-city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="State" htmlFor="biz-state">
                  <Input id="biz-state" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} maxLength="2" />
                </Field>
                <Field label="ZIP Code" htmlFor="biz-zip">
                  <Input id="biz-zip" value={formData.zip_code} onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })} />
                </Field>
              </FormRow>

              <Field label="Notes" htmlFor="biz-notes">
                <Textarea
                  id="biz-notes"
                  rows={4}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this business..."
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : (selectedBusiness ? 'Update Business' : 'Add Business')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Businesses;
