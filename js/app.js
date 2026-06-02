/* ============================================================
   APP — orquestra views, navegação, modais e interações.
   ============================================================ */
const App = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let state = { view: 'dashboard', month: monthKey(new Date()), user: null };

  /* ---------------- INIT ---------------- */
  async function init() {
    ensurePersistence(); // pede ao navegador para NÃO descartar os dados/logins
    Auth.bind();
    if (Store.cloudEnabled()) {
      // modo nuvem: restaura a sessão salva pelo Supabase (funciona em qualquer navegador)
      try {
        const u = await Store.restoreSession();
        if (u) boot(u); else Auth.showAuth();
      } catch { Auth.showAuth(); }
      return;
    }
    Store.ensureSeedUser(); // modo local: garante o login fixo de teste (teste@admin.com.br / admin)
    const u = Store.currentUser();
    if (u) boot(u); else Auth.showAuth();
  }

  /* solicita armazenamento persistente — mantém logins e dados após reiniciar
     o app (celular ou computador) e evita que o navegador limpe por falta de espaço */
  async function ensurePersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const already = await navigator.storage.persisted();
        if (!already) await navigator.storage.persist();
      }
    } catch { /* navegador sem suporte — localStorage já persiste por padrão */ }
  }
  async function storageStatus() {
    const out = { persisted: false, supported: false, usedMB: null, quotaMB: null };
    try {
      if (navigator.storage && navigator.storage.persisted) {
        out.supported = true;
        out.persisted = await navigator.storage.persisted();
        if (navigator.storage.estimate) {
          const e = await navigator.storage.estimate();
          if (e.usage != null) out.usedMB = (e.usage / 1048576).toFixed(1);
          if (e.quota != null) out.quotaMB = (e.quota / 1048576).toFixed(0);
        }
      }
    } catch {}
    return out;
  }
  async function requestPersistence() {
    let ok = false;
    try { if (navigator.storage && navigator.storage.persist) ok = await navigator.storage.persist(); } catch {}
    toast(ok ? 'Armazenamento protegido — seus logins e dados não serão apagados' : 'O navegador decidirá a persistência automaticamente', ok ? 'ok' : 'err');
    if (state.view === 'settings') render();
  }

  function boot(user) {
    state.user = user;
    Store.load(user.id);
    applyTheme((Store.data().settings || {}).theme || 'dark');

    const auth = $('#auth');
    const app = $('#app');
    // só anima a transição quando vínhamos da tela de login (auth visível)
    const animate = !auth.classList.contains('hidden') && !REDUCE();

    const reveal = () => {
      auth.classList.add('hidden');
      auth.classList.remove('auth-leaving');
      app.classList.remove('hidden');
      if (animate) {
        app.classList.add('app-entering');
        setTimeout(() => app.classList.remove('app-entering'), 620);
      }
      // perfil
      $('#userName').textContent = user.name;
      $('#userEmail').textContent = user.email;
      $('#userAvatar').textContent = (user.name[0] || 'U').toUpperCase();
      bindShell();
      bindMotionGlobals();
      // gera lançamentos fixos do mês corrente
      materializeRecurring(monthKey(new Date()));
      // relatório automático de fim de mês
      const auto = Reports.maybeAutoGenerate();
      if (auto.generated) toast(`Relatório de ${auto.report.label} gerado automaticamente`, 'ok');
      go('dashboard');
      backupReminder();
    };

    if (animate) {
      auth.classList.add('auth-leaving');
      setTimeout(reveal, 380);
    } else {
      reveal();
    }
  }

  /* gera as ocorrências dos lançamentos recorrentes para o mês informado (idempotente) */
  function materializeRecurring(mk) {
    const curKey = monthKey(new Date());
    if (mk > curKey) return 0; // nunca cria no futuro
    const rules = Store.data().recurring || [];
    if (!rules.length) return 0;
    const tx = Store.data().transactions;
    const [y, m] = mk.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let created = 0;
    rules.forEach(r => {
      const startKey = monthKey(new Date(r.createdAt));
      if (mk < startKey) return;
      if (tx.some(t => t.recurringId === r.id && monthKey(t.date) === mk)) return;
      const day = Math.min(Math.max(1, r.day || 1), daysInMonth);
      Store.addTx({
        type: r.type, amount: r.amount, category: r.category,
        description: r.description, date: `${mk}-${String(day).padStart(2, '0')}`,
        recurring: true, recurringId: r.id
      });
      created++;
    });
    return created;
  }

  function backupReminder() {
    const s = Store.data().settings || {};
    const hasData = (Store.data().transactions || []).length > 0;
    if (!hasData) return;
    const days = s.lastBackup ? (Date.now() - s.lastBackup) / 86400000 : Infinity;
    if (days > 30) {
      setTimeout(() => toast('Faça um backup dos seus dados (Ajustes → Exportar). Última cópia há mais de 30 dias.', 'ok'), 1200);
    }
  }

  /* ---------------- TEMA (claro/escuro) ---------------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f3f1ea' : '#0a0d14');
  }
  function toggleTheme() {
    const cur = (Store.data().settings || {}).theme || 'dark';
    const next = cur === 'light' ? 'dark' : 'light';
    Store.setSettings({ theme: next });
    applyTheme(next);
    const btn = $('#themeBtn'); if (btn) btn.innerHTML = next === 'light' ? ICON('moon') : ICON('sun');
    render();
  }

  function bindShell() {
    // popula ícones SVG do shell (nav + menu)
    document.querySelectorAll('.nav-item').forEach(b => {
      const ic = b.querySelector('.ic');
      if (ic && b.dataset.icon) ic.innerHTML = ICON(b.dataset.icon);
    });
    const mb = $('#menuBtn'); if (mb) mb.innerHTML = ICON('menu');
    document.querySelectorAll('.nav-item').forEach(b =>
      b.onclick = () => { go(b.dataset.view); closeSidebar(); });
    $('#logoutBtn').onclick = () => { Store.logout(); location.reload(); };
    $('#prevMonth').onclick = () => { state.month = Insights.shiftMonth(state.month, -1); materializeRecurring(state.month); render(); };
    $('#nextMonth').onclick = () => { state.month = Insights.shiftMonth(state.month, 1); materializeRecurring(state.month); render(); };
    $('#quickAddBtn').onclick = () => txModal();
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
    const tb = $('#themeBtn');
    if (tb) {
      tb.innerHTML = ((Store.data().settings || {}).theme || 'dark') === 'light' ? ICON('moon') : ICON('sun');
      tb.onclick = toggleTheme;
    }
  }
  function closeSidebar() { $('#sidebar').classList.remove('open'); }

  function go(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    render();
  }

  function render() {
    $('#currentMonthLabel').textContent = monthLabel(state.month);
    const wrap = $('#viewWrap');
    const fn = VIEWS[state.view] || VIEWS.dashboard;
    wrap.innerHTML = fn();
    (AFTER[state.view] || (() => {}))();
    window.scrollTo(0, 0);
    setupReveal(wrap);
    countUpNumbers(wrap);
    applyInteractions(wrap);
  }

  /* magnetismo nos botões + leve inclinação 3D nos cards-herói (cinema) */
  function applyInteractions(scope) {
    if (REDUCE() || matchMedia('(hover:none)').matches) return;
    scope.querySelectorAll('.btn-primary:not(.chat-send)').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2;
        const my = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${(mx * 0.16).toFixed(1)}px,${(my * 0.28).toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
    scope.querySelectorAll('[data-tilt]').forEach(card => {
      card.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1)';
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(1100px) rotateY(${(px * 4.5).toFixed(2)}deg) rotateX(${(-py * 4.5).toFixed(2)}deg) translateY(-3px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  /* ============================================================
     MOVIMENTO — reveal por scroll, count-up e spotlight do cursor
     ============================================================ */
  const REDUCE = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let _motionBound = false;

  /* spotlight que segue o cursor sobre os cards (ligado uma única vez) */
  function bindMotionGlobals() {
    if (_motionBound) return; _motionBound = true;
    document.addEventListener('mousemove', e => {
      const card = e.target.closest && e.target.closest('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
    // magnetismo nos botões fixos do shell (topbar)
    applyInteractions(document.querySelector('.topbar'));
  }

  /* aplica .reveal nos blocos e os revela conforme entram na viewport */
  function setupReveal(scope) {
    if (REDUCE()) return;
    const targets = [];
    scope.querySelectorAll(':scope > *').forEach(el => {
      const group = el.classList.contains('grid') || el.classList.contains('alert-bar');
      const kids = group ? [...el.children] : [el];
      kids.forEach((k, i) => { k.style.setProperty('--d', Math.min(i, 6) * 55); targets.push(k); });
    });
    if (!targets.length) return;
    targets.forEach(el => el.classList.add('reveal'));
    if (!('IntersectionObserver' in window)) { targets.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -7% 0px' });
    targets.forEach(el => io.observe(el));
  }

  /* anima os números (R$, %, score) de 0 até o valor final */
  function countUpNumbers(scope) {
    if (REDUCE()) return;
    const els = scope.querySelectorAll('.stat .value, .kv .v, .score-ring .num');
    els.forEach(el => {
      const raw = el.textContent.trim();
      const m = raw.match(/^(\D*?)(-?[\d.,]+)(\D*)$/);
      if (!m) return;
      const prefix = m[1], suffix = m[3];
      const numStr = m[2];
      const target = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
      if (!isFinite(target) || target === 0) return;
      const dec = (numStr.split(',')[1] || '').length;
      const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const dur = 850, t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + fmt.format(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = prefix + fmt.format(target) + suffix;
      };
      el.textContent = prefix + fmt.format(0) + suffix;
      requestAnimationFrame(tick);
    });
  }

  /* ---------------- DATA HELPERS ---------------- */
  const monthTx = () => Store.data().transactions
    .filter(t => monthKey(t.date) === state.month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  /* ============================================================
     VIEWS
     ============================================================ */
  const VIEWS = {
    /* ---------- DASHBOARD ---------- */
    dashboard() {
      const d = Store.data();
      // onboarding: conta totalmente nova
      if (!(d.transactions || []).length && !(d.debts || []).length && !(d.goals || []).length) {
        return onboarding();
      }
      const a = Insights.analyze(state.month);
      const score = Insights.healthScore(a);
      const sl = Insights.scoreLabel(score);
      const al = Finance.allocation(state.month);
      const rv = Finance.reserve(state.month);
      const recent = monthTx().slice(0, 6);
      const alerts = Insights.alerts(state.month);
      const proj = Insights.projection(state.month);
      const comp = Insights.categoryComparison(state.month).slice(0, 4);

      const catItems = a.topCats.slice(0, 6).map(c => ({ label: c.name, value: c.value }));

      // histórico 6 meses
      const months = Insights.lastNMonths(state.month, 6);
      const tx = Store.data().transactions;
      const groups = months.map(mk => ({
        label: monthLabel(mk).split(' ')[0].slice(0, 3),
        income: tx.filter(t => t.type === 'income' && monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0),
        expense: tx.filter(t => t.type === 'expense' && monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0)
      }));

      return `
      <div class="view-head"><div><h2>Painel</h2><p>Visão geral de ${monthLabel(state.month).toLowerCase()}</p></div></div>

      ${alerts.length ? `<div class="alert-bar">
        ${alerts.slice(0, 4).map(al => `<div class="alert ${al.level}"><span class="ai">${ICON(al.ico)}</span><span>${esc(al.text)}</span></div>`).join('')}
      </div>` : ''}

      <div class="grid cols-4" style="margin-bottom:16px">
        ${stat('Receitas', fmtBRL(a.income), 'pos', 'arrowUp')}
        ${stat('Despesas', fmtBRL(a.expense), 'neg', 'arrowDown')}
        ${stat('Saldo do mês', fmtBRL(a.balance), a.balance >= 0 ? 'pos' : 'neg', 'wallet')}
        ${stat('Poupança', a.savingsRate.toFixed(0) + '%', '', 'vault', a.refIncome ? `da renda (${fmtBRL(a.refIncome)})` : '')}
      </div>

      <div class="grid cols-2" style="margin-bottom:16px">
        <div class="card" data-tilt>
          <h3>${ICON('pulse')} Saúde financeira</h3>
          <div class="row" style="gap:22px">
            <div class="score-ring">
              <div class="num" style="color:${sl.color}">${score}</div>
              <div class="lbl">${sl.txt}</div>
            </div>
            <div style="flex:1">
              <div class="bar ${score < 50 ? 'red' : ''}" style="margin-bottom:10px"><span style="width:${score}%"></span></div>
              <p class="muted" style="font-size:13px">Calculado a partir da sua taxa de poupança, reserva de emergência, nível de endividamento e investimentos.</p>
              <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="App.go('insights')">Ver insights →</button>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>${ICON('bars')} Receitas × Despesas (6 meses)</h3>
          ${Charts.bars(groups)}
        </div>
      </div>

      ${al.hasIncome ? `<div class="grid cols-2" style="margin-bottom:16px">
        <div class="card">
          <div class="row spread"><h3>${ICON('scale')} Plano do mês</h3>
            <button class="btn btn-ghost btn-sm" onclick="App.go('orcamento')">Abrir orçamento →</button></div>
          <p class="muted" style="font-size:12.5px;margin:-6px 0 16px">${esc(al.methodLabel)} · renda base ${fmtBRL(al.income)}</p>
          ${al.buckets.map(b => `<div style="margin-bottom:14px">
            <div class="row spread" style="font-size:13px;margin-bottom:6px">
              <span style="display:flex;align-items:center;gap:7px;font-weight:600">${ICON(b.icon)} ${b.label}</span>
              <span class="muted" style="font-variant-numeric:tabular-nums">${fmtBRL(b.actual)} <span style="opacity:.6">/ ${fmtBRL(b.target)}</span></span>
            </div>
            <div class="bar ${b.over ? 'red' : ''}"><span style="width:${Math.min(100, b.pct)}%"></span></div>
          </div>`).join('')}
        </div>
        <div class="card reserve-card${rv.status === 'good' ? ' good' : ''}">
          <div class="row spread"><h3>${ICON('shield')} Reserva de emergência</h3>
            <button class="btn btn-ghost btn-sm" onclick="App.go('orcamento')">Plano →</button></div>
          <div class="row" style="gap:20px;align-items:center;margin-top:6px">
            <div class="reserve-gauge">
              <div><div class="reserve-months">${rv.months.toFixed(1)}</div><div class="reserve-lbl">meses</div></div>
            </div>
            <div style="flex:1">
              <div class="bar ${rv.status === 'good' ? '' : 'red'}" style="margin-bottom:12px"><span style="width:${Math.min(100, rv.pct)}%"></span></div>
              <p class="muted" style="font-size:13px;margin:0">${rv.status === 'good'
                ? `Você tem ${fmtBRL(rv.current)} guardados — proteção para ${rv.months.toFixed(1)} meses de custo.`
                : `Você tem ${fmtBRL(rv.current)}. Faltam ${fmtBRL(rv.missing)} para cobrir ${rv.targetMonths} meses${rv.monthlyToGoal12 ? ` — ${fmtBRL(rv.monthlyToGoal12)}/mês fecham em 1 ano.` : '.'}`}</p>
            </div>
          </div>
        </div>
      </div>` : ''}

      ${(proj || comp.length) ? `<div class="grid cols-2" style="margin-bottom:16px">
        ${proj ? `<div class="card">
          <h3>${ICON('radar')} Projeção de fim de mês</h3>
          <p class="muted" style="font-size:13px;margin:-6px 0 16px">No ritmo atual (dia ${proj.day} de ${proj.daysInMonth}), estimamos como o mês deve fechar.</p>
          <div class="kv-grid" style="grid-template-columns:1fr 1fr">
            <div class="kv"><div class="k">Despesa projetada</div><div class="v" style="color:var(--red)">${fmtBRL(proj.projExpense)}</div></div>
            <div class="kv"><div class="k">Saldo projetado</div><div class="v" style="color:${proj.projBalance >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtBRL(proj.projBalance)}</div></div>
          </div>
          <p class="muted" style="font-size:12.5px;margin-top:12px">Gasto até agora: ${fmtBRL(proj.currentExpense)} · ritmo de ${fmtBRL(proj.pace)}/dia.</p>
        </div>` : ''}
        ${comp.length ? `<div class="card">
          <h3>${ICON('repeat')} Comparativo com o mês anterior</h3>
          <div class="list">${comp.map(c => `<div class="list-item">
            <div class="li-icon">${ICON(c.icon)}</div>
            <div class="li-body"><strong>${esc(c.name)}</strong><small>${fmtBRL(c.prev)} → ${fmtBRL(c.cur)}</small></div>
            <div class="li-amt ${c.diff > 0 ? 'neg' : 'pos'}">${ICON(c.diff > 0 ? 'arrowUp' : 'arrowDown')} ${Math.abs(c.pct).toFixed(0)}%</div>
          </div>`).join('')}</div>
        </div>` : ''}
      </div>` : ''}

      <div class="grid cols-2">
        <div class="card">
          <h3>${ICON('pie')} Para onde foi seu dinheiro</h3>
          ${catItems.length ? Charts.donut(catItems) : empty('pie', 'Sem despesas neste mês')}
        </div>
        <div class="card">
          <div class="row spread"><h3>${ICON('clock')} Últimos lançamentos</h3>
            <button class="btn btn-ghost btn-sm" onclick="App.go('transactions')">Ver todos</button></div>
          ${recent.length ? `<div class="list">${recent.map(txRow).join('')}</div>` : empty('transactions', 'Nenhum lançamento ainda')}
        </div>
      </div>`;
    },

    /* ---------- TRANSACTIONS ---------- */
    transactions() {
      const all = monthTx();
      const a = Insights.analyze(state.month);
      return `
      <div class="view-head">
        <div><h2>Lançamentos</h2><p>${all.length} registro(s) em ${monthLabel(state.month).toLowerCase()}</p></div>
        <button class="btn btn-primary" onclick="App.txModal()">+ Novo lançamento</button>
      </div>
      <div class="grid cols-3" style="margin-bottom:16px">
        ${stat('Receitas', fmtBRL(a.income), 'pos', 'arrowUp')}
        ${stat('Despesas', fmtBRL(a.expense), 'neg', 'arrowDown')}
        ${stat('Saldo', fmtBRL(a.balance), a.balance >= 0 ? 'pos' : 'neg', 'wallet')}
      </div>
      <div class="card">
        <div class="filters">
          <div class="search-wrap">${ICON('search')}<input type="text" id="fSearch" placeholder="Buscar descrição ou categoria..." /></div>
          <select id="fType"><option value="">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select>
          <select id="fCat"><option value="">Todas as categorias</option>
            ${[...CATEGORIES.expense, ...CATEGORIES.income].filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="filters">
          <label style="flex:1;min-width:140px">De<input type="date" id="fFrom" /></label>
          <label style="flex:1;min-width:140px">Até<input type="date" id="fTo" /></label>
          <button class="btn btn-ghost btn-sm" style="align-self:flex-end" onclick="App.clearFilters()">Limpar</button>
        </div>
        <div class="muted" id="fSummary" style="font-size:13px;margin-bottom:12px"></div>
        <div class="list" id="txList">${all.length ? all.map(txRow).join('') : empty('transactions', 'Nenhum lançamento. Clique em “Novo lançamento”.')}</div>
      </div>`;
    },

    /* ---------- DEBTS ---------- */
    debts() {
      const debts = Store.data().debts || [];
      const a = Insights.analyze(state.month);
      const totalRemaining = debts.reduce((s, x) => s + Math.max(0, x.total - Insights.paidOf(x)), 0);
      const totalPaid = debts.reduce((s, x) => s + Insights.paidOf(x), 0);

      const rows = debts.map(d => {
        const paid = Insights.paidOf(d);
        const remaining = Math.max(0, d.total - paid);
        const pct = d.total > 0 ? (paid / d.total) * 100 : 0;
        const done = remaining <= 0;
        return `<div class="card" style="margin-bottom:12px">
          <div class="row spread">
            <div class="row" style="gap:12px">
              <div class="li-icon" style="background:var(--red-soft)">${ICON('debt')}</div>
              <div><strong style="font-size:15px">${esc(d.name)} ${done ? '<span class="pill pos">Quitada</span>' : ''}</strong>
              <div class="muted" style="font-size:12.5px">${d.interestRate ? d.interestRate + '% a.m. · ' : ''}${d.dueDate ? 'Venc. ' + d.dueDate : 'Sem vencimento'} · Mínimo ${fmtBRL(d.minPayment || 0)}</div></div>
            </div>
            <div class="li-actions" style="opacity:1">
              ${done ? '' : `<button class="btn btn-primary btn-sm" onclick="App.payModal('${d.id}')">Pagar</button>`}
              <button class="mini-btn" onclick="App.debtModal('${d.id}')">${ICON('edit')}</button>
              <button class="mini-btn" onclick="App.delDebt('${d.id}')">${ICON('trash')}</button>
            </div>
          </div>
          <div style="margin-top:14px">
            <div class="row spread" style="font-size:13px;margin-bottom:6px">
              <span class="muted">Pago ${fmtBRL(paid)}</span><strong>Falta ${fmtBRL(remaining)}</strong></div>
            <div class="bar ${done ? '' : 'red'}"><span style="width:${pct}%"></span></div>
          </div>
        </div>`;
      }).join('');

      // estratégias
      const open = debts.filter(d => d.total - Insights.paidOf(d) > 0);
      const avalanche = [...open].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0))[0];
      const snowball = [...open].sort((a, b) => (a.total - Insights.paidOf(a)) - (b.total - Insights.paidOf(b)))[0];

      return `
      <div class="view-head">
        <div><h2>Dívidas</h2><p>Acompanhe e quite suas dívidas</p></div>
        <button class="btn btn-primary" onclick="App.debtModal()">+ Nova dívida</button>
      </div>
      <div class="grid cols-3" style="margin-bottom:16px">
        ${stat('Total em aberto', fmtBRL(totalRemaining), 'neg', 'debt')}
        ${stat('Já pago', fmtBRL(totalPaid), 'pos', 'check')}
        ${stat('Comprom. da renda', a.debtToIncome.toFixed(0) + '%', a.debtToIncome > 30 ? 'neg' : '', 'scale', 'ideal ≤ 30%')}
      </div>
      ${open.length ? `<div class="card" style="margin-bottom:16px">
        <h3>${ICON('target')} Estratégia recomendada para quitar</h3>
        <div class="grid cols-2">
          <div class="insight tip" style="margin:0"><div class="ico">${ICON('layers')}</div><div>
            <h4>Método Avalanche (economiza mais juros)</h4>
            <p>Ataque primeiro <strong>${esc(avalanche?.name || '—')}</strong> ${avalanche?.interestRate ? `(${avalanche.interestRate}% a.m.)` : ''}, pagando o mínimo das demais.</p></div></div>
          <div class="insight good" style="margin:0"><div class="ico">${ICON('snowflake')}</div><div>
            <h4>Método Bola de Neve (motivação)</h4>
            <p>Quite primeiro a menor dívida — <strong>${esc(snowball?.name || '—')}</strong> (${fmtBRL(snowball ? snowball.total - Insights.paidOf(snowball) : 0)}) — para ganhar tração.</p></div></div>
        </div>
      </div>` : ''}
      ${open.length ? `<div class="card sim-card" style="margin-bottom:16px">
        <h3>${ICON('radar')} Simulador de quitação</h3>
        <p class="muted" style="font-size:13px;margin:-6px 0 16px">Quanto você consegue colocar a mais por mês, além dos mínimos? Veja em quanto tempo fica livre e quanto economiza de juros.</p>
        <div class="filters" style="margin-bottom:18px;align-items:flex-end">
          <div class="seg" id="simMethod" style="flex:1;min-width:220px">
            <button class="active exp" data-m="avalanche">${ICON('layers')} Avalanche</button>
            <button data-m="snowball">${ICON('snowflake')} Bola de neve</button>
          </div>
          <label style="flex:1;min-width:180px">Valor extra por mês (R$)
            <input type="number" id="simExtra" min="0" step="50" value="200" placeholder="0,00" /></label>
        </div>
        <div id="simResult"></div>
      </div>` : ''}
      ${debts.length ? rows : empty('check', 'Você não tem dívidas registradas. Continue assim!')}`;
    },

    /* ---------- GOALS ---------- */
    goals() {
      const goals = Store.data().goals || [];
      const rows = goals.map(g => {
        const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
        const done = g.saved >= g.target && g.target > 0;
        return `<div class="card" style="margin-bottom:12px">
          <div class="row spread">
            <div class="row" style="gap:12px">
              <div class="li-icon" style="background:var(--surface-2)">${ICON('target')}</div>
              <div><strong style="font-size:15px">${esc(g.name)} ${done ? '<span class="pill pos">Concluída</span>' : ''}</strong>
              <div class="muted" style="font-size:12.5px">${g.deadline ? 'Até ' + g.deadline : 'Sem prazo'}</div></div>
            </div>
            <div class="li-actions" style="opacity:1">
              <button class="btn btn-primary btn-sm" onclick="App.contributeModal('${g.id}')">Guardar</button>
              <button class="mini-btn" onclick="App.goalModal('${g.id}')">${ICON('edit')}</button>
              <button class="mini-btn" onclick="App.delGoal('${g.id}')">${ICON('trash')}</button>
            </div>
          </div>
          <div style="margin-top:14px">
            <div class="row spread" style="font-size:13px;margin-bottom:6px">
              <span class="muted">${fmtBRL(g.saved)}</span><strong>${fmtBRL(g.target)}</strong></div>
            <div class="bar"><span style="width:${pct}%"></span></div>
          </div>
        </div>`;
      }).join('');
      return `
      <div class="view-head">
        <div><h2>Metas</h2><p>Defina objetivos e acompanhe o progresso</p></div>
        <button class="btn btn-primary" onclick="App.goalModal()">+ Nova meta</button>
      </div>
      ${goals.length ? rows : empty('target', 'Crie uma meta — reserva de emergência, viagem, um sonho...')}`;
    },

    /* ---------- PLANEJAR (orçamentos + recorrentes) ---------- */
    planejar() {
      const a = Insights.analyze(state.month);
      const rules = Store.data().recurring || [];

      const budgetRows = a.budgetRows.length ? a.budgetRows.map(b => {
        const over = b.pct >= 100;
        return `<div class="card" style="margin-bottom:12px">
          <div class="row spread">
            <div class="row" style="gap:12px">
              <div class="li-icon">${ICON(b.icon)}</div>
              <div><strong style="font-size:15px">${esc(b.name)} ${over ? '<span class="pill neg">Estourado</span>' : b.pct >= 80 ? '<span class="pill warn">No limite</span>' : ''}</strong>
              <div class="muted" style="font-size:12.5px">Gasto ${fmtBRL(b.spent)} de ${fmtBRL(b.limit)} · resta ${fmtBRL(Math.max(0, b.remaining))}</div></div>
            </div>
            <div class="li-actions" style="opacity:1">
              <button class="mini-btn" onclick="App.budgetModal('${b.id}')">${ICON('edit')}</button>
              <button class="mini-btn" onclick="App.removeBudget('${b.id}')">${ICON('trash')}</button>
            </div>
          </div>
          <div class="bar ${over ? 'red' : ''}" style="margin-top:14px"><span style="width:${Math.min(100, b.pct)}%"></span></div>
        </div>`;
      }).join('') : empty('calculator', 'Nenhum orçamento definido. Crie limites por categoria para se controlar.');

      const recRows = rules.length ? rules.map(r => {
        const c = catInfo(r.type, r.category);
        return `<div class="list-item">
          <div class="li-icon">${ICON(c.icon)}</div>
          <div class="li-body"><strong>${esc(r.description || c.name)}</strong>
          <small>${c.name} · todo dia ${r.day} · ${r.type === 'income' ? 'receita' : 'despesa'}</small></div>
          <div class="li-amt ${r.type === 'income' ? 'pos' : 'neg'}">${r.type === 'income' ? '+' : '−'} ${fmtBRL(r.amount)}</div>
          <div class="li-actions" style="opacity:1">
            <button class="mini-btn" onclick="App.recurringModal('${r.id}')">${ICON('edit')}</button>
            <button class="mini-btn" onclick="App.delRecurring('${r.id}')">${ICON('trash')}</button>
          </div>
        </div>`;
      }).join('') : empty('repeat', 'Nenhum lançamento fixo. Cadastre aluguel, salário, assinaturas...');

      return `
      <div class="view-head"><div><h2>Planejar</h2><p>Orçamentos por categoria e lançamentos fixos</p></div></div>

      <div class="card" style="margin-bottom:18px">
        <div class="row spread" style="margin:-4px 0 16px">
          <h3 style="border:none;padding:0;margin:0">${ICON('calculator')} Orçamento de ${monthLabel(state.month).toLowerCase()}</h3>
          <button class="btn btn-primary btn-sm" onclick="App.budgetModal()">+ Definir orçamento</button>
        </div>
        ${a.budgetRows.length ? `<div class="row spread" style="font-size:13px;margin-bottom:6px"><span class="muted">Total usado ${fmtBRL(a.budgetSpent)}</span><strong>de ${fmtBRL(a.budgetTotal)}</strong></div>
          <div class="bar ${a.budgetSpent > a.budgetTotal ? 'red' : ''}" style="margin-bottom:18px"><span style="width:${a.budgetTotal > 0 ? Math.min(100, (a.budgetSpent / a.budgetTotal) * 100) : 0}%"></span></div>` : ''}
        ${budgetRows}
      </div>

      <div class="card">
        <div class="row spread" style="margin:-4px 0 16px">
          <h3 style="border:none;padding:0;margin:0">${ICON('repeat')} Lançamentos fixos (recorrentes)</h3>
          <button class="btn btn-primary btn-sm" onclick="App.recurringModal()">+ Novo recorrente</button>
        </div>
        <p class="muted" style="font-size:13px;margin:-8px 0 14px">Geramos automaticamente esses lançamentos no início de cada mês.</p>
        <div class="list">${recRows}</div>
      </div>`;
    },

    /* ---------- ORÇAMENTO (alocação 50/30/20 + reserva + 3 funções) ---------- */
    orcamento() {
      const al = Finance.allocation(state.month);
      const rv = Finance.reserve(state.month);
      const fns = Finance.moneyFunctions(state.month);

      const methodChips = Object.entries(Finance.METHODS).map(([k, m]) =>
        `<button class="chip ${al.method === k ? 'active' : ''}" onclick="App.setMethod('${k}')">${esc(m.label)}</button>`).join('');

      const bucketColor = b => b.key === 'save'
        ? (b.pct >= 100 ? 'var(--green)' : 'var(--amber)')
        : (b.over ? 'var(--red)' : 'var(--green)');

      const bucketCard = b => {
        const cls = b.over ? (b.key === 'save' ? 'warn' : 'neg') : 'pos';
        const tag = b.key === 'save'
          ? (b.pct >= 100 ? '<span class="pill pos">No alvo</span>' : '<span class="pill warn">Abaixo da meta</span>')
          : (b.over ? '<span class="pill neg">Acima</span>' : '<span class="pill pos">Dentro</span>');
        return `<div class="card alloc-card">
          <div class="row spread" style="align-items:flex-start">
            <div class="row" style="gap:12px">
              <div class="li-icon">${ICON(b.icon)}</div>
              <div><strong style="font-size:15px">${b.label}</strong>
              <div class="muted" style="font-size:12.5px">meta ${b.targetPct}% · ${fmtBRL(b.target)}</div></div>
            </div>${tag}
          </div>
          <div class="alloc-figure" style="color:${bucketColor(b)}">${fmtBRL(b.actual)}</div>
          <div class="bar ${b.over && b.key !== 'save' ? 'red' : ''}" style="margin:6px 0 8px"><span style="width:${Math.min(100, b.pct)}%"></span></div>
          <div class="muted" style="font-size:12px">${b.key === 'save'
            ? (b.diff >= 0 ? `Você guardou ${fmtBRL(b.diff)} além da meta.` : `Faltam ${fmtBRL(-b.diff)} para bater a meta de poupança.`)
            : (b.diff > 0 ? `${fmtBRL(b.diff)} acima do recomendado.` : `${fmtBRL(-b.diff)} de folga no balde.`)}</div>
        </div>`;
      };

      const fnItems = fns.filter(f => f.value > 0).map(f => ({ label: f.label, value: f.value }));

      return `
      <div class="view-head"><div><h2>Orçamento</h2><p>Divida sua renda em baldes e acompanhe onde ela realmente vai</p></div></div>

      <div class="card" style="margin-bottom:18px">
        <div class="row spread" style="margin:-4px 0 14px;flex-wrap:wrap;gap:10px">
          <h3 style="border:none;padding:0;margin:0">${ICON('scale')} Método de alocação</h3>
        </div>
        <div class="chip-row" style="margin-bottom:12px">${methodChips}</div>
        <p class="muted" style="font-size:13px;margin:0">${esc((Finance.METHODS[al.method] || {}).hint || '')}</p>
      </div>

      ${al.hasIncome ? `<div class="grid cols-3" style="margin-bottom:18px">
        ${al.buckets.map(bucketCard).join('')}
      </div>` : `<div class="card" style="margin-bottom:18px">${empty('wallet', 'Defina sua renda de referência em Ajustes para ver a alocação ideal.')}</div>`}

      <div class="grid cols-2" style="margin-bottom:18px">
        <div class="card reserve-card ${rv.status}">
          <h3>${ICON('shield')} Reserva de emergência</h3>
          <div class="row" style="gap:22px;align-items:center">
            <div class="reserve-gauge">
              <div class="reserve-months">${rv.months.toFixed(1)}</div>
              <div class="reserve-lbl">meses de custo</div>
            </div>
            <div style="flex:1;min-width:160px">
              <div class="bar ${rv.status === 'bad' ? 'red' : ''}" style="margin-bottom:10px"><span style="width:${rv.pct}%"></span></div>
              <div class="kv-grid" style="grid-template-columns:1fr 1fr;gap:8px">
                <div class="kv"><div class="k">Você tem</div><div class="v">${fmtBRL(rv.current)}</div></div>
                <div class="kv"><div class="k">Meta (${rv.targetMonths}m)</div><div class="v">${fmtBRL(rv.target)}</div></div>
              </div>
              ${rv.missing > 0
                ? `<p class="muted" style="font-size:12.5px;margin-top:12px">Faltam ${fmtBRL(rv.missing)}. Guardando ${fmtBRL(rv.monthlyToGoal12)}/mês, você fecha a reserva em 12 meses.</p>`
                : `<p class="muted" style="font-size:12.5px;margin-top:12px">Reserva completa. Próximo passo: direcionar o excedente para investimentos.</p>`}
            </div>
          </div>
        </div>
        <div class="card">
          <h3>${ICON('radar')} As 3 funções do seu dinheiro</h3>
          ${fnItems.length ? Charts.donut(fnItems, { size: 150, thickness: 22 }) : empty('pie', 'Sem despesas para classificar neste mês')}
          <p class="muted" style="font-size:12px;margin-top:14px">Todo gasto serve para <strong>sobreviver</strong>, <strong>proteger</strong> ou <strong>crescer</strong>. O que não se encaixa em nenhuma é ruído a revisar.</p>
        </div>
      </div>`;
    },

    /* ---------- PATRIMÔNIO (balanço: ativos − passivos) ---------- */
    patrimonio() {
      const nw = Finance.netWorth();
      const assets = Store.data().assets || [];
      const KINDS = { liquid: 'Liquidez', invest: 'Investimento', property: 'Bem / patrimônio', other: 'Outro' };

      const assetRows = assets.length ? assets.map(x => `<div class="list-item">
        <div class="li-icon">${ICON(x.source === 'bank' ? 'bank' : x.kind === 'liquid' ? 'wallet' : x.kind === 'invest' ? 'invest' : x.kind === 'property' ? 'home' : 'box')}</div>
        <div class="li-body"><strong>${esc(x.name)}</strong><small>${x.source === 'bank' ? 'Conta conectada · saldo sincronizado' : (KINDS[x.kind] || 'Ativo')}</small></div>
        <div class="li-amt pos">${fmtBRL(x.value)}</div>
        <div class="li-actions" style="opacity:1">
          <button class="mini-btn" onclick="App.assetModal('${x.id}')">${ICON('edit')}</button>
          <button class="mini-btn" onclick="App.delAsset('${x.id}')">${ICON('trash')}</button>
        </div>
      </div>`).join('') : empty('layers', 'Cadastre seus ativos — conta, investimentos, bens — para ver seu patrimônio real.');

      return `
      <div class="view-head">
        <div><h2>Patrimônio líquido</h2><p>Seu balanço: tudo que você tem menos tudo que você deve</p></div>
        <button class="btn btn-primary" onclick="App.assetModal()">+ Novo ativo</button>
      </div>

      <div class="card networth-hero" data-tilt style="margin-bottom:18px">
        <div class="nw-label">${ICON('layers')} Patrimônio líquido</div>
        <div class="nw-value ${nw.total >= 0 ? 'pos' : 'neg'}">${fmtBRL(nw.total)}</div>
        <div class="nw-equation">
          <span class="nw-term"><small>Ativos</small><strong class="pos">${fmtBRL(nw.totalAssets)}</strong></span>
          <span class="nw-op">−</span>
          <span class="nw-term"><small>Passivos (dívidas)</small><strong class="neg">${fmtBRL(nw.debts)}</strong></span>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <h3>${ICON('pie')} Composição dos ativos</h3>
          ${nw.breakdown.length ? Charts.donut(nw.breakdown.map(b => ({ label: b.label, value: b.value })), { size: 150, thickness: 22 }) : empty('invest', 'Sem ativos cadastrados ainda')}
        </div>
        <div class="card">
          <div class="row spread"><h3 style="border:none;padding:0;margin:0">${ICON('wallet')} Seus ativos</h3></div>
          <div class="list" style="margin-top:14px">${assetRows}</div>
        </div>
      </div>`;
    },

    /* ---------- INSIGHTS ---------- */
    insights() {
      const a = Insights.analyze(state.month);
      const score = Insights.healthScore(a);
      const sl = Insights.scoreLabel(score);
      const list = Insights.generate(a);
      return `
      <div class="view-head"><div><h2>Insights</h2><p>Análise da sua situação em ${monthLabel(state.month).toLowerCase()}</p></div></div>
      <div class="card" style="margin-bottom:18px">
        <div class="row" style="gap:24px;flex-wrap:wrap">
          <div class="score-ring"><div class="num" style="color:${sl.color}">${score}</div><div class="lbl">${sl.txt}</div></div>
          <div style="flex:1;min-width:240px">
            <h3 style="margin-bottom:8px">Avaliação geral</h3>
            <p class="muted" style="font-size:14px">Avaliei suas receitas, despesas, reserva, dívidas e investimentos deste mês. As recomendações abaixo são feitas para a <strong>sua realidade</strong> — não conselhos genéricos.</p>
            <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">
              <span class="pill ${a.savingsRate >= 10 ? 'pos' : 'neg'}">Poupança ${a.savingsRate.toFixed(0)}%</span>
              <span class="pill ${a.emergencyCoverage >= 3 ? 'pos' : 'warn'}">Reserva ${a.emergencyCoverage.toFixed(1)} meses</span>
              <span class="pill ${a.debtToIncome > 30 ? 'neg' : 'pos'}">Dívidas ${a.debtToIncome.toFixed(0)}% da renda</span>
            </div>
          </div>
        </div>
      </div>
      ${list.map(i => `<div class="insight ${i.type}"><div class="ico">${ICON(i.ico)}</div>
        <div><h4>${esc(i.title)}</h4><p>${esc(i.text)}</p></div></div>`).join('')}`;
    },

    /* ---------- CONSULTOR (chat) ---------- */
    consultor() {
      const msgs = Advisor.history();
      const aiOn = Advisor.hasAI();
      const sugg = Advisor.suggestions();
      const body = msgs.length
        ? msgs.map(m => chatBubble(m.role, m.text)).join('')
        : chatBubble('bot', welcomeText());
      return `
      <div class="view-head">
        <div><h2>Consultor</h2><p>Converse sobre suas finanças — respostas com base nos seus números reais</p></div>
        <div class="row" style="gap:8px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="App.aiModal()">${ICON('spark')} ${aiOn ? 'IA conectada' : 'Conectar IA'}</button>
          ${msgs.length ? `<button class="mini-btn" title="Limpar conversa" onclick="App.advisorClear()">${ICON('trash')}</button>` : ''}
        </div>
      </div>
      <div class="chat">
        <div class="chat-scroll" id="chatScroll">${body}</div>
        <div class="chat-suggest" id="chatSuggest">
          ${sugg.map(q => `<button class="chip" type="button" onclick="App.advisorAsk(this.textContent)">${esc(q)}</button>`).join('')}
        </div>
        <form class="chat-input" id="chatForm" autocomplete="off">
          <input id="chatInput" type="text" placeholder="Escreva sua pergunta..." aria-label="Mensagem" />
          <button class="btn btn-primary chat-send" type="submit" aria-label="Enviar">${ICON('send')}</button>
        </form>
      </div>`;
    },

    /* ---------- BANCOS (Open Finance / conexões) ---------- */
    bancos() {
      const conns = Store.connections();
      const apiOn = Bank.hasAggregator();
      const digital = Bank.INSTITUTIONS.filter(b => b.type === 'digital');
      const physical = Bank.INSTITUTIONS.filter(b => b.type === 'physical');
      const instCard = b => `<button class="bank-chip" type="button" onclick="App.bankConnectModal('${b.id}')">
        <span class="bank-logo">${b.short}</span><span>${esc(b.name)}</span></button>`;
      const connRow = c => {
        const inst = Bank.institution(c.instId);
        const synced = c.lastSync
          ? new Date(c.lastSync).toLocaleDateString('pt-BR') + ' ' + new Date(c.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : 'ainda não';
        return `<div class="conn-card">
          <div class="conn-head">
            <span class="bank-logo lg">${inst.short}</span>
            <div class="conn-meta"><strong>${esc(c.name || inst.name)}</strong>
              <small>${inst.type === 'digital' ? 'Banco digital' : 'Banco tradicional'} · sincronizado: ${synced}</small></div>
            <span class="conn-balance ${(c.balance || 0) < 0 ? 'neg' : 'pos'}">${fmtBRL(c.balance || 0)}</span>
          </div>
          <div class="conn-actions">
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">${ICON('upload')} Importar extrato
              <input type="file" accept=".ofx,.csv,.txt,text/csv,application/x-ofx" style="display:none" onchange="App.bankImport(event,'${c.id}')" /></label>
            ${apiOn ? `<button class="btn btn-ghost btn-sm" onclick="App.bankSync('${c.id}')">${ICON('repeat')} Sincronizar via API</button>` : ''}
            <button class="mini-btn" title="Desconectar" onclick="App.bankDisconnect('${c.id}')">${ICON('trash')}</button>
          </div>
        </div>`;
      };
      return `
      <div class="view-head">
        <div><h2>Bancos</h2><p>Conecte suas contas via Open Finance e traga os lançamentos automaticamente</p></div>
        <div class="row" style="gap:8px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="App.bankCsvTemplate()">${ICON('download')} Modelo CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="App.bankAggregatorModal()">${ICON('link')} ${apiOn ? 'API conectada' : 'Conectar API'}</button>
        </div>
      </div>
      ${conns.length ? `<div class="card"><h3>${ICON('wallet')} Contas conectadas</h3><div class="conn-list">${conns.map(connRow).join('')}</div></div>` : ''}
      <div class="card">
        <h3>${ICON('plus')} Conectar uma instituição</h3>
        <p class="muted" style="font-size:13.5px;margin-bottom:14px">Escolha seu banco. Os lançamentos entram pela importação do extrato (OFX/CSV — funciona em qualquer banco) ou pela API agregadora, se você conectar uma.</p>
        <div class="muted bank-group-label">Bancos digitais</div>
        <div class="bank-grid">${digital.map(instCard).join('')}</div>
        <div class="muted bank-group-label" style="margin-top:18px">Bancos tradicionais</div>
        <div class="bank-grid">${physical.map(instCard).join('')}</div>
      </div>
      <div class="insight"><div class="ico">${ICON('lock')}</div>
        <div><h4>Conexão segura, sem pedir a senha do banco</h4>
        <p>O Prospera nunca pede a senha da sua conta bancária. A conexão acontece de duas formas: importando o arquivo de extrato (OFX/CSV) que você mesmo baixa no internet banking, ou via um agregador oficial de Open Finance (Pluggy/Belvo) com a sua própria chave de API. Tudo continua salvo só neste dispositivo.</p></div></div>`;
    },

    /* ---------- REPORTS ---------- */
    reports() {
      const reports = (Store.data().reports || []).slice().sort((a, b) => b.key.localeCompare(a.key));
      const opts = reports.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
      return `
      <div class="view-head">
        <div><h2>Relatórios mensais</h2><p>Fechamentos gerados automaticamente no fim de cada mês</p></div>
        <button class="btn btn-primary" onclick="App.genReport()">Gerar do mês atual</button>
      </div>
      ${reports.length ? `
        <div class="filters">
          <select id="reportSelect">${opts}</select>
          <button class="btn btn-ghost btn-sm" onclick="App.printReport()">${ICON('print')} Imprimir / PDF</button>
        </div>
        <div id="reportContainer"></div>
      ` : empty('bars', 'Nenhum relatório ainda. Gere o do mês atual ou aguarde o fechamento automático no fim do mês.')}`;
    },

    /* ---------- SETTINGS ---------- */
    settings() {
      const s = Store.data().settings || {};
      const u = state.user;
      return `
      <div class="view-head"><div><h2>Ajustes</h2><p>Perfil e preferências</p></div></div>
      <div class="grid cols-2">
        <div class="card">
          <h3>${ICON('user')} Perfil</h3>
          <div class="form-grid" style="display:flex;flex-direction:column;gap:14px">
            <label>Nome<input id="setName" value="${esc(u.name)}" /></label>
            <label>E-mail<input value="${esc(u.email)}" disabled /></label>
            <label>Renda mensal de referência (R$)<input id="setIncome" type="number" step="0.01" value="${s.monthlyIncome || 0}" /></label>
            <label>Meses de reserva de emergência desejados<input id="setEmerg" type="number" min="1" max="24" value="${s.emergencyMonths || 6}" /></label>
            <div class="row spread" style="background:var(--bg-2);border:1px solid var(--line);border-radius:11px;padding:13px 15px">
              <div><strong style="font-size:14px">Tema ${(s.theme || 'dark') === 'light' ? 'claro' : 'escuro'}</strong><div class="muted" style="font-size:12.5px">Alterne entre claro e escuro</div></div>
              <button class="btn btn-ghost btn-sm" onclick="App.toggleTheme()">${(s.theme || 'dark') === 'light' ? ICON('moon') + ' Escuro' : ICON('sun') + ' Claro'}</button>
            </div>
            <button class="btn btn-primary" onclick="App.saveSettings()">Salvar alterações</button>
          </div>
        </div>
        <div class="card">
          <h3>${ICON('database')} Seus dados</h3>
          <p class="muted" style="font-size:13.5px;margin-bottom:14px">Seus dados ficam somente neste navegador. ${s.lastBackup ? 'Último backup: ' + new Date(s.lastBackup).toLocaleDateString('pt-BR') + '.' : 'Você ainda não fez backup.'} Faça backup para não perder.</p>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-ghost" onclick="App.exportData()">${ICON('download')} Exportar backup (JSON)</button>
            <label class="btn btn-ghost" style="cursor:pointer">${ICON('upload')} Importar backup
              <input type="file" accept="application/json" style="display:none" onchange="App.importData(event)" /></label>
            <button class="btn btn-danger" onclick="App.wipe()">${ICON('trash')} Apagar todos os meus lançamentos</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>${ICON('users')} Banco de logins deste dispositivo</h3>
        <p class="muted" style="font-size:13.5px;margin-bottom:14px">Todas as contas criadas neste navegador. Os logins permanecem ativos entre reinícios do app — no celular e no computador.</p>
        <div class="login-db">${Store.accountsSummary().map(a => {
          const me = a.id === u.id;
          const last = a.lastLogin ? new Date(a.lastLogin).toLocaleDateString('pt-BR') : '—';
          const created = a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—';
          return `<div class="login-row${me ? ' me' : ''}">
            <div class="li-icon">${(a.name[0] || 'U').toUpperCase()}</div>
            <div class="login-info">
              <strong>${esc(a.name)}${me ? ' <span class="tag-you">você</span>' : ''}</strong>
              <small>${esc(a.email)}</small>
            </div>
            <div class="login-stats">
              <span title="Lançamentos">${a.transactions} lanç.</span>
              <span title="Conexões bancárias">${a.connections} banco(s)</span>
              <span title="Último acesso">acesso ${last}</span>
              <span title="Criada em">desde ${created}</span>
            </div>
            <div class="login-acts">
              ${me ? '' : `<button class="btn btn-ghost btn-sm" onclick="App.switchAccount('${a.id}')">Entrar</button>`}
              ${me ? '' : `<button class="mini-btn" title="Remover conta" onclick="App.removeAccount('${a.id}','${esc(a.name)}')">${ICON('trash')}</button>`}
            </div>
          </div>`;
        }).join('')}</div>
      </div>
      <div class="card">
        <h3>${ICON('shield')} Persistência & continuidade</h3>
        <p class="muted" style="font-size:13.5px;margin-bottom:14px">Mantém seus logins e dados salvos depois de fechar e reabrir o app, mesmo se o navegador precisar liberar espaço.</p>
        <div id="persistBox" class="persist-box"><span class="muted">Verificando armazenamento...</span></div>
      </div>
      ${Store.isAdmin(u.email) ? `<div class="card">
        <h3>${ICON('link')} Convites de acesso</h3>
        <p class="muted" style="font-size:13.5px;margin-bottom:14px">A plataforma é restrita a convidados. Gere um código e envie para quem você quer convidar — ele expira em 24 horas e só pode ser usado uma vez.</p>
        <div class="invite-gen">
          <button class="btn btn-primary btn-sm" onclick="App.inviteGenerate()">${ICON('link')} Gerar convite de 24h</button>
          <div id="inviteBox" class="invite-box hidden"></div>
        </div>
      </div>` : ''}`;
    }
  };

  /* ---------------- AFTER RENDER (bind dinâmico) ---------------- */
  const AFTER = {
    settings() {
      storageStatus().then(s => {
        const box = $('#persistBox'); if (!box) return;
        if (!s.supported) {
          box.innerHTML = `<span class="muted" style="font-size:13.5px">Este navegador não expõe controle de persistência, mas seus dados já ficam salvos localmente e continuam após reiniciar.</span>`;
          return;
        }
        const usage = s.usedMB != null ? `${s.usedMB} MB usados${s.quotaMB ? ` de ~${s.quotaMB} MB disponíveis` : ''}` : '';
        box.innerHTML = `
          <div class="persist-status ${s.persisted ? 'on' : 'off'}">
            <span class="dot"></span>
            <div><strong>${s.persisted ? 'Armazenamento protegido' : 'Proteção ainda não ativada'}</strong>
            <small class="muted">${s.persisted ? 'Seus logins e dados não serão apagados pelo navegador.' : 'O navegador pode limpar os dados se faltar espaço — ative a proteção.'}${usage ? ' · ' + usage : ''}</small></div>
          </div>
          ${s.persisted ? '' : `<button class="btn btn-primary btn-sm" onclick="App.requestPersistence()">${ICON('shield')} Proteger meus dados</button>`}`;
      });
    },
    consultor() {
      const scroll = $('#chatScroll');
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
      const form = $('#chatForm');
      if (form) form.addEventListener('submit', e => { e.preventDefault(); advisorSend(); });
      if (!matchMedia('(hover:none)').matches) $('#chatInput')?.focus();
    },
    transactions() {
      const apply = () => {
        const type = $('#fType').value, q = ($('#fSearch').value || '').toLowerCase();
        const cat = $('#fCat').value, from = $('#fFrom').value, to = $('#fTo').value;
        const filtered = monthTx().filter(t =>
          (!type || t.type === type) &&
          (!cat || t.category === cat) &&
          (!from || t.date >= from) &&
          (!to || t.date <= to) &&
          (!q || (t.description || '').toLowerCase().includes(q) || catInfo(t.type, t.category).name.toLowerCase().includes(q)));
        $('#txList').innerHTML = filtered.length ? filtered.map(txRow).join('') : empty('search', 'Nada encontrado');
        const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        $('#fSummary').innerHTML = `${filtered.length} resultado(s) · <span style="color:var(--green)">+${fmtBRL(inc)}</span> · <span style="color:var(--red)">−${fmtBRL(exp)}</span>`;
      };
      ['fType', 'fCat', 'fFrom', 'fTo'].forEach(idf => $('#' + idf)?.addEventListener('change', apply));
      $('#fSearch')?.addEventListener('input', apply);
      apply();
    },
    debts() {
      const seg = $('#simMethod');
      if (!seg) return;
      let method = 'avalanche';
      const run = () => {
        const extra = Math.max(0, parseFloat($('#simExtra').value) || 0);
        const r = Finance.simulatePayoff(method, extra);
        const box = $('#simResult');
        if (!box || r.empty) return;
        if (!r.feasible) {
          box.innerHTML = `<div class="insight bad" style="margin:0"><div class="ico">${ICON('warning')}</div>
            <div><h4>Os pagamentos não cobrem os juros</h4>
            <p>Com esse valor, o saldo cresce mais rápido do que você paga. Aumente o valor extra mensal para conseguir quitar — comece com algo acima de ${fmtBRL(r.totalMinimum)}.</p></div></div>`;
          return;
        }
        const years = Math.floor(r.months / 12), rem = r.months % 12;
        const dur = years ? `${years} ano(s)${rem ? ` e ${rem} mês(es)` : ''}` : `${r.months} mês(es)`;
        box.innerHTML = `
          <div class="grid cols-3" style="margin-bottom:16px">
            ${stat('Livre de dívidas em', dur, 'pos', 'check', r.payoffDate)}
            ${stat('Juros que você pagará', fmtBRL(r.totalInterest), 'neg', 'debt')}
            ${r.baselineFeasible
              ? stat('Juros economizados', fmtBRL(r.interestSaved), 'pos', 'sprout', r.monthsSaved ? `${r.monthsSaved} mês(es) mais rápido` : 'vs. pagar só o mínimo')
              : stat('Pagando só o mínimo', 'Nunca quita', 'neg', 'warning', 'o saldo cresce mais que o mínimo')}
          </div>
          <div class="sim-order">
            <div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:10px">Ordem de ataque</div>
            ${r.order.map((o, i) => `<div class="sim-step">
              <span class="sim-num">${i + 1}</span>
              <strong>${esc(o.name)}</strong>
              <span class="muted" style="margin-left:auto;font-size:12.5px">${o.clearedAt ? `quitada no mês ${o.clearedAt}` : 'em aberto no horizonte'}</span>
            </div>`).join('')}
          </div>`;
      };
      seg.querySelectorAll('button').forEach(b => b.onclick = () => {
        method = b.dataset.m;
        seg.querySelectorAll('button').forEach(x => x.className = '');
        b.className = 'active exp';
        run();
      });
      $('#simExtra').addEventListener('input', run);
      run();
    },
    reports() {
      const sel = $('#reportSelect');
      if (!sel) return;
      const show = () => {
        const r = (Store.data().reports || []).find(x => x.key === sel.value);
        if (r) $('#reportContainer').innerHTML = Reports.render(r);
      };
      sel.addEventListener('change', show); show();
    }
  };

  /* ---------------- COMPONENT HELPERS ---------------- */
  function stat(label, value, cls, iconName, sub) {
    return `<div class="card stat${cls === 'neg' ? ' is-neg' : ''}">
      <div class="label"><span class="stat-ic">${ICON(iconName)}</span>${label}</div>
      <div class="value ${cls || ''}">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div>`;
  }
  function empty(em, txt) { return `<div class="empty"><span class="em">${ICON(em)}</span>${txt}</div>`; }

  /* ---------------- CONSULTOR (chat) ---------------- */
  function welcomeText() {
    const n = state.user && state.user.name ? state.user.name.trim().split(/\s+/)[0] : '';
    return `${n ? 'Oi, ' + n : 'Oi'}! Sou seu consultor financeiro aqui no Prospera. Posso analisar o seu mês, te ajudar a montar a reserva de emergência, sair das dívidas, organizar o orçamento ou pensar nos primeiros passos pra investir.\n\nPode falar comigo naturalmente, como você falaria com uma pessoa. Por onde quer começar?`;
  }
  function chatBubble(role, text) {
    const me = role === 'user';
    const safe = esc(text).replace(/\n/g, '<br>');
    return `<div class="msg ${me ? 'me' : 'bot'}">${me ? '' : `<div class="msg-av">${ICON('spark')}</div>`}<div class="bubble">${safe}</div></div>`;
  }
  function appendChat(role, text) {
    const scroll = $('#chatScroll');
    if (!scroll) return;
    const holder = document.createElement('div');
    holder.innerHTML = chatBubble(role, text);
    const node = holder.firstElementChild;
    node.classList.add('msg-in');
    scroll.appendChild(node);
    scroll.scrollTop = scroll.scrollHeight;
  }
  function chatTyping(on) {
    const scroll = $('#chatScroll');
    if (!scroll) return;
    const existing = $('#chatTyping');
    if (on) {
      if (existing) return;
      const holder = document.createElement('div');
      holder.innerHTML = `<div class="msg bot" id="chatTyping"><div class="msg-av">${ICON('spark')}</div><div class="bubble typing"><i></i><i></i><i></i></div></div>`;
      scroll.appendChild(holder.firstElementChild);
      scroll.scrollTop = scroll.scrollHeight;
    } else if (existing) existing.remove();
  }
  async function advisorSend(preset) {
    const input = $('#chatInput');
    const text = (preset != null ? preset : (input ? input.value : '')).trim();
    if (!text) return;
    if (input) { input.value = ''; }
    const sug = $('#chatSuggest'); if (sug) sug.style.display = 'none';
    Advisor.push('user', text);
    appendChat('user', text);
    chatTyping(true);
    const useAI = Advisor.hasAI();
    try {
      let answer;
      if (useAI) {
        answer = await Advisor.askAI(state.month);
      } else {
        await new Promise(r => setTimeout(r, 480 + Math.random() * 380));
        answer = Advisor.reply(text, state.month);
      }
      chatTyping(false);
      Advisor.push('bot', answer);
      appendChat('bot', answer);
    } catch (err) {
      chatTyping(false);
      const answer = Advisor.reply(text, state.month);
      Advisor.push('bot', answer);
      appendChat('bot', answer);
      if (useAI) toast('Não consegui falar com a IA agora — respondi com o consultor offline.', 'warn');
    }
  }
  function advisorAsk(q) { advisorSend(q); }
  function advisorClear() {
    confirmModal('Quer apagar toda a conversa com o consultor?', () => { Advisor.clear(); render(); }, { title: 'Limpar conversa', ok: 'Apagar' });
  }
  function aiModal() {
    const cur = (Store.data().settings || {}).geminiKey || '';
    modal(`
      <h3>Conectar IA</h3>
      <p class="muted" style="font-size:14px;line-height:1.6">Por padrão o consultor já funciona offline, com base nos seus números reais. Se quiser uma conversa mais livre, dá pra conectar sua própria chave da API Gemini (Google AI Studio — gratuita).</p>
      <div class="insight warn" style="margin:16px 0"><div class="ico">${ICON('lock')}</div>
        <div><h4 style="font-size:14px;margin-bottom:4px">Sobre a sua privacidade</h4>
        <p style="font-size:13px">Ao ativar, um resumo dos seus números é enviado para a API do Google a cada mensagem. A chave fica salva só neste dispositivo. Deixe o campo em branco para manter tudo 100% offline.</p></div></div>
      <label>Chave da API Gemini
        <input id="aiKey" type="password" autocomplete="off" placeholder="cole a sua chave aqui" value="${esc(cur)}" />
      </label>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.aiSave()">Salvar</button>
      </div>`);
  }
  function aiSave() {
    const v = $('#aiKey') ? $('#aiKey').value : '';
    Advisor.setKey(v);
    closeModal();
    toast(v.trim() ? 'IA conectada — agora a conversa é livre' : 'IA desativada — usando o consultor offline');
    if (state.view === 'consultor') render();
  }

  /* ---------------- BANCOS (conexões / Open Finance) ---------------- */
  function bankConnectModal(instId) {
    const b = Bank.institution(instId);
    modal(`
      <h3>Conectar ${esc(b.name)}</h3>
      <p class="muted" style="font-size:13.5px;line-height:1.6">Vamos criar a conexão. Depois é só importar o extrato OFX/CSV que você baixa no app do ${esc(b.name)} — ou sincronizar pela API, se houver uma conectada.</p>
      <label>Apelido da conta <span class="hint">opcional</span>
        <input id="connLabel" placeholder="Ex: ${esc(b.name)} — conta corrente" /></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.bankConnect('${instId}')">Conectar conta</button>
      </div>`);
  }
  function bankConnect(instId) {
    const b = Bank.institution(instId);
    const label = ($('#connLabel') ? $('#connLabel').value : '').trim();
    Store.addConnection({ instId, name: label || b.name, type: b.type });
    closeModal();
    toast(`${b.name} conectado — agora importe seu extrato`);
    go('bancos');
  }
  function bankImport(ev, connId) {
    const file = ev.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = Bank.importStatement(connId, reader.result, file.name);
        toast(`${r.added} lançamento(s) importado(s)${r.skipped ? ` · ${r.skipped} já existiam` : ''}`);
        render();
      } catch (err) { toast(err.message, 'err'); }
    };
    reader.onerror = () => toast('Não consegui ler o arquivo', 'err');
    reader.readAsText(file);
    ev.target.value = '';
  }
  async function bankSync(connId) {
    toast('Sincronizando com o banco...');
    try {
      const r = await Bank.syncViaApi(connId);
      toast(`${r.added} novo(s) lançamento(s) sincronizado(s)`);
      render();
    } catch (err) { toast(err.message, 'err'); }
  }
  function bankDisconnect(id) {
    confirmModal('Desconectar esta conta? Os lançamentos já importados continuam salvos, mas o saldo dela sai do Patrimônio.',
      () => {
        (Store.data().assets || []).filter(a => a.connectionId === id).forEach(a => Store.removeAsset(a.id));
        Store.removeConnection(id);
        toast('Conta desconectada'); render();
      },
      { title: 'Desconectar conta', ok: 'Desconectar' });
  }
  function bankCsvTemplate() {
    const csv = 'Data;Histórico;Valor\n'
      + '05/01/2026;Salário;3500,00\n'
      + '08/01/2026;Supermercado;-289,90\n'
      + '12/01/2026;Posto de gasolina;-150,00\n'
      + '15/01/2026;Farmácia São João;-47,30\n'
      + '20/01/2026;Transferência recebida;120,00\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM p/ abrir certo no Excel
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prospera-modelo-extrato.csv';
    a.click();
    toast('Modelo CSV baixado — preencha e importe na conexão');
  }

  /* ---------------- CONVITES (gerar código de acesso) ---------------- */
  async function inviteGenerate() {
    const box = $('#inviteBox'); if (!box) return;
    const code = await Store.generateInvite(24);
    const exp = new Date(Date.now() + 24 * 3600000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    box.classList.remove('hidden');
    box.innerHTML = `
      <code class="invite-code" id="inviteCode">${code}</code>
      <button class="btn btn-ghost btn-sm" onclick="App.inviteCopy('${code}')">${ICON('copy')} Copiar</button>
      <small class="muted" style="display:block;margin-top:8px">Válido até ${exp}. Uso único.</small>`;
  }
  function inviteCopy(code) {
    const done = () => toast('Código copiado — envie para o convidado');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => {
        const el = $('#inviteCode'); if (el) { const r = document.createRange(); r.selectNode(el); getSelection().removeAllRanges(); getSelection().addRange(r); }
        toast('Selecione e copie o código');
      });
    } else {
      const el = $('#inviteCode'); if (el) { const r = document.createRange(); r.selectNode(el); getSelection().removeAllRanges(); getSelection().addRange(r); }
      toast('Selecione e copie o código');
    }
  }
  function bankAggregatorModal() {
    const cfg = Bank.aggregator() || {};
    const opt = (id, n) => `<option value="${id}" ${cfg.provider === id ? 'selected' : ''}>${n}</option>`;
    modal(`
      <h3>Conectar API do banco</h3>
      <p class="muted" style="font-size:13.5px;line-height:1.6">A sincronização automática usa um agregador oficial de Open Finance (Pluggy ou Belvo). Crie sua conta no agregador, gere a chave de API e cole abaixo. Sem isso, você ainda traz tudo importando o extrato OFX/CSV.</p>
      <label>Agregador<select id="aggProvider">${opt('pluggy', 'Pluggy')}${opt('belvo', 'Belvo')}${opt('custom', 'Endpoint próprio')}</select></label>
      <label>Endpoint <span class="hint">opcional</span><input id="aggUrl" value="${esc(cfg.baseUrl || '')}" placeholder="https://api.pluggy.ai" /></label>
      <label>Chave de API<input id="aggKey" type="password" autocomplete="off" value="${esc(cfg.key || '')}" placeholder="cole a sua chave aqui" /></label>
      <div class="insight warn" style="margin:16px 0"><div class="ico">${ICON('lock')}</div>
        <div><h4 style="font-size:14px;margin-bottom:4px">Privacidade e limitações</h4>
        <p style="font-size:13px">A chave fica salva só neste dispositivo. Alguns navegadores bloqueiam chamadas diretas a APIs externas (CORS) — se a sincronização falhar, use a importação de extrato, que funciona em qualquer banco. Deixe em branco para usar só importação.</p></div></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.bankAggregatorSave()">Salvar</button>
      </div>`);
  }
  function bankAggregatorSave() {
    const key = ($('#aggKey') ? $('#aggKey').value : '').trim();
    Bank.setAggregator({ provider: $('#aggProvider') ? $('#aggProvider').value : 'pluggy', baseUrl: $('#aggUrl') ? $('#aggUrl').value : '', key });
    closeModal();
    toast(key ? 'API conectada — use Sincronizar nas contas' : 'API desconectada');
    if (state.view === 'bancos') render();
  }

  /* ---------------- BANCO DE LOGINS (trocar / remover contas) ---------------- */
  function switchAccount(id) {
    const acc = Store.accountsSummary().find(a => a.id === id);
    if (!acc) return;
    confirmModal(`Trocar para a conta de ${esc(acc.name)}? Você vai precisar digitar a senha dela.`,
      () => {
        Store.logout();
        try { sessionStorage.setItem('prospera.prefillEmail', acc.email); } catch {}
        location.reload();
      }, { title: 'Trocar de conta', ok: 'Continuar' });
  }
  function removeAccount(id, name) {
    confirmModal(`Remover a conta "${name}" e TODOS os dados dela deste dispositivo? Esta ação não pode ser desfeita.`,
      () => { Store.removeAccount(id); toast('Conta removida'); render(); },
      { title: 'Remover conta', ok: 'Remover' });
  }

  /* ---------------- ONBOARDING (primeiro acesso) ---------------- */
  function onboarding() {
    return `
    <div class="view-head"><div><h2>Bem-vindo(a) ao Prospera</h2><p>Vamos organizar sua vida financeira em poucos passos</p></div></div>
    <div class="card onboard">
      <div class="onboard-steps">
        <div class="ob-step"><div class="ob-num">1</div><div><strong>Registre seus lançamentos</strong><p class="muted">Adicione receitas e despesas — leva segundos.</p></div></div>
        <div class="ob-step"><div class="ob-num">2</div><div><strong>Defina orçamentos e metas</strong><p class="muted">Limites por categoria e objetivos de poupança.</p></div></div>
        <div class="ob-step"><div class="ob-num">3</div><div><strong>Receba insights de verdade</strong><p class="muted">Análises feitas para a sua realidade, não genéricas.</p></div></div>
      </div>
      <div class="onboard-cta">
        <button class="btn btn-primary" onclick="App.txModal()">+ Adicionar primeiro lançamento</button>
        <button class="btn btn-ghost" onclick="App.loadSample()">Carregar dados de exemplo</button>
      </div>
      <p class="hint" style="margin-top:6px">Os dados de exemplo ajudam a explorar o app — você pode apagá-los depois em Ajustes.</p>
    </div>`;
  }
  function loadSample() {
    const now = new Date();
    const mk = monthKey(now);
    const day = n => `${mk}-${String(Math.min(n, 28)).padStart(2, '0')}`;
    Store.addTx({ type: 'income', amount: 5200, category: 'salario', description: 'Salário', date: day(5), recurring: false });
    Store.addTx({ type: 'income', amount: 680, category: 'freelance', description: 'Projeto extra', date: day(14), recurring: false });
    Store.addTx({ type: 'expense', amount: 1500, category: 'moradia', description: 'Aluguel', date: day(6), recurring: false });
    Store.addTx({ type: 'expense', amount: 740, category: 'alimentacao', description: 'Mercado', date: day(9), recurring: false });
    Store.addTx({ type: 'expense', amount: 320, category: 'transporte', description: 'Combustível', date: day(11), recurring: false });
    Store.addTx({ type: 'expense', amount: 210, category: 'lazer', description: 'Cinema e jantar', date: day(16), recurring: false });
    Store.addTx({ type: 'expense', amount: 180, category: 'contas', description: 'Internet + streaming', date: day(3), recurring: false });
    Store.addDebt({ name: 'Cartão de crédito', total: 3200, interestRate: 8.5, minPayment: 400, dueDate: day(10) });
    Store.addGoal({ name: 'Reserva de emergência', target: 15000, icon: 'shield', deadline: '' });
    Store.updateGoal(Store.data().goals[0].id, { saved: 4200 });
    Store.setBudget('alimentacao', 800);
    Store.setBudget('lazer', 250);
    toast('Dados de exemplo carregados');
    render();
  }
  function txRow(t) {
    const c = catInfo(t.type, t.category);
    const sign = t.type === 'income' ? '+' : '−';
    return `<div class="list-item">
      <div class="li-icon">${ICON(c.icon)}</div>
      <div class="li-body"><strong>${esc(t.description || c.name)}</strong>
        <small>${c.name} · ${formatDate(t.date)}${t.recurring ? ' · fixo' : ''}</small></div>
      <div class="li-amt ${t.type === 'income' ? 'pos' : 'neg'}">${sign} ${fmtBRL(t.amount)}</div>
      <div class="li-actions">
        <button class="mini-btn" onclick="App.txModal('${t.id}')">${ICON('edit')}</button>
        <button class="mini-btn" onclick="App.delTx('${t.id}')">${ICON('trash')}</button>
      </div>
    </div>`;
  }
  function formatDate(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}`; }

  /* ---------------- MODAL SYSTEM ---------------- */
  function modal(html) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-overlay" id="ov"><div class="modal">${html}</div></div>`;
    $('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  function toast(msg, kind = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = msg;
    $('#toastRoot').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = '.3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  /* ---------------- TX MODAL ---------------- */
  function txModal(id) {
    const t = id ? Store.data().transactions.find(x => x.id === id) : null;
    const type = t?.type || 'expense';
    const catOpts = ty => CATEGORIES[ty].map(c => `<option value="${c.id}" ${t?.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
    modal(`
      <h3>${id ? 'Editar' : 'Novo'} lançamento</h3>
      <div class="form-grid">
        <div class="seg" id="segType">
          <button class="${type === 'income' ? 'active inc' : ''}" data-t="income">${ICON('arrowUp')} Receita</button>
          <button class="${type === 'expense' ? 'active exp' : ''}" data-t="expense">${ICON('arrowDown')} Despesa</button>
        </div>
        <label>Valor (R$)<input id="mAmount" type="number" step="0.01" min="0" value="${t?.amount ?? ''}" placeholder="0,00" autofocus /></label>
        <label>Categoria<select id="mCat">${catOpts(type)}</select></label>
        <label>Descrição <span class="hint">opcional</span><input id="mDesc" value="${esc(t?.description || '')}" placeholder="Ex: Mercado do mês" /></label>
        <label>Data<input id="mDate" type="date" value="${t?.date || todayISO()}" /></label>
        ${id ? '' : `<label>Parcelar em <span class="hint">deixe 1 se não for parcelado</span>
          <input id="mInst" type="number" min="1" max="60" value="1" /></label>`}
        <label style="flex-direction:row;align-items:center;gap:10px"><input id="mRec" type="checkbox" style="width:auto" ${t?.recurring ? 'checked' : ''} /> Despesa/receita fixa (recorrente)</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveTx('${id || ''}')">Salvar</button>
      </div>`);
    // toggle tipo
    let cur = type;
    document.querySelectorAll('#segType button').forEach(b => b.onclick = () => {
      cur = b.dataset.t;
      document.querySelectorAll('#segType button').forEach(x => x.className = '');
      b.className = 'active ' + (cur === 'income' ? 'inc' : 'exp');
      $('#mCat').innerHTML = catOpts(cur);
      $('#segType').dataset.type = cur;
    });
    $('#segType').dataset.type = type;
  }

  function saveTx(id) {
    const amount = parseFloat($('#mAmount').value);
    if (!amount || amount <= 0) return toast('Informe um valor válido', 'err');
    const base = {
      type: $('#segType').dataset.type,
      amount,
      category: $('#mCat').value,
      description: $('#mDesc').value.trim(),
      date: $('#mDate').value || todayISO(),
      recurring: $('#mRec').checked
    };
    if (id) { Store.updateTx(id, base); toast('Lançamento atualizado'); closeModal(); render(); return; }

    const parcels = Math.min(60, Math.max(1, parseInt($('#mInst')?.value) || 1));
    if (parcels > 1) {
      const instId = 'i' + Date.now().toString(36);
      const per = Math.floor((amount / parcels) * 100) / 100;
      const [y, m, d] = base.date.split('-').map(Number);
      const baseName = base.description || catInfo(base.type, base.category).name;
      for (let i = 0; i < parcels; i++) {
        const dt = new Date(y, m - 1 + i, 1);
        const dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        const day = Math.min(d, dim);
        const dateISO = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const value = i === parcels - 1 ? Math.round((amount - per * (parcels - 1)) * 100) / 100 : per;
        Store.addTx({ ...base, amount: value, description: `${baseName} (${i + 1}/${parcels})`, recurring: false, installmentId: instId });
      }
      toast(`${parcels} parcelas lançadas`);
    } else {
      Store.addTx(base); toast('Lançamento adicionado');
    }
    closeModal(); render();
  }
  function delTx(id) {
    confirmModal('Excluir este lançamento?', () => { Store.removeTx(id); toast('Lançamento excluído'); render(); });
  }

  /* ---------------- DEBT MODAL ---------------- */
  function debtModal(id) {
    const d = id ? Store.data().debts.find(x => x.id === id) : null;
    modal(`
      <h3>${id ? 'Editar' : 'Nova'} dívida</h3>
      <div class="form-grid">
        <label>Nome da dívida<input id="dName" value="${esc(d?.name || '')}" placeholder="Ex: Cartão Nubank" autofocus /></label>
        <label>Valor total (R$)<input id="dTotal" type="number" step="0.01" min="0" value="${d?.total ?? ''}" placeholder="0,00" /></label>
        <label>Juros ao mês (%) <span class="hint">opcional</span><input id="dRate" type="number" step="0.01" min="0" value="${d?.interestRate ?? ''}" placeholder="Ex: 12.5" /></label>
        <label>Pagamento mínimo mensal (R$) <span class="hint">opcional</span><input id="dMin" type="number" step="0.01" min="0" value="${d?.minPayment ?? ''}" /></label>
        <label>Vencimento <span class="hint">opcional</span><input id="dDue" type="date" value="${d?.dueDate || ''}" /></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveDebt('${id || ''}')">Salvar</button>
      </div>`);
  }
  function saveDebt(id) {
    const name = $('#dName').value.trim();
    const total = parseFloat($('#dTotal').value);
    if (!name) return toast('Informe o nome da dívida', 'err');
    if (!total || total <= 0) return toast('Informe o valor total', 'err');
    const debt = {
      name, total,
      interestRate: parseFloat($('#dRate').value) || 0,
      minPayment: parseFloat($('#dMin').value) || 0,
      dueDate: $('#dDue').value || ''
    };
    if (id) { Store.updateDebt(id, debt); toast('Dívida atualizada'); }
    else { Store.addDebt(debt); toast('Dívida adicionada'); }
    closeModal(); render();
  }
  function delDebt(id) {
    confirmModal('Excluir esta dívida?', () => { Store.removeDebt(id); toast('Dívida excluída'); render(); });
  }
  function payModal(id) {
    const d = Store.data().debts.find(x => x.id === id);
    const remaining = Math.max(0, d.total - Insights.paidOf(d));
    modal(`
      <h3>Registrar pagamento</h3>
      <p class="muted" style="font-size:13.5px;margin-bottom:14px">${esc(d.name)} · falta ${fmtBRL(remaining)}</p>
      <div class="form-grid">
        <label>Valor pago (R$)<input id="pAmount" type="number" step="0.01" min="0" value="${d.minPayment || ''}" placeholder="0,00" autofocus /></label>
        <label>Data<input id="pDate" type="date" value="${todayISO()}" /></label>
        <label style="flex-direction:row;align-items:center;gap:10px"><input id="pTx" type="checkbox" style="width:auto" checked /> Lançar também como despesa</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.savePayment('${id}')">Confirmar</button>
      </div>`);
  }
  function savePayment(id) {
    const amount = parseFloat($('#pAmount').value);
    const date = $('#pDate').value || todayISO();
    if (!amount || amount <= 0) return toast('Informe um valor válido', 'err');
    Store.payDebt(id, amount, date);
    if ($('#pTx').checked) {
      const d = Store.data().debts.find(x => x.id === id);
      Store.addTx({ type: 'expense', amount, category: 'dividas', description: 'Pagamento: ' + d.name, date, recurring: false });
    }
    toast('Pagamento registrado'); closeModal(); render();
  }

  /* ---------------- GOAL MODAL ---------------- */
  function goalModal(id) {
    const g = id ? Store.data().goals.find(x => x.id === id) : null;
    modal(`
      <h3>${id ? 'Editar' : 'Nova'} meta</h3>
      <div class="form-grid">
        <label>Nome da meta<input id="gName" value="${esc(g?.name || '')}" placeholder="Ex: Reserva de emergência" autofocus /></label>
        <label>Valor objetivo (R$)<input id="gTarget" type="number" step="0.01" min="0" value="${g?.target ?? ''}" placeholder="0,00" /></label>
        <label>Prazo <span class="hint">opcional</span><input id="gDeadline" type="date" value="${g?.deadline || ''}" /></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveGoal('${id || ''}')">Salvar</button>
      </div>`);
  }
  function saveGoal(id) {
    const name = $('#gName').value.trim();
    const target = parseFloat($('#gTarget').value);
    if (!name) return toast('Informe o nome da meta', 'err');
    if (!target || target <= 0) return toast('Informe o valor objetivo', 'err');
    const g = { name, target, icon: 'target', deadline: $('#gDeadline').value || '' };
    if (id) { Store.updateGoal(id, g); toast('Meta atualizada'); }
    else { Store.addGoal(g); toast('Meta criada'); }
    closeModal(); render();
  }
  function delGoal(id) {
    confirmModal('Excluir esta meta?', () => { Store.removeGoal(id); toast('Meta excluída'); render(); });
  }
  function contributeModal(id) {
    const g = Store.data().goals.find(x => x.id === id);
    modal(`
      <h3>Guardar na meta</h3>
      <p class="muted" style="font-size:13.5px;margin-bottom:14px">${esc(g.name)} · ${fmtBRL(g.saved)} de ${fmtBRL(g.target)}</p>
      <div class="form-grid">
        <label>Valor a guardar (R$)<input id="cAmount" type="number" step="0.01" min="0" placeholder="0,00" autofocus /></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveContribution('${id}')">Guardar</button>
      </div>`);
  }
  function saveContribution(id) {
    const amount = parseFloat($('#cAmount').value);
    if (!amount || amount <= 0) return toast('Informe um valor válido', 'err');
    const g = Store.data().goals.find(x => x.id === id);
    Store.updateGoal(id, { saved: (g.saved || 0) + amount });
    toast('Valor guardado'); closeModal(); render();
  }

  /* ---------------- ORÇAMENTO: método de alocação ---------------- */
  function setMethod(k) {
    if (!Finance.METHODS[k]) return;
    Store.setSettings({ budgetMethod: k });
    render();
  }

  /* ---------------- ASSET MODAL (patrimônio) ---------------- */
  function assetModal(id) {
    const x = id ? (Store.data().assets || []).find(a => a.id === id) : null;
    const kinds = [
      ['liquid', 'Liquidez (conta, reserva, Tesouro Selic)'],
      ['invest', 'Investimento (ações, FIIs, CDB, fundos)'],
      ['property', 'Bem / patrimônio (imóvel, veículo)'],
      ['other', 'Outro ativo']
    ];
    modal(`
      <h3>${id ? 'Editar' : 'Novo'} ativo</h3>
      <div class="form-grid">
        <label>Nome do ativo<input id="aName" value="${esc(x?.name || '')}" placeholder="Ex: Conta corrente, Tesouro Selic" autofocus /></label>
        <label>Tipo<select id="aKind">${kinds.map(([k, l]) => `<option value="${k}" ${x?.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Valor atual (R$)<input id="aValue" type="number" step="0.01" min="0" value="${x?.value ?? ''}" placeholder="0,00" /></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveAsset('${id || ''}')">Salvar</button>
      </div>`);
  }
  function saveAsset(id) {
    const name = $('#aName').value.trim();
    const value = parseFloat($('#aValue').value);
    if (!name) return toast('Informe o nome do ativo', 'err');
    if (!(value >= 0)) return toast('Informe um valor válido', 'err');
    const asset = { name, kind: $('#aKind').value, value };
    if (id) { Store.updateAsset(id, asset); toast('Ativo atualizado'); }
    else { Store.addAsset(asset); toast('Ativo adicionado'); }
    closeModal(); render();
  }
  function delAsset(id) {
    confirmModal('Excluir este ativo?', () => { Store.removeAsset(id); toast('Ativo excluído'); render(); });
  }

  /* ---------------- BUDGET MODAL ---------------- */
  function budgetModal(catId) {
    const budgets = Store.data().budgets || {};
    const editing = !!catId;
    const opts = CATEGORIES.expense
      .filter(c => editing ? c.id === catId : !budgets[c.id])
      .map(c => `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${c.name}</option>`).join('');
    modal(`
      <h3>${editing ? 'Editar' : 'Definir'} orçamento</h3>
      <div class="form-grid">
        <label>Categoria<select id="bCat" ${editing ? 'disabled' : ''}>${opts || '<option>Todas já têm orçamento</option>'}</select></label>
        <label>Limite mensal (R$)<input id="bAmount" type="number" step="0.01" min="0" value="${editing ? budgets[catId] : ''}" placeholder="0,00" autofocus /></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveBudget('${catId || ''}')">Salvar</button>
      </div>`);
  }
  function saveBudget(catId) {
    const id = catId || $('#bCat').value;
    const amount = parseFloat($('#bAmount').value);
    if (!id) return toast('Selecione uma categoria', 'err');
    if (!amount || amount <= 0) return toast('Informe um limite válido', 'err');
    Store.setBudget(id, amount);
    toast('Orçamento salvo'); closeModal(); render();
  }
  function removeBudget(catId) {
    confirmModal('Remover este orçamento?', () => { Store.setBudget(catId, 0); toast('Orçamento removido'); render(); });
  }

  /* ---------------- RECURRING MODAL ---------------- */
  function recurringModal(id) {
    const r = id ? Store.data().recurring.find(x => x.id === id) : null;
    const type = r?.type || 'expense';
    const catOpts = ty => CATEGORIES[ty].map(c => `<option value="${c.id}" ${r?.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
    modal(`
      <h3>${id ? 'Editar' : 'Novo'} lançamento fixo</h3>
      <div class="form-grid">
        <div class="seg" id="segRType">
          <button class="${type === 'income' ? 'active inc' : ''}" data-t="income">${ICON('arrowUp')} Receita</button>
          <button class="${type === 'expense' ? 'active exp' : ''}" data-t="expense">${ICON('arrowDown')} Despesa</button>
        </div>
        <label>Valor (R$)<input id="rAmount" type="number" step="0.01" min="0" value="${r?.amount ?? ''}" placeholder="0,00" /></label>
        <label>Categoria<select id="rCat">${catOpts(type)}</select></label>
        <label>Descrição<input id="rDesc" value="${esc(r?.description || '')}" placeholder="Ex: Aluguel" /></label>
        <label>Dia do mês<input id="rDay" type="number" min="1" max="31" value="${r?.day || 5}" /></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveRecurring('${id || ''}')">Salvar</button>
      </div>`);
    let cur = type;
    document.querySelectorAll('#segRType button').forEach(b => b.onclick = () => {
      cur = b.dataset.t;
      document.querySelectorAll('#segRType button').forEach(x => x.className = '');
      b.className = 'active ' + (cur === 'income' ? 'inc' : 'exp');
      $('#rCat').innerHTML = catOpts(cur);
      $('#segRType').dataset.type = cur;
    });
    $('#segRType').dataset.type = type;
  }
  function saveRecurring(id) {
    const amount = parseFloat($('#rAmount').value);
    if (!amount || amount <= 0) return toast('Informe um valor válido', 'err');
    const rule = {
      type: $('#segRType').dataset.type,
      amount,
      category: $('#rCat').value,
      description: $('#rDesc').value.trim(),
      day: Math.min(31, Math.max(1, parseInt($('#rDay').value) || 5))
    };
    if (id) { Store.updateRecurring(id, rule); toast('Recorrente atualizado'); }
    else { Store.addRecurring(rule); toast('Recorrente criado'); }
    closeModal();
    materializeRecurring(monthKey(new Date()));
    render();
  }
  function delRecurring(id) {
    confirmModal('Excluir este lançamento fixo? Os lançamentos já gerados nos meses serão mantidos.',
      () => { Store.removeRecurring(id); toast('Recorrente excluído'); render(); });
  }

  /* ---------------- CONFIRM MODAL (reutilizável) ---------------- */
  let _confirmCb = null;
  function confirmModal(message, onConfirm, opts = {}) {
    _confirmCb = onConfirm;
    modal(`
      <h3>${esc(opts.title || 'Confirmar')}</h3>
      <p class="muted" style="font-size:14.5px;line-height:1.6">${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}" onclick="App.runConfirm()">${esc(opts.ok || 'Confirmar')}</button>
      </div>`);
  }
  function runConfirm() { const cb = _confirmCb; _confirmCb = null; closeModal(); if (cb) cb(); }

  /* ---------------- SETTINGS / REPORTS ACTIONS ---------------- */
  function saveSettings() {
    const name = $('#setName').value.trim();
    if (name) Store.updateUser(state.user.id, { name });
    state.user.name = name || state.user.name;
    Store.setSettings({
      monthlyIncome: parseFloat($('#setIncome').value) || 0,
      emergencyMonths: parseInt($('#setEmerg').value) || 6
    });
    $('#userName').textContent = state.user.name;
    $('#userAvatar').textContent = (state.user.name[0] || 'U').toUpperCase();
    toast('Ajustes salvos');
  }
  function exportData() {
    const blob = new Blob([Store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prospera-backup-${todayISO()}.json`;
    a.click();
    Store.setSettings({ lastBackup: Date.now() });
    toast('Backup exportado');
    if (state.view === 'settings') render();
  }
  function clearFilters() {
    ['fType', 'fCat', 'fFrom', 'fTo', 'fSearch'].forEach(idf => { const el = $('#' + idf); if (el) el.value = ''; });
    $('#fSearch')?.dispatchEvent(new Event('input'));
  }
  function importData(ev) {
    const file = ev.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { Store.importData(reader.result); toast('Backup importado'); render(); }
      catch { toast('Arquivo inválido', 'err'); }
    };
    reader.readAsText(file);
  }
  function wipe() {
    confirmModal('Apagar TODOS os seus lançamentos, dívidas e metas? Esta ação não pode ser desfeita.',
      () => { Store.wipeUserData(); toast('Dados apagados'); render(); }, { ok: 'Apagar tudo' });
  }
  function genReport() {
    const r = Reports.generateAndSave(state.month);
    toast(`Relatório de ${r.label} gerado`); go('reports');
  }
  function printReport() {
    const node = $('#reportContainer');
    if (!node || !node.innerHTML) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Relatório Prospera</title>
      <style>body{font-family:sans-serif;background:#0b1020;color:#eef1ff;padding:24px}
      ${document.querySelector('link[rel=stylesheet]') ? '' : ''}</style>
      <link rel="stylesheet" href="${location.href.replace(/index\.html.*$/, '')}styles.css"></head>
      <body>${node.innerHTML}</body></html>`);
    setTimeout(() => { w.print(); }, 400);
  }

  return {
    init, boot, go, render, closeModal,
    txModal, saveTx, delTx,
    debtModal, saveDebt, delDebt, payModal, savePayment,
    goalModal, saveGoal, delGoal, contributeModal, saveContribution,
    budgetModal, saveBudget, removeBudget,
    setMethod, assetModal, saveAsset, delAsset,
    recurringModal, saveRecurring, delRecurring,
    confirmModal, runConfirm, toggleTheme, loadSample, clearFilters,
    saveSettings, exportData, importData, wipe, genReport, printReport,
    advisorSend, advisorAsk, advisorClear, aiModal, aiSave,
    bankConnectModal, bankConnect, bankImport, bankSync, bankDisconnect, bankAggregatorModal, bankAggregatorSave, bankCsvTemplate,
    requestPersistence, switchAccount, removeAccount,
    inviteGenerate, inviteCopy
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
