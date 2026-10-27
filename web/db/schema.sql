-- City Problems · Mumbai: database schema (PostgreSQL / Neon).
-- One table holds both the cleaned BMC complaints (source = 'bmc') and reports filed in this app (source = 'citizen').
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS wards (
  ward        text PRIMARY KEY,               -- BMC ward code, e.g. 'KW'
  name        text NOT NULL,                  -- display name, e.g. 'K/West'
  areas       text NOT NULL,                  -- well-known localities in the ward
  zone        text,
  population  integer NOT NULL
);

CREATE TABLE IF NOT EXISTS problems (
  id                text PRIMARY KEY,         -- BMC complaint ID, or 'CR-…' for citizen reports
  source            text NOT NULL CHECK (source IN ('bmc', 'citizen')),
  reported_at       timestamptz NOT NULL,
  category          text NOT NULL,
  subcategory       text,
  department        text,                     -- BMC department the complaint was routed to
  description       text,                     -- citizen reports only
  landmark          text,                     -- citizen reports only
  ward              text REFERENCES wards (ward),
  zone              text,
  division          text,
  lat               double precision,
  lon               double precision,
  has_location      boolean NOT NULL DEFAULT true,
  status            text NOT NULL CHECK (status IN ('Open', 'In Review', 'In Progress', 'Resolved', 'Rejected', 'Discarded')),
  is_open           boolean GENERATED ALWAYS AS (status IN ('Open', 'In Review', 'In Progress')) STORED,
  closed_at         timestamptz,
  days_to_close     numeric(7, 2),
  channel           text,
  escalated         boolean NOT NULL DEFAULT false,
  escalation_level  smallint,
  road_type         text,
  supporters        integer NOT NULL DEFAULT 0, -- "I face this too" count (citizen reports)
  reporter_hash     text,                     -- salted hash of the reporter's device; never the raw IP or a name
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (has_location = (lat IS NOT NULL AND lon IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS problems_source_reported_idx ON problems (source, reported_at DESC);
CREATE INDEX IF NOT EXISTS problems_ward_idx ON problems (ward);
CREATE INDEX IF NOT EXISTS problems_category_idx ON problems (category);
CREATE INDEX IF NOT EXISTS problems_lat_lon_idx ON problems (lat, lon);
CREATE INDEX IF NOT EXISTS problems_reporter_idx ON problems (reporter_hash, created_at) WHERE source = 'citizen';

CREATE TABLE IF NOT EXISTS problem_supporters (
  problem_id     text NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  reporter_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (problem_id, reporter_hash)
);
