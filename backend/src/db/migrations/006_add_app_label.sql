-- Sprint 3.5: human-readable foreground app name from UsageStatsManager

ALTER TABLE screen_events
  ADD COLUMN IF NOT EXISTS app_label VARCHAR(255);
