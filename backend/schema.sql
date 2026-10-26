-- backend/schema.sql
-- Supabase (PostgreSQL) schema for Strumio backend integration.
-- Run this in the Supabase SQL editor (or via psql) to create the tables,
-- indexes, row-level security policies and triggers used by js/backend.js.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users (profile mirror of auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- progress (one row per user, last-write-wins via updated_at)
-- ---------------------------------------------------------------------------
create table if not exists public.progress (
  user_id        uuid primary key references public.users(id) on delete cascade,
  xp             integer not null default 0,
  level          integer not null default 1,
  streak         integer not null default 0,
  gems           integer not null default 0,
  hearts         integer not null default 5,
  last_practice  text,
  completed      jsonb not null default '{}'::jsonb,
  achievements   jsonb not null default '{}'::jsonb,
  stats          jsonb not null default '{}'::jsonb,
  daily_log      jsonb not null default '{}'::jsonb,
  practice_days  jsonb not null default '[]'::jsonb,
  settings       jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- weekly_scores (one row per user per week, reset by week_start)
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  week_start  date not null,
  xp          integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists weekly_scores_week_xp_idx
  on public.weekly_scores (week_start, xp desc);

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.users(id) on delete cascade,
  addressee_id  uuid not null references public.users(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','accepted','rejected','blocked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.users(id) on delete cascade,
  challenged_id uuid not null references public.users(id) on delete cascade,
  lesson_id     text,
  status        text not null default 'pending'
                check (status in ('pending','accepted','completed','declined','expired')),
  score         integer,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists challenges_challenger_idx on public.challenges (challenger_id);
create index if not exists challenges_challenged_idx on public.challenges (challenged_id);

-- ---------------------------------------------------------------------------
-- activity_feed
-- ---------------------------------------------------------------------------
create table if not exists public.activity_feed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists activity_feed_user_created_idx
  on public.activity_feed (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress
  for each row execute function public.touch_updated_at();

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

drop trigger if exists weekly_scores_touch on public.weekly_scores;
create trigger weekly_scores_touch before update on public.weekly_scores
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.progress enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.friendships enable row level security;
alter table public.challenges enable row level security;
alter table public.activity_feed enable row level security;

-- users: any authenticated user can look up basic profiles (needed for add-by-email and leaderboards)
create policy "users_select_authenticated" on public.users
  for select using (auth.role() = 'authenticated');

create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- progress: own only
create policy "progress_select_own" on public.progress
  for select using (auth.uid() = user_id);
create policy "progress_insert_own" on public.progress
  for insert with check (auth.uid() = user_id);
create policy "progress_update_own" on public.progress
  for update using (auth.uid() = user_id);
create policy "progress_delete_own" on public.progress
  for delete using (auth.uid() = user_id);

-- weekly_scores: read all authenticated (leaderboard), write own
create policy "weekly_scores_select_all" on public.weekly_scores
  for select using (auth.role() = 'authenticated');
create policy "weekly_scores_insert_own" on public.weekly_scores
  for insert with check (auth.uid() = user_id);
create policy "weekly_scores_update_own" on public.weekly_scores
  for update using (auth.uid() = user_id);

-- friendships: read if participant; insert as requester; update if participant
create policy "friendships_select_participant" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships_insert_requester" on public.friendships
  for insert with check (auth.uid() = requester_id);
create policy "friendships_update_participant" on public.friendships
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships_delete_participant" on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- challenges: read if participant; insert as challenger; update if participant
create policy "challenges_select_participant" on public.challenges
  for select using (auth.uid() = challenger_id or auth.uid() = challenged_id);
create policy "challenges_insert_challenger" on public.challenges
  for insert with check (auth.uid() = challenger_id);
create policy "challenges_update_participant" on public.challenges
  for update using (auth.uid() = challenger_id or auth.uid() = challenged_id);

-- activity_feed: read own + friends; insert own
create policy "activity_select_own_or_friends" on public.activity_feed
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = activity_feed.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = activity_feed.user_id))
    )
  );
create policy "activity_insert_own" on public.activity_feed
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants (Supabase defaults; explicit for clarity)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.weekly_scores to anon;
