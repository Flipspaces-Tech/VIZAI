/**************************************
 * PixelStreaming Web App (Unified)
 * - GET:
 *    - action=ping
 *    - action=getappid          (Build(+ver) -> AppId)
 *    - action=proxyget          (http:// proxy download UI for browser)
 *    - action=listscreenshots   (Drive listing)
 * - POST:
 *    - action=saveScreenshotUrl (fetch image url -> Drive)
 **************************************/

const SHEET_ID   = '180yy7lM0CCtiAtSr87uEm3lewU-pIdvLMGl6RXBvf8o';
const SHEET_NAME = 'Vizwalk Projects Streampixel Data';  // Tab name for Build→AppId lookup

// ===== SSRF Protection: allow only known screenshot hosts =====
const ALLOWED_HOSTS = new Set([
  'ec2-65-0-89-107.ap-south-1.compute.amazonaws.com', // EC2 (http)
  's3-vizwalk-dev.flipspaces.app',                    // S3 dev (https)
  // 's3-vizwalk.flipspaces.app',                     // S3 prod (optional)
]);

const ALLOWED_SUFFIXES = [
  '.flipspaces.app',
  '.amazonaws.com',
];

// Root Drive folder: Pixel_Streaming_SS
const ROOT_FOLDER_ID = '1wd_7PIAbJtqeO8kZmvdhx0G52tV_mTgB';

/* ========= COMMON HELPERS ========= */

