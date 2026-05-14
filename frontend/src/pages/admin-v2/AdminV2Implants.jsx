import React, { useState, useEffect, useCallback } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { useAuth } from '../../contexts/AuthContext';
import { PlusIcon, EditIcon, TrashIcon, NotesIcon, XIcon } from '../../components/Icons';
import { API_BASE_URL } from '../../config';
import './AdminV2.css';

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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    implant_type: 'medical',
    category: '',
    subcategory: '',
    body_location: '',
    body_side: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    size: '',
    material: '',
    implant_date: '',
    last_change_date: '',
    next_change_date: '',
    removal_date: '',
    expiration_date: '',
    implanting_provider_id: '',
    managing_provider_id: '',
    facility_name: '',
    facility_location: '',
    status: 'active',
    notes: '',
    care_instructions: '',
    complications: '',
    mri_safe: '',
    mri_notes: '',
    is_life_sustaining: false,
    requires_regular_change: false,
    change_frequency_days: '',
  });

  // Note form state
  const [noteFormData, setNoteFormData] = useState({
    note_type: 'follow_up',
    content: '',
    was_changed: false,
    old_serial_number: '',
    new_serial_number: '',
    provider_id: '',
  });

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
      setFormData({
        name: '',
        description: '',
        implant_type: 'medical',
        category: '',
        subcategory: '',
        body_location: '',
        body_side: '',
        manufacturer: '',
        model: '',
        serial_number: '',
        size: '',
        material: '',
        implant_date: '',
        last_change_date: '',
        next_change_date: '',
        removal_date: '',
        expiration_date: '',
        implanting_provider_id: '',
        managing_provider_id: '',
        facility_name: '',
        facility_location: '',
        status: 'active',
        notes: '',
        care_instructions: '',
        complications: '',
        mri_safe: '',
        mri_notes: '',
        is_life_sustaining: false,
        requires_regular_change: false,
        change_frequency_days: '',
      });
    }
    setShowModal(true);
  };

  const handleOpenNotesModal = async (implant) => {
    setSelectedImplant(implant);
    await fetchNotes(implant);
    setNoteFormData({
      note_type: 'follow_up',
      content: '',
      was_changed: false,
      old_serial_number: '',
      new_serial_number: '',
      provider_id: '',
    });
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
      setNoteFormData({
        note_type: 'follow_up',
        content: '',
        was_changed: false,
        old_serial_number: '',
        new_serial_number: '',
        provider_id: '',
      });
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

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active': return 'admin-v2-badge admin-v2-badge-success';
      case 'pending': return 'admin-v2-badge admin-v2-badge-warning';
      case 'removed': return 'admin-v2-badge admin-v2-badge-muted';
      case 'replaced': return 'admin-v2-badge admin-v2-badge-info';
      case 'failed': return 'admin-v2-badge admin-v2-badge-danger';
      case 'expired': return 'admin-v2-badge admin-v2-badge-warning';
      default: return 'admin-v2-badge';
    }
  };

  const getMRIBadgeClass = (mriSafe) => {
    switch (mriSafe) {
      case 'safe': return 'admin-v2-badge admin-v2-badge-success';
      case 'conditional': return 'admin-v2-badge admin-v2-badge-warning';
      case 'unsafe': return 'admin-v2-badge admin-v2-badge-danger';
      default: return 'admin-v2-badge admin-v2-badge-muted';
    }
  };

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <h1 className="schedule-section-title">Implants & Devices</h1>
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

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <h1 className="schedule-section-title">Implants & Devices</h1>

        {error && (
          <div className="admin-v2-error-banner">
            {error}
            <button onClick={() => setError(null)}><XIcon size={14} /></button>
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
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              className="admin-v2-filter-select"
            >
              <option value="">All Types</option>
              {implantTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-v2-filter-select"
            >
              <option value="">All Statuses</option>
              {statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {hasPermission('implants.create') && (
            <button className="admin-v2-btn admin-v2-btn-primary" onClick={() => handleOpenModal()}>
              <PlusIcon size={16} /> Add Implant
            </button>
          )}
        </div>

        {loading ? (
          <div className="admin-v2-loading">Loading implants...</div>
        ) : filteredImplants.length === 0 ? (
          <div className="admin-v2-empty-state">
            <p>{searchTerm ? 'No implants found matching your search.' : `No ${activeTab} implants found for this patient.`}</p>
            {activeTab === 'active' && hasPermission('implants.create') && !searchTerm && (
              <button className="admin-v2-btn admin-v2-btn-primary" onClick={() => handleOpenModal()}>
                <PlusIcon size={16} /> Add First Implant
              </button>
            )}
          </div>
        ) : (
          <div className="admin-v2-cards-grid">
            {filteredImplants.map(implant => (
              <div key={implant.id} className={`admin-v2-card ${implant.is_life_sustaining ? 'life-sustaining' : ''} ${!implant.active ? 'inactive' : ''}`}>
                <div className="admin-v2-card-header">
                  <div className="admin-v2-card-title">
                    {implant.is_life_sustaining && <span className="life-sustaining-icon" title="Life Sustaining">❤️</span>}
                    {implant.name}
                  </div>
                  <div className="admin-v2-card-actions">
                    <button 
                      className="admin-v2-action-btn admin-v2-action-btn-notes" 
                      onClick={() => handleOpenNotesModal(implant)}
                      title="Notes"
                    >
                      <NotesIcon size={14} />
                      {implant.notes_count > 0 && <span className="notes-count">{implant.notes_count}</span>}
                    </button>
                    {hasPermission('implants.update') && (
                      <button className="admin-v2-action-btn" onClick={() => handleOpenModal(implant)} title="Edit">
                        <EditIcon size={14} />
                      </button>
                    )}
                    {hasPermission('implants.delete') && (
                      <button className="admin-v2-action-btn admin-v2-action-btn-danger" onClick={() => handleDelete(implant)} title="Delete">
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="admin-v2-card-body">
                  <div className="admin-v2-card-badges">
                    <span className="admin-v2-badge admin-v2-badge-info">{getTypeLabel(implant.implant_type)}</span>
                    <span className={getStatusBadgeClass(implant.status)}>{implant.status}</span>
                    {implant.mri_safe && (
                      <span className={getMRIBadgeClass(implant.mri_safe)}>MRI: {implant.mri_safe}</span>
                    )}
                  </div>
                  
                  <div className="admin-v2-card-row">
                    <span className="label">Location:</span>
                    <span className="value">{implant.body_location}{implant.body_side && implant.body_side !== 'n/a' ? ` (${implant.body_side})` : ''}</span>
                  </div>
                  
                  {implant.manufacturer && (
                    <div className="admin-v2-card-row">
                      <span className="label">Manufacturer:</span>
                      <span className="value">{implant.manufacturer}</span>
                    </div>
                  )}
                  
                  {implant.model && (
                    <div className="admin-v2-card-row">
                      <span className="label">Model:</span>
                      <span className="value">{implant.model}</span>
                    </div>
                  )}
                  
                  {implant.size && (
                    <div className="admin-v2-card-row">
                      <span className="label">Size:</span>
                      <span className="value">{implant.size}</span>
                    </div>
                  )}
                  
                  {implant.serial_number && (
                    <div className="admin-v2-card-row">
                      <span className="label">Serial #:</span>
                      <span className="value mono">{implant.serial_number}</span>
                    </div>
                  )}
                  
                  {implant.implant_date && (
                    <div className="admin-v2-card-row">
                      <span className="label">Implanted:</span>
                      <span className="value">{new Date(implant.implant_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  
                  {implant.managing_provider_name && (
                    <div className="admin-v2-card-row">
                      <span className="label">Managed by:</span>
                      <span className="value">{implant.managing_provider_name}</span>
                    </div>
                  )}
                  
                  {implant.next_change_date && (
                    <div className="admin-v2-card-row">
                      <span className="label">Next Change:</span>
                      <span className="value">{new Date(implant.next_change_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Implant Modal */}
        {showModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-large" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>{editingImplant ? 'Edit Implant' : 'Add Implant'}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowModal(false)}>
                  <XIcon size={18} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="admin-v2-modal-form">
                <div className="admin-v2-form-grid">
                  {/* Basic Info */}
                  <div className="admin-v2-form-section full-width">
                    <h3>Basic Information</h3>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., Tracheostomy Tube"
                      required
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Type *</label>
                    <select
                      value={formData.implant_type}
                      onChange={e => setFormData({...formData, implant_type: e.target.value, category: ''})}
                      required
                    >
                      {implantTypes.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Category</label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      <option value="">Select Category</option>
                      {categories.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value})}
                    >
                      {statuses.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-group full-width">
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      rows={2}
                    />
                  </div>
                  
                  {/* Location */}
                  <div className="admin-v2-form-section full-width">
                    <h3>Location</h3>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Body Location *</label>
                    <input
                      type="text"
                      value={formData.body_location}
                      onChange={e => setFormData({...formData, body_location: e.target.value})}
                      placeholder="e.g., Neck, Chest, Left Ear"
                      required
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Side</label>
                    <select
                      value={formData.body_side}
                      onChange={e => setFormData({...formData, body_side: e.target.value})}
                    >
                      <option value="">Select Side</option>
                      {bodySides.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Device Details */}
                  <div className="admin-v2-form-section full-width">
                    <h3>Device Details</h3>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Manufacturer</label>
                    <input
                      type="text"
                      value={formData.manufacturer}
                      onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Model</label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={e => setFormData({...formData, model: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Serial Number</label>
                    <input
                      type="text"
                      value={formData.serial_number}
                      onChange={e => setFormData({...formData, serial_number: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Size</label>
                    <input
                      type="text"
                      value={formData.size}
                      onChange={e => setFormData({...formData, size: e.target.value})}
                      placeholder="e.g., 6.0 cuffed, 14g"
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Material</label>
                    <input
                      type="text"
                      value={formData.material}
                      onChange={e => setFormData({...formData, material: e.target.value})}
                      placeholder="e.g., Silicone, Titanium"
                    />
                  </div>
                  
                  {/* Dates */}
                  <div className="admin-v2-form-section full-width">
                    <h3>Dates</h3>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Implant Date</label>
                    <input
                      type="date"
                      value={formData.implant_date}
                      onChange={e => setFormData({...formData, implant_date: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Last Change Date</label>
                    <input
                      type="date"
                      value={formData.last_change_date}
                      onChange={e => setFormData({...formData, last_change_date: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Next Change Date</label>
                    <input
                      type="date"
                      value={formData.next_change_date}
                      onChange={e => setFormData({...formData, next_change_date: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Expiration Date</label>
                    <input
                      type="date"
                      value={formData.expiration_date}
                      onChange={e => setFormData({...formData, expiration_date: e.target.value})}
                    />
                  </div>
                  
                  {/* Providers */}
                  <div className="admin-v2-form-section full-width">
                    <h3>Providers & Facility</h3>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Implanting Provider</label>
                    <select
                      value={formData.implanting_provider_id}
                      onChange={e => setFormData({...formData, implanting_provider_id: e.target.value})}
                    >
                      <option value="">Select Provider</option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.first_name} {p.last_name} - {p.specialty}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Managing Provider</label>
                    <select
                      value={formData.managing_provider_id}
                      onChange={e => setFormData({...formData, managing_provider_id: e.target.value})}
                    >
                      <option value="">Select Provider</option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.first_name} {p.last_name} - {p.specialty}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Facility Name</label>
                    <input
                      type="text"
                      value={formData.facility_name}
                      onChange={e => setFormData({...formData, facility_name: e.target.value})}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Facility Location</label>
                    <input
                      type="text"
                      value={formData.facility_location}
                      onChange={e => setFormData({...formData, facility_location: e.target.value})}
                      placeholder="City, State"
                    />
                  </div>
                  
                  {/* MRI & Safety */}
                  <div className="admin-v2-form-section full-width">
                    <h3>MRI Safety & Flags</h3>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>MRI Safety</label>
                    <select
                      value={formData.mri_safe}
                      onChange={e => setFormData({...formData, mri_safe: e.target.value})}
                    >
                      <option value="">Select MRI Safety</option>
                      {mriSafetyOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>MRI Notes</label>
                    <input
                      type="text"
                      value={formData.mri_notes}
                      onChange={e => setFormData({...formData, mri_notes: e.target.value})}
                      placeholder="Any MRI-specific conditions"
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label className="admin-v2-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.is_life_sustaining}
                        onChange={e => setFormData({...formData, is_life_sustaining: e.target.checked})}
                      />
                      Life Sustaining
                    </label>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label className="admin-v2-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.requires_regular_change}
                        onChange={e => setFormData({...formData, requires_regular_change: e.target.checked})}
                      />
                      Requires Regular Change
                    </label>
                  </div>
                  
                  {formData.requires_regular_change && (
                    <div className="admin-v2-form-group">
                      <label>Change Frequency (days)</label>
                      <input
                        type="number"
                        value={formData.change_frequency_days}
                        onChange={e => setFormData({...formData, change_frequency_days: e.target.value})}
                        min="1"
                      />
                    </div>
                  )}
                  
                  {/* Notes */}
                  <div className="admin-v2-form-section full-width">
                    <h3>Notes</h3>
                  </div>
                  
                  <div className="admin-v2-form-group full-width">
                    <label>General Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      rows={2}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group full-width">
                    <label>Care Instructions</label>
                    <textarea
                      value={formData.care_instructions}
                      onChange={e => setFormData({...formData, care_instructions: e.target.value})}
                      rows={2}
                    />
                  </div>
                  
                  <div className="admin-v2-form-group full-width">
                    <label>Complications History</label>
                    <textarea
                      value={formData.complications}
                      onChange={e => setFormData({...formData, complications: e.target.value})}
                      rows={2}
                    />
                  </div>
                </div>
                
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn admin-v2-btn-secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary">
                    {editingImplant ? 'Save Changes' : 'Add Implant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Notes Modal */}
        {showNotesModal && selectedImplant && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowNotesModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-medium" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Notes - {selectedImplant.name}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowNotesModal(false)}>
                  <XIcon size={18} />
                </button>
              </div>
              
              <div className="admin-v2-modal-body">
                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="admin-v2-notes-form">
                  <div className="admin-v2-form-row">
                    <select
                      value={noteFormData.note_type}
                      onChange={e => setNoteFormData({...noteFormData, note_type: e.target.value})}
                      className="admin-v2-input-sm"
                    >
                      <option value="follow_up">Follow-up</option>
                      <option value="change">Change/Replacement</option>
                      <option value="complication">Complication</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="status_change">Status Change</option>
                      <option value="provider_note">Provider Note</option>
                    </select>
                    
                    <select
                      value={noteFormData.provider_id}
                      onChange={e => setNoteFormData({...noteFormData, provider_id: e.target.value})}
                      className="admin-v2-input-sm"
                    >
                      <option value="">Select Provider (optional)</option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.first_name} {p.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {noteFormData.note_type === 'change' && (
                    <div className="admin-v2-form-row">
                      <label className="admin-v2-checkbox-label">
                        <input
                          type="checkbox"
                          checked={noteFormData.was_changed}
                          onChange={e => setNoteFormData({...noteFormData, was_changed: e.target.checked})}
                        />
                        Device was changed
                      </label>
                      {noteFormData.was_changed && (
                        <>
                          <input
                            type="text"
                            placeholder="Old Serial #"
                            value={noteFormData.old_serial_number}
                            onChange={e => setNoteFormData({...noteFormData, old_serial_number: e.target.value})}
                            className="admin-v2-input-sm"
                          />
                          <input
                            type="text"
                            placeholder="New Serial #"
                            value={noteFormData.new_serial_number}
                            onChange={e => setNoteFormData({...noteFormData, new_serial_number: e.target.value})}
                            className="admin-v2-input-sm"
                          />
                        </>
                      )}
                    </div>
                  )}
                  
                  <textarea
                    value={noteFormData.content}
                    onChange={e => setNoteFormData({...noteFormData, content: e.target.value})}
                    placeholder="Enter note content..."
                    rows={3}
                    required
                  />
                  
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary">
                    Add Note
                  </button>
                </form>
                
                {/* Notes List */}
                <div className="admin-v2-notes-list">
                  {implantNotes.length === 0 ? (
                    <p className="admin-v2-notes-empty">No notes yet.</p>
                  ) : (
                    implantNotes.map(note => (
                      <div key={note.id} className="admin-v2-note-item">
                        <div className="admin-v2-note-header">
                          <span className="admin-v2-note-type">{note.note_type.replace('_', ' ')}</span>
                          <span className="admin-v2-note-date">
                            {new Date(note.created_at).toLocaleString()}
                          </span>
                          <button 
                            className="admin-v2-note-delete"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                        <div className="admin-v2-note-content">{note.content}</div>
                        {note.was_changed && (
                          <div className="admin-v2-note-change-info">
                            Changed: {note.old_serial_number} → {note.new_serial_number}
                          </div>
                        )}
                        {(note.provider_name || note.created_by_name) && (
                          <div className="admin-v2-note-meta">
                            {note.provider_name && <span>Provider: {note.provider_name}</span>}
                            {note.created_by_name && <span>By: {note.created_by_name}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Implants;
