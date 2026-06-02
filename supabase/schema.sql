-- ============================================================
-- Prospera — esquema do banco na nuvem (Supabase / Postgres)
-- ------------------------------------------------------------
-- Cole TODO este conteúdo no painel do Supabase:
--   SQL Editor > New query > colar > Run
-- Cria uma tabela "vaults": cada usuário guarda TODOS os seus
-- dados financeiros num único campo JSON, protegido por RLS
-- (cada pessoa só enxerga e edita a própria linha).
-- ============================================================

create table if not exists public.vaults (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vaults enable row level security;

-- cada usuário só lê a própria linha
drop policy if exists "vault_select_own" on public.vaults;
create policy "vault_select_own" on public.vaults
  for select using (auth.uid() = user_id);

-- cada usuário só cria a própria linha
drop policy if exists "vault_insert_own" on public.vaults;
create policy "vault_insert_own" on public.vaults
  for insert with check (auth.uid() = user_id);

-- cada usuário só atualiza a própria linha
drop policy if exists "vault_update_own" on public.vaults;
create policy "vault_update_own" on public.vaults
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- mantém updated_at sempre atualizado
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists vaults_touch on public.vaults;
create trigger vaults_touch before update on public.vaults
  for each row execute function public.touch_updated_at();
