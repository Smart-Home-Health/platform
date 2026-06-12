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
import React, { useState, useEffect, useCallback } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { useAuth } from '../../contexts/AuthContext';
import { PlusIcon, EditIcon, TrashIcon, NotesIcon, XIcon } from '../../components/Icons';
import { API_BASE_URL } from '../../config';
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

const statusVariant = (status) => (
  { active: 'success', pending: 'warning', removed: 'muted', replaced: 'info', failed: 'danger', expired: 'warning' }[status] || 'muted'
);
const mriVariant = (mriSafe) => (
  { safe: 'success', conditional: 'warning', unsafe: 'danger' }[mriSafe] || 'muted'
);

// Section heading inside the implant form dialog.
function FormSection({ children }) {
  return <h4 className="border-b border-border pb-1 pt-2 text-sm font-semibold text-foreground">{children}</h4>;
}

// Label/value row used inside the implant cards.
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

const EMPTY_FORM = {
  name: '', description: '', implant_type: 'medical', category: '', subcategory: '',
  body_location: '', body_side: '', manufacturer: '', model: '', serial_number: '',
  size: '', material: '', implant_date: '', last_change_date: '', next_change_date: '',
  removal_date: '', expiration_date: '', implanting_provider_id: '', managing_provider_id: '',
  facility_name: '', facility_location: '', status: 'active', notes: '', care_instructions: '',
  complications: '', mri_safe: '', mri_notes: '', is_life_sustaining: false,
  requires_regular_change: false, change_frequency_days: '',
};

const EMPTY_NOTE = {
  note_type: 'follow_up', content: '', was_changed: false,
  old_serial_number: '', new_serial_number: '', provider_id: '',
};

