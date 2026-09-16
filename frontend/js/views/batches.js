/**
 * Batch management: list with filters, direct stock intake, signed
 * adjustments and expiry write-offs.
 */
var BatchesView = {
  batches: [],
  meta: null,
  search: '',
  inStockOnly: true,
  showForm: false,

  async load() {
    try {
      const res = await API.get(`/batches${API.qs({ page: this.meta?.page || 1, limit: 20, search: this.search, inStockOnly: this.inStockOnly })}`);
      const { items, meta } = API.list(res);
      this.batches = items;
      this.meta = meta;
    } catch (e) { toast(e.message, 'error'); }
  },

  render() {
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Batches ${this.meta ? `(${this.meta.total})` : ''}</span>
          <div class="btn-group">
            <input type="text" class="form-control" style="width:200px;" placeholder="Search batch / medicine…" id="batch-search" value="${esc(this.search)}">
            <label class="form-check" style="font-size:13px;">
              <input type="checkbox" id="batch-instock" ${this.inStockOnly ? 'checked' : ''}> In stock only
            </label>
            <button class="btn btn-primary" onclick="BatchesView.openForm()">+ Receive Stock</button>
          </div>
        </div>
        <div class="card-body">
          ${this.batches.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No batches found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch #</th><th>Mfg Date</th><th>Expiry</th><th>Qty</th><th>Cost</th><th>Sell</th><th>Location</th><th>Actions</th></tr></thead>
               <tbody>${this.batches.map((b) => `<tr>
                <td><strong>${esc(b.medicine?.name || '—')}</strong><br><small style="color:var(--text-muted)">${esc(b.medicine?.sku || '')}</small></td>
                <td>${esc(b.batchNumber)}</td>
                <td>${fmtDate(b.manufacturingDate)}</td>
                <td>${expiryBadge(b.expiryDate)}<br><small>${fmtDate(b.expiryDate)}</small></td>
                <td><span class="badge ${b.quantity <= 0 ? 'badge-danger' : b.quantity <= 20 ? 'badge-warning' : 'badge-success'}">${b.quantity}</span></td>
                <td>${fmtCurrency(b.unitCost)}</td>
                <td>${fmtCurrency(b.sellingPrice)}</td>
                <td>${esc(b.storageLocation || '—')}</td>
                <td>
                  <button class="btn btn-sm" onclick="BatchesView.adjust(${b.id})">Adjust</button>
                  ${b.quantity > 0 ? `<button class="btn btn-sm btn-warning" onclick="BatchesView.writeOff(${b.id})">Write-off</button>` : ''}
                  ${b.quantity <= 0 ? `<button class="btn btn-sm btn-danger" onclick="BatchesView.remove(${b.id})">Delete</button>` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
      ${this.showForm ? this.formHtml() : ''}
    `;
  },

  mount() {
    const search = document.getElementById('batch-search');
    if (search) search.addEventListener('input', debounce(() => { this.search = search.value; this.meta = { ...(this.meta || {}), page: 1 }; App.refresh(); }, 350));
    const inStock = document.getElementById('batch-instock');
    if (inStock) inStock.addEventListener('change', () => { this.inStockOnly = inStock.checked; App.refresh(); });
  },

  formHtml() {
    return `
      <div class="card" id="batch-form-card">
        <div class="card-header"><span class="card-title">Receive New Stock (Batch)</span></div>
        <div class="card-body">
          <form onsubmit="BatchesView.save(event)">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 16px;">
              <div class="form-group"><label>Medicine *</label>
                <select class="form-control" name="medicineId" required>
                  <option value="">— Select medicine —</option>
                  ${this._medicines.map((m) => `<option value="${m.id}">${esc(m.name)} (${esc(m.sku)})</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Batch Number *</label><input class="form-control" name="batchNumber" required maxlength="64" placeholder="BATCH-2026-001"></div>
              <div class="form-group"><label>Manufacturing Date *</label><input class="form-control" name="manufacturingDate" type="date" required></div>
              <div class="form-group"><label>Expiry Date *</label><input class="form-control" name="expiryDate" type="date" required></div>
              <div class="form-group"><label>Quantity *</label><input class="form-control" name="quantity" type="number" min="1" required></div>
              <div class="form-group"><label>Unit Cost *</label><input class="form-control" name="unitCost" type="number" step="0.01" min="0" required></div>
              <div class="form-group"><label>Selling Price *</label><input class="form-control" name="sellingPrice" type="number" step="0.01" min="0" required></div>
              <div class="form-group"><label>Storage Location</label><input class="form-control" name="storageLocation" maxlength="60" placeholder="Shelf A-3"></div>
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Receive</button>
              <button type="button" class="btn" onclick="BatchesView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  openForm() {
    // Need the medicine list for the dropdown — fetch then render.
    API.get('/medicines?limit=200').then((res) => {
      this._medicines = API.list(res).items;
      this.showForm = true;
      const existing = document.getElementById('batch-form-card');
      if (existing) existing.remove();
      document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml());
      document.getElementById('batch-form-card').scrollIntoView({ behavior: 'smooth' });
    }).catch((e) => toast(e.message, 'error'));
  },

  closeForm() { this.showForm = false; App.refresh(); },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const data = {
      medicineId: Number(raw.medicineId),
      batchNumber: raw.batchNumber,
      manufacturingDate: raw.manufacturingDate,
      expiryDate: raw.expiryDate,
      quantity: Number(raw.quantity),
      unitCost: Number(raw.unitCost),
      sellingPrice: Number(raw.sellingPrice),
      storageLocation: raw.storageLocation || undefined,
    };
    try {
      await API.post('/batches', data);
      toast('Stock received', 'success');
      this.showForm = false;
      App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },

  /** Signed adjustment: positive adds, negative removes. */
  adjust(id) {
    App.showModal('Adjust stock', `
      <form onsubmit="BatchesView.submitAdjust(event, ${id})">
        <div class="form-group">
          <label>Quantity delta (use − to reduce)</label>
          <input class="form-control" name="delta" type="number" required autofocus>
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input class="form-control" name="reason" maxlength="255" placeholder="Damaged, stock count, …">
        </div>
        <div class="btn-group" style="justify-content:flex-end;">
          <button type="button" class="btn" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Apply</button>
        </div>
      </form>
    `);
  },

  async submitAdjust(e, id) {
    e.preventDefault();
    const raw = formToObject(e.target);
    try {
      await API.patch(`/batches/${id}/adjust`, { delta: Number(raw.delta), reason: raw.reason || undefined });
      toast('Stock adjusted', 'success');
      App.closeModal();
      App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },

  writeOff(id) {
    confirmDialog('Write off batch', 'All remaining stock in this batch will be removed (expired / recalled goods). Continue?', async () => {
      try { await API.post(`/batches/${id}/write-off`, { reason: 'Expired or recalled' }); toast('Batch written off', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },

  async remove(id) {
    confirmDialog('Delete batch', 'Delete this empty batch record? This cannot be undone.', async () => {
      try { await API.del(`/batches/${id}`); toast('Batch deleted', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },
};
