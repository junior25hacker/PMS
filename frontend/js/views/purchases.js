/**
 * Purchase orders: create with a line-item builder, advance status,
 * receive goods (creates batches and updates inventory automatically) and cancel.
 */
var PurchasesView = {
  orders: [],
  meta: null,
  statusFilter: '',
  formOpen: false,
  editingId: null,
  suppliers: [],
  medicines: [],
  lines: [],
  supplierId: '',
  orderDate: '',
  expectedDate: '',
  notes: '',

  async load() {
    try {
      const params = { page: this.meta?.page || 1, limit: 20 };
      if (this.statusFilter) params.status = this.statusFilter;
      const res = await API.get(`/purchase-orders${API.qs(params)}`);
      const { items, meta } = API.list(res);
      this.orders = items;
      this.meta = meta;
    } catch (e) { toast(e.message, 'error'); }
  },

  setStatusFilter(status) {
    this.statusFilter = status;
    if (this.meta) this.meta.page = 1;
    App.refresh();
  },

  render() {
    return `
      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span class="card-title">Purchase Orders ${this.meta ? `(${this.meta.total})` : ''}</span>
            <div class="btn-group" style="margin:0;">
              <button class="btn btn-sm ${!this.statusFilter ? 'btn-primary' : ''}" onclick="PurchasesView.setStatusFilter('')">All</button>
              <button class="btn btn-sm ${this.statusFilter === 'draft' ? 'btn-primary' : ''}" onclick="PurchasesView.setStatusFilter('draft')">Draft</button>
              <button class="btn btn-sm ${this.statusFilter === 'sent' ? 'btn-primary' : ''}" onclick="PurchasesView.setStatusFilter('sent')">Sent</button>
              <button class="btn btn-sm ${this.statusFilter === 'received' ? 'btn-primary' : ''}" onclick="PurchasesView.setStatusFilter('received')">Received</button>
            </div>
          </div>
          <div class="btn-group" style="margin:0;">
            <button class="btn btn-secondary" onclick="PurchasesView.openRestockModal()" style="display:inline-flex; align-items:center; gap:6px;">
              <span>⚡</span> Restock Low Stock
            </button>
            <button class="btn btn-primary" onclick="PurchasesView.openForm()">+ New PO</button>
          </div>
        </div>
        <div class="card-body">
          ${this.orders.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No purchase orders found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>PO #</th><th>Supplier</th><th>Order Date</th><th>Expected</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead>
               <tbody>${this.orders.map((po) => `<tr>
                <td><strong>${esc(po.poNumber)}</strong></td>
                <td>${esc(po.supplier?.name || '—')}</td>
                <td>${fmtDate(po.orderDate)}</td>
                <td>${fmtDate(po.expectedDate)}</td>
                <td>${poStatusBadge(po.status)}</td>
                <td><strong>${fmtCurrency(po.totalAmount)}</strong></td>
                <td>
                  <button class="btn btn-sm" onclick="PurchasesView.view(${po.id})">View</button>
                  ${po.status === 'draft' ? `
                    <button class="btn btn-sm btn-primary" onclick="PurchasesView.sendOrder(${po.id})">Send</button>
                    <button class="btn btn-sm" onclick="PurchasesView.edit(${po.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="PurchasesView.remove(${po.id})">Delete</button>
                  ` : ''}
                  ${(po.status === 'sent' || po.status === 'ordered' || po.status === 'partially_received') ? `
                    <button class="btn btn-sm btn-success" onclick="PurchasesView.openReceive(${po.id})">Receive</button>
                    <button class="btn btn-sm btn-warning" onclick="PurchasesView.cancel(${po.id})">Cancel</button>
                  ` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
      ${this.formOpen ? this.formHtml() : ''}
    `;
  },

  // ---------------------------------------------------------------------------
  // Restock Assistant for Low Stock Drugs
  // ---------------------------------------------------------------------------

  async openRestockModal() {
    try {
      let suggestions = [];
      try {
        suggestions = await API.get('/purchase-orders/suggestions/low-stock');
      } catch {
        const medRes = await API.get('/medicines?lowStock=true&limit=100');
        const meds = API.list(medRes).items;
        suggestions = meds.map((m) => ({
          medicineId: m.id,
          name: m.name,
          sku: m.sku,
          totalStock: m.totalStock,
          reorderLevel: m.reorderLevel,
          suggestedQuantity: Math.max((m.reorderLevel || 20) * 2 - (m.totalStock || 0), 20),
          recommendedSuppliers: [],
        }));
      }

      if (!suggestions || suggestions.length === 0) {
        App.showModal('Restock Low Stock Drugs', `
          <div class="empty-state">
            <div class="empty-state-icon">✅</div>
            <div class="empty-state-text" style="font-size:16px; font-weight:600; margin-top:8px;">All Medicines Well Stocked</div>
            <p style="color:var(--text-muted); margin-top:6px;">No drugs are currently at or below their reorder level.</p>
          </div>
        `);
        return;
      }

      App.showModal('Restock Low Stock Drugs', `
        <p style="margin-bottom:12px; color:var(--text-muted); font-size:13px;">
          The following <strong>${suggestions.length}</strong> drug(s) require restocking. The system has automatically matched each drug to its recommended supplier based on supplier catalog and previous supply history.
        </p>
        <div class="table-wrap" style="max-height:420px; overflow-y:auto; margin-bottom:16px;">
          <table>
            <thead>
              <tr>
                <th>Drug</th>
                <th>Current Stock</th>
                <th>Reorder Level</th>
                <th>Suggested Order</th>
                <th>Recommended Supplier</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${suggestions.map((s) => {
                const best = s.recommendedSuppliers && s.recommendedSuppliers.length > 0 ? s.recommendedSuppliers[0] : null;
                return `
                  <tr>
                    <td><strong>${esc(s.name)}</strong><br><small style="color:var(--text-muted)">${esc(s.sku)}</small></td>
                    <td><span class="badge ${s.totalStock <= 0 ? 'badge-danger' : 'badge-warning'}">${s.totalStock <= 0 ? 'Out of stock (0)' : `Low (${s.totalStock})`}</span></td>
                    <td>${s.reorderLevel}</td>
                    <td><strong>${s.suggestedQuantity} units</strong></td>
                    <td>
                      ${best ? `
                        <strong>${esc(best.name)}</strong>
                        <br><small style="color:var(--primary);">${esc(best.matchReason || '')}</small>
                      ` : '<span style="color:var(--text-muted)">Any active supplier</span>'}
                    </td>
                    <td>
                      <button class="btn btn-sm btn-primary" onclick="App.closeModal(); PurchasesView.startRestock(${s.medicineId}, ${best ? best.id : 'null'}, ${s.suggestedQuantity})">
                        Restock
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="btn-group" style="justify-content:flex-end;">
          <button class="btn" onclick="App.closeModal()">Close</button>
        </div>
      `, true);
    } catch (e) { toast(e.message, 'error'); }
  },

  async startRestock(medicineId, supplierId = null, suggestedQty = null) {
    if (App.currentRoute !== 'purchases') {
      window.location.hash = '#purchases';
    }
    await this.openForm(null);

    if (supplierId) {
      this.supplierId = String(supplierId);
    }

    if (medicineId) {
      const med = this.medicines.find((m) => m.id === Number(medicineId));
      const qty = suggestedQty || (med ? Math.max((med.reorderLevel || 20) * 2 - (med.totalStock || 0), 20) : 20);
      const unitCost = med && med.unitCost ? med.unitCost : 0;
      this.lines = [{
        medicineId: String(medicineId),
        quantity: qty,
        unitCost: unitCost,
        batchNumber: '',
        expiryDate: '',
      }];
    }
    this.rerenderForm();
  },

  // ---------------------------------------------------------------------------
  // Create / edit form with dynamic line items
  // ---------------------------------------------------------------------------

  async openForm(editId = null) {
    try {
      const [supRes, medRes] = await Promise.all([
        API.get('/suppliers?limit=200'),
        API.get('/medicines?limit=200'),
      ]);
      this.suppliers = API.list(supRes).items;
      this.medicines = API.list(medRes).items;
      this.editingId = editId;
      this.lines = [];

      if (editId) {
        const po = await API.get(`/purchase-orders/${editId}`);
        this.supplierId = String(po.supplierId);
        this.orderDate = po.orderDate;
        this.expectedDate = po.expectedDate || '';
        this.notes = po.notes || '';
        this.lines = po.items.map((i) => ({
          medicineId: String(i.medicineId),
          quantity: i.quantity,
          unitCost: i.unitCost,
          batchNumber: i.batchNumber || '',
          expiryDate: i.expiryDate || '',
        }));
      } else {
        this.supplierId = '';
        this.orderDate = todayISO();
        this.expectedDate = '';
        this.notes = '';
      }

      this.formOpen = true;
      App.refresh();
    } catch (e) { toast(e.message, 'error'); }
  },

  onSupplierChange(supplierId) {
    this.supplierId = String(supplierId);
    this.rerenderForm();
  },

  formHtml() {
    const total = this.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
    const selectedSupplier = this.suppliers.find((s) => String(s.id) === String(this.supplierId));

    return `
      <div class="card" id="po-form-card">
        <div class="card-header"><span class="card-title">${this.editingId ? 'Edit' : 'New'} Purchase Order</span></div>
        <div class="card-body">
          <form onsubmit="PurchasesView.save(event)">
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0 16px;">
              <div class="form-group"><label>Supplier *</label>
                <select class="form-control" name="supplierId" onchange="PurchasesView.onSupplierChange(this.value)" required>
                  <option value="">— Select supplier —</option>
                  ${this.suppliers.map((s) => `<option value="${s.id}" ${this.supplierId === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
                </select>
                ${selectedSupplier?.drugsSupplied ? `
                  <div style="margin-top:6px; font-size:12px; color:var(--text-muted);">
                    <strong>Catalog:</strong>
                    ${selectedSupplier.drugsSupplied.split(',').map((d) => `<span class="badge" style="background:#e0f2fe; color:#0369a1; margin:1px 2px; font-size:10px;">${esc(d.trim())}</span>`).join(' ')}
                  </div>
                ` : ''}
              </div>
              <div class="form-group"><label>Order Date *</label><input class="form-control" name="orderDate" type="date" value="${esc(this.orderDate)}" required></div>
              <div class="form-group"><label>Expected Date</label><input class="form-control" name="expectedDate" type="date" value="${esc(this.expectedDate)}"></div>
              <div class="form-group"><label>Notes</label><input class="form-control" name="notes" value="${esc(this.notes)}"></div>
            </div>

            <h4 style="margin:12px 0 6px 0;">Line Items</h4>
            <div class="table-wrap">
              <table>
                <thead><tr><th style="min-width:240px;">Medicine *</th><th style="width:110px;">Qty *</th><th style="width:120px;">Unit Cost *</th><th style="min-width:140px;">Batch #</th><th style="width:150px;">Expiry (for receiving)</th><th style="width:110px;">Line Total</th><th style="width:40px;"></th></tr></thead>
                <tbody id="po-lines">
                  ${this.lines.map((line, i) => this.lineHtml(line, i, selectedSupplier)).join('')}
                </tbody>
              </table>
            </div>
            <div class="btn-group" style="margin:8px 0;">
              <button type="button" class="btn btn-sm" onclick="PurchasesView.addLine()">+ Add item</button>
            </div>
            <div class="pos-total-grand" style="text-align:right;">Total: ${fmtCurrency(total)}</div>

            <div class="btn-group" style="margin-top:12px;">
              <button type="submit" class="btn btn-primary">${this.editingId ? 'Save changes' : 'Create Draft PO'}</button>
              <button type="button" class="btn" onclick="PurchasesView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  lineHtml(line, i, selectedSupplier = null) {
    const drugsText = (selectedSupplier?.drugsSupplied || '').toLowerCase();

    return `<tr>
      <td><select class="form-control" onchange="PurchasesView.setLine(${i}, 'medicineId', this.value)" required>
        <option value="">— Select drug —</option>
        ${this.medicines.map((m) => {
          const isMatch = drugsText && (
            drugsText.includes(m.name.toLowerCase()) ||
            (m.genericName && drugsText.includes(m.genericName.toLowerCase()))
          );
          const isLow = (m.totalStock || 0) <= (m.reorderLevel || 20);
          return `<option value="${m.id}" ${line.medicineId === String(m.id) ? 'selected' : ''}>
            ${esc(m.name)} (${esc(m.sku)})${isMatch ? ' ★ Supplied' : ''}${isLow ? ' ⚠️ Low' : ''}
          </option>`;
        }).join('')}
      </select></td>
      <td><input class="form-control" type="number" min="1" value="${line.quantity}" onchange="PurchasesView.setLine(${i}, 'quantity', this.value)" required></td>
      <td><input class="form-control" type="number" step="0.01" min="0" value="${line.unitCost}" onchange="PurchasesView.setLine(${i}, 'unitCost', this.value)" required></td>
      <td><input class="form-control" type="text" maxlength="64" value="${esc(line.batchNumber)}" onchange="PurchasesView.setLine(${i}, 'batchNumber', this.value)" placeholder="optional"></td>
      <td><input class="form-control" type="date" value="${line.expiryDate}" onchange="PurchasesView.setLine(${i}, 'expiryDate', this.value)"></td>
      <td>${fmtCurrency((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}</td>
      <td><button type="button" class="cart-line-remove" onclick="PurchasesView.removeLine(${i})">×</button></td>
    </tr>`;
  },

  addLine() {
    this.lines.push({ medicineId: '', quantity: 20, unitCost: 0, batchNumber: '', expiryDate: '' });
    this.rerenderForm();
  },

  removeLine(i) {
    this.lines.splice(i, 1);
    this.rerenderForm();
  },

  setLine(i, field, value) {
    if (!this.lines[i]) return;
    this.lines[i][field] = value;
    if (field === 'medicineId') {
      const med = this.medicines.find((m) => m.id === Number(value));
      if (med && med.unitCost && (!this.lines[i].unitCost || this.lines[i].unitCost === 0)) {
        this.lines[i].unitCost = med.unitCost;
      }
    }
    if (['quantity', 'unitCost', 'medicineId'].includes(field)) this.rerenderForm();
  },

  rerenderForm() {
    const existing = document.getElementById('po-form-card');
    if (existing) {
      existing.outerHTML = this.formHtml().replace('<div class="card">', '<div class="card" id="po-form-card">');
      document.getElementById('po-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  openFormNew() { this.openForm(null); },

  closeForm() {
    this.formOpen = false;
    this.editingId = null;
    App.refresh();
  },

  async save(e) {
    e.preventDefault();
    if (this.lines.length === 0) { toast('Add at least one drug line item', 'error'); return; }
    const form = e.target;
    const data = {
      supplierId: Number(form.supplierId.value),
      orderDate: form.orderDate.value,
      expectedDate: form.expectedDate.value || undefined,
      notes: form.notes.value || undefined,
      items: this.lines
        .filter((l) => l.medicineId && Number(l.quantity) > 0)
        .map((l) => ({
          medicineId: Number(l.medicineId),
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
          batchNumber: l.batchNumber || undefined,
          expiryDate: l.expiryDate || undefined,
        })),
    };
    if (data.items.length === 0) { toast('Each line needs a medicine and quantity', 'error'); return; }
    try {
      if (this.editingId) {
        await API.patch(`/purchase-orders/${this.editingId}`, data);
        toast('Purchase order updated', 'success');
      } else {
        await API.post('/purchase-orders', data);
        toast('Draft purchase order created', 'success');
      }
      this.formOpen = false;
      this.editingId = null;
      App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },

  edit(id) { this.openForm(id); },

  // ---------------------------------------------------------------------------
  // Status lifecycle: Draft -> Sent -> Received
  // ---------------------------------------------------------------------------

  async sendOrder(id) {
    confirmDialog('Send purchase order', 'Mark this draft as sent and submit to the supplier?', async () => {
      try {
        await API.patch(`/purchase-orders/${id}/status`, { status: 'sent' });
        toast('Purchase order sent to supplier', 'success');
        App.refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  },

  async cancel(id) {
    confirmDialog('Cancel purchase order', 'This PO will be cancelled. Continue?', async () => {
      try {
        await API.post(`/purchase-orders/${id}/cancel`);
        toast('PO cancelled', 'success');
        App.refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  },

  async remove(id) {
    confirmDialog('Delete purchase order', 'Delete this draft PO permanently?', async () => {
      try {
        await API.del(`/purchase-orders/${id}`);
        toast('PO deleted', 'success');
        App.refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  },

  async openReceive(id) {
    try {
      const po = await API.get(`/purchase-orders/${id}`);
      const outstanding = (po.items || []).map((i) => ({ ...i, outstanding: i.quantity - i.receivedQuantity }))
        .filter((i) => i.outstanding > 0);
      if (outstanding.length === 0) { toast('Nothing outstanding on this PO', 'info'); return; }

      const defaultExpiry = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      App.showModal(`Receive Goods — ${po.poNumber}`, `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <p style="margin:0; font-size:13px; color:var(--text-muted);">
            Delivered items create stock batches and <strong>automatically update inventory</strong>.
          </p>
          <button type="button" class="btn btn-sm btn-secondary" onclick="PurchasesView.fillReceiveDefaults('${defaultExpiry}', '${po.poNumber}')">
            ⚡ Fill Defaults
          </button>
        </div>
        <form onsubmit="PurchasesView.submitReceive(event, ${po.id})">
          ${outstanding.map((i) => `
            <fieldset style="border:1px solid var(--border); border-radius:var(--radius); padding:10px; margin-bottom:10px;">
              <legend style="font-size:13px; padding:0 4px;"><strong>${esc(i.medicine?.name || `Item #${i.id}`)}</strong> — ordered: ${i.quantity}, received: ${i.receivedQuantity}</legend>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div class="form-group" style="margin-bottom:6px;"><label>Received qty (max ${i.outstanding})</label>
                  <input class="form-control" name="qty_${i.id}" type="number" min="0" max="${i.outstanding}" value="${i.outstanding}"></div>
                <div class="form-group" style="margin-bottom:6px;"><label>Batch # (auto if blank)</label>
                  <input class="form-control" name="batch_${i.id}" maxlength="64" value="${i.batchNumber || ''}" placeholder="${po.poNumber}-${i.id}"></div>
                <div class="form-group" style="margin-bottom:6px;"><label>Expiry date *</label>
                  <input class="form-control" name="expiry_${i.id}" type="date" value="${i.expiryDate || defaultExpiry}" required></div>
                <div class="form-group" style="margin-bottom:6px;"><label>Selling price</label>
                  <input class="form-control" name="price_${i.id}" type="number" step="0.01" min="0" placeholder="${(i.unitCost * 1.35).toFixed(2)} (35% markup)"></div>
              </div>
            </fieldset>`).join('')}
          <div class="btn-group" style="justify-content:flex-end;">
            <button type="button" class="btn" onclick="App.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-success">Receive Goods & Update Inventory</button>
          </div>
        </form>
      `, true);
    } catch (e) { toast(e.message, 'error'); }
  },

  fillReceiveDefaults(defaultExpiry, poNumber) {
    const modal = document.querySelector('.modal-content');
    if (!modal) return;
    modal.querySelectorAll('fieldset').forEach((fs) => {
      const expiryInput = fs.querySelector('input[name^="expiry_"]');
      if (expiryInput && !expiryInput.value) expiryInput.value = defaultExpiry;
      const batchInput = fs.querySelector('input[name^="batch_"]');
      if (batchInput && !batchInput.value) {
        const id = (batchInput.name || '').replace('batch_', '');
        batchInput.value = `${poNumber}-${id}`;
      }
    });
    toast('Filled default batch numbers and expiry dates', 'info');
  },

  async submitReceive(e, poId) {
    e.preventDefault();
    const form = e.target;
    const items = [];
    form.querySelectorAll('fieldset').forEach((fs) => {
      const qtyInput = fs.querySelector('input[name^="qty_"]');
      if (!qtyInput) return;
      const id = Number(qtyInput.name.replace('qty_', ''));
      const qty = Number(qtyInput.value) || 0;
      if (qty <= 0) return;
      items.push({
        itemId: id,
        receivedQuantity: qty,
        batchNumber: form.querySelector(`[name="batch_${id}"]`)?.value || undefined,
        expiryDate: form.querySelector(`[name="expiry_${id}"]`)?.value || undefined,
        sellingPrice: form.querySelector(`[name="price_${id}"]`)?.value ? Number(form.querySelector(`[name="price_${id}"]`).value) : undefined,
      });
    });

    if (items.length === 0) { toast('Enter a received quantity for at least one line', 'error'); return; }
    try {
      await API.post(`/purchase-orders/${poId}/receive`, { items });
      toast('Goods received! Inventory has been updated automatically.', 'success');
      App.closeModal();
      App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },

  // ---------------------------------------------------------------------------

  async view(id) {
    try {
      const po = await API.get(`/purchase-orders/${id}`);
      App.showModal(`PO ${esc(po.poNumber)}`, `
        <div style="margin-bottom:12px;">${poStatusBadge(po.status)}</div>
        <table style="margin-bottom:12px;">
          <tr><td><strong>Supplier</strong></td><td>${esc(po.supplier?.name || '—')}</td></tr>
          <tr><td><strong>Order Date</strong></td><td>${fmtDate(po.orderDate)}</td></tr>
          <tr><td><strong>Expected Date</strong></td><td>${fmtDate(po.expectedDate)}</td></tr>
          <tr><td><strong>Created By</strong></td><td>${esc(po.createdBy?.fullName || '—')}</td></tr>
          <tr><td><strong>Notes</strong></td><td>${esc(po.notes || '—')}</td></tr>
          <tr><td><strong>Total Amount</strong></td><td><strong>${fmtCurrency(po.totalAmount)}</strong></td></tr>
        </table>
        <h4 style="margin-bottom:8px;">Line Items & Stock Receipts</h4>
        <div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Ordered</th><th>Received</th><th>Cost</th><th>Total</th><th>Batch #</th></tr></thead>
        <tbody>${(po.items || []).map((i) => `<tr>
          <td>${esc(i.medicine?.name || '—')}</td>
          <td>${i.quantity}</td>
          <td>${i.receivedQuantity < i.quantity ? `<span class="badge badge-warning">${i.receivedQuantity}</span>` : `<span class="badge badge-success">${i.receivedQuantity}</span>`}</td>
          <td>${fmtCurrency(i.unitCost)}</td>
          <td>${fmtCurrency(i.lineTotal)}</td>
          <td>${esc(i.batchNumber || (i.batch?.batchNumber) || '—')}</td>
        </tr>`).join('')}</tbody></table></div>
      `, true);
    } catch (e) { toast(e.message, 'error'); }
  },
};
