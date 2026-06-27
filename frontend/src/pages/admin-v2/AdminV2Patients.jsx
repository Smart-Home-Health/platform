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
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import PatientFormFields from '../../components/PatientFormFields';
import { PlusIcon, PatientsIcon, SearchIcon } from '../../components/Icons';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';

const emptyForm = {
  first_name: '', last_name: '', date_of_birth: '',
  medical_record_number: '', notes: '', is_active: true,
};

const getInitials = (f, l) => `${f?.[0] || ''}${l?.[0] || ''}`.toUpperCase();

const getAge = (dob) => {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

const AdminV2Patients = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(perm) || false;
  };

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${config.apiUrl}/api/patients?active_only=${!showInactive}`,
        { credentials: 'include' }
      );
      if (res.ok) setPatients(await res.json());
      else setError('Failed to load patients');
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching patients:', err);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        is_active: formData.is_active,
      };
      if (formData.date_of_birth) payload.date_of_birth = formData.date_of_birth;
      if (formData.medical_record_number) payload.medical_record_number = formData.medical_record_number;
      if (formData.notes) payload.notes = formData.notes;
      const res = await fetch(`${config.apiUrl}/api/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowCreate(false);
        setFormData(emptyForm);
        fetchPatients();
      } else {
        setFormError((await res.json()).detail || 'Failed to create patient');
      }
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const filtered = patients.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      (p.medical_record_number && p.medical_record_number.toLowerCase().includes(q))
    );
  });

  const stats = {
    total: patients.length,
    active: patients.filter((p) => p.is_active).length,
    inactive: patients.filter((p) => !p.is_active).length,
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {/* Stats — compact, 3 across even on mobile */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Active', value: stats.active },
              { label: 'Inactive', value: stats.inactive },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="flex flex-col items-center gap-0.5 py-4">
                  <span className="text-2xl font-semibold text-foreground">{s.value}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon size={16} />
              </span>
              <Input
                className="pl-9"
                placeholder="Search by name or MRN…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} />
              <span className="text-sm text-foreground">Show inactive</span>
            </label>
            {hasPermission('patients.create') && (
              <Button className="gap-1.5" onClick={() => { setFormData(emptyForm); setFormError(null); setShowCreate(true); }}>
                <PlusIcon size={16} /> Add Patient
              </Button>
            )}
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Patient cards */}
          {loading ? (
            <div className="admin-v2-loading">Loading patients…</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <PatientsIcon size={40} />
                <h3 className="text-foreground">No patients found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No patients match your search.' : 'Add a patient to get started.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => {
                const age = getAge(p.date_of_birth);
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/care/configuration/patients/${p.id}`)}
                    className="w-full min-w-0 text-left"
                  >
                    <Card className={`transition-colors hover:border-ring ${!p.is_active ? 'opacity-60' : ''}`}>
                      <CardContent className="flex items-center gap-3 py-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                          {getInitials(p.first_name, p.last_name)}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-medium text-foreground">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {p.medical_record_number || 'No MRN'}
                            {' · '}
                            {formatDate(p.date_of_birth)}
                            {age !== null ? ` (${age})` : ''}
                          </span>
                        </div>
                        {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
          <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Patient</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <PatientFormFields formData={formData} setFormData={setFormData} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Patient'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Patients;
