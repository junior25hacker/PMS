/**
 * Application shell: hash router, per-route mounting, RBAC nav filtering,
 * modal manager and the global top-bar search.
 */
const App = {
  currentRoute: 'login',

  routes: {
    dashboard: { view: 'DashboardView', title: 'Dashboard' },
    pos: { view: 'PosView', title: 'Point of Sale' },
    prescriptions: { view: 'PrescriptionsView', title: 'Prescriptions' },
    patients: { view: 'PatientsView', title: 'Patients' },
    inventory: { view: 'InventoryView', title: 'Medicines' },
    stockAlerts: { view: 'StockAlertsView', title: 'Stock Alerts & Reorder Report' },
    batches: { view: 'BatchesView', title: 'Batches' },
    purchases: { view: 'PurchasesView', title: 'Purchase Orders' },
    sales: { view: 'SalesView', title: 'Sales' },
    suppliers: { view: 'SuppliersView', title: 'Suppliers' },
    categories: { view: 'CategoriesView', title: 'Categories' },
    users: { view: 'UsersView', title: 'Users' },
  },

  init() {
    Auth.init();
    window.addEventListener('hashchange', () => this.handleRoute());
    document.getElementById('menu-toggle').addEventListener('click', () => this.toggleSidebar());

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('global-search-input').focus();
      }
      if (e.key === 'Escape') this.closeModal();
    });

    const searchInput = document.getElementById('global-search-input');
    searchInput.addEventListener('input', debounce(() => this.handleGlobalSearch(searchInput.value), 350));
    searchInput.addEventListener('focus', () => { if (searchInput.value.length >= 2) this.handleGlobalSearch(searchInput.value); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar-search')) document.getElementById('search-results').classList.remove('show');
    });

    this.handleRoute();
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'login';
    const route = hash.split('/')[0];
    this.currentRoute = route;

    if (route === 'login') { this.showLogin(); return; }
    if (!Auth.isAuthenticated()) { window.location.hash = '#login'; return; }

    if (!Auth.canAccessRoute(route)) {
      toast('You do not have permission to view that page', 'error');
      window.location.hash = `#${this.firstAllowedRoute()}`;
      return;
    }

    const r = this.routes[route];
    if (!r) { window.location.hash = '#dashboard'; return; }

    const isFromLogin = !!document.querySelector('.login-page');
    if (isFromLogin) {
      const loginEl = document.querySelector('.login-page');
      loginEl.classList.add('fade-out');
      const finishTransition = () => {
        this.showApp();
        document.getElementById('topbar-title').textContent = r.title;
        this.render().then(() => {
          document.getElementById('page').classList.add('fade-in');
        });
      };
      let done = false;
      loginEl.addEventListener('transitionend', () => { if (!done) { done = true; finishTransition(); } }, { once: true });
      setTimeout(() => { if (!done) { done = true; finishTransition(); } }, 350);
    } else {
      this.showApp();
      document.getElementById('topbar-title').textContent = r.title;
      this.render().then(() => {
        document.getElementById('page').classList.add('fade-in');
      });
    }
  },

  /** First nav route the current user is allowed to see (post-login landing). */
  firstAllowedRoute() {
    const order = Object.keys(this.routes);
    return order.find((route) => Auth.canAccessRoute(route)) || 'dashboard';
  },

  showLogin() {
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('topbar').style.display = 'none';
    document.getElementById('page').innerHTML = LoginView.render();
    document.getElementById('page').classList.remove('fade-in');
  },

  showApp() {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = 'flex';
    sidebar.classList.remove('open');
    document.getElementById('nav').style.display = 'block';
    document.getElementById('topbar').style.display = 'flex';
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('auth-user').textContent = `${Auth.user?.fullName} · ${Auth.user?.role}`;
    document.getElementById('logout-btn').style.display = 'inline-block';

    // RBAC: hide nav links the current role may not access.
    document.querySelectorAll('.nav-link').forEach((link) => {
      const route = link.dataset.route;
      const allowed = Auth.canAccessRoute(route);
      link.style.display = allowed ? '' : 'none';
      link.classList.toggle('active', route === this.currentRoute);
    });
  },

  /**
   * Mount lifecycle: load data first, then render HTML, then run per-view
   * post-render bindings. Views expose: render() -> html string, load(),
   * mount().
   */
  async render() {
    const r = this.routes[this.currentRoute];
    const view = window[r.view];
    if (!view) return;
    const page = document.getElementById('page');
    page.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      if (view.load) await view.load();
      page.innerHTML = view.render();
      if (view.mount) view.mount();
    } catch (e) {
      page.innerHTML = `<div class="alert alert-danger">Failed to load: ${esc(e.message)}</div>`;
    }
  },

  /** Re-render the current view after a data mutation. */
  async refresh() { await this.render(); },

  navigate(route) { window.location.hash = `#${route}`; },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768) sidebar.classList.toggle('open');
    else sidebar.classList.toggle('collapsed');
  },

  async handleGlobalSearch(term) {
    const container = document.getElementById('search-results');
    if (!container) return;
    if (term.length < 2) { container.classList.remove('show'); return; }
    try {
      const res = await API.get(`/dashboard/search${API.qs({ q: term })}`);
      let html = '';
      (res.invoices || []).forEach((i) => {
        html += `<div class="search-result-item" data-goto="sales" data-label="${esc(i.invoiceNumber)}">
          <strong>🧾 ${esc(i.invoiceNumber)}</strong>
          <small>${esc(i.customerName)} — ${fmtCurrency(i.totalAmount)}</small>
        </div>`;
      });
      (res.products || []).forEach((p) => {
        html += `<div class="search-result-item" data-goto="inventory" data-label="${esc(p.sku)}">
          <strong>💊 ${esc(p.name)}</strong>
          <small>${esc(p.sku)} — ${fmtCurrency(p.sellingPrice || 0)}</small>
        </div>`;
      });
      container.innerHTML = html || '<div class="search-result-item"><small>No results</small></div>';
      container.classList.add('show');
      container.querySelectorAll('[data-goto]').forEach((item) => {
        item.addEventListener('click', () => {
          container.classList.remove('show');
          this.navigate(item.dataset.goto);
        });
      });
    } catch { container.classList.remove('show'); }
  },

  showModal(title, body, large = false) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.style.maxWidth = large ? '780px' : '560px';
    content.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="modal-body">${body}</div>
    `;
    overlay.style.display = 'flex';
  },

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  },
};

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') App.closeModal();
});
