create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_path text not null,
  status text not null default 'queued' check (status in ('queued', 'complete', 'failed')),
  transcript text,
  summary text,
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meetings_user_id_created_at_idx
  on public.meetings (user_id, created_at desc);

alter table public.meetings enable row level security;

grant select, insert, update on public.meetings to authenticated;

drop policy if exists "Users read their own meetings" on public.meetings;
create policy "Users read their own meetings"
  on public.meetings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own meetings" on public.meetings;
create policy "Users insert their own meetings"
  on public.meetings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own meetings" on public.meetings;
create policy "Users update their own meetings"
  on public.meetings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
