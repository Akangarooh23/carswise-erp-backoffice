/**
 * Los datos del marketplace: importar el Excel de ofertas y listarlas.
 *
 * Esto vivía en `data/store.ts`, que era la versión anterior del ERP entera:
 * mil ciento cincuenta líneas con usuarios, tickets, citas, leads e inventario,
 * de las que solo se llamaban estas cinco funciones. Las demás no las usaba
 * nadie, y traían su propia definición de las tablas —la que decía `assignee`
 * mientras `db/schema.ts` decía `assigned_to`—. Tener dos definiciones de la
 * misma tabla ya costó que la pantalla de tickets no cargara.
 *
 * Las tablas las crea `ensureSchema` al arrancar, no esto.
 */
import { Pool } from "pg";

export type MarketVoOfferRecord = {
  id: string;
  sku: string;
  model: string;
  status: string;
  price: string;
};

export type MarketVoTableRow = Record<string, unknown>;

export type MarketVoTableResult = {
  columns: string[];
  rows: MarketVoTableRow[];
};

export type MarketOffersTableResult = {
  columns: string[];
  rows: MarketVoTableRow[];
};

export type MarketEditableTableKind = "vo" | "offers";

export type MarketImportResult = {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
};

let pool: Pool | null = null;

function cleanDisplayText(input: string) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\uFFFD]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeImportColumnName(column: string) {
  return String(column || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseImportNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseImportBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "si", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

export async function listMarketVoOffers(params: { q?: string; limit?: number }) {
  if (!pool) {
    return [] as MarketVoOfferRecord[];
  }

  const q = String(params.q || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(300, Number(params.limit || 80)));

  const { rows: hasTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_marketplace_vo_offers') IS NOT NULL AS exists`
  );
  if (!hasTableRows[0]?.exists) {
    return [] as MarketVoOfferRecord[];
  }

  const { rows } = await pool.query<{
    id: string;
    title: string;
    brand: string;
    model: string;
    price: string | null;
    portal: string | null;
  }>(
    `
    SELECT id, title, brand, model, price::text AS price, portal
    FROM moveadvisor_marketplace_vo_offers
    WHERE ($1 = '' 
      OR normalize_alias_token(lower($1)) = normalize_alias_token(lower(brand))
      OR normalize_alias_token(lower($1)) = normalize_alias_token(lower(model))
      OR lower(id) LIKE '%' || $1 || '%' 
      OR lower(title) LIKE '%' || $1 || '%')
      AND is_active = TRUE
    ORDER BY portal_score DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT $2
    `,
    [q, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    sku: row.id,
    model:
      cleanDisplayText(row.title) ||
      cleanDisplayText([row.brand, row.model].filter(Boolean).join(" ")) ||
      cleanDisplayText(row.model || row.brand || row.id),
    status: cleanDisplayText(row.portal || "Marketplace"),
    price: row.price ? `${Number(row.price).toLocaleString("es-ES")} EUR` : "-",
  }));
}

export async function listMarketVoOffersTable(): Promise<MarketVoTableResult> {
  if (!pool) {
    return { columns: [], rows: [] };
  }

  const { rows: hasTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_marketplace_vo_offers') IS NOT NULL AS exists`
  );
  if (!hasTableRows[0]?.exists) {
    return { columns: [], rows: [] };
  }

  const { rows } = await pool.query<MarketVoTableRow>(
    `
    SELECT *
    FROM moveadvisor_marketplace_vo_offers
    WHERE is_active = TRUE
    ORDER BY portal_score DESC NULLS LAST, updated_at DESC NULLS LAST
    `
  );

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows };
}

async function resolveOffersTableName(): Promise<string | null> {
  if (!pool) {
    return null;
  }

  const { rows: rowsMarketOffers } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.market_offers') IS NOT NULL AS exists`
  );
  if (rowsMarketOffers[0]?.exists) {
    return "market_offers";
  }

  const { rows: rowsMoveAdvisorOffers } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_market_offers') IS NOT NULL AS exists`
  );
  if (rowsMoveAdvisorOffers[0]?.exists) {
    return "moveadvisor_market_offers";
  }

  return null;
}

async function resolveEditableMarketTableName(kind: MarketEditableTableKind): Promise<string | null> {
  if (kind === "vo") {
    if (!pool) {
      return null;
    }
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.moveadvisor_marketplace_vo_offers') IS NOT NULL AS exists`
    );
    return rows[0]?.exists ? "moveadvisor_marketplace_vo_offers" : null;
  }

  return resolveOffersTableName();
}

