-- #1184 – allow users to opt out of per-search analytics/consent separation

ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "search_analytics_opt_out" BOOLEAN NOT NULL DEFAULT false;