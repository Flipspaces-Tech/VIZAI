const SHEET_ID = process.env.REACT_APP_ALLOWLIST_SHEET_ID;
const GID = process.env.REACT_APP_ALLOWLIST_GID;

const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}&cb=${Date.now()}`;


let _cache = { at: 0, allowed: new Set() }; // 5 min cache

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field.trim()); field = ""; }
      else if (c === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
  }
  if (field.length || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

const norm = (s = "") => String(s).trim().toLowerCase();

async function loadAllowlist() {
  const now = Date.now();
  if (_cache.allowed.size && now - _cache.at < 5 * 60 * 1000) return _cache.allowed;

  if (!SHEET_ID || !GID) return new Set();

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url, { cache: "no-store" });
  const csv = await res.text();

  const rows = parseCSV(csv);
  if (!rows.length) return new Set();

  const headers = rows[0].map(norm);
  const iStatus = headers.indexOf("status");
  const iUser = headers.indexOf("user");

  const allowed = new Set();
  rows.slice(1).forEach((r) => {
    const status = norm(r[iStatus] || "");
    const email = norm(r[iUser] || "");
    if (status === "active" && email.includes("@")) allowed.add(email);
  });

  _cache = { at: now, allowed };
  return allowed;
}

export async function isEmailAllowed(email) {
  const e = norm(email);
  if (!e) return false;

  if (e.endsWith("@flipspaces.com")) return true; // always allowed internal
  const allowed = await loadAllowlist();
  return allowed.has(e);
}
export function resetAllowlistCache() {
  _cache = { at: 0, allowed: new Set() };
}
