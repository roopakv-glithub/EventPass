-- Run this after 001_eventpass_schema.sql has already been applied.

-- Never allow signup metadata to self-promote a user to organizer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Participant'), '@', 1)),
    new.email,
    'participant'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Fix duplicate check-in detection. The previous function overwrote FOUND
-- while looking up the attendee profile.
create or replace function public.check_in_by_token(token_hash text, target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_registration public.registrations;
  current_event public.events;
  existing_check_in public.check_ins;
  attendee_name text;
begin
  if not public.is_organizer() then
    raise exception using errcode = '42501', message = 'Organizer permission required';
  end if;

  select * into current_registration
  from public.registrations
  where qr_token_hash = token_hash
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid_qr');
  end if;

  select * into current_event
  from public.events
  where id = current_registration.event_id;

  if current_registration.event_id <> target_event_id then
    return jsonb_build_object('status', 'wrong_event');
  end if;

  if current_registration.qr_status = 'expired'
     or (current_registration.qr_expires_at is not null and current_registration.qr_expires_at < now()) then
    return jsonb_build_object('status', 'expired');
  end if;

  select * into existing_check_in
  from public.check_ins
  where registration_id = current_registration.id;

  select full_name into attendee_name
  from public.profiles
  where id = current_registration.participant_id;

  if existing_check_in.id is not null then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'participant', attendee_name,
      'event', current_event.name,
      'checked_in_at', existing_check_in.checked_in_at
    );
  end if;

  insert into public.check_ins (registration_id, event_id, checked_in_by)
  values (current_registration.id, current_registration.event_id, auth.uid())
  returning * into existing_check_in;

  update public.registrations
  set qr_status = 'used'
  where id = current_registration.id;

  return jsonb_build_object(
    'status', 'checked_in',
    'participant', attendee_name,
    'event', current_event.name,
    'checked_in_at', existing_check_in.checked_in_at
  );
end;
$$;

-- Do not leave security-sensitive RPCs executable by PUBLIC.
revoke all on function public.register_for_event(uuid) from public;
revoke all on function public.check_in_by_token(text, uuid) from public;
revoke all on function public.event_stats(uuid) from public;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.check_in_by_token(text, uuid) to authenticated;
grant execute on function public.event_stats(uuid) to authenticated;

-- Enable Supabase Realtime for live dashboard updates.
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.registrations;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.check_ins;
exception when duplicate_object then null;
end;
$$;