const AdminV2Implants = () => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth();
  const [implants, setImplants] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Lookup data
  const [implantTypes, setImplantTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [mriSafetyOptions, setMriSafetyOptions] = useState([]);
  const [bodySides, setBodySides] = useState([]);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [editingImplant, setEditingImplant] = useState(null);
  const [selectedImplant, setSelectedImplant] = useState(null);
  const [implantNotes, setImplantNotes] = useState([]);

  // Form state
  const [formData, setFormData] = useState(EMPTY_FORM);

  // Note form state
  const [noteFormData, setNoteFormData] = useState(EMPTY_NOTE);

  // Filter state
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const hasPermission = useCallback((permission) => {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission) ||
           user.permissions.includes('admin') ||
           user.permissions.includes('implants.*') ||
           // Fallback to providers permissions for now
           user.permissions.includes('providers.read') ||
           user.permissions.includes('providers.create') ||
           user.permissions.includes('providers.update') ||
           user.permissions.includes('providers.delete');
  }, [user]);

  // Fetch lookup data
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [typesRes, statusesRes, mriRes, sidesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/implants/types`, { credentials: 'include' }),
          fetch(`${API_BASE_URL}/api/implants/statuses`, { credentials: 'include' }),
          fetch(`${API_BASE_URL}/api/implants/mri-safety-options`, { credentials: 'include' }),
          fetch(`${API_BASE_URL}/api/implants/body-sides`, { credentials: 'include' }),
        ]);

        if (typesRes.ok) setImplantTypes(await typesRes.json());
        if (statusesRes.ok) setStatuses(await statusesRes.json());
        if (mriRes.ok) setMriSafetyOptions(await mriRes.json());
        if (sidesRes.ok) setBodySides(await sidesRes.json());
      } catch (err) {
        console.error('Error fetching lookups:', err);
      }
    };
    fetchLookups();
  }, []);

  // Fetch categories when implant type changes
  useEffect(() => {
    const fetchCategories = async () => {
      if (!formData.implant_type) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/implants/categories?implant_type=${formData.implant_type}`, { credentials: 'include' });
        if (res.ok) setCategories(await res.json());
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, [formData.implant_type]);

  // Fetch providers for dropdowns
  useEffect(() => {
    const fetchProviders = async () => {
      if (!selectedPatient) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/providers/patient/${selectedPatient.id}`, { credentials: 'include' });
        if (res.ok) setProviders(await res.json());
      } catch (err) {
        console.error('Error fetching providers:', err);
      }
    };
    fetchProviders();
  }, [selectedPatient]);

  // Fetch implants
  const fetchImplants = useCallback(async () => {
    if (!selectedPatient) return;

    setLoading(true);
    try {
      let url = `${API_BASE_URL}/api/implants/patient/${selectedPatient.id}?include_inactive=true`;
      if (typeFilter) url += `&implant_type=${typeFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;

      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch implants');
      const data = await res.json();
      setImplants(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient, typeFilter, statusFilter]);

  useEffect(() => {
    fetchImplants();
  }, [fetchImplants]);

  // Fetch notes for an implant
  const fetchNotes = async (implant) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/implants/${implant.id}/notes`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setImplantNotes(data);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  const handleOpenModal = (implant = null) => {
    if (implant) {
      setEditingImplant(implant);
      setFormData({
        name: implant.name || '',
        description: implant.description || '',
        implant_type: implant.implant_type || 'medical',
        category: implant.category || '',
        subcategory: implant.subcategory || '',
        body_location: implant.body_location || '',
        body_side: implant.body_side || '',
        manufacturer: implant.manufacturer || '',
        model: implant.model || '',
        serial_number: implant.serial_number || '',
        size: implant.size || '',
        material: implant.material || '',
        implant_date: implant.implant_date || '',
        last_change_date: implant.last_change_date || '',
        next_change_date: implant.next_change_date || '',
        removal_date: implant.removal_date || '',
        expiration_date: implant.expiration_date || '',
        implanting_provider_id: implant.implanting_provider_id || '',
        managing_provider_id: implant.managing_provider_id || '',
        facility_name: implant.facility_name || '',
        facility_location: implant.facility_location || '',
        status: implant.status || 'active',
        notes: implant.notes || '',
        care_instructions: implant.care_instructions || '',
        complications: implant.complications || '',
        mri_safe: implant.mri_safe || '',
        mri_notes: implant.mri_notes || '',
        is_life_sustaining: implant.is_life_sustaining || false,
        requires_regular_change: implant.requires_regular_change || false,
        change_frequency_days: implant.change_frequency_days || '',
      });
    } else {
      setEditingImplant(null);
      setFormData(EMPTY_FORM);
    }
    setShowModal(true);
  };

  const handleOpenNotesModal = async (implant) => {
    setSelectedImplant(implant);
    await fetchNotes(implant);
    setNoteFormData(EMPTY_NOTE);
    setShowNotesModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        ...formData,
        patient_id: selectedPatient.id,
        implanting_provider_id: formData.implanting_provider_id || null,
        managing_provider_id: formData.managing_provider_id || null,
        change_frequency_days: formData.change_frequency_days ? parseInt(formData.change_frequency_days) : null,
      };

      // Remove empty date fields
      ['implant_date', 'last_change_date', 'next_change_date', 'removal_date', 'expiration_date'].forEach(field => {
        if (!payload[field]) payload[field] = null;
      });

      const url = editingImplant
        ? `${API_BASE_URL}/api/implants/${editingImplant.id}`
        : `${API_BASE_URL}/api/implants/`;

      const res = await fetch(url, {
        method: editingImplant ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save implant');

      setShowModal(false);
      fetchImplants();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (implant) => {
    if (!confirm(`Are you sure you want to delete "${implant.name}"?`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/implants/${implant.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete implant');
      fetchImplants();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        ...noteFormData,
        provider_id: noteFormData.provider_id || null,
      };

      const res = await fetch(`${API_BASE_URL}/api/implants/${selectedImplant.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to add note');

      await fetchNotes(selectedImplant);
      setNoteFormData(EMPTY_NOTE);
      fetchImplants(); // Refresh to update notes count
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/implants/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete note');
      await fetchNotes(selectedImplant);
      fetchImplants();
    } catch (err) {
      setError(err.message);
    }
  };

  const getTypeLabel = (type) => {
    const found = implantTypes.find(t => t.value === type);
    return found ? found.label : type;
  };

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-empty-state">
            <p>Please select a patient to manage implants.</p>
          </div>
        </div>
      </AdminV2Layout>
    );
  }

  // Filter implants based on active tab and search
  const filteredImplants = implants.filter(implant => {
    const matchesTab = activeTab === 'active' ? implant.active : !implant.active;
    const matchesSearch = !searchTerm ||
      implant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      implant.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      implant.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      implant.body_location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !typeFilter || implant.implant_type === typeFilter;
    const matchesStatus = !statusFilter || implant.status === statusFilter;
    return matchesTab && matchesSearch && matchesType && matchesStatus;
  });

  const activeCount = implants.filter(i => i.active).length;
  const inactiveCount = implants.filter(i => !i.active).length;

  // Shared provider <Select> options.
  const providerOptions = providers.map(p => (
    <SelectItem key={p.id} value={String(p.id)}>
      {p.title} {p.first_name} {p.last_name} - {p.specialty}
    </SelectItem>
  ));

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {error && (
          <div className="tw mb-4">
            <Alert variant="destructive" className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <button type="button" className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setError(null)}>
                <XIcon size={14} />
              </button>
            </Alert>
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
            <input
              type="text"
              placeholder="Search implants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="admin-v2-search-input"
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="admin-v2-filter-select">
              <option value="">All Types</option>
              {implantTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-v2-filter-select">
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {hasPermission('implants.create') && (
            <button className="admin-v2-btn admin-v2-btn-primary" onClick={() => handleOpenModal()}>
              <PlusIcon size={16} /> Add Implant
            </button>
          )}
        </div>

        {/* Implant Cards Grid */}
        <div className="tw mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading implants...</p>
          ) : filteredImplants.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
              <p className="text-base font-semibold text-foreground">
                {searchTerm ? 'No implants found matching your search.' : `No ${activeTab} implants found for this patient.`}
              </p>
              {activeTab === 'active' && hasPermission('implants.create') && !searchTerm && (
                <Button onClick={() => handleOpenModal()}>
                  <PlusIcon size={16} /> Add First Implant
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredImplants.map(implant => (
                <Card key={implant.id} className={cn(!implant.active && "opacity-60")}>
                  <CardHeader className="gap-2 py-3">
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      {implant.is_life_sustaining && <span title="Life Sustaining">❤️</span>}
                      {implant.name}
                    </CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="info">{getTypeLabel(implant.implant_type)}</Badge>
                      <Badge variant={statusVariant(implant.status)}>{implant.status}</Badge>
                      {implant.mri_safe && <Badge variant={mriVariant(implant.mri_safe)}>MRI: {implant.mri_safe}</Badge>}
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                    <Row
                      label="Location"
                      value={`${implant.body_location}${implant.body_side && implant.body_side !== 'n/a' ? ` (${implant.body_side})` : ''}`}
                    />
                    {implant.manufacturer && <Row label="Manufacturer" value={implant.manufacturer} />}
                    {implant.model && <Row label="Model" value={implant.model} />}
                    {implant.size && <Row label="Size" value={implant.size} />}
                    {implant.serial_number && (
                      <Row label="Serial #" value={<code className="font-mono text-xs">{implant.serial_number}</code>} />
                    )}
                    {implant.implant_date && <Row label="Implanted" value={new Date(implant.implant_date).toLocaleDateString()} />}
                    {implant.managing_provider_name && <Row label="Managed by" value={implant.managing_provider_name} />}
                    {implant.next_change_date && <Row label="Next Change" value={new Date(implant.next_change_date).toLocaleDateString()} />}
                  </CardContent>

                  <CardFooter className="flex-wrap justify-start gap-2 py-3">
                    <Button size="sm" variant="ghost" onClick={() => handleOpenNotesModal(implant)}>
                      <NotesIcon size={14} /> Notes{implant.notes_count > 0 ? ` (${implant.notes_count})` : ''}
                    </Button>
                    {hasPermission('implants.update') && (
                      <Button size="sm" variant="ghost" onClick={() => handleOpenModal(implant)}>
                        <EditIcon size={14} /> Edit
                      </Button>
                    )}
                    {hasPermission('implants.delete') && (
                      <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleDelete(implant)}>
                        <TrashIcon size={14} /> Delete
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Implant Dialog */}
        <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
          <DialogContent className="sm:max-w-[760px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{editingImplant ? 'Edit Implant' : 'Add Implant'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <FormSection>Basic Information</FormSection>
              <FormRow>
                <Field label="Name" required htmlFor="imp-name">
                  <Input id="imp-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Tracheostomy Tube" required />
                </Field>
                <Field label="Type" required>
                  <Select value={formData.implant_type} onValueChange={(v) => setFormData({ ...formData, implant_type: v, category: '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {implantTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>
              <FormRow>
                <Field label="Category">
                  <Select value={formData.category || NONE} onValueChange={(v) => setFormData({ ...formData, category: v === NONE ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Category</SelectItem>
                      {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>
              <Field label="Description" htmlFor="imp-desc">
                <Textarea id="imp-desc" rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </Field>

              <FormSection>Location</FormSection>
              <FormRow>
                <Field label="Body Location" required htmlFor="imp-loc">
                  <Input id="imp-loc" value={formData.body_location} onChange={e => setFormData({ ...formData, body_location: e.target.value })} placeholder="e.g., Neck, Chest, Left Ear" required />
                </Field>
                <Field label="Side">
                  <Select value={formData.body_side || NONE} onValueChange={(v) => setFormData({ ...formData, body_side: v === NONE ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select Side" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Side</SelectItem>
                      {bodySides.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <FormSection>Device Details</FormSection>
              <FormRow>
                <Field label="Manufacturer" htmlFor="imp-mfr">
                  <Input id="imp-mfr" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} />
                </Field>
                <Field label="Model" htmlFor="imp-model">
                  <Input id="imp-model" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} />
                </Field>
              </FormRow>
              <FormRow>
                <Field label="Serial Number" htmlFor="imp-serial">
                  <Input id="imp-serial" value={formData.serial_number} onChange={e => setFormData({ ...formData, serial_number: e.target.value })} />
                </Field>
                <Field label="Size" htmlFor="imp-size">
                  <Input id="imp-size" value={formData.size} onChange={e => setFormData({ ...formData, size: e.target.value })} placeholder="e.g., 6.0 cuffed, 14g" />
                </Field>
              </FormRow>
              <Field label="Material" htmlFor="imp-material">
                <Input id="imp-material" value={formData.material} onChange={e => setFormData({ ...formData, material: e.target.value })} placeholder="e.g., Silicone, Titanium" />
              </Field>

              <FormSection>Dates</FormSection>
              <FormRow>
                <Field label="Implant Date" htmlFor="imp-date">
                  <Input id="imp-date" type="date" value={formData.implant_date} onChange={e => setFormData({ ...formData, implant_date: e.target.value })} />
                </Field>
                <Field label="Last Change Date" htmlFor="imp-last">
                  <Input id="imp-last" type="date" value={formData.last_change_date} onChange={e => setFormData({ ...formData, last_change_date: e.target.value })} />
                </Field>
              </FormRow>
              <FormRow>
                <Field label="Next Change Date" htmlFor="imp-next">
                  <Input id="imp-next" type="date" value={formData.next_change_date} onChange={e => setFormData({ ...formData, next_change_date: e.target.value })} />
                </Field>
                <Field label="Expiration Date" htmlFor="imp-exp">
                  <Input id="imp-exp" type="date" value={formData.expiration_date} onChange={e => setFormData({ ...formData, expiration_date: e.target.value })} />
                </Field>
              </FormRow>

              <FormSection>Providers &amp; Facility</FormSection>
              <FormRow>
                <Field label="Implanting Provider">
                  <Select
                    value={formData.implanting_provider_id ? String(formData.implanting_provider_id) : NONE}
                    onValueChange={(v) => setFormData({ ...formData, implanting_provider_id: v === NONE ? '' : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Provider</SelectItem>
                      {providerOptions}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Managing Provider">
                  <Select
                    value={formData.managing_provider_id ? String(formData.managing_provider_id) : NONE}
                    onValueChange={(v) => setFormData({ ...formData, managing_provider_id: v === NONE ? '' : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Provider</SelectItem>
                      {providerOptions}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>
              <FormRow>
                <Field label="Facility Name" htmlFor="imp-fac">
                  <Input id="imp-fac" value={formData.facility_name} onChange={e => setFormData({ ...formData, facility_name: e.target.value })} />
                </Field>
                <Field label="Facility Location" htmlFor="imp-facloc">
                  <Input id="imp-facloc" value={formData.facility_location} onChange={e => setFormData({ ...formData, facility_location: e.target.value })} placeholder="City, State" />
                </Field>
              </FormRow>

              <FormSection>MRI Safety &amp; Flags</FormSection>
              <FormRow>
                <Field label="MRI Safety">
                  <Select value={formData.mri_safe || NONE} onValueChange={(v) => setFormData({ ...formData, mri_safe: v === NONE ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select MRI Safety" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select MRI Safety</SelectItem>
                      {mriSafetyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="MRI Notes" htmlFor="imp-mrinotes">
                  <Input id="imp-mrinotes" value={formData.mri_notes} onChange={e => setFormData({ ...formData, mri_notes: e.target.value })} placeholder="Any MRI-specific conditions" />
                </Field>
              </FormRow>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={formData.is_life_sustaining} onCheckedChange={(v) => setFormData({ ...formData, is_life_sustaining: v === true })} />
                  <span className="text-sm text-foreground">Life Sustaining</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={formData.requires_regular_change} onCheckedChange={(v) => setFormData({ ...formData, requires_regular_change: v === true })} />
                  <span className="text-sm text-foreground">Requires Regular Change</span>
                </label>
              </div>
              {formData.requires_regular_change && (
                <Field label="Change Frequency (days)" htmlFor="imp-freq">
                  <Input id="imp-freq" type="number" min="1" value={formData.change_frequency_days} onChange={e => setFormData({ ...formData, change_frequency_days: e.target.value })} />
                </Field>
              )}

              <FormSection>Notes</FormSection>
              <Field label="General Notes" htmlFor="imp-gnotes">
                <Textarea id="imp-gnotes" rows={2} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
              </Field>
              <Field label="Care Instructions" htmlFor="imp-care">
                <Textarea id="imp-care" rows={2} value={formData.care_instructions} onChange={e => setFormData({ ...formData, care_instructions: e.target.value })} />
              </Field>
              <Field label="Complications History" htmlFor="imp-comp">
                <Textarea id="imp-comp" rows={2} value={formData.complications} onChange={e => setFormData({ ...formData, complications: e.target.value })} />
              </Field>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit">{editingImplant ? 'Save Changes' : 'Add Implant'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Notes Dialog */}
        <Dialog
          open={showNotesModal && !!selectedImplant}
          onOpenChange={(o) => { if (!o) setShowNotesModal(false); }}
        >
          <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Notes - {selectedImplant?.name}</DialogTitle>
            </DialogHeader>

            {/* Add Note Form */}
            <form onSubmit={handleAddNote} className="flex flex-col gap-3 rounded-md border border-border p-3">
              <FormRow>
                <Field label="Note Type">
                  <Select value={noteFormData.note_type} onValueChange={(v) => setNoteFormData({ ...noteFormData, note_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="change">Change/Replacement</SelectItem>
                      <SelectItem value="complication">Complication</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="status_change">Status Change</SelectItem>
                      <SelectItem value="provider_note">Provider Note</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Provider (Optional)">
                  <Select
                    value={noteFormData.provider_id ? String(noteFormData.provider_id) : NONE}
                    onValueChange={(v) => setNoteFormData({ ...noteFormData, provider_id: v === NONE ? '' : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Provider</SelectItem>
                      {providers.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.title} {p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              {noteFormData.note_type === 'change' && (
                <div className="flex flex-col gap-2">
                  <label className="flex w-fit cursor-pointer items-center gap-2">
                    <Checkbox checked={noteFormData.was_changed} onCheckedChange={(v) => setNoteFormData({ ...noteFormData, was_changed: v === true })} />
                    <span className="text-sm text-foreground">Device was changed</span>
                  </label>
                  {noteFormData.was_changed && (
                    <FormRow>
                      <Input placeholder="Old Serial #" value={noteFormData.old_serial_number} onChange={e => setNoteFormData({ ...noteFormData, old_serial_number: e.target.value })} />
                      <Input placeholder="New Serial #" value={noteFormData.new_serial_number} onChange={e => setNoteFormData({ ...noteFormData, new_serial_number: e.target.value })} />
                    </FormRow>
                  )}
                </div>
              )}

              <Textarea value={noteFormData.content} onChange={e => setNoteFormData({ ...noteFormData, content: e.target.value })} placeholder="Enter note content..." rows={3} required />
              <div className="flex justify-end">
                <Button type="submit">Add Note</Button>
              </div>
            </form>

            {/* Notes List */}
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
              {implantNotes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                implantNotes.map(note => (
                  <div key={note.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{note.note_type.replace('_', ' ')}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleDeleteNote(note.id)}>
                        <TrashIcon size={12} />
                      </Button>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{note.content}</div>
                    {note.was_changed && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Changed: {note.old_serial_number} → {note.new_serial_number}
                      </div>
                    )}
                    {(note.provider_name || note.created_by_name) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {note.provider_name && <span>Provider: {note.provider_name}</span>}
                        {note.created_by_name && <span>By: {note.created_by_name}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Implants;
