import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  XIcon,
  EquipmentIcon,
  CheckIcon,
  AlertIcon,
  ChevronLeftIcon
} from '../../components/Icons';
import './AdminV2.css';

const CONDITION_OPTIONS = [
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'short', label: 'Short (Missing)' },
  { value: 'extra', label: 'Extra (Unexpected)' },
];

const AdminV2ShipmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  const selectedPatient = contextPatient;

  // Shipment data
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Equipment list for adding items
  const [equipment, setEquipment] = useState([]);
  
  // Add Item Modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemFormData, setItemFormData] = useState({
    equipment_id: '',
    item_number: '',
    manufacturer_name: '',
    qty_ordered: 1,
    qty_shipped: 0,
    qty_backordered: 0,
    unit_of_measure: '',
    unit_description: ''
  });
  const [itemFormError, setItemFormError] = useState(null);
  const [savingItem, setSavingItem] = useState(false);
  
  // Receiving state - one entry per item
  const [receiveData, setReceiveData] = useState({});
  const [savingReceive, setSavingReceive] = useState(false);
  
  // Receiving mode - edit all items at once
  const [receivingMode, setReceivingMode] = useState(false);
  const [itemEdits, setItemEdits] = useState({});
  const [savingItems, setSavingItems] = useState(false);
  
  // Draft editing state
  const [draftEdits, setDraftEdits] = useState({});
  const [savingDraft, setSavingDraft] = useState(false);
  
  // Finalize state
  const [finalizing, setFinalizing] = useState(false);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Set patient context from URL
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    }
  }, [searchParams, patients]);

  // Fetch shipment details
  useEffect(() => {
    if (id) {
      fetchShipment();
      fetchEquipment();
    }
  }, [id]);

  const fetchShipment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setShipment(data);
        
        // Initialize receive data for items not yet fully received
        const initialReceiveData = {};
        (data.items || []).forEach(item => {
          const totalReceived = (item.receipts || []).reduce((sum, r) => sum + r.qty_received, 0);
          const remaining = item.qty_shipped - totalReceived;
          if (remaining > 0) {
            initialReceiveData[item.id] = {
              qty_received: remaining,
              condition: 'good',
              lot_number: '',
              expiration_date: '',
              discrepancy_notes: ''
            };
          }
        });
        setReceiveData(initialReceiveData);
      } else {
        setError('Shipment not found');
      }
    } catch (err) {
      setError('Error loading shipment');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipment = async () => {
    if (!selectedPatient) return;
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment?patient_id=${selectedPatient.id}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setEquipment(data.equipment || data || []);
      }
    } catch (err) {
      console.error('Error fetching equipment:', err);
    }
  };

  // Update equipment when patient context is set
  useEffect(() => {
    if (selectedPatient) {
      fetchEquipment();
    }
  }, [selectedPatient]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    setSavingItem(true);
    setItemFormError(null);
    
    try {
      const payload = {
        ...itemFormData,
        equipment_id: itemFormData.equipment_id ? parseInt(itemFormData.equipment_id) : null,
        qty_ordered: parseInt(itemFormData.qty_ordered) || 0,
        qty_shipped: parseInt(itemFormData.qty_shipped) || 0,
        qty_backordered: parseInt(itemFormData.qty_backordered) || 0
      };
      
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setShowAddItemModal(false);
        setItemFormData({
          equipment_id: '',
          item_number: '',
          manufacturer_name: '',
          qty_ordered: 1,
          qty_shipped: 0,
          qty_backordered: 0,
          unit_of_measure: '',
          unit_description: ''
        });
        fetchShipment();
      } else {
        const errData = await response.json();
        setItemFormError(errData.error || 'Failed to add item');
      }
    } catch (err) {
      setItemFormError('Error connecting to server');
    } finally {
      setSavingItem(false);
    }
  };

  const handleReceiveItem = async (itemId) => {
    const data = receiveData[itemId];
    if (!data) return;
    
    setSavingReceive(true);
    
    try {
      const payload = {
        shipment_item_id: itemId,
        qty_received: parseInt(data.qty_received) || 0,
        condition: data.condition,
        lot_number: data.lot_number || null,
        expiration_date: data.expiration_date || null,
        discrepancy_notes: data.discrepancy_notes || null
      };
      
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        fetchShipment();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to record receipt');
      }
    } catch (err) {
      console.error('Error receiving item:', err);
      alert('Error connecting to server');
    } finally {
      setSavingReceive(false);
    }
  };

  const handleMarkAsOrdered = async () => {
    if (!window.confirm('Mark this shipment as Ordered? You can still edit items after marking as ordered.')) {
      return;
    }
    
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'ordered' })
      });
      
      if (response.ok) {
        fetchShipment();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to update shipment status');
      }
    } catch (err) {
      console.error('Error updating shipment:', err);
      alert('Error connecting to server');
    }
  };

  const updateDraftField = (field, value) => {
    setDraftEdits(prev => ({ ...prev, [field]: value }));
  };

  const saveDraftField = async (field) => {
    const value = draftEdits[field];
    if (value === undefined) return;
    
    setSavingDraft(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value || null })
      });
      
      if (response.ok) {
        fetchShipment();
        // Clear the edit for this field
        setDraftEdits(prev => {
          const { [field]: _, ...rest } = prev;
          return rest;
        });
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Error saving field:', err);
      alert('Error connecting to server');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleBeginReceiving = async () => {
    // Pre-fill item edits assuming order is OK
    const edits = {};
    (shipment.items || []).forEach(item => {
      edits[item.id] = {
        qty_shipped: item.qty_ordered,
        qty_backordered: 0,
        qty_received: item.qty_ordered
      };
    });
    setItemEdits(edits);
    setReceivingMode(true);
    
    // Update status to receiving
    try {
      await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'receiving' })
      });
      fetchShipment();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const updateItemEdit = (itemId, field, value) => {
    setItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: parseInt(value) || 0
      }
    }));
  };

  const handleSaveReceiving = async () => {
    setSavingItems(true);
    
    try {
      // Update each item's quantities
      for (const [itemId, edits] of Object.entries(itemEdits)) {
        await fetch(`${config.apiUrl}/api/shipments/${id}/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            qty_shipped: edits.qty_shipped,
            qty_backordered: edits.qty_backordered
          })
        });
        
        // Record receipt for received quantity
        if (edits.qty_received > 0) {
          await fetch(`${config.apiUrl}/api/shipments/${id}/receive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              shipment_item_id: parseInt(itemId),
              qty_received: edits.qty_received,
              condition: 'good'
            })
          });
        }
      }
      
      // Update status to complete
      await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'complete' })
      });
      
      setReceivingMode(false);
      setItemEdits({});
      fetchShipment();
    } catch (err) {
      console.error('Error saving receiving data:', err);
      alert('Error saving changes');
    } finally {
      setSavingItems(false);
    }
  };

  const handleFinalizeShipment = async () => {
    if (!window.confirm('Finalize this shipment? This will create backorder shipments and alerts for any discrepancies.')) {
      return;
    }
    
    setFinalizing(true);
    
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        fetchShipment();
        
        // Show summary of what was created
        let msg = 'Shipment finalized!';
        if (result.backorder_shipment_id) {
          msg += `\nBackorder shipment #${result.backorder_shipment_id} created.`;
        }
        if (result.alerts_created > 0) {
          msg += `\n${result.alerts_created} alert(s) created for discrepancies.`;
        }
        alert(msg);
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to finalize shipment');
      }
    } catch (err) {
      console.error('Error finalizing shipment:', err);
      alert('Error connecting to server');
    } finally {
      setFinalizing(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'admin-v2-badge-warning';
      case 'ordered': return 'admin-v2-badge-secondary';
      case 'shipped': return 'admin-v2-badge-info';
      case 'receiving': return 'admin-v2-badge-warning';
      case 'complete': return 'admin-v2-badge-success';
      case 'partial': return 'admin-v2-badge-danger';
      case 'verified': return 'admin-v2-badge-success';
      default: return 'admin-v2-badge-secondary';
    }
  };

  const getConditionBadgeClass = (condition) => {
    switch (condition) {
      case 'good': return 'admin-v2-badge-success';
      case 'damaged': return 'admin-v2-badge-danger';
      case 'wrong_item': return 'admin-v2-badge-danger';
      case 'short': return 'admin-v2-badge-warning';
      case 'extra': return 'admin-v2-badge-info';
      default: return 'admin-v2-badge-secondary';
    }
  };

  const updateReceiveData = (itemId, field, value) => {
    setReceiveData(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  // Calculate item stats
  const getItemStats = (item) => {
    const totalReceived = (item.receipts || []).reduce((sum, r) => sum + r.qty_received, 0);
    const remaining = item.qty_shipped - totalReceived;
    return { totalReceived, remaining };
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading shipment...</div>
      </AdminV2Layout>
    );
  }

  if (error || !shipment) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-error">{error || 'Shipment not found'}</div>
          <button 
            className="admin-v2-btn" 
            onClick={() => navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`)}
          >
            <ChevronLeftIcon size={16} /> Back to Shipments
          </button>
        </div>
      </AdminV2Layout>
    );
  }

  const isDraft = shipment.status === 'draft';
  const isOrdered = shipment.status === 'ordered';
  const canMarkOrdered = isDraft && shipment.items?.length > 0;
  const canBeginReceiving = isOrdered && shipment.items?.length > 0;
  const canReceive = ['shipped', 'receiving'].includes(shipment.status);
  const canFinalize = ['receiving'].includes(shipment.status) && shipment.items?.length > 0;
  const isFinalized = ['complete', 'partial', 'verified'].includes(shipment.status);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Back Button & Header */}
        <div className="admin-v2-page-header">
          <button 
            className="admin-v2-btn admin-v2-btn-ghost"
            onClick={() => navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`)}
          >
            <ChevronLeftIcon size={16} /> Back
          </button>
        </div>

        {/* Shipment Header */}
        <div className="admin-v2-detail-header">
          <div className="admin-v2-detail-title">
            <h1>
              {shipment.order_number || shipment.po_number || `Shipment #${shipment.id}`}
              {shipment.is_backorder && (
                <span className="admin-v2-badge admin-v2-badge-warning" style={{ marginLeft: '12px' }}>
                  Backorder
                </span>
              )}
            </h1>
            <span className={`admin-v2-badge ${getStatusBadgeClass(shipment.status)}`}>
              {shipment.status}
            </span>
          </div>
          <div className="admin-v2-detail-meta">
            <span><strong>Supplier:</strong> {shipment.supplier_name || '-'}</span>
            {isDraft ? (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>PO:</strong>
                  <input
                    type="text"
                    value={draftEdits.po_number ?? shipment.po_number ?? ''}
                    onChange={e => updateDraftField('po_number', e.target.value)}
                    onBlur={() => saveDraftField('po_number')}
                    placeholder="Enter PO #"
                    style={{ width: '120px', padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Order #:</strong>
                  <input
                    type="text"
                    value={draftEdits.order_number ?? shipment.order_number ?? ''}
                    onChange={e => updateDraftField('order_number', e.target.value)}
                    onBlur={() => saveDraftField('order_number')}
                    placeholder="Enter Order #"
                    style={{ width: '120px', padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Ship Date:</strong>
                  <input
                    type="date"
                    value={draftEdits.ship_date ?? (shipment.ship_date ? shipment.ship_date.split('T')[0] : '')}
                    onChange={e => updateDraftField('ship_date', e.target.value)}
                    onBlur={() => saveDraftField('ship_date')}
                    style={{ padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Expected:</strong>
                  <input
                    type="date"
                    value={draftEdits.expected_delivery ?? (shipment.expected_delivery ? shipment.expected_delivery.split('T')[0] : '')}
                    onChange={e => updateDraftField('expected_delivery', e.target.value)}
                    onBlur={() => saveDraftField('expected_delivery')}
                    style={{ padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Tracking:</strong>
                  <input
                    type="text"
                    value={draftEdits.tracking_number ?? shipment.tracking_number ?? ''}
                    onChange={e => updateDraftField('tracking_number', e.target.value)}
                    onBlur={() => saveDraftField('tracking_number')}
                    placeholder="Enter tracking #"
                    style={{ width: '150px', padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
              </>
            ) : (
              <>
                <span><strong>PO:</strong> {shipment.po_number || '-'}</span>
                <span><strong>Ship Date:</strong> {formatDate(shipment.ship_date)}</span>
                <span><strong>Expected:</strong> {formatDate(shipment.expected_delivery)}</span>
                {shipment.tracking_number && (
                  <span><strong>Tracking:</strong> {shipment.tracking_number}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Alerts Section */}
        {shipment.alerts && shipment.alerts.length > 0 && (
          <div className="admin-v2-alerts-section">
            <h3><AlertIcon size={16} /> Alerts</h3>
            <div className="admin-v2-alerts-list">
              {shipment.alerts.map(alert => (
                <div key={alert.id} className={`admin-v2-alert-item ${alert.resolved ? 'resolved' : ''}`}>
                  <span className="admin-v2-badge admin-v2-badge-danger">{alert.alert_type}</span>
                  <span>{alert.equipment_name || alert.item_number || 'Item'}</span>
                  <span>Expected: {alert.expected_qty}, Actual: {alert.actual_qty}</span>
                  {alert.resolved && <span className="admin-v2-badge admin-v2-badge-success">Resolved</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Draft Status Notice */}
        {isDraft && (
          <div className="admin-v2-info-banner">
            <div className="admin-v2-info-content">
              <strong>Draft Shipment</strong>
              <p>Add items to this shipment, then mark it as Ordered when ready.</p>
            </div>
            {hasPermission('equipment.edit') && canMarkOrdered && (
              <button
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={handleMarkAsOrdered}
              >
                <CheckIcon size={16} /> Mark as Ordered
              </button>
            )}
          </div>
        )}

        {/* Ordered Status Notice - Begin Receiving */}
        {isOrdered && (
          <div className="admin-v2-info-banner">
            <div className="admin-v2-info-content">
              <strong>Order Placed</strong>
              <p>When the shipment arrives, begin receiving to record quantities.</p>
            </div>
            {hasPermission('equipment.edit') && canBeginReceiving && (
              <button
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={handleBeginReceiving}
              >
                <CheckIcon size={16} /> Begin Receiving
              </button>
            )}
          </div>
        )}

        {/* Receiving Mode Banner */}
        {receivingMode && (
          <div className="admin-v2-info-banner" style={{ background: 'var(--admin-info-bg, #e3f2fd)', borderColor: 'var(--admin-info-border, #90caf9)' }}>
            <div className="admin-v2-info-content">
              <strong>Receiving in Progress</strong>
              <p>Update shipped, backordered, and received quantities below. Click Save to record changes.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="admin-v2-btn admin-v2-btn-secondary"
                onClick={() => setReceivingMode(false)}
                disabled={savingItems}
              >
                Cancel
              </button>
              <button
                className="admin-v2-btn admin-v2-btn-success"
                onClick={handleSaveReceiving}
                disabled={savingItems}
              >
                {savingItems ? 'Saving...' : 'Save & Finalize'}
              </button>
            </div>
          </div>
        )}

        {/* Items Section */}
        <div className="admin-v2-section">
          <div className="admin-v2-section-header">
            <h2>Items</h2>
            {hasPermission('equipment.edit') && !isFinalized && (
              <button
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={() => setShowAddItemModal(true)}
              >
                <PlusIcon size={16} /> Add Item
              </button>
            )}
          </div>

          {shipment.items && shipment.items.length > 0 ? (
            <div className="admin-v2-table-container">
              <table className="admin-v2-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Manufacturer</th>
                    <th style={{ textAlign: 'center' }}>Ordered</th>
                    <th style={{ textAlign: 'center' }}>Shipped</th>
                    <th style={{ textAlign: 'center' }}>B/O</th>
                    <th style={{ textAlign: 'center' }}>Received</th>
                    {canReceive && !receivingMode && <th>Receive</th>}
                  </tr>
                </thead>
                <tbody>
                  {shipment.items.map(item => {
                    const { totalReceived, remaining } = getItemStats(item);
                    const receiveEntry = receiveData[item.id];
                    const itemEdit = itemEdits[item.id] || {};
                    
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.item_number || '-'}</strong>
                          {item.equipment_name && <div className="admin-v2-text-muted">{item.equipment_name}</div>}
                          {item.unit_description && <div className="admin-v2-text-small">{item.unit_description}</div>}
                        </td>
                        <td>{item.manufacturer_name || '-'}</td>
                        <td style={{ textAlign: 'center' }}>{item.qty_ordered}</td>
                        <td style={{ textAlign: 'center' }}>
                          {receivingMode ? (
                            <input
                              type="number"
                              min="0"
                              value={itemEdit.qty_shipped ?? item.qty_shipped ?? 0}
                              onChange={e => updateItemEdit(item.id, 'qty_shipped', parseInt(e.target.value) || 0)}
                              style={{ width: '60px', textAlign: 'center' }}
                            />
                          ) : (
                            item.qty_shipped
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {receivingMode ? (
                            <input
                              type="number"
                              min="0"
                              value={itemEdit.qty_backordered ?? item.qty_backordered ?? 0}
                              onChange={e => updateItemEdit(item.id, 'qty_backordered', parseInt(e.target.value) || 0)}
                              style={{ width: '60px', textAlign: 'center' }}
                            />
                          ) : (
                            item.qty_backordered > 0 ? (
                              <span className="admin-v2-badge admin-v2-badge-warning">{item.qty_backordered}</span>
                            ) : '-'
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {receivingMode ? (
                            <input
                              type="number"
                              min="0"
                              value={itemEdit.qty_received ?? totalReceived ?? 0}
                              onChange={e => updateItemEdit(item.id, 'qty_received', parseInt(e.target.value) || 0)}
                              style={{ width: '60px', textAlign: 'center' }}
                            />
                          ) : (
                            totalReceived > 0 ? (
                              <span className={totalReceived >= item.qty_shipped ? 'admin-v2-text-success' : ''}>
                                {totalReceived} / {item.qty_shipped}
                              </span>
                            ) : '-'
                          )}
                        </td>
                        {canReceive && !receivingMode && (
                          <td>
                            {remaining > 0 && receiveEntry ? (
                              <div className="admin-v2-receive-form">
                                <div className="admin-v2-receive-row">
                                  <input
                                    type="number"
                                    min="0"
                                    max={remaining}
                                    value={receiveEntry.qty_received}
                                    onChange={e => updateReceiveData(item.id, 'qty_received', e.target.value)}
                                    style={{ width: '60px' }}
                                  />
                                  <select
                                    value={receiveEntry.condition}
                                    onChange={e => updateReceiveData(item.id, 'condition', e.target.value)}
                                    style={{ width: '100px' }}
                                  >
                                    {CONDITION_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                  <button
                                    className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-success"
                                    onClick={() => handleReceiveItem(item.id)}
                                    disabled={savingReceive}
                                  >
                                    <CheckIcon size={14} />
                                  </button>
                                </div>
                                {receiveEntry.condition !== 'good' && (
                                  <input
                                    type="text"
                                    placeholder="Discrepancy notes..."
                                    value={receiveEntry.discrepancy_notes}
                                    onChange={e => updateReceiveData(item.id, 'discrepancy_notes', e.target.value)}
                                    style={{ marginTop: '4px', width: '100%' }}
                                  />
                                )}
                              </div>
                            ) : totalReceived >= item.qty_shipped ? (
                              <span className="admin-v2-badge admin-v2-badge-success">
                                <CheckIcon size={12} /> Complete
                              </span>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-v2-empty-state">
              <EquipmentIcon size={32} />
              <p>No items in this shipment yet.</p>
              {hasPermission('equipment.edit') && !isFinalized && (
                <button
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={() => setShowAddItemModal(true)}
                >
                  <PlusIcon size={16} /> Add Item
                </button>
              )}
            </div>
          )}
        </div>

        {/* Receipt History */}
        {shipment.items?.some(item => item.receipts?.length > 0) && (
          <div className="admin-v2-section">
            <h2>Receipt History</h2>
            <div className="admin-v2-table-container">
              <table className="admin-v2-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Condition</th>
                    <th>Lot #</th>
                    <th>Expiration</th>
                    <th>Received At</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shipment.items.flatMap(item => 
                    (item.receipts || []).map(receipt => (
                      <tr key={receipt.id}>
                        <td>{item.item_number || item.equipment_name || 'Item'}</td>
                        <td>{receipt.qty_received}</td>
                        <td>
                          <span className={`admin-v2-badge ${getConditionBadgeClass(receipt.condition)}`}>
                            {receipt.condition}
                          </span>
                        </td>
                        <td>{receipt.lot_number || '-'}</td>
                        <td>{formatDate(receipt.expiration_date)}</td>
                        <td>{formatDate(receipt.received_at)}</td>
                        <td>{receipt.discrepancy_notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Finalize Button */}
        {canFinalize && hasPermission('equipment.edit') && (
          <div className="admin-v2-finalize-section">
            <button
              className="admin-v2-btn admin-v2-btn-primary admin-v2-btn-lg"
              onClick={handleFinalizeShipment}
              disabled={finalizing}
            >
              {finalizing ? 'Finalizing...' : 'Finalize Shipment'}
            </button>
            <p className="admin-v2-text-muted">
              Finalizing will create backorder shipments for B/O items and generate alerts for any discrepancies.
            </p>
          </div>
        )}

        {/* Finalized Info */}
        {isFinalized && shipment.finalized_at && (
          <div className="admin-v2-finalized-info">
            <CheckIcon size={16} />
            <span>Finalized on {formatDate(shipment.finalized_at)}</span>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItemModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowAddItemModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Shipment Item</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowAddItemModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleAddItem}>
                <div className="admin-v2-modal-body">
                  {itemFormError && (
                    <div className="admin-v2-form-error">{itemFormError}</div>
                  )}

                  <div className="admin-v2-form-group">
                    <label>Link to Equipment (optional)</label>
                    <select
                      value={itemFormData.equipment_id}
                      onChange={e => {
                        const eqId = e.target.value;
                        setItemFormData(prev => ({ ...prev, equipment_id: eqId }));
                        if (eqId) {
                          const eq = equipment.find(eq => eq.id === parseInt(eqId));
                          if (eq) {
                            setItemFormData(prev => ({
                              ...prev,
                              equipment_id: eqId,
                              item_number: eq.item_number || '',
                              manufacturer_name: eq.default_manufacturer || '',
                              unit_of_measure: eq.unit_of_measure || '',
                              unit_description: eq.unit_description || ''
                            }));
                          }
                        }
                      }}
                    >
                      <option value="">-- No Link --</option>
                      {equipment.map(eq => (
                        <option key={eq.id} value={eq.id}>
                          {eq.name} {eq.item_number ? `(${eq.item_number})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Item Number *</label>
                      <input
                        type="text"
                        value={itemFormData.item_number}
                        onChange={e => setItemFormData({...itemFormData, item_number: e.target.value})}
                        required
                        placeholder="e.g., 6025"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Manufacturer</label>
                      <input
                        type="text"
                        value={itemFormData.manufacturer_name}
                        onChange={e => setItemFormData({...itemFormData, manufacturer_name: e.target.value})}
                        placeholder="e.g., Hollister"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Qty Ordered</label>
                      <input
                        type="number"
                        min="0"
                        value={itemFormData.qty_ordered}
                        onChange={e => setItemFormData({...itemFormData, qty_ordered: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Qty Shipped</label>
                      <input
                        type="number"
                        min="0"
                        value={itemFormData.qty_shipped}
                        onChange={e => setItemFormData({...itemFormData, qty_shipped: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Qty B/O</label>
                      <input
                        type="number"
                        min="0"
                        value={itemFormData.qty_backordered}
                        onChange={e => setItemFormData({...itemFormData, qty_backordered: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Unit of Measure</label>
                      <input
                        type="text"
                        value={itemFormData.unit_of_measure}
                        onChange={e => setItemFormData({...itemFormData, unit_of_measure: e.target.value})}
                        placeholder="e.g., Box"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Unit Description</label>
                      <input
                        type="text"
                        value={itemFormData.unit_description}
                        onChange={e => setItemFormData({...itemFormData, unit_description: e.target.value})}
                        placeholder="e.g., Box of 10"
                      />
                    </div>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={() => setShowAddItemModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={savingItem}>
                    {savingItem ? 'Adding...' : 'Add Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ShipmentDetail;
