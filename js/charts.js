/* ============================================================
   CHARTS — gráficos SVG sem dependências externas
   ============================================================ */
const Charts = (() => {
  const PALETTE = ['#ff3b46', '#ff7b81', '#b3131f', '#caa45c', '#9aa0aa', '#6f7682', '#e7e9ee', '#7f3035', '#cfd2d8', '#4a4a52'];

  /* Donut chart -> retorna HTML (svg + legenda) */
  function donut(items, { size = 168, thickness = 26 } = {}) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const r = (size - thickness) / 2;
    const cx = size / 2, cy = size / 2;
    const circ = 2 * Math.PI * r;
    if (total <= 0) {
      return `<div class="donut-wrap"><div class="empty" style="padding:24px"><span class="em">${ICON('pie')}</span>Sem dados neste período</div></div>`;
    }
    let offset = 0;
    const segs = items.map((it, idx) => {
      const frac = it.value / total;
      const len = frac * circ;
      const dash = `${len} ${circ - len}`;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${it.color || PALETTE[idx % PALETTE.length]}" stroke-width="${thickness}"
        stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"></circle>`;
      offset += len;
      return seg;
    }).join('');

    const legend = items.map((it, idx) => {
      const pct = ((it.value / total) * 100).toFixed(0);
      return `<div class="legend-item">
        <span class="legend-dot" style="background:${it.color || PALETTE[idx % PALETTE.length]}"></span>
        <span>${it.label}</span>
        <span class="pct">${pct}% · ${fmtBRL(it.value)}</span>
      </div>`;
    }).join('');

    return `<div class="donut-wrap">
      <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-2)" stroke-width="${thickness}"></circle>
          ${segs}
        </svg>
        <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
          <div><div style="font-size:11px;color:var(--muted)">Total</div>
          <div style="font-size:18px;font-weight:800">${fmtBRL(total)}</div></div>
        </div>
      </div>
      <div class="legend" style="flex:1;min-width:160px">${legend}</div>
    </div>`;
  }

  /* Bar chart agrupado (receita vs despesa por mês) */
  function bars(groups, { height = 200 } = {}) {
    if (!groups.length) return `<div class="empty"><span class="em">${ICON('bars')}</span>Sem histórico ainda</div>`;
    const max = Math.max(1, ...groups.flatMap(g => [g.income, g.expense]));
    const barW = 14, gap = 8, groupGap = 26;
    const groupW = barW * 2 + gap;
    const W = groups.length * (groupW + groupGap) + 20;
    const H = height, pad = 24;
    const scale = v => (v / max) * (H - pad * 2);

    const content = groups.map((g, i) => {
      const x = 10 + i * (groupW + groupGap);
      const incH = scale(g.income), expH = scale(g.expense);
      return `
        <rect x="${x}" y="${H - pad - incH}" width="${barW}" height="${incH}" rx="4" fill="var(--green)"></rect>
        <rect x="${x + barW + gap}" y="${H - pad - expH}" width="${barW}" height="${expH}" rx="4" fill="var(--red)"></rect>
        <text x="${x + groupW / 2}" y="${H - 7}" text-anchor="middle" font-size="10" fill="var(--muted-2)">${g.label}</text>
      `;
    }).join('');

    return `<div style="overflow-x:auto">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="min-width:100%">
        <line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="var(--line)" stroke-width="1"></line>
        ${content}
      </svg>
      <div class="row" style="gap:18px;margin-top:10px;font-size:12px">
        <span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Receitas</span>
        <span class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>Despesas</span>
      </div>
    </div>`;
  }

  /* Sparkline (linha de saldo acumulado) */
  function line(values, { height = 70, width = 240 } = {}) {
    if (values.length < 2) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (values.length - 1);
    const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 10) - 5).toFixed(1)}`);
    const last = values[values.length - 1], first = values[0];
    const color = last >= first ? 'var(--green)' : 'var(--red)';
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%">
      <polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"></polyline>
    </svg>`;
  }

  /* Área de fluxo de caixa projetado (com linha-base no zero) */
  function forecast(series, { height = 104, width = 560 } = {}) {
    if (!series || series.length < 2) return '';
    const vals = series.map(p => p.balance);
    const min = Math.min(...vals, 0), max = Math.max(...vals, 0);
    const range = max - min || 1;
    const stepX = width / (series.length - 1);
    const y = v => +(height - 10 - ((v - min) / range) * (height - 20)).toFixed(1);
    const pts = vals.map((v, i) => `${(i * stepX).toFixed(1)},${y(v)}`);
    const zeroY = y(0);
    const neg = min < 0;
    const color = neg ? 'var(--red)' : 'var(--green)';
    const gid = 'fc' + Math.random().toString(36).slice(2, 8);
    // ponto mais baixo
    let li = 0; vals.forEach((v, i) => { if (v < vals[li]) li = i; });
    const lx = (li * stepX).toFixed(1), ly = y(vals[li]);
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.20"></stop>
        <stop offset="1" stop-color="${color}" stop-opacity="0"></stop>
      </linearGradient></defs>
      <polygon fill="url(#${gid})" points="0,${height} ${pts.join(' ')} ${width},${height}"></polygon>
      <line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="var(--line)" stroke-width="1" stroke-dasharray="5 5"></line>
      <polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"></polyline>
      <circle cx="${lx}" cy="${ly}" r="3.5" fill="${color}"></circle>
    </svg>`;
  }

  return { donut, bars, line, forecast, PALETTE };
})();
