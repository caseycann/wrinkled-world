// GET /api/records?table=<name or id>&max=<n>
// Fetches records from one table. Falls back to AIRTABLE_TABLE if no table is given.
export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE;
  const { AIRTABLE_TABLE } = process.env;
  if (!token || !base) {
    return res.status(500).json({ error: "AIRTABLE_TOKEN and AIRTABLE_BASE must be set" });
  }

  const table = req.query.table || AIRTABLE_TABLE;
  if (!table) return res.status(400).json({ error: "Pass ?table=<name> or set AIRTABLE_TABLE" });

  const max = Math.min(parseInt(req.query.max, 10) || 50, 100);
  const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", String(max));

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error ?? data });

  res.setHeader("Cache-Control", "s-maxage=30");
  res.status(200).json({ table, records: data.records });
}
