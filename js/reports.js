/* ============================================================
   REPORTS — relatórios de fechamento mensal.
   Gera automaticamente no último/penúltimo dia do mês.
   ============================================================ */
const Reports = (() => {

  /* monta o objeto de relatório de um mês */
  function build(monthKeyStr) {
    const a = Insights.analyze(monthKeyStr);
    const score = Insights.healthScore(a);
    const insights = Insights.generate(a);
    const d = Store.data();

    const debtsDetail = (d.debts || []).map(x => {
      const paid = Insights.paidOf(x);
      const remaining = Math.max(0, x.total - paid);
      return { name: x.name, total: x.total, paid, remaining, rate: x.interestRate || 0 };
    });
    const totalRemainingDebt = debtsDetail.reduce((s, x) => s + x.remaining, 0);

    return {
      key: monthKeyStr,
      label: monthLabel(monthKeyStr),
      generatedAt: Date.now(),
      income: a.income, expense: a.expense, balance: a.balance,
      savingsRate: a.savingsRate, score,
      scoreLabel: Insights.scoreLabel(score).txt,
      topCats: a.topCats.slice(0, 6),
      byCat: a.byCat,
      debts: debtsDetail, totalRemainingDebt,
      accumulated: a.accumulated,
      emergencyCoverage: a.emergencyCoverage,
      expenseTrend: a.expenseTrend,
      insights
    };
  }

  /* gera e salva (idempotente: sobrescreve o do mesmo mês) */
  function generateAndSave(monthKeyStr) {
    const r = build(monthKeyStr);
    Store.saveReport(r);
    return r;
  }

  /* checa se hoje é último ou penúltimo dia do mês -> gera o relatório do mês corrente */
  function maybeAutoGenerate() {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const isCloseToEnd = now.getDate() >= lastDay - 1; // penúltimo ou último
    const key = monthKey(now);
    const d = Store.data();
    const existing = (d.reports || []).find(r => r.key === key);

    if (isCloseToEnd && !existing) {
      const r = generateAndSave(key);
      return { generated: true, report: r };
    }
    return { generated: false, report: existing || null };
  }

  /* render de um relatório como HTML */
  function render(r) {
    const trendPill = r.expenseTrend > 0
      ? `<span class="pill neg">${ICON('arrowUp')} ${r.expenseTrend.toFixed(0)}% gastos</span>`
      : r.expenseTrend < 0
        ? `<span class="pill pos">${ICON('arrowDown')} ${Math.abs(r.expenseTrend).toFixed(0)}% gastos</span>`
        : '';

    const cats = r.topCats.length
      ? Charts.donut(r.topCats.map(c => ({ label: c.name, value: c.value })))
      : '<p class="muted">Sem despesas neste mês.</p>';

    const debtsRows = r.debts.length
      ? r.debts.map(x => `<div class="list-item">
          <div class="li-icon">${ICON('debt')}</div>
          <div class="li-body"><strong>${esc(x.name)}</strong>
          <small>Pago ${fmtBRL(x.paid)} de ${fmtBRL(x.total)} · ${x.rate}% a.m.</small></div>
          <div class="li-amt neg">${fmtBRL(x.remaining)}</div></div>`).join('')
      : '<p class="muted">Nenhuma dívida registrada.</p>';

    const insightsHtml = r.insights.map(i =>
      `<div class="insight ${i.type}"><div class="ico">${ICON(i.ico)}</div>
        <div><h4>${esc(i.title)}</h4><p>${esc(i.text)}</p></div></div>`).join('');

    return `<div class="report" id="reportPrintable">
      <div class="report-head">
        <div class="row spread">
          <div>
            <span class="tag">Relatório de fechamento</span>
            <h3 style="margin-top:8px;text-transform:capitalize">${r.label}</h3>
          </div>
          <div class="score-ring">
            <div class="num" style="color:${Insights.scoreLabel(r.score).color}">${r.score}</div>
            <div class="lbl">${r.scoreLabel}</div>
          </div>
        </div>
      </div>
      <div class="report-body">
        <div class="kv-grid">
          <div class="kv"><div class="k">Receitas</div><div class="v" style="color:var(--green)">${fmtBRL(r.income)}</div></div>
          <div class="kv"><div class="k">Despesas</div><div class="v" style="color:var(--red)">${fmtBRL(r.expense)}</div></div>
          <div class="kv"><div class="k">Saldo do mês</div><div class="v" style="color:${r.balance >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtBRL(r.balance)}</div></div>
          <div class="kv"><div class="k">Taxa de poupança</div><div class="v">${r.savingsRate.toFixed(0)}%</div></div>
        </div>
        <div class="row" style="gap:10px;flex-wrap:wrap">${trendPill}
          <span class="pill ${r.emergencyCoverage >= 3 ? 'pos' : 'warn'}">${ICON('shield')} Reserva: ${r.emergencyCoverage.toFixed(1)} meses</span>
          <span class="pill ${r.totalRemainingDebt > 0 ? 'neg' : 'pos'}">${ICON('debt')} Dívidas: ${fmtBRL(r.totalRemainingDebt)}</span>
        </div>
        <div class="card"><h3>${ICON('pie')} Despesas por categoria</h3>${cats}</div>
        <div class="card"><h3>${ICON('debt')} Dívidas</h3><div class="list">${debtsRows}</div></div>
        <div><h3 style="margin-bottom:12px">${ICON('spark')} Análise e recomendações</h3>${insightsHtml}</div>
      </div>
    </div>`;
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { build, generateAndSave, maybeAutoGenerate, render };
})();
