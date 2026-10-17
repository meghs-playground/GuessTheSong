import { neon } from '@neondatabase/serverless'

export type Sql = ReturnType<typeof neon>

/** Create a Neon SQL client from the DATABASE_URL env var. */
export function createDb(databaseUrl: string): Sql {
  return neon(databaseUrl)
}