export async function updateMarketTableRow(input: {
  kind: MarketEditableTableKind;
  id: string;
  values: Record<string, unknown>;
}): Promise<MarketVoTableRow | null> {
  if (!pool) {
    return null;
  }

  const rowId = String(input.id || "").trim();
  if (!rowId) {
    return null;
  }

  const tableName = await resolveEditableMarketTableName(input.kind);
  if (!tableName) {
    return null;
  }

  const { rows: columnRows } = await pool.query<{ column_name: string; is_nullable: string }>(
    `
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  );

  const tableColumns = new Set(columnRows.map((row) => row.column_name));
  const notNullColumns = new Set(columnRows.filter((row) => row.is_nullable === "NO").map((row) => row.column_name));
  if (!tableColumns.has("id")) {
    return null;
  }

  const protectedColumns = new Set(["id", "created_at", "first_seen_at", "scraped_at"]);
  const requestedEntries = Object.entries(input.values || {});
  const sanitizedEntries = requestedEntries
    .filter(([column]) => tableColumns.has(column) && !protectedColumns.has(column))
    .filter(([, value]) => typeof value !== "object" || value === null)
    .map(([column, value]) => [column, value === "" ? null : value] as const)
    // Nunca poner NULL en una columna NOT NULL → se omite el campo (mantiene el valor actual) en vez de romper el guardado
    .filter(([column, value]) => !(value === null && notNullColumns.has(column)));

  if (sanitizedEntries.length === 0) {
    const { rows } = await pool.query<MarketVoTableRow>(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE id = $1 LIMIT 1`,
      [rowId]
    );
    return rows[0] || null;
  }

  const values: unknown[] = [];
  const setClauses = sanitizedEntries.map(([column, value], index) => {
    values.push(value);
    return `${quoteIdentifier(column)} = $${index + 1}`;
  });

  if (tableColumns.has("updated_at") && !sanitizedEntries.some(([column]) => column === "updated_at")) {
    setClauses.push(`${quoteIdentifier("updated_at")} = NOW()`);
  }

  values.push(rowId);

  const query = `
    UPDATE ${quoteIdentifier(tableName)}
    SET ${setClauses.join(", ")}
    WHERE id = $${values.length}
    RETURNING *
  `;

  const { rows } = await pool.query<MarketVoTableRow>(query, values);
  return rows[0] || null;
}

export async function importMarketVoOffersRows(inputRows: Array<Record<string, unknown>>): Promise<MarketImportResult> {
  if (!pool) {
    return { processed: 0, inserted: 0, updated: 0, skipped: 0 };
  }

  const tableName = await resolveEditableMarketTableName("vo");
  if (!tableName) {
    return { processed: 0, inserted: 0, updated: 0, skipped: inputRows.length };
  }

  const { rows: columnRows } = await pool.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  );

  const tableColumns = new Set(columnRows.map((row) => row.column_name));
  const normalizedToColumn = new Map<string, string>();
  for (const column of tableColumns) {
    normalizedToColumn.set(normalizeImportColumnName(column), column);
  }

  const numberColumns = new Set([
    "price",
    "year",
    "mileage",
    "displacement",
    "portal_score",
    "warranty_months",
  ]);
  const booleanColumns = new Set(["has_guarantee_seal", "is_active"]);
  const readOnlyColumns = new Set(["created_at", "first_seen_at", "scraped_at"]);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let index = 0; index < inputRows.length; index += 1) {
    const sourceRow = inputRows[index];
    if (!sourceRow || typeof sourceRow !== "object") {
      skipped += 1;
      continue;
    }

    const mapped: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(sourceRow)) {
      const normalized = normalizeImportColumnName(rawKey);
      const column = normalizedToColumn.get(normalized);
      if (!column || readOnlyColumns.has(column)) {
        continue;
      }

      if (numberColumns.has(column)) {
        mapped[column] = parseImportNumber(rawValue);
        continue;
      }
      if (booleanColumns.has(column)) {
        mapped[column] = parseImportBoolean(rawValue);
        continue;
      }

      if (rawValue === "") {
        mapped[column] = null;
      } else {
        mapped[column] = rawValue;
      }
    }

    const idCandidate = String(mapped.id ?? "").trim();
    mapped.id = idCandidate || `vo_import_${Date.now()}_${index}`;

    if (mapped.is_active === null || mapped.is_active === undefined) {
      mapped.is_active = true;
    }

    const insertColumns = Object.keys(mapped).filter((column) => tableColumns.has(column));
    if (insertColumns.length === 0 || !insertColumns.includes("id")) {
      skipped += 1;
      continue;
    }

    const insertValues = insertColumns.map((column) => mapped[column]);
    const placeholders = insertColumns.map((_, placeholderIndex) => `$${placeholderIndex + 1}`);
    const updateColumns = insertColumns.filter((column) => column !== "id");
    const updateClauses = updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);
    if (tableColumns.has("updated_at")) {
      updateClauses.push(`${quoteIdentifier("updated_at")} = NOW()`);
    }

    if (updateClauses.length === 0) {
      skipped += 1;
      continue;
    }

    const query = `
      INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns.map((column) => quoteIdentifier(column)).join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (id)
      DO UPDATE SET ${updateClauses.join(", ")}
      RETURNING (xmax = 0) AS inserted
    `;

    const { rows } = await pool.query<{ inserted: boolean }>(query, insertValues);
    if (rows[0]?.inserted) {
      inserted += 1;
    } else {
      updated += 1;
    }
    processed += 1;
  }

  return { processed, inserted, updated, skipped };
}

export async function listMarketOffersTable(): Promise<MarketOffersTableResult> {
  if (!pool) {
    return { columns: [], rows: [] };
  }

  const tableName = await resolveOffersTableName();
  if (!tableName) {
    return { columns: [], rows: [] };
  }

  const { rows } = await pool.query<MarketVoTableRow>(
    `
    SELECT *
    FROM ${tableName}
    ORDER BY last_seen_at DESC NULLS LAST
    `
  );

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows };
}
