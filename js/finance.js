/* ============================================================
   FINANCE — o "cérebro" de organização financeira do Prospera.
   Implementa, de forma determinística e baseada nos dados reais,
   os métodos consolidados de organização financeira pessoal:
     · Alocação por baldes (50/30/20 e variações)
     · Reserva de emergência (runway em meses)
     · Simulador de quitação de dívidas (Avalanche / Bola de Neve)
     · Patrimônio líquido (ativos − passivos)
     · As 3 funções do dinheiro (sobreviver / proteger / crescer)
   Depende de globais já carregados: Store, Insights, CATEGORIES, fmtBRL.
   ============================================================ */
const Finance = (() => {

  /* ---- mapeamento categoria → balde do orçamento ---- */
  const NEEDS = ['moradia', 'alimentacao', 'transporte', 'saude', 'contas', 'educacao', 'dividas'];
  const WANTS = ['lazer', 'compras', 'outros'];
  const SAVE  = ['investimento'];

  /* ---- as 3 funções do dinheiro (estudo: sobrevivência / proteção / crescimento) ---- */
  const FUNCTIONS = {
    survive: { label: 'Sobreviver', icon: 'home',   cats: ['moradia', 'alimentacao', 'transporte', 'saude', 'contas'] },
    protect: { label: 'Proteger',   icon: 'shield', cats: ['dividas'] },               // quitar dívida = proteger
    grow:    { label: 'Crescer',    icon: 'sprout', cats: ['investimento', 'educacao'] }
  };

  /* ---- métodos de alocação (presets sobre o modelo de 3 baldes) ---- */
  const METHODS = {
    '50-30-20': { label: 'Equilibrado · 50/30/20', needs: 50, wants: 30, save: 20,
      hint: 'O clássico para quem busca simplicidade: metade nas necessidades, 30% no que dá prazer, 20% para o futuro.' },
    '60-20-20': { label: 'Enxuto · 60/20/20', needs: 60, wants: 20, save: 20,
      hint: 'Para quem tem custos fixos altos (moradia cara, filhos) e ainda quer guardar 20%.' },
    '40-30-30': { label: 'Acelerado · 40/30/30', needs: 40, wants: 30, save: 30,
      hint: 'Para acelerar patrimônio: 30% da renda vira reserva e investimento todo mês.' },
    '70-20-10': { label: 'Aperto · 70/20/10', needs: 70, wants: 20, save: 10,
      hint: 'Realidade apertada: foco em cobrir o essencial e ainda guardar 10%.' }
  };
  const defaultMethod = () => (Store.data().settings || {}).budgetMethod || '50-30-20';

  /* ============================================================
     ALOCAÇÃO — compara os 3 baldes com a meta do método escolhido
     ============================================================ */
  function allocation(monthKeyStr) {
    const a = Insights.analyze(monthKeyStr);
    const m = METHODS[defaultMethod()] || METHODS['50-30-20'];
    const income = a.refIncome;

    const sumCats = ids => ids.reduce((s, id) => s + (a.byCat[id] || 0), 0);
    const needsActual = sumCats(NEEDS);
    const wantsActual = sumCats(WANTS);
    const investedActual = sumCats(SAVE);
    // "guardado" = o que foi investido + a sobra de caixa do mês (dinheiro que ficou)
    const leftover = Math.max(0, a.income - a.expense);
    const saveActual = investedActual + leftover;

    const mk = (key, label, icon, pct, actual) => {
      const target = income * (pct / 100);
      return {
        key, label, icon, targetPct: pct, target, actual,
        pct: target > 0 ? (actual / target) * 100 : 0,
        diff: actual - target,
        over: key !== 'save' ? actual > target * 1.02 : actual < target * 0.98
      };
    };

    const buckets = [
      mk('needs', 'Necessidades', 'home',   m.needs, needsActual),
      mk('wants', 'Desejos',      'leisure', m.wants, wantsActual),
      mk('save',  'Poupar & investir', 'vault', m.save, saveActual)
    ];

    return {
      method: defaultMethod(), methodLabel: m.label, methodHint: m.hint,
      income, buckets, saveActual, investedActual, leftover,
      saveActualPct: income > 0 ? (saveActual / income) * 100 : 0,
      hasIncome: income > 0
    };
  }

  /* ============================================================
     AS 3 FUNÇÕES DO DINHEIRO — para onde o dinheiro foi servir
     ============================================================ */
  function moneyFunctions(monthKeyStr) {
    const a = Insights.analyze(monthKeyStr);
    const total = a.expense || 1;
    return Object.entries(FUNCTIONS).map(([key, f]) => {
      const value = f.cats.reduce((s, id) => s + (a.byCat[id] || 0), 0);
      return { key, label: f.label, icon: f.icon, value, pct: (value / total) * 100 };
    });
  }

  /* ============================================================
     RESERVA DE EMERGÊNCIA — runway em meses de custo
     ============================================================ */
  function reserve(monthKeyStr) {
    const a = Insights.analyze(monthKeyStr);
    const s = Store.data().settings || {};
    const targetMonths = s.emergencyMonths || 6;
    // reserva atual: maior estimativa entre saldo acumulado e metas marcadas como reserva + ativos líquidos
    const liquidAssets = (Store.data().assets || [])
      .filter(x => x.kind === 'liquid').reduce((sum, x) => sum + (x.value || 0), 0);
    const reserveGoals = (Store.data().goals || [])
      .filter(g => g.kind === 'emergency').reduce((sum, g) => sum + (g.saved || 0), 0);
    const current = Math.max(a.accumulated, liquidAssets + reserveGoals);
    const monthlyCost = a.avgExpense || a.expense || 0;
    const target = monthlyCost * targetMonths;
    const months = monthlyCost > 0 ? current / monthlyCost : 0;
    const missing = Math.max(0, target - current);
    return {
      current, target, targetMonths, monthlyCost, months,
      pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
      missing,
      // quanto guardar/mês para fechar a reserva em 12 meses
      monthlyToGoal12: missing / 12,
      status: months >= targetMonths ? 'good' : months >= 3 ? 'warn' : months >= 1 ? 'warn' : 'bad'
    };
  }

  /* ============================================================
     PATRIMÔNIO LÍQUIDO — Balanço Patrimonial (ativos − passivos)
     ============================================================ */
  function netWorth() {
    const d = Store.data();
    const assets = d.assets || [];
    const byKind = k => assets.filter(x => x.kind === k).reduce((s, x) => s + (x.value || 0), 0);
    const liquid = byKind('liquid');
    const invested = byKind('invest');
    const property = byKind('property');
    const other = byKind('other');
    const goalsSaved = (d.goals || []).reduce((s, g) => s + (g.saved || 0), 0);
    const totalAssets = liquid + invested + property + other + goalsSaved;
    const debts = (d.debts || []).reduce((s, x) => s + Math.max(0, x.total - Insights.paidOf(x)), 0);
    const total = totalAssets - debts;
    return {
      liquid, invested, property, other, goalsSaved,
      totalAssets, debts, total,
      breakdown: [
        { label: 'Liquidez (conta, reserva)', icon: 'wallet', value: liquid },
        { label: 'Investimentos',             icon: 'invest', value: invested },
        { label: 'Bens & patrimônio',         icon: 'home',   value: property },
        { label: 'Guardado em metas',          icon: 'target', value: goalsSaved },
        { label: 'Outros ativos',             icon: 'box',    value: other }
      ].filter(b => b.value > 0),
      hasData: assets.length > 0 || goalsSaved > 0 || debts > 0
    };
  }

  /* ============================================================
     SIMULADOR DE QUITAÇÃO DE DÍVIDAS — Avalanche vs Bola de Neve
     Simula mês a mês com juros compostos sobre o saldo devedor.
     extra = valor adicional/mês além dos mínimos.
     ============================================================ */
  function simulatePayoff(method, extra) {
    const open = (Store.data().debts || [])
      .map(d => ({
        name: d.name,
        balance: Math.max(0, d.total - Insights.paidOf(d)),
        rate: (d.interestRate || 0) / 100,        // mensal, fração
        min: d.minPayment || 0
      }))
      .filter(d => d.balance > 0);

    if (!open.length) return { feasible: true, empty: true };

    const order = arr => method === 'snowball'
      ? [...arr].sort((a, b) => a.balance - b.balance)        // menor saldo primeiro
      : [...arr].sort((a, b) => b.rate - a.rate);             // maior juros primeiro

    const run = (extraBudget) => {
      const debts = open.map(d => ({ ...d }));
      let month = 0, totalInterest = 0;
      const clearedAt = {};
      const CAP = 600;
      while (debts.some(d => d.balance > 0.01) && month < CAP) {
        month++;
        // 1) juros do mês
        debts.forEach(d => { if (d.balance > 0) { const i = d.balance * d.rate; d.balance += i; totalInterest += i; } });
        // 2) orçamento do mês = soma dos mínimos das dívidas ainda abertas + extra
        let budget = debts.filter(d => d.balance > 0).reduce((s, d) => s + d.min, 0) + extraBudget;
        // 3) paga mínimos
        debts.forEach(d => {
          if (d.balance <= 0) return;
          const pay = Math.min(d.balance, d.min);
          d.balance -= pay; budget -= pay;
        });
        // 4) sobra (extra + mínimos liberados) vai para a dívida-alvo da estratégia
        for (const d of order(debts)) {
          if (budget <= 0) break;
          if (d.balance <= 0) continue;
          const pay = Math.min(d.balance, budget);
          d.balance -= pay; budget -= pay;
        }
        // registra quitações
        debts.forEach(d => { if (d.balance <= 0.01 && !clearedAt[d.name]) clearedAt[d.name] = month; });
      }
      return { month, totalInterest, feasible: month < CAP, clearedAt };
    };

    const plan = run(extra);
    const baseline = run(0); // só os mínimos
    // se nem com o mínimo a dívida quita (juros > pagamento), o "economizado" é
    // matematicamente infinito — não dá pra exibir um número; sinalizamos isso.
    const baselineFeasible = baseline.feasible;
    const interestSaved = baselineFeasible ? Math.max(0, baseline.totalInterest - plan.totalInterest) : 0;
    const monthsSaved = baselineFeasible ? Math.max(0, baseline.month - plan.month) : 0;

    const payoffDate = (() => {
      const dt = new Date(); dt.setMonth(dt.getMonth() + plan.month);
      return monthLabel(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    })();

    return {
      feasible: plan.feasible, empty: false,
      months: plan.month, payoffDate,
      totalInterest: plan.totalInterest,
      baselineMonths: baseline.month, baselineInterest: baseline.totalInterest,
      baselineFeasible, interestSaved, monthsSaved,
      order: order(open.map(d => ({ ...d }))).map(d => ({ name: d.name, clearedAt: plan.clearedAt[d.name] || null })),
      totalMinimum: open.reduce((s, d) => s + d.min, 0),
      accruingTooFast: !plan.feasible
    };
  }

  /* ============================================================
     INDEPENDÊNCIA FINANCEIRA — juros compostos a favor
     Projeta o patrimônio investido crescendo mês a mês com o
     ganho REAL (acima da inflação) mais os aportes mensais, até
     alcançar o "número da liberdade": o patrimônio que sustenta
     seu custo de vida pela regra dos 4% (retirada segura anual).
     Tudo offline, baseado nos indexadores que o usuário informou.
     ============================================================ */
  const SWR = 0.04;                 // safe withdrawal rate — regra dos 4%
  const FI_HORIZON_YEARS = 60;      // teto da simulação

  function freedomPlan(monthKeyStr, opts = {}) {
    const a = Insights.analyze(monthKeyStr);
    const r = Store.rates();
    const nw = netWorth();

    // ganho real anual: quanto o dinheiro cresce de verdade, já descontada a inflação
    const realAnnual = (1 + r.cdi / 100) / (1 + r.ipca / 100) - 1;
    const monthlyReturn = Math.pow(1 + realAnnual, 1 / 12) - 1;

    // custo de vida de referência: média dos últimos meses (mais estável que um mês só)
    const monthlyExpense = a.avgExpense || a.expense || 0;
    const annualExpense = monthlyExpense * 12;
    const fiNumber = annualExpense / SWR;   // = 25× o custo anual

    // capital de partida = o que já está investido / líquido / guardado em metas
    const portfolio = nw.liquid + nw.invested + nw.goalsSaved;
    const startCapital = Math.max(0, opts.startCapital != null ? opts.startCapital : portfolio);

    // aporte padrão = o que sobra/é guardado por mês hoje (arredondado pra um número limpo)
    const rawDefault = Math.max(0, allocation(monthKeyStr).saveActual);
    const defaultContribution = Math.round(rawDefault / 50) * 50;
    const contribution = Math.max(0, opts.contribution != null ? opts.contribution : defaultContribution);

    const hasData = monthlyExpense > 0;

    // simulação mês a mês
    const monthsCap = FI_HORIZON_YEARS * 12;
    let capital = startCapital;
    let contributedTotal = startCapital;   // principal de fato aportado (base do "quanto é juro")
    let reachedMonths = (startCapital >= fiNumber && fiNumber > 0) ? 0 : null;
    const raw = [{ month: 0, capital, contributed: contributedTotal }];

    if (reachedMonths === null) {
      for (let month = 1; month <= monthsCap; month++) {
        capital = capital * (1 + monthlyReturn) + contribution;
        contributedTotal += contribution;
        raw.push({ month, capital, contributed: contributedTotal });
        if (capital >= fiNumber && fiNumber > 0) { reachedMonths = month; break; }
      }
    }

    const feasible = reachedMonths !== null;
    // série pra o gráfico: um ponto por ano + o ponto final (cruzamento)
    const series = raw.filter((p, i) => p.month % 12 === 0 || i === raw.length - 1)
      .map(p => ({
        month: p.month,
        year: +(p.month / 12).toFixed(2),
        capital: p.capital,
        contributed: p.contributed
      }));

    const last = raw[raw.length - 1];
    const finalCapital = last.capital;
    const totalContributed = last.contributed;
    const interestEarned = Math.max(0, finalCapital - totalContributed);

    return {
      hasData,
      fiNumber, monthlyExpense, annualExpense, swr: SWR,
      realAnnualPct: realAnnual * 100,
      startCapital, contribution, defaultContribution,
      feasible,
      reachedMonths,
      reachedYears: reachedMonths != null ? reachedMonths / 12 : null,
      series,
      finalCapital, totalContributed, interestEarned,
      progressPct: fiNumber > 0 ? Math.min(100, (startCapital / fiNumber) * 100) : 0,
      incomeRef: a.refIncome
    };
  }

  return {
    METHODS, FUNCTIONS, NEEDS, WANTS, SAVE, defaultMethod,
    allocation, moneyFunctions, reserve, netWorth, simulatePayoff, freedomPlan
  };
})();
