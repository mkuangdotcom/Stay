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
  gender         text,     -- 'female' | 'male' | null (no restriction stated)
  min_term_months integer, -- minimum tenancy; 1 = short-term ok, null = not stated
  phone          text,     -- lister contact, normalized +60…
  contact_name   text,     -- lister/agent name when the source shows one
  notes          text,
  first_seen     timestamptz not null,
  last_seen      timestamptz not null,
  is_active      boolean not null default true,
  is_fav         boolean not null default false, -- user's shortlist star
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

-- upgrades for databases created before these columns existed (no-ops on fresh ones)
alter table listings add column if not exists phone text;
alter table listings add column if not exists contact_name text;

-- outreach tracker: one row per listing you've contacted (or queued)
create table if not exists outreach (
  listing_id           text primary key,
  status               text not null,  -- contacted | replied | viewing | contract | dead
  channel              text,           -- whatsapp | phone | sms | portal | other
  contacted_at         date,
  viewing_at           timestamptz,
  agreed_rm            numeric,        -- negotiated rent when it differs from asking
  utilities            text,           -- "wifi+water incl, electric metered"
  commute_min_override integer,        -- manual door-to-door override
  dead_reason          text,           -- why the lead died (status = dead)
  notes                text not null default '',
  updated_at           timestamptz not null
);

alter table outreach add column if not exists dead_reason text;

alter table listings enable row level security;
alter table price_history enable row level security;
alter table walk_cache enable row level security;
alter table outreach enable row level security;
