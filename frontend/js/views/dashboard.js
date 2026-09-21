var DashboardView = {
  data: null,

  async load() {
    try {
      this.data = await API.get('/dashboard/overview');
    } catch (e) {
      toast(e.message, 'error');
      this.data = null;
    }
  },

  render() {
    const d = this.data;
    if (!d) return '<div class="alert alert-danger">Failed to load dashboard data.</div>';

    const s = d.sales || {};
    const inv = d.inventory || {};
    const alerts = d.alerts || {};

    return `
      <div class="kpi-grid">
        <div class="kpi-card success">
          <div class="kpi-label">Revenue Today</div>
          <div class="kpi-value">${fmtCurrency(s.today?.revenue || 0)}</div>
          <div class="kpi-change ${s.revenueChangePct >= 0 ? 'positive' : 'negative'}">
            ${s.revenueChangePct >= 0 ? '▲' : '▼'} ${Math.abs(s.revenueChangePct)}% vs yesterday
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Transactions Today</div>
          <div class="kpi-value">${s.today?.transactionCount || 0}</div>
          <div class="kpi-change ${s.transactionChangePct >= 0 ? 'positive' : 'negative'}">
            ${s.transactionChangePct >= 0 ? '▲' : '▼'} ${Math.abs(s.transactionChangePct)}% vs yesterday
          </div>
        </div>
        <div class="kpi-card warning">
          <div class="kpi-label">Inventory Value</div>
          <div class="kpi-value">${fmtCurrency(inv.inventoryValue || 0)}</div>
          <div class="kpi-change">${(inv.totalStock || 0).toLocaleString()} units · ${inv.productCount || 0} products</div>
        </div>
        <div class="kpi-card danger" style="cursor:pointer;" onclick="App.navigate('stockAlerts')" title="Click to view dedicated Stock Alerts & Reorder Report">
          <div class="kpi-label">Stock Alerts ↗</div>
          <div class="kpi-value">${(inv.lowStockCount || 0) + (inv.outOfStockCount || 0)}</div>
          <div class="kpi-change">Low: ${inv.lowStockCount || 0} · Out: ${inv.outOfStockCount || 0} · Expiring: ${inv.expiringSoonCount || 0}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">⚠️ Low Stock Alerts</span>
          <button class="btn btn-sm btn-primary" onclick="App.navigate('stockAlerts')">View Full Report →</button>
        </div>
        <div class="card-body">
          ${(alerts.lowStock || []).length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No low stock items</div></div>'
            : `<table><thead><tr><th>Medicine</th><th>SKU</th><th>Stock</th><th>Reorder Level</th><th>Status</th><th></th></tr></thead>
               <tbody>${alerts.lowStock.map((m) => `<tr>
                <td><strong>${esc(m.name)}</strong></td><td>${esc(m.sku)}</td>
                <td>${m.totalStock}</td><td>${m.reorderLevel}</td>
                <td><span class="badge ${m.totalStock <= 0 ? 'badge-danger' : 'badge-warning'}">${m.totalStock <= 0 ? 'Out of stock' : 'Low'}</span></td>
                <td><button class="btn btn-sm" onclick="App.navigate('stockAlerts')">Report</button></td>
              </tr>`).join('')}</tbody></table>`}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="card">
          <div class="card-header"><span class="card-title">Expiring Soon</span></div>
          <div class="card-body">
            ${(alerts.expiringSoon || []).map((b) => `<div style="padding:6px 0; border-bottom:1px solid var(--border); font-size:13px;">
              <strong>${esc(b.medicineName)}</strong> — ${esc(b.batchNumber)} — ${b.quantity} left — <span class="${b.expired ? 'badge badge-danger' : b.daysLeft < 30 ? 'badge badge-warning' : 'badge badge-success'}">${b.expired ? 'EXPIRED' : b.daysLeft + ' days'}</span>
            </div>`).join('') || '<div class="empty-state-text">No expiring items</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Top Products (30 days)</span></div>
          <div class="card-body">
            ${(d.topProducts || []).map((p) => `<div style="padding:6px 0; border-bottom:1px solid var(--border); font-size:13px;">
              <strong>${esc(p.medicineName)}</strong> — ${p.unitsSold} sold — ${fmtCurrency(p.revenue)}
            </div>`).join('') || '<div class="empty-state-text">No sales yet</div>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Recent Sales</span></div>
        <div class="card-body">
          ${(d.recentSales || []).length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">🧾</div><div class="empty-state-text">No sales yet</div></div>'
            : `<table><thead><tr><th>Invoice</th><th>Customer</th><th>Cashier</th><th>Total</th><th>Status</th><th>When</th></tr></thead>
               <tbody>${d.recentSales.map((s2) => `<tr>
                <td><strong>${esc(s2.invoiceNumber)}</strong></td>
                <td>${esc(s2.customerName)}</td><td>${esc(s2.cashierName)}</td>
                <td>${fmtCurrency(s2.totalAmount)}</td>
                <td><span class="badge ${s2.status === 'completed' ? 'badge-success' : 'badge-danger'}">${esc(s2.status)}</span></td>
                <td>${fmtDateTime(s2.createdAt)}</td>
              </tr>`).join('')}</tbody></table>`}
        </div>
      </div>

      ${s.trend && s.trend.length ? `
      <div class="card">
        <div class="card-header"><span class="card-title">Revenue Trend (Last ${s.trend.length} days)</span></div>
        <div class="card-body">
          <div style="display:flex; align-items:flex-end; gap:8px; height:160px;">
            ${s.trend.map((t) => {
              const max = Math.max(...s.trend.map((x) => x.revenue), 1);
              const h = Math.max(4, Math.round((t.revenue / max) * 140));
              return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;" title="${t.date}: ${fmtCurrency(t.revenue)} (${t.transactionCount} sales)">
                <div style="width:100%; height:${h}px; background:var(--primary); border-radius:4px 4px 0 0; opacity:${0.4 + (t.revenue / max) * 0.6};"></div>
                <small style="color:var(--text-muted);">${t.date.slice(5)}</small>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>` : ''}
    `;
  },

  mount() {},
};
