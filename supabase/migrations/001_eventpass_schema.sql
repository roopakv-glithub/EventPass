create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('participant', 'organizer');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.registration_status as enum ('registered', 'cancelled');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.qr_status as enum ('pending', 'active', 'used', 'expired');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
exception when duplicate_object then null;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role public.app_role not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  event_date date not null,
  start_time time not null,
  end_time time,
  capacity integer not null check (capacity > 0),
  description text not null default '',
  location text not null default '',
  image_url text,
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status public.registration_status not null default 'registered',
  qr_token_hash text unique,
  qr_payload text,
  qr_created_at timestamptz,
  qr_expires_at timestamptz,
  qr_status public.qr_status not null default 'pending',
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, event_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  checked_in_by uuid not null references public.profiles(id) on delete restrict,
  checked_in_at timestamptz not null default now()
);

create index events_organizer_id_idx on public.events(organizer_id);
create index events_date_status_idx on public.events(event_date, status);
create index registrations_event_id_idx on public.registrations(event_id) where status = 'registered';
create index registrations_participant_id_idx on public.registrations(participant_id);
create index check_ins_event_time_idx on public.check_ins(event_id, checked_in_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger registrations_set_updated_at before update on public.registrations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Participant'), '@', 1)),
    new.email,
    'participant'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer');
$$;

create or replace function public.register_for_event(target_event_id uuid)
returns public.registrations
language plpgsql security definer set search_path = public
as $$
declare
  locked_event public.events;
  created_registration public.registrations;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select * into locked_event from public.events where id = target_event_id and status = 'published' for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event is unavailable or registration is closed'; end if;
  if exists (select 1 from public.registrations where participant_id = auth.uid() and event_id = target_event_id and status = 'registered') then
    raise exception using errcode = '23505', message = 'Already registered';
  end if;
  if (select count(*) from public.registrations where event_id = target_event_id and status = 'registered') >= locked_event.capacity then
    raise exception using errcode = 'P0001', message = 'Event is full';
  end if;
  insert into public.registrations (participant_id, event_id)
  values (auth.uid(), target_event_id)
  returning * into created_registration;
  return created_registration;
end;
$$;

create or replace function public.check_in_by_token(token_hash text, target_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  current_registration public.registrations;
  current_event public.events;
  existing_check_in public.check_ins;
  attendee_name text;
begin
  if not public.is_organizer() then raise exception using errcode = '42501', message = 'Organizer permission required'; end if;
  select * into current_registration from public.registrations where qr_token_hash = token_hash for update;
  if not found then return jsonb_build_object('status', 'invalid_qr'); end if;
  select * into current_event from public.events where id = current_registration.event_id;
  if current_registration.event_id <> target_event_id then return jsonb_build_object('status', 'wrong_event'); end if;
  if current_registration.qr_status = 'expired' or (current_registration.qr_expires_at is not null and current_registration.qr_expires_at < now()) then return jsonb_build_object('status', 'expired'); end if;
  select * into existing_check_in from public.check_ins where registration_id = current_registration.id;
  if existing_check_in.id is not null then
    select full_name into attendee_name from public.profiles where id = current_registration.participant_id;
    return jsonb_build_object('status', 'already_checked_in', 'participant', attendee_name, 'event', current_event.name, 'checked_in_at', existing_check_in.checked_in_at);
  end if;
  select full_name into attendee_name from public.profiles where id = current_registration.participant_id;
  insert into public.check_ins (registration_id, event_id, checked_in_by) values (current_registration.id, current_registration.event_id, auth.uid()) returning * into existing_check_in;
  update public.registrations set qr_status = 'used' where id = current_registration.id;
  return jsonb_build_object('status', 'checked_in', 'participant', attendee_name, 'event', current_event.name, 'checked_in_at', existing_check_in.checked_in_at);
end;
$$;

create or replace function public.event_stats(target_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.events where id = target_event_id and organizer_id = auth.uid() and public.is_organizer()) then
    raise exception using errcode = '42501', message = 'Organizer permission required';
  end if;
  return (select jsonb_build_object(
    'registered', (select count(*) from public.registrations where event_id = target_event_id and status = 'registered'),
    'checked_in', (select count(*) from public.check_ins where event_id = target_event_id),
    'no_shows', (select count(*) from public.registrations where event_id = target_event_id and status = 'registered' and not exists (select 1 from public.check_ins where registration_id = registrations.id)),
    'capacity', (select capacity from public.events where id = target_event_id),
    'peak_check_in_time', (select date_trunc('hour', checked_in_at) from public.check_ins where event_id = target_event_id group by 1 order by count(*) desc, 1 limit 1)
  ));
end;
$$;

grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.check_in_by_token(text, uuid) to authenticated;
grant execute on function public.event_stats(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.check_ins enable row level security;

create policy profiles_select_self on public.profiles for select using (id = auth.uid() or public.is_organizer());
create policy profiles_update_self on public.profiles for update using (id = auth.uid());
create policy events_public_read on public.events for select using (status = 'published' or organizer_id = auth.uid());
create policy events_organizer_insert on public.events for insert with check (organizer_id = auth.uid() and public.is_organizer());
create policy events_organizer_update on public.events for update using (organizer_id = auth.uid() and public.is_organizer()) with check (organizer_id = auth.uid() and public.is_organizer());
create policy events_organizer_delete on public.events for delete using (organizer_id = auth.uid() and public.is_organizer());
create policy registrations_select_participant_or_owner on public.registrations for select using (participant_id = auth.uid() or exists (select 1 from public.events where id = event_id and organizer_id = auth.uid() and public.is_organizer()));
create policy registrations_update_participant on public.registrations for update using (participant_id = auth.uid()) with check (participant_id = auth.uid());
create policy check_ins_select_participant_or_organizer on public.check_ins for select using (exists (select 1 from public.registrations r where r.id = registration_id and r.participant_id = auth.uid()) or (public.is_organizer() and exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())));

revoke all on public.registrations from anon;
revoke all on public.check_ins from anon;

do $$
begin
  alter publication supabase_realtime add table public.events, public.registrations, public.check_ins;
exception when duplicate_object then null;
end;
$$;
