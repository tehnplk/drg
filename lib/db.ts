import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite");
mkdirSync(path.dirname(dataDir), { recursive: true });

// One PGlite instance per process; it holds an exclusive lock on dataDir.
const g = globalThis as { pglite?: PGlite };
export const db = (g.pglite ??= new PGlite(dataDir));
