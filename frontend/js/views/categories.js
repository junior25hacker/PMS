var CategoriesView = {
  categories: [],
  formOpen: false,
  editing: null,

  async load() {
    try { this.categories = await API.get('/categories'); }
    catch (e) { toast(e.message, 'error'); }
  },

  render() {
    const canEdit = Auth.can('admin', 'pharmacist');
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Categories (${this.categories.length})</span>
          ${canEdit ? `<button class="btn btn-primary" onclick="CategoriesView.openForm()">+ New Category</button>` : ''}
        </div>
        <div class="card-body">
          ${this.categories.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">🏷️</div><div class="empty-state-text">No categories found</div></div>'
            : `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Medicines</th><th>Status</th><th>Actions</th></tr></thead>
               <tbody>${this.categories.map((c) => `<tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td>${esc(c.description || '—')}</td>
                <td>${c.medicineCount ?? '—'}</td>
                <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-danger'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  ${canEdit ? `<button class="btn btn-sm" onclick="CategoriesView.edit(${c.id})">Edit</button>` : ''}
                  ${canEdit ? `<button class="btn btn-sm btn-danger" onclick="CategoriesView.remove(${c.id})">✕</button>` : ''}
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
      <div class="card" id="category-form-card">
        <div class="card-header"><span class="card-title">${this.editing ? 'Edit' : 'New'} Category</span></div>
        <div class="card-body">
          <form onsubmit="CategoriesView.save(event)" style="max-width:420px;">
            <div class="form-group"><label>Name *</label><input class="form-control" name="name" value="${esc(e.name || '')}" required minlength="2"></div>
            <div class="form-group"><label>Description</label><textarea class="form-control" name="description" rows="2">${esc(e.description || '')}</textarea></div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" class="btn" onclick="CategoriesView.closeForm()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  openForm() { this.editing = null; this.formOpen = true; this.rerenderForm(); },
  closeForm() { this.formOpen = false; this.editing = null; App.refresh(); },
  edit(id) {
    const c = this.categories.find((x) => x.id === id);
    if (!c) return;
    this.editing = c; this.formOpen = true; this.rerenderForm();
  },

  rerenderForm() {
    const existing = document.getElementById('category-form-card');
    if (existing) existing.remove();
    document.getElementById('page').insertAdjacentHTML('beforeend', this.formHtml());
    document.getElementById('category-form-card').scrollIntoView({ behavior: 'smooth' });
  },

  async remove(id) {
    confirmDialog('Delete category', 'Delete this category? Medicines keep their record but lose the category link.', async () => {
      try { await API.del(`/categories/${id}`); toast('Category deleted', 'success'); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    });
  },

  async save(e) {
    e.preventDefault();
    const raw = formToObject(e.target);
    const data = { name: raw.name, description: raw.description || null };
    try {
      if (this.editing) { await API.patch(`/categories/${this.editing.id}`, data); toast('Category updated', 'success'); }
      else { await API.post('/categories', data); toast('Category created', 'success'); }
      this.formOpen = false; this.editing = null; App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  },
};
