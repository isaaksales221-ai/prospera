/* ============================================================
   CLOUD — sincronização e login na nuvem (Supabase)
   ------------------------------------------------------------
   Só entra em ação se js/config.js tiver URL + chave preenchidas.
   Sem isso, o app continua 100% local (Cloud.isConfigured() = false).
   Guarda TODOS os dados do usuário num único registro JSON na
   tabela "vaults", protegido por RLS (cada um só vê o seu).
   ============================================================ */
const Cloud = (() => {
  const cfg = window.PROSPERA_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  let client = null, loadingSdk = null;

  const isConfigured = () => configured;

  /* carrega o SDK do Supabase via CDN (precisa de internet) */
  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (loadingSdk) return loadingSdk;
    loadingSdk = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.async = true;
      s.onload = () => (window.supabase && window.supabase.createClient)
        ? resolve(window.supabase)
        : reject(new Error('SDK da nuvem não carregou corretamente.'));
      s.onerror = () => reject(new Error('Não foi possível carregar a nuvem (sem internet?).'));
      document.head.appendChild(s);
    });
    return loadingSdk;
  }

  async function getClient() {
    if (!configured) throw new Error('Nuvem não configurada.');
    if (client) return client;
    const sb = await loadSdk();
    client = sb.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'prospera.sb' }
    });
    return client;
  }

  function translate(error) {
    const m = (error && error.message) || String(error || '');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/already registered|already exists|User already/i.test(m)) return 'Já existe uma conta com este e-mail.';
    if (/Email not confirmed/i.test(m)) return 'Confirmação de e-mail está ligada no Supabase. Desative em Authentication para entrar direto.';
    if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns segundos e tente de novo.';
    if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com a nuvem. Verifique a internet.';
    return m;
  }

  async function signUp({ email, password, name }) {
    const c = await getClient();
    const { data, error } = await c.auth.signUp({ email, password, options: { data: { name: name || '' } } });
    if (error) throw new Error(translate(error));
    return data.user;
  }

  async function signIn({ email, password }) {
    const c = await getClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translate(error));
    return data.user;
  }

  async function signOut() {
    if (!configured) return;
    try { const c = await getClient(); await c.auth.signOut(); } catch { /* ignora */ }
  }

  async function session() {
    if (!configured) return null;
    const c = await getClient();
    const { data } = await c.auth.getSession();
    return (data && data.session) || null;
  }

  /* baixa o cofre do usuário (ou null se ainda não existe) */
  async function pull(userId) {
    const c = await getClient();
    const { data, error } = await c.from('vaults').select('data').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(translate(error));
    return data ? data.data : null;
  }

  /* grava o cofre do usuário (cria ou atualiza) */
  async function push(userId, payload) {
    const c = await getClient();
    const { error } = await c.from('vaults').upsert({ user_id: userId, data: payload }, { onConflict: 'user_id' });
    if (error) throw new Error(translate(error));
  }

  return { isConfigured, signUp, signIn, signOut, session, pull, push };
})();
