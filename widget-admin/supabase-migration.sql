-- ═══════════════════════════════════════════════════════════════════════
-- Supabase Migration: Widget Submissions Table
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Create the table
create table if not exists widget_submissions (
  id          uuid primary key default gen_random_uuid(),
  widget_id   text not null,
  name        text not null,
  description text default '',
  category    text default 'tools',
  author      text default 'Anonymous',
  widget_data jsonb not null,
  status      text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz default now()
);

-- 2. Index for fast queries
create index if not exists idx_widget_submissions_status on widget_submissions (status);
create index if not exists idx_widget_submissions_created on widget_submissions (created_at desc);

-- 3. Enable Row Level Security
alter table widget_submissions enable row level security;

-- 4. RLS Policies:
--    - Anyone can INSERT (submit a widget)
--    - Anyone can SELECT (admin page reads all submissions)
create policy "Allow public inserts"
  on widget_submissions for insert
  to anon
  with check (true);

create policy "Allow public reads"
  on widget_submissions for select
  to anon
  using (true);

-- 5. Allow admin to update status (via service_role or authenticated)
create policy "Allow authenticated updates"
  on widget_submissions for update
  to authenticated
  using (true)
  with check (true);
