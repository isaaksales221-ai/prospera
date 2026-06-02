/* ============================================================
   STORE — persistência local + criptografia de senha + dados
   Tudo fica em localStorage. Cada usuário tem seu namespace.
   ============================================================ */
const Store = (() => {
  const K_USERS = 'prospera.users';
  const K_SESSION = 'prospera.session';
  const K_DATA = id => `prospera.data.${id}`;
  const K_USED_INVITES = 'prospera.usedInvites';
  const K_CLOUD_USER = 'prospera.cloudUser'; // perfil do usuário logado na nuvem (cache p/ leitura síncrona)

  /* segredo do convite (assina os códigos). Como o app é 100% local/sem servidor,
     o código é um token auto-validável: carrega a própria validade e uma assinatura.
     Troque este segredo para invalidar todos os códigos antigos de uma vez. */
  const INVITE_SECRET = 'prospera-convite::a93f7c21e8b54d06::2026';
  const ADMIN_EMAILS = ['isaaksales000@gmail.com', 'teste@admin.com.br']; // quem pode gerar convites e criar conta sem precisar de convite
  const isAdmin = email => ADMIN_EMAILS.includes((email || '').trim().toLowerCase());

  /* ---------- util ---------- */
  const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- nuvem (Supabase) ---------- */
  const cloudEnabled = () => (typeof Cloud !== 'undefined') && Cloud.isConfigured();
  let _cloudUser = read(K_CLOUD_USER, null);
  const setCloudUser = u => { _cloudUser = u; write(K_CLOUD_USER, u); };
  const clearCloudUser = () => { _cloudUser = null; localStorage.removeItem(K_CLOUD_USER); };
  const freshDataset = income => ({
    transactions: [], debts: [], goals: [], reports: [], recurring: [], budgets: {}, assets: [], connections: [],
    settings: { monthlyIncome: parseFloat(income) || 0, currency: 'BRL', emergencyMonths: 6, budgetMethod: '50-30-20', theme: 'dark', lastBackup: 0 }
  });

  /* ---------- crypto (PBKDF2) ---------- */
  const enc = new TextEncoder();
  const buf2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

  async function hashPassword(password, saltHex) {
    const salt = saltHex
      ? Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
      : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
    return { hash: buf2hex(bits), salt: buf2hex(salt) };
  }

  /* ---------- convites (tokens assinados, auto-validáveis sem servidor) ----------
     Formato: PRSP-<payloadBase36>-<sig8>  (tudo em maiúsculas)
       payload = (timestamp de expiração em ms).toString(36)
       sig     = primeiros 8 hex de HMAC-SHA256(INVITE_SECRET, payload)
     A validade vive dentro do próprio código; qualquer dispositivo valida sozinho.
     Cada código só pode ser usado uma vez (controle via K_USED_INVITES). */
  async function hmacHex(message) {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(INVITE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return buf2hex(sig);
  }

  async function generateInvite(hours = 24) {
    const payload = (Date.now() + hours * 3600000).toString(36);
    const sig = (await hmacHex(payload)).slice(0, 8);
    return `PRSP-${payload}-${sig}`.toUpperCase();
  }

  const usedInvites = () => read(K_USED_INVITES, []);
  function markInviteUsed(code) {
    const used = usedInvites();
    if (!used.includes(code)) { used.push(code); write(K_USED_INVITES, used); }
  }

  /* valida sem consumir — retorna { ok, reason } */
  async function checkInvite(rawCode) {
    const code = (rawCode || '').trim().toUpperCase();
    const m = code.match(/^PRSP-([0-9A-Z]+)-([0-9A-F]{8})$/);
    if (!m) return { ok: false, reason: 'Código de convite inválido.' };
    const [, payload, sig] = m;
    const expected = (await hmacHex(payload.toLowerCase())).slice(0, 8).toUpperCase();
    if (sig !== expected) return { ok: false, reason: 'Código de convite inválido.' };
    const expiry = parseInt(payload.toLowerCase(), 36);
    if (!isFinite(expiry) || Date.now() > expiry) return { ok: false, reason: 'Este convite expirou. Peça um novo código.' };
    if (usedInvites().includes(code)) return { ok: false, reason: 'Este convite já foi utilizado.' };
    return { ok: true, code, expiry };
  }

  /* ---------- users ---------- */
  const getUsers = () => read(K_USERS, []);

  async function register({ name, email, password, income, invite, skipInvite }) {
    email = (email || '').trim().toLowerCase();
    name = (name || '').trim();
    // convite obrigatório, exceto para a conta admin (que pode bootstrapar) ou seed local
    let inviteToConsume = null;
    if (!skipInvite && !isAdmin(email)) {
      const chk = await checkInvite(invite);
      if (!chk.ok) throw new Error(chk.reason);
      inviteToConsume = chk.code;
    }

    if (cloudEnabled()) {
      const cu = await Cloud.signUp({ name, email, password });
      if (!cu || !cu.id) throw new Error('Não foi possível criar a conta. Confira se a confirmação de e-mail está desativada no Supabase.');
      const user = { id: cu.id, name: name || email.split('@')[0], email };
      setCloudUser(user);
      const ds = freshDataset(income);
      write(K_DATA(user.id), ds);
      try { await Cloud.push(user.id, ds); } catch { /* re-tenta no próximo save */ }
      if (inviteToConsume) markInviteUsed(inviteToConsume);
      return user;
    }

    // modo local (sem nuvem configurada)
    const users = getUsers();
    if (users.some(u => u.email === email)) throw new Error('Já existe uma conta com este e-mail.');
    const { hash, salt } = await hashPassword(password);
    const user = { id: uid(), name, email, hash, salt, createdAt: Date.now(), lastLogin: 0 };
    users.push(user);
    write(K_USERS, users);
    write(K_DATA(user.id), freshDataset(income));
    if (inviteToConsume) markInviteUsed(inviteToConsume);
    return user;
  }

  /* conta fixa de teste — criada uma vez (só no modo local; na nuvem não faz sentido) */
  async function ensureSeedUser() {
    if (cloudEnabled()) return;
    const email = 'teste@admin.com.br';
    if (getUsers().some(u => u.email === email)) return;
    try {
      await register({ name: 'Conta Teste', email, password: 'admin', income: 5000, skipInvite: true });
    } catch { /* corrida de inicialização — ignora se já criada */ }
  }

  async function login({ email, password }) {
    email = (email || '').trim().toLowerCase();
    if (cloudEnabled()) {
      const cu = await Cloud.signIn({ email, password });
      const user = { id: cu.id, name: (cu.user_metadata && cu.user_metadata.name) || email.split('@')[0], email: cu.email || email };
      setCloudUser(user);
      let remote = null;
      try { remote = await Cloud.pull(user.id); } catch { /* offline: usa cache local se houver */ }
      if (remote) write(K_DATA(user.id), remote);
      else if (!localStorage.getItem(K_DATA(user.id))) write(K_DATA(user.id), freshDataset(0));
      return user;
    }
    const user = getUsers().find(u => u.email === email);
    if (!user) throw new Error('E-mail não encontrado.');
    const { hash } = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw new Error('Senha incorreta.');
    updateUser(user.id, { lastLogin: Date.now() });
    write(K_SESSION, user.id);
    return { ...user, lastLogin: Date.now() };
  }

  /* restaura a sessão da nuvem ao abrir o app (token salvo pelo Supabase) */
  async function restoreSession() {
    if (!cloudEnabled()) return null;
    let sess = null;
    try { sess = await Cloud.session(); } catch { /* offline */ }
    if (!sess || !sess.user) {
      // sem internet mas com cache local? mantém o usuário e os dados já baixados
      if (_cloudUser && navigator.onLine === false) return _cloudUser;
      if (!sess) return _cloudUser || null; // erro de rede: confia no cache se existir
      clearCloudUser();
      return null;
    }
    const u = sess.user;
    const user = { id: u.id, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0], email: u.email || '' };
    setCloudUser(user);
    try { const remote = await Cloud.pull(u.id); if (remote) write(K_DATA(u.id), remote); } catch { /* mantém cache */ }
    return user;
  }

  function logout() {
    if (cloudEnabled()) { clearCloudUser(); Cloud.signOut(); return; }
    localStorage.removeItem(K_SESSION);
  }
  const currentUser = () => {
    if (cloudEnabled()) return _cloudUser;
    const id = read(K_SESSION, null);
    return id ? getUsers().find(u => u.id === id) || null : null;
  };

  function updateUser(id, patch) {
    const users = getUsers();
    const i = users.findIndex(u => u.id === id);
    if (i >= 0) { users[i] = { ...users[i], ...patch }; write(K_USERS, users); }
    return users[i];
  }

  /* ---------- dados do usuário ---------- */
  let _uid = null, _data = null;
  function load(userId) {
    _uid = userId;
    _data = read(K_DATA(userId), { transactions: [], debts: [], goals: [], reports: [], recurring: [], budgets: {}, assets: [], connections: [], settings: {} });
    // garante campos novos em contas antigas (compatibilidade retroativa)
    if (!_data.recurring) _data.recurring = [];
    if (!_data.budgets) _data.budgets = {};
    if (!_data.assets) _data.assets = [];
    if (!_data.connections) _data.connections = [];
    if (!_data.settings) _data.settings = {};
    if (!_data.settings.budgetMethod) _data.settings.budgetMethod = '50-30-20';
    return _data;
  }
  let _pushTimer = null;
  function save() {
    if (_uid) write(K_DATA(_uid), _data);
    if (cloudEnabled() && _uid && _cloudUser && _cloudUser.id === _uid) {
      clearTimeout(_pushTimer);
      const snapshot = _uid, payload = _data;
      _pushTimer = setTimeout(() => { Cloud.push(snapshot, payload).catch(() => {}); }, 1200);
    }
  }
  const data = () => _data;

  /* transactions */
  function addTx(tx) { _data.transactions.push({ id: uid(), createdAt: Date.now(), ...tx }); save(); }
  function updateTx(id, patch) { const t = _data.transactions.find(x => x.id === id); if (t) Object.assign(t, patch); save(); }
  function removeTx(id) { _data.transactions = _data.transactions.filter(x => x.id !== id); save(); }

  /* debts */
  function addDebt(d) { _data.debts.push({ id: uid(), createdAt: Date.now(), payments: [], ...d }); save(); }
  function updateDebt(id, patch) { const d = _data.debts.find(x => x.id === id); if (d) Object.assign(d, patch); save(); }
  function removeDebt(id) { _data.debts = _data.debts.filter(x => x.id !== id); save(); }
  function payDebt(id, amount, date) { const d = _data.debts.find(x => x.id === id); if (d) { d.payments.push({ amount, date, id: uid() }); } save(); }

  /* goals */
  function addGoal(g) { _data.goals.push({ id: uid(), createdAt: Date.now(), saved: 0, ...g }); save(); }
  function updateGoal(id, patch) { const g = _data.goals.find(x => x.id === id); if (g) Object.assign(g, patch); save(); }
  function removeGoal(id) { _data.goals = _data.goals.filter(x => x.id !== id); save(); }

  /* recurring (lançamentos fixos / recorrentes) */
  function addRecurring(r) { _data.recurring.push({ id: uid(), createdAt: Date.now(), ...r }); save(); }
  function updateRecurring(id, patch) { const r = _data.recurring.find(x => x.id === id); if (r) Object.assign(r, patch); save(); }
  function removeRecurring(id) { _data.recurring = _data.recurring.filter(x => x.id !== id); save(); }

  /* assets (ativos do patrimônio) — kind: liquid | invest | property | other */
  function addAsset(a) { _data.assets.push({ id: uid(), createdAt: Date.now(), ...a }); save(); }
  function updateAsset(id, patch) { const x = _data.assets.find(a => a.id === id); if (x) Object.assign(x, patch); save(); }
  function removeAsset(id) { _data.assets = _data.assets.filter(a => a.id !== id); save(); }

  /* connections (conexões bancárias — Open Finance / import OFX-CSV) */
  function addConnection(c) {
    if (!_data.connections) _data.connections = [];
    const conn = { id: uid(), createdAt: Date.now(), lastSync: 0, status: 'connected', fitids: [], ...c };
    _data.connections.push(conn); save(); return conn;
  }
  function updateConnection(id, patch) { const c = (_data.connections || []).find(x => x.id === id); if (c) Object.assign(c, patch); save(); return c; }
  function removeConnection(id) { _data.connections = (_data.connections || []).filter(x => x.id !== id); save(); }
  const connections = () => _data.connections || [];

  /* budgets (orçamento por categoria) — { categoryId: limiteMensal } */
  function setBudget(catId, amount) {
    if (!amount || amount <= 0) delete _data.budgets[catId];
    else _data.budgets[catId] = amount;
    save();
  }

  /* settings */
  function setSettings(patch) { _data.settings = { ...(_data.settings || {}), ...patch }; save(); }

  /* reports */
  function saveReport(r) {
    const i = _data.reports.findIndex(x => x.key === r.key);
    if (i >= 0) _data.reports[i] = r; else _data.reports.push(r);
    save();
  }

  /* export / import */
  function exportData() { return JSON.stringify(_data, null, 2); }
  function importData(json) {
    const parsed = JSON.parse(json);
    _data = {
      transactions: [], debts: [], goals: [], reports: [], recurring: [], budgets: {}, assets: [], connections: [], settings: {},
      ...parsed
    };
    if (!_data.recurring) _data.recurring = [];
    if (!_data.budgets) _data.budgets = {};
    if (!_data.assets) _data.assets = [];
    if (!_data.connections) _data.connections = [];
    save();
  }
  function wipeUserData() {
    _data = { transactions: [], debts: [], goals: [], reports: [], recurring: _data.recurring, budgets: _data.budgets, assets: [], connections: _data.connections, settings: _data.settings };
    save();
  }

  /* ---------- banco de logins (resumo de todas as contas do dispositivo) ---------- */
  function accountsSummary() {
    if (cloudEnabled()) {
      if (!_cloudUser) return [];
      const d = read(K_DATA(_cloudUser.id), null);
      const tx = d && Array.isArray(d.transactions) ? d.transactions.length : 0;
      const conns = d && Array.isArray(d.connections) ? d.connections.length : 0;
      return [{ id: _cloudUser.id, name: _cloudUser.name, email: _cloudUser.email, createdAt: 0, lastLogin: Date.now(), transactions: tx, connections: conns, cloud: true }];
    }
    return getUsers().map(u => {
      const d = read(K_DATA(u.id), null);
      const tx = d && Array.isArray(d.transactions) ? d.transactions.length : 0;
      const conns = d && Array.isArray(d.connections) ? d.connections.length : 0;
      return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt || 0, lastLogin: u.lastLogin || 0, transactions: tx, connections: conns };
    }).sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));
  }
  function removeAccount(id) {
    write(K_USERS, getUsers().filter(u => u.id !== id));
    localStorage.removeItem(K_DATA(id));
    if (read(K_SESSION, null) === id) localStorage.removeItem(K_SESSION);
  }

  return {
    register, ensureSeedUser, login, logout, currentUser, updateUser, getUsers,
    generateInvite, checkInvite, isAdmin,
    cloudEnabled, restoreSession,
    load, save, data,
    addTx, updateTx, removeTx,
    addDebt, updateDebt, removeDebt, payDebt,
    addGoal, updateGoal, removeGoal,
    addRecurring, updateRecurring, removeRecurring, setBudget,
    addAsset, updateAsset, removeAsset,
    addConnection, updateConnection, removeConnection, connections,
    setSettings, saveReport,
    accountsSummary, removeAccount,
    exportData, importData, wipeUserData
  };
})();

