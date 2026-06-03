/* ============================================================
   INSIGHTS — avalia a situação financeira ANTES de aconselhar.
   Tudo baseado nos dados reais do usuário (regras determinísticas).
   ============================================================ */
const Insights = (() => {

  /* ---- 1. AVALIAÇÃO: calcula métricas reais do usuário ---- */
  function analyze(monthKeyStr) {
    const d = Store.data();
    const tx = d.transactions;
    const settings = d.settings || {};

    const inMonth = t => monthKey(t.date) === monthKeyStr;
    const monthTx = tx.filter(inMonth);

    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;

    // renda de referência: maior entre renda declarada e receitas do mês
    const refIncome = Math.max(settings.monthlyIncome || 0, income);

    // média de despesas dos últimos meses (até 6) para reserva de emergência
    const last6 = lastNMonths(monthKeyStr, 6);
    const monthlyExpenses = last6.map(mk =>
      tx.filter(t => t.type === 'expense' && monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0)
    ).filter(v => v > 0);
    const avgExpense = monthlyExpenses.length ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length : expense;

    // gastos por categoria
    const byCat = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    });
    const topCats = Object.entries(byCat).map(([id, value]) => ({ id, value, ...catInfo('expense', id) }))
      .sort((a, b) => b.value - a.value);

    // dívidas
    const debts = d.debts || [];
    const totalDebt = debts.reduce((s, x) => s + Math.max(0, x.total - paidOf(x)), 0);
    const monthlyDebtPayment = debts.reduce((s, x) => s + (x.minPayment || 0), 0);

    // savings: total já investido (categoria investimento) + saldo positivo histórico estimado
    const totalInvested = tx.filter(t => t.type === 'expense' && t.category === 'investimento')
      .reduce((s, t) => s + t.amount, 0);

    // reserva estimada = soma de todos os saldos mensais positivos acumulados
    const accumulated = accumulatedBalance(tx, monthKeyStr);

    // ratios
    const savingsRate = refIncome > 0 ? (balance / refIncome) * 100 : 0;
    const debtToIncome = refIncome > 0 ? (monthlyDebtPayment / refIncome) * 100 : 0;
    const emergencyTarget = avgExpense * (settings.emergencyMonths || 6);
    const emergencyCoverage = avgExpense > 0 ? accumulated / avgExpense : 0; // em meses

    // mês anterior (tendência)
    const prevKey = shiftMonth(monthKeyStr, -1);
    const prevExpense = tx.filter(t => t.type === 'expense' && monthKey(t.date) === prevKey).reduce((s, t) => s + t.amount, 0);
    const expenseTrend = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : 0;

    // orçamentos por categoria
    const budgets = d.budgets || {};
    const budgetRows = Object.entries(budgets).map(([id, limit]) => {
      const spent = byCat[id] || 0;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      return { id, ...catInfo('expense', id), limit, spent, pct, remaining: limit - spent };
    }).sort((a, b) => b.pct - a.pct);
    const budgetTotal = budgetRows.reduce((s, b) => s + b.limit, 0);
    const budgetSpent = budgetRows.reduce((s, b) => s + b.spent, 0);

    return {
      monthKey: monthKeyStr, income, expense, balance, refIncome,
      avgExpense, savingsRate, debtToIncome, totalDebt, monthlyDebtPayment,
      totalInvested, accumulated, emergencyTarget, emergencyCoverage,
      topCats, byCat, expenseTrend, prevExpense, debts,
      budgets, budgetRows, budgetTotal, budgetSpent,
      txCount: monthTx.length
    };
  }

  /* ---- PROJEÇÃO de fim de mês (só faz sentido para o mês corrente) ---- */
  function projection(monthKeyStr) {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthKeyStr !== curKey) return null; // só projeta o mês atual
    const a = analyze(monthKeyStr);
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (day < 3 || a.expense <= 0) return null; // cedo demais para projetar
    const dailyRate = a.expense / day;
    const projExpense = dailyRate * daysInMonth;
    const projBalance = a.income - projExpense;
    return {
      day, daysInMonth, projExpense, projBalance,
      currentExpense: a.expense, income: a.income,
      pace: dailyRate
    };
  }

  /* ---- FLUXO DE CAIXA PROJETADO (próximos N dias) ----
     Projeta o saldo dia a dia a partir de hoje usando:
       • transações já lançadas com data futura (recorrentes do mês já geradas, parcelas)
       • lançamentos fixos projetados para meses ainda não gerados
       • pagamentos mínimos de dívidas nas datas de vencimento
     Avisa qual o primeiro dia em que o saldo fica negativo. */
  function cashflowForecast(monthKeyStr, horizonDays) {
    horizonDays = horizonDays || 60;
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthKeyStr !== curKey) return null; // só projeta a partir de hoje

    const d = Store.data();
    const tx = d.transactions || [];
    const recurring = d.recurring || [];
    const debts = d.debts || [];

    const pad = n => String(n).padStart(2, '0');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(today); end.setDate(end.getDate() + horizonDays);
    const isoOf = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const todayISO = isoOf(today), endISO = isoOf(end);

    // saldo de caixa estimado hoje: tudo que já entrou menos tudo que já saiu até hoje
    let startCash = 0;
    tx.forEach(t => { if (t.date <= todayISO) startCash += t.type === 'income' ? t.amount : -t.amount; });

    const events = [];
    const addEvent = (dateISO, label, delta, kind) => {
      if (dateISO > todayISO && dateISO <= endISO) events.push({ date: dateISO, label, delta, kind });
    };

    // 1) transações já lançadas com data futura dentro do horizonte
    tx.forEach(t => {
      if (t.date > todayISO && t.date <= endISO) {
        addEvent(t.date, t.description || catInfo(t.type, t.category).name,
          t.type === 'income' ? t.amount : -t.amount, 'tx');
      }
    });

    // meses cobertos pelo horizonte (a partir do mês atual)
    const monthsAhead = [];
    { let y = now.getFullYear(), m = now.getMonth();
      for (let i = 0; i <= Math.ceil(horizonDays / 28) + 1; i++) {
        monthsAhead.push(`${y}-${pad(m + 1)}`); m++; if (m > 11) { m = 0; y++; }
      } }

    // 2) lançamentos fixos projetados — só para meses ainda NÃO gerados em transações
    recurring.forEach(r => {
      monthsAhead.forEach(mk => {
        if (tx.some(t => t.recurringId === r.id && monthKey(t.date) === mk)) return; // já contabilizado
        const [yy, mm] = mk.split('-').map(Number);
        const dim = new Date(yy, mm, 0).getDate();
        const day = Math.min(Math.max(1, r.day || 1), dim);
        addEvent(`${mk}-${pad(day)}`, r.description || catInfo(r.type, r.category).name,
          r.type === 'income' ? r.amount : -r.amount, 'recurring');
      });
    });

    // 3) pagamentos mínimos de dívidas (agendados, ainda não viraram transação)
    debts.forEach(x => {
      let remaining = (x.total || 0) - paidOf(x);
      const min = x.minPayment || 0;
      if (remaining <= 0 || min <= 0 || !x.dueDate) return;
      const dueDay = new Date(x.dueDate + 'T00:00:00').getDate();
      monthsAhead.forEach(mk => {
        if (remaining <= 0) return;
        const [yy, mm] = mk.split('-').map(Number);
        const dim = new Date(yy, mm, 0).getDate();
        const dISO = `${mk}-${pad(Math.min(dueDay, dim))}`;
        if (dISO <= todayISO || dISO > endISO) return;
        const pay = Math.min(min, remaining);
        remaining -= pay;
        addEvent(dISO, 'Parcela: ' + (x.name || 'dívida'), -pay, 'debt');
      });
    });

    if (!events.length) return null; // nada a projetar

    events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

    // série de saldo corrente + pontos críticos
    let bal = startCash, totalIn = 0, totalOut = 0;
    let lowest = { date: todayISO, balance: startCash };
    let firstNegative = null;
    const series = [{ date: todayISO, balance: startCash }];
    events.forEach(e => {
      bal += e.delta;
      if (e.delta >= 0) totalIn += e.delta; else totalOut += -e.delta;
      if (bal < lowest.balance) lowest = { date: e.date, balance: bal };
      if (firstNegative === null && bal < 0) firstNegative = { date: e.date, balance: bal };
      series.push({ date: e.date, balance: bal });
    });

    const daysUntil = iso => Math.round((new Date(iso + 'T00:00:00') - today) / 86400000);

    return {
      horizonDays, startCash, endISO, endBalance: bal,
      totalIn, totalOut, events, series, lowest, firstNegative,
      daysUntilNegative: firstNegative ? daysUntil(firstNegative.date) : null,
      daysUntilLowest: daysUntil(lowest.date)
    };
  }

  /* ---- COMPARATIVO de categorias vs mês anterior ---- */
  function categoryComparison(monthKeyStr) {
    const a = analyze(monthKeyStr);
    const prevA = analyze(shiftMonth(monthKeyStr, -1));
    const ids = new Set([...Object.keys(a.byCat), ...Object.keys(prevA.byCat)]);
    const rows = [...ids].map(id => {
      const cur = a.byCat[id] || 0, prev = prevA.byCat[id] || 0;
      const diff = cur - prev;
      const pct = prev > 0 ? (diff / prev) * 100 : (cur > 0 ? 100 : 0);
      return { id, ...catInfo('expense', id), cur, prev, diff, pct };
    }).filter(r => Math.abs(r.diff) >= 1)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    return rows;
  }

  /* ---- ALERTAS proativos (curtos, acionáveis) ---- */
  function alerts(monthKeyStr) {
    const a = analyze(monthKeyStr);
    const out = [];
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrent = monthKeyStr === curKey;

    // orçamentos estourados ou perto do limite
    a.budgetRows.forEach(b => {
      if (b.pct >= 100) out.push({ level: 'bad', ico: b.icon, text: `Orçamento de ${b.name} estourado: ${fmtBRL(b.spent)} de ${fmtBRL(b.limit)}.` });
      else if (b.pct >= 80) out.push({ level: 'warn', ico: b.icon, text: `Você já usou ${b.pct.toFixed(0)}% do orçamento de ${b.name} (${fmtBRL(b.spent)} de ${fmtBRL(b.limit)}).` });
    });

    // vencimentos de dívidas próximos (apenas mês corrente)
    if (isCurrent) {
      (a.debts || []).forEach(d => {
        const remaining = d.total - paidOf(d);
        if (remaining <= 0 || !d.dueDate) return;
        const due = new Date(d.dueDate + 'T00:00:00');
        const diffDays = Math.ceil((due - now) / 86400000);
        if (diffDays >= 0 && diffDays <= 5) {
          out.push({ level: 'warn', ico: 'calendar', text: `${d.name} vence ${diffDays === 0 ? 'hoje' : 'em ' + diffDays + ' dia(s)'} — ${fmtBRL(d.minPayment || remaining)}.` });
        }
      });
    }

    // gasto em categoria muito acima da média
    const comp = categoryComparison(monthKeyStr);
    comp.filter(c => c.diff > 0 && c.pct >= 40 && c.cur >= 100).slice(0, 1).forEach(c => {
      out.push({ level: 'warn', ico: 'invest', text: `Gasto com ${c.name} ${c.pct.toFixed(0)}% acima do mês passado (${fmtBRL(c.cur)} vs ${fmtBRL(c.prev)}).` });
    });

    // saldo negativo
    if (a.balance < 0) out.push({ level: 'bad', ico: 'warning', text: `Você está ${fmtBRL(-a.balance)} no negativo neste mês.` });

    return out;
  }

  function paidOf(debt) { return (debt.payments || []).reduce((s, p) => s + p.amount, 0); }

  function accumulatedBalance(tx, uptoKey) {
    // soma de receitas - despesas até o mês (inclusive), exceto o que foi para investimento (que vira reserva)
    let total = 0;
    tx.forEach(t => {
      if (monthKey(t.date) <= uptoKey) total += t.type === 'income' ? t.amount : -t.amount;
    });
    return Math.max(0, total);
  }

  function lastNMonths(key, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(shiftMonth(key, -i));
    return out;
  }
  function shiftMonth(key, delta) {
    const [y, m] = key.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  }

  /* ---- 2. SCORE de saúde financeira (0-100) ---- */
  function healthScore(a) {
    let score = 50;
    // taxa de poupança
    if (a.savingsRate >= 20) score += 20; else if (a.savingsRate >= 10) score += 12;
    else if (a.savingsRate >= 0) score += 4; else score -= 18;
    // reserva de emergência
    if (a.emergencyCoverage >= 6) score += 18; else if (a.emergencyCoverage >= 3) score += 10;
    else if (a.emergencyCoverage >= 1) score += 4; else score -= 6;
    // endividamento
    if (a.debtToIncome === 0) score += 12; else if (a.debtToIncome <= 30) score += 4;
    else if (a.debtToIncome <= 50) score -= 8; else score -= 18;
    // investindo?
    if (a.totalInvested > 0) score += 6;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  function scoreLabel(s) {
    if (s >= 80) return { txt: 'Excelente', color: 'var(--green)' };
    if (s >= 60) return { txt: 'Saudável', color: 'var(--primary)' };
    if (s >= 40) return { txt: 'Atenção', color: 'var(--amber)' };
    return { txt: 'Crítico', color: 'var(--red)' };
  }

  /* ---- 3. GERAÇÃO de insights coerentes com a realidade ---- */
  function generate(a) {
    const out = [];
    const push = (type, ico, title, text) => out.push({ type, ico, title, text });

    // Sem dados suficientes
    if (a.txCount === 0) {
      push('tip', 'flag', 'Comece registrando seus gastos',
        'Ainda não há lançamentos neste mês. Registre suas receitas e despesas para que eu possa avaliar sua situação e dar dicas feitas para a sua realidade.');
      return out;
    }

    // ---- Avaliação geral do mês ----
    if (a.balance >= 0) {
      push('good', 'check', `Você fechou o mês no positivo (${fmtBRL(a.balance)})`,
        `Suas receitas superaram as despesas. Sua taxa de poupança foi de ${a.savingsRate.toFixed(0)}%. ${a.savingsRate >= 20 ? 'Isso é ótimo — está acima dos 20% recomendados.' : 'Tente direcionar parte desse saldo para sua reserva ou investimentos.'}`);
    } else {
      push('bad', 'warning', `Atenção: você gastou ${fmtBRL(-a.balance)} a mais do que recebeu`,
        `Neste mês suas despesas (${fmtBRL(a.expense)}) superaram as receitas (${fmtBRL(a.income)}). Isso corrói sua reserva ou aumenta dívidas. Veja a categoria "${a.topCats[0]?.name || '—'}", onde você mais gastou, e procure cortes possíveis.`);
    }

    // ---- Reserva de emergência ----
    if (a.avgExpense > 0) {
      if (a.emergencyCoverage < 3) {
        push('warn', 'shield', 'Sua reserva de emergência está baixa',
          `Hoje você tem aproximadamente ${a.emergencyCoverage.toFixed(1)} mês(es) de despesas guardados. O ideal é ter de 3 a 6 meses (cerca de ${fmtBRL(a.emergencyTarget)}). Reservar mesmo que ${fmtBRL(a.avgExpense * 0.1)} por mês já te aproxima desse objetivo.`);
      } else if (a.emergencyCoverage >= 6) {
        push('good', 'shield', 'Sua reserva de emergência está sólida',
          `Você tem cerca de ${a.emergencyCoverage.toFixed(1)} meses de despesas guardados — acima do recomendado. Excelente! O excedente pode ser direcionado para investimentos de maior rentabilidade.`);
      }
    }

    // ---- Endividamento ----
    if (a.totalDebt > 0) {
      const strat = a.debts.filter(x => x.total - paidOf(x) > 0)
        .sort((x, y) => (y.interestRate || 0) - (x.interestRate || 0))[0];
      if (a.debtToIncome > 30) {
        push('bad', 'debt', `Seu comprometimento com dívidas está alto (${a.debtToIncome.toFixed(0)}% da renda)`,
          `Especialistas recomendam não comprometer mais de 30% da renda com dívidas. ${strat ? `Priorize quitar "${strat.name}" primeiro — é a de maior juros (${(strat.interestRate || 0)}% a.m.), o método "avalanche" economiza mais.` : ''} Evite novas parcelas até equilibrar.`);
      } else {
        push('tip', 'debt', `Você tem ${fmtBRL(a.totalDebt)} em dívidas em aberto`,
          `Seu comprometimento (${a.debtToIncome.toFixed(0)}% da renda) está sob controle. ${strat ? `Para acelerar, ataque "${strat.name}" (maior juros) enquanto paga o mínimo das demais.` : ''}`);
      }
    } else {
      push('good', 'check', 'Você está sem dívidas registradas',
        'Estar livre de dívidas é uma base poderosa. Aproveite para acelerar sua reserva e seus investimentos.');
    }

    // ---- Concentração de gastos ----
    if (a.topCats.length && a.expense > 0) {
      const top = a.topCats[0];
      const share = (top.value / a.expense) * 100;
      if (share >= 40) {
        push('warn', top.icon, `${top.name} consome ${share.toFixed(0)}% das suas despesas`,
          `Você gastou ${fmtBRL(top.value)} em ${top.name} neste mês. Quando uma categoria concentra muito do orçamento, vale revisar se há assinaturas, hábitos ou compras que podem ser reduzidos.`);
      }
    }

    // ---- Regra 50/30/20 ----
    if (a.refIncome > 0 && a.expense > 0) {
      const needs = ['moradia', 'alimentacao', 'transporte', 'saude', 'contas', 'educacao'];
      const needsTotal = needs.reduce((s, id) => s + (a.byCat[id] || 0), 0);
      const needsPct = (needsTotal / a.refIncome) * 100;
      if (needsPct > 55) {
        push('tip', 'scale', 'Seus gastos essenciais estão acima do ideal',
          `Pela regra 50/30/20, gastos essenciais (moradia, comida, transporte, contas) deveriam ficar perto de 50% da renda — os seus estão em ${needsPct.toFixed(0)}%. Renegociar contas fixas ou moradia tem o maior impacto no orçamento.`);
      }
    }

    // ---- Tendência ----
    if (a.prevExpense > 0 && Math.abs(a.expenseTrend) >= 15) {
      if (a.expenseTrend > 0) {
        push('warn', 'invest', `Seus gastos subiram ${a.expenseTrend.toFixed(0)}% vs o mês passado`,
          `Você gastou ${fmtBRL(a.expense - a.prevExpense)} a mais do que no mês anterior. Verifique se foi algo pontual ou um novo hábito de consumo.`);
      } else {
        push('good', 'debt', `Você reduziu seus gastos em ${Math.abs(a.expenseTrend).toFixed(0)}%`,
          `Parabéns! Você gastou ${fmtBRL(a.prevExpense - a.expense)} a menos do que no mês passado. Direcione essa economia para a reserva ou investimentos.`);
      }
    }

    // ---- Orçamentos por categoria ----
    if (a.budgetRows.length) {
      const estourados = a.budgetRows.filter(b => b.pct >= 100);
      const noLimite = a.budgetRows.filter(b => b.pct >= 80 && b.pct < 100);
      if (estourados.length) {
        const b = estourados[0];
        push('bad', 'calculator', `Você estourou o orçamento de ${b.name}`,
          `O limite era ${fmtBRL(b.limit)} e você já gastou ${fmtBRL(b.spent)} (${b.pct.toFixed(0)}%). ${estourados.length > 1 ? `Outras ${estourados.length - 1} categoria(s) também passaram do limite. ` : ''}Reveja esses gastos antes do fim do mês.`);
      } else if (noLimite.length) {
        const b = noLimite[0];
        push('warn', 'calculator', `Atenção ao orçamento de ${b.name}`,
          `Você já usou ${b.pct.toFixed(0)}% do limite (${fmtBRL(b.spent)} de ${fmtBRL(b.limit)}). Restam ${fmtBRL(b.remaining)} para o resto do mês.`);
      } else {
        push('good', 'calculator', 'Seus orçamentos estão sob controle',
          `Você está dentro de todos os limites definidos (${fmtBRL(a.budgetSpent)} de ${fmtBRL(a.budgetTotal)}). Continue acompanhando.`);
      }
    }

    // ---- Investimentos ----
    if (a.balance > 0 && a.totalInvested === 0 && a.emergencyCoverage >= 3) {
      push('tip', 'sprout', 'Hora de fazer seu dinheiro trabalhar',
        `Você tem reserva e sobra de caixa, mas ainda não registrou investimentos. Considere começar — mesmo um aporte mensal pequeno e constante cresce muito com o tempo pelos juros compostos.`);
    }

    return out;
  }

  return { analyze, generate, healthScore, scoreLabel, paidOf, lastNMonths, shiftMonth, projection, cashflowForecast, categoryComparison, alerts };
})();
