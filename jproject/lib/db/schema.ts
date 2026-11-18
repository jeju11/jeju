import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('user_email_unique').on(table.email)])

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
}, (table) => [uniqueIndex('session_token_unique').on(table.token), index('session_user_id_idx').on(table.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('account_user_id_idx').on(table.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)])

export const datasetVersions = pgTable('jeju_dataset_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  version: text('version').notNull(),
  source: text('source').notNull(),
  rowCount: integer('row_count').notNull().default(0),
  observedStart: text('observed_start'),
  observedEnd: text('observed_end'),
  checksum: text('checksum'),
  isActive: boolean('is_active').notNull().default(false),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('jeju_dataset_versions_version_unique').on(table.version), index('jeju_dataset_versions_active_idx').on(table.isActive)])

export const observations = pgTable('jeju_observations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  datasetVersionId: uuid('dataset_version_id').notNull(),
  districtType: text('district_type'),
  userType: text('user_type'),
  dtYearMonth: text('dt_year_month'),
  dtWeek: text('dt_week'),
  useCount: text('use_count'),
  sourceRowNumber: integer('source_row_number'),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown> | null>(),
}, (table) => [index('jeju_observations_version_period_idx').on(table.datasetVersionId, table.dtYearMonth)])

export const queryHistory = pgTable('jeju_query_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  question: text('question').notNull(),
  districtType: text('district_type').notNull(),
  userType: text('user_type').notNull(),
  startMonth: text('start_month').notNull(),
  endMonth: text('end_month').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('jeju_query_history_user_created_idx').on(table.userId, table.createdAt)])

export const refreshRuns = pgTable('jeju_refresh_runs', {
  id: text('id').primaryKey(),
  initiatedBy: text('initiated_by'),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  rowsReceived: integer('rows_received'),
  datasetVersionId: uuid('dataset_version_id'),
}, (table) => [index('jeju_refresh_runs_started_idx').on(table.startedAt)])

