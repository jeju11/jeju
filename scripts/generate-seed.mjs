import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { prepareImport } from '../lib/jeju/import-validation.ts'

// One data source for the file fallback and optional DB initialization.
const raw = await readFile(new URL('../public/jeju-weekend-608.json', import.meta.url), 'utf8')
const prepared = prepareImport(raw)
if (!prepared.summary.canApply || !prepared.summary.fullOfficialCoverage || prepared.rows.length !== 120) {
  throw new Error('Expected all 120 valid weekend observations before generating a database seed.')
}
const version = 'jejudatahub-608-201609-201711'
const checksum = createHash('sha256').update(raw).digest('hex')
const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
const values = prepared.rows.map((row, index) => '    (' + [
  row.districtType, row.userType, row.dtYearMonth, row.dtWeek, row.useCount,
].map(quote).join(', ') + ', ' + (index + 1) + ')').join(',\n')
const sql = `-- Generated from public/jeju-weekend-608.json. Do not put account data or keys here.
-- Idempotent. A current provider/admin version is never replaced by this bundled seed.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('jeju-608-active-version')::bigint);

INSERT INTO public.jeju_dataset_versions
  (version, source, row_count, observed_start, observed_end, checksum, is_active, applied_at)
VALUES ('${version}', 'jejudatahub-608-bundled', 120, '2016-09', '2017-11', '${checksum}', false, now())
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.jeju_observations
  (dataset_version_id, district_type, user_type, dt_year_month, dt_week, use_count, source_row_number, raw_payload)
SELECT v.id, r.district_type, r.user_type, r.dt_year_month, r.dt_week, r.use_count, r.source_row_number,
  jsonb_build_object('districtType', r.district_type, 'userType', r.user_type,
    'dtYearMonth', r.dt_year_month, 'dtWeek', r.dt_week, 'useCount', r.use_count)
FROM public.jeju_dataset_versions v
CROSS JOIN (VALUES
${values}
) AS r(district_type, user_type, dt_year_month, dt_week, use_count, source_row_number)
WHERE v.version = '${version}'
AND NOT EXISTS (SELECT 1 FROM public.jeju_observations existing WHERE existing.dataset_version_id = v.id);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.jeju_observations o JOIN public.jeju_dataset_versions v
      ON v.id = o.dataset_version_id WHERE v.version = '${version}') <> 120 THEN
    RAISE EXCEPTION 'Bundled dataset is incomplete; preserving current active data.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.jeju_dataset_versions
    WHERE is_active = true AND version NOT IN ('${version}', 'preview-2017-11-v1')
  ) THEN
    UPDATE public.jeju_dataset_versions SET is_active = false WHERE is_active = true;
    UPDATE public.jeju_dataset_versions SET is_active = true, applied_at = now()
    WHERE version = '${version}';
  END IF;
END $$;
COMMIT;
`
await writeFile(new URL('../drizzle/0002_preview_seed.sql', import.meta.url), sql)
console.log('Generated seed for 120 validated observations across all 15 months.')
