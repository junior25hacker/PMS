var PrescriptionsView = {
  prescriptions: [],
  patients: [],
  medicines: [],
  meta: null,
  search: '',
  statusFilter: '',
  formOpen: false,
  items: [],
  activeConflicts: [],

  async load() {
    try {
      const [rxRes, patRes, medRes] = await Promise.all([
        API.get(`/prescriptions${API.qs({
          page: this.meta?.page || 1,
          limit: 20,
          search: this.search,
          status: this.statusFilter || undefined,
        })}`),
        API.get('/patients?limit=100'),
        API.get('/medicines?limit=100'),
      ]);

      const { items, meta } = API.list(rxRes);
      this.prescriptions = items;
      this.meta = meta;
      this.patients = API.list(patRes).items;
      this.medicines = API.list(medRes).items;
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  render() {
    const canCreate = Auth.can('admin', 'pharmacist');

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🩺 Prescriptions ${this.meta ? `(${this.meta.total})` : ''}</span>
          <div class="btn-group" style="gap:8px; flex-wrap:wrap;">
            <select class="form-control" style="width:140px;" id="rx-status-filter" onchange="PrescriptionsView.onStatusChange(this.value)">
              <option value="" ${this.statusFilter === '' ? 'selected' : ''}>All Statuses</option>
              <option value="pending" ${this.statusFilter === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${this.statusFilter === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="dispensed" ${this.statusFilter === 'dispensed' ? 'selected' : ''}>Dispensed</option>
              <option value="cancelled" ${this.statusFilter === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
            <input type="text" class="form-control" style="width:240px;" placeholder="Search Rx #, patient, doctor…" id="rx-search" value="${esc(this.search)}">
            ${canCreate ? `<button class="btn btn-primary" onclick="PrescriptionsView.openForm()">+ Record Prescription</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          ${this.prescriptions.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">🩺</div><div class="empty-state-text">No prescriptions found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Rx Number</th><th>Patient</th><th>Doctor</th><th>Medications</th><th>Issue Date</th><th>Allergy Safety</th><th>Status</th><th>Actions</th></tr></thead>
               <tbody>${this.prescriptions.map((rx) => `<tr>
                <td><strong>${esc(rx.prescriptionNumber)}</strong>${rx.diagnosis ? `<br><small style="color:var(--text-muted)">${esc(rx.diagnosis)}</small>` : ''}</td>
                <td>
                  <strong>${esc(rx.patient?.name || 'Unknown')}</strong>
                  ${rx.patient?.knownAllergies && rx.patient.knownAllergies.toLowerCase() !== 'none'
                    ? `<br><small style="color:#b91c1c;">⚠️ ${esc(rx.patient.knownAllergies)}</small>`
                    : ''}
                </td>
                <td>${esc(rx.doctorName)}${rx.clinicHospital ? `<br><small style="color:var(--text-muted)">${esc(rx.clinicHospital)}</small>` : ''}</td>
                <td>${(rx.items || []).map(i => `<span style="display:inline-block; margin-right:4px;">${esc(i.drugName)} <small style="color:var(--text-muted)">(${esc(i.dosage)})</small></span>`).join(', ') || '—'}</td>
                <td>${esc(rx.issueDate)}</td>
                <td>
                  ${rx.allergyWarningTriggered
                    ? `<span class="badge" style="background:#fee2e2; color:#b91c1c;" title="${esc(rx.allergyConflictDetails || '')}">⚠️ Overridden</span>`
                    : '<span class="badge badge-success">✓ Verified Safe</span>'}
                </td>
                <td>
                  <span class="badge badge-${rx.status === 'dispensed' ? 'success' : rx.status === 'approved' ? 'info' : rx.status === 'cancelled' ? 'danger' : 'warning'}">
                    ${esc(rx.status)}
                  </span>
                </td>
                <td>
                  <button class="btn btn-sm" onclick="PrescriptionsView.viewDetails(${rx.id})">Details</button>
                  ${canCreate && rx.status !== 'dispensed' && rx.status !== 'cancelled'
                    ? `<button class="btn btn-sm btn-primary" onclick="PrescriptionsView.quickStatusModal(${rx.id}, '${rx.status}')">Update</button>`
                    : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
      ${this.formOpen ? this.formHtml() : ''}
    `;
  },

  mount() {
    const search = document.getElementById('rx-search');
    if (search) {
      search.addEventListener('input', debounce(() => {
        this.search = search.value;
        this.meta = { ...(this.meta || {}), page: 1 };
        App.refresh();
      }, 350));
    }
  },

  onStatusChange(val) {
    this.statusFilter = val;
    this.meta = { ...(this.meta || {}), page: 1 };
    App.refresh();
  },

  openForm(preselectedPatientId = null) {
    this.formOpen = true;
    this.selectedPatientId = preselectedPatientId || (this.patients[0]?.id || null);
    this.items = [
      { drugName: '', medicineId: '', dosage: '500mg', frequency: '3 times daily', duration: '7 days', quantityPrescribed: 21, instructions: '' }
    ];
    this.activeConflicts = [];
    this.rerenderForm();
    setTimeout(() => this.triggerAllergyCheck(), 100);
  },

  openNewForPatient(patientId) {
    this.openForm(patientId);
  },

  closeForm() {
    this.formOpen = false;
    this.items = [];
    this.activeConflicts = [];
    App.refresh();
  },

  rerenderForm() {
    const existing = document.getElementById('rx-form-card');
    if (existing) existing.remove();
    document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml());
    document.getElementById('rx-form-card').scrollIntoView({ behavior: 'smooth' });
  },

  formHtml() {
    const today = new Date().toISOString().slice(0, 10);
    const selectedPatient = this.patients.find((p) => p.id === Number(this.selectedPatientId));
    const hasConflicts = this.activeConflicts.length > 0;

    return `
      <div class="card" id="rx-form-card" style="margin-top:20px; border:2px solid var(--primary);">
        <div class="card-header" style="background:#f8fafc;">
          <span class="card-title">📝 Record New Patient Prescription</span>
          <button type="button" class="btn btn-sm" onclick="PrescriptionsView.closeForm()">✕ Close</button>
        </div>
        <div class="card-body">
          <form onsubmit="PrescriptionsView.save(event)">
            <!-- Patient Link & Clinical Info -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
              <div class="form-group">
                <label>Linked Patient Record *</label>
                <select class="form-control" name="patientId" id="rx-patient-select" required onchange="PrescriptionsView.onPatientChanged(this.value)">
                  <option value="">-- Select Patient Record --</option>
                  ${this.patients.map((p) => `
                    <option value="${p.id}" ${Number(this.selectedPatientId) === p.id ? 'selected' : ''}>
                      ${esc(p.name)} (DOB: ${esc(p.dateOfBirth)}) ${p.knownAllergies ? `[Allergies: ${esc(p.knownAllergies)}]` : ''}
                    </option>
                  `).join('')}
                </select>
                <small style="color:var(--text-muted)">Prescription must be linked to an existing registered patient.</small>
              </div>

              <div class="form-group">
                <label>Prescribing Doctor *</label>
                <input class="form-control" name="doctorName" placeholder="e.g. Dr. Sarah Jenkins, MD" required minlength="2">
              </div>

              <div class="form-group">
                <label>Doctor Medical License #</label>
                <input class="form-control" name="doctorLicense" placeholder="e.g. MD-88341-TX">
              </div>

              <div class="form-group">
                <label>Hospital / Clinic Name</label>
                <input class="form-control" name="clinicHospital" placeholder="e.g. City Central Hospital">
              </div>

              <div class="form-group">
                <label>Issue Date *</label>
                <input class="form-control" name="issueDate" type="date" value="${today}" required>
              </div>

              <div class="form-group">
                <label>Diagnosis / Clinical Indication</label>
                <input class="form-control" name="diagnosis" placeholder="e.g. Acute Bacterial Sinusitis">
              </div>
            </div>

            <!-- Patient Allergy Status Banner -->
            ${selectedPatient ? `
              <div style="background:${selectedPatient.knownAllergies && selectedPatient.knownAllergies.toLowerCase() !== 'none' ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${selectedPatient.knownAllergies && selectedPatient.knownAllergies.toLowerCase() !== 'none' ? '#fca5a5' : '#86efac'}; border-radius:6px; padding:12px; margin:16px 0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <strong>Patient:</strong> ${esc(selectedPatient.name)} &bull; DOB: ${esc(selectedPatient.dateOfBirth)}
                    <div style="margin-top:4px;">
                      <strong>Known Allergies:</strong> 
                      <span style="color:${selectedPatient.knownAllergies && selectedPatient.knownAllergies.toLowerCase() !== 'none' ? '#b91c1c' : '#166534'}; font-weight:600;">
                        ${esc(selectedPatient.knownAllergies || 'No known allergies recorded')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- Prescribed Medications Section -->
            <div style="margin:20px 0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; font-size:16px;">💊 Prescribed Medications</h3>
                <button type="button" class="btn btn-sm btn-primary" onclick="PrescriptionsView.addItem()">+ Add Medication</button>
              </div>

              <div id="rx-items-container">
                ${this.items.map((it, idx) => `
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                      <strong>Medication #${idx + 1}</strong>
                      ${this.items.length > 1 ? `<button type="button" class="btn btn-sm btn-danger" onclick="PrescriptionsView.removeItem(${idx})">Remove</button>` : ''}
                    </div>

                    <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr; gap:10px;">
                      <div class="form-group">
                        <label>Drug Name *</label>
                        <input class="form-control" list="medicine-suggestions-${idx}" id="drugName-${idx}" value="${esc(it.drugName)}" required placeholder="Select or type drug name" oninput="PrescriptionsView.onDrugInput(${idx}, this.value)">
                        <datalist id="medicine-suggestions-${idx}">
                          ${this.medicines.map(m => `<option value="${esc(m.name)}" data-id="${m.id}">${esc(m.genericName ? `${m.name} (${m.genericName})` : m.name)}</option>`).join('')}
                        </datalist>
                      </div>

                      <div class="form-group">
                        <label>Dosage *</label>
                        <input class="form-control" id="dosage-${idx}" value="${esc(it.dosage)}" required placeholder="e.g. 500mg" oninput="PrescriptionsView.items[${idx}].dosage=this.value">
                      </div>

                      <div class="form-group">
                        <label>Frequency</label>
                        <input class="form-control" id="frequency-${idx}" value="${esc(it.frequency)}" placeholder="e.g. 3 times daily" oninput="PrescriptionsView.items[${idx}].frequency=this.value">
                      </div>

                      <div class="form-group">
                        <label>Duration *</label>
                        <input class="form-control" id="duration-${idx}" value="${esc(it.duration)}" required placeholder="e.g. 7 days" oninput="PrescriptionsView.items[${idx}].duration=this.value">
                      </div>

                      <div class="form-group">
                        <label>Quantity *</label>
                        <input class="form-control" type="number" min="1" id="qty-${idx}" value="${it.quantityPrescribed || 1}" required oninput="PrescriptionsView.items[${idx}].quantityPrescribed=parseInt(this.value)||1">
                      </div>
                    </div>

                    <div class="form-group" style="margin-top:8px;">
                      <label>Patient Instructions / Special Directions</label>
                      <input class="form-control" id="inst-${idx}" value="${esc(it.instructions || '')}" placeholder="e.g. Take with a full glass of water after food" oninput="PrescriptionsView.items[${idx}].instructions=this.value">
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- ALLERGY CONFLICT WARNING & PHARMACIST OVERRIDE SECTION -->
            <div id="rx-allergy-alert-box">
              ${hasConflicts ? `
                <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:8px; padding:16px; margin:20px 0;">
                  <div style="display:flex; align-items:flex-start; gap:12px;">
                    <div style="font-size:24px;">🚨</div>
                    <div style="flex:1;">
                      <h4 style="margin:0 0 8px 0; color:#991b1b; font-size:16px;">CRITICAL ALLERGY CONFLICT DETECTED</h4>
                      <div style="color:#b91c1c; font-size:14px; margin-bottom:12px;">
                        ${this.activeConflicts.map(c => `<div><strong>• ${esc(c.drugName)}:</strong> ${esc(c.reason)}</div>`).join('')}
                      </div>

                      <div style="background:#ffffff; border:1px solid #fca5a5; border-radius:6px; padding:12px; margin-top:8px;">
                        <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:#991b1b; cursor:pointer;">
                          <input type="checkbox" id="ack-allergy-checkbox" name="acknowledgeAllergyWarning" required>
                          I, Authorized Pharmacist, acknowledge this allergy alert and verify clinical justification to proceed with dispensing.
                        </label>

                        <div class="form-group" style="margin-top:10px;">
                          <label style="color:#991b1b; font-weight:600;">Clinical Override Justification *</label>
                          <textarea class="form-control" name="allergyOverrideReason" id="allergy-override-reason" rows="2" required placeholder="Explain why this medication is clinically appropriate (e.g. Skin testing confirmed negative, desensitization completed, doctor consulted)"></textarea>
                          <small style="color:var(--text-muted)">This acknowledgment will be permanently logged with your pharmacist credentials and timestamp for regulatory compliance.</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ` : `
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:12px; margin:16px 0; display:flex; align-items:center; gap:8px;">
                  <span style="color:#16a34a; font-size:18px;">✓</span>
                  <span style="color:#166534; font-size:13px;">No known allergy conflicts detected between patient records and prescribed drugs.</span>
                </div>
              `}
            </div>

            <div class="form-group" style="margin-top:16px;">
              <label>Additional Clinical Notes</label>
              <textarea class="form-control" name="notes" rows="2" placeholder="Internal notes or pharmacist remarks"></textarea>
            </div>

            <div class="btn-group" style="margin-top:20px;">
              <button type="submit" class="btn btn-primary" id="rx-save-btn">Save Prescription Record</button>
              <button type="button" class="btn" onclick="PrescriptionsView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  addItem() {
    this.items.push({
      drugName: '',
      medicineId: '',
      dosage: '500mg',
      frequency: 'Once daily',
      duration: '7 days',
      quantityPrescribed: 14,
      instructions: '',
    });
    this.rerenderForm();
  },

  removeItem(index) {
    this.items.splice(index, 1);
    this.rerenderForm();
    this.triggerAllergyCheck();
  },

  onPatientChanged(patientId) {
    this.selectedPatientId = patientId ? Number(patientId) : null;
    this.rerenderForm();
    this.triggerAllergyCheck();
  },

  onDrugInput(index, drugName) {
    this.items[index].drugName = drugName;
    const match = this.medicines.find(m => m.name.toLowerCase() === drugName.trim().toLowerCase());
    if (match) {
      this.items[index].medicineId = match.id;
      if (match.strength && !this.items[index].dosage) this.items[index].dosage = match.strength;
    }
    this.debounceAllergyCheck();
  },

  debounceAllergyCheck: null,

  triggerAllergyCheck() {
    if (!this.selectedPatientId) {
      this.activeConflicts = [];
      this.updateAlertBox();
      return;
    }

    const validItems = this.items.filter(it => it.drugName && it.drugName.trim().length > 0);
    if (validItems.length === 0) {
      this.activeConflicts = [];
      this.updateAlertBox();
      return;
    }

    API.post('/prescriptions/check-allergies', {
      patientId: Number(this.selectedPatientId),
      items: validItems.map(it => ({
        drugName: it.drugName,
        medicineId: it.medicineId ? Number(it.medicineId) : undefined,
      })),
    }).then((res) => {
      this.activeConflicts = res.conflicts || [];
      this.updateAlertBox();
    }).catch(() => {
      this.activeConflicts = [];
      this.updateAlertBox();
    });
  },

  updateAlertBox() {
    const box = document.getElementById('rx-allergy-alert-box');
    if (!box) return;
    const hasConflicts = this.activeConflicts.length > 0;

    box.innerHTML = hasConflicts ? `
      <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:8px; padding:16px; margin:20px 0;">
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:24px;">🚨</div>
          <div style="flex:1;">
            <h4 style="margin:0 0 8px 0; color:#991b1b; font-size:16px;">CRITICAL ALLERGY CONFLICT DETECTED</h4>
            <div style="color:#b91c1c; font-size:14px; margin-bottom:12px;">
              ${this.activeConflicts.map(c => `<div><strong>• ${esc(c.drugName)}:</strong> ${esc(c.reason)}</div>`).join('')}
            </div>

            <div style="background:#ffffff; border:1px solid #fca5a5; border-radius:6px; padding:12px; margin-top:8px;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:#991b1b; cursor:pointer;">
                <input type="checkbox" id="ack-allergy-checkbox" name="acknowledgeAllergyWarning" required>
                I, Authorized Pharmacist, acknowledge this allergy alert and verify clinical justification to proceed with dispensing.
              </label>

              <div class="form-group" style="margin-top:10px;">
                <label style="color:#991b1b; font-weight:600;">Clinical Override Justification *</label>
                <textarea class="form-control" name="allergyOverrideReason" id="allergy-override-reason" rows="2" required placeholder="Explain why this medication is clinically appropriate (e.g. Skin testing confirmed negative, desensitization completed, doctor consulted)"></textarea>
                <small style="color:var(--text-muted)">This acknowledgment will be permanently logged with your pharmacist credentials and timestamp for regulatory compliance.</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    ` : `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:12px; margin:16px 0; display:flex; align-items:center; gap:8px;">
        <span style="color:#16a34a; font-size:18px;">✓</span>
        <span style="color:#166534; font-size:13px;">No known allergy conflicts detected between patient records and prescribed drugs.</span>
      </div>
    `;
  },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);

    if (!raw.patientId) {
      toast('Cannot save: A prescription must be linked to a valid patient record', 'error');
      return;
    }

    const payloadItems = this.items.map(it => ({
      drugName: it.drugName.trim(),
      medicineId: it.medicineId ? Number(it.medicineId) : undefined,
      dosage: it.dosage.trim(),
      frequency: it.frequency ? it.frequency.trim() : 'Once daily',
      duration: it.duration.trim(),
      quantityPrescribed: Number(it.quantityPrescribed) || 1,
      instructions: it.instructions ? it.instructions.trim() : undefined,
    }));

    if (payloadItems.some(i => !i.drugName || !i.dosage || !i.duration)) {
      toast('Please fill in drug name, dosage, and duration for all prescribed medications', 'error');
      return;
    }

    const data = {
      patientId: Number(raw.patientId),
      doctorName: raw.doctorName.trim(),
      doctorLicense: raw.doctorLicense || null,
      clinicHospital: raw.clinicHospital || null,
      diagnosis: raw.diagnosis || null,
      issueDate: raw.issueDate,
      notes: raw.notes || null,
      items: payloadItems,
      acknowledgeAllergyWarning: raw.acknowledgeAllergyWarning === true || raw.acknowledgeAllergyWarning === 'on',
      allergyOverrideReason: raw.allergyOverrideReason || undefined,
    };

    try {
      const res = await API.post('/prescriptions', data);
      toast(`Prescription ${(res.data || res).prescriptionNumber} recorded successfully`, 'success');
      this.closeForm();
    } catch (err) {
      if (err.conflicts || err.allergyWarning) {
        this.activeConflicts = err.conflicts || [];
        this.updateAlertBox();
        toast('Prescription blocked due to patient allergy conflict. Pharmacist acknowledgment required.', 'error');
      } else {
        toast(err.message, 'error');
      }
    }
  },

  async viewDetails(id) {
    try {
      const res = await API.get(`/prescriptions/${id}`);
      const rx = res.data || res;
      const patient = rx.patient || {};
      const items = rx.items || [];

      const html = `
        <div style="min-width:650px; max-width:850px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:16px;">
            <div>
              <div style="font-size:12px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Official Prescription Record</div>
              <h2 style="margin:2px 0 0 0; color:var(--primary);">${esc(rx.prescriptionNumber)}</h2>
              <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">
                Issued on <strong>${esc(rx.issueDate)}</strong> &bull; Status: <span class="badge badge-${rx.status === 'dispensed' ? 'success' : rx.status === 'approved' ? 'info' : 'warning'}">${esc(rx.status)}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <strong>Prescribing Physician</strong>
              <div>${esc(rx.doctorName)}</div>
              ${rx.doctorLicense ? `<div style="font-size:12px; color:var(--text-muted);">Lic: ${esc(rx.doctorLicense)}</div>` : ''}
              ${rx.clinicHospital ? `<div style="font-size:12px; color:var(--text-muted);">${esc(rx.clinicHospital)}</div>` : ''}
            </div>
          </div>

          <!-- Patient Profile Info -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:16px; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div>
              <strong>Patient Name:</strong> ${esc(patient.name)}<br>
              <strong>Date of Birth:</strong> ${esc(patient.dateOfBirth || '—')} (${esc(patient.gender || '—')})<br>
              <strong>Phone:</strong> ${esc(patient.phone || '—')}
            </div>
            <div>
              <strong>Diagnosis:</strong> ${esc(rx.diagnosis || '—')}<br>
              <strong style="color:#b91c1c;">Patient Allergies:</strong> 
              <span style="color:#b91c1c; font-weight:600;">${esc(patient.knownAllergies || 'No known allergies')}</span>
            </div>
          </div>

          <!-- Logged Allergy Override Audit Trail -->
          ${rx.allergyWarningTriggered ? `
            <div style="background:#fef2f2; border:1px solid #f87171; border-radius:6px; padding:12px; margin-bottom:16px;">
              <strong style="color:#991b1b; display:flex; align-items:center; gap:6px;">
                ⚠️ CLINICAL ALLERGY ALERT AUDIT LOG
              </strong>
              <div style="font-size:13px; color:#b91c1c; margin-top:4px;">
                <strong>Detected Conflict:</strong> ${esc(rx.allergyConflictDetails || 'Potential allergen cross-reactivity')}
              </div>
              <div style="font-size:13px; color:#991b1b; margin-top:6px; background:#fff; padding:8px; border-radius:4px; border:1px solid #fecdd3;">
                <strong>Override Acknowledged By:</strong> ${esc(rx.allergyOverrideBy || 'Pharmacist')}<br>
                <strong>Timestamp:</strong> ${rx.allergyOverrideAt ? new Date(rx.allergyOverrideAt).toLocaleString() : '—'}<br>
                <strong>Clinical Justification:</strong> <em>"${esc(rx.allergyOverrideReason || 'Documented clinical necessity')}"</em>
              </div>
            </div>
          ` : ''}

          <!-- Medications List -->
          <h3 style="margin-bottom:8px; font-size:15px;">Prescribed Drugs & Regimen</h3>
          <div class="table-wrap" style="margin-bottom:16px;">
            <table>
              <thead>
                <tr><th>Drug Name</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Qty</th><th>Instructions</th><th>Safety Check</th></tr>
              </thead>
              <tbody>
                ${items.map((i) => `
                  <tr>
                    <td><strong>${esc(i.drugName)}</strong></td>
                    <td>${esc(i.dosage)}</td>
                    <td>${esc(i.frequency || '—')}</td>
                    <td>${esc(i.duration)}</td>
                    <td>${i.quantityPrescribed}</td>
                    <td>${esc(i.instructions || '—')}</td>
                    <td>
                      ${i.hasAllergyConflict
                        ? `<span class="badge badge-warning" title="${esc(i.allergyConflictDetails || '')}">⚠️ Conflict Flagged</span>`
                        : '<span class="badge badge-success">✓ Clear</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${rx.notes ? `<div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;"><strong>Notes:</strong> ${esc(rx.notes)}</div>` : ''}

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <button class="btn" onclick="window.print()">🖨️ Print Prescription</button>
            <button class="btn btn-primary" onclick="App.closeModal()">Close</button>
          </div>
        </div>
      `;
      App.showModal(html);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  quickStatusModal(id, currentStatus) {
    const html = `
      <div style="min-width:360px;">
        <h3>Update Prescription Status</h3>
        <p style="color:var(--text-muted); font-size:13px;">Change workflow state for this prescription.</p>
        <form onsubmit="PrescriptionsView.submitStatus(event, ${id})">
          <div class="form-group">
            <label>New Status</label>
            <select class="form-control" name="status" required>
              <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending Review</option>
              <option value="approved" ${currentStatus === 'approved' ? 'selected' : ''}>Approved for Dispensing</option>
              <option value="dispensed" ${currentStatus === 'dispensed' ? 'selected' : ''}>Dispensed to Patient</option>
              <option value="cancelled" ${currentStatus === 'cancelled' ? 'selected' : ''}>Cancelled / Void</option>
            </select>
          </div>
          <div class="form-group">
            <label>Pharmacist Notes (optional)</label>
            <textarea class="form-control" name="notes" rows="2" placeholder="e.g. Dispensed batch #B2026-01 to patient"></textarea>
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary">Save Status</button>
            <button type="button" class="btn" onclick="App.closeModal()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    App.showModal(html);
  },

  async submitStatus(e, id) {
    e.preventDefault();
    const raw = formToObject(e.target);
    try {
      await API.patch(`/prescriptions/${id}/status`, {
        status: raw.status,
        notes: raw.notes || undefined,
      });
      toast('Prescription status updated', 'success');
      App.closeModal();
      App.refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  },
};

PrescriptionsView.debounceAllergyCheck = debounce(() => {
  PrescriptionsView.triggerAllergyCheck();
}, 300);
