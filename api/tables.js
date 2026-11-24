// GET /api/tables — lists the tables in the Airtable base (uses the Meta API).
// Requires the PAT to have the `schema.bases:read` scope.
export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE;
  if (!token || !base) {
    return res.status(500).json({ error: "AIRTABLE_TOKEN and AIRTABLE_BASE must be set" });
  }

  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${base}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error ?? data });

  res.setHeader("Cache-Control", "s-maxage=60");
  res.status(200).json({
    tables: data.tables.map((t) => ({
      id: t.id,
      name: t.name,
      fields: t.fields.map((f) => ({ name: f.name, type: f.type })),
    })),
  });
}
