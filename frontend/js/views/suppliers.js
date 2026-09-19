var SuppliersView = {
  suppliers: [],
  meta: null,
  search: '',
  formOpen: false,
  editing: null,

  async load() {
    try {
      const res = await API.get(`/suppliers${API.qs({ page: this.meta?.page || 1, limit: 20, search: this.search })}`);
      const { items, meta } = API.list(res);
      this.suppliers = items;
      this.meta = meta;
    } catch (e) { toast(e.message, 'error'); }
  },

  render() {
    const canEdit = Auth.can('admin', 'pharmacist');
    const canDelete = Auth.can('admin');
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Suppliers ${this.meta ? `(${this.meta.total})` : ''}</span>
          <div class="btn-group">
            <input type="text" class="form-control" style="width:260px;" placeholder="Search name, contact, drugs…" id="sup-search" value="${esc(this.search)}">
            ${canEdit ? `<button class="btn btn-primary" onclick="SuppliersView.openForm()">+ New Supplier</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          ${this.suppliers.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-text">No suppliers found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Drugs Supplied</th><th>Email / Phone</th><th>Payment Terms</th><th>Orders</th><th>Status</th><th>Actions</th></tr></thead>
               <tbody>${this.suppliers.map((s) => `<tr>
                <td><strong>${esc(s.name)}</strong>${s.address ? `<br><small style="color:var(--text-muted)">${esc(s.address)}</small>` : ''}</td>
                <td>${esc(s.contactPerson || '—')}</td>
                <td>${s.drugsSupplied ? s.drugsSupplied.split(',').map(d => `<span class="badge" style="background:#e0f2fe; color:#0369a1; margin:2px 2px 2px 0; display:inline-block; font-size:11px;">${esc(d.trim())}</span>`).join(' ') : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td>${esc(s.email || '—')}${s.phone ? `<br><small style="color:var(--text-muted)">${esc(s.phone)}</small>` : ''}</td>
                <td>${esc(s.paymentTerms || 'NET 30')}</td>
                <td>${s.orderCount ?? '—'}</td>
                <td><span class="badge ${s.isActive ? 'badge-success' : 'badge-danger'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  ${canEdit ? `<button class="btn btn-sm" onclick="SuppliersView.edit(${s.id})">Edit</button>` : ''}
                  ${canDelete && s.isActive ? `<button class="btn btn-sm btn-danger" onclick="SuppliersView.remove(${s.id})">Deactivate</button>` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
      ${this.formOpen ? this.formHtml() : ''}
    `;
  },

  mount() {
    const search = document.getElementById('sup-search');
    if (search) search.addEventListener('input', debounce(() => { this.search = search.value; this.meta = { ...(this.meta || {}), page: 1 }; App.refresh(); }, 350));
  },

  formHtml() {
    const e = this.editing || {};
    return `
      <div class="card" id="supplier-form-card">
        <div class="card-header"><span class="card-title">${this.editing ? 'Edit' : 'New'} Supplier</span></div>
        <div class="card-body">
          <form onsubmit="SuppliersView.save(event)">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 16px;">
              <div class="form-group"><label>Name *</label><input class="form-control" name="name" value="${esc(e.name || '')}" required minlength="2"></div>
              <div class="form-group"><label>Contact Person</label><input class="form-control" name="contactPerson" value="${esc(e.contactPerson || '')}"></div>
              <div class="form-group"><label>Email</label><input class="form-control" name="email" type="email" value="${esc(e.email || '')}"></div>
              <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${esc(e.phone || '')}"></div>
              <div class="form-group" style="grid-column:1/-1;"><label>Address</label><textarea class="form-control" name="address" rows="2">${esc(e.address || '')}</textarea></div>
              <div class="form-group"><label>Tax ID</label><input class="form-control" name="taxId" value="${esc(e.taxId || '')}"></div>
              <div class="form-group"><label>Payment Terms</label><input class="form-control" name="paymentTerms" value="${esc(e.paymentTerms || 'NET 30')}"></div>
              <div class="form-group" style="grid-column:1/-1;">
                <label>Drugs / Categories Supplied</label>
                <input class="form-control" name="drugsSupplied" placeholder="e.g. Amoxicillin, Paracetamol, Ibuprofen, Antibiotics" value="${esc(e.drugsSupplied || '')}">
                <small style="color:var(--text-muted)">List drug names, therapeutic categories, or brands provided by this supplier (comma-separated)</small>
              </div>
              <div class="form-group" style="grid-column:1/-1;"><label>Notes</label><textarea class="form-control" name="notes" rows="2">${esc(e.notes || '')}</textarea></div>
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" class="btn" onclick="SuppliersView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  openForm() { this.editing = null; this.formOpen = true; this.rerenderForm(); },
  closeForm() { this.formOpen = false; this.editing = null; App.refresh(); },
  edit(id) {
    const s = this.suppliers.find((x) => x.id === id);
    if (!s) return;
    this.editing = s; this.formOpen = true; this.rerenderForm();
  },

  rerenderForm() {
    const existing = document.getElementById('supplier-form-card');
    if (existing) existing.remove();
    document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml());
    document.getElementById('supplier-form-card').scrollIntoView({ behavior: 'smooth' });
  },

  async remove(id) {
    confirmDialog('Deactivate supplier', 'The supplier will be marked inactive. Existing purchase orders are kept. Continue?', async () => {
      try { await API.del(`/suppliers/${id}`); toast('Supplier deactivated', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const data = {
      name: raw.name,
      contactPerson: raw.contactPerson || null,
      email: raw.email || null,
      phone: raw.phone || null,
      address: raw.address || null,
      taxId: raw.taxId || null,
      paymentTerms: raw.paymentTerms || 'NET 30',
      drugsSupplied: raw.drugsSupplied || null,
      notes: raw.notes || null,
    };
    try {
      if (this.editing) { await API.patch(`/suppliers/${this.editing.id}`, data); toast('Supplier updated', 'success'); }
      else { await API.post('/suppliers', data); toast('Supplier created', 'success'); }
      this.formOpen = false; this.editing = null; App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },
};
