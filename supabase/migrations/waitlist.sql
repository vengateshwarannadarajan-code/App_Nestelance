-- Waitlist table for nestelance.com coming soon email capture
create table if not exists waitlist (
  id          uuid        default gen_random_uuid() primary key,
  email       text        not null unique,
  created_at  timestamptz default now()
);

-- No RLS needed — only the service key (backend) writes to this table.
-- Read access is service-key only (admin use).
alter table waitlist enable row level security;

-- Allow the API (service role) to insert/upsert — service role bypasses RLS by default.
-- No public select policy: emails are private.
