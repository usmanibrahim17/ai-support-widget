create table if not exists public.businesses (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  description text,
  tone text,
  created_at timestamptz not null default now()
);
