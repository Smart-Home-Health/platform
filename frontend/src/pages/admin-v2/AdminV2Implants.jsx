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
import { useState, useEffect, useCallback } from 'react';
import AdminV2Layout from './AdminV2Layout';
import PatientGate from './components/PatientGate';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon, TrashIcon, NotesIcon, XIcon, HeartIcon, BodyIcon,
} from '../../components/Icons';
import { API_BASE_URL } from '../../config';
import EntityCard from '../../components/vc/EntityCard';
import EntityToolbar from '../../components/vc/EntityToolbar';
import EntityModal, { EmField, EmRow, EmSelect } from '../../components/vc/EntityModal';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

// Kept as the "no selection" option value so the placeholder is a real row.
const NONE = '__none__';

// EntityCard tag tones: accent | complete | due | idle.
const statusTone = (status) => (
  { active: 'complete', pending: 'due', replaced: 'accent', failed: 'due', expired: 'due' }[status] || 'idle'
);

// Section heading inside the implant form dialog.
function FormSection({ children }) {
  return <h4 className="cfg-group-title imp-form-section">{children}</h4>;
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

  // Same shape as the Diagnoses/Providers/Businesses helpers: a system admin
  // always passes (this page used to skip that check, which hid the Add
  // button from admins with no explicit grants).
  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    if (!user.permissions) return false;
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
          <PatientGate message="Choose a patient to manage implants." />
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

  // A function, not a shared array: rendering the same element instances into
  // two different <select> parents trips React's dev key validation.
  const providerOptions = () => providers.map(p => (
    <option key={p.id} value={String(p.id)}>
      {p.title} {p.first_name} {p.last_name} - {p.specialty}
    </option>
  ));

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {error && (
          <p className="em-error ec-page-alert" role="alert">
            <span className="em-alert-row">
              <span>{error}</span>
              <button type="button" className="em-dismiss" aria-label="Dismiss"
                      onClick={() => setError(null)}>
                <XIcon size={14} />
              </button>
            </span>
          </p>
        )}

        <EntityToolbar
          counts={[
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'inactive', label: 'Inactive', count: inactiveCount },
          ]}
          activeCount={activeTab}
          onCountChange={setActiveTab}
          search={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search implants…"
          filter={[
            {
              label: 'Type',
              value: typeFilter,
              onChange: setTypeFilter,
              options: [{ value: '', label: 'All Types' },
                        ...implantTypes.map(t => ({ value: t.value, label: t.label }))],
            },
            {
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [{ value: '', label: 'All Statuses' },
                        ...statuses.map(s => ({ value: s.value, label: s.label }))],
            },
          ]}
          onAdd={hasPermission('implants.create') ? () => handleOpenModal() : undefined}
          addLabel="Add Implant"
        />

        {loading ? (
          <p className="cfg-loading">Loading implants…</p>
        ) : filteredImplants.length === 0 ? (
          <div className="imp-empty">
            <p className="cfg-empty">
              {searchTerm
                ? 'No implants found matching your search.'
                : `No ${activeTab} implants found for this patient.`}
            </p>
            {activeTab === 'active' && hasPermission('implants.create') && !searchTerm && (
              <button type="button" className="em-submit" onClick={() => handleOpenModal()}>
                <PlusIcon size={16} /> Add First Implant
              </button>
            )}
          </div>
        ) : (
          <div className="ec-grid">
            {filteredImplants.map(implant => (
              <EntityCard
                key={implant.id}
                icon={implant.is_life_sustaining
                  ? <HeartIcon size={16} />
                  : <BodyIcon size={16} />}
                title={implant.name}
                inactive={!implant.active}
                badges={[
                  getTypeLabel(implant.implant_type),
                  ...(implant.mri_safe ? [`MRI: ${implant.mri_safe}`] : []),
                  ...(implant.is_life_sustaining ? ['Life sustaining'] : []),
                ]}
                tag={{ label: implant.status, tone: statusTone(implant.status) }}
                details={[
                  {
                    label: 'Location',
                    value: `${implant.body_location}${implant.body_side && implant.body_side !== 'n/a' ? ` (${implant.body_side})` : ''}`,
                  },
                  ...(implant.manufacturer ? [{ label: 'Manufacturer', value: implant.manufacturer }] : []),
                  ...(implant.model ? [{ label: 'Model', value: implant.model }] : []),
                  ...(implant.size ? [{ label: 'Size', value: implant.size }] : []),
                  ...(implant.serial_number ? [{ label: 'Serial #', value: implant.serial_number }] : []),
                  ...(implant.implant_date
                    ? [{ label: 'Implanted', value: new Date(implant.implant_date).toLocaleDateString() }] : []),
                  ...(implant.managing_provider_name
                    ? [{ label: 'Managed by', value: implant.managing_provider_name }] : []),
                  ...(implant.next_change_date
                    ? [{ label: 'Next change', value: new Date(implant.next_change_date).toLocaleDateString() }] : []),
                  /* EntityCard renders quickActions icon-only (label becomes the
                     tooltip), so the note count is shown here to stay visible. */
                  ...(implant.notes_count > 0
                    ? [{ label: 'Notes', value: implant.notes_count }] : []),
                ]}
                quickActions={[{
                  icon: <NotesIcon size={14} />,
                  label: `Notes${implant.notes_count > 0 ? ` (${implant.notes_count})` : ''}`,
                  onClick: () => handleOpenNotesModal(implant),
                }]}
                menu={[
                  ...(hasPermission('implants.update')
                    ? [{ label: 'Edit', onClick: () => handleOpenModal(implant) }] : []),
                  ...(hasPermission('implants.delete')
                    ? [{ label: 'Delete', onClick: () => handleDelete(implant), danger: true }] : []),
                ]}
              />
            ))}
          </div>
        )}

        <EntityModal
          open={showModal}
          onOpenChange={(o) => { if (!o) setShowModal(false); }}
          title={editingImplant ? 'Edit Implant' : 'Add Implant'}
          wide
        >
          <form onSubmit={handleSubmit} className="em-form">
            <FormSection>Basic Information</FormSection>
            <EmRow>
              <EmField label="Name" required htmlFor="imp-name">
                <input id="imp-name" className="em-input" value={formData.name} required
                       placeholder="e.g., Tracheostomy Tube"
                       onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </EmField>
              <EmField label="Type" required htmlFor="imp-type">
                <EmSelect id="imp-type" value={formData.implant_type}
                          onChange={e => setFormData({ ...formData, implant_type: e.target.value, category: '' })}>
                  {implantTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </EmSelect>
              </EmField>
            </EmRow>
            <EmRow>
              <EmField label="Category" htmlFor="imp-category">
                <EmSelect id="imp-category" value={formData.category || NONE}
                          onChange={e => setFormData({ ...formData, category: e.target.value === NONE ? '' : e.target.value })}>
                  <option value={NONE}>Select Category</option>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </EmSelect>
              </EmField>
              <EmField label="Status" htmlFor="imp-status">
                <EmSelect id="imp-status" value={formData.status}
                          onChange={e => setFormData({ ...formData, status: e.target.value })}>
                  {statuses.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                </EmSelect>
              </EmField>
            </EmRow>
            <EmField label="Description" htmlFor="imp-desc">
              <textarea id="imp-desc" className="em-input" rows={2} value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </EmField>

            <FormSection>Location</FormSection>
            <EmRow>
              <EmField label="Body Location" required htmlFor="imp-loc">
                <input id="imp-loc" className="em-input" value={formData.body_location} required
                       placeholder="e.g., Neck, Chest, Left Ear"
                       onChange={e => setFormData({ ...formData, body_location: e.target.value })} />
              </EmField>
              <EmField label="Side" htmlFor="imp-side">
                <EmSelect id="imp-side" value={formData.body_side || NONE}
                          onChange={e => setFormData({ ...formData, body_side: e.target.value === NONE ? '' : e.target.value })}>
                  <option value={NONE}>Select Side</option>
                  {bodySides.map(sd => <option key={sd.value} value={sd.value}>{sd.label}</option>)}
                </EmSelect>
              </EmField>
            </EmRow>

            <FormSection>Device Details</FormSection>
            <EmRow>
              <EmField label="Manufacturer" htmlFor="imp-mfr">
                <input id="imp-mfr" className="em-input" value={formData.manufacturer}
                       onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} />
              </EmField>
              <EmField label="Model" htmlFor="imp-model">
                <input id="imp-model" className="em-input" value={formData.model}
                       onChange={e => setFormData({ ...formData, model: e.target.value })} />
              </EmField>
            </EmRow>
            <EmRow>
              <EmField label="Serial Number" htmlFor="imp-serial">
                <input id="imp-serial" className="em-input" value={formData.serial_number}
                       onChange={e => setFormData({ ...formData, serial_number: e.target.value })} />
              </EmField>
              <EmField label="Size" htmlFor="imp-size">
                <input id="imp-size" className="em-input" value={formData.size}
                       placeholder="e.g., 6.0 cuffed, 14g"
                       onChange={e => setFormData({ ...formData, size: e.target.value })} />
              </EmField>
            </EmRow>
            <EmField label="Material" htmlFor="imp-material">
              <input id="imp-material" className="em-input" value={formData.material}
                     placeholder="e.g., Silicone, Titanium"
                     onChange={e => setFormData({ ...formData, material: e.target.value })} />
            </EmField>

            <FormSection>Dates</FormSection>
            <EmRow>
              <EmField label="Implant Date" htmlFor="imp-date">
                <input id="imp-date" className="em-input" type="date" value={formData.implant_date}
                       onChange={e => setFormData({ ...formData, implant_date: e.target.value })} />
              </EmField>
              <EmField label="Last Change Date" htmlFor="imp-last">
                <input id="imp-last" className="em-input" type="date" value={formData.last_change_date}
                       onChange={e => setFormData({ ...formData, last_change_date: e.target.value })} />
              </EmField>
            </EmRow>
            <EmRow>
              <EmField label="Next Change Date" htmlFor="imp-next">
                <input id="imp-next" className="em-input" type="date" value={formData.next_change_date}
                       onChange={e => setFormData({ ...formData, next_change_date: e.target.value })} />
              </EmField>
              <EmField label="Expiration Date" htmlFor="imp-exp">
                <input id="imp-exp" className="em-input" type="date" value={formData.expiration_date}
                       onChange={e => setFormData({ ...formData, expiration_date: e.target.value })} />
              </EmField>
            </EmRow>

            <FormSection>Providers &amp; Facility</FormSection>
            <EmRow>
              <EmField label="Implanting Provider" htmlFor="imp-implanting">
                <EmSelect id="imp-implanting"
                          value={formData.implanting_provider_id ? String(formData.implanting_provider_id) : NONE}
                          onChange={e => setFormData({ ...formData, implanting_provider_id: e.target.value === NONE ? '' : e.target.value })}>
                  <option value={NONE}>Select Provider</option>
                  {providerOptions()}
                </EmSelect>
              </EmField>
              <EmField label="Managing Provider" htmlFor="imp-managing">
                <EmSelect id="imp-managing"
                          value={formData.managing_provider_id ? String(formData.managing_provider_id) : NONE}
                          onChange={e => setFormData({ ...formData, managing_provider_id: e.target.value === NONE ? '' : e.target.value })}>
                  <option value={NONE}>Select Provider</option>
                  {providerOptions()}
                </EmSelect>
              </EmField>
            </EmRow>
            <EmRow>
              <EmField label="Facility Name" htmlFor="imp-fac">
                <input id="imp-fac" className="em-input" value={formData.facility_name}
                       onChange={e => setFormData({ ...formData, facility_name: e.target.value })} />
              </EmField>
              <EmField label="Facility Location" htmlFor="imp-facloc">
                <input id="imp-facloc" className="em-input" value={formData.facility_location}
                       placeholder="City, State"
                       onChange={e => setFormData({ ...formData, facility_location: e.target.value })} />
              </EmField>
            </EmRow>

            <FormSection>MRI Safety &amp; Flags</FormSection>
            <EmRow>
              <EmField label="MRI Safety" htmlFor="imp-mri">
                <EmSelect id="imp-mri" value={formData.mri_safe || NONE}
                          onChange={e => setFormData({ ...formData, mri_safe: e.target.value === NONE ? '' : e.target.value })}>
                  <option value={NONE}>Select MRI Safety</option>
                  {mriSafetyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </EmSelect>
              </EmField>
              <EmField label="MRI Notes" htmlFor="imp-mrinotes">
                <input id="imp-mrinotes" className="em-input" value={formData.mri_notes}
                       placeholder="Any MRI-specific conditions"
                       onChange={e => setFormData({ ...formData, mri_notes: e.target.value })} />
              </EmField>
            </EmRow>
            <div className="cfg-checks">
              <label className="em-check-row">
                <input type="checkbox" className="em-check" checked={formData.is_life_sustaining}
                       onChange={e => setFormData({ ...formData, is_life_sustaining: e.target.checked })} />
                <span className="em-check-label">Life Sustaining</span>
              </label>
              <label className="em-check-row">
                <input type="checkbox" className="em-check" checked={formData.requires_regular_change}
                       onChange={e => setFormData({ ...formData, requires_regular_change: e.target.checked })} />
                <span className="em-check-label">Requires Regular Change</span>
              </label>
            </div>
            {formData.requires_regular_change && (
              <EmField label="Change Frequency (days)" htmlFor="imp-freq">
                <input id="imp-freq" className="em-input" type="number" min="1"
                       value={formData.change_frequency_days}
                       onChange={e => setFormData({ ...formData, change_frequency_days: e.target.value })} />
              </EmField>
            )}

            <FormSection>Notes</FormSection>
            <EmField label="General Notes" htmlFor="imp-gnotes">
              <textarea id="imp-gnotes" className="em-input" rows={2} value={formData.notes}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </EmField>
            <EmField label="Care Instructions" htmlFor="imp-care">
              <textarea id="imp-care" className="em-input" rows={2} value={formData.care_instructions}
                        onChange={e => setFormData({ ...formData, care_instructions: e.target.value })} />
            </EmField>
            <EmField label="Complications History" htmlFor="imp-comp">
              <textarea id="imp-comp" className="em-input" rows={2} value={formData.complications}
                        onChange={e => setFormData({ ...formData, complications: e.target.value })} />
            </EmField>

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="em-submit">
                {editingImplant ? 'Save Changes' : 'Add Implant'}
              </button>
            </div>
          </form>
        </EntityModal>

        <EntityModal
          open={showNotesModal && !!selectedImplant}
          onOpenChange={(o) => { if (!o) setShowNotesModal(false); }}
          title={`Notes — ${selectedImplant?.name ?? ''}`}
        >
          <div className="em-form">
            <form onSubmit={handleAddNote} className="imp-note-form">
              <EmRow>
                <EmField label="Note Type" htmlFor="imp-note-type">
                  <EmSelect id="imp-note-type" value={noteFormData.note_type}
                            onChange={e => setNoteFormData({ ...noteFormData, note_type: e.target.value })}>
                    <option value="follow_up">Follow-up</option>
                    <option value="change">Change/Replacement</option>
                    <option value="complication">Complication</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="status_change">Status Change</option>
                    <option value="provider_note">Provider Note</option>
                  </EmSelect>
                </EmField>
                <EmField label="Provider (Optional)" htmlFor="imp-note-provider">
                  <EmSelect id="imp-note-provider"
                            value={noteFormData.provider_id ? String(noteFormData.provider_id) : NONE}
                            onChange={e => setNoteFormData({ ...noteFormData, provider_id: e.target.value === NONE ? '' : e.target.value })}>
                    <option value={NONE}>Select Provider</option>
                    {providers.map(pr => (
                      <option key={pr.id} value={String(pr.id)}>
                        {pr.title} {pr.first_name} {pr.last_name}
                      </option>
                    ))}
                  </EmSelect>
                </EmField>
              </EmRow>

              {noteFormData.note_type === 'change' && (
                <>
                  <label className="em-check-row">
                    <input type="checkbox" className="em-check" checked={noteFormData.was_changed}
                           onChange={e => setNoteFormData({ ...noteFormData, was_changed: e.target.checked })} />
                    <span className="em-check-label">Device was changed</span>
                  </label>
                  {noteFormData.was_changed && (
                    <EmRow>
                      <EmField label="Old Serial #" htmlFor="imp-note-old">
                        <input id="imp-note-old" className="em-input" value={noteFormData.old_serial_number}
                               onChange={e => setNoteFormData({ ...noteFormData, old_serial_number: e.target.value })} />
                      </EmField>
                      <EmField label="New Serial #" htmlFor="imp-note-new">
                        <input id="imp-note-new" className="em-input" value={noteFormData.new_serial_number}
                               onChange={e => setNoteFormData({ ...noteFormData, new_serial_number: e.target.value })} />
                      </EmField>
                    </EmRow>
                  )}
                </>
              )}

              <EmField label="Note" htmlFor="imp-note-content">
                <textarea id="imp-note-content" className="em-input" rows={3} required
                          placeholder="Enter note content…"
                          value={noteFormData.content}
                          onChange={e => setNoteFormData({ ...noteFormData, content: e.target.value })} />
              </EmField>
              <div className="cfg-actions end">
                <button type="submit" className="em-submit">Add Note</button>
              </div>
            </form>

            <div className="imp-note-list">
              {implantNotes.length === 0 ? (
                <p className="cfg-empty">No notes yet.</p>
              ) : (
                implantNotes.map(note => (
                  <article key={note.id} className="imp-note">
                    <header className="imp-note-head">
                      <span className="imp-note-tags">
                        <span className="cfg-badge">{note.note_type.replace('_', ' ')}</span>
                        <span className="imp-note-when">{new Date(note.created_at).toLocaleString()}</span>
                      </span>
                      <button type="button" className="cfg-iconbtn danger"
                              aria-label="Delete note" onClick={() => handleDeleteNote(note.id)}>
                        <TrashIcon size={12} />
                      </button>
                    </header>
                    <p className="imp-note-body">{note.content}</p>
                    {note.was_changed && (
                      <p className="imp-note-meta">
                        Changed: {note.old_serial_number} → {note.new_serial_number}
                      </p>
                    )}
                    {(note.provider_name || note.created_by_name) && (
                      <p className="imp-note-meta">
                        {note.provider_name && <span>Provider: {note.provider_name}</span>}
                        {note.created_by_name && <span>By: {note.created_by_name}</span>}
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        </EntityModal>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Implants;
