-- Team-level views derived from existing matches / match_stats.
-- Additive only: no base tables are modified. Drop with DROP VIEW to reverse.

-- Raw stat strings arrive in five shapes:
--   '2.44', '83%', '8/23 (35%)', '114.0 km', '-0.50' (Goals prevented).
-- value     = leading number, including negatives (successful count for ratios)
-- attempted = denominator when the shape is 'made/attempted'
-- pct       = trailing percentage when present
CREATE OR REPLACE VIEW team_match_stats AS
WITH sided AS (
  SELECT m.event_id, m.season, m.league, m.date, m.round,
         m.home AS team, m.away AS opponent, TRUE AS is_home,
         m.home_goals AS gf, m.away_goals AS ga,
         s.stat, s.home AS raw
  FROM match_stats s
  JOIN matches m ON m.event_id = s.event_id
  WHERE m.status = 'finished'
  UNION ALL
  SELECT m.event_id, m.season, m.league, m.date, m.round,
         m.away AS team, m.home AS opponent, FALSE AS is_home,
         m.away_goals AS gf, m.home_goals AS ga,
         s.stat, s.away AS raw
  FROM match_stats s
  JOIN matches m ON m.event_id = s.event_id
  WHERE m.status = 'finished'
)
SELECT
  event_id, season, league, date, round,
  team, opponent, is_home, gf, ga, stat,
  NULLIF(substring(raw FROM '^(-?[0-9]+\.?[0-9]*)'), '')::numeric AS value,
  NULLIF(substring(raw FROM '^[0-9.]+/([0-9]+)'), '')::numeric    AS attempted,
  NULLIF(substring(raw FROM '([0-9]+)%'), '')::numeric            AS pct,
  raw
FROM sided;

CREATE OR REPLACE VIEW team_season_stats AS
SELECT
  season, league, team, stat,
  COUNT(*)                      AS matches,
  ROUND(AVG(value), 2)          AS per_match,
  ROUND(AVG(pct), 1)            AS pct,
  ROUND(SUM(value), 1)          AS total
FROM team_match_stats
WHERE value IS NOT NULL OR pct IS NOT NULL
GROUP BY season, league, team, stat;

CREATE OR REPLACE VIEW team_table AS
WITH sided AS (
  SELECT season, league, home AS team, home_goals AS gf, away_goals AS ga
  FROM matches WHERE status = 'finished' AND home_goals IS NOT NULL
  UNION ALL
  SELECT season, league, away AS team, away_goals AS gf, home_goals AS ga
  FROM matches WHERE status = 'finished' AND away_goals IS NOT NULL
)
SELECT
  season, league, team,
  COUNT(*)::int                                              AS played,
  SUM((gf > ga)::int)::int                                   AS won,
  SUM((gf = ga)::int)::int                                   AS drawn,
  SUM((gf < ga)::int)::int                                   AS lost,
  SUM(gf)::int                                               AS goals_for,
  SUM(ga)::int                                               AS goals_against,
  (SUM(gf) - SUM(ga))::int                                   AS goal_diff,
  (SUM((gf > ga)::int) * 3 + SUM((gf = ga)::int))::int        AS points
FROM sided
GROUP BY season, league, team;

GRANT SELECT ON team_match_stats, team_season_stats, team_table TO anon, authenticated;
