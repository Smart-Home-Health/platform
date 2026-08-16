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
import { useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config, { apiFetch } from '../../config';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  EditIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  SearchIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Field, FormRow } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import SymptomLogForm from './components/SymptomLogForm';
import SymptomActiveList from './components/SymptomActiveList';
import SymptomHistoryList from './components/SymptomHistoryList';
import './AdminV2.css';

// Severity color mapping
// Format symptom type for display
const formatSymptomType = (type) => {
  if (!type) return '';
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};


const AdminV2Symptoms = () => {
  const location = useLocation();
  const { selectedPatient: contextPatient } = useAdminPatient();

  const selectedPatient = contextPatient;

  // Helper to get local datetime string for datetime-local input

  // Determine active view based on URL
  const isHistoryView = location.pathname.includes('/history');
  const isActiveView = location.pathname.includes('/active');

  // Symptoms state
  const [symptoms, setSymptoms] = useState([]);
  const [symptomTypes, setSymptomTypes] = useState([]);
  const [bodyLocations, setBodyLocations] = useState([]);
  const [loadingSymptoms, setLoadingSymptoms] = useState(false);

  // History/filtering state
  const [historySymptoms, setHistorySymptoms] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSymptom, setSelectedSymptom] = useState(null);
  const [editingSymptom, setEditingSymptom] = useState(null);

  // Symptom form state

  // Form states
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load symptom types and locations on mount
  useEffect(() => {
    loadSymptomTypes();
    loadBodyLocations();
  }, []);

  // Load symptoms when patient changes
  useEffect(() => {
    if (selectedPatient) {
      if (isHistoryView) {
        loadHistorySymptoms();
      } else if (isActiveView) {
        loadSymptoms();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helpers are recreated each render; effect is keyed on patient/view change only
  }, [selectedPatient, isHistoryView, isActiveView]);

  const loadSymptomTypes = async () => {
    try {
      const response = await apiFetch(`${config.apiUrl}/api/symptoms/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSymptomTypes(data);
      }
    } catch (err) {
      console.error('Error loading symptom types:', err);
    }
  };

  const loadBodyLocations = async () => {
    try {
      const response = await apiFetch(`${config.apiUrl}/api/symptoms/locations`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setBodyLocations(data);
      }
    } catch (err) {
      console.error('Error loading body locations:', err);
    }
  };

  const loadSymptoms = async () => {
    if (!selectedPatient) return;

    setLoadingSymptoms(true);
    try {
      const response = await apiFetch(
        `${config.apiUrl}/api/symptoms/patient/${selectedPatient.id}?limit=20&resolved=false`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setSymptoms(data);
      }
    } catch (err) {
      console.error('Error loading symptoms:', err);
    } finally {
      setLoadingSymptoms(false);
    }
  };

  // Search / range / type / status filtering now lives client-side inside
  // SymptomHistoryList — fetch everything once per patient.
  const loadHistorySymptoms = async () => {
    if (!selectedPatient) return;
    setLoadingHistory(true);
    try {
      const response = await apiFetch(
        `${config.apiUrl}/api/symptoms/patient/${selectedPatient.id}?limit=200`,
        { credentials: 'include' }
      );
      if (response.ok) {
        setHistorySymptoms(await response.json());
      }
    } catch (err) {
      console.error('Error loading symptom history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };


  const handleResolveSymptom = async (symptomId) => {
    try {
      const response = await apiFetch(`${config.apiUrl}/api/symptoms/${symptomId}/resolve`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        if (isHistoryView) {
          loadHistorySymptoms();
        } else {
          loadSymptoms();
        }
        setSuccess('Symptom marked as resolved');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError('Failed to resolve symptom');
    }
  };

  const handleDeleteSymptom = async () => {
    if (!selectedSymptom) return;

    try {
      const response = await apiFetch(`${config.apiUrl}/api/symptoms/${selectedSymptom.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        if (isHistoryView) {
          loadHistorySymptoms();
        } else {
          loadSymptoms();
        }
        setShowDeleteModal(false);
        setSelectedSymptom(null);
        setSuccess('Symptom deleted');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError('Failed to delete symptom');
    }
  };

  const openEditSymptom = (symptom) => setEditingSymptom(symptom);

  // Render log symptom view
  const renderLogView = () => (
    <SymptomLogForm
      patient={selectedPatient}
      symptomTypes={symptomTypes}
      bodyLocations={bodyLocations}
      onLogged={loadSymptoms}
    />
  );

  // Render active symptoms view
  const renderActiveView = () => (
    <SymptomActiveList
      symptoms={symptoms.filter((s) => !s.is_resolved)}
      loading={loadingSymptoms}
      onResolve={handleResolveSymptom}
      onEdit={openEditSymptom}
      onDelete={(s) => { setSelectedSymptom(s); setShowDeleteModal(true); }}
    />
  );

  // Render history view with table
  const renderHistoryView = () => (
    <SymptomHistoryList
      symptoms={historySymptoms}
      symptomTypes={symptomTypes}
      loading={loadingHistory}
    />
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Alerts */}
        {error && (
          <div className="tw" style={{ marginBottom: '1rem' }}>
            <Alert variant="destructive" className="flex items-center justify-between gap-2">
              {error}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setError(null)}
                aria-label="Dismiss"
              >
                <XIcon size={14} />
              </Button>
            </Alert>
          </div>
        )}
        {success && (
          <div className="tw" style={{ marginBottom: '1rem' }}>
            <Alert variant="success">{success}</Alert>
          </div>
        )}

        {!selectedPatient ? (
          <div className="admin-v2-empty-state">
            <p>Please select a patient from the sidebar</p>
          </div>
        ) : (
          isHistoryView ? renderHistoryView() : isActiveView ? renderActiveView() : renderLogView()
        )}

        {/* Edit symptom: the log form reused in edit mode. Radix primitives
            provide the focus trap, Escape dismissal and scroll lock the
            previous Dialog had; chrome stays vc (sl-edit-* classes). */}
        <DialogPrimitive.Root open={Boolean(editingSymptom && selectedPatient)}
                              onOpenChange={(o) => { if (!o) setEditingSymptom(null); }}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="sl-edit-overlay" />
            <DialogPrimitive.Content className="sl-edit-panel" aria-describedby={undefined}>
              <DialogPrimitive.Title className="sl-sr-only">Edit symptom</DialogPrimitive.Title>
              {editingSymptom && selectedPatient && (
                <SymptomLogForm
                  key={editingSymptom.id}
                  patient={selectedPatient}
                  symptomTypes={symptomTypes}
                  bodyLocations={bodyLocations}
                  initial={editingSymptom}
                  onCancel={() => setEditingSymptom(null)}
                  onLogged={() => { loadSymptoms(); loadHistorySymptoms(); setSuccess('Symptom updated'); setTimeout(() => setSuccess(null), 3000); }}
                />
              )}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteModal && !!selectedSymptom} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete Symptom</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this symptom record?
              </DialogDescription>
            </DialogHeader>
            {selectedSymptom && (
              <p className="text-sm">
                <strong>{formatSymptomType(selectedSymptom.symptom_type)}</strong>
                {selectedSymptom.timestamp && (
                  <span> — {new Date(selectedSymptom.timestamp).toLocaleString()}</span>
                )}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteSymptom}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Symptoms;
