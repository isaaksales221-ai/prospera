/* ============================================================
   ICONS — conjunto SVG próprio (traço fino, futurista).
   Todos herdam a cor via currentColor. ICON(nome) -> <svg>.
   ============================================================ */
const ICONS = {
  /* navegação / chrome */
  dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 8h6V4h-6zM4 20h6v-4H4z"/>',
  transactions: '<path d="M5 9h13l-3.2-3.2"/><path d="M19 15H6l3.2 3.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/>',
  debt: '<path d="M4 8l5.5 5.5 3-3L20 18"/><path d="M20 13.5V18h-4.5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.4z"/>',
  bars: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V6M17 20v-9"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  moon: '<path d="M20 14.2A8 8 0 1 1 9.8 4 6.4 6.4 0 0 0 20 14.2z"/>',
  search: '<circle cx="11" cy="11" r="6.2"/><path d="M20 20l-3.6-3.6"/>',
  edit: '<path d="M4 20.5l1-4L16 5.5l3 3L8 19.5z"/><path d="M14 7.5l3 3"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="1.8"/><path d="M7 14h10v6H7z"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 5 4.5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9M7.5 13l4.5-5 4.5 5"/><path d="M5 4h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUp: '<path d="M12 19V6M6 12l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v13M6 12l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  warning: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  user: '<circle cx="12" cy="8.2" r="3.8"/><path d="M4.5 20c1.3-3.8 4.6-5.4 7.5-5.4s6.2 1.6 7.5 5.4"/>',
  users: '<circle cx="9" cy="8.4" r="3.2"/><path d="M3 19.5c.9-3 3.4-4.4 6-4.4s5.1 1.4 6 4.4"/><path d="M16.2 5.4a3.2 3.2 0 0 1 0 6M21 19.5c-.6-1.9-1.8-3.1-3.3-3.8"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2.6"/><path d="M3.5 10h17"/><circle cx="16.4" cy="14.5" r="1.2" fill="currentColor" stroke="none"/>',
  vault: '<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="12" cy="12" r="3.6"/><path d="M12 8.4V6.8M15.6 12h1.6M6.8 12h-1M12 15.6v1.6"/>',
  pulse: '<path d="M3 12h4l2.2-5.5L13 17l2-5h6"/>',
  radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
  repeat: '<path d="M4 9h12.5l-3-3M20 15H7.5l3 3"/>',
  pie: '<circle cx="12" cy="12" r="8"/><path d="M12 12V4M12 12l6 5.2"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  /* categorias — despesa */
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.6V20h13V9.6"/><path d="M10 20v-5h4v5"/>',
  food: '<path d="M6.5 3v6.5a2 2 0 0 0 4 0V3M8.5 9.5V21"/><path d="M16.5 3c-1.4 0-2.4 1.9-2.4 4.8s.9 3.7 2.4 3.7V21"/>',
  car: '<path d="M4 13l1.6-4.6A2.2 2.2 0 0 1 7.7 7h8.6a2.2 2.2 0 0 1 2.1 1.4L20 13M4 13h16v4H4z"/><circle cx="7.5" cy="17" r="1.3"/><circle cx="16.5" cy="17" r="1.3"/>',
  health: '<rect x="4.5" y="4.5" width="15" height="15" rx="4.2"/><path d="M12 8.5v7M8.5 12h7"/>',
  education: '<path d="M3 9l9-3.8L21 9l-9 3.8z"/><path d="M7 11v4.2c0 1.5 2.4 2.6 5 2.6s5-1.1 5-2.6V11"/>',
  leisure: '<path d="M12 4l2.2 4.9 5.3.5-4 3.6 1.2 5.2-4.7-2.8-4.7 2.8 1.2-5.2-4-3.6 5.3-.5z"/>',
  shopping: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  bills: '<path d="M6 3h9l3 3v15l-2.4-1.4L13 21l-2.5-1.4L8 21l-2-1.4V3z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  invest: '<path d="M4 16l5-5 3 3 8-8"/><path d="M16 6h4v4"/>',
  box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
  /* categorias — receita */
  briefcase: '<rect x="3.5" y="7" width="17" height="12" rx="2.2"/><path d="M8.5 7V5.6A1.6 1.6 0 0 1 10 4h4a1.6 1.6 0 0 1 1.6 1.6V7"/><path d="M3.5 12h17"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.8"/><path d="M2.5 19.5h19"/><path d="M9.6 9 8 11l1.6 2M14.4 9 16 11l-1.6 2"/>',
  gift: '<rect x="4" y="9.5" width="16" height="10.5" rx="1.6"/><path d="M4 13h16M12 9.5V20"/><path d="M12 9.5C9.5 9.5 7.6 8.6 7.6 7.1S9.8 4.6 12 9.5zM12 9.5c2.5 0 4.4-.9 4.4-2.4S14.2 4.6 12 9.5z"/>',
  /* extras (insights/dívidas) */
  shield: '<path d="M12 3.5l7 2.5v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/>',
  scale: '<path d="M12 4v16M6 20h12"/><path d="M12 6 5 9l2.5 4.5a3 3 0 0 1-5 0L5 9M12 6l7 3-2.5 4.5a3 3 0 0 0 5 0L19 9"/>',
  calculator: '<rect x="5" y="3.5" width="14" height="17" rx="2.2"/><path d="M8 7.5h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5v.01"/>',
  sprout: '<path d="M12 20v-7"/><path d="M12 13c0-2.8-2.2-5-5-5 0 2.8 2.2 5 5 5zM12 13c0-3 2.4-5.4 5.4-5.4 0 3-2.4 5.4-5.4 5.4z"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2 3 2 3H6"/>',
  layers: '<path d="M12 3.5 21 8l-9 4.5L3 8z"/><path d="M3 12l9 4.5L21 12M3 16l9 4.5L21 16"/>',
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5M12 6.5l-2.5-2M12 6.5l2.5-2M12 17.5l-2.5 2M12 17.5l2.5 2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  chat: '<path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z"/><path d="M8 10h8M8 13h5"/>',
  send: '<path d="M5 12 20 5l-4.5 15-3.5-6z"/><path d="M11.5 14 20 5"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M8 11.5 6 13.5a3.2 3.2 0 0 0 4.5 4.5l2-2"/><path d="M16 12.5l2-2A3.2 3.2 0 0 0 13.5 6l-2 2"/>',
  bank: '<path d="M4 10h16M5 10 12 4l7 6M6 10v7M10 10v7M14 10v7M18 10v7M3.5 20h17"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
};

function ICON(name, cls) {
  const p = ICONS[name] || ICONS.box;
  return `<svg class="ic-svg${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
