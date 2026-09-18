/**
 * Session management: token storage, profile, and client-side RBAC helpers.
 */
const Auth = {
  user: null,
  _logoutTimer: null,

  init() {
    API.init();
    const raw = sessionStorage.getItem('pharmly_user') || localStorage.getItem('pharmly_user');
    if (raw) {
      try { this.user = JSON.parse(raw); } catch { this.user = null; }
    }
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
  },

  isAuthenticated() { return !!API.token && !!this.user; },

  async login(email, password, remember = false) {
    const res = await API.post('/auth/login', { email, password, remember });
    // Keep both tokens in sync with the same persistence choice so the
    // refresh flow in api.js can detect "remember me" sessions.
    this._storeToken('pharmly_refresh', res.refreshToken, remember);
    API.setToken(res.accessToken, remember);
    this._storeUser(res.user, remember);
    this.user = res.user;
    this._scheduleAutoRefresh(res.expiresIn);
    return res;
  },

  logout() {
    API.clearToken();
    sessionStorage.clear();
    localStorage.removeItem('pharmly_token');
    localStorage.removeItem('pharmly_refresh');
    localStorage.removeItem('pharmly_user');
    this.user = null;
    if (this._logoutTimer) clearTimeout(this._logoutTimer);
    window.location.hash = '#login';
    App.navigate('login');
  },

  /** Silent sign-out used when the backend rejects the session (401 → refresh failed). */
  forceLogout(message) {
    if (message) toast(message, 'error');
    this.logout();
  },

  isRole(role) { return this.user?.role === role; },
  can(...roles) { return roles.includes(this.user?.role); },

  /** Roles allowed to open each route — mirrored in app.js nav visibility. */
  routeRoles: {
    dashboard: null, // everyone
    pos: ['admin', 'pharmacist', 'cashier'],
    prescriptions: ['admin', 'pharmacist'],
    patients: ['admin', 'pharmacist', 'cashier'],
    inventory: null, // everyone (read-only for cashier, enforced server-side)
    batches: ['admin', 'pharmacist'],
    purchases: ['admin', 'pharmacist'],
    sales: ['admin', 'pharmacist', 'cashier'],
    suppliers: ['admin', 'pharmacist'],
    categories: ['admin', 'pharmacist'],
    users: ['admin'],
  },

  canAccessRoute(route) {
    const roles = this.routeRoles[route];
    return roles === null || roles === undefined || this.can(...roles);
  },

  async me() {
    if (!this.isAuthenticated()) return null;
    try {
      const res = await API.get('/auth/me');
      this.user = res.user;
      sessionStorage.setItem('pharmly_user', JSON.stringify(res.user));
      return res.user;
    } catch { return null; }
  },

  /** Proactively refresh shortly before the access token expires. */
  _scheduleAutoRefresh(expiresInSeconds) {
    if (this._logoutTimer) clearTimeout(this._logoutTimer);
    if (!expiresInSeconds) return;
    const lead = Math.max(30_000, expiresInSeconds * 1000 - 120_000);
    this._logoutTimer = setTimeout(() => {
      API.tryRefresh().then((ok) => {
        if (ok) this._scheduleAutoRefresh(28800);
        else if (this.isAuthenticated()) this.forceLogout('Your session has expired.');
      });
    }, lead);
  },

  _storeToken(key, value, remember) {
    sessionStorage.setItem(key, value);
    if (remember) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  },

  _storeUser(user, remember) {
    const raw = JSON.stringify(user);
    sessionStorage.setItem('pharmly_user', raw);
    if (remember) localStorage.setItem('pharmly_user', raw);
    else localStorage.removeItem('pharmly_user');
  },
};
