/* ============================================================
   BANK — conexões bancárias (Open Finance) + importação de extratos
   ------------------------------------------------------------
   Duas formas de trazer lançamentos do banco para o Prospera:
   1) Importar extrato OFX/CSV exportado pelo app/internet banking
      (funciona 100% offline, em qualquer banco — digital ou físico).
   2) Conectar uma API agregadora (Pluggy/Belvo) com a sua própria
      chave para sincronização automática (opcional, opt-in).
   Tudo continua salvo só neste dispositivo.
   ============================================================ */
const Bank = (() => {

  /* instituições brasileiras participantes do Open Finance */
  const INSTITUTIONS = [
    // digitais
    { id: 'nubank',   name: 'Nubank',         type: 'digital',  short: 'Nu' },
    { id: 'inter',    name: 'Banco Inter',    type: 'digital',  short: 'In' },
    { id: 'c6',       name: 'C6 Bank',        type: 'digital',  short: 'C6' },
    { id: 'picpay',   name: 'PicPay',         type: 'digital',  short: 'PP' },
    { id: 'mercadopago', name: 'Mercado Pago', type: 'digital', short: 'MP' },
    { id: 'neon',     name: 'Neon',           type: 'digital',  short: 'Ne' },
    { id: 'next',     name: 'Next',           type: 'digital',  short: 'Nx' },
    { id: 'btg',      name: 'BTG Pactual',    type: 'digital',  short: 'BT' },
    // físicos / tradicionais
    { id: 'bb',       name: 'Banco do Brasil', type: 'physical', short: 'BB' },
    { id: 'itau',     name: 'Itaú',           type: 'physical', short: 'It' },
    { id: 'bradesco', name: 'Bradesco',       type: 'physical', short: 'Br' },
    { id: 'santander',name: 'Santander',      type: 'physical', short: 'Sa' },
    { id: 'caixa',    name: 'Caixa',          type: 'physical', short: 'Cx' },
    { id: 'sicoob',   name: 'Sicoob',         type: 'physical', short: 'Sc' },
    { id: 'sicredi',  name: 'Sicredi',        type: 'physical', short: 'Sr' },
    { id: 'outro',    name: 'Outro banco',    type: 'physical', short: '+'  },
  ];
  const institution = id => INSTITUTIONS.find(b => b.id === id) || INSTITUTIONS[INSTITUTIONS.length - 1];

  /* ---------- agregadora de API (opcional) ---------- */
  const PROVIDERS = {
    pluggy: { name: 'Pluggy', baseUrl: 'https://api.pluggy.ai' },
    belvo:  { name: 'Belvo',  baseUrl: 'https://api.belvo.com' },
    custom: { name: 'Endpoint próprio', baseUrl: '' },
  };
  const aggregator = () => (Store.data().settings || {}).aggregator || null;
  const hasAggregator = () => !!(aggregator() && aggregator().key);
  function setAggregator(cfg) {
    if (!cfg || !cfg.key) Store.setSettings({ aggregator: null });
    else Store.setSettings({ aggregator: { provider: cfg.provider || 'pluggy', key: cfg.key.trim(), baseUrl: (cfg.baseUrl || (PROVIDERS[cfg.provider] || {}).baseUrl || '').trim() } });
  }

  /* tenta sincronizar via API agregadora; degrada com mensagem clara se não der */
  async function syncViaApi(connId) {
    const cfg = aggregator();
    if (!cfg || !cfg.key) throw new Error('Nenhuma API conectada. Conecte um agregador ou importe um extrato OFX/CSV.');
    const base = cfg.baseUrl || (PROVIDERS[cfg.provider] || {}).baseUrl;
    if (!base) throw new Error('Defina o endpoint da API do agregador nas configurações de conexão.');
    try {
      const res = await fetch(base.replace(/\/$/, '') + '/transactions', {
        headers: { 'Authorization': 'Bearer ' + cfg.key, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('A API respondeu ' + res.status + '. Verifique a chave e o plano do agregador.');
      const json = await res.json();
      const rows = Array.isArray(json) ? json : (json.results || json.data || []);
      const txs = rows.map(r => ({
        date: (r.date || r.dateTime || '').slice(0, 10),
        amount: Math.abs(parseFloat(r.amount) || 0),
        type: (parseFloat(r.amount) || 0) < 0 ? 'expense' : 'income',
        desc: r.description || r.descriptor || r.merchant || 'Lançamento',
        fitid: String(r.id || r.transactionId || (r.date + r.amount + (r.description || '')))
      })).filter(t => t.date && t.amount);
      return ingest(connId, txs, 'api');
    } catch (err) {
      // navegadores bloqueiam chamadas diretas a muitas APIs (CORS) — orienta o caminho confiável
      if (err instanceof TypeError) throw new Error('Não foi possível alcançar a API direto do navegador (provável bloqueio CORS). Use a importação de extrato OFX/CSV, que funciona em qualquer banco.');
      throw err;
    }
  }

  /* ---------- parser OFX (SGML e XML) ---------- */
  function parseOFX(text) {
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const tag = (b, t) => {
      const m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i'));
      return m ? m[1].trim() : '';
    };
    const out = [];
    blocks.forEach(b => {
      const raw = parseFloat(tag(b, 'TRNAMT'));
      if (!isFinite(raw)) return;
      const dt = tag(b, 'DTPOSTED').replace(/[^0-9]/g, '').slice(0, 8);
      if (dt.length < 8) return;
      const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
      const desc = tag(b, 'MEMO') || tag(b, 'NAME') || 'Lançamento';
      const fitid = tag(b, 'FITID') || (date + raw + desc);
      out.push({ date, amount: Math.abs(raw), type: raw < 0 ? 'expense' : 'income', desc, fitid });
    });
    return out;
  }

  /* ---------- parser CSV (detecta separador e formato BR/US) ---------- */
  function parseBRNumber(s) {
    s = (s || '').replace(/[^0-9.,-]/g, '').trim();
    if (!s) return NaN;
    if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    return parseFloat(s);
  }
  function parseDate(s) {
    s = (s || '').trim();
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);            // ISO
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); // DD/MM/AAAA
    if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return '';
  }
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const cells = l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
    const header = cells(lines[0]).map(h => h.toLowerCase());
    const find = (...keys) => header.findIndex(h => keys.some(k => h.includes(k)));
    let iDate = find('data', 'date'), iDesc = find('histor', 'descri', 'lançamento', 'lancamento', 'memo', 'detalhe'), iVal = find('valor', 'amount', 'value');
    const hasHeader = iDate >= 0 || iVal >= 0;
    if (iDate < 0) iDate = 0;
    if (iVal < 0) iVal = -1;
    if (iDesc < 0) iDesc = 1;
    const out = [];
    (hasHeader ? lines.slice(1) : lines).forEach(l => {
      const c = cells(l);
      const date = parseDate(c[iDate]);
      let amount = iVal >= 0 ? parseBRNumber(c[iVal]) : parseBRNumber(c[c.length - 1]);
      if (!date || !isFinite(amount) || amount === 0) return;
      const desc = (c[iDesc] || c[1] || c[0] || 'Lançamento').slice(0, 80);
      out.push({ date, amount: Math.abs(amount), type: amount < 0 ? 'expense' : 'income', desc, fitid: date + amount + desc });
    });
    return out;
  }

  /* auto-categorização leve por palavra-chave (melhora a vida do usuário) */
  const RULES = [
    [/merc|supermerc|atacad|hortifr|padaria|ifood|restaur|lanch|food/i, 'alimentacao'],
    [/uber|99|posto|combust|gasolin|estacion|metro|onibus|ônibus|transport/i, 'transporte'],
    [/farm|drog|hospital|clinic|consult|saude|saúde|psic|dent/i, 'saude'],
    [/escola|faculdade|curso|udemy|aluno|educ|livr/i, 'educacao'],
    [/netflix|spotify|cinema|prime|disney|hbo|game|lazer|bar /i, 'lazer'],
    [/aluguel|condom|luz|energia|agua|água|gas|internet|vivo|claro|tim|net /i, 'contas'],
    [/amazon|magalu|americ|shopee|aliexpress|loja|shopping|compra/i, 'compras'],
    [/salar|pagamento|provento|rendimento|pix recebido/i, 'salario'],
  ];
  function categorize(desc, type) {
    for (const [re, cat] of RULES) if (re.test(desc)) {
      if (type === 'income') return cat === 'salario' ? 'salario' : 'outros';
      if (cat === 'salario') return 'outros';
      return cat;
    }
    return 'outros';
  }

  /* grava os lançamentos no Store, evitando duplicar (dedup por FITID) */
  function ingest(connId, txs, method) {
    const conn = Store.connections().find(c => c.id === connId);
    if (!conn) throw new Error('Conexão não encontrada.');
    const seen = new Set(conn.fitids || []);
    let added = 0, skipped = 0, delta = 0;
    txs.forEach(t => {
      if (seen.has(t.fitid)) { skipped++; return; }
      seen.add(t.fitid);
      Store.addTx({
        type: t.type, amount: t.amount, category: categorize(t.desc, t.type),
        description: t.desc, date: t.date, source: 'bank', connectionId: connId
      });
      delta += t.type === 'income' ? t.amount : -t.amount; // só conta os novos
      added++;
    });
    const balance = (conn.balance || 0) + delta;
    Store.updateConnection(connId, { fitids: [...seen], lastSync: Date.now(), status: 'connected', balance });
    syncAsset(conn, balance); // reflete o saldo no Patrimônio
    return { added, skipped, total: txs.length };
  }

  /* mantém um ativo de liquidez no Patrimônio espelhando o saldo da conta */
  function syncAsset(conn, balance) {
    const assets = Store.data().assets || [];
    const name = (conn.name || institution(conn.instId).name) + ' (conta)';
    const existing = assets.find(a => a.connectionId === conn.id);
    if (existing) Store.updateAsset(existing.id, { value: balance, name });
    else Store.addAsset({ name, kind: 'liquid', value: balance, connectionId: conn.id, source: 'bank' });
  }

  /* ponto de entrada da importação de arquivo */
  function importStatement(connId, text, filename) {
    const isOFX = /OFXHEADER|<OFX|<STMTTRN/i.test(text);
    const txs = isOFX ? parseOFX(text) : parseCSV(text);
    if (!txs.length) throw new Error('Não encontrei lançamentos no arquivo. Exporte o extrato em OFX (recomendado) ou CSV pelo seu banco.');
    return ingest(connId, txs, isOFX ? 'ofx' : 'csv');
  }

  return {
    INSTITUTIONS, institution, PROVIDERS,
    aggregator, hasAggregator, setAggregator, syncViaApi,
    parseOFX, parseCSV, importStatement, categorize
  };
})();