function norm(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function findCol(header, name) {
  const t = norm(name);
  return header.findIndex(h => norm(h) === t);
}

function getOrCreateSubFolder(parent, name) {
  const n = String(name || '').trim() || 'Untitled';
  const it = parent.getFoldersByName(n);
  if (it.hasNext()) return it.next();
  return parent.createFolder(n);
}

function isAllowedHost(host) {
  host = String(host || '').toLowerCase().trim();
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_SUFFIXES.some(suf => host === suf.slice(1) || host.endsWith(suf));
}

// Normalize URL so fetch won't break on spaces etc.
function normalizeImageUrl(raw) {
  raw = String(raw || '').trim();
  if (!raw) return '';
  // spaces → %20
  raw = raw.replace(/ /g, '%20');
  return raw;
}

/* ========= REFRESH SIGNAL WRITER =========
 * Writes / updates vizwalk_refresh_signal.json in Pixel_Streaming_SS
 * { build: <buildName>, ts: <timestamp> }
 */
function triggerRefresh(buildName) {
  const refreshFileName = 'vizwalk_refresh_signal.json';

  const data = JSON.stringify({
    build: buildName,
    ts: Date.now(),
  });

  const root     = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const existing = root.getFilesByName(refreshFileName);

  let file;
  if (existing.hasNext()) {
    file = existing.next();
    file.setContent(data);
  } else {
    file = root.createFile(refreshFileName, data, 'application/json');
  }

  file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/* ========= GET HANDLER ========= */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || '').toLowerCase();

    /* ---------- 0) HEALTH CHECK ---------- */
    if (action === 'ping') {
      return out({ ok: true, pong: true });
    }

    /* ---------- 1) BUILD(+VERSION) → APP ID LOOKUP ---------- */
    if (action === 'getappid') {
      const buildQuery = String(p.build || '').trim();
      const verQuery   = String(p.ver   || '').trim();
      if (!buildQuery) return out({ ok:false, error:'MISSING_BUILD_PARAM' });

      const ss = SpreadsheetApp.openById(SHEET_ID);
      if (!ss) return out({ ok:false, error:'NO_SPREADSHEET' });

      const sh = ss.getSheetByName(SHEET_NAME);
      if (!sh) return out({ ok:false, error:'SHEET_TAB_NOT_FOUND', tab:SHEET_NAME });

      const values = sh.getDataRange().getDisplayValues();
      if (!values.length) return out({ ok:false, error:'EMPTY_SHEET' });

      const header      = values.shift();
      const colBuild    = findCol(header, 'Build Name');
      const colSlot     = findCol(header, 'Project Slot ID');
      const colStatus   = findCol(header, 'Status');
      const colVersion  = findCol(header, 'Build Version');

      if (colBuild === -1 || colSlot === -1) {
        return out({
          ok:false,
          error:'MISSING_COLUMNS',
          need:['Build Name','Project Slot ID','Build Version']
        });
      }

      const qBuild = norm(buildQuery);
      const qVer   = norm(verQuery);

      let exactMatch = null;
      let buildOnly  = null;

      for (let i = 0; i < values.length; i++) {
        const row    = values[i];
        const bRaw   = row[colBuild];
        const b      = norm(bRaw);
        const slot   = String(row[colSlot] || '').trim();
        const status = colStatus >= 0 ? norm(row[colStatus]) : '';
        const vRaw   = colVersion >= 0 ? row[colVersion] : '';
        const v      = norm(vRaw);

        if (!slot) continue;
        if (!(b === qBuild || b.indexOf(qBuild) >= 0)) continue;
        if (colStatus >= 0 && status && status !== 'active') continue;

        if (qVer && colVersion >= 0) {
          if (v === qVer) {
            exactMatch = { appId: slot, status, build: bRaw, version: vRaw };
            break;
          } else if (!buildOnly) {
            buildOnly = { appId: slot, status, build: bRaw, version: vRaw };
          }
        } else {
          buildOnly = buildOnly || { appId: slot, status, build: bRaw, version: vRaw };
        }
      }

      if (exactMatch) {
        return out({ ok:true, appId: exactMatch.appId, status: exactMatch.status, build: exactMatch.build, version: exactMatch.version });
      }

      if (qVer) {
        if (buildOnly) {
          return out({
            ok:false,
            error:'BUILD_VERSION_NOT_FOUND',
            queryBuild: buildQuery,
            queryVersion: verQuery,
            closest: { build: buildOnly.build, version: buildOnly.version, appId: buildOnly.appId }
          });
        }
        return out({ ok:false, error:'BUILD_VERSION_NOT_FOUND', queryBuild: buildQuery, queryVersion: verQuery });
      }

      if (buildOnly) {
        return out({ ok:true, appId: buildOnly.appId, status: buildOnly.status, build: buildOnly.build, version: buildOnly.version });
      }

      return out({ ok:false, error:'BUILD_NOT_FOUND', query: buildQuery });
    }

    /* ---------- 2) HTTPS PROXY FOR HTTP FILES ---------- */
    if (action === 'proxyget') {
      const urlRaw = String(p.url || '').trim();
      if (!/^http:\/\//i.test(urlRaw)) {
        return out({ ok:false, error:'Only http:// URLs allowed' });
      }

      // parse host (regex, no URL())
      const m = urlRaw.match(/^http:\/\/([^\/?#]+)/i);
      const host = m ? String(m[1]).toLowerCase() : '';
      const hostNoPort = host.split(':')[0];

      if (!isAllowedHost(hostNoPort)) {
        return out({ ok:false, error:'Host not allowed: ' + hostNoPort });
      }

      try {
        const resp = UrlFetchApp.fetch(urlRaw, {
          muteHttpExceptions: true,
          followRedirects: true,
        });
        const code = resp.getResponseCode();
        if (code < 200 || code >= 300) return out({ ok:false, error:'Upstream ' + code });

        const blob     = resp.getBlob();
        const filename = (urlRaw.split('/').pop() || 'file.bin').split('?')[0];

        const ext     = filename.toLowerCase().split('.').pop();
        const mimeMap = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif' };
        const mime = mimeMap[ext] || blob.getContentType() || 'application/octet-stream';

        const base64 = Utilities.base64Encode(blob.getBytes());

        const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Downloading ${filename}</title>
<style>
html,body{height:100%;margin:0}
body{background:#111;color:#ddd;display:grid;place-items:center;font:14px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
</style>
</head>
<body>
<div>Preparing download…</div>
<script>
(function(){
  try {
    var b64  = "${base64}";
    var name = ${JSON.stringify(filename)};
    var type = "${mime}";
    var chars = atob(b64);
    var len   = chars.length;
    var bytes = new Uint8Array(len);
    for (var i=0;i<len;i++) bytes[i] = chars.charCodeAt(i);
    var file = new Blob([bytes], { type: type });

    var a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();

    try { window.opener && window.opener.postMessage('vizwalk:downloaded','*'); } catch(e) {}
    var tryClose = function(){ try { window.close(); } catch(e) {} };
    setTimeout(tryClose, 1500);
    setTimeout(tryClose, 3000);
    setTimeout(function(){
      try { window.location.replace('about:blank'); } catch(e) {}
      setTimeout(tryClose, 150);
    }, 6000);
  } catch (err) {
    document.body.innerHTML = '<pre style="color:#f88">'+err+'</pre>';
  }
})();
</script>
</body>
</html>`;
        return HtmlService.createHtmlOutput(html).setTitle('Download ' + filename);

      } catch (err) {
        return out({ ok:false, error:'Proxy error: ' + (err && err.message || err) });
      }
    }

    /* ---------- 3) LIST SCREENSHOTS FOR A BUILD ---------- */
    if (action === 'listscreenshots') {
      const buildQuery = String(p.build || '').trim();
      if (!buildQuery) return out({ ok:false, error:'MISSING_BUILD_PARAM' });
      if (!ROOT_FOLDER_ID) return out({ ok:false, error:'NO_ROOT_FOLDER_ID' });

      const root           = DriveApp.getFolderById(ROOT_FOLDER_ID);
      const buildNameClean = buildQuery.replace(/[^\w\-]+/g, '_').trim() || 'UnknownBuild';

      const itBuild = root.getFoldersByName(buildNameClean);
      if (!itBuild.hasNext()) return out({ ok:true, build: buildNameClean, groups: [] });

      const buildFolder = itBuild.next();
      const grpIter = buildFolder.getFolders();
      const groups  = [];

      while (grpIter.hasNext()) {
        const folder        = grpIter.next();
        const folderCreated = folder.getDateCreated();
        const files         = folder.getFiles();
        const items         = [];

        while (files.hasNext()) {
          const f       = files.next();
          const id      = f.getId();
          const created = f.getDateCreated();
          const url     = `https://drive.google.com/uc?export=view&id=${id}`;
          items.push({ id, url, created: created.toISOString() });
        }

        if (items.length) {
          groups.push({
            group: folder.getName(),
            ts: folderCreated.toISOString(),
            items,
          });
        }
      }

      groups.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      return out({ ok:true, build: buildNameClean, groups });
    }

    return out({ ok:false, error:'UNKNOWN_ACTION' });

  } catch (err) {
    return out({ ok:false, error:String(err && err.message || err) });
  }
}

/* ========= POST HANDLER =========
 * Expect JSON or form data: { action:"saveScreenshotUrl", buildName, sessionId, imageUrl }
 */
function doPost(e) {
  try {
    let data  = {};
    const ctype = (e && e.postData && e.postData.type) || '';

    if (ctype.indexOf('application/json') === 0) {
      data = JSON.parse(e.postData.contents || '{}');
    } else {
      data = e.parameter || {};
    }

    let action = String(data.action || '').toLowerCase();
    if (!action && data.imageUrl) action = 'savescreenshoturl';

    if (action !== 'savescreenshoturl') {
      return out({ ok:false, error:'UNKNOWN_ACTION_POST', got: action, dataKeys: Object.keys(data) });
    }

    if (!ROOT_FOLDER_ID) return out({ ok:false, error:'NO_ROOT_FOLDER_ID' });

    const imageUrlRaw = String(data.imageUrl || '').trim();
    const buildName   = String(data.buildName || '').trim() || 'UnknownBuild';
    const sessionId   = String(data.sessionId || '').trim() || '';

    if (!imageUrlRaw) return out({ ok:false, error:'MISSING_IMAGE_URL' });

    // ✅ normalize BEFORE parsing/fetching
    const imageUrl = normalizeImageUrl(imageUrlRaw);

    // ✅ parse protocol + host WITHOUT URL() (most compatible)
    const m = imageUrl.match(/^(https?):\/\/([^\/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
    if (!m) {
      return out({ ok:false, error:'INVALID_IMAGE_URL', gotRaw: imageUrlRaw, gotNorm: imageUrl });
    }

    const proto = (m[1] || '').toLowerCase() + ':';      // "http:" or "https:"
    const host  = String(m[2] || '').toLowerCase();      // may include port
    const hostNoPort = host.split(':')[0];
    const path = (m[3] || '/');

    if (proto !== 'http:' && proto !== 'https:') {
      return out({ ok:false, error:'ONLY_HTTP_HTTPS_ALLOWED', got: proto, gotNorm: imageUrl });
    }

    if (!isAllowedHost(hostNoPort)) {
      return out({ ok:false, error:'Host not allowed: ' + hostNoPort, gotNorm: imageUrl });
    }

    // ✅ fetch image bytes
    const resp = UrlFetchApp.fetch(imageUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
    });

    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      return out({ ok:false, error:'Upstream ' + code, gotNorm: imageUrl });
    }

    // ✅ save to Drive
    const root           = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const buildNameClean = buildName.replace(/[^\w\-]+/g, '_').trim() || 'UnknownBuild';
    const buildFolder    = getOrCreateSubFolder(root, buildNameClean);

    const tz  = Session.getScriptTimeZone() || 'Asia/Kolkata';
    const now = new Date();

    let sessionFolderName;
    if (sessionId) {
      sessionFolderName = sessionId.replace(/[^\w\-]+/g, '_').trim();
    } else {
      sessionFolderName = Utilities.formatDate(now, tz, "yyyy-MM-dd'_'HHmm");
    }

    const groupFolder = getOrCreateSubFolder(buildFolder, sessionFolderName);

    const originalName = (path.split('/').pop() || 'screenshot.png').split('?')[0];
    const extMatch     = originalName.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/);
    const ext          = extMatch ? extMatch[1] : 'png';

    const fileName = Utilities.formatDate(now, tz, "'shot_'yyyyMMdd_HHmmss'.'") + ext;

    const blob = resp.getBlob().setName(fileName);
    const file = groupFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 🔔 update refresh JSON so frontend can auto-refresh
    const refreshUrl = triggerRefresh(buildNameClean);

    return out({
      ok: true,
      build: buildNameClean,
      session: sessionId,
      group: sessionFolderName,
      ts: now.toISOString(),
      fileId: file.getId(),
      viewUrl: "https://drive.google.com/uc?export=view&id=" + file.getId(),
      refreshUrl: refreshUrl,
      sourceUrl: imageUrl,
    });

  } catch (err) {
    return out({ ok:false, error:String((err && err.message) || err) });
  }
}

/* Helper to force auth */
function dummyAuthorize() {
  const f = DriveApp.getRootFolder();
  Logger.log(f.getName());
}
