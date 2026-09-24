const LoginView = {
  mode: 'login',

  render() {
    const isRegister = this.mode === 'register';
    return `
      <div class="login-page">
        <div class="login-box">
          <h1>💊 Pharmly</h1>
          <p class="login-subtitle">${isRegister ? 'Create a new account' : 'Sign in to your account'}</p>

          <div style="display:flex;margin-bottom:18px;border-bottom:1px solid var(--border);">
            <button type="button" class="btn btn-sm" style="flex:1;border-radius:4px 4px 0 0;border-bottom:2px solid ${!isRegister ? 'var(--primary)' : 'transparent'};background:${!isRegister ? 'var(--bg)' : 'transparent'};font-weight:${!isRegister ? '600' : '400'};" onclick="LoginView.switchMode('login')">Sign In</button>
            <button type="button" class="btn btn-sm" style="flex:1;border-radius:4px 4px 0 0;border-bottom:2px solid ${isRegister ? 'var(--primary)' : 'transparent'};background:${isRegister ? 'var(--bg)' : 'transparent'};font-weight:${isRegister ? '600' : '400'};" onclick="LoginView.switchMode('register')">Register</button>
          </div>

          <div id="login-error" class="login-error"></div>

          ${isRegister ? `
            <form onsubmit="LoginView.submitRegister(event)">
              <div class="form-group">
                <label>Full Name</label>
                <input class="form-control" type="text" id="reg-fullname" placeholder="John Doe" required minlength="2">
              </div>
              <div class="form-group">
                <label>Email</label>
                <input class="form-control" type="email" id="reg-email" placeholder="john@pharmly.io" required>
              </div>
              <div class="form-group">
                <label>Phone (Optional)</label>
                <input class="form-control" type="tel" id="reg-phone" placeholder="+15551234567">
              </div>
              <div class="form-group">
                <label>Role</label>
                <select class="form-control" id="reg-role">
                  <option value="pharmacist">Pharmacist</option>
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div class="form-group">
                <label>Password</label>
                <input class="form-control" type="password" id="reg-password" placeholder="At least 8 chars (letters & numbers)" required minlength="8">
              </div>
              <button type="submit" class="btn btn-primary" style="width:100%;padding:10px;" id="reg-submit">Register</button>
            </form>
            <div class="login-footer">
              <p>Already have an account? <a href="javascript:void(0)" onclick="LoginView.switchMode('login')">Sign In</a></p>
            </div>
          ` : `
            <form onsubmit="LoginView.submitLogin(event)">
              <div class="form-group">
                <label>Email</label>
                <input class="form-control" type="email" id="login-email" placeholder="admin@pharmly.io" required>
              </div>
              <div class="form-group">
                <label>Password</label>
                <input class="form-control" type="password" id="login-password" placeholder="Enter password" required>
              </div>
              <div class="form-group form-check">
                <input type="checkbox" id="login-remember">
                <label for="login-remember" style="display:inline;">Keep me signed in</label>
              </div>
              <button type="submit" class="btn btn-primary" style="width:100%;padding:10px;" id="login-submit">Sign In</button>
            </form>
            <div class="login-demo">
              <p>Quick demo sign-in:</p>
              <div class="btn-group" style="justify-content:center;">
                <button class="btn btn-sm" onclick="LoginView.fill('admin@pharmly.io')">Admin</button>
                <button class="btn btn-sm" onclick="LoginView.fill('pharmacist@pharmly.io')">Pharmacist</button>
                <button class="btn btn-sm" onclick="LoginView.fill('cashier@pharmly.io')">Cashier</button>
              </div>
            </div>
            <div class="login-footer">
              <p>Don't have an account? <a href="javascript:void(0)" onclick="LoginView.switchMode('register')">Register here</a></p>
            </div>
          `}
        </div>
      </div>
    `;
  },

  switchMode(mode) {
    this.mode = mode;
    const page = document.getElementById('page');
    if (page) {
      page.innerHTML = this.render();
    }
  },

  fill(email) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = {
      'admin@pharmly.io': 'Admin@123',
      'pharmacist@pharmly.io': 'Pharma@123',
      'cashier@pharmly.io': 'Cashier@123',
    }[email] || '';
    document.getElementById('login-password').focus();
  },

  async submitLogin(e) {
    e.preventDefault();
    const errorBox = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    try {
      await Auth.login(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value,
        document.getElementById('login-remember').checked,
      );
      window.location.hash = `#${App.firstAllowedRoute()}`;
    } catch (err) {
      errorBox.style.display = 'block';
      errorBox.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  },

  async submitRegister(e) {
    e.preventDefault();
    const errorBox = document.getElementById('login-error');
    const submitBtn = document.getElementById('reg-submit');
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';
    try {
      const fullName = document.getElementById('reg-fullname').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const phone = document.getElementById('reg-phone').value.trim() || undefined;
      const role = document.getElementById('reg-role').value;
      const password = document.getElementById('reg-password').value;

      await Auth.register({
        fullName,
        email,
        phone,
        role,
        password,
      });

      if (typeof toast === 'function') toast('Account created successfully!', 'success');
      window.location.hash = `#${App.firstAllowedRoute()}`;
    } catch (err) {
      errorBox.style.display = 'block';
      errorBox.textContent = err.message || 'Registration failed';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register';
    }
  },
};
