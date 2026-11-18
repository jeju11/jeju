import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
})

pool.on('error', (err) => {
  // DB 미연결 또는 연결 유휴 만료 시 프로세스 중단 방지
  console.warn('[Postgres Pool Error]', err?.message || err)
})

export const db = drizzle(pool, { schema })
