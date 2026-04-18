export async function fetchSheet({ sheetId, gid = "0" }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const json = JSON.parse(text.substring(47, text.length - 2)); // GViz wrapper
  const cols = json.table.cols.map(c => c.label || c.id);
  return json.table.rows.map(r => {
    const obj = {};
    cols.forEach((col, i) => (obj[col] = r.c[i]?.v ?? ""));
    return obj;
  });
}

export function slugify(s = "") {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}
