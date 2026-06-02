/* ============================================================
   AUTH — controla telas de login / registro
   ============================================================ */
const Auth = (() => {
  const $ = s => document.querySelector(s);

  function bind() {
    // tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.classList.contains('active')) return;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.tab === 'login';
        $('#loginForm').classList.toggle('hidden', !isLogin);
        $('#registerForm').classList.toggle('hidden', isLogin);
        $('#loginError').textContent = '';
        $('#registerError').textContent = '';
        // anima a entrada do formulário que acabou de aparecer
        const shown = isLogin ? $('#loginForm') : $('#registerForm');
        shown.style.setProperty('--dir', isLogin ? -1 : 1);
        shown.classList.remove('swap-in');
        void shown.offsetWidth; // força reflow pra reiniciar a animação
        shown.classList.add('swap-in');
      });
    });

    // login
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const errEl = $('#loginError');
      const btn = f.querySelector('button[type="submit"]');
      errEl.textContent = '';
      btn.classList.add('loading');
      try {
        const user = await Store.login({ email: f.email.value, password: f.password.value });
        App.boot(user);
      } catch (err) {
        btn.classList.remove('loading');
        errEl.textContent = err.message;
        shakeCard();
      }
    });

    // register
    $('#registerForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const errEl = $('#registerError');
      const btn = f.querySelector('button[type="submit"]');
      errEl.textContent = '';
      btn.classList.add('loading');
      try {
        const user = await Store.register({
          name: f.name.value, email: f.email.value,
          password: f.password.value, income: f.income.value,
          invite: f.invite.value
        });
        await Store.login({ email: f.email.value, password: f.password.value });
        App.boot(user);
      } catch (err) {
        btn.classList.remove('loading');
        errEl.textContent = err.message;
        shakeCard();
      }
    });

    // pré-preenche o e-mail ao trocar de conta (banco de logins)
    try {
      const pre = sessionStorage.getItem('prospera.prefillEmail');
      if (pre) {
        sessionStorage.removeItem('prospera.prefillEmail');
        const inp = $('#loginForm input[name="email"]');
        if (inp) inp.value = pre;
        $('#loginForm input[name="password"]')?.focus();
      }
    } catch { /* sessionStorage indisponível */ }
  }

  function shakeCard() {
    const card = document.querySelector('.auth-card');
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 520);
  }

  function showAuth() {
    document.querySelector('#auth').classList.remove('hidden');
    document.querySelector('#app').classList.add('hidden');
  }

  return { bind, showAuth };
})();
