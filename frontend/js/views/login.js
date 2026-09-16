const LoginView = {
  render() {
    return `
      <div class="login-page">
        <div class="login-box">
          <h1>💊 Pharmly</h1>
          <p class="login-subtitle">Sign in to your account</p>
          <div id="login-error" class="login-error"></div>
          <form onsubmit="LoginView.submit(event)">
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
        </div>
      </div>
    `;
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

  async submit(e) {
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
};
