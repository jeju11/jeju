CREATE TABLE IF NOT EXISTS public."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jeju_dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  source text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  observed_start text,
  observed_end text,
  checksum text,
  is_active boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jeju_observations (
  id bigserial PRIMARY KEY,
  dataset_version_id uuid NOT NULL REFERENCES public.jeju_dataset_versions(id) ON DELETE CASCADE,
  district_type text,
  user_type text,
  dt_year_month text,
  dt_week text,
  use_count text,
  source_row_number integer,
  raw_payload jsonb
);

CREATE TABLE IF NOT EXISTS public.jeju_query_history (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  question text NOT NULL,
  district_type text NOT NULL,
  user_type text NOT NULL,
  start_month text NOT NULL,
  end_month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jeju_refresh_runs (
  id text PRIMARY KEY,
  initiated_by text,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  failure_reason text,
  rows_received integer,
  dataset_version_id uuid REFERENCES public.jeju_dataset_versions(id)
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON public.session ("userId");
CREATE INDEX IF NOT EXISTS account_user_id_idx ON public.account ("userId");
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON public.verification (identifier);
CREATE INDEX IF NOT EXISTS jeju_dataset_versions_active_idx ON public.jeju_dataset_versions (is_active);
CREATE INDEX IF NOT EXISTS jeju_observations_version_period_idx ON public.jeju_observations (dataset_version_id, dt_year_month);
CREATE INDEX IF NOT EXISTS jeju_query_history_user_created_idx ON public.jeju_query_history (user_id, created_at);
CREATE INDEX IF NOT EXISTS jeju_refresh_runs_started_idx ON public.jeju_refresh_runs (started_at);
