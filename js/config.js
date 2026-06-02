/* ============================================================
   CONFIG — credenciais da nuvem (Supabase)
   ------------------------------------------------------------
   Cole aqui os dois valores do SEU projeto Supabase.
   Onde achar: painel do Supabase > Project Settings > API
     - "Project URL"        -> supabaseUrl
     - "anon public" (key)  -> supabaseAnonKey
   A chave "anon public" PODE ficar no código do app — ela só
   permite o que as regras de segurança (RLS) deixarem. NUNCA
   cole aqui a "service_role" (essa é secreta).

   Enquanto os dois campos estiverem vazios, o app continua
   funcionando 100% local (só neste navegador), como antes.
   ============================================================ */
window.PROSPERA_CONFIG = {
  supabaseUrl: 'https://cpskmhnzpmgtfymugnpx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwc2ttaG56cG1ndGZ5bXVnbnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjM2MjUsImV4cCI6MjA5NTkzOTYyNX0.JOukESDRqR5CT0wdtogeo0OCwEveaysg5kowVqkyE-U'
};