/* ============================================================
   CATEGORIAS + helpers de formatação/data (globais)
   ============================================================ */
const CATEGORIES = {
  expense: [
    { id: 'moradia', name: 'Moradia', icon: 'home' },
    { id: 'alimentacao', name: 'Alimentação', icon: 'food' },
    { id: 'transporte', name: 'Transporte', icon: 'car' },
    { id: 'saude', name: 'Saúde', icon: 'health' },
    { id: 'educacao', name: 'Educação', icon: 'education' },
    { id: 'lazer', name: 'Lazer', icon: 'leisure' },
    { id: 'compras', name: 'Compras', icon: 'shopping' },
    { id: 'contas', name: 'Contas & Assinaturas', icon: 'bills' },
    { id: 'dividas', name: 'Pagamento de dívidas', icon: 'debt' },
    { id: 'investimento', name: 'Investimentos', icon: 'invest' },
    { id: 'outros', name: 'Outros', icon: 'box' },
  ],
  income: [
    { id: 'salario', name: 'Salário', icon: 'briefcase' },
    { id: 'freelance', name: 'Freelance / Extra', icon: 'laptop' },
    { id: 'rendimentos', name: 'Rendimentos', icon: 'invest' },
    { id: 'presente', name: 'Presente / Doação', icon: 'gift' },
    { id: 'outros', name: 'Outros', icon: 'box' },
  ]
};
const catInfo = (type, id) =>
  (CATEGORIES[type] || []).find(c => c.id === id) || { name: id || '—', icon: 'box' };

const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthKey = d => {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = key => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
const todayISO = () => new Date().toISOString().slice(0, 10);
