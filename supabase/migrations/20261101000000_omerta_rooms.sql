-- OMERTÀ: salas de jogo. Tabela isolada (prefixo omerta_), não toca em nada existente.
-- Acesso só pela Edge Function (service role). RLS ligado e SEM policies = anon/authenticated não leem nada.
create table if not exists public.omerta_rooms (
  code        text primary key check (code ~ '^[A-Z]{4}$'),
  rev         integer not null default 0,
  data        jsonb   not null,
  updated_at  timestamptz not null default now()
);

alter table public.omerta_rooms enable row level security;
revoke all on public.omerta_rooms from anon, authenticated;

create index if not exists omerta_rooms_updated_at_idx on public.omerta_rooms (updated_at);

-- Limpeza: salas paradas há mais de 12h (chamada pela própria função ao criar salas)
create or replace function public.omerta_purge_rooms() returns void
language sql security definer set search_path = public as $$
  delete from public.omerta_rooms where updated_at < now() - interval '12 hours';
$$;
revoke all on function public.omerta_purge_rooms() from public, anon, authenticated;
