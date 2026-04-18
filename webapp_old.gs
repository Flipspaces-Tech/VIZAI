/**************************************
 * PixelStreaming AppID Lookup (Bound)
 * Matches Build Name → Project Slot ID
 **************************************/

const SHEET_NAME = 'Sheet1';

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = (p.action || '').toLowerCase();

    if (action === 'ping') return out({ ok: true, pong: true });

    if (action === 'getappid') {
      const buildQuery = String(p.build || '').trim();
      if (!buildQuery) return out({ ok:false, error:'MISSING_BUILD_PARAM' });

      // Because this script is bound to the sheet, getActive() is safe.
      const ss = SpreadsheetApp.getActive();
      if (!ss) return out({ ok:false, error:'NO_ACTIVE_SPREADSHEET' });

      const sh = ss.getSheetByName(SHEET_NAME);
      if (!sh) return out({ ok:false, error:'SHEET_TAB_NOT_FOUND', tab:SHEET_NAME });

      const values = sh.getDataRange().getDisplayValues();
      if (!values.length) return out({ ok:false, error:'EMPTY_SHEET' });

      const header = values.shift();
      const colBuild = findCol(header, 'Build Name');
      const colSlot  = findCol(header, 'Project Slot ID');
      const colStatus = findCol(header, 'Status');

      if (colBuild === -1 || colSlot === -1) {
        return out({ ok:false, error:'MISSING_COLUMNS', need:['Build Name','Project Slot ID'] });
      }

      const q = norm(buildQuery);
      let pick = null;

      for (const row of values) {
        const b = norm(row[colBuild]);
        const slot = String(row[colSlot] || '').trim();
        const status = colStatus >= 0 ? norm(row[colStatus]) : '';
        if (!slot) continue;

        if (b === q || b.includes(q)) {
          pick = { appId: slot, status };
          if (status === 'active') break; // prefer active
        }
      }

      if (!pick) return out({ ok:false, error:'BUILD_NOT_FOUND', query:buildQuery });
      return out({ ok:true, appId: pick.appId, status: pick.status });
    }

    return out({ ok:false, error:'UNKNOWN_ACTION' });
  } catch (err) {
    return out({ ok:false, error:String(err && err.message || err) });
  }
}

// === Helpers ===
function findCol(header, name) {
  const t = norm(name);
  return header.findIndex(h => norm(h) === t);
}
function norm(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
