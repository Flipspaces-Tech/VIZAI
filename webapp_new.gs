/**************************************
 * PixelStreaming Web App (Unified)
 * - getappid: lookup App ID by Build Name
 * - proxyget: HTTPS download proxy for HTTP image URLs
 * - listscreenshots: list Drive screenshots for build
 * - POST saveScreenshotUrl: save EC2 image → Drive + trigger refresh JSON
 **************************************/

const SHEET_ID       = '180yy7lM0CCtiAtSr87uEm3lewU-pIdvLMGl6RXBvf8o';
const SHEET_NAME     = 'Sheet1';  // Tab name for Build→AppId lookup
const ALLOWED_HOST   = 'ec2-65-0-89-107.ap-south-1.compute.amazonaws.com'; // EC2 host
const ROOT_FOLDER_ID = '1wd_7PIAbJtqeO8kZmvdhx0G52tV_mTgB';               // Pixel_Streaming_SS

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

/* ========= GET HANDLER ========= */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || '').toLowerCase();

    /* ---------- 0) HEALTH CHECK ---------- */
    if (action === 'ping') {
      return out({ ok: true, pong: true });
    }

    /* ---------- 1) BUILD → APP ID LOOKUP ---------- */
    if (action === 'getappid') {
      const buildQuery = String(p.build || '').trim();
      if (!buildQuery) return out({ ok:false, error:'MISSING_BUILD_PARAM' });

      const ss = SpreadsheetApp.openById(SHEET_ID);
      if (!ss) return out({ ok:false, error:'NO_SPREADSHEET' });

      const sh = ss.getSheetByName(SHEET_NAME);
      if (!sh) return out({ ok:false, error:'SHEET_TAB_NOT_FOUND', tab:SHEET_NAME });

      const values = sh.getDataRange().getDisplayValues();
      if (!values.length) return out({ ok:false, error:'EMPTY_SHEET' });

      const header    = values.shift();
      const colBuild  = findCol(header, 'Build Name');
      const colSlot   = findCol(header, 'Project Slot ID');
      const colStatus = findCol(header, 'Status');

      if (colBuild === -1 || colSlot === -1) {
        return out({
          ok:false,
          error:'MISSING_COLUMNS',
          need:['Build Name','Project Slot ID']
        });
      }

      const q   = norm(buildQuery);
      let pick  = null;

      values.forEach(row => {
        const b      = norm(row[colBuild]);
        const slot   = String(row[colSlot] || '').trim();
        const status = colStatus >= 0 ? norm(row[colStatus]) : '';
        if (!slot) return;
        if (b === q || b.indexOf(q) >= 0) {
          pick = { appId: slot, status };
        }
      });

      if (!pick) return out({ ok:false, error:'BUILD_NOT_FOUND', query:buildQuery });
      return out({ ok:true, appId: pick.appId, status: pick.status });
    }

    /* ---------- 2) HTTPS PROXY FOR HTTP FILES ---------- */
    if (action === 'proxyget') {
      const url = String(p.url || '').trim();
      if (!/^http:\/\//i.test(url))
        return out({ ok:false, error:'Only http:// URLs allowed' });

      const host = (url.match(/^http:\/\/([^/]+)/i) || [])[1] || '';
      if (ALLOWED_HOST && host !== ALLOWED_HOST)
        return out({ ok:false, error:'Host not allowed: ' + host });

      try {
        const resp = UrlFetchApp.fetch(url, {
          muteHttpExceptions: true,
          followRedirects: true,
        });
        const code = resp.getResponseCode();
        if (code < 200 || code >= 300)
          return out({ ok:false, error:'Upstream ' + code });

        const blob     = resp.getBlob();
        const filename = (url.split('/').pop() || 'file.bin').split('?')[0];

        const ext     = filename.toLowerCase().split('.').pop();
        const mimeMap = {
          png:  'image/png',
          jpg:  'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp'
        };
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
                body{
                  background:#111;color:#ddd;
                  display:grid;place-items:center;
                  font:14px/1.4 system-ui,Segoe UI,Roboto,sans-serif
                }
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
          </html>
        `;
        return HtmlService.createHtmlOutput(html).setTitle('Download ' + filename);
      } catch (err) {
        return out({ ok:false, error:'Proxy error: ' + (err && err.message || err) });
      }
    }

    /* ---------- 3) LIST SCREENSHOTS FOR A BUILD ---------- */
    if (action === 'listscreenshots') {
      const buildQuery = String(p.build || '').trim();
      if (!buildQuery)     return out({ ok:false, error:'MISSING_BUILD_PARAM' });
      if (!ROOT_FOLDER_ID) return out({ ok:false, error:'NO_ROOT_FOLDER_ID' });

      const root           = DriveApp.getFolderById(ROOT_FOLDER_ID);
      const buildNameClean = buildQuery.replace(/[^\w\-]+/g, '_').trim() || 'UnknownBuild';

      const itBuild = root.getFoldersByName(buildNameClean);
      if (!itBuild.hasNext()) {
        return out({ ok:true, build: buildNameClean, groups: [] });
      }
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
          items.push({
            id,
            url,
            created: created.toISOString(),
          });
        }

        if (items.length) {
          groups.push({
            group: folder.getName(),          // session folder name
            ts:    folderCreated.toISOString(),
            items,
          });
        }
      }

      groups.sort(function(a, b) {
        return (b.ts || '').localeCompare(a.ts || '');
      });

      return out({ ok:true, build: buildNameClean, groups });
    }

    /* ---------- UNKNOWN ACTION ---------- */
    return out({ ok:false, error:'UNKNOWN_ACTION' });

  } catch (err) {
    return out({ ok:false, error:String(err && err.message || err) });
  }
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

  const root     = DriveApp.getFolderById(ROOT_FOLDER_ID);  // Pixel_Streaming_SS
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

/* ========= POST HANDLER =========
 * Expect JSON or form data: { action:"saveScreenshotUrl", buildName, sessionId, imageUrl }
 * ===================================== */
function doPost(e) {
  try {
    var data  = {};
    var ctype = (e && e.postData && e.postData.type) || '';

    if (ctype.indexOf('application/json') === 0) {
      data = JSON.parse(e.postData.contents || '{}');
    } else {
      data = e.parameter || {};
    }

    var action = String(data.action || '').toLowerCase();

    // If no explicit action but we have imageUrl, assume saveScreenshotUrl
    if (!action && data.imageUrl) {
      action = 'savescreenshoturl';
    }

    if (action === 'savescreenshoturl') {
      if (!ROOT_FOLDER_ID)
        return out({ ok:false, error:'NO_ROOT_FOLDER_ID' });

      var imageUrl  = String(data.imageUrl || '').trim();
      var buildName = String(data.buildName || '').trim() || 'UnknownBuild';
      var sessionId = String(data.sessionId || '').trim() || '';

      if (!imageUrl)
        return out({ ok:false, error:'MISSING_IMAGE_URL' });

      var hostMatch = imageUrl.match(/^http:\/\/([^/]+)/i);
      var host      = hostMatch ? hostMatch[1] : '';
      if (ALLOWED_HOST && host !== ALLOWED_HOST) {
        return out({ ok:false, error:'Host not allowed: ' + host });
      }

      var resp = UrlFetchApp.fetch(imageUrl, {
        muteHttpExceptions: true,
        followRedirects:   true,
      });
      var code = resp.getResponseCode();
      if (code < 200 || code >= 300) {
        return out({ ok:false, error:'Upstream ' + code });
      }

      var root           = DriveApp.getFolderById(ROOT_FOLDER_ID);
      var buildNameClean = buildName.replace(/[^\w\-]+/g, '_').trim() || 'UnknownBuild';
      var buildFolder    = getOrCreateSubFolder(root, buildNameClean);

      // ====== PER-SESSION FOLDER LOGIC ======
      var tz  = Session.getScriptTimeZone() || 'Asia/Kolkata';
      var now = new Date();

      var sessionFolderName;
      if (sessionId) {
        // clean sessionId for folder name
        sessionFolderName = sessionId
          .replace(/[^\w\-]+/g, '_')
          .trim();
      } else {
        // fallback: time-based name if no sessionId
        sessionFolderName = Utilities.formatDate(now, tz, "yyyy-MM-dd'_'HHmm");
      }

      // One folder per session under this build
      var groupFolder = getOrCreateSubFolder(buildFolder, sessionFolderName);

      var originalName = (imageUrl.split('/').pop() || 'screenshot.png').split('?')[0];
      var extMatch     = originalName.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/);
      var ext          = extMatch ? extMatch[1] : 'png';

      var fileName = Utilities.formatDate(now, tz, "'shot_'yyyyMMdd_HHmmss'.'") + ext;

      var blob = resp.getBlob().setName(fileName);
      var file = groupFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // 🔔 update refresh JSON so frontend can auto-refresh
      var refreshUrl = triggerRefresh(buildNameClean);

      return out({
        ok:      true,
        build:   buildNameClean,
        session: sessionId,
        group:   sessionFolderName,          // session folder name
        ts:      now.toISOString(),
        fileId:  file.getId(),
        viewUrl: "https://drive.google.com/uc?export=view&id=" + file.getId(),
        refreshUrl: refreshUrl,
      });
    }

    return out({
      ok:false,
      error:'UNKNOWN_ACTION_POST',
      got: action,
      dataKeys: Object.keys(data),
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
