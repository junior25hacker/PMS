/**
 * Stock Alerts & Reorder Report:
 * Dedicated report view for pharmacists and admins to track medicines
 * falling below their reorder threshold, view shortages, adjust thresholds,
 * and initiate restocking.
 */
var StockAlertsView = {
  items: [],
  categories: [],
  search: '',
  categoryId: '',
  filterStatus: 'all', // 'all', 'out_of_stock', 'low_stock'
  loading: false,

  async load() {
    this.loading = true;
    try {
      // Fetch low stock medicines (where totalStock <= reorderLevel)
      const res = await API.get(`/medicines?limit=250&lowStock=true`);
      const { items } = API.list(res);
      this.items = items;
    } catch (e) {
      toast(e.message, 'error');
      this.items = [];
    } finally {
      this.loading = false;
    }

    if (this.categories.length === 0) {
      try {
        const catRes = await API.get('/categories');
        this.categories = Array.isArray(catRes) ? catRes : (catRes.items || []);
      } catch { /* optional */ }
    }
  },

  getFilteredItems() {
    return this.items.filter((m) => {
      // Search term
      if (this.search) {
        const q = this.search.toLowerCase();
        const matchName = m.name?.toLowerCase().includes(q);
        const matchGeneric = m.genericName?.toLowerCase().includes(q);
        const matchSku = m.sku?.toLowerCase().includes(q);
        if (!matchName && !matchGeneric && !matchSku) return false;
      }
      // Category
      if (this.categoryId && String(m.categoryId) !== String(this.categoryId)) {
        return false;
      }
      // Status filter
      if (this.filterStatus === 'out_of_stock' && m.totalStock > 0) return false;
      if (this.filterStatus === 'low_stock' && m.totalStock <= 0) return false;
      return true;
    });
  },

  render() {
    const canManage = Auth.can('admin', 'pharmacist');
    const filtered = this.getFilteredItems();

    // Summary counters
    const outOfStockCount = this.items.filter((m) => m.totalStock <= 0).length;
    const lowStockCount = this.items.filter((m) => m.totalStock > 0 && m.totalStock <= m.reorderLevel).length;
    const totalDeficitUnits = this.items.reduce((sum, m) => sum + Math.max(0, m.reorderLevel - m.totalStock), 0);
    const estRestockCost = this.items.reduce((sum, m) => {
      const deficit = Math.max(0, m.reorderLevel - m.totalStock);
      return sum + deficit * (m.unitCost || 0);
    }, 0);

    return `
      <!-- KPI Overview Cards -->
      <div class="kpi-grid">
        <div class="kpi-card danger">
          <div class="kpi-label">Out of Stock</div>
          <div class="kpi-value">${outOfStockCount}</div>
          <div class="kpi-change negative">Critical items requiring immediate reorder</div>
        </div>
        <div class="kpi-card warning">
          <div class="kpi-label">Low Stock (Below Threshold)</div>
          <div class="kpi-value">${lowStockCount}</div>
          <div class="kpi-change">Drugs currently at or below reorder level</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Shortage Deficit</div>
          <div class="kpi-value">${totalDeficitUnits.toLocaleString()}</div>
          <div class="kpi-change">Units needed to reach reorder thresholds</div>
        </div>
        <div class="kpi-card success">
          <div class="kpi-label">Est. Restock Cost</div>
          <div class="kpi-value">${fmtCurrency(estRestockCost)}</div>
          <div class="kpi-change">Estimated cost to replenish deficit</div>
        </div>
      </div>

      <!-- Main Report Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">⚠️ Low-Stock & Reorder Report</span>
            <span style="color:var(--text-muted); font-size:13px; margin-left:8px;">
              (${filtered.length} of ${this.items.length} flagged drugs)
            </span>
          </div>
          <div class="btn-group" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="text" class="form-control" style="width:200px;" placeholder="Search drug or SKU…" id="stock-alert-search" value="${esc(this.search)}">
            <select class="form-control" style="width:150px;" id="stock-alert-cat">
              <option value="">All Categories</option>
              ${this.categories.map((c) => `<option value="${c.id}" ${String(this.categoryId) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
            <select class="form-control" style="width:140px;" id="stock-alert-status">
              <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>All Flagged</option>
              <option value="out_of_stock" ${this.filterStatus === 'out_of_stock' ? 'selected' : ''}>Out of Stock (0)</option>
              <option value="low_stock" ${this.filterStatus === 'low_stock' ? 'selected' : ''}>Low Stock (&gt;0)</option>
            </select>
            <button class="btn btn-secondary" onclick="StockAlertsView.printReport()">🖨️ Print Report</button>
            <button class="btn btn-primary" onclick="StockAlertsView.refresh()">↻ Refresh</button>
          </div>
        </div>
        <div class="card-body">
          ${filtered.length === 0
            ? (this.items.length === 0
                ? `<div class="empty-state" style="padding:48px 16px;">
                     <div class="empty-state-icon" style="font-size:42px;">✅</div>
                     <h3 style="margin-top:12px; font-weight:600;">All Stock Levels Healthy!</h3>
                     <p class="empty-state-text" style="max-width:400px; margin:8px auto;">
                       There are currently no drugs at or below their reorder threshold. Flags clear automatically as stock is received.
                     </p>
                   </div>`
                : `<div class="empty-state">
                     <div class="empty-state-icon">🔍</div>
                     <div class="empty-state-text">No flagged drugs match your current filter</div>
                   </div>`)
            : `<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Medicine / Formulation</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Current Stock</th>
                      <th>Reorder Threshold</th>
                      <th>Shortage / Deficit</th>
                      <th>Unit Cost</th>
                      <th>Nearest Expiry</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtered.map((m) => {
                      const deficit = Math.max(0, m.reorderLevel - m.totalStock);
                      const isZero = m.totalStock <= 0;
                      return `
                        <tr style="${isZero ? 'background-color:rgba(220,53,69,0.04);' : ''}">
                          <td>
                            <strong>${esc(m.name)}</strong>
                            <br><small style="color:var(--text-muted)">${esc(m.genericName || '—')} ${esc(m.strength || '')}</small>
                          </td>
                          <td><code>${esc(m.sku)}</code></td>
                          <td>${esc(m.categoryName || '—')}</td>
                          <td>
                            ${stockBadge(m.totalStock, m.reorderLevel)}
                          </td>
                          <td>
                            <div style="display:flex; align-items:center; gap:6px;">
                              <strong>${m.reorderLevel}</strong> units
                              ${canManage ? `
                                <button class="btn btn-sm" style="padding:2px 6px; font-size:11px;" title="Configure reorder threshold" onclick="StockAlertsView.openConfigureModal(${m.id}, ${m.reorderLevel}, '${esc(m.name)}')">
                                  ⚙️ Edit
                                </button>
                              ` : ''}
                            </div>
                          </td>
                          <td>
                            <strong style="color:${isZero ? 'var(--danger)' : '#b45309'};">
                              -${deficit} units
                            </strong>
                          </td>
                          <td>${m.unitCost != null ? fmtCurrency(m.unitCost) : '—'}</td>
                          <td>${expiryBadge(m.nearestExpiry)}</td>
                          <td>
                            <div class="btn-group" style="gap:4px;">
                              ${canManage ? `
                                <button class="btn btn-sm btn-primary" title="Create Purchase Order" onclick="StockAlertsView.quickReorder(${m.id}, '${esc(m.name)}')">
                                  + Order
                                </button>
                                <button class="btn btn-sm" title="Receive / Intake batch" onclick="StockAlertsView.quickIntake(${m.id})">
                                  📦 Intake
                                </button>
                              ` : ''}
                              <button class="btn btn-sm" onclick="InventoryView.detail(${m.id})">
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>`
          }
        </div>
      </div>
    `;
  },

  mount() {
    const searchInput = document.getElementById('stock-alert-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        this.search = searchInput.value;
        App.refresh();
      }, 300));
    }

    const catSelect = document.getElementById('stock-alert-cat');
    if (catSelect) {
      catSelect.addEventListener('change', () => {
        this.categoryId = catSelect.value;
        App.refresh();
      });
    }

    const statusSelect = document.getElementById('stock-alert-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        this.filterStatus = statusSelect.value;
        App.refresh();
      });
    }
  },

  async refresh() {
    await this.load();
    App.refresh();
  },

  /**
   * Modal allowing pharmacists to configure / adjust the reorder threshold for a drug.
   */
  openConfigureModal(id, currentThreshold, drugName) {
    App.showModal(`Configure Reorder Threshold — ${esc(drugName)}`, `
      <form id="reorder-threshold-form" onsubmit="StockAlertsView.saveThreshold(event, ${id})">
        <p style="margin-bottom:12px; color:var(--text-muted); font-size:13px;">
          Set the minimum stock count for <strong>${esc(drugName)}</strong>. When live stock falls to or below this number, the drug will be flagged for restocking. Once restocked above this number, the alert clears automatically.
        </p>
        <div class="form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Reorder Threshold (Units) *</label>
          <input type="number" class="form-control" name="reorderLevel" id="modal-reorder-input" min="0" step="1" required value="${currentThreshold}" style="font-size:16px; font-weight:600; width:100%;">
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button type="button" class="btn btn-sm" onclick="document.getElementById('modal-reorder-input').value = 10">10</button>
            <button type="button" class="btn btn-sm" onclick="document.getElementById('modal-reorder-input').value = 25">25</button>
            <button type="button" class="btn btn-sm" onclick="document.getElementById('modal-reorder-input').value = 50">50</button>
            <button type="button" class="btn btn-sm" onclick="document.getElementById('modal-reorder-input').value = 100">100</button>
          </div>
        </div>
        <div class="btn-group" style="justify-content:flex-end; gap:8px;">
          <button type="button" class="btn" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Threshold</button>
        </div>
      </form>
    `, true);
  },

  async saveThreshold(e, id) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const reorderLevel = Number(raw.reorderLevel);
    if (isNaN(reorderLevel) || reorderLevel < 0) {
      toast('Please enter a valid non-negative threshold number', 'error');
      return;
    }

    try {
      await API.patch(`/medicines/${id}`, { reorderLevel });
      toast('Reorder threshold updated successfully', 'success');
      App.closeModal();
      await this.refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  /** Quick navigates to purchase order screen */
  quickReorder(medicineId, medicineName) {
    App.navigate('purchases');
    // Open purchase order form after route change
    setTimeout(() => {
      if (typeof PurchasesView !== 'undefined' && PurchasesView.openForm) {
        PurchasesView.openForm();
        toast(`Creating purchase order for ${medicineName}`, 'info');
      }
    }, 150);
  },

  /** Quick navigates to batch intake */
  quickIntake(medicineId) {
    App.navigate('batches');
    setTimeout(() => {
      if (typeof BatchesView !== 'undefined' && BatchesView.openForm) {
        BatchesView.openForm();
      }
    }, 150);
  },

  /** Formatted print dialog for the reorder report */
  printReport() {
    const filtered = this.getFilteredItems();
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const rows = filtered.map((m) => `
      <div class="row">
        <span>${esc(m.name)} (${esc(m.sku)})</span>
        <span class="bold">Stock: ${m.totalStock} / Min: ${m.reorderLevel}</span>
      </div>
      <div class="row sub" style="margin-bottom:4px;">
        <span>Deficit: -${Math.max(0, m.reorderLevel - m.totalStock)} units</span>
        <span>Est: ${fmtCurrency(Math.max(0, m.reorderLevel - m.totalStock) * (m.unitCost || 0))}</span>
      </div>
    `).join('');

    printHTML('Low Stock & Reorder Report', `
      <h2>Pharmly PMS</h2>
      <div class="sub">Low Stock & Reorder Report — ${dateStr}</div>
      <div class="rule"></div>
      ${rows}
      <div class="rule"></div>
      <div class="total row">
        <span>Total Flagged Items</span>
        <span>${filtered.length}</span>
      </div>
    `);
  },
};
