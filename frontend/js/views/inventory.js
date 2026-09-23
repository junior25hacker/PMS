var InventoryView = {
  medicines: [],
  meta: null,
  search: '',
  type: '',
  lowStockOnly: false,
  showForm: false,
  editing: null,
  categories: [],

  async load() {
    try {
      const params = {
        page: this.meta?.page || 1,
        limit: 20,
        search: this.search,
        type: this.type,
      };
      if (this.lowStockOnly) params.lowStock = true;
      const res = await API.get(`/medicines${API.qs(params)}`);
      const { items, meta } = API.list(res);
      this.medicines = items;
      this.meta = meta;
    } catch (e) { toast(e.message, 'error'); }

    if (this.categories.length === 0) {
      try { this.categories = await API.get('/categories'); } catch { /* optional */ }
    }
  },

  toggleLowStock() {
    this.lowStockOnly = !this.lowStockOnly;
    if (this.meta) this.meta.page = 1;
    App.refresh();
  },

  render() {
    const canEdit = Auth.can('admin', 'pharmacist');
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Medicines ${this.meta ? `(${this.meta.total})` : ''}</span>
          <div class="btn-group">
            <button class="btn btn-sm ${this.lowStockOnly ? 'btn-warning' : 'btn-secondary'}" onclick="InventoryView.toggleLowStock()" style="display:inline-flex; align-items:center; gap:4px;">
              <span>${this.lowStockOnly ? '✓' : '⚠️'}</span> ${this.lowStockOnly ? 'Low Stock Filter Active' : 'Low Stock Only'}
            </button>
            <input type="text" class="form-control" style="width:200px;" placeholder="Search name, SKU, barcode…" id="inv-search" value="${esc(this.search)}">
            <select class="form-control" style="width:140px;" id="inv-type">
              <option value="">All types</option>
              <option value="otc" ${this.type === 'otc' ? 'selected' : ''}>OTC</option>
              <option value="prescription" ${this.type === 'prescription' ? 'selected' : ''}>Prescription</option>
              <option value="controlled" ${this.type === 'controlled' ? 'selected' : ''}>Controlled</option>
            </select>
            ${canEdit ? `<button class="btn btn-primary" onclick="InventoryView.openForm()">+ New Medicine</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          ${this.medicines.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">💊</div><div class="empty-state-text">No medicines found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Type</th><th>Stock</th><th>Price</th><th>Expiry</th><th>Actions</th></tr></thead>
               <tbody>${this.medicines.map((m) => `<tr>
                <td><strong>${esc(m.name)}</strong><br><small style="color:var(--text-muted)">${esc(m.genericName || '')} ${esc(m.strength || '')}</small></td>
                <td>${esc(m.sku)}</td><td>${esc(m.categoryName || '—')}</td>
                <td><span class="badge ${m.type === 'controlled' ? 'badge-danger' : m.type === 'prescription' ? 'badge-warning' : 'badge-info'}">${esc(m.type)}</span></td>
                <td>${stockBadge(m.totalStock, m.reorderLevel)}</td>
                <td>${m.sellingPrice != null ? fmtCurrency(m.sellingPrice) : '—'}</td>
                <td>${expiryBadge(m.nearestExpiry)}</td>
                <td>
                  <button class="btn btn-sm" onclick="InventoryView.detail(${m.id})">Details</button>
                  ${(canEdit && m.totalStock <= m.reorderLevel) ? `<button class="btn btn-sm btn-primary" onclick="PurchasesView.startRestock(${m.id})">Restock</button>` : ''}
                  ${canEdit ? `<button class="btn btn-sm" onclick="InventoryView.edit(${m.id})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="InventoryView.remove(${m.id})">✕</button>` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
      ${this.showForm ? this.formHtml() : ''}
    `;
  },

  mount() {
    const search = document.getElementById('inv-search');
    if (search) search.addEventListener('input', debounce(() => { this.search = search.value; this.meta = { ...(this.meta || {}), page: 1 }; App.refresh(); }, 350));
    const type = document.getElementById('inv-type');
    if (type) type.addEventListener('change', () => { this.type = type.value; this.meta = { ...(this.meta || {}), page: 1 }; App.refresh(); });
  },

  formHtml() {
    const e = this.editing || {};
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">${this.editing ? 'Edit' : 'New'} Medicine</span></div>
        <div class="card-body">
          <form id="medicine-form" onsubmit="InventoryView.save(event)">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 16px;">
              <div class="form-group"><label>Name *</label><input class="form-control" name="name" value="${esc(e.name || '')}" required minlength="2"></div>
              <div class="form-group"><label>SKU *</label><input class="form-control" name="sku" value="${esc(e.sku || '')}" required minlength="2"></div>
              <div class="form-group"><label>Generic Name</label><input class="form-control" name="genericName" value="${esc(e.genericName || '')}"></div>
              <div class="form-group"><label>Manufacturer</label><input class="form-control" name="manufacturer" value="${esc(e.manufacturer || '')}"></div>
              <div class="form-group"><label>Barcode</label><input class="form-control" name="barcode" value="${esc(e.barcode || '')}"></div>
              <div class="form-group"><label>Strength</label><input class="form-control" name="strength" placeholder="e.g. 500mg" value="${esc(e.strength || '')}"></div>
              <div class="form-group"><label>Category</label>
                <select class="form-control" name="categoryId">
                  <option value="">— None —</option>
                  ${this.categories.map((c) => `<option value="${c.id}" ${e.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Type</label>
                <select class="form-control" name="type">
                  <option value="otc" ${!e.type || e.type === 'otc' ? 'selected' : ''}>OTC</option>
                  <option value="prescription" ${e.type === 'prescription' ? 'selected' : ''}>Prescription</option>
                  <option value="controlled" ${e.type === 'controlled' ? 'selected' : ''}>Controlled</option>
                </select>
              </div>
              <div class="form-group"><label>Dosage Form</label><input class="form-control" name="dosageForm" placeholder="tablet" value="${esc(e.dosageForm || 'tablet')}"></div>
              <div class="form-group"><label>Unit</label><input class="form-control" name="unit" placeholder="unit" value="${esc(e.unit || 'unit')}"></div>
              <div class="form-group"><label>Reorder Level</label><input class="form-control" name="reorderLevel" type="number" min="0" value="${e.reorderLevel ?? 20}"></div>
              <div class="form-group"><label>Tax Rate (0–1)</label><input class="form-control" name="taxRate" type="number" step="0.0001" min="0" max="1" value="${e.taxRate ?? 0.12}"></div>
            </div>
            <div class="form-group"><label>Description</label><textarea class="form-control" name="description" rows="2">${esc(e.description || '')}</textarea></div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" class="btn" onclick="InventoryView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  openForm() { this.editing = null; this.showForm = true; this.renderForm(); },
  closeForm() { this.showForm = false; this.editing = null; App.refresh(); },
  edit(id) {
    const m = this.medicines.find((x) => x.id === id);
    if (!m) return;
    this.editing = m; this.showForm = true; this.renderForm();
  },

  /** Re-renders just the form card so the list state isn't lost. */
  renderForm() {
    const existing = document.getElementById('medicine-form-card');
    if (existing) existing.remove();
    document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml().replace('<div class="card">', '<div class="card" id="medicine-form-card">'));
    document.getElementById('medicine-form-card').scrollIntoView({ behavior: 'smooth' });
  },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const data = {
      name: raw.name,
      sku: raw.sku.toUpperCase(),
      genericName: raw.genericName || null,
      manufacturer: raw.manufacturer || null,
      barcode: raw.barcode || null,
      strength: raw.strength || null,
      dosageForm: raw.dosageForm || 'tablet',
      unit: raw.unit || 'unit',
      categoryId: raw.categoryId ? Number(raw.categoryId) : null,
      type: raw.type || 'otc',
      reorderLevel: Number(raw.reorderLevel) || 20,
      taxRate: raw.taxRate !== '' ? Number(raw.taxRate) : 0.12,
      description: raw.description || null,
    };
    try {
      if (this.editing) { await API.patch(`/medicines/${this.editing.id}`, data); toast('Medicine updated', 'success'); }
      else { await API.post('/medicines', data); toast('Medicine created', 'success'); }
      this.showForm = false; this.editing = null; App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },

  async remove(id) {
    confirmDialog('Discontinue medicine', 'This will soft-delete the product. Continue?', async () => {
      try { await API.del(`/medicines/${id}`); toast('Medicine discontinued', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },

  /** Product detail with its batch list — the stock + expiry drill-down. */
  async detail(id) {
    try {
      const med = await API.get(`/medicines/${id}`);
      const canEdit = Auth.can('admin', 'pharmacist');
      App.showModal(`${esc(med.name)} — ${esc(med.sku)}`, `
        <div style="margin-bottom:12px;">
          <span class="badge badge-info">${esc(med.type)}</span>
          ${med.categoryName ? `<span class="badge badge-primary">${esc(med.categoryName)}</span>` : ''}
          <span class="badge ${med.isActive ? 'badge-success' : 'badge-danger'}">${med.isActive ? 'Active' : 'Discontinued'}</span>
        </div>
        <table style="margin-bottom:16px;">
          <tr><td><strong>Generic</strong></td><td>${esc(med.genericName || '—')}</td></tr>
          <tr><td><strong>Manufacturer</strong></td><td>${esc(med.manufacturer || '—')}</td></tr>
          <tr><td><strong>Barcode</strong></td><td>${esc(med.barcode || '—')}</td></tr>
          <tr><td><strong>Reorder level</strong></td><td>${med.reorderLevel}</td></tr>
          <tr><td><strong>Tax rate</strong></td><td>${(med.taxRate * 100).toFixed(1)}%</td></tr>
          <tr><td><strong>Total stock</strong></td><td>${stockBadge(med.totalStock, med.reorderLevel)}</td></tr>
        </table>
        <h4 style="margin-bottom:8px;">Batches (FEFO order)</h4>
        ${(med.batches || []).length === 0
          ? '<div class="empty-state-text">No batches yet — receive stock via a purchase order or add one directly.</div>'
          : `<div class="table-wrap"><table><thead><tr><th>Batch #</th><th>Expiry</th><th>Qty</th><th>Cost</th><th>Price</th><th>Supplier</th>${canEdit ? '<th></th>' : ''}</tr></thead>
             <tbody>${med.batches.map((b) => `<tr>
              <td>${esc(b.batchNumber)}</td>
              <td>${expiryBadge(b.expiryDate)} ${fmtDate(b.expiryDate)}</td>
              <td>${b.quantity}</td>
              <td>${fmtCurrency(b.unitCost)}</td>
              <td>${fmtCurrency(b.sellingPrice)}</td>
              <td>${esc(b.supplier?.name || '—')}</td>
              ${canEdit ? `<td><button class="btn btn-sm" onclick="App.closeModal(); BatchesView.adjust(${b.id})">Adjust</button></td>` : ''}
            </tr>`).join('')}</tbody></table></div>`}
      `, true);
    } catch (e) { toast(e.message, 'error'); }
  },
};
