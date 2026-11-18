-- Preserve group scope and analysis intent when optional question history is enabled.
ALTER TABLE public.jeju_query_history
  ADD COLUMN IF NOT EXISTS analysis_context jsonb;
