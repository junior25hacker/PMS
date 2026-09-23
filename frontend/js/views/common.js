/**
 * Shared helpers used by every view: pagination component, formatting,
 * toasts, confirmation dialogs, debouncing and the print utility.
 */
const Pagination = {
  html(meta, onPageChange) {
    if (!meta) return '';
    window._paginateCb = onPageChange;
    let btns = '';
    const maxVis = 7;
    let start = Math.max(1, meta.page - Math.floor(maxVis / 2));
    let end = Math.min(meta.totalPages, start + maxVis - 1);
    start = Math.max(1, end - maxVis + 1);
    for (let i = start; i <= end; i++) {
      btns += `<button class="${i === meta.page ? 'active' : ''}" onclick="Paginate(${i})">${i}</button>`;
    }
    const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, meta.total);
    return `<div class="pagination">
      <div class="pagination-info">Showing ${from}–${to} of ${meta.total}</div>
      <div class="pagination-buttons">
        <button ${meta.page <= 1 ? 'disabled' : ''} onclick="Paginate(${meta.page - 1})">‹</button>
        ${btns}
        <button ${meta.page >= meta.totalPages ? 'disabled' : ''} onclick="Paginate(${meta.page + 1})">›</button>
      </div>
    </div>`;
  },
};

let _paginateCb = null;
function Paginate(p) {
  if (_paginateCb && p >= 1) _paginateCb(p);
}

/** Escapes user/DB-provided text before it is interpolated into HTML. */
function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCurrency(value) {
  return '$' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/** Bootstrap-style confirm using a modal (never blocks the event loop). */
function confirmDialog(title, message, onConfirm) {
  App.showModal(esc(title), `
    <p>${esc(message)}</p>
    <div class="btn-group" style="margin-top:16px; justify-content:flex-end;">
      <button class="btn" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-danger" id="confirm-yes">Confirm</button>
    </div>
  `);
  document.getElementById('confirm-yes').addEventListener('click', () => {
    App.closeModal();
    onConfirm();
  });
}

/** Trailing-edge debounce for search inputs. */
function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Collects a form's inputs into an object, trimming whitespace. */
function formToObject(formEl) {
  const data = {};
  new FormData(formEl).forEach((value, key) => {
    data[key] = typeof value === 'string' ? value.trim() : value;
  });
  return data;
}

/** Opens the browser print dialog for a dedicated print document. */
function printHTML(title, bodyHTML) {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) { toast('Please allow pop-ups to print', 'error'); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 12px; width: 300px; }
      h2 { text-align: center; font-size: 18px; margin-bottom: 2px; }
      .sub { text-align: center; font-size: 11px; margin-bottom: 8px; }
      .rule { border-top: 1px dashed #000; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; padding: 1px 0; }
      .bold { font-weight: bold; }
      .total { border-top: 1px solid #000; border-bottom: 1px double #000; padding: 4px 0; font-weight: bold; font-size: 14px; margin-top: 6px; }
      .center { text-align: center; }
      @media print { body { width: auto; } }
    </style></head><body>${bodyHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 250);
}

/** Stock badge helper shared by inventory / batches / POS. */
function stockBadge(totalStock, reorderLevel) {
  const cls = totalStock <= 0 ? 'badge-danger' : totalStock <= reorderLevel ? 'badge-warning' : 'badge-success';
  const label = totalStock <= 0 ? 'Out of stock' : totalStock <= reorderLevel ? 'Low' : 'OK';
  return `<span class="badge ${cls}">${totalStock} · ${label}</span>`;
}

function expiryBadge(expiryDate) {
  if (!expiryDate) return '—';
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  const cls = days < 0 ? 'badge-danger' : days < 90 ? 'badge-warning' : 'badge-success';
  const label = days < 0 ? 'EXPIRED' : `${days}d`;
  return `<span class="badge ${cls}" title="${fmtDate(expiryDate)}">${label}</span>`;
}

function poStatusBadge(status) {
  const map = { draft: 'badge-primary', sent: 'badge-info', ordered: 'badge-info', partially_received: 'badge-warning', received: 'badge-success', cancelled: 'badge-danger' };
  const label = status === 'ordered' ? 'sent' : status;
  return `<span class="badge ${map[status] || ''}">${esc((label || '').replace('_', ' '))}</span>`;
}

function saleStatusBadge(status) {
  const map = { completed: 'badge-success', refunded: 'badge-warning', void: 'badge-danger' };
  return `<span class="badge ${map[status] || ''}">${esc(status)}</span>`;
}
