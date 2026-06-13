-- Osher AI MVP persistence schema
-- Run this in the Supabase SQL editor before setting SUPABASE_URL and keys.

create table if not exists public.users (
  id text primary key,
  local_session_id text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  celo_address text not null,
  wallet_type text not null check (wallet_type in ('minipay', 'metamask')),
  chain_id integer not null default 42220,
  login_tx_hash text,
  total_saved_usdt numeric not null default 0,
  idle_balance_usdt numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, celo_address)
);

create table if not exists public.goals (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  category text not null,
  category_label text,
  target_amount_usdt numeric not null,
  target_amount_display numeric not null,
  display_currency text not null check (display_currency in ('USD', 'NGN', 'GHS')),
  deadline timestamptz not null,
  current_amount_usdt numeric not null default 0,
  weekly_target_usdt numeric not null,
  weekly_target_display numeric not null,
  round_up_enabled boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'withdrawn')),
  progress_percent numeric not null default 0,
  days_remaining integer not null default 0,
  exchange_rate jsonb,
  original_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  goal_id text references public.goals(id) on delete set null,
  type text not null,
  token text not null default 'USDT',
  amount_usdt numeric,
  tx_hash text,
  status text not null default 'submitted',
  chain text not null default 'celo',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_logs (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  goal_id text references public.goals(id) on delete set null,
  type text not null,
  amount_usdt numeric,
  message text not null,
  tx_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.nudges (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  goal_id text references public.goals(id) on delete set null,
  channel text not null default 'in_app',
  message text not null,
  status text not null default 'queued',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_tips (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  category text not null,
  generated_text text not null,
  delivered_via text not null check (delivered_via in ('nudge', 'chat', 'tips_tab')),
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  suggested_goal_name text not null,
  suggested_category text not null,
  suggested_amount_usdt numeric not null,
  reasoning_text text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'customised', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_wallets_user_id on public.wallets(user_id);
create index if not exists idx_goals_user_id_status on public.goals(user_id, status);
create index if not exists idx_transactions_user_id_created_at on public.transactions(user_id, created_at desc);
create index if not exists idx_agent_logs_user_id_created_at on public.agent_logs(user_id, created_at desc);
create index if not exists idx_nudges_user_id_scheduled_for on public.nudges(user_id, scheduled_for);
create index if not exists idx_savings_tips_user_id_created_at on public.savings_tips(user_id, created_at desc);
create index if not exists idx_recommendations_user_id_status on public.recommendations(user_id, status);
