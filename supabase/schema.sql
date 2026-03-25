-- Ejecuta este archivo completo en Supabase SQL Editor

create extension if not exists pgcrypto;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create table if not exists public.user_stats (
  user_id uuid primary key,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  total_games integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_stats_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  invited_username text,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  status text not null default 'waiting',
  fen text not null,
  pgn text not null default '',
  moves_json jsonb not null default '[]'::jsonb,
  current_turn text not null default 'w',
  white_player_id uuid,
  black_player_id uuid,
  white_time_ms bigint not null,
  black_time_ms bigint not null,
  base_minutes integer not null,
  increment_seconds integer not null default 0,
  turn_started_at timestamptz,
  winner_id uuid,
  result text,
  draw_offer_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint games_created_by_fkey foreign key (created_by) references public.profiles(id) on delete cascade,
  constraint games_white_player_id_fkey foreign key (white_player_id) references public.profiles(id) on delete set null,
  constraint games_black_player_id_fkey foreign key (black_player_id) references public.profiles(id) on delete set null,
  constraint games_winner_id_fkey foreign key (winner_id) references public.profiles(id) on delete set null,
  constraint games_draw_offer_by_fkey foreign key (draw_offer_by) references public.profiles(id) on delete set null,
  constraint games_status_check check (status in ('waiting', 'active', 'finished', 'cancelled')),
  constraint games_turn_check check (current_turn in ('w', 'b')),
  constraint games_increment_check check (increment_seconds >= 0),
  constraint games_base_minutes_check check (base_minutes > 0),
  constraint games_times_check check (white_time_ms >= 0 and black_time_ms >= 0)
);

create index if not exists games_status_idx on public.games(status);
create index if not exists games_created_by_idx on public.games(created_by);
create index if not exists games_white_player_idx on public.games(white_player_id);
create index if not exists games_black_player_idx on public.games(black_player_id);
create index if not exists games_invited_username_idx on public.games(invited_username);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

create trigger user_stats_set_updated_at
before update on public.user_stats
for each row
execute function public.handle_updated_at();

create trigger games_set_updated_at
before update on public.games
for each row
execute function public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_username text;
  new_display_name text;
begin
  new_username := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  new_display_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    regexp_replace(new_username, '[^a-z0-9_]', '', 'g'),
    new_display_name
  )
  on conflict (id) do update
  set username = excluded.username,
      display_name = excluded.display_name,
      updated_at = timezone('utc', now());

  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.update_user_stats_from_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'finished' and new.status = 'finished' then
    if new.white_player_id is not null then
      insert into public.user_stats (user_id) values (new.white_player_id)
      on conflict (user_id) do nothing;
    end if;

    if new.black_player_id is not null then
      insert into public.user_stats (user_id) values (new.black_player_id)
      on conflict (user_id) do nothing;
    end if;

    if new.winner_id is null then
      if new.white_player_id is not null then
        update public.user_stats
        set draws = draws + 1,
            total_games = total_games + 1,
            updated_at = timezone('utc', now())
        where user_id = new.white_player_id;
      end if;

      if new.black_player_id is not null then
        update public.user_stats
        set draws = draws + 1,
            total_games = total_games + 1,
            updated_at = timezone('utc', now())
        where user_id = new.black_player_id;
      end if;
    else
      update public.user_stats
      set wins = wins + 1,
          total_games = total_games + 1,
          updated_at = timezone('utc', now())
      where user_id = new.winner_id;

      if new.white_player_id is not null and new.white_player_id <> new.winner_id then
        update public.user_stats
        set losses = losses + 1,
            total_games = total_games + 1,
            updated_at = timezone('utc', now())
        where user_id = new.white_player_id;
      end if;

      if new.black_player_id is not null and new.black_player_id <> new.winner_id then
        update public.user_stats
        set losses = losses + 1,
            total_games = total_games + 1,
            updated_at = timezone('utc', now())
        where user_id = new.black_player_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger games_finish_update_stats
after update on public.games
for each row
execute function public.update_user_stats_from_game();

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.user_stats enable row level security;

create policy "profiles_select_public"
on public.profiles
for select
using (true);

create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "user_stats_select_authenticated"
on public.user_stats
for select
using (auth.role() = 'authenticated');

create policy "games_select_relevant_or_waiting"
on public.games
for select
using (
  auth.role() = 'authenticated'
  and (
    created_by = auth.uid()
    or white_player_id = auth.uid()
    or black_player_id = auth.uid()
    or status = 'waiting'
  )
);

create policy "games_insert_authenticated"
on public.games
for insert
with check (
  auth.role() = 'authenticated'
  and created_by = auth.uid()
  and (
    white_player_id is null or white_player_id = auth.uid()
  )
  and (
    black_player_id is null or black_player_id = auth.uid()
  )
);

create policy "games_update_participants"
on public.games
for update
using (
  auth.role() = 'authenticated'
  and (
    created_by = auth.uid()
    or white_player_id = auth.uid()
    or black_player_id = auth.uid()
    or (status = 'waiting')
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    created_by = auth.uid()
    or white_player_id = auth.uid()
    or black_player_id = auth.uid()
    or (status = 'waiting')
  )
);
