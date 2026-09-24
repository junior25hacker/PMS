/**
 * Point of Sale: barcode/SKU/name lookup, cart with per-batch FEFO lines,
 * quantity caps against live stock, discount, payment method, change due,
 * and a printable receipt after checkout.
 */
var PosView = {
  cart: [],
  searchTerm: '',
  searchResults: [],
  catalog: [],
  discountType: 'fixed',   // 'fixed' | 'percentage'
  discountValue: 0,        // raw user input ($ or %)
  discountApprovalCode: '',
  customerName: '',
  customerPhone: '',
  paymentMethod: 'cash',
  amountPaid: null,
  lastReceipt: null,
  _catalogLoaded: false,
  APPROVAL_THRESHOLD: 10,  // % — must match backend constant

  async load() {
    if (!this._catalogLoaded) {
      try {
        const res = await API.get('/medicines?limit=200&isActive=true');
        this.catalog = API.list(res).items.filter((m) => m.totalStock > 0);
        this._catalogLoaded = true;
      } catch (e) { toast(e.message, 'error'); }
    }
  },

  render() {
    return `
      <div class="pos-layout">
        <div class="pos-left">
          <div class="pos-search">
            <input type="text" class="form-control" placeholder="Scan barcode, or search by name / SKU…" value="${esc(this.searchTerm)}"
              id="pos-search-input" autocomplete="off">
            <div id="pos-suggestions" class="pos-suggestions"></div>
          </div>
          <div class="pos-items" id="pos-catalog">
            ${this.catalog.map((m) => this.itemCard(m)).join('')}
          </div>
        </div>
        <div class="pos-cart">
          <div class="card-header" style="margin-bottom:8px;"><span class="card-title">Cart (${this.cart.length})</span>
            ${this.cart.length ? '<button class="btn btn-sm btn-danger" onclick="PosView.clearCart()">Clear</button>' : ''}
          </div>
          <div class="pos-cart-items" id="cart-items">${this.cartHtml()}</div>
          <div class="pos-total">
            <div class="pos-total-row"><span>Subtotal</span><span>${fmtCurrency(this.subtotal())}</span></div>
            <div class="pos-total-row"><span>Tax</span><span>${fmtCurrency(this.tax())}</span></div>

            <div class="pos-total-row pos-discount-row" style="align-items:flex-start; flex-direction:column; gap:6px;">
              <div style="display:flex; align-items:center; gap:8px; width:100%;">
                <span style="white-space:nowrap;">Discount</span>
                <select id="pos-discount-type" style="padding:3px 6px; width:110px;" onchange="PosView.discountType = this.value; PosView.discountValue = 0; App.refresh();">
                  <option value="fixed" ${this.discountType === 'fixed' ? 'selected' : ''}>$ Fixed</option>
                  <option value="percentage" ${this.discountType === 'percentage' ? 'selected' : ''}>% Percentage</option>
                </select>
                <input type="number" id="pos-discount-val" min="0" step="0.01"
                  max="${this.discountType === 'percentage' ? 100 : ''}"
                  value="${this.discountValue || ''}" style="width:80px; padding:3px 6px;"
                  placeholder="${this.discountType === 'percentage' ? '0–100' : '0.00'}"
                  onchange="PosView.setDiscount(this.value)">
                <span style="color:var(--text-muted); font-size:12px;">
                  ${this.discountType === 'percentage' && this.discountValue > 0 ? '= ' + fmtCurrency(this.discountAmount()) : ''}
                </span>
              </div>
              ${this.requiresApproval() ? `
                <div style="width:100%; display:flex; align-items:center; gap:8px;">
                  <span style="color:#b91c1c; font-size:12px; white-space:nowrap;">⚠️ Manager Code</span>
                  <input type="text" id="pos-approval-code" placeholder="Approval code required (>${this.APPROVAL_THRESHOLD}% discount)" style="flex:1; padding:3px 6px; border:1px solid #fca5a5; border-radius:4px;"
                    value="${esc(this.discountApprovalCode)}" oninput="PosView.discountApprovalCode = this.value">
                </div>` : ''}
            </div>

            <div class="pos-total-row"><span>Customer</span>
              <input type="text" id="pos-customer" placeholder="Walk-in" value="${esc(this.customerName)}" style="width:150px; padding:3px 6px;" onchange="PosView.customerName = this.value">
            </div>
            <div class="pos-total-row"><span>Payment</span>
              <select id="pos-payment" style="width:120px; padding:3px 6px;" onchange="PosView.paymentMethod = this.value; App.refresh();">
                <option value="cash" ${this.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
                <option value="card" ${this.paymentMethod === 'card' ? 'selected' : ''}>Card</option>
                <option value="mobile" ${this.paymentMethod === 'mobile' ? 'selected' : ''}>Mobile</option>
                <option value="insurance" ${this.paymentMethod === 'insurance' ? 'selected' : ''}>Insurance</option>
              </select>
            </div>
            <div class="pos-total-grand" id="cart-grand">${fmtCurrency(this.total())}</div>
            <div class="btn-group" style="margin-top:12px;">
              ${this.paymentMethod === 'cash' ? `<input type="number" class="form-control" id="cash-tendered" placeholder="Cash tendered" step="0.01" value="${this.amountPaid ?? ''}" onchange="PosView.amountPaid = this.value === '' ? null : Number(this.value)">` : ''}
              <button class="btn btn-success" style="flex:1;" onclick="PosView.checkout()">Checkout</button>
            </div>
            ${this.changeDue() > 0 ? `<div class="pos-total-row" style="margin-top:6px;"><strong>Change due</strong><strong>${fmtCurrency(this.changeDue())}</strong></div>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  itemCard(m) {
    const out = m.totalStock <= 0;
    return `
      <div class="pos-item-card ${out ? 'pos-item-out' : ''}" ${out ? '' : `onclick="PosView.addToCart(${m.id})"`}>
        <div class="pos-item-name">${esc(m.name)}</div>
        <div class="pos-item-price">${m.sellingPrice != null ? fmtCurrency(m.sellingPrice) : '—'}</div>
        <div class="pos-item-stock ${m.totalStock <= m.reorderLevel ? 'pos-item-low' : ''}">
          ${m.totalStock} in stock${m.nearestExpiry ? ' · exp ' + fmtDate(m.nearestExpiry) : ''}
        </div>
      </div>`;
  },

  cartHtml() {
    if (this.cart.length === 0) return '<div class="empty-state"><div class="empty-state-icon">🛒</div><div class="empty-state-text">Cart is empty</div></div>';
    return this.cart.map((line, i) => `
      <div class="cart-line">
        <div class="cart-line-info">
          <div class="cart-line-name">${esc(line.name)} <small style="color:var(--text-muted)">(${esc(line.batchNumber || 'auto FEFO')})</small></div>
          <div class="cart-line-qty">
            <button onclick="PosView.changeQty(${i}, -1)">−</button>
            <span>${line.quantity}</span>
            <button onclick="PosView.changeQty(${i}, 1)" ${line.quantity >= line.maxQty ? 'disabled' : ''}>+</button>
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="cart-line-total">${fmtCurrency(line.unitPrice * line.quantity)}</span>
          <button class="cart-line-remove" onclick="PosView.removeLine(${i})">×</button>
        </div>
      </div>
    `).join('');
  },

  mount() {
    const input = document.getElementById('pos-search-input');
    if (!input) return;
    input.focus();

    const suggestions = document.getElementById('pos-suggestions');

    const runSearch = debounce(async (term) => {
      if (term.length < 2) { suggestions.classList.remove('show'); return; }
      try {
        const results = await API.get(`/medicines/search${API.qs({ q: term, limit: 8 })}`);
        if (results.length === 0) {
          suggestions.innerHTML = '<div class="pos-suggestion-item">No matches</div>';
          suggestions.classList.add('show');
          return;
        }
        suggestions.innerHTML = results.map((m) => `
          <div class="pos-suggestion-item" data-id="${m.id}">
            <strong>${esc(m.name)}</strong>
            <small>${esc(m.sku)} — ${fmtCurrency(m.sellingPrice || 0)} — ${m.totalStock} in stock</small>
          </div>`).join('');
        suggestions.classList.add('show');
        suggestions.querySelectorAll('[data-id]').forEach((el) => {
          el.addEventListener('click', () => {
            suggestions.classList.remove('show');
            input.value = '';
            this.searchTerm = '';
            this.addToCart(Number(el.dataset.id));
          });
        });
      } catch { suggestions.classList.remove('show'); }
    }, 250);

    input.addEventListener('input', () => { this.searchTerm = input.value; runSearch(input.value.trim()); });

    // Barcode scanners "type" the code and press Enter — match exactly.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const term = input.value.trim();
      if (!term) return;
      const exact = this.catalog.find((m) => m.barcode === term || m.sku.toUpperCase() === term.toUpperCase());
      if (exact) {
        this.addToCart(exact.id);
        input.value = '';
        this.searchTerm = '';
        suggestions.classList.remove('show');
      } else {
        toast(`No product matches "${term}"`, 'error');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pos-search')) suggestions.classList.remove('show');
    });
  },

  /** Adds a product to the cart, resolving its FEFO batch via the API. */
  async addToCart(id) {
    try {
      const med = await API.get(`/medicines/${id}`);
      const totalAvailable = (med.batches || []).reduce((s, b) => s + Math.max(0, b.quantity), 0);
      if (totalAvailable <= 0) { toast('No stock available for this product', 'error'); return; }

      const batch = (med.batches || []).find((b) => b.quantity > 0); // batches come sorted FEFO
      const existing = this.cart.find((l) => l.medicineId === med.id);
      if (existing) {
        if (existing.quantity >= existing.maxQty) { toast(`Only ${existing.maxQty} in stock`, 'error'); return; }
        existing.quantity++;
      } else {
        this.cart.push({
          medicineId: med.id,
          name: med.name,
          sku: med.sku,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          unitPrice: batch.sellingPrice,
          taxRate: med.taxRate,
          quantity: 1,
          maxQty: totalAvailable,
        });
      }
      App.refresh();
    } catch (e) { toast(e.message, 'error'); }
  },

  changeQty(i, delta) {
    const line = this.cart[i];
    if (!line) return;
    const next = line.quantity + delta;
    if (next <= 0) { this.cart.splice(i, 1); }
    else if (next > line.maxQty) { toast(`Only ${line.maxQty} in stock`, 'error'); return; }
    else { line.quantity = next; }
    App.refresh();
  },

  removeLine(i) { this.cart.splice(i, 1); App.refresh(); },
  clearCart() { this.cart = []; this.discountType = 'fixed'; this.discountValue = 0; this.discountApprovalCode = ''; this.customerName = ''; this.amountPaid = null; App.refresh(); },

  setDiscount(value) { this.discountValue = Math.max(0, Number(value) || 0); App.refresh(); },

  discountAmount() {
    if (this.discountType === 'percentage') {
      return round2((this.subtotal() + this.tax()) * (Math.min(this.discountValue, 100) / 100));
    }
    return round2(Math.min(this.discountValue, this.subtotal() + this.tax()));
  },

  requiresApproval() {
    const total = this.subtotal() + this.tax();
    if (total <= 0 || this.discountAmount() <= 0) return false;
    return (this.discountAmount() / total) * 100 > this.APPROVAL_THRESHOLD;
  },

  subtotal() { return this.cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0); },
  tax() { return this.cart.reduce((s, l) => s + l.quantity * l.unitPrice * l.taxRate, 0); },
  total() { return Math.max(0, this.subtotal() + this.tax() - this.discountAmount()); },
  changeDue() {
    if (this.paymentMethod !== 'cash' || this.amountPaid == null) return 0;
    return Math.max(0, this.amountPaid - this.total());
  },

  async checkout() {
    if (this.cart.length === 0) { toast('Cart is empty', 'error'); return; }
    if (this.paymentMethod === 'cash' && this.amountPaid != null && this.amountPaid < this.total()) {
      toast('Cash tendered is less than the total due', 'error');
      return;
    }

    const payload = {
      items: this.cart.map((l) => ({ medicineId: l.medicineId, quantity: l.quantity, unitPrice: l.unitPrice })),
      paymentMethod: this.paymentMethod,
      customerName: this.customerName || undefined,
      customerPhone: this.customerPhone || undefined,
      discountType: this.discountValue > 0 ? this.discountType : undefined,
      discountAmount: this.discountType === 'fixed' && this.discountValue > 0 ? this.discountValue : undefined,
      discountPercentage: this.discountType === 'percentage' && this.discountValue > 0 ? this.discountValue : undefined,
      discountApprovalCode: this.discountApprovalCode.trim() || undefined,
      amountPaid: this.paymentMethod === 'cash' ? (this.amountPaid ?? round2(this.total())) : undefined,
    };

    const btn = document.querySelector('.pos-cart .btn-success');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    try {
      const sale = await API.post('/sales', payload);
      toast(`Sale ${sale.invoiceNumber} completed`, 'success');
      this.lastReceipt = sale;
      await this.showReceipt(sale.id, true);
      this.cart = [];
      this.discountType = 'fixed';
      this.discountValue = 0;
      this.discountApprovalCode = '';
      this.customerName = '';
      this.customerPhone = '';
      this.amountPaid = null;
      this._catalogLoaded = false;
      App.refresh();
    } catch (e) {
      toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
    }
  },

  /** Fetches the receipt payload and renders it in a modal + print dialog. */
  async showReceipt(saleId, autoPrint = false) {
    try {
      const r = await API.get(`/sales/${saleId}/receipt`);
      const body = `
        <div class="receipt">
          <div class="receipt-header"><h2>💊 Pharmly</h2><small>Your trusted pharmacy</small></div>
          <div class="receipt-row"><span>Invoice</span><span>${esc(r.invoiceNumber)}</span></div>
          <div class="receipt-row"><span>Date</span><span>${fmtDateTime(r.issuedAt)}</span></div>
          <div class="receipt-row"><span>Cashier</span><span>${esc(r.cashier)}</span></div>
          <div class="receipt-row"><span>Customer</span><span>${esc(r.customer.name)}</span></div>
          <div class="rule"></div>
          ${r.lines.map((l) => `<div class="receipt-line">
            <span>${esc(l.name)}${l.batchNumber ? ` <small>(${esc(l.batchNumber)})</small>` : ''} ×${l.quantity}</span>
            <span>${fmtCurrency(l.lineTotal)}</span>
          </div>`).join('')}
          <div class="receipt-total">
            <div class="receipt-row"><span>Subtotal</span><span>${fmtCurrency(r.totals.subtotal)}</span></div>
            <div class="receipt-row"><span>Tax</span><span>${fmtCurrency(r.totals.tax)}</span></div>
            ${r.totals.discount > 0 ? `
              <div class="receipt-row" style="color:#16a34a;">
                <span>Discount${r.totals.discountType === 'percentage' ? ` (${r.totals.discountPercentage}%)` : ' (Fixed)'}</span>
                <span>−${fmtCurrency(r.totals.discount)}</span>
              </div>` : ''}
            <div class="receipt-row"><strong>Total</strong><strong>${fmtCurrency(r.totals.total)}</strong></div>
            <div class="receipt-row"><span>Paid (${esc(r.paymentMethod)})</span><span>${fmtCurrency(r.totals.amountPaid)}</span></div>
            ${r.totals.changeDue > 0 ? `<div class="receipt-row"><strong>Change</strong><strong>${fmtCurrency(r.totals.changeDue)}</strong></div>` : ''}
          </div>
          <div class="receipt-footer">Thank you! Keep medicines out of reach of children.</div>
          <div class="btn-group" style="margin-top:16px; justify-content:center;">
            <button class="btn btn-primary" onclick="printHTML('${esc(r.invoiceNumber)}', document.getElementById('receipt-print-source').innerHTML)">🖨 Print</button>
            <button class="btn" onclick="App.closeModal()">Close</button>
          </div>
        </div>
        <div id="receipt-print-source" style="display:none;">
          <h2>💊 Pharmly</h2><div class="sub">Your trusted pharmacy</div><div class="rule"></div>
          <div class="row"><span>Invoice</span><span>${esc(r.invoiceNumber)}</span></div>
          <div class="row"><span>Date</span><span>${fmtDateTime(r.issuedAt)}</span></div>
          <div class="row"><span>Cashier</span><span>${esc(r.cashier)}</span></div>
          <div class="row"><span>Customer</span><span>${esc(r.customer.name)}</span></div>
          <div class="rule"></div>
          ${r.lines.map((l) => `<div class="row"><span>${esc(l.name)} ×${l.quantity}${l.batchNumber ? ` [${esc(l.batchNumber)}]` : ''}</span><span>${fmtCurrency(l.lineTotal)}</span></div>`).join('')}
          <div class="rule"></div>
          <div class="row"><span>Subtotal</span><span>${fmtCurrency(r.totals.subtotal)}</span></div>
          <div class="row"><span>Tax</span><span>${fmtCurrency(r.totals.tax)}</span></div>
          ${r.totals.discount > 0 ? `<div class="row"><span>Discount${r.totals.discountType === 'percentage' ? ` (${r.totals.discountPercentage}%)` : ' (Fixed)'}</span><span>-${fmtCurrency(r.totals.discount)}</span></div>` : ''}
          <div class="total row"><span>TOTAL</span><span>${fmtCurrency(r.totals.total)}</span></div>
          <div class="row"><span>Paid (${esc(r.paymentMethod)})</span><span>${fmtCurrency(r.totals.amountPaid)}</span></div>
          ${r.totals.changeDue > 0 ? `<div class="row"><span>Change</span><span>${fmtCurrency(r.totals.changeDue)}</span></div>` : ''}
          <div class="rule"></div><div class="sub">Thank you! Keep medicines out of reach of children.</div>
        </div>
      `;
      App.showModal(`Receipt — ${esc(r.invoiceNumber)}`, body, true);
      if (autoPrint) {
        setTimeout(() => printHTML(r.invoiceNumber, document.getElementById('receipt-print-source').innerHTML), 300);
      }
    } catch (e) { toast(e.message, 'error'); }
  },
};

function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
