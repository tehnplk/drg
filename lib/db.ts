// PostgreSQL (compose.yaml, DATABASE_URL in .env.local) behind the small interface the app and scripts use:
// query, exec (several statements), transaction and close. Many processes may connect at once.
import pg from "pg";

// Scripts run from the project root get .env.local here; variables already set (by Next or the shell) win.
try { process.loadEnvFile(".env.local"); } catch { /* no file: Next or the shell set the environment */ }

type Rows<T> = Promise<{ rows: T[] }>;
export type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Rows<T>;
  exec(sql: string): Promise<void>;
};

const on = (c: pg.Pool | pg.PoolClient): Queryable => ({
  query: <T,>(sql: string, params?: unknown[]) => c.query(sql, params) as unknown as Rows<T>,
  exec: async (sql) => { await c.query(sql); },
});

// One pool per process, kept across Next dev reloads.
const g = globalThis as { pgPool?: pg.Pool };
// allowExitOnIdle: a script that never calls db.close() still exits once its queries are done.
const pool = (g.pgPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, allowExitOnIdle: true }));

export const db = {
  ...on(pool),
  async transaction<R>(fn: (tx: Queryable) => Promise<R>): Promise<R> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await fn(on(client));
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  },
  close: () => pool.end(),
};
