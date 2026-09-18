var PatientsView = {
  patients: [],
  meta: null,
  search: '',
  formOpen: false,
  editing: null,

  async load() {
    try {
      const res = await API.get(`/patients${API.qs({ page: this.meta?.page || 1, limit: 20, search: this.search })}`);
      const { items, meta } = API.list(res);
      this.patients = items;
      this.meta = meta;
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  render() {
    const canEdit = Auth.can('admin', 'pharmacist');
    const canDelete = Auth.can('admin');

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🧑‍⚕️ Patients ${this.meta ? `(${this.meta.total})` : ''}</span>
          <div class="btn-group">
            <input type="text" class="form-control" style="width:260px;" placeholder="Search name, phone, allergies…" id="pat-search" value="${esc(this.search)}">
            ${canEdit ? `<button class="btn btn-primary" onclick="PatientsView.openForm()">+ New Patient</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          ${this.patients.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">🧑‍⚕️</div><div class="empty-state-text">No patients found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Patient Name</th><th>DOB / Gender</th><th>Known Allergies</th><th>Contact Info</th><th>Prescriptions</th><th>Status</th><th>Actions</th></tr></thead>
               <tbody>${this.patients.map((p) => `<tr>
                <td><strong>${esc(p.name)}</strong>${p.address ? `<br><small style="color:var(--text-muted)">${esc(p.address)}</small>` : ''}</td>
                <td>${esc(p.dateOfBirth || '—')}<br><small style="color:var(--text-muted); text-transform:capitalize;">${esc(p.gender || '—')}</small></td>
                <td>
                  ${p.knownAllergies && p.knownAllergies.toLowerCase() !== 'none'
                    ? p.knownAllergies.split(/[,;\n]+/).map(a => `<span class="badge" style="background:#fee2e2; color:#b91c1c; margin:2px 2px 2px 0; display:inline-block; font-size:11px;">⚠️ ${esc(a.trim())}</span>`).join(' ')
                    : '<span class="badge badge-success" style="font-size:11px;">No known allergies</span>'}
                </td>
                <td>
                  ${esc(p.phone || '—')}${p.email ? `<br><small style="color:var(--text-muted)">${esc(p.email)}</small>` : ''}
                  ${p.emergencyContact ? `<br><small style="color:var(--text-muted)">ICE: ${esc(p.emergencyContact)}</small>` : ''}
                </td>
                <td><span class="badge" style="background:#f1f5f9; color:#475569;">${p.prescriptionCount ?? '0'} Rx</span></td>
                <td><span class="badge ${p.isActive ? 'badge-success' : 'badge-danger'}">${p.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <button class="btn btn-sm" onclick="PatientsView.viewHistory(${p.id})">History</button>
                  ${canEdit ? `<button class="btn btn-sm" onclick="PatientsView.edit(${p.id})">Edit</button>` : ''}
                  ${canDelete && p.isActive ? `<button class="btn btn-sm btn-danger" onclick="PatientsView.remove(${p.id})">Deactivate</button>` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
      ${this.formOpen ? this.formHtml() : ''}
    `;
  },

  mount() {
    const search = document.getElementById('pat-search');
    if (search) {
      search.addEventListener('input', debounce(() => {
        this.search = search.value;
        this.meta = { ...(this.meta || {}), page: 1 };
        App.refresh();
      }, 350));
    }
  },

  formHtml() {
    const p = this.editing || {};
    return `
      <div class="card" id="patient-form-card" style="margin-top:20px;">
        <div class="card-header"><span class="card-title">${this.editing ? 'Edit' : 'New'} Patient Record</span></div>
        <div class="card-body">
          <form onsubmit="PatientsView.save(event)">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 16px;">
              <div class="form-group"><label>Full Name *</label><input class="form-control" name="name" value="${esc(p.name || '')}" required minlength="2"></div>
              <div class="form-group"><label>Date of Birth * (YYYY-MM-DD)</label><input class="form-control" name="dateOfBirth" type="date" value="${esc(p.dateOfBirth || '')}" required></div>
              <div class="form-group">
                <label>Gender</label>
                <select class="form-control" name="gender">
                  <option value="">Select gender</option>
                  <option value="female" ${p.gender === 'female' ? 'selected' : ''}>Female</option>
                  <option value="male" ${p.gender === 'male' ? 'selected' : ''}>Male</option>
                  <option value="other" ${p.gender === 'other' ? 'selected' : ''}>Other</option>
                </select>
              </div>
              <div class="form-group"><label>Phone Number</label><input class="form-control" name="phone" value="${esc(p.phone || '')}"></div>
              <div class="form-group"><label>Email Address</label><input class="form-control" name="email" type="email" value="${esc(p.email || '')}"></div>
              <div class="form-group"><label>Emergency Contact (Name & Phone)</label><input class="form-control" name="emergencyContact" value="${esc(p.emergencyContact || '')}"></div>
              
              <div class="form-group" style="grid-column:1/-1;">
                <label style="color:#b91c1c; font-weight:600;">⚠️ Known Allergies (Drug & Substance)</label>
                <input class="form-control" name="knownAllergies" placeholder="e.g. Penicillin, Amoxicillin, Aspirin, Sulfa drugs" value="${esc(p.knownAllergies || '')}">
                <small style="color:var(--text-muted)">Critical for automatic interaction warnings. Separate multiple allergies with commas.</small>
              </div>

              <div class="form-group" style="grid-column:1/-1;"><label>Address</label><textarea class="form-control" name="address" rows="2">${esc(p.address || '')}</textarea></div>
              <div class="form-group" style="grid-column:1/-1;"><label>Medical Notes / Health Conditions</label><textarea class="form-control" name="notes" rows="2">${esc(p.notes || '')}</textarea></div>
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Save Patient Record</button>
              <button type="button" class="btn" onclick="PatientsView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  openForm() { this.editing = null; this.formOpen = true; this.rerenderForm(); },
  closeForm() { this.formOpen = false; this.editing = null; App.refresh(); },
  edit(id) {
    const p = this.patients.find((x) => x.id === id);
    if (!p) return;
    this.editing = p; this.formOpen = true; this.rerenderForm();
  },

  rerenderForm() {
    const existing = document.getElementById('patient-form-card');
    if (existing) existing.remove();
    document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml());
    document.getElementById('patient-form-card').scrollIntoView({ behavior: 'smooth' });
  },

  async remove(id) {
    confirmDialog('Deactivate Patient', 'The patient record will be deactivated. Existing prescriptions will remain traceable. Continue?', async () => {
      try {
        await API.del(`/patients/${id}`);
        toast('Patient deactivated', 'success');
        App.refresh();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const data = {
      name: raw.name,
      dateOfBirth: raw.dateOfBirth,
      gender: raw.gender || null,
      phone: raw.phone || null,
      email: raw.email || null,
      address: raw.address || null,
      knownAllergies: raw.knownAllergies || null,
      emergencyContact: raw.emergencyContact || null,
      notes: raw.notes || null,
    };

    try {
      if (this.editing) {
        await API.patch(`/patients/${this.editing.id}`, data);
        toast('Patient record updated successfully', 'success');
      } else {
        await API.post('/patients', data);
        toast('New patient record created', 'success');
      }
      this.formOpen = false;
      this.editing = null;
      App.refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  async viewHistory(id) {
    try {
      const res = await API.get(`/patients/${id}`);
      const patient = res.data || res;
      const prescriptions = patient.prescriptions || [];

      const html = `
        <div style="min-width:600px; max-width:800px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div>
              <h2 style="margin:0;">${esc(patient.name)}</h2>
              <div style="color:var(--text-muted); font-size:13px; margin-top:4px;">
                DOB: <strong>${esc(patient.dateOfBirth || '—')}</strong> &bull; Gender: <span style="text-transform:capitalize;">${esc(patient.gender || '—')}</span> &bull; Phone: ${esc(patient.phone || '—')}
              </div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="App.closeModal(); window.location.hash='#prescriptions'; setTimeout(() => PrescriptionsView.openNewForPatient(${patient.id}), 100);">+ New Rx</button>
          </div>

          <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:6px; padding:12px; margin-bottom:16px;">
            <strong style="color:#b91c1c; display:flex; align-items:center; gap:6px;">⚠️ Known Allergies:</strong>
            <div style="margin-top:6px; font-size:14px; color:#991b1b;">
              ${patient.knownAllergies ? esc(patient.knownAllergies) : '<em>No known drug or substance allergies recorded</em>'}
            </div>
          </div>

          <h3 style="margin-bottom:8px; font-size:16px;">Prescription History (${prescriptions.length})</h3>
          ${prescriptions.length === 0
            ? '<div style="color:var(--text-muted); font-size:13px; padding:12px 0;">No prescriptions recorded for this patient yet.</div>'
            : `<div class="table-wrap"><table><thead><tr><th>Rx #</th><th>Date</th><th>Doctor</th><th>Items</th><th>Allergy Alert</th><th>Status</th></tr></thead><tbody>
              ${prescriptions.map((rx) => `<tr>
                <td><strong>${esc(rx.prescriptionNumber)}</strong></td>
                <td>${esc(rx.issueDate)}</td>
                <td>${esc(rx.doctorName)}</td>
                <td>${rx.items?.length ? rx.items.map(i => esc(i.drugName)).join(', ') : '—'}</td>
                <td>
                  ${rx.allergyWarningTriggered
                    ? `<span class="badge badge-warning" title="${esc(rx.allergyConflictDetails || '')}">⚠️ Alert Overridden</span>`
                    : '<span class="badge badge-success">Safe</span>'}
                </td>
                <td><span class="badge badge-${rx.status === 'dispensed' ? 'success' : rx.status === 'cancelled' ? 'danger' : 'info'}">${esc(rx.status)}</span></td>
              </tr>`).join('')}
            </tbody></table></div>`}

          <div style="text-align:right; margin-top:16px;">
            <button class="btn" onclick="App.closeModal()">Close</button>
          </div>
        </div>
      `;
      App.showModal(html);
    } catch (e) {
      toast(e.message, 'error');
    }
  },
};
