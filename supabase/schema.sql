-- DayLens optional cloud sync schema.
-- Run in the Supabase SQL editor. The frontend uses one private JSON snapshot per user.
-- Local-first operation does not require Supabase.

create table if not exists public.daylens_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.daylens_snapshots enable row level security;

create policy "Users can read their own DayLens snapshot"
on public.daylens_snapshots for select
using (auth.uid() = user_id);

create policy "Users can insert their own DayLens snapshot"
on public.daylens_snapshots for insert
with check (auth.uid() = user_id);

create policy "Users can update their own DayLens snapshot"
on public.daylens_snapshots for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Relational V2 tables are intentionally deferred until server-side analytics are needed.
-- The v1 snapshot model keeps sync atomic and lets the browser remain the analytics engine.
