-- Stay: run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- The app and scraper connect with the service-role key, which bypasses RLS;
-- RLS is enabled with no public policies so the anon key can read nothing.

create table if not exists listings (
  id             text primary key,
  source         text not null,
  source_id      text not null,
  url            text,
  title          text not null,
  price_rm       numeric not null,
  room_type      text not null default 'unknown',
  property_name  text,
  area           text,
  address        text,
  lat            double precision not null,
  lng            double precision not null,
  photos         jsonb not null default '[]',
  furnished      text,
  available_from text,
  notes          text,
  first_seen     timestamptz not null,
  last_seen      timestamptz not null,
  is_active      boolean not null default true,
  unique (source, source_id)
);

create index if not exists listings_active_idx on listings (is_active);
create index if not exists listings_source_idx on listings (source);

create table if not exists price_history (
  id         bigint generated always as identity primary key,
  listing_id text not null,
  price_rm   numeric not null,
  seen_at    timestamptz not null
);

create index if not exists price_history_listing_idx on price_history (listing_id);

create table if not exists walk_cache (
  listing_id text not null,
  station_id text not null,
  walk_min   real not null,
  meters     integer not null,
  routed     boolean not null default false,
  primary key (listing_id, station_id)
);

alter table listings enable row level security;
alter table price_history enable row level security;
alter table walk_cache enable row level security;
