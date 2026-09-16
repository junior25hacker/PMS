/**
 * Sales history: filters, search, pagination, refunds and printable receipts.
 */
var SalesView = {
  sales: [],
  meta: null,
  search: '',
  status: '',
  payment: '',

  async load() {
    try {
      const res = await API.get(`/sales${API.qs({ page: this.meta?.page || 1, limit: 20, search: this.search, status: this.status, paymentMethod: this.payment })}`);
      const { items, meta } = API.list(res);
      this.sales = items;
      this.meta = meta;
    } catch (e) { toast(e.message, 'error'); }
  },

  render() {
    const canRefund = Auth.can('admin', 'pharmacist');
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Sales History ${this.meta ? `(${this.meta.total})` : ''}</span>
          <div class="btn-group">
            <input type="text" class="form-control" style="width:200px;" placeholder="Invoice, customer, item…" id="sales-search" value="${esc(this.search)}">
            <select class="form-control" style="width:130px;" id="sales-status">
              <option value="">All statuses</option>
              <option value="completed" ${this.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="refunded" ${this.status === 'refunded' ? 'selected' : ''}>Refunded</option>
            </select>
            <select class="form-control" style="width:130px;" id="sales-payment">
              <option value="">All payments</option>
              <option value="cash" ${this.payment === 'cash' ? 'selected' : ''}>Cash</option>
              <option value="card" ${this.payment === 'card' ? 'selected' : ''}>Card</option>
              <option value="mobile" ${this.payment === 'mobile' ? 'selected' : ''}>Mobile</option>
              <option value="insurance" ${this.payment === 'insurance' ? 'selected' : ''}>Insurance</option>
            </select>
            <button class="btn btn-primary" onclick="App.navigate('pos')">⛒ Open POS</button>
          </div>
        </div>
        <div class="card-body">
          ${this.sales.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">🧾</div><div class="empty-state-text">No sales found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Cashier</th><th>Items</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
               <tbody>${this.sales.map((s) => `<tr>
                <td><strong>${esc(s.invoiceNumber)}</strong></td>
                <td>${esc(s.customerName || 'Walk-in')}</td>
                <td>${esc(s.cashier?.fullName || '—')}</td>
                <td>${s.items?.length || 0}</td>
                <td>${fmtCurrency(s.subtotal)}</td>
                <td>${fmtCurrency(s.taxAmount)}</td>
                <td><strong>${fmtCurrency(s.totalAmount)}</strong></td>
                <td>${esc(s.paymentMethod)}</td>
                <td>${saleStatusBadge(s.status)}</td>
                <td>${fmtDateTime(s.createdAt)}</td>
                <td>
                  <button class="btn btn-sm" onclick="SalesView.receipt(${s.id})">Receipt</button>
                  ${canRefund && s.status === 'completed' ? `<button class="btn btn-sm btn-warning" onclick="SalesView.refund(${s.id})">Refund</button>` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
          ${this.meta && this.meta.totalPages > 1 ? Pagination.html(this.meta, (p) => { this.meta.page = p; App.refresh(); }) : ''}
        </div>
      </div>
    `;
  },

  mount() {
    const search = document.getElementById('sales-search');
    if (search) search.addEventListener('input', debounce(() => { this.search = search.value; this.meta = { ...(this.meta || {}), page: 1 }; App.refresh(); }, 350));
    const status = document.getElementById('sales-status');
    if (status) status.addEventListener('change', () => { this.status = status.value; App.refresh(); });
    const payment = document.getElementById('sales-payment');
    if (payment) payment.addEventListener('change', () => { this.payment = payment.value; App.refresh(); });
  },

  async receipt(id) {
    try {
      const r = await API.get(`/sales/${id}/receipt`);
      App.showModal(`Receipt — ${esc(r.invoiceNumber)}`, `
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
            ${r.totals.discount > 0 ? `<div class="receipt-row"><span>Discount</span><span>−${fmtCurrency(r.totals.discount)}</span></div>` : ''}
            <div class="receipt-row"><strong>Total</strong><strong>${fmtCurrency(r.totals.total)}</strong></div>
            <div class="receipt-row"><span>Paid (${esc(r.paymentMethod)})</span><span>${fmtCurrency(r.totals.amountPaid)}</span></div>
            ${r.totals.changeDue > 0 ? `<div class="receipt-row"><strong>Change</strong><strong>${fmtCurrency(r.totals.changeDue)}</strong></div>` : ''}
          </div>
          <div class="receipt-footer">Payment: ${esc(r.paymentMethod)} · ${esc(r.status)}</div>
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
          ${r.totals.discount > 0 ? `<div class="row"><span>Discount</span><span>-${fmtCurrency(r.totals.discount)}</span></div>` : ''}
          <div class="total row"><span>TOTAL</span><span>${fmtCurrency(r.totals.total)}</span></div>
          <div class="row"><span>Paid (${esc(r.paymentMethod)})</span><span>${fmtCurrency(r.totals.amountPaid)}</span></div>
          ${r.totals.changeDue > 0 ? `<div class="row"><span>Change</span><span>${fmtCurrency(r.totals.changeDue)}</span></div>` : ''}
          <div class="rule"></div><div class="sub">Thank you! Keep medicines out of reach of children.</div>
        </div>
      `, true);
    } catch (e) { toast(e.message, 'error'); }
  },

  refund(id) {
    confirmDialog('Refund sale', 'The full sale will be refunded and all items returned to stock. Continue?', async () => {
      try { await API.post(`/sales/${id}/refund`); toast('Sale refunded and stock restored', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },
};
