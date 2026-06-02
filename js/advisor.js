/* ============================================================
   ADVISOR — Consultor financeiro conversacional do Prospera.
   Conversa em PT-BR como uma pessoa, com base nos NÚMEROS REAIS
   do usuário (Insights + Finance). Funciona 100% offline.
   Opcionalmente conecta a IA (Gemini) com chave do próprio usuário
   para conversa livre — desligado por padrão.
   Depende de globais: Store, Insights, Finance, fmtBRL.
   ============================================================ */
const Advisor = (() => {

  /* ---------- histórico (vive no dataset do usuário) ---------- */
  function history() {
    const d = Store.data();
    if (!Array.isArray(d.advisorChat)) d.advisorChat = [];
    return d.advisorChat;
  }
  function push(role, text) { history().push({ role, text, ts: Date.now() }); Store.save(); }
  function clear() { Store.data().advisorChat = []; Store.save(); }

  const firstName = () => {
    const u = Store.currentUser && Store.currentUser();
    return u && u.name ? u.name.trim().split(/\s+/)[0] : '';
  };
  const money = v => fmtBRL(v);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- retrato financeiro a partir dos dados reais ---------- */
  function snapshot(mk) {
    const a = Insights.analyze(mk);
    let al = null, rv = null, nw = null, score = null;
    try { al = Finance.allocation(mk); } catch {}
    try { rv = Finance.reserve(mk); } catch {}
    try { nw = Finance.netWorth(); } catch {}
    try { score = Insights.healthScore(a); } catch {}
    return { a, al, rv, nw, score, mk };
  }

  /* ---------- intenções (palavras-chave PT-BR) ---------- */
  const INTENTS = [
    ['greeting',  /\b(oi|ol[áa]|opa|e a[íi]|eai|bom dia|boa tarde|boa noite|tudo bem|beleza|salve)\b/i],
    ['thanks',    /\b(obrigad|valeu|vlw|brigad|agrade)/i],
    ['who',       /\b(quem (é|e) voc|o que voc[êe] faz|como funciona|pra que (serve|voc)|voc[êe] (é|e) (uma )?ia|me ajuda com o qu)/i],
    ['status',    /\b(como (estou|tou|to|t[áa]|vou|anda)|minha situa|diagn[óo]stico|panorama|resumo|vis[ãa]o geral|como (est[ãa]o|t[ãa]o) (minhas|as) finan|me avalia|t[áa] (bom|ruim))\b/i],
    ['invest',    /\b(investi|aplicar|render|renda fixa|tesouro|cdb|lci|lca|a[çc][õo]es|bolsa|fii|fundo|cripto|bitcoin|d[óo]lar|onde (coloco|invisto|guardo|ponho)|fazer (o )?dinheiro (render|crescer))/i],
    ['reserve',   /\b(reserva|emerg[êe]nci|colch[ãa]o|fundo de emerg)/i],
    ['debt',      /\b(d[íi]vida|dever|devo|cart[ãa]o|juros|quitar|parcel|empr[ée]stimo|financiamento|rotativo|cheque especial|negativ)/i],
    ['budget',    /\b(or[çc]amento|gast(o|ar|ando|ei)|onde (gasto|gastei)|cortar|controlar gasto|50.?30.?20|categoria|despesa)/i],
    ['save',      /\b(poupar|guardar|economizar|juntar|sobra|sobrar|guardo quanto|quanto (devo|posso) guardar)/i],
    ['wealth',    /\b(patrim[ôo]ni|net worth|quanto eu tenho|minha riqueza|meus bens|balan[çc]o)/i],
    ['goal',      /\b(meta|objetivo|sonho|comprar|viaj|juntar (pra|para)|quero (comprar|juntar))/i],
    ['income',    /\b(ganhar mais|renda extra|aumentar (a )?renda|sal[áa]rio baixo|fonte de renda|segunda renda)/i],
  ];
  const detect = text => (INTENTS.find(([, re]) => re.test(text)) || ['fallback'])[0];

  const hi = () => { const n = firstName(); return n ? `${pick(['Oi', 'Olá', 'E aí'])}, ${n}` : pick(['Oi', 'Olá', 'E aí']); };
  const DISCLAIMER = 'Só um lembrete: eu sou o organizador financeiro do app, não um consultor de investimentos licenciado. O que trago são princípios gerais de educação financeira — a decisão final é sempre sua.';

  /* ============================================================
     MOTOR LOCAL — respostas conversacionais ancoradas nos dados
     ============================================================ */
  function reply(text, mk) {
    const s = snapshot(mk);
    const intent = detect(text);
    switch (intent) {

      case 'greeting':
        return `${hi()}. Sou seu consultor aqui no Prospera. Posso te ajudar a entender pra onde seu dinheiro está indo, montar sua reserva, sair das dívidas, organizar o orçamento ou pensar em como começar a investir.\n\nPor onde quer começar? Pode falar comigo de forma natural — tipo "como estão minhas finanças?" ou "será que dá pra investir?".`;

      case 'thanks':
        return pick([
          'Imagina, é pra isso que estou aqui. Quando quiser revisar qualquer parte das suas finanças, é só chamar.',
          `De nada${firstName() ? ', ' + firstName() : ''}. Vou estar por aqui sempre que precisar de uma segunda opinião.`
        ]);

      case 'who':
        return 'Eu sou o consultor do Prospera. Leio os seus lançamentos, dívidas, metas e patrimônio que estão salvos aqui no app e converso com você sobre eles — com números reais, não conselhos genéricos.\n\nConsigo te ajudar com: diagnóstico do mês, reserva de emergência, quitação de dívidas, orçamento (regra 50/30/20), quanto dá pra poupar e os primeiros passos para investir. O que você quer ver primeiro?';

      case 'status':      return statusReply(s);
      case 'invest':      return investReply(s);
      case 'reserve':     return reserveReply(s);
      case 'debt':        return debtReply(s);
      case 'budget':      return budgetReply(s);
      case 'save':        return saveReply(s);
      case 'wealth':      return wealthReply(s);
      case 'goal':        return goalReply(s);
      case 'income':      return incomeReply(s);

      default:
        return `${hi()}. Não tenho certeza se peguei exatamente o que você quis dizer, mas posso te ajudar com estes assuntos:\n\n· "Como estão minhas finanças?" — um diagnóstico do seu mês\n· "Tenho como investir?" — primeiros passos\n· "Como monto minha reserva?"\n· "Qual a melhor forma de quitar minhas dívidas?"\n· "Onde estou gastando demais?"\n\nÉ só me contar com suas palavras o que está pegando.`;
    }
  }

  /* ---- diagnóstico geral do mês ---- */
  function statusReply(s) {
    const { a, score } = s;
    if (a.txCount === 0) {
      return `${hi()}. Ainda não vejo lançamentos em ${monthLabel(s.mk)}, então não consigo avaliar sua situação de verdade.\n\nAssim que você registrar suas receitas e despesas (leva segundos na aba Lançamentos), eu consigo te dar um diagnóstico real: taxa de poupança, reserva, para onde o dinheiro foi e o que dá pra melhorar.`;
    }
    const lab = score ? Insights.scoreLabel(score).txt : '';
    const lines = [];
    lines.push(`${hi()}, aqui está o panorama de ${monthLabel(s.mk)}:`);
    lines.push('');
    lines.push(`· Saúde financeira: ${score}/100${lab ? ` (${lab})` : ''}`);
    lines.push(`· Entrou ${money(a.income)} e saiu ${money(a.expense)} — ${a.balance >= 0 ? `sobrou ${money(a.balance)}` : `faltou ${money(-a.balance)}`}.`);
    lines.push(`· Taxa de poupança: ${a.savingsRate.toFixed(0)}% ${a.savingsRate >= 20 ? '— acima dos 20% recomendados, excelente.' : a.savingsRate >= 0 ? '— a meta saudável é guardar uns 20%.' : '— você gastou mais do que ganhou neste mês.'}`);
    if (a.avgExpense > 0) lines.push(`· Reserva: cobre cerca de ${a.emergencyCoverage.toFixed(1)} mês(es) de custo (o ideal são 3 a 6).`);
    if (a.topCats && a.topCats[0]) lines.push(`· Maior gasto: ${a.topCats[0].name} (${money(a.topCats[0].value)}).`);
    if (a.totalDebt > 0) lines.push(`· Dívidas em aberto: ${money(a.totalDebt)}.`);
    lines.push('');
    // próxima ação prioritária
    let next;
    if (a.balance < 0) next = 'Sua prioridade número 1 agora é fechar o mês no azul. Quer que eu te ajude a achar onde cortar?';
    else if (a.emergencyCoverage < 3 && a.avgExpense > 0) next = 'Seu próximo passo mais importante é fortalecer a reserva de emergência. Quer um plano pra isso?';
    else if (a.totalDebt > 0) next = 'Com o mês no positivo, vale acelerar a quitação das dívidas. Posso montar a ordem de ataque pra você.';
    else next = 'Você está num bom momento pra fazer o dinheiro trabalhar. Quer conversar sobre começar a investir?';
    lines.push(next);
    return lines.join('\n');
  }

  /* ---- investimentos (educação + reserva primeiro) ---- */
  function investReply(s) {
    const { a, rv } = s;
    const reserveOk = rv ? rv.months >= 3 : a.emergencyCoverage >= 3;
    const lines = [];
    lines.push(`${hi()}. Adoro essa pergunta — investir é o que faz o dinheiro crescer enquanto você dorme. Mas tem uma ordem que protege você:`);
    lines.push('');
    if (a.totalDebt > 0 && a.debtToIncome > 0) {
      lines.push(`Antes de investir, olho pras suas dívidas: você tem ${money(a.totalDebt)} em aberto. Se os juros delas forem altos (cartão, cheque especial), quitar rende mais do que qualquer investimento — porque nenhum aplicativo paga o que um rotativo de cartão cobra. Priorize isso primeiro.`);
      lines.push('');
    }
    if (!reserveOk) {
      const falta = rv ? rv.missing : Math.max(0, a.emergencyTarget - a.accumulated);
      lines.push(`O segundo passo é a reserva de emergência. Hoje ela cobre ${(rv ? rv.months : a.emergencyCoverage).toFixed(1)} mês(es) e o ideal são 3 a 6. Faltam cerca de ${money(falta)}. Essa reserva fica em algo seguro e que dá pra sacar a qualquer hora (Tesouro Selic ou CDB de liquidez diária). Só depois dela cheia eu penso em investimentos de prazo mais longo.`);
    } else {
      lines.push(`Boa notícia: sua reserva já cobre ${(rv ? rv.months : a.emergencyCoverage).toFixed(1)} meses, então você já pode pensar em investir com mais tranquilidade.`);
      lines.push('');
      lines.push('Os princípios que costumo seguir: comece pelo simples e de baixo risco (renda fixa pública como Tesouro Direto costuma ser a porta de entrada), invista todo mês de forma automática mesmo que pouco, diversifique conforme for aprendendo, e nunca coloque em algo que você não entende — fuja de promessa de ganho fácil e rápido.');
    }
    const sobra = Math.max(0, a.balance);
    if (sobra > 0) { lines.push(''); lines.push(`Esse mês você teve ${money(sobra)} de sobra — é exatamente esse tipo de dinheiro que vira investimento de forma consistente.`); }
    lines.push('');
    lines.push(DISCLAIMER);
    return lines.join('\n');
  }

  /* ---- reserva de emergência ---- */
  function reserveReply(s) {
    const { a, rv } = s;
    if (a.avgExpense <= 0 && (!rv || rv.monthlyCost <= 0)) {
      return 'A reserva de emergência é o seu colchão pra imprevistos (perder a renda, uma emergência médica, o carro quebrar) — o ideal é ter de 3 a 6 meses das suas despesas guardados em algo seguro e de resgate rápido.\n\nPra eu calcular exatamente quanto você precisa, registre alguns gastos do mês. Aí te digo o valor-alvo e quanto guardar por mês.';
    }
    const months = rv ? rv.months : a.emergencyCoverage;
    const target = rv ? rv.target : a.emergencyTarget;
    const missing = rv ? rv.missing : Math.max(0, target - a.accumulated);
    const lines = [];
    if (months >= (rv ? rv.targetMonths : 6)) {
      lines.push(`${hi()}, sua reserva está sólida: cobre cerca de ${months.toFixed(1)} meses de custo. Isso é segurança de sobra.`);
      lines.push('');
      lines.push('Como ela já está no ponto, o dinheiro que você continuar guardando pode ir pra investimentos de maior rentabilidade, já que não precisa de tanta liquidez. Quer conversar sobre isso?');
    } else {
      lines.push(`${hi()}. Vamos montar sua reserva com calma.`);
      lines.push('');
      lines.push(`· Hoje ela cobre cerca de ${months.toFixed(1)} mês(es).`);
      lines.push(`· O alvo (${rv ? rv.targetMonths : 6} meses de custo) é ${money(target)}.`);
      lines.push(`· Faltam aproximadamente ${money(missing)}.`);
      if (rv && rv.monthlyToGoal12 > 0) lines.push(`· Guardando ${money(rv.monthlyToGoal12)} por mês, você fecha essa reserva em 1 ano.`);
      lines.push('');
      lines.push('Deixe essa reserva num lugar seguro e líquido — Tesouro Selic ou um CDB de liquidez diária de banco grande. O objetivo dela não é render muito, é estar lá quando você precisar. Quer que eu transforme isso numa meta aqui no app?');
    }
    return lines.join('\n');
  }

  /* ---- dívidas (estratégia + simulação real) ---- */
  function debtReply(s) {
    const { a } = s;
    if (!a.totalDebt || a.totalDebt <= 0) {
      return `${hi()}. Pelos seus dados, você não tem dívidas cadastradas — e isso é uma baita posição de força. Se tiver alguma por aí (cartão, financiamento), registre na aba Dívidas que eu monto a melhor ordem pra quitar e simulo quanto de juros você economiza.`;
    }
    const lines = [];
    lines.push(`${hi()}. Você tem ${money(a.totalDebt)} em dívidas. Vamos atacar isso de forma inteligente.`);
    lines.push('');
    lines.push('Existem duas estratégias clássicas:');
    lines.push('· Avalanche — paga primeiro a dívida de juros mais altos. É a que faz você gastar menos no total.');
    lines.push('· Bola de neve — quita primeiro a menor dívida. Rende menos no bolso, mas dá motivação com vitórias rápidas.');
    let sim = null;
    try { sim = Finance.simulatePayoff('avalanche', 0); } catch {}
    if (sim && !sim.empty && sim.feasible) {
      lines.push('');
      lines.push(`Simulando o método avalanche só com os pagamentos mínimos, você ficaria livre em ${sim.months} mês(es), pagando ${money(sim.totalInterest)} de juros no caminho.`);
      lines.push('Cada real extra por mês encurta muito esse prazo. Vá na aba Dívidas e mexa no "valor extra" da simulação pra ver a diferença.');
    } else if (sim && !sim.feasible) {
      lines.push('');
      lines.push('Atenção: pelos números atuais, os pagamentos não estão cobrindo nem os juros — o saldo cresce sozinho. Aqui a prioridade é renegociar os juros ou aumentar o quanto você paga por mês. Quer que eu te ajude a pensar em como liberar esse valor?');
    }
    lines.push('');
    lines.push('Minha regra de ouro: enquanto tiver dívida de juros alto, quitá-la rende mais do que investir.');
    return lines.join('\n');
  }

  /* ---- orçamento / 50-30-20 ---- */
  function budgetReply(s) {
    const { a, al } = s;
    if (a.expense <= 0) {
      return 'O orçamento é só dar um trabalho pra cada real: quanto vai pras necessidades, quanto pros desejos e quanto pro futuro. Um ponto de partida ótimo é a regra 50/30/20 — 50% necessidades, 30% desejos, 20% poupar/investir.\n\nRegistre seus gastos do mês que eu te mostro como está sua divisão hoje e onde dá pra ajustar.';
    }
    const lines = [];
    lines.push(`${hi()}. Vamos ver pra onde seu dinheiro foi em ${monthLabel(s.mk)}.`);
    if (a.topCats && a.topCats.length) {
      lines.push('');
      lines.push('Seus maiores gastos:');
      a.topCats.slice(0, 3).forEach((c, i) => {
        const share = a.expense > 0 ? (c.value / a.expense * 100).toFixed(0) : 0;
        lines.push(`${i + 1}. ${c.name} — ${money(c.value)} (${share}% das despesas)`);
      });
    }
    if (al && al.hasIncome) {
      lines.push('');
      lines.push(`Comparado ao método ${al.methodLabel.replace(/^.*·\s*/, '')}:`);
      al.buckets.forEach(b => {
        const sit = b.over ? (b.key === 'save' ? 'abaixo do ideal' : 'acima do ideal') : 'dentro do plano';
        lines.push(`· ${b.label}: ${money(b.actual)} de ${money(b.target)} previstos — ${sit}.`);
      });
    }
    lines.push('');
    lines.push('A ideia não é se privar de tudo, é cortar o que não te faz falta de verdade. Quer que eu sugira onde dá pra apertar primeiro?');
    return lines.join('\n');
  }

  /* ---- poupar / guardar ---- */
  function saveReply(s) {
    const { a } = s;
    const lines = [`${hi()}.`];
    if (a.refIncome > 0) {
      const ideal = a.refIncome * 0.2;
      lines.push(`Com uma renda de referência de ${money(a.refIncome)}, uma meta saudável é guardar uns 20% — cerca de ${money(ideal)} por mês.`);
      lines.push('');
      if (a.savingsRate >= 20) lines.push(`E você já está guardando ${a.savingsRate.toFixed(0)}% — parabéns, isso é muito bom. O foco agora vira pra onde alocar esse dinheiro.`);
      else if (a.savingsRate > 0) lines.push(`Este mês você guardou ${a.savingsRate.toFixed(0)}%. Pra chegar aos 20%, dá pra atacar dos dois lados: cortar um pouco dos desejos e, se possível, buscar uma renda extra.`);
      else lines.push('Este mês não sobrou nada — então o primeiro passo não é guardar mais, é fechar o mês no positivo. Vamos olhar seus gastos juntos?');
    } else {
      lines.push('Pra eu calcular quanto faz sentido você guardar, me diga sua renda mensal (dá pra cadastrar em Ajustes) ou registre suas receitas do mês.');
    }
    lines.push('');
    lines.push('Um truque que funciona muito: trate a poupança como uma conta fixa. Assim que a renda cai, separe o valor de guardar ANTES de gastar o resto — pague a si mesmo primeiro.');
    return lines.join('\n');
  }

  /* ---- patrimônio líquido ---- */
  function wealthReply(s) {
    const { nw } = s;
    if (!nw || !nw.hasData) {
      return 'Patrimônio líquido é tudo o que você tem (dinheiro, investimentos, bens) menos tudo o que você deve. É o melhor termômetro de longo prazo da sua vida financeira — mais até do que o salário.\n\nCadastre seus ativos na aba Patrimônio (e suas dívidas em Dívidas) que eu te mostro esse número e como ele evolui.';
    }
    const lines = [];
    lines.push(`${hi()}. Seu patrimônio líquido hoje é ${money(nw.total)}.`);
    lines.push('');
    lines.push(`Isso vem de ${money(nw.totalAssets)} em bens e dinheiro, menos ${money(nw.debts)} em dívidas.`);
    if (nw.breakdown && nw.breakdown.length) {
      lines.push('');
      lines.push('Composição dos seus ativos:');
      nw.breakdown.forEach(b => lines.push(`· ${b.label}: ${money(b.value)}`));
    }
    lines.push('');
    lines.push(nw.total >= 0
      ? 'O jogo aqui é simples e poderoso: a cada mês, fazer esse número subir um pouco — guardando mais, investindo e reduzindo dívidas.'
      : 'Seu patrimônio está negativo, ou seja, você deve mais do que tem. Não se assuste: o caminho é reduzir as dívidas de forma consistente até virar o jogo. Quer montar esse plano?');
    return lines.join('\n');
  }

  /* ---- metas ---- */
  function goalReply(s) {
    const lines = [`${hi()}. Adoro trabalhar com metas — elas transformam "um dia eu quero" em um plano com data.`];
    lines.push('');
    lines.push('A receita é: defina o valor e o prazo, divida um pelo outro e você tem quanto guardar por mês. Exemplo: R$ 6.000 em 12 meses = R$ 500/mês.');
    const sobra = Math.max(0, s.a.balance);
    if (sobra > 0) lines.push(`\nVocê teve ${money(sobra)} de sobra este mês — esse dinheiro pode virar o combustível da sua meta.`);
    lines.push('\nCadastre seu objetivo na aba Metas que o app acompanha o progresso e eu fico de olho no ritmo com você. O que você quer conquistar?');
    return lines.join('\n');
  }

  /* ---- aumentar renda ---- */
  function incomeReply(s) {
    return `${hi()}. Cortar gastos tem um limite; aumentar a renda, não. Vale pensar em três frentes: valorizar o que você já faz (uma conversa por aumento, uma certificação que destrava um cargo melhor), uma renda extra usando uma habilidade que você já tem (freelas, aulas, vendas), e no longo prazo deixar o dinheiro investido também virar uma fonte de renda.\n\nQualquer renda nova que aparecer, registre aqui no app — assim a gente vê o impacto real dela no seu mês e direciona a maior parte pra reserva, dívidas ou investimento, conforme a sua prioridade do momento.`;
  }

  /* ---- sugestões iniciais (chips) ---- */
  function suggestions() {
    const d = Store.data();
    const out = ['Como estão minhas finanças?'];
    if ((d.debts || []).some(x => (x.total || 0) - Insights.paidOf(x) > 0)) out.push('Qual a melhor forma de quitar minhas dívidas?');
    out.push('Tenho como começar a investir?');
    out.push('Como monto minha reserva de emergência?');
    out.push('Onde estou gastando demais?');
    return out.slice(0, 5);
  }

  /* ============================================================
     IA OPCIONAL (Gemini) — chave do próprio usuário, opt-in
     ============================================================ */
  const hasAI = () => !!((Store.data().settings || {}).geminiKey || '').trim();

  async function askAI(mk) {
    const key = ((Store.data().settings || {}).geminiKey || '').trim();
    if (!key) throw new Error('sem-chave');
    const s = snapshot(mk);
    const a = s.a;
    const ctx = [
      `Mês de referência: ${monthLabel(mk)}.`,
      `Renda de referência: ${money(a.refIncome)}. Receitas no mês: ${money(a.income)}. Despesas: ${money(a.expense)}. Saldo: ${money(a.balance)}.`,
      `Taxa de poupança: ${a.savingsRate.toFixed(0)}%. Reserva cobre ${a.emergencyCoverage.toFixed(1)} meses (alvo 3 a 6).`,
      `Dívidas em aberto: ${money(a.totalDebt)}. Patrimônio líquido: ${s.nw ? money(s.nw.total) : 'não informado'}. Saúde financeira: ${s.score ?? '—'}/100.`,
      a.topCats && a.topCats[0] ? `Maiores gastos: ${a.topCats.slice(0, 3).map(c => `${c.name} ${money(c.value)}`).join(', ')}.` : ''
    ].filter(Boolean).join(' ');

    const sys = `Você é o consultor financeiro pessoal do app brasileiro Prospera. Fale em português do Brasil, de forma calorosa, direta e conversacional, como uma pessoa real — sem jargão, respostas curtas e práticas. Use SEMPRE os números reais do usuário abaixo para personalizar. Princípios: priorizar quitar dívidas de juros altos, montar reserva de 3 a 6 meses antes de investir, regra 50/30/20, pagar a si mesmo primeiro. Você educa e organiza; NÃO recomende ativos específicos para comprar nem prometa retornos. Se perguntarem sobre investimento específico, oriente em princípios gerais e lembre, de forma leve, que você não é um consultor de investimentos licenciado. Dados do usuário: ${ctx}`;

    const hist = history().slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: hist.length ? hist : [{ role: 'user', parts: [{ text: 'Olá' }] }],
      generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 800 }
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('falha-api');
    const j = await res.json();
    const txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
      ? j.candidates[0].content.parts.map(p => p.text || '').join('').trim() : '';
    if (!txt) throw new Error('resposta-vazia');
    return txt;
  }

  function setKey(k) { Store.setSettings({ geminiKey: (k || '').trim() }); }

  return { history, push, clear, reply, suggestions, hasAI, askAI, setKey, snapshot };
})();
