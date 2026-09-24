/**
 * HTTP client for the Pharmly NestJS API.
 *
 * Every successful backend response is wrapped by TransformInterceptor:
 *   { success: true, statusCode, data, timestamp }
 * and every failure by AllExceptionsFilter:
 *   { success: false, statusCode, error, message, path, timestamp }
 *
 * `API.get/post/...` therefore resolve with the *unwrapped* payload and
 * reject with `{ status, message, data }` — callers never see the envelope.
 * A 401 automatically tries the refresh token once before giving up.
 */
const API = {
  // Backend origin. Resolution order:
  //  1. window.PHARMLY_API_BASE — set in index.html for deployments
  //  2. localStorage 'pharmly_api_base' — per-browser override (no code edit)
  //  3. Same origin when the SPA is served by the NestJS API itself (:3000)
  //  4. Default dev setup: SPA on :5500 talking to the API on :3000
  base: (() => {
    if (window.PHARMLY_API_BASE) return String(window.PHARMLY_API_BASE).replace(/\/$/, '');
    const override = localStorage.getItem('pharmly_api_base');
    if (override) return override.replace(/\/$/, '');
    // If running in local dev via Live Server on port 5500:
    if (window.location.port === '5500') return 'http://localhost:3000/api/v1';
    // When served from the backend (Render production or localhost:3000), use same-origin /api/v1:
    return '/api/v1';
  })(),

  token: null,
  _refreshing: null,

  init() {
    this.token = sessionStorage.getItem('pharmly_token') || localStorage.getItem('pharmly_token');
  },

  setToken(token, remember = false) {
    this.token = token;
    sessionStorage.setItem('pharmly_token', token);
    if (remember) localStorage.setItem('pharmly_token', token);
    else localStorage.removeItem('pharmly_token');
  },

  clearToken() {
    this.token = null;
    sessionStorage.removeItem('pharmly_token');
    localStorage.removeItem('pharmly_token');
  },

  headers(extra = {}) {
    const h = { ...extra };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  /** Parses the body, throwing a uniform error shape on non-2xx responses. */
  async parse(res) {
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

    if (!res.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join('; ')
        : data?.message || data?.error || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    // Unwrap the success envelope; fall back to the raw body for safety.
    return data && typeof data === 'object' && 'success' in data ? data.data : data;
  },

  async request(path, options = {}, retried = false) {
    let res;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...options,
        headers: this.headers(options.headers || {}),
      });
    } catch (networkError) {
      const err = new Error('Cannot reach the server. Is the API running on port 3000?');
      err.status = 0;
      throw err;
    }

    if (res.status === 401 && !retried && Auth?.isAuthenticated?.()) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request(path, options, true);
      Auth.forceLogout('Your session has expired. Please sign in again.');
      const err = new Error('Session expired');
      err.status = 401;
      throw err;
    }

    return this.parse(res);
  },

  /** Single-flight refresh: concurrent 401s share one refresh call. */
  async tryRefresh() {
    if (!this._refreshing) {
      const refreshToken = sessionStorage.getItem('pharmly_refresh') || localStorage.getItem('pharmly_refresh');
      if (!refreshToken) return false;
      this._refreshing = (async () => {
        try {
          const res = await fetch(`${this.base}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!res.ok) return false;
          const data = await res.json();
          const payload = data?.data ?? data;
          const remember = !!localStorage.getItem('pharmly_refresh');
          this.setToken(payload.accessToken, remember);
          Auth.user = payload.user;
          sessionStorage.setItem('pharmly_user', JSON.stringify(payload.user));
          return true;
        } catch {
          return false;
        } finally {
          setTimeout(() => { this._refreshing = null; }, 0);
        }
      })();
    }
    return this._refreshing;
  },

  get(path) { return this.request(path, { method: 'GET' }); },
  post(path, body) { return this.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); },
  patch(path, body) { return this.request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); },
  put(path, body) { return this.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); },
  del(path) { return this.request(path, { method: 'DELETE' }); },

  /** Helper: append query params, skipping null/undefined/empty values. */
  qs(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  },

  /** Helper: extract { items, meta } from either a paginated or bare array response. */
  list(res) {
    if (Array.isArray(res)) return { items: res, meta: null };
    return { items: res?.items ?? [], meta: res?.meta ?? null };
  },
};
