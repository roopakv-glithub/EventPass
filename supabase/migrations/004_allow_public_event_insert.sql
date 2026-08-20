-- Allow public/anon inserts on events table when bypassing auth
do $$
begin
  create policy events_public_insert on public.events for insert with check (true);
exception when duplicate_object then null;
end;
$$;

grant insert, select on public.events to anon;
