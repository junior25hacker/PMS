/**
 * Staff account management (admin only): list, create, edit, deactivate,
 * and change-password entry point for the signed-in user.
 */
var UsersView = {
  users: [],
  formOpen: false,
  editing: null,

  async load() {
    try { this.users = await API.get('/users'); }
    catch (e) { toast(e.message, 'error'); }
  },

  render() {
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Staff Accounts (${this.users.length})</span>
          <div class="btn-group">
            <button class="btn" onclick="UsersView.changeMyPassword()">🔑 Change my password</button>
            <button class="btn btn-primary" onclick="UsersView.openForm()">+ New User</button>
          </div>
        </div>
        <div class="card-body">
          ${this.users.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No users found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
               <tbody>${this.users.map((u) => `<tr>
                <td><strong>${esc(u.fullName)}</strong></td><td>${esc(u.email)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'pharmacist' ? 'badge-warning' : 'badge-info'}">${esc(u.role)}</span></td>
                <td>${esc(u.phone || '—')}</td>
                <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? 'Active' : 'Deactivated'}</span></td>
                <td>${u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '—'}</td>
                <td>
                  <button class="btn btn-sm" onclick="UsersView.edit(${u.id})">Edit</button>
                  ${u.isActive && u.id !== Auth.user?.id ? `<button class="btn btn-sm btn-danger" onclick="UsersView.remove(${u.id})">Deactivate</button>` : ''}
                </td>
              </tr>`).join('')}</tbody></table></div>`}
        </div>
      </div>
      ${this.formOpen ? this.formHtml() : ''}
    `;
  },

  formHtml() {
    const e = this.editing || {};
    return `
      <div class="card" id="user-form-card">
        <div class="card-header"><span class="card-title">${this.editing ? 'Edit' : 'New'} User</span></div>
        <div class="card-body">
          <form onsubmit="UsersView.save(event)" style="max-width:480px;">
            <div class="form-group"><label>Full Name *</label><input class="form-control" name="fullName" value="${esc(e.fullName || '')}" required minlength="2"></div>
            <div class="form-group"><label>Email *</label><input class="form-control" name="email" type="email" value="${esc(e.email || '')}" required></div>
            <div class="form-group"><label>Role *</label>
              <select class="form-control" name="role" required>
                <option value="admin" ${e.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="pharmacist" ${e.role === 'pharmacist' ? 'selected' : ''}>Pharmacist</option>
                <option value="cashier" ${e.role === 'cashier' ? 'selected' : ''}>Cashier</option>
              </select>
            </div>
            <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${esc(e.phone || '')}"></div>
            <div class="form-group">
              <label>Password ${this.editing ? '(leave blank to keep current)' : '*'} </label>
              <input class="form-control" name="password" type="password" ${this.editing ? '' : 'required'} minlength="8"
                placeholder="Min 8 chars, at least one letter and one number">
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" class="btn" onclick="UsersView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  openForm() { this.editing = null; this.formOpen = true; this.rerenderForm(); },
  closeForm() { this.formOpen = false; this.editing = null; App.refresh(); },
  edit(id) {
    const u = this.users.find((x) => x.id === id);
    if (!u) return;
    this.editing = u; this.formOpen = true; this.rerenderForm();
  },

  rerenderForm() {
    const existing = document.getElementById('user-form-card');
    if (existing) existing.remove();
    document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml());
    document.getElementById('user-form-card').scrollIntoView({ behavior: 'smooth' });
  },

  async remove(id) {
    confirmDialog('Deactivate user', 'This staff account will be deactivated. History is preserved. Continue?', async () => {
      try { await API.del(`/users/${id}`); toast('User deactivated', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const data = {
      fullName: raw.fullName,
      email: raw.email,
      role: raw.role,
      phone: raw.phone || undefined,
    };
    if (raw.password) data.password = raw.password;
    try {
      if (this.editing) { await API.patch(`/users/${this.editing.id}`, data); toast('User updated', 'success'); }
      else { await API.post('/users', data); toast('User created', 'success'); }
      this.formOpen = false; this.editing = null; App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },

  changeMyPassword() {
    App.showModal('Change my password', `
      <form onsubmit="UsersView.submitPassword(event)">
        <div class="form-group"><label>Current password</label><input class="form-control" name="currentPassword" type="password" required></div>
        <div class="form-group"><label>New password (min 8 chars)</label><input class="form-control" name="newPassword" type="password" required minlength="8"></div>
        <div class="btn-group" style="justify-content:flex-end;">
          <button type="button" class="btn" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update</button>
        </div>
      </form>
    `);
  },

  async submitPassword(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    try {
      const res = await API.patch('/auth/password', raw);
      toast(res.message || 'Password updated', 'success');
      App.closeModal();
    } catch (err) { toast(err.message, 'error'); }
  },
};
