import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { importMarketVoOffersRows, listMarketOffersTable, listMarketVoOffers, listMarketVoOffersTable, updateMarketTableRow } from "../data/store.js";

export const marketRouter = Router();

marketRouter.get("/market/vo-offers", requireRole(["admin", "support", "operations", "sales"]), async (req, res) => {
  try {
    const data = await listMarketVoOffers({
      q: String(req.query.q || ""),
      limit: Number(req.query.limit || 80),
    });
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: "market_vo_offers_list_failed", detail: error instanceof Error ? error.message : String(error) });
  }
});

marketRouter.get("/market/vo-offers/table", requireRole(["admin", "support", "operations", "sales"]), async (_req, res) => {
  try {
    const data = await listMarketVoOffersTable();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: "market_vo_offers_table_failed", detail: error instanceof Error ? error.message : String(error) });
  }
});

marketRouter.get("/market/offers/table", requireRole(["admin", "support", "operations", "sales"]), async (_req, res) => {
  try {
    const data = await listMarketOffersTable();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: "market_offers_table_failed", detail: error instanceof Error ? error.message : String(error) });
  }
});

marketRouter.patch("/market/table-row", requireRole(["admin", "support", "operations", "sales"]), async (req, res) => {
  try {
    const table = String(req.body?.table || "").trim();
    const id = String(req.body?.id || "").trim();
    const values = req.body?.values && typeof req.body.values === "object" ? req.body.values : {};

    if (!table || !id || !["vo", "offers"].includes(table)) {
      res.status(400).json({ ok: false, error: "market_update_invalid_input" });
      return;
    }

    const data = await updateMarketTableRow({ kind: table as "vo" | "offers", id, values });
    if (!data) {
      res.status(404).json({ ok: false, error: "market_update_row_not_found" });
      return;
    }

    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: "market_update_failed", detail: error instanceof Error ? error.message : String(error) });
  }
});

marketRouter.post("/market/vo-offers/import", requireRole(["admin", "support", "operations", "sales"]), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      res.status(400).json({ ok: false, error: "market_vo_import_no_rows" });
      return;
    }

    const data = await importMarketVoOffersRows(rows as Array<Record<string, unknown>>);
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: "market_vo_import_failed", detail: error instanceof Error ? error.message : String(error) });
  }
});
