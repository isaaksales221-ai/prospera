#!/usr/bin/env node
/* ============================================================
   Gerador de convites do Prospera (linha de comando)
   ------------------------------------------------------------
   Reproduz EXATAMENTE o algoritmo de js/store.js para que os
   códigos gerados aqui sejam aceitos pelo app em qualquer
   dispositivo (o app valida sozinho, sem servidor).

   Uso:
     node tools/invite.js            # convite de 24h (padrão)
     node tools/invite.js 48         # convite de 48h
   ============================================================ */
const crypto = require('crypto');

// DEVE ser idêntico ao INVITE_SECRET de js/store.js.
const INVITE_SECRET = 'prospera-convite::a93f7c21e8b54d06::2026';

function generateInvite(hours = 24) {
  const payload = (Date.now() + hours * 3600000).toString(36); // minúsculo
  const sig = crypto.createHmac('sha256', INVITE_SECRET).update(payload).digest('hex').slice(0, 8);
  return `PRSP-${payload}-${sig}`.toUpperCase();
}

const hours = parseFloat(process.argv[2]) || 24;
const code = generateInvite(hours);
const exp = new Date(Date.now() + hours * 3600000);
console.log('\n  Código de convite:  ' + code);
console.log('  Válido por:         ' + hours + 'h (até ' + exp.toLocaleString('pt-BR') + ')');
console.log('  Uso único.\n');
