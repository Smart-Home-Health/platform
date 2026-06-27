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
import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FormRow } from '@/components/ui/field';

// Shared create/edit fields for a patient. Used by the Patients list (create
// dialog) and the patient detail page (edit). `idPrefix` keeps field ids unique
// when more than one instance could mount.
export default function PatientFormFields({ formData, setFormData, idPrefix = 'pf' }) {
  return (
    <>
      <FormRow>
        <Field label="First Name" required htmlFor={`${idPrefix}-first`}>
          <Input
            id={`${idPrefix}-first`}
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            required
            placeholder="John"
          />
        </Field>
        <Field label="Last Name" required htmlFor={`${idPrefix}-last`}>
          <Input
            id={`${idPrefix}-last`}
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            required
            placeholder="Doe"
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Date of Birth" htmlFor={`${idPrefix}-dob`}>
          <Input
            id={`${idPrefix}-dob`}
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
          />
        </Field>
        <Field label="Medical Record Number" htmlFor={`${idPrefix}-mrn`}>
          <Input
            id={`${idPrefix}-mrn`}
            value={formData.medical_record_number}
            onChange={(e) => setFormData({ ...formData, medical_record_number: e.target.value })}
            placeholder="MRN-12345"
          />
        </Field>
      </FormRow>

      <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any additional notes about the patient..."
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={formData.is_active}
          onCheckedChange={(v) => setFormData({ ...formData, is_active: v === true })}
        />
        <span className="text-sm text-foreground">Active</span>
      </label>
    </>
  );
}
