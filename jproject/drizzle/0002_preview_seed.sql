WITH version_row AS (
  INSERT INTO public.jeju_dataset_versions (
    version, source, row_count, observed_start, observed_end, checksum, is_active, applied_at
  )
  VALUES ('preview-2017-11-v1', 'user-provided-preview', 12, '2016-09', '2017-11', NULL, true, now())
  ON CONFLICT (version) DO UPDATE SET
    source = EXCLUDED.source,
    row_count = EXCLUDED.row_count,
    observed_start = EXCLUDED.observed_start,
    observed_end = EXCLUDED.observed_end,
    is_active = true,
    applied_at = now()
  RETURNING id
), inserted_rows AS (
  INSERT INTO public.jeju_observations (
    dataset_version_id, district_type, user_type, dt_year_month, dt_week, use_count, source_row_number, raw_payload
  )
  SELECT
    version_row.id,
    row_data.district_type,
    row_data.user_type,
    row_data.dt_year_month,
    row_data.dt_week,
    row_data.use_count,
    row_data.source_row_number,
    jsonb_build_object(
      'districtType', row_data.district_type,
      'userType', row_data.user_type,
      'dtYearMonth', row_data.dt_year_month,
      'dtWeek', row_data.dt_week,
      'useCount', row_data.use_count
    )
  FROM version_row
  CROSS JOIN (VALUES
    ('제주시', '내국인', '2016-09', '토요일', '10689', 1),
    ('제주시', '내국인', '2016-09', '일요일', '10287', 2),
    ('제주시', '내국인', '2016-10', '토요일', '13313', 3),
    ('제주시', '내국인', '2016-10', '일요일', '13667', 4),
    ('제주시', '내국인', '2017-11', '토요일', '13502', 5),
    ('제주시', '내국인', '2017-11', '일요일', '13214', 6),
    ('제주시', '중국인', '2017-11', '토요일', '279', 7),
    ('제주시', '중국인', '2017-11', '일요일', '352', 8),
    ('서귀포시', '내국인', '2017-11', '토요일', '11507', 9),
    ('서귀포시', '내국인', '2017-11', '일요일', '10509', 10),
    ('서귀포시', '중국인', '2017-11', '토요일', '40', 11),
    ('서귀포시', '중국인', '2017-11', '일요일', '47', 12)
  ) AS row_data(district_type, user_type, dt_year_month, dt_week, use_count, source_row_number)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.jeju_observations existing
    WHERE existing.dataset_version_id = version_row.id
  )
  RETURNING id
)
SELECT (SELECT count(*) FROM inserted_rows) AS inserted_rows, version_row.id
FROM version_row;
