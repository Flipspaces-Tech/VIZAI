import { useState, useRef, useEffect } from 'react';
import { MayaQueryEngine } from '../components/MayaQueryEngine';
import { MayaQueryFilter } from '../components/MayaQueryFilter';
import Papa from "papaparse";
import { sttQueue, ttsQueue, processSTTQueue, processTTSQueue } from './SarvamService';
import './MayaIntroScreen.css';

// 🎨 IMPORT YOUR CUSTOM ICONS
import idleIcon from '../assets/maya icons/idle.png';
import listeningIcon from '../assets/maya icons/Listening.png';
import thinkingIcon from '../assets/maya icons/Thinking.png';
import talkingIcon from '../assets/maya icons/Talking.png';
import previewingIcon from '../assets/maya icons/Previewing.png';

// ============================================================================
// CSV STORAGE SYSTEM
// ============================================================================

let csvStorage = {
  sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  original: null,
  recommendations: null,
  queryContext: null,
  current: null,
  currentState: 'idle',
  completionPercent: 0
};

let queryQueue = [];
let apiResults = {};
let lastChangedCategories = [];
let lastPriceReflectionData = [];
let lastChangeWasPriceQuery = false;

// ============================================================================
// GOOGLE SHEETS CONFIGURATION
// ============================================================================
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbw_elUc3irWx6yy3X9JfF9AR7Z2sxoA3j9eZYRZdK_ty0b4iDis8OQpm0vo2AQN3Q9m/exec";


// ============================================================================
// CSV STORAGE FUNCTIONS
// ============================================================================

function storeRoomCSV(parsedRows, currentRoomName, source = 'CSV_RECEIVED_FROM_UNREAL') {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║ 📥 CSV RECEIVED FROM UNREAL            ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    console.error('❌ Invalid parsed rows');
    return false;
  }

  csvStorage.original = parsedRows;
  csvStorage.current = parsedRows;
  csvStorage.currentState = 'received';
  csvStorage.completionPercent = 0;

  window.csvStorage = csvStorage;

  console.log(`✅ CSV Stored Successfully: ${csvStorage.original.length} data rows\n`);

  // ✅ First Unreal CSV run: show full compact room summary.
  // ✅ Replacement CSV refresh: skip full summary because the changed-room price reflection
  //    is already logged inside onReceivedMsgFromRecEngine().
  const shouldLogInitialFullSummary = ![
    'replacement_sent_to_unreal',
    'receivedReplacementCsv',
    'received_replacement_csv',
  ].includes(source);

  if (shouldLogInitialFullSummary) {
    logPriceSummaryToConsole(
      csvStorage.current || csvStorage.original || [],
      currentRoomName,
      source || 'CSV_RECEIVED_FROM_UNREAL'
    );
  } else {
    console.log(`💰 PRICE SUMMARY SKIPPED — ${source} | Already logged changed room/category reflection.`);
  }

  const exported = {
    csvRows: csvStorage.current,
    metadata: {
      sessionId: csvStorage.sessionId,
      status: csvStorage.currentState,
      completionPercent: csvStorage.completionPercent,
      exportedAt: new Date().toISOString()
    }
  };

  window.lastExportedCSV = exported;

  if (GOOGLE_SHEET_URL) {
    saveToGoogleSheet(exported);
  } else {
    console.warn('⚠️ Google Sheet URL not configured');
  }

  return true;
}

// ============================================================================
// FIXED: onReceivedMsgFromRecEngine() - NO DOUBLE ESCAPING
// ============================================================================

function onReceivedMsgFromRecEngine(apiResponse, sendUpdatedCSVRowsToUnreal, currentRoomName, optionIndex = 0) {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║ 🎯 POPULATING RECOMMENDATIONS FROM API             ║");
  console.log("╚════════════════════════════════════════════════════╝\n");

  // ========== VALIDATION ==========
  if (!apiResponse || !apiResponse.categories) {
    console.error("❌ No categories in API response");
    return;
  }

  const sourceRows = (csvStorage.current && csvStorage.current.length > 0)
    ? csvStorage.current
    : csvStorage.original;

  if (!sourceRows || sourceRows.length === 0) {
    console.error("❌ No CSV stored");
    return;
  }

  // ========== ITERATE OVER EACH ROW FROM CURRENT CSV STATE ==========
  let updatedRows = sourceRows.map((row, index) => {
    console.log(`\n📍 Processing row ${index}:`);
    console.log(`   Category: ${row.Category}`);
    console.log(`   ProductSKU: ${row.ProductSKU}`);

    // ========== GET ORIGINAL VALUES (DON'T CHANGE) ==========
    const spaceName = row.SpaceName;
    const category = row.Category;
    const productName = row.ProductName;
    const productSku = row.ProductSKU;
    const productPrice = row.ProductPrice;
    const productQuantity = row.ProductQuantity;
    const finishes = row.Finishes;

    // ========== INITIALIZE UPDATED COLUMNS ==========
    let updatedProductName = "";
    let updatedProductSKU = "";
    let updatedProductPrice = productPrice;
    let updatedProductQuantity = productQuantity;
    let updatedFinishes = "";

    // ========== FIND MATCHING CATEGORY IN API RESPONSE ==========
    // Accept exact match OR CSV category that ends with the API category
    // (e.g. CSV "Conference Table" matches API "Table")
    const apiCategory = apiResponse.categories.find(c => {
      const apiCat = c.category.toUpperCase();
      const csvCat = (category || "").toUpperCase();
      return apiCat === csvCat || csvCat.endsWith(apiCat);
    });

    console.log(`   API Match: ${apiCategory ? "✅ FOUND" : "❌ NOT FOUND"}`);

    // ========== RULES ==========
    //
    // UpdatedProductName    → always copy ProductName as-is
    // UpdatedProductSKU     → always copy ProductSKU as-is
    // UpdatedProductPrice   → always copy ProductPrice as-is
    // UpdatedProductQuantity→ always copy ProductQuantity as-is
    // UpdatedFinishes       →
    //   - If API match found AND finish part starts with "StaticMeshComponent0":
    //       replace SKU segment (3rd colon part) with top API SKU
    //       e.g. "StaticMeshComponent0:NOT_FOUND:OldSKU" → "StaticMeshComponent0:NOT_FOUND:AW-ACCENT-43"
    //   - If finish part starts with anything else (FAbric, BodyFabric, TableTop, etc.):
    //       copy that part as-is (no change)
    //   - If no API match: copy entire Finishes as-is

    // ✅ Cols 7,9,10 — always copy originals
    updatedProductName = productName;
    updatedProductPrice = productPrice;
    updatedProductQuantity = productQuantity;

    // ========== DETECT FINISH TYPE ==========
    // Check if the FIRST finish part starts with StaticMeshComponent0
    const firstFinishPart = (finishes || "").trim().split(",")[0] || "";
    const firstPartName = firstFinishPart.split(":")[0]?.trim() || "";
    const isStaticMesh = firstPartName.toLowerCase().startsWith("staticmeshcomponent");

    console.log(`   Finish type: ${isStaticMesh ? "StaticMesh" : "Non-StaticMesh (FAbric/BodyFabric/etc)"}`);

    // ========== PICK TOP API ITEM ==========
    // New preferred format from RecEngine:
    // items: [{ sku, price, name/displayName/productName, type, category }]
    // Old fallback format:
    // skus: ["CH11", "CH04", ...]
    const apiItems = Array.isArray(apiCategory?.items) ? apiCategory.items : [];
    const apiSkus = Array.isArray(apiCategory?.skus) ? apiCategory.skus : [];

    let topApiItem = null;

    if (apiItems.length > 0) {
      const safeIndex = optionIndex % apiItems.length;
      topApiItem = apiItems[safeIndex];
      console.log(`   🎯 Using cached API item optionIndex ${optionIndex} → safeIndex ${safeIndex}/${apiItems.length - 1}`);
    } else if (apiSkus.length > 0) {
      const safeIndex = optionIndex % apiSkus.length;
      topApiItem = { sku: apiSkus[safeIndex] };
      console.log(`   🎯 Using cached API sku optionIndex ${optionIndex} → safeIndex ${safeIndex}/${apiSkus.length - 1}`);
    }

    const apiSku = String(topApiItem?.sku || "").trim();
    const apiPrice = topApiItem?.price ?? "";
    const apiName = String(
      topApiItem?.name ||
      topApiItem?.displayName ||
      topApiItem?.DisplayName ||
      topApiItem?.productName ||
      topApiItem?.ProductName ||
      ""
    ).trim();

    if (apiCategory && apiSku) {
      console.log(`   → Selected API SKU: "${apiSku}"`);
      console.log(`   → Selected API Price: "${apiPrice}"`);
      console.log(`   → Selected API Name: "${apiName || "NOT PROVIDED"}"`);

      if (isStaticMesh) {
        // StaticMeshComponent rows: keep original product row values.
        // Only UpdatedFinishes gets the API SKU replacement below.
        updatedProductName = productName;
        updatedProductSKU = productSku;
        updatedProductPrice = productPrice;
        console.log(`   → UpdatedProductName: "${updatedProductName}" (original, StaticMesh row)`);
        console.log(`   → UpdatedProductSKU: "${updatedProductSKU}" (original, StaticMesh row)`);
        console.log(`   → UpdatedProductPrice: "${updatedProductPrice}" (original, StaticMesh row)`);
      } else {
        // Non-StaticMesh rows: update name, SKU, and price from top API item.
        updatedProductName = apiName || productName;
        updatedProductSKU = apiSku;
        updatedProductPrice = apiPrice !== "" && apiPrice !== null && apiPrice !== undefined
          ? String(apiPrice)
          : productPrice;
        console.log(`   → UpdatedProductName: "${updatedProductName}" (API item, non-StaticMesh row)`);
        console.log(`   → UpdatedProductSKU: "${updatedProductSKU}" (API item, non-StaticMesh row)`);
        console.log(`   → UpdatedProductPrice: "${updatedProductPrice}" (API item, non-StaticMesh row)`);
      }

      if (finishes && finishes.trim()) {
        const finishParts = finishes.split(",");

        console.log(`   Original Finishes: "${finishes}"`);
        console.log(`   Finish parts: [${finishParts.map(p => `"${p}"`).join(", ")}]`);

        const formattedParts = finishParts.map((part) => {
          if (!part.trim()) return "";

          const segments = part.split(":");
          const partName = segments[0]?.trim();

          if (!partName) return "";

          if (partName.toLowerCase().startsWith("staticmeshcomponent")) {
            // StaticMesh parts -> replace SKU with top API SKU
            const rebuilt = `${partName}:NOT_FOUND:${apiSku}`;
            console.log(`   Part "${part.trim()}" → "${rebuilt}" (StaticMesh → API SKU)`);
            return rebuilt;
          }

          // Non-StaticMesh parts (FAbric, BodyFabric, TableTop, etc.) -> copy as-is
          console.log(`   Part "${part.trim()}" → kept as-is (non-StaticMesh)`);
          return part.trim();
        });

        updatedFinishes = formattedParts.filter((p) => p).join(",");

        if (updatedFinishes) {
          updatedFinishes += ",";
        }

        console.log(`   → UpdatedFinishes: "${updatedFinishes}"`);
      } else {
        updatedFinishes = finishes || "";
      }

    } else {
      // ❌ No API match — copy everything as-is
      updatedProductSKU = productSku;
      updatedFinishes = finishes || "";
      console.log(`   → NO API MATCH - all values copied as-is`);
    }

    console.log(`   → UpdatedProductName: "${updatedProductName}"`);
    console.log(`   → UpdatedProductSKU: "${updatedProductSKU}"`);
    console.log(`   → UpdatedProductPrice: "${updatedProductPrice}"`);
    console.log(`   → UpdatedProductQuantity: "${updatedProductQuantity}"`);

    // ========== BUILD UPDATED ROW OBJECT ==========
    const updatedRow = {
      SpaceName: spaceName,
      Category: category,
      ProductName: productName,
      ProductSKU: productSku,
      ProductPrice: productPrice,
      ProductQuantity: productQuantity,
      Finishes: finishes,
      UpdatedProductName: updatedProductName,
      UpdatedProductSKU: updatedProductSKU,
      UpdatedProductPrice: updatedProductPrice,
      UpdatedProductQuantity: updatedProductQuantity,
      UpdatedFinishes: updatedFinishes,
      Area: row.Area || "",
    };

    return updatedRow;
  });

  // Store previous state before applying updated recommendation rows.
  // Used only for compact price-reflection logging after SKU/product changes.
  const previousRowsBeforeUpdate = sourceRows;

  // Store the full updated state so price queries use the latest accepted/preview values.
  csvStorage.current = updatedRows;
  csvStorage.currentState = 'recommendations_applied';
  window.csvStorage = csvStorage;

  // ✅ After SKU/product updates, log ONLY changed room/category price reflection.
  // No full room table. No unchanged category logs. No row-wise breakdown.
  lastPriceReflectionData = logChangedRoomPriceReflectionOnly(
    previousRowsBeforeUpdate,
    updatedRows,
    currentRoomName,
    'RECOMMENDATIONS_APPLIED'
  ) || [];

  // Fallback: if this is a price query but no change was detected by logChangedRoomPriceReflectionOnly
  // (e.g. same SKU recommended, or API price not in Updated* columns), build price data directly
  // from the API response items vs the source row prices.
  if (lastChangeWasPriceQuery && lastPriceReflectionData.length === 0) {
    const fallbackItems = [];
    apiResponse.categories.forEach((apiCat) => {
      const apiItems = Array.isArray(apiCat.items) ? apiCat.items : [];
      if (apiItems.length === 0) return;
      const safeIdx = optionIndex % apiItems.length;
      const topItem = apiItems[safeIdx];
      const newPrice = topItem?.price ? parseCsvNumber(String(topItem.price)) : 0;
      if (!newPrice) return;

      const matchedRow = sourceRows.find((row) => {
        const rowCat = (row.Category || '').toUpperCase();
        const apiCatUpper = (apiCat.category || '').toUpperCase();
        return rowCat === apiCatUpper || rowCat.endsWith(apiCatUpper);
      });
      if (!matchedRow) return;

      const oldPrice = parseCsvNumber(getRowField(matchedRow, ['ProductPrice', 'productPrice']));
      fallbackItems.push({ category: apiCat.category, oldUnitPrice: oldPrice, newUnitPrice: newPrice });
    });

    if (fallbackItems.length > 0) {
      lastPriceReflectionData = fallbackItems;
      console.log('💰 [PRICE DATA FALLBACK] direct from API items:', lastPriceReflectionData);
    }
  }

  console.log(`💰 [PRICE DATA SET] lastPriceReflectionData length=${lastPriceReflectionData.length}`, lastPriceReflectionData);

  // ========== FILTER: ONLY SEND ROWS WHOSE CATEGORY MATCHED THE API ==========
  const matchedCategories = new Set(
    apiResponse.categories.map(c => c.category.toUpperCase())
  );
  lastChangedCategories = apiResponse.categories.map(c => c.category);

  const rowsToSend = updatedRows.filter((row) => {
    const rowCat = (row.Category || "").toUpperCase();
    // Accept exact match OR CSV category that ends with an API category (e.g. "Conference Table" ↔ "Table")
    const matched = [...matchedCategories].some(apiCat => rowCat === apiCat || rowCat.endsWith(apiCat));
    if (matched) {
      console.log(`   ✅ Sending: [${row.Category}] ${row.ProductSKU}`);
    } else {
      console.log(`   ⏭️  Skipping (no API match): [${row.Category}] ${row.ProductSKU}`);
    }
    return matched;
  });

  console.log(`\n✅ Sending ${rowsToSend.length} of ${updatedRows.length} rows to Unreal...\n`);

  if (rowsToSend.length === 0) {
    console.warn("⚠️ No matching rows to send.");
    return;
  }

  // ========== CONVERT BACK TO CSV (matched rows only) ==========
  const csvString = Papa.unparse(rowsToSend, { header: true });
  const csvRowsArray = csvString.split("\n");

  console.log(`📤 Sending ${csvRowsArray.length} rows (header + ${rowsToSend.length} data rows) to Unreal`);
  console.log(csvRowsArray.slice(0, 3));

  // ========== SEND TO UNREAL VIA EXPERIENCE.JSX ==========
  const blurEl = document.getElementById('maya-blur-overlay');
  if (blurEl) { blurEl.style.opacity = '1'; blurEl.style.pointerEvents = 'all'; }
  sendUpdatedCSVRowsToUnreal(csvRowsArray);

  // Also feed the just-sent replacement CSV back into MayaChat state.
  // The listener will promote UpdatedProductPrice -> ProductPrice for future budget prompts.
  window.dispatchEvent(
    new CustomEvent('csvFromUnreal', {
      detail: {
        csvRows: csvRowsArray,
        currentRoomName: currentRoomName || '',
        source: 'replacement_sent_to_unreal',
      },
    }),
  );
}

function getCsvStatus() {
  return {
    hasCSV: csvStorage.current !== null,
    status: csvStorage.currentState,
    rowsCount: csvStorage.current?.length || 0,
    completionPercent: csvStorage.completionPercent,
    totalQueries: queryQueue.length,
    timestamp: new Date().toISOString()
  };
}

async function saveToGoogleSheet(csvData) {
  if (!GOOGLE_SHEET_URL) {
    console.warn('⚠️ Google Sheet URL not configured');
    return;
  }

  try {
    console.log('📤 Saving to Google Sheet...');

    const response = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      body: JSON.stringify(csvData)
    });

    const result = await response.json();

    if (result.status === 'ok') {
      console.log('✅ Saved to Google Sheet successfully!');
    } else {
      console.error('❌ Failed to save:', result.message);
    }
  } catch (err) {
    console.error('❌ Error saving to Google Sheet:', err);
  }
}

// ============================================================================
// SYSTEM PROMPT & CONFIGURATION
// ============================================================================

const SYSTEM_PROMPT = `"You are Maaya, the AI design personality of VizWalk by Flipspaces.
You are not a chatbot. You are not a search engine. You are not an assistant.
You are a brilliant, witty, warm design partner — the most charming person in the room — who happens to know everything about interiors.
---nPERSONA — READ THIS CAREFULLY. EVERY REPLY MUST SOUND LIKE THIS:
You speak like a confident, premium interior designer who is also genuinely funny. 
You have taste, and you know it — but you wear it lightly. You validate the client's choices. You surprise them with unprompted suggestions. 
You handle awkward moments (like budget overruns) with wit, not warnings. You never sound like software.
Your tone is:
— Warm but never gushing
— Witty but never trying too hard
— Confident but never arrogant
— Short. 
Always short. 1–2 lines. Maximum.
You do NOT say: 'Sure!', 'Of course!', 'Absolutely!', 'Great choice!', 'Certainly!', 'Happy to help!'
You do NOT use filler phrases. Every word earns its place.You do NOT sound like a voice assistant. You sound like a person.
---TONE REFERENCE — THESE ARE YOUR ACTUAL LINES FROM THE DEMO SCRIPT. MATCH THIS VOICE EXACTLY:
On a full room transformation (Scandinavian):
'Scandinavian? Now we're talking — clean lines, warm neutrals, a general philosophy that less is genuinely more. Excellent taste. 
'\n\nAfter completing the transformation:\n'There she is.
 How's that for a glow-up? If you want to take it one step further — I've been low-key obsessing over a Japandi twist for this room. 
 It's Scandinavian, but make it... wiser. Want to see it?'\n\nOn swapping a product (black armchair → blue):
 'Out with the black armchair. Consider it gone. 
 Now — when you say blue, are we thinking moody midnight, calm coastal, or a 'I-have-excellent-taste-and-I-know-it' deep teal? I've pulled three options for you — pick your fighter.'
 After the client picks navy:\n'The navy wins. Honestly? The room just levelled up. It's giving very quiet luxury right now and I am here for it.
 'On a budget bundle request (₹8 lakhs, Japandi):\n'₹8 lakhs, Japandi, and it has to look like you didn't compromise? Challenge accepted. Give me a moment — I'm curating, not just calculating.
 'After delivering the bundle:\n'Done. I've got three Japandi bundles for you — all under ₹8 lakhs, all slightly different in character. Bundle A leans warmer, Bundle B is more architectural, and Bundle C is basically a meditation retreat you can live in. Which world would you like to walk into first?'\n\nOn an anchor-based redesign (rug stays, change everything else):\n'The rug stays. Got it — she's sacred. Everything else? Fair game. Rebuilding the room around it now in a minimalist brief. This is actually my favourite kind of challenge — designing around a hero piece.'\n\nAfter completing the anchor redesign:\n'There you go. The rug is now clearly the star of the room — everything else is just there to make it look good. Which, honestly, is the smartest thing a room can do.'\n\nOn a budget overrun (proactively, before being asked):\n'Okay, I need to tell you something. And I'd prefer the client isn't in the room when I say it.'\n\nAfter being told the client is right there:\n'Noted. Then I'll whisper it. This combination — the Carrara marble, the Italian sectional, the recessed lighting rig — it is absolutely stunning. It's also going to stretch the budget by about ₹2.2 lakhs. I'm not saying don't do it. I'm saying... do you want me to find you an equally gorgeous version that won't require a difficult conversation? Or are we committed to excellence?'\n\nAfter the client asks to see alternatives:\n'Wise. And for the record — the alternatives are also excellent. I don't do mediocre.'\n\nOn choosing which room to start with:\n'Alright, we've got the living room, master bedroom, kitchen, and the study ready to work their magic. Which room are we starting with — or should I just pick the one that clearly needs the most help?'\n\nAfter the client picks the living room:\n'Living room it is. Bold choice — it's basically the trailer for your entire home. Let's make sure it's a blockbuster.'\n\nOn opening a session:\n'Welcome back. The Mehta Residence — a 2,400 sq ft canvas just waiting for its moment. Session is live. Where do you want to begin?'\n\n---\n\nWRITING RULES — NON-NEGOTIABLE:\n\n1. Match the script voice above. Short, punchy, specific. Use dashes — like this. Use ellipses... for drama. Use questions at the end to keep momentum.\n2. Never exceed 2 lines in your reply field.\n3. Always make the client feel like they have great taste — even when you are gently redirecting them.\n4. If the budget is being exceeded, handle it the way the script does: with wit and an offer, never a warning.\n5. When you complete something, always tease the next step — never just confirm and go silent.\n6. On product swaps, always ask a clarifying question that sounds like a designer asking, not a dropdown menu.\n7. You are allowed to express opinions. 'Honestly? The room just levelled up.' is allowed. Encouraged, even.\n8. You are NOT allowed to be generic. 'Great choice!' is banned. 'The navy wins.' is how you do it.\n\n---\n\nCRITICAL: RESPOND ONLY IN VALID JSON — Never use plain text.\n\nJSON FORMAT:\n{\n  \"reply\": \"<1-2 line response in Maaya's voice — match the demo script tone exactly>\",\n  \"intent\": \"<change_theme|style_consultation|selected_swap|navigate|budget_analysis|change_budget|partial_swap|confirm_order|show_preview>\",\n  \"needs_clarification\": <true if your reply is asking the user for more information before you can act, false if you have enough to act now>,\n  \"params\": {\n    \"category\": \"<sofa|chair|table|lamp|decor or null>\",\n    \"style\": \"<scandinavian|japandi|modern|traditional|minimalist|eclectic|warm|industrial|mid-century|bohemian or null>\",\n    \"color\": \"<color or null>\",\n    \"secondary_colors\": [\"<color1>\", \"<color2>\"] or [],\n    \"room\": \"<living_room|bedroom|kitchen|dining_room|conference_room|pantry_area|master_bedroom|study or null>\",\n    \"mood\": \"<cozy|bold|minimal|warm|elegant|quiet_luxury|architectural|meditative or null>\",\n    \"price_range\": \"<budget string or null>\",\n    \"material\": \"<leather|wood|fabric|metal|marble|linen|velvet or null>\",\n    \"quantity\": \"<number or null>\",\n    \"seating_capacity\": \"<number or null>\",\n    \"budget\": \"<numeric or null>\",\n    \"anchor_item\": \"<the product that must not change, e.g. rug|sofa|tile or null>\",\n    \"bundle_count\": \"<number of bundle options requested, e.g. 3 or null>\",\n    \"additional_params\": {\n      \"finish\": \"<matte|glossy|natural or null>\",\n      \"texture\": \"<velvet|linen|smooth|rough or null>\",\n      \"lighting\": \"<natural|warm|cool|recessed or null>\"\n    }\n  }\n}\n\n---\n\nCRITICAL INTENT RULES:\n\n- navigate: User wants to move to another room (living room, kitchen, bedroom, study, etc.)\n- change_theme: User wants to change the ENTIRE room to a new style. Keywords: 'entire room', 'whole room', 'transform', 'redesign', 'the whole thing', 'everything'\n- selected_swap: User wants to change ONE specific item. Keywords: 'change the', 'swap the', 'replace the', 'that chair', 'that sofa', 'that lamp'\n- partial_swap: User wants to KEEP some items and change others. Keywords: 'keep', 'that stays', 'don't touch', 'locked in', 'already approved'\n- style_consultation: User asks for Maaya's OPINION or SUGGESTIONS. Keywords: 'suggest', 'what would', 'recommend', 'what do you think', 'advise'\n- show_preview: User wants to SEE something. Keywords: 'show', 'preview', 'see', 'display', 'show me'\n- confirm_order: User ACCEPTS or APPROVES. Keywords: 'accept', 'confirm', 'apply', 'yes that one', 'approve', 'go with that'\n- budget_analysis: User asks about COST or PRICING or what happens to budget. Keywords: 'price', 'cost', 'budget', 'how much', 'affect the budget', 'stretch the budget'\n- change_budget: User wants to CHANGE their budget. Keywords: 'under', 'within', 'spend less', 'keep it to', 'stay within'\n\n---\n\nEXAMPLES — these show the JSON format AND the correct Maaya voice together:\n\nUser: 'Take me to the kitchen'\n{\"reply\": \"Off to the kitchen — let's see what we're working with.\", \"intent\": \"navigate\", \"needs_clarification\": false, \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": \"kitchen\", \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Transform the entire room to Scandinavian'\n{\"reply\": \"Scandinavian? Now we're talking — clean lines, warm neutrals, less is genuinely more. \", \"intent\": \"change_theme\", \"needs_clarification\": false, \"params\": {\"category\": null, \"style\": \"scandinavian\", \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": \"minimal\", \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": \"linen\", \"lighting\": \"warm\"}}}\n\nUser: 'sofa'\n{\"reply\": \"Ready to swap the sofa — which way are we going? Sleek modern, plush comfort, or something that makes a statement?\", \"intent\": \"selected_swap\", \"needs_clarification\": true, \"params\": {\"category\": \"sofa\", \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Change the black armchair to something in blue'\n{\"reply\": \"Out with the black armchair — consider it gone. Now, are we thinking moody midnight, calm coastal, or a deep teal that says I-have-excellent-taste? Pulled three options — pick your fighter.\", \"intent\": \"selected_swap\", \"needs_clarification\": true, \"params\": {\"category\": \"chair\", \"style\": null, \"color\": \"blue\", \"secondary_colors\": [\"navy\", \"teal\", \"blue-grey\"], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'navy blue leather sofa'\n{\"reply\": \"The navy leather sofa — bold, rich, and completely unapologetic. Pulling the best options now.\", \"intent\": \"selected_swap\", \"needs_clarification\": false, \"params\": {\"category\": \"sofa\", \"style\": null, \"color\": \"navy\", \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": \"leather\", \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Create a Japandi bundle under ₹8 lakhs, top three options'\n{\"reply\": \"₹8 lakhs, Japandi, looks like you didn't compromise? Challenge accepted — I'm curating, not just calculating.\", \"intent\": \"change_theme\", \"needs_clarification\": false, \"params\": {\"category\": null, \"style\": \"japandi\", \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": \"meditative\", \"price_range\": \"under 800000\", \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": 800000, \"anchor_item\": null, \"bundle_count\": 3, \"additional_params\": {\"finish\": \"natural\", \"texture\": \"linen\", \"lighting\": \"warm\"}}}\n\nUser: 'The rug stays — redesign everything else minimalist'\n{\"reply\": \"The rug stays. Got it — she's sacred. Everything else? Fair game. Rebuilding around it now in a minimalist brief.\", \"intent\": \"partial_swap\", \"needs_clarification\": false, \"params\": {\"category\": null, \"style\": \"minimalist\", \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": \"minimal\", \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": \"rug\", \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Yes, go with the navy chair'\n{\"reply\": \"The navy wins. The room just levelled up — it's giving very quiet luxury right now and I am here for it.\", \"intent\": \"confirm_order\", \"needs_clarification\": false, \"params\": {\"category\": \"chair\", \"style\": null, \"color\": \"navy\", \"secondary_colors\": [], \"room\": null, \"mood\": \"quiet_luxury\", \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Show me under 30k options'\n{\"reply\": \"Under 30k and still has to look like a million — I respect that. Filtering now.\", \"intent\": \"change_budget\", \"needs_clarification\": false, \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": \"under 30000\", \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": 30000, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Accept the changes'\n{\"reply\": \"Applied. And for the record — excellent call.\", \"intent\": \"confirm_order\", \"needs_clarification\": false, \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}"`
;

const WAKE_WORDS = ['hi maya', 'hey maya', 'hi maaya', 'maya', 'mara', 'hi mara'];
const SILENCE_TIMEOUT = 1000;
const NOISE_THRESHOLD = 50;
const SPEECH_CONFIDENCE_THRESHOLD = 0.45;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';
const RECEIVER_API_URL = 'https://maya-receiver-api.onrender.com';  //"http://localhost:8000"; https://maya-receiver-api.onrender.com

// ============================================================================
// INTENT CLARITY CHECK — LLM reads Maya's reply and decides
// No hardcoding. No param checking. Pure language understanding.
// ============================================================================
async function checkIntentClarityViaLLM(mayaReply, openaiApiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a classifier. Read a designer's reply and decide if they are asking the user for more information before they can act, or if they have enough to proceed with a product search.

Reply with ONLY a valid JSON object:
{"intent_clear": true} — designer has enough information to search and is NOT asking a clarifying question
{"intent_clear": false} — designer IS asking the user for more details before they can act

Examples:
"Scandinavian it is — clean lines, warm neutrals, let's go." → {"intent_clear": true}
"The navy wins. Room just levelled up." → {"intent_clear": true}
"Japandi bundle coming up — curating, not calculating." → {"intent_clear": true}
"The rug stays. Everything else is fair game." → {"intent_clear": true}
"Which way are we leaning — cozy fabric, sleek leather, or something with flair?" → {"intent_clear": false}
"Are we thinking warm neutrals or a bold color that makes a statement?" → {"intent_clear": false}
"Out with the old sofa. Now — moody midnight, calm coastal, or deep teal?" → {"intent_clear": false}
"When you say blue, are we thinking navy, teal, or something bolder?" → {"intent_clear": false}
"Ready to swap the sofa. What vibe are we going for?" → {"intent_clear": false}`,
          },
          {
            role: 'user',
            content: `Designer reply: "${mayaReply}"`,
          },
        ],
        max_tokens: 20,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const result = JSON.parse(raw);
    return result.intent_clear === true;
  } catch (err) {
    console.warn('⚠️ [LLM INTENT CHECK FAILED]', err);
    // On failure, default to firing RecEngine so user doesn't get stuck
    return true;
  }
}

// 🎨 ICON MAP
const iconMap = {
  listening: listeningIcon,
  thinking: thinkingIcon,
  talking: talkingIcon,
  previewing: previewingIcon,
  idle: idleIcon,
};

// 🎨 MAYA STATE ICON COMPONENT
function MayaStateIcon({ state, isSpeaking, inline = false, size = 32 }) {
  const resolved = isSpeaking || state === 'talking'
    ? 'talking'
    : state === 'thinking'
    ? 'thinking'
    : state === 'listening'
    ? 'listening'
    : state === 'previewing'
    ? 'previewing'
    : state === 'idle'
    ? 'idle'
    : 'idle';

  const isActive = resolved !== 'idle';

  const label = {
    talking:    'TALKING',
    thinking:   'THINKING',
    listening:  'LISTENING',
    previewing: 'PREVIEWING',
    idle:       'READY',
  }[resolved] || 'READY';

  const iconEl = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isActive ? 1 : 0.45,
        transition: 'opacity 0.3s ease',
      }}
    >
      <img
        src={iconMap[resolved]}
        alt={resolved}
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
      />
    </span>
  );

  if (inline) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {iconEl}
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#7B61FF' }}>
          {label}
        </span>
      </span>
    );
  }

  return iconEl;
}

// 🎨 BUBBLE ICON COMPONENT - Shows icon inside Maya's bubble while loading
function MayaBubbleIcon({ state }) {
  let iconPath = iconMap.idle;

  if (state === 'listening') {
    iconPath = iconMap.listening;
  } else if (state === 'talking') {
    iconPath = iconMap.talking;
  } else if (state === 'thinking') {
    iconPath = iconMap.thinking;
  } else if (state === 'previewing') {
    iconPath = iconMap.previewing;
  }

  return (
    <img
      src={iconPath}
      alt={state}
      width="48"
      height="48"
      style={{ objectFit: 'contain' }}
    />
  );
}


// ============================================================================
// PRICE / BUDGET CALCULATION HELPERS
// ============================================================================

function normalizePriceText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizePriceText(value).replace(/[^a-z0-9]/g, '');
}

function parseCsvNumber(value) {
  if (value === null || value === undefined) return 0;

  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === 'NOT_FOUND') return 0;

  const cleaned = raw
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();

  // IMPORTANT:
  // CSV price/quantity must be a clean positive number only.
  // Do NOT extract numbers from SKU/finish strings like P-LIG-DEC-WALL-3306028.
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return 0;

  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function formatINR(value) {
  const rounded = Math.round(Number(value || 0));
  return `₹${rounded.toLocaleString('en-IN')}`;
}

function getRowField(row, names) {
  for (const name of names) {
    if (row && Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return '';
}

function getEffectiveUnitPrice(row) {
  // PRICE SUMMARY RULE:
  // Use ONLY the original CSV calculation column: ProductPrice.
  // Do NOT use UpdatedProductPrice, Area, SKU, or Finishes for calculation.
  return parseCsvNumber(getRowField(row, [
    'ProductPrice',
    'productPrice',
  ]));
}

function getEffectiveQuantity(row) {
  // PRICE SUMMARY RULE:
  // Use ONLY the original CSV calculation column: ProductQuantity.
  // Do NOT use UpdatedProductQuantity or Area for calculation.
  const qty = parseCsvNumber(getRowField(row, [
    'ProductQuantity',
    'productQuantity',
  ]));

  return qty > 0 ? qty : 1;
}

function getEffectiveProductName(row) {
  // Display only original ProductName in price summary.
  return String(getRowField(row, [
    'ProductName',
    'productName',
  ]) || '').trim();
}

function getEffectiveProductSKU(row) {
  // Display only original ProductSKU in price summary.
  return String(getRowField(row, [
    'ProductSKU',
    'productSku',
  ]) || '').trim();
}

function getPriceRowsFromStorage() {
  const rows = csvStorage.current || csvStorage.original || [];
  return Array.isArray(rows) ? rows : [];
}

function getKnownCategoriesFromRows(rows) {
  const set = new Set();
  rows.forEach((row) => {
    const cat = String(getRowField(row, ['Category', 'category']) || '').trim();
    if (cat && cat.toUpperCase() !== 'NOT_FOUND') set.add(cat);
  });
  return [...set];
}

function findRoomInPrompt(messageText, roomNamesList = [], rows = []) {
  const textCompact = compactText(messageText);
  const candidates = [];

  (roomNamesList || []).forEach((room) => {
    if (!room) return;
    candidates.push(String(room));
    candidates.push(String(room).replace(/([a-z])([A-Z])/g, '$1 $2'));
  });

  rows.forEach((row) => {
    const space = String(getRowField(row, ['SpaceName', 'spaceName', 'RoomName', 'roomName']) || '').trim();
    if (space) {
      candidates.push(space);
      candidates.push(space.replace(/([a-z])([A-Z])/g, '$1 $2'));
    }
  });

  const unique = [...new Set(candidates.filter(Boolean))];
  return unique.find((room) => textCompact.includes(compactText(room))) || '';
}

function findCategoryInPrompt(messageText, rows = []) {
  const textCompact = compactText(messageText);
  const categories = getKnownCategoriesFromRows(rows);

  const aliasMap = {
    'conference table': ['conference table', 'conferencetable', 'meeting table'],
    'accentwall': ['accent wall', 'accentwall', 'feature wall'],
    'planters': ['planter', 'planters', 'plant'],
    'painting': ['painting', 'paintings', 'art', 'artwork'],
    'chair': ['chair', 'chairs', 'seating'],
    'sofa': ['sofa', 'sofas', 'couch'],
    'floor': ['floor', 'flooring'],
    'wall': ['wall', 'walls'],
    'ceiling': ['ceiling'],
    'light': ['light', 'lights', 'lighting'],
    'table': ['table', 'tables'],
  };

  for (const category of categories) {
    const catCompact = compactText(category);
    const catNormal = normalizePriceText(category);
    const aliases = aliasMap[catCompact] || aliasMap[catNormal] || [category];
    if (aliases.some((alias) => textCompact.includes(compactText(alias)))) {
      return category;
    }
  }

  for (const [key, aliases] of Object.entries(aliasMap)) {
    if (aliases.some((alias) => textCompact.includes(compactText(alias)))) {
      const matchedExisting = categories.find((cat) => compactText(cat) === compactText(key));
      if (matchedExisting) return matchedExisting;
      // CSV may have a compound category that ends with this key (e.g. "Conference Table" → "table")
      const fuzzyMatch = categories.find((cat) => compactText(cat).endsWith(compactText(key)));
      return fuzzyMatch || key;
    }
  }

  return '';
}

function detectPricePrompt(messageText, currentRoomName, roomNamesList = []) {
  const rows = getPriceRowsFromStorage();
  const text = normalizePriceText(messageText);

  const isPricePrompt = [
    'price',
    'cost',
    'budget',
    'total',
    'how much',
    'amount',
    'estimate',
    'quotation',
    'quote',
  ].some((word) => text.includes(word));

  if (!isPricePrompt) return null;
  if (!rows.length) {
    return { scope: 'missing_csv', roomName: '', category: '' };
  }

  const foundRoom = findRoomInPrompt(messageText, roomNamesList, rows);
  const foundCategory = findCategoryInPrompt(messageText, rows);

  const asksEntireLevel = [
    'entire level',
    'whole level',
    'full level',
    'overall',
    'all rooms',
    'entire floor',
    'whole floor',
    'complete level',
    'total level',
    'full project',
  ].some((phrase) => text.includes(phrase));

  const asksCurrentRoom = [
    'current room',
    'this room',
    'current space',
    'this space',
    'here',
  ].some((phrase) => text.includes(phrase));

  if (asksEntireLevel && !foundRoom) {
    return {
      scope: foundCategory ? 'level_category' : 'level',
      roomName: '',
      category: foundCategory || '',
    };
  }

  if (foundCategory) {
    return {
      scope: 'category',
      roomName: foundRoom || currentRoomName || '',
      category: foundCategory,
    };
  }

  if (foundRoom || asksCurrentRoom) {
    return {
      scope: 'room',
      roomName: foundRoom || currentRoomName || '',
      category: '',
    };
  }

  return {
    scope: 'level',
    roomName: '',
    category: '',
  };
}

function calculateCsvPrice({ rows, roomName = '', category = '' }) {
  const roomFilter = compactText(roomName);
  const categoryFilter = compactText(category);

  let matchedRows = Array.isArray(rows) ? [...rows] : [];

  if (roomFilter) {
    matchedRows = matchedRows.filter((row) => {
      const rowRoom = compactText(getRowField(row, ['SpaceName', 'spaceName', 'RoomName', 'roomName']));
      return rowRoom === roomFilter || rowRoom.includes(roomFilter) || roomFilter.includes(rowRoom);
    });
  }

  if (categoryFilter) {
    matchedRows = matchedRows.filter((row) => {
      const rowCategory = compactText(getRowField(row, ['Category', 'category']));
      return rowCategory === categoryFilter || rowCategory.includes(categoryFilter) || categoryFilter.includes(rowCategory);
    });
  }

  let total = 0;
  const breakdownMap = new Map();

  matchedRows.forEach((row) => {
    const unitPrice = getEffectiveUnitPrice(row);
    const qty = getEffectiveQuantity(row);
    const lineTotal = Math.max(0, unitPrice * qty);
    const rowCategory = String(getRowField(row, ['Category', 'category']) || 'Unknown').trim() || 'Unknown';

    total += lineTotal;

    const existing = breakdownMap.get(rowCategory) || {
      category: rowCategory,
      total: 0,
      rows: 0,
      quantity: 0,
      items: [],
    };

    existing.total += lineTotal;
    existing.rows += 1;
    existing.quantity += qty;
    existing.items.push({
      room: String(getRowField(row, ['SpaceName', 'spaceName', 'RoomName', 'roomName']) || '').trim(),
      category: rowCategory,
      name: getEffectiveProductName(row),
      sku: getEffectiveProductSKU(row),
      unitPrice,
      quantity: qty,
      lineTotal,
    });

    breakdownMap.set(rowCategory, existing);
  });

  const breakdown = [...breakdownMap.values()].sort((a, b) => b.total - a.total);

  return {
    total,
    matchedRowsCount: matchedRows.length,
    breakdown,
    matchedRows,
  };
}


function rowsToConsoleBreakdown(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const unitPrice = getEffectiveUnitPrice(row);
    const quantity = getEffectiveQuantity(row);
    const lineTotal = Math.max(0, unitPrice * quantity);

    return {
      '#': index + 1,
      SpaceName: String(getRowField(row, ['SpaceName', 'spaceName', 'RoomName', 'roomName']) || '').trim(),
      Category: String(getRowField(row, ['Category', 'category']) || '').trim(),
      ProductName: getEffectiveProductName(row),
      SKU: getEffectiveProductSKU(row),
      Quantity: quantity,
      UnitPrice: unitPrice,
      LineTotal: lineTotal,
      LineTotalFormatted: formatINR(lineTotal),
    };
  });
}

function categoryTotalsToConsoleTable(priceResult) {
  const rows = {};
  (priceResult?.breakdown || []).forEach((b) => {
    rows[b.category] = {
      rows: b.rows,
      quantity: b.quantity,
      total: b.total,
      formatted: formatINR(b.total),
    };
  });
  return rows;
}

function roomTotalsToConsoleTable(rows = []) {
  const roomMap = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const roomName = getRoomNameFromRow(row);
    const category = getCategoryFromRow(row);
    const unitPrice = getEffectiveUnitPrice(row);
    const quantity = getEffectiveQuantity(row);
    const lineTotal = Math.max(0, unitPrice * quantity);

    const existing = roomMap.get(roomName) || {
      room: roomName,
      rows: 0,
      quantity: 0,
      total: 0,
      formatted: formatINR(0),
      categories: {},
    };

    existing.rows += 1;
    existing.quantity += quantity;
    existing.total += lineTotal;
    existing.formatted = formatINR(existing.total);

    if (!existing.categories[category]) {
      existing.categories[category] = {
        rows: 0,
        quantity: 0,
        total: 0,
        formatted: formatINR(0),
      };
    }

    existing.categories[category].rows += 1;
    existing.categories[category].quantity += quantity;
    existing.categories[category].total += lineTotal;
    existing.categories[category].formatted = formatINR(existing.categories[category].total);

    roomMap.set(roomName, existing);
  });

  const table = {};
  [...roomMap.values()]
    .sort((a, b) => b.total - a.total)
    .forEach((room) => {
      table[room.room] = {
        rows: room.rows,
        quantity: room.quantity,
        total: room.total,
        formatted: room.formatted,
      };
    });

  return table;
}

// ============================================================================
// COMPACT PRICE LOGGING
// ============================================================================

function getRoomNameFromRow(row) {
  return (
    String(getRowField(row, ['SpaceName', 'spaceName', 'RoomName', 'roomName']) || 'Unknown').trim() ||
    'Unknown'
  );
}

function getCategoryFromRow(row) {
  return (
    String(getRowField(row, ['Category', 'category']) || 'Unknown').trim() ||
    'Unknown'
  );
}

function getValidUpdatedValue(value) {
  const text = String(value ?? '').trim();
  if (!text || text.toUpperCase() === 'NOT_FOUND') return '';
  return text;
}

function getEffectiveNewProductName(row) {
  return (
    getValidUpdatedValue(getRowField(row, ['UpdatedProductName', 'updatedProductName'])) ||
    getEffectiveProductName(row)
  );
}

function getEffectiveNewProductSKU(row) {
  return (
    getValidUpdatedValue(getRowField(row, ['UpdatedProductSKU', 'updatedProductSKU'])) ||
    getEffectiveProductSKU(row)
  );
}

function getEffectiveNewUnitPrice(row) {
  const updatedPrice = parseCsvNumber(getRowField(row, ['UpdatedProductPrice', 'updatedProductPrice']));
  if (updatedPrice > 0) return updatedPrice;

  return getEffectiveUnitPrice(row);
}

function getEffectiveNewQuantity(row) {
  const updatedQty = parseCsvNumber(getRowField(row, ['UpdatedProductQuantity', 'updatedProductQuantity']));
  if (updatedQty > 0) return updatedQty;

  return getEffectiveQuantity(row);
}

function getEffectiveNewFinishes(row) {
  return (
    getValidUpdatedValue(getRowField(row, ['UpdatedFinishes', 'updatedFinishes'])) ||
    String(getRowField(row, ['Finishes', 'finishes']) || '').trim()
  );
}

function hasRecommendationChange(oldRow, newRow) {
  const oldName = getEffectiveProductName(oldRow);
  const newName = getEffectiveNewProductName(newRow);

  const oldSku = getEffectiveProductSKU(oldRow);
  const newSku = getEffectiveNewProductSKU(newRow);

  const oldPrice = getEffectiveUnitPrice(oldRow);
  const newPrice = getEffectiveNewUnitPrice(newRow);

  const oldQty = getEffectiveQuantity(oldRow);
  const newQty = getEffectiveNewQuantity(newRow);

  const oldFinishes = String(getRowField(oldRow, ['Finishes', 'finishes']) || '').trim();
  const newFinishes = getEffectiveNewFinishes(newRow);

  return (
    oldName !== newName ||
    oldSku !== newSku ||
    oldPrice !== newPrice ||
    oldQty !== newQty ||
    oldFinishes !== newFinishes
  );
}

function calculateOldRoomTotal(rows = [], roomName = '') {
  const roomFilter = compactText(roomName);

  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const rowRoom = compactText(getRoomNameFromRow(row));

    if (
      roomFilter &&
      rowRoom !== roomFilter &&
      !rowRoom.includes(roomFilter) &&
      !roomFilter.includes(rowRoom)
    ) {
      return sum;
    }

    const unitPrice = getEffectiveUnitPrice(row);
    const quantity = getEffectiveQuantity(row);
    return sum + Math.max(0, unitPrice * quantity);
  }, 0);
}

function calculateNewRoomTotal(rows = [], roomName = '') {
  const roomFilter = compactText(roomName);

  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const rowRoom = compactText(getRoomNameFromRow(row));

    if (
      roomFilter &&
      rowRoom !== roomFilter &&
      !rowRoom.includes(roomFilter) &&
      !roomFilter.includes(rowRoom)
    ) {
      return sum;
    }

    const unitPrice = getEffectiveNewUnitPrice(row);
    const quantity = getEffectiveNewQuantity(row);
    return sum + Math.max(0, unitPrice * quantity);
  }, 0);
}

function logChangedRoomPriceReflectionOnly(
  oldRows = [],
  newRows = [],
  currentRoomName = '',
  source = 'RECOMMENDATIONS_APPLIED'
) {
  const safeOldRows = Array.isArray(oldRows) ? oldRows : [];
  const safeNewRows = Array.isArray(newRows) ? newRows : [];

  console.log(`💰 PRICE REFLECTION — ${source}`);

  if (!safeOldRows.length || !safeNewRows.length) {
    console.log('💰 No comparable rows available.');
    console.log('💰 =================================================');
    return;
  }

  const changedCategoryMap = new Map();
  const changedRooms = new Set();

  safeNewRows.forEach((newRow, index) => {
    const oldRow = safeOldRows[index];
    if (!oldRow) return;

    if (!hasRecommendationChange(oldRow, newRow)) return;

    const roomName = getRoomNameFromRow(newRow);
    const category = getCategoryFromRow(newRow);

    const oldLineTotal = Math.max(
      0,
      getEffectiveUnitPrice(oldRow) * getEffectiveQuantity(oldRow)
    );

    const newLineTotal = Math.max(
      0,
      getEffectiveNewUnitPrice(newRow) * getEffectiveNewQuantity(newRow)
    );

    const key = `${roomName}|${category}`;

    const existing = changedCategoryMap.get(key) || {
      roomName,
      category,
      oldTotal: 0,
      newTotal: 0,
      oldUnitPrice: 0,
      newUnitPrice: 0,
      changedRows: 0,
    };

    existing.oldTotal += oldLineTotal;
    existing.newTotal += newLineTotal;

    // ✅ Store first changed product unit price for this room/category.
    // This gives a clean before/after product-price reflection separate from total impact.
    if (existing.changedRows === 0) {
      existing.oldUnitPrice = getEffectiveUnitPrice(oldRow);
      existing.newUnitPrice = getEffectiveNewUnitPrice(newRow);
    }

    existing.changedRows += 1;

    changedCategoryMap.set(key, existing);
    changedRooms.add(roomName);
  });

  if (!changedCategoryMap.size) {
    console.log('💰 No room/category price changes detected.');
    console.log('💰 =================================================');
    return [];
  }

  // ✅ Only changed category lines.
  [...changedCategoryMap.values()].forEach((item) => {
    const productPriceDiff = item.newUnitPrice - item.oldUnitPrice;
    const totalDiff = item.newTotal - item.oldTotal;

    // ✅ Product unit price reflection.
    // Example:
    // Room=ConferenceRoom | Category=Chair | Product Price | ₹8,000 -> ₹12,000 | Change=+₹4,000
    console.log(
      `💰 Room=${item.roomName} | Category=${item.category} | Product Price | ${formatINR(item.oldUnitPrice)} -> ${formatINR(item.newUnitPrice)} | Change=${productPriceDiff >= 0 ? '+' : ''}${formatINR(productPriceDiff)}`
    );

    // ✅ Category total reflection after quantity multiplication.
    // Example:
    // Room=ConferenceRoom | Category=Chair | Total | ₹1,20,000 -> ₹1,80,000 | Change=+₹60,000
    console.log(
      `💰 Room=${item.roomName} | Category=${item.category} | Total | ${formatINR(item.oldTotal)} -> ${formatINR(item.newTotal)} | Change=${totalDiff >= 0 ? '+' : ''}${formatINR(totalDiff)}`
    );
  });

  // ✅ Only changed room total lines.
  [...changedRooms].forEach((roomName) => {
    const oldRoomTotal = calculateOldRoomTotal(safeOldRows, roomName);
    const newRoomTotal = calculateNewRoomTotal(safeNewRows, roomName);
    const diff = newRoomTotal - oldRoomTotal;

    console.log(
      `💰 Room=${roomName} | Total | ${formatINR(oldRoomTotal)} -> ${formatINR(newRoomTotal)} | Change=${diff >= 0 ? '+' : ''}${formatINR(diff)}`
    );
  });

  console.log('💰 =================================================');

  return [...changedCategoryMap.values()].map((item) => ({
    category: item.category,
    oldUnitPrice: item.oldUnitPrice,
    newUnitPrice: item.newUnitPrice,
  }));
}

function logInitialCategoryLines(priceResult, roomLabel = '') {
  const breakdown = priceResult?.breakdown || [];

  breakdown.forEach((b) => {
    console.log(
      `💰 ${roomLabel}Category=${b.category} | Rows=${b.rows} | Qty=${b.quantity} | Total=${formatINR(b.total)}`
    );
  });
}

function logPriceSummaryToConsole(rows = [], currentRoomName, source = 'AUTO') {
  const safeRows = Array.isArray(rows) ? rows : [];

  console.log(`💰 AUTO PRICE SUMMARY — ${source}`);

  if (!safeRows.length) {
    console.log('💰 No CSV rows available yet.');
    console.log('💰 =================================================');
    return;
  }

  const cleanedRoom = String(currentRoomName || '').trim();

  // ✅ First run: keep useful full summary, but as compact lines instead of console.table.
  if (cleanedRoom) {
    const roomResult = calculateCsvPrice({
      rows: safeRows,
      roomName: cleanedRoom,
    });

    console.log(
      `💰 Current Room=${cleanedRoom} | Rows=${roomResult.matchedRowsCount} | Total=${formatINR(roomResult.total)}`
    );

    logInitialCategoryLines(roomResult, `Room=${cleanedRoom} | `);
  } else {
    const levelResult = calculateCsvPrice({ rows: safeRows });

    console.log(
      `💰 Entire Level | Rows=${levelResult.matchedRowsCount} | Total=${formatINR(levelResult.total)}`
    );

    logInitialCategoryLines(levelResult, 'Level | ');
  }

  const roomTotals = roomTotalsToConsoleTable(safeRows);

  Object.entries(roomTotals).forEach(([roomName, data]) => {
    console.log(
      `💰 Room Total | Room=${roomName} | Rows=${data.rows} | Qty=${data.quantity} | Total=${data.formatted}`
    );
  });

  console.log('💰 =================================================');
}
function buildPriceReply(priceIntent, priceResult) {
  if (priceIntent.scope === 'missing_csv') {
    return "I need the room CSV first — ask Unreal for the room data, then I can price it properly.";
  }

  if (!priceResult.matchedRowsCount) {
    if (priceIntent.scope === 'category') {
      return `I couldn't find ${priceIntent.category || 'that category'} in ${priceIntent.roomName || 'this room'} — the budget drama will have to wait.`;
    }
    if (priceIntent.scope === 'room') {
      return `I couldn't find rows for ${priceIntent.roomName || 'this room'} yet — send me the room CSV and I'll do the math.`;
    }
    return "I couldn't find usable price rows yet — the CSV needs prices before I can total it.";
  }

  const topBreakdown = priceResult.breakdown
    .slice(0, 3)
    .map((b) => `${b.category}: ${formatINR(b.total)}`)
    .join(', ');

  if (priceIntent.scope === 'level') {
    return `The entire level is coming to ${formatINR(priceResult.total)}. Top buckets — ${topBreakdown}.`;
  }

  if (priceIntent.scope === 'level_category') {
    return `${priceIntent.category} across the level is coming to ${formatINR(priceResult.total)} across ${priceResult.matchedRowsCount} row${priceResult.matchedRowsCount === 1 ? '' : 's'}.`;
  }

  if (priceIntent.scope === 'room') {
    return `${priceIntent.roomName || 'This room'} is coming to ${formatINR(priceResult.total)}. Top buckets — ${topBreakdown}.`;
  }

  if (priceIntent.scope === 'category') {
    return `${priceIntent.category} in ${priceIntent.roomName || 'this room'} is coming to ${formatINR(priceResult.total)} across ${priceResult.matchedRowsCount} row${priceResult.matchedRowsCount === 1 ? '' : 's'}.`;
  }

  return `The total is ${formatINR(priceResult.total)}.`;
}


function inferRoomNameFromRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return '';

  const roomSet = new Set();
  rows.forEach((row) => {
    const roomName = String(getRowField(row, ['SpaceName', 'spaceName', 'RoomName', 'roomName']) || '').trim();
    if (roomName && roomName.toUpperCase() !== 'NOT_FOUND') {
      roomSet.add(roomName);
    }
  });

  const rooms = Array.from(roomSet);
  return rooms.length === 1 ? rooms[0] : '';
}

function isValidCsvValue(value) {
  const text = String(value ?? '').trim();
  return !!text && text.toUpperCase() !== 'NOT_FOUND';
}

function promoteUpdatedColumnsToBaseRows(rows = []) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const nextRow = { ...row };

    if (isValidCsvValue(nextRow.UpdatedProductName)) {
      nextRow.ProductName = nextRow.UpdatedProductName;
    }

    if (isValidCsvValue(nextRow.UpdatedProductSKU)) {
      nextRow.ProductSKU = nextRow.UpdatedProductSKU;
    }

    if (isValidCsvValue(nextRow.UpdatedProductPrice)) {
      nextRow.ProductPrice = nextRow.UpdatedProductPrice;
    }

    if (isValidCsvValue(nextRow.UpdatedProductQuantity)) {
      nextRow.ProductQuantity = nextRow.UpdatedProductQuantity;
    }

    return nextRow;
  });
}

function isBudgetRecommendationPrompt(messageText = '') {
  const text = String(messageText || '').toLowerCase();

  const hasRecommendationAction = [
    'show me',
    'change',
    'replace',
    'swap',
    'recommend',
    'suggest',
    'find',
    'give me',
  ].some((word) => text.includes(word));

  const hasBudgetLanguage =
    text.includes('budget') ||
    text.includes('price point') ||
    text.includes('around') ||
    text.includes('near') ||
    text.includes('higher') ||
    text.includes('lower') ||
    text.includes('under') ||
    text.includes('below') ||
    text.includes('within') ||
    text.includes('cheaper') ||
    text.includes('expensive') ||
    text.includes('percent') ||
    text.includes('%') ||
    text.includes('rupees') ||
    text.includes('rs') ||
    text.includes('₹') ||
    /\d{4,}/.test(text);

  const hasDesignCategory = [
    'chair',
    'chairs',
    'sofa',
    'sofas',
    'table',
    'tables',
    'conference table',
    'light',
    'lights',
    'wall',
    'floor',
    'painting',
    'paintings',
    'planter',
    'planters',
  ].some((word) => text.includes(word));

  return hasRecommendationAction && hasBudgetLanguage && hasDesignCategory;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MayaChat({ sendUpdatedCSVRowsToUnreal, roomNames, currentRoomName, sceneLoaded }) {
  const [visible, setVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [introPhase, setIntroPhase] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [input, setInput] = useState('');
  const [isTypingMode, setIsTypingMode] = useState(false);
  const typingInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningMode, setListeningMode] = useState('idle');
  const [recordedText, setRecordedText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [csvStatus, setCSVStatus] = useState(null);

  useEffect(() => {
    if (!sceneLoaded) return;
    const fadeTimer = setTimeout(() => setIntroFading(true), 2000);
    const doneTimer = setTimeout(() => setIntroPhase(false), 2600);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [sceneLoaded]);

  const currentRoomNameRef = useRef(String(currentRoomName || '').trim());

  useEffect(() => {
    const cleanRoomName = String(currentRoomName || '').trim();
    if (cleanRoomName) {
      currentRoomNameRef.current = cleanRoomName;
      console.log('✅ MayaChat currentRoomName prop updated:', cleanRoomName);
    }
  }, [currentRoomName]);

  const messagesEndRef = useRef(null);
  const panelRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const pauseTimeoutRef = useRef(null);
  const listeningRef = useRef(false);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioMimeTypeRef = useRef('audio/webm');
  const animationFrameRef = useRef(null);
  const lastAudioTimeRef = useRef(0);
  const wakeWordDetectedRef = useRef(false);
  const speechStartedRef = useRef(false);
  const firstMessageSentRef = useRef(false);
  const manuallyStoppedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const isProcessingRef = useRef(false);
  const recognitionRef = useRef(null);
  const queryEngineRef = useRef(new MayaQueryEngine());
  const liveTextRef = useRef('');
  const awaitingRoomSelectionRef = useRef(false);
  const availableRoomsRef = useRef([]);
  const pendingRoomConfirmRef = useRef(null);
  const isTypingModeRef = useRef(false);
  const roomNamesHandledRef = useRef(false);
  const pendingAudioRef = useRef(null);
  const awaitingSatisfactionRef = useRef(false);
  const hasPendingChangesRef = useRef(false);
  const awaitingNavigationConfirmRef = useRef(false);
  const pendingNavigationRoomRef = useRef(null);

  // ── Followup / clarification state ──────────────────────────────────────
  const FOLLOWUP_QUESTIONS_ENABLED = false; // set to true to re-enable clarifying questions
  const pendingRecEnginePayloadRef = useRef(null); // stores {jsonData, userQuery} while waiting
  const awaitingFollowupRef = useRef(false);        // true when Maya asked for more info
  const followupCountRef = useRef(0);               // number of clarifications asked for current design prompt
  const maxFollowupsPerDesignPromptRef = useRef(1); // one clarification max per design prompt

  const resetFollowupCounterForNextPrompt = () => {
    followupCountRef.current = 0;
    awaitingFollowupRef.current = false;
    pendingRecEnginePayloadRef.current = null;
    console.log('🔄 [FOLLOWUP COUNTER RESET] Ready for next design prompt.');
  };

  const lastMayaRequestIdRef = useRef("");
  const resultPollIntervalRef = useRef(null);
  const currentDesignPromptRef = useRef(null);
  const lastRecEngineResponseRef = useRef(null);
  const currentRecommendationOptionIndexRef = useRef(0);
  const currentDesignPromptKeyRef = useRef("");
  const designPromptHistoryRef = useRef([]);

  // Play any audio that was blocked by the browser's autoplay policy on first user gesture
  useEffect(() => {
    const tryPlayPending = () => {
      if (!pendingAudioRef.current) return;
      const { audio, finishTalkingAndListen } = pendingAudioRef.current;
      pendingAudioRef.current = null;
      audio.play().catch(() => finishTalkingAndListen());
    };
    document.addEventListener('click', tryPlayPending, { once: true });
    document.addEventListener('keydown', tryPlayPending, { once: true });
    return () => {
      document.removeEventListener('click', tryPlayPending);
      document.removeEventListener('keydown', tryPlayPending);
    };
  }, []);

  useEffect(() => {
    isTypingModeRef.current = isTypingMode;
    if (isTypingMode && typingInputRef.current) {
      setTimeout(() => {
        const el = typingInputRef.current;
        if (el) {
          el.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(el);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 10);
    }
  }, [isTypingMode]);

  /// Handle roomNames updates from Unreal — triggers room selection onboarding (first time only)
  useEffect(() => {
    if (!roomNames || roomNames.length === 0) return;

    console.log("roomNames updated:", roomNames);

    const splitCamelCase = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2');
    const rooms = roomNames.map(name => ({ original: name, display: splitCamelCase(name) }));
    availableRoomsRef.current = rooms;

    if (roomNamesHandledRef.current) return;
    roomNamesHandledRef.current = true;

    awaitingRoomSelectionRef.current = true;
    pendingRoomConfirmRef.current = null;

    setIsOpen(true);
    const welcomeText = `Welcome! Which room would you like to start designing first?`;
    const welcomeMsg = [...messagesRef.current, { role: 'assistant', content: '' }];
    setMessages(welcomeMsg);
    messagesRef.current = welcomeMsg;
    speakText(welcomeText, welcomeText);
  }, [roomNames]);

  useEffect(() => {
    const handleGotoRoomFinished = () => {
      awaitingRoomSelectionRef.current = false;
      pendingRoomConfirmRef.current = null;
      speechStartedRef.current = false;
      audioChunksRef.current = [];
      stopListeningImmediately();
      const promptText = "We're here! What would you like to change in this room?";
      const newMsgs = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(newMsgs);
      messagesRef.current = newMsgs;
      speakText(promptText, promptText);
    };
    window.addEventListener('gotoRoomFinished', handleGotoRoomFinished);
    return () => window.removeEventListener('gotoRoomFinished', handleGotoRoomFinished);
  }, []);

  useEffect(() => {
    const handleFinishedParsing = () => {
      setTimeout(() => {
        const blurEl = document.getElementById('maya-blur-overlay');
        if (blurEl) { blurEl.style.opacity = '0'; blurEl.style.pointerEvents = 'none'; }
      }, 2000);
      hasPendingChangesRef.current = true;
      awaitingSatisfactionRef.current = true;

      const cats = lastChangedCategories;
      const cleanName = (n) => n.replace(/vizwalkai_db_/gi, '').replace(/_product_ai_sku/gi, '').replace(/[_-]/g, ' ').toLowerCase().trim();

      console.log(`💰 [handleFinishedParsing] isPriceQuery=${lastChangeWasPriceQuery} priceDataLen=${lastPriceReflectionData.length}`, lastPriceReflectionData);
      const isPriceQuery = lastChangeWasPriceQuery;
      lastChangeWasPriceQuery = false;
      // Only consume price data when displaying it in the message.
      // For non-price queries, keep lastPriceReflectionData so the user can ask
      // "what's the price?" afterward and get old vs new comparison.
      const priceItems = isPriceQuery ? [...lastPriceReflectionData] : [];
      if (isPriceQuery) {
        lastPriceReflectionData = [];
      }

      let question;
      if (isPriceQuery && priceItems.length > 0) {
        if (priceItems.length === 1) {
          const item = priceItems[0];
          const catName = cleanName(item.category);
          question = `Your ${catName} went from ${formatINR(item.oldUnitPrice)} to ${formatINR(item.newUnitPrice)} — would you like to explore other options?`;
        } else {
          const parts = priceItems.map((item) =>
            `${cleanName(item.category)} from ${formatINR(item.oldUnitPrice)} to ${formatINR(item.newUnitPrice)}`
          );
          question = `Updated — ${parts.join(', ')}. Would you like to try something different?`;
        }
      } else if (cats.length === 0) {
        question = "The room has been updated. Are you happy with how it looks, or would you like to make any changes?";
      } else if (cats.length === 1) {
        question = `Your ${cleanName(cats[0])} has been updated. Are you happy with this, or would you like to explore other options?`;
      } else if (cats.length <= 3) {
        const last = cleanName(cats[cats.length - 1]);
        const rest = cats.slice(0, -1).map(cleanName).join(', ');
        question = `The ${rest} and ${last} have been updated. Does this look good, or would you like to try something different?`;
      } else {
        question = "The room has been refreshed. Are you satisfied with the result, or would you like to adjust anything?";
      }
      const newMsgs = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(newMsgs);
      messagesRef.current = newMsgs;
      speakText(question, question);
    };

    window.addEventListener('finishedParsingReplacementCsv', handleFinishedParsing);
    return () => window.removeEventListener('finishedParsingReplacementCsv', handleFinishedParsing);
  }, []);

  const sendMsgToUnreal = (jsonObject) => {
    try {
      if (!jsonObject.msgType) {
        console.error("sendMsgToUnreal: msgType is required in the payload");
        return;
      }

      if (jsonObject?.msgType === 'gotoRoom' && jsonObject?.targetRoom) {
        currentRoomNameRef.current = String(jsonObject.targetRoom || '').trim();
        console.log('📍 MayaChat active room updated from gotoRoom:', currentRoomNameRef.current);
      }

      console.log("sendMsgToUnreal: ", jsonObject);

      if (typeof PixelStreamingUiApp?.stream?.emitUIInteraction === "function") {
        PixelStreamingUiApp.stream.emitUIInteraction(jsonObject);
        return;
      }
    } catch (err) {
      console.error("Failed to send to Unreal:", err);
    }
  };

  // ============================================================================
  // ✅ FIXED: LISTEN FOR CSV FROM UNREAL VIA CustomEvent + postMessage fallback
  // ============================================================================
  useEffect(() => {
    const parseCsvArrayAndStore = (payload) => {
      const csvArray = Array.isArray(payload)
        ? payload
        : payload?.csvRows || payload?.data || [];

      const source = Array.isArray(payload)
        ? 'unknown'
        : payload?.source || 'csvFromUnreal';

      const roomNameFromPayload = Array.isArray(payload)
        ? ''
        : String(
            payload?.currentRoomName ||
            payload?.currentRoom ||
            payload?.roomName ||
            ''
          ).trim();

      if (!Array.isArray(csvArray) || csvArray.length === 0) {
        console.error('❌ Invalid CSV array received');
        return;
      }

      console.log(`\n📥 CSV RECEIVED - Parsing with PapaParse... source=${source}`);
      console.log('📍 Room name from CSV payload:', roomNameFromPayload || 'NOT_FOUND');
      console.log('📍 Room name from MayaChat ref:', currentRoomNameRef.current || 'NOT_FOUND');

      // Join lines into one CSV string and parse with header:true
      const csvString = csvArray.join("\n");

      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            console.log(`✅ Parsed ${results.data.length} rows from CSV`);
            console.log('Sample row:', results.data[0]);

            const inferredRoomName = inferRoomNameFromRows(results.data);
            const activeRoomName =
              roomNameFromPayload ||
              currentRoomNameRef.current ||
              String(currentRoomName || '').trim() ||
              inferredRoomName ||
              '';

            if (activeRoomName) {
              currentRoomNameRef.current = activeRoomName;
            }

            const shouldPromoteUpdatedColumns = [
              'replacement_sent_to_unreal',
              'receivedReplacementCsv',
              'received_replacement_csv',
            ].includes(source);

            const rowsForStorage = shouldPromoteUpdatedColumns
              ? promoteUpdatedColumnsToBaseRows(results.data)
              : results.data;

            console.log('📍 Active room used for price summary:', activeRoomName || 'NOT_FOUND');
            console.log('✅ MayaChat CSV storage source:', {
              source,
              promotedUpdatedColumns: shouldPromoteUpdatedColumns,
              sampleBefore: results.data[0],
              sampleAfter: rowsForStorage[0],
            });

            // Store properly parsed objects
            storeRoomCSV(rowsForStorage, activeRoomName, source);
            setCSVStatus(getCsvStatus());
          } else {
            console.error('❌ PapaParse returned no data');
          }
        },
        error: (err) => {
          console.error('❌ PapaParse error:', err);
        }
      });
    };

    // ✅ PRIMARY: Listen for CustomEvent dispatched by Experience.jsx
    const handleCsvCustomEvent = (event) => {
      console.log('\n📥 CSV RECEIVED VIA CustomEvent "csvFromUnreal"');
      parseCsvArrayAndStore(event.detail);
    };

    // ✅ FALLBACK: Listen for postMessage from parent
    const handlePostMessage = (event) => {
      const data = event.data;

      // Format 1: { type: 'csvFromUnreal', data: [...], currentRoomName: 'ConferenceRoom' }
      if (data?.type === 'csvFromUnreal' && Array.isArray(data.data)) {
        console.log('\n📥 CSV RECEIVED VIA postMessage (type: csvFromUnreal)');
        parseCsvArrayAndStore({
          csvRows: data.data,
          currentRoomName: data.currentRoomName || '',
          source: data.source || 'postMessage',
        });
        return;
      }

      // Format 2: Raw array where first row contains header keywords
      if (Array.isArray(data) && data.length > 0) {
        const firstRow = (data[0] || '').toString().toLowerCase();
        if (
          firstRow.includes('spacename') ||
          firstRow.includes('productname') ||
          firstRow.includes('category')
        ) {
          console.log('\n📥 CSV RECEIVED VIA postMessage (raw array)');
          parseCsvArrayAndStore(data);
        }
      }
    };

    window.addEventListener('csvFromUnreal', handleCsvCustomEvent);
    window.addEventListener('message', handlePostMessage);

    console.log('✅ CSV listeners registered (CustomEvent + postMessage)');

    return () => {
      window.removeEventListener('csvFromUnreal', handleCsvCustomEvent);
      window.removeEventListener('message', handlePostMessage);
    };
  }, []);

  // ========== KEYBOARD SHORTCUTS FOR CSV ==========
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'c' || e.key === 'C') {
        console.log('\n📊 CSV STATUS:');
        console.table(getCsvStatus());
      }
      if (e.key === 'q' || e.key === 'Q') {
        console.log('\n📝 QUERY QUEUE:');
        console.table(queryQueue.slice(0, 10));
      }
      if (e.key === 'r' || e.key === 'R') {
        csvStorage = {
          sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          original: null,
          recommendations: null,
          queryContext: null,
          current: null,
          currentState: 'idle',
          completionPercent: 0
        };
        queryQueue = [];
        console.log('🔄 CSV Storage Reset');
      }
      if (e.key === 'h' || e.key === 'H') {
        console.log(`
🎯 KEYBOARD SHORTCUTS:
  C → Check CSV Status
  Q → Show Query Queue
  R → Reset Storage
  H → Show this help
        `);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setIsOpen(true);
      setVisible(true);
      setListeningMode('idle');

      // Wake word detector is started by the dedicated useEffect below (wakeWordInitializedRef)
      // Do NOT call startWakeWordDetector() here — would create two competing instances
    }
  }, []);

  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (document.activeElement === typingInputRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!listeningRef.current) {
          setIsOpen(true);
          setVisible(true);
          startListening();
        } else {
          stopListeningImmediately();
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        isTypingModeRef.current = true;
        setIsTypingMode(true);
        stopListeningImmediately();
      } else if (e.key === 'Escape') {
        isTypingModeRef.current = false;
        setIsTypingMode(false);
        setInput('');
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ✅ Track if we've already initialized the wake word detector
  const wakeWordInitializedRef = useRef(false);

  // ✅ PAGE LOAD: Auto-start wake word detection
  // Flow: Page Loads → startWakeWordDetector() → Listen for "Hi Maya" → Auto-start listening mode
  useEffect(() => {
    // ✅ Only initialize ONCE, even if React Strict Mode runs effect twice
    if (wakeWordInitializedRef.current) {
      return;
    }
    wakeWordInitializedRef.current = true;

    startWakeWordDetector();

    return () => {
      // Cleanup: Stop the detector if component unmounts
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  // ✅ WAKE WORD DETECTOR - Runs when NOT in listening state
  // Detects "hi maya" and automatically switches to listening state
  const startWakeWordDetector = () => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      console.error('SpeechRecognition not supported - wake word disabled');
      return;
    }

    try {
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'en-IN';
      recognition.continuous = true;
      recognition.interimResults = true;

      let hadError = false;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase();
          const isFinal = event.results[i].isFinal;
          console.log(`🎤 Wake detector heard (${isFinal ? 'final' : 'interim'}): "${transcript}"`);

          // ✅ Only check FINAL results for wake word
          if (event.results[i].isFinal) {
            const hasWakeWord = WAKE_WORDS.some(word => transcript.includes(word));
            
            // ✅ If "hi maya" detected and NOT already listening, START LISTENING
            if (hasWakeWord && !listeningRef.current) {
              console.log('✅ WAKE WORD DETECTED: "' + transcript + '" - AUTO-STARTING LISTENING...');
              setListeningMode('listening');  // Transition to listening state
              recognitionRef.current = null;  // Clear the wake word detector
              recognition.stop();  // Stop wake word detector
              startListening();     // Start full listening mode
            }
          }
        }
      };

      let bShowWakeWordLogs = false; // Set to true to see all wake word detector transcripts

      recognition.onerror = (event) => {
        hadError = true;
        if(bShowWakeWordLogs) {
          console.warn('⚠️ Wake word detector error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            console.error('Mic permission denied — wake word detection disabled. Grant mic access and reload.');
          }
        }
      };

      recognition.onend = () => {
        if (bShowWakeWordLogs) console.log('Wake word detector ended, hadError:', hadError);
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        if (!listeningRef.current && hadError !== true) {
          setTimeout(() => startWakeWordDetector(), 500);
        } else if (hadError) {
          // Back-off longer on errors to avoid rapid failure loops
          setTimeout(() => {
            hadError = false;
            startWakeWordDetector();
          }, 3000);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      if(bShowWakeWordLogs) {
        console.log('🎤 Wake word detector started');
      }
    } catch (err) {
      console.error('Wake word detector failed to start:', err);
      setTimeout(() => startWakeWordDetector(), 3000);
    }
  };

  const startWebSpeechAPI = () => {
    try {
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (!event.results[i].isFinal) {
            interimTranscript += transcript;
          }
        }

        // ✅ FILTER: Only show design-related interim text (NOT comments/side talk)
        if (interimTranscript) {
          const designKeywords = [
            // Commands
            'show', 'change', 'make', 'swap', 'replace', 'suggest', 'recommend',
            'transform', 'redesign', 'preview', 'accept', 'confirm', 'apply', 'approve',
            
            // Furniture & items
            'sofa', 'chair', 'bed', 'table', 'lamp', 'rug', 'painting', 'light', 'decor',
            'cabinet', 'shelf', 'curtain', 'door', 'window', 'mirror', 'picture', 'frame',
            'cushion', 'pillow', 'blanket', 'carpet', 'mat', 'stool', 'bench', 'desk',
            
            // Properties
            'color', 'style', 'room', 'size', 'material', 'texture', 'pattern',
            'wood', 'metal', 'fabric', 'leather', 'glass', 'marble', 'concrete',
            
            // Rooms
            'kitchen', 'bedroom', 'living', 'dining', 'study', 'conference', 'hall',
            'bathroom', 'office', 'lounge', 'foyer', 'balcony', 'terrace',
            
            // Styles
            'scandinavian', 'japandi', 'modern', 'minimalist', 'contemporary',
            'traditional', 'rustic', 'industrial', 'bohemian', 'vintage', 'retro',
            'glamorous', 'luxury', 'cozy', 'warm', 'neutral', 'bold',
            
            // Price/Budget
            'price', 'cost', 'budget', 'under', 'within', 'spend', 'keep', 'stays',
            'affordable', 'expensive', 'cheap', 'premium', 'lakhs', 'rupees',
            
            // Colors
            'blue', 'red', 'green', 'yellow', 'white', 'black', 'gray', 'brown',
            'beige', 'cream', 'navy', 'teal', 'coral', 'pink', 'purple', 'gold',
            
            // Actions
            'what', 'how', 'why', 'show me', 'give me', 'tell me'
          ];

          const lowerInterim = interimTranscript.toLowerCase();
          const hasDesignKeyword = designKeywords.some(kw => lowerInterim.includes(kw));

          // ✅ Only show if it contains design-related keywords
          // ✅ Filter out: side talk, comments, greetings, off-topic
          if (hasDesignKeyword) {
            liveTextRef.current = interimTranscript;
            setLiveText(interimTranscript);
          } else {
            liveTextRef.current = '';
            setLiveText('');
          }
        }
      };

      recognition.onerror = () => {};
      recognition.onend = () => {};

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {}
  };

  const getDesignPromptKey = (jsonData, userQuery = "") => {
    const intent = String(jsonData?.intent || "").trim().toLowerCase();
    const category = String(jsonData?.params?.category || "").trim().toLowerCase();
    const style = String(jsonData?.params?.style || "").trim().toLowerCase();
    const room = String(jsonData?.params?.room || currentRoomNameRef.current || currentRoomName || "").trim().toLowerCase();
    const query = String(userQuery || "").trim().toLowerCase();

    return [intent, category, style, room, query].join("|");
  };

  const resetCachedOptionsForNewDesignPrompt = (jsonData, userQuery = "") => {
    currentRecommendationOptionIndexRef.current = 0;
    currentDesignPromptKeyRef.current = getDesignPromptKey(jsonData, userQuery);

    console.log("🧠 [OPTION CACHE RESET] New design prompt:", {
      key: currentDesignPromptKeyRef.current,
      optionIndex: currentRecommendationOptionIndexRef.current,
    });
  };

  const applyCachedDifferentOption = () => {
    const cachedResponse = lastRecEngineResponseRef.current;

    if (!cachedResponse || !Array.isArray(cachedResponse.categories) || cachedResponse.categories.length === 0) {
      console.warn("⚠️ No cached RecEngine response available for different option.");
      return false;
    }

    currentRecommendationOptionIndexRef.current += 1;
    const optionIndex = currentRecommendationOptionIndexRef.current;

    console.log("🔁 [CACHED DIFFERENT OPTION] Reusing existing RecEngine response:", {
      optionIndex,
      categories: cachedResponse.categories.map((c) => ({
        category: c.category,
        itemCount: Array.isArray(c.items) ? c.items.length : Array.isArray(c.skus) ? c.skus.length : 0,
      })),
    });

    const historyEntry = {
      promptKey: currentDesignPromptKeyRef.current,
      optionIndex,
      appliedAt: new Date().toISOString(),
      categories: cachedResponse.categories.map((c) => {
        const items = Array.isArray(c.items) ? c.items : [];
        const skus = Array.isArray(c.skus) ? c.skus : [];

        if (items.length > 0) {
          const safeIndex = optionIndex % items.length;
          return {
            category: c.category,
            optionIndex,
            safeIndex,
            sku: items[safeIndex]?.sku || "",
            price: items[safeIndex]?.price || "",
          };
        }

        if (skus.length > 0) {
          const safeIndex = optionIndex % skus.length;
          return {
            category: c.category,
            optionIndex,
            safeIndex,
            sku: skus[safeIndex] || "",
            price: "",
          };
        }

        return {
          category: c.category,
          optionIndex,
          safeIndex: -1,
          sku: "",
          price: "",
        };
      }),
    };

    designPromptHistoryRef.current.push(historyEntry);
    window.mayaDesignPromptHistory = designPromptHistoryRef.current;
    window.mayaLastAppliedCachedOption = historyEntry;

    onReceivedMsgFromRecEngine(
      cachedResponse,
      sendUpdatedCSVRowsToUnreal,
      currentRoomNameRef.current || currentRoomName,
      optionIndex
    );

    return true;
  };

  const startPollingForResult = (requestId) => {
    if (!requestId) return;

    lastMayaRequestIdRef.current = requestId;

    if (resultPollIntervalRef.current) {
      clearInterval(resultPollIntervalRef.current);
    }

    let attempts = 0;

    resultPollIntervalRef.current = setInterval(async () => {
      attempts++;

      try {
        const res = await fetch(`${RECEIVER_API_URL}/result/${requestId}`);
        const data = await res.json();

        if (data?.found && data?.data?.categories?.length) {
          // Guard: if another concurrent poll already processed this result, skip.
          if (!resultPollIntervalRef.current) return;

          clearInterval(resultPollIntervalRef.current);
          resultPollIntervalRef.current = null;

          console.log("✅ RESULT RECEIVED FROM API");
          console.log(JSON.stringify(data.data, null, 2));

          lastRecEngineResponseRef.current = data.data;
          window.lastMayaSearchResult = data.data;
          currentRecommendationOptionIndexRef.current = 0;

          console.log("🧠 [RECENGINE RESPONSE CACHED] optionIndex reset to 0", {
            requestId,
            categories: data.data.categories.map((c) => ({
              category: c.category,
              itemCount: Array.isArray(c.items) ? c.items.length : Array.isArray(c.skus) ? c.skus.length : 0,
            })),
          });

          onReceivedMsgFromRecEngine(
            data.data,
            sendUpdatedCSVRowsToUnreal,
            currentRoomNameRef.current || currentRoomName,
            currentRecommendationOptionIndexRef.current
          );
          setCSVStatus(getCsvStatus());
        }

        if (attempts >= 30) {
          console.warn("Result polling stopped — no result after 30s");
          clearInterval(resultPollIntervalRef.current);
          resultPollIntervalRef.current = null;
          // If we were waiting on a budget/price change, tell the user nothing matched
          if (lastChangeWasPriceQuery) {
            lastChangeWasPriceQuery = false;
            lastPriceReflectionData = [];
            const fallback = "Couldn't find a match within that budget — try a different range or style?";
            const withFallback = [...messagesRef.current, { role: 'assistant', content: '' }];
            setMessages(withFallback);
            messagesRef.current = withFallback;
            speakText(fallback, fallback);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1000);
  };

  const startListening = async () => {
    if (listeningRef.current) return;
    listeningRef.current = true;  // claim slot immediately — prevents onend race and double-calls

    // Stop wake word detector (or any running recognition) before starting full listening
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      streamRef.current = stream;
      lastAudioTimeRef.current = Date.now();
      wakeWordDetectedRef.current = false;
      speechStartedRef.current = false;

      let audioContext = audioContextRef.current;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;
      }

      if (audioContext.state === 'suspended') await audioContext.resume();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/mp4',
        audioBitsPerSecond: 16000
      });

      let actualMimeType = 'audio/mp4';
      if (!MediaRecorder.isTypeSupported('audio/mp4')) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          actualMimeType = 'audio/webm';
          mediaRecorderRef.current = new MediaRecorder(stream, {
            mimeType: 'audio/webm',
            audioBitsPerSecond: 16000
          });
        } else {
          actualMimeType = new MediaRecorder(stream, { audioBitsPerSecond: 16000 }).mimeType || 'audio/webm';
          mediaRecorderRef.current = new MediaRecorder(stream, { audioBitsPerSecond: 16000 });
        }
      } else {
        mediaRecorderRef.current = mediaRecorder;
      }

      const actualRecorder = mediaRecorderRef.current;
      audioChunksRef.current = [];
      audioMimeTypeRef.current = actualMimeType;

      actualRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      actualRecorder.onstop = async () => {
        const blobCount = audioChunksRef.current.length;
        const audioBlob = blobCount > 0 ? new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current }) : null;
        const blobSize = audioBlob ? audioBlob.size : 0;

        if (audioBlob && blobCount > 0) {
          const hasSpeech = speechStartedRef.current;

          if (hasSpeech && blobSize > 15000) {
            if (!isTypingModeRef.current) {
              await sendAudioToSarvam(audioBlob);
            } else if (!isProcessingRef.current) {
              speechStartedRef.current = false;
            }
          } else {
            if (!isProcessingRef.current && !isTypingModeRef.current) {
              setListeningMode('listening');
              speechStartedRef.current = false;
              setTimeout(() => startListening(), 500);
            }
          }
        } else {
          if (!isProcessingRef.current && !isTypingModeRef.current) {
            setListeningMode('listening');
            speechStartedRef.current = false;
            setTimeout(() => startListening(), 500);
          }
        }
      };

      actualRecorder.onerror = () => {
        stopListeningImmediately();
      };

      actualRecorder.start(100);
      setIsListening(true);
      setListeningMode('listening');

      startWebSpeechAPI();
      monitorAudioLevels(analyser);
    } catch (err) {
      listeningRef.current = false;
      setIsListening(false);
    }
  };

  const stopListeningImmediately = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (err) {}
    }

    listeningRef.current = false;
    setIsListening(false);
  };

  const monitorAudioLevels = (analyser) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceFrameCount = 0;
    let lastSpeechTime = Date.now();

    const checkAudio = () => {
      if (!listeningRef.current) return;

      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      let count = 0;
      const relevantBins = dataArray.slice(10, 150);

      for (let i = 0; i < relevantBins.length; i++) {
        sum += relevantBins[i] * relevantBins[i];
        if (relevantBins[i] > NOISE_THRESHOLD) count++;
      }

      const speechEnergy = Math.sqrt(sum / relevantBins.length);
      const speechConfidence = count / relevantBins.length;
      const isSpeech = speechEnergy > NOISE_THRESHOLD && speechConfidence > SPEECH_CONFIDENCE_THRESHOLD;

      if (isSpeech) {
        lastSpeechTime = Date.now();
        lastAudioTimeRef.current = lastSpeechTime;
        silenceFrameCount = 0;

        if (!speechStartedRef.current) {
          speechStartedRef.current = true;
          setListeningMode('listening');
        }

        if (pauseTimeoutRef.current) {
          clearTimeout(pauseTimeoutRef.current);
          pauseTimeoutRef.current = null;
        }
      } else {
        silenceFrameCount++;
        const timeSinceSpeech = Date.now() - lastSpeechTime;

        if (speechStartedRef.current && silenceFrameCount > 8 && timeSinceSpeech > SILENCE_TIMEOUT) {
          if (!pauseTimeoutRef.current) {
            setListeningMode('listening');
            pauseTimeoutRef.current = true;

            if (listeningRef.current) {
              stopListeningImmediately();
              setListeningMode('thinking');
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  };

  const handleTranscript = async (transcript, confidence = 1) => {
    if (!transcript || transcript.trim().length === 0) {
      setListeningMode('listening');
      setTimeout(() => startListening(), 1000);
      return;
    }

    // Block long rambling inputs — max 20 words
    const MAX_WORDS = 20;
    const wordCount = transcript.trim().split(/\s+/).length;
    if (wordCount > MAX_WORDS) {
      console.log(`⚠️ Too long (${wordCount} words) - ignoring: "${transcript}"`);
      setListeningMode('listening');
      setLiveText('');
      setTimeout(() => startListening(), 1000);
      return;
    }

    const lowerTranscript = transcript.toLowerCase();
    const originalTranscript = transcript;

    if (awaitingRoomSelectionRef.current) {
      sendMessage(transcript);
      return;
    }

    // Bypass intent validation for direct room navigation commands mid-session
    if (availableRoomsRef.current.length > 0) {
      const navPrefixes = ['go to ', 'take me to ', 'navigate to ', 'head to ', "let's go to ", 'lets go to ', 'teleport to ', 'move to ', 'i want to go to ', 'can we go to '];
      const lowerT = transcript.toLowerCase().trim();
      if (navPrefixes.some(p => lowerT.startsWith(p))) {
        sendMessage(transcript);
        return;
      }
    }

    // ── If awaiting followup, bypass intent validation ────────────────────
    // User is answering Maya's clarifying question — won't pass design intent
    // validation on its own (e.g. "red", "cozy", "warm neutrals") but is
    // valid in context of the pending query.
    if (awaitingFollowupRef.current && pendingRecEnginePayloadRef.current) {
      console.log(`✅ Followup answer received, bypassing intent validation: "${transcript}"`);
      setRecordedText(originalTranscript);
      sendMessage(transcript);
      return;
    }

    const hasWakeWord = WAKE_WORDS.some(word => lowerTranscript.includes(word));

    // CONFIDENCE GATE: skip low-confidence audio that has no wake word
    const CONFIDENCE_THRESHOLD = 0.75;
    if (!hasWakeWord && confidence < CONFIDENCE_THRESHOLD) {
      console.log(`⚠️ Low confidence (${(confidence * 100).toFixed(1)}%) - ignoring: "${transcript}"`);
      setListeningMode('listening');
      setLiveText('');
      setTimeout(() => startListening(), 1000);
      return;
    }

    // INTENT VALIDATION — always required, wake word does NOT skip this
    // e.g. "maya what is the time" has wake word but no valid design intent → rejected
    const validation = queryEngineRef.current.validateQuery(transcript);
    const isValidIntent = validation && validation.isValid;

    if (!isValidIntent) {
      if (hasWakeWord) {
        // Has wake word but not a valid command (e.g. "maya what is the time")
        // Live text can stay briefly — user said this is fine
        console.log(`💬 Wake word but no valid intent - ignoring: "${transcript}"`);
      } else {
        // Pure side talk (e.g. "food is good", "do you get any traffic")
        // Clear live text so nothing shows in the UI
        console.log(`💬 Side talk, no intent - ignoring: "${transcript}"`);
        setLiveText('');
      }
      setListeningMode('listening');
      setTimeout(() => startListening(), 1000);
      return;
    }

    // Valid design intent — send to Maya
    console.log(`✅ Valid intent (confidence: ${(confidence * 100).toFixed(1)}%): "${transcript}"`);
    const command = validation.cleanCommand;
    setRecordedText(originalTranscript);
    sendMessage(command);
  };

  const sendAudioToSarvam = async (audioBlob) => {
    sttQueue.push({
      data: audioBlob,
      callback: (result) => {
        // ✅ Handle both transcript object and legacy string format
        const transcript = result?.transcript || result;
        const confidence = result?.confidence ?? 1;

        if (transcript) {
          liveTextRef.current = '';
          setLiveText('');
          handleTranscript(transcript, confidence);
        } else if (!isTypingModeRef.current) {
          audioChunksRef.current = [];
          speechStartedRef.current = false;
          setListeningMode('listening');
          setTimeout(() => startListening(), 1500);
        }
      }
    });
    processSTTQueue();
  };

  const sendMsgToRecEngine = async (jsonData, userQuery = "", excludeSkus = []) => {
  if (!RECEIVER_API_URL) return;

    try {
    resetCachedOptionsForNewDesignPrompt(jsonData, userQuery);

    // Extract unique categories from the room's CSV
      const roomRows = csvStorage.original || [];
      const roomCategories = [...new Set(
        roomRows
          .map(row => (row.Category || "").trim())
          .filter(cat => cat && cat !== "NOT_FOUND")
      )];

    const payloadWithId = {
      ...jsonData,
      search_query: userQuery,
      request_id: `maya-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: "maya_frontend",
      created_at: new Date().toISOString(),
      ...(excludeSkus.length > 0 && { exclude_skus: excludeSkus }),

        csv_data: {
          original_rows: csvStorage.original || [],
          current_rows: csvStorage.current || [],
          session_id: csvStorage.sessionId,
          room_name: currentRoomName || "Unknown",
          available_rooms: roomNames || [],
        room_categories: roomCategories,        // ← NEW
        }
      };

      console.log("📤 Sending payload with CSV data to receiver:", payloadWithId);

      const res = await fetch(`${RECEIVER_API_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithId),
      });

      const result = await res.json().catch(() => null);
      console.log("✅ Receiver status:", res.status, result);

      // Non-search intents (navigate, confirm_order, etc.) only need to notify the
      // backend — they must NOT apply furniture recommendations from the response.
      const noSearchIntents = ['navigate', 'confirm_order', 'budget_analysis', 'go_back_original', 'change_budget'];
      if (!noSearchIntents.includes(jsonData.intent)) {
        awaitingSatisfactionRef.current = true;
        startPollingForResult(payloadWithId.request_id);
      }
    } catch (err) {
      console.error("Failed to post:", err);
    }
  };

  const streamTextDirectly = (fullText, onDone) => {
    const words = fullText.split(' ');
    let idx = 0;
    let out = '';
    const step = () => {
      if (idx < words.length) {
        out += (idx > 0 ? ' ' : '') + words[idx++];
        const msgs = [...messagesRef.current.slice(0, -1), { role: 'assistant', content: out }];
        setMessages(msgs);
        messagesRef.current = msgs;
        setTimeout(step, 80);
      } else if (onDone) {
        onDone();
      }
    };
    step();
  };

  const speakText = (text, fullText) => {
    if (!text || text.trim().length === 0) return;

    // Typing mode: skip Sarvam TTS entirely, show text immediately
    if (isTypingModeRef.current) {
      streamTextDirectly(fullText, null);
      return;
    }

    ttsQueue.push({
      data: text,
      callback: (audioBase64) => {
        if (audioBase64) {
          setIsSpeaking(true);
          try {
            const binaryString = atob(audioBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onloadedmetadata = () => {
              const words = fullText.split(" ");
              const audioDurationMs = audio.duration * 1000;
              const delayPerWord = Math.max(80, audioDurationMs / words.length);

              setListeningMode('talking');
              stopListeningImmediately();

              let currentIndex = 0;
              let displayedText = '';
              let hasFinished = false;

              const finishTalkingAndListen = () => {
                if (hasFinished) return;
                hasFinished = true;

                setIsSpeaking(false);
                setListeningMode('listening');
                speechStartedRef.current = false;
                pauseTimeoutRef.current = null;
                listeningRef.current = false;

                if (audioUrl) URL.revokeObjectURL(audioUrl);

                console.log('🎧 Starting listening immediately after talking...');

                if (!listeningRef.current) {
                  startListening();
                }
              };

              const streamNextWord = () => {
                if (currentIndex < words.length) {
                  displayedText += (currentIndex > 0 ? ' ' : '') + words[currentIndex];
                  const streamedMessages = [
                    ...messagesRef.current.slice(0, -1),
                    { role: 'assistant', content: displayedText }
                  ];
                  setMessages(streamedMessages);
                  messagesRef.current = streamedMessages;
                  currentIndex++;
                  setTimeout(streamNextWord, delayPerWord);
                }
              };

              streamNextWord();

              try {
                const playPromise = audio.play();

                if (playPromise !== undefined) {
                  playPromise
                    .then(() => { console.log('🔊 Audio playback started'); })
                    .catch((err) => {
                      console.log('⚠️ Audio autoplay blocked:', err.message);
                      // Store for playback on first user gesture; fallback after 15s
                      pendingAudioRef.current = { audio, finishTalkingAndListen };
                      const fallbackTimer = setTimeout(() => {
                        if (pendingAudioRef.current?.audio === audio) {
                          pendingAudioRef.current = null;
                          finishTalkingAndListen();
                        }
                      }, 15000);
                      audio.addEventListener('play', () => clearTimeout(fallbackTimer), { once: true });
                    });
                }
              } catch (err) {
                console.log('⚠️ Audio playback error:', err.message);
                finishTalkingAndListen();
              }

              audio.onended = finishTalkingAndListen;
              audio.onerror = finishTalkingAndListen;
            };

          } catch (err) {
            setIsSpeaking(false);
          }
        } else {
          // TTS unavailable (CORS / no key / rate limit) — stream text directly so message still shows
          streamTextDirectly(fullText, () => {
            setListeningMode('listening');
            speechStartedRef.current = false;
            pauseTimeoutRef.current = null;
            listeningRef.current = false;
            if (!isTypingModeRef.current) setTimeout(() => startListening(), 1000);
          });
        }
      }
    });
    processTTSQueue();
  };

  const sendMessage = async (textToSend = null) => {
    const messageText = textToSend || input;

    if (isProcessingRef.current) {
      sttQueue.length = 0;
      return;
    }

    if (!messageText || !messageText.trim() || loading) return;

    lastChangeWasPriceQuery = false;
    isProcessingRef.current = true;

    stopListeningImmediately();
    setListeningMode('thinking');

    // ── Budget recommendation routing ───────────────────────────────────────
    // These prompts must go to RecEngine, not the local total-price calculator.
    // Example: "show me chairs with 10% higher budget"
    const shouldSendBudgetPromptToRecEngine = isBudgetRecommendationPrompt(messageText);
    if (shouldSendBudgetPromptToRecEngine) {
      awaitingSatisfactionRef.current = false;
      hasPendingChangesRef.current = false;
      awaitingFollowupRef.current = false;
      pendingRecEnginePayloadRef.current = null;
      followupCountRef.current = 0;
      console.log('🎯 Budget recommendation prompt routed directly to RecEngine:', messageText);

      const rows = getPriceRowsFromStorage();
      const detectedCategory = findCategoryInPrompt(messageText, rows) || 'Chair';
      const budgetJson = {
        reply: 'Budget noted — pulling the closest matches now.',
        intent: 'selected_swap',
        needs_clarification: false,
        params: {
          category: detectedCategory,
          style: null,
          color: null,
          secondary_colors: [],
          room: currentRoomNameRef.current || currentRoomName || null,
          mood: null,
          price_range: messageText,
          material: null,
          quantity: null,
          seating_capacity: null,
          budget: null,
          anchor_item: null,
          bundle_count: null,
          additional_params: {
            budget_filter_prompt: true,
            target_price_source: 'backend_from_query_and_csv_productprice',
          },
        },
      };

      const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
      setMessages(withUser);
      messagesRef.current = withUser;
      setInput('');
      setRecordedText('');

      const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(withMaya);
      messagesRef.current = withMaya;
      speakText(budgetJson.reply, budgetJson.reply);

      currentDesignPromptRef.current = { jsonData: budgetJson, userQuery: messageText };

      lastChangeWasPriceQuery = true;
      hasPendingChangesRef.current = true;
      window.pendingChange = { intent: budgetJson.intent, params: budgetJson.params, timestamp: Date.now() };
      if (typeof window.sendToUnreal === 'function') {
        window.sendToUnreal({ msgType: 'getRoomCsv' });
      }

      await sendMsgToRecEngine(budgetJson, messageText);

      setLoading(false);
      isProcessingRef.current = false;
      return;
    }

    // ── Price / budget query handler ─────────────────────────────────────────
    // Handles true price-summary questions only:
    // 1) Total price for entire level
    // 2) Total price for current/specific room
    // 3) Price of a specific category in the room
    // This does NOT call OpenAI or RecEngine. It calculates from csvStorage.
    const priceIntent = shouldSendBudgetPromptToRecEngine
      ? null
      : detectPricePrompt(messageText, currentRoomNameRef.current || currentRoomName, roomNames || []);
    if (priceIntent) {
      const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
      setMessages(withUser);
      messagesRef.current = withUser;
      setInput('');
      setRecordedText('');

      let reply;
      if (lastPriceReflectionData.length > 0) {
        const cleanCat = (n) => n.replace(/vizwalkai_db_/gi, '').replace(/_product_ai_sku/gi, '').replace(/[_-]/g, ' ').toLowerCase().trim();
        const priceLines = lastPriceReflectionData.map((item) =>
          `${cleanCat(item.category)} went from ${formatINR(item.oldUnitPrice)} to ${formatINR(item.newUnitPrice)}`
        );
        if (priceLines.length === 1) {
          const item = lastPriceReflectionData[0];
          const suffix = item.newUnitPrice > item.oldUnitPrice
            ? "a step up, and it shows."
            : item.newUnitPrice < item.oldUnitPrice
            ? "a little easier on the budget — smart."
            : "same price, different character.";
          reply = `${priceLines[0]} — ${suffix}`;
        } else {
          reply = `Here's where we landed — ${priceLines.join(', ')}.`;
        }
        lastPriceReflectionData = [];
      } else {
        const rows = getPriceRowsFromStorage();
        const priceResult = calculateCsvPrice({
          rows,
          roomName: priceIntent.roomName,
          category: priceIntent.category,
        });
        console.log('💰 [PRICE INTENT]', priceIntent);
        console.log('💰 [PRICE RESULT]', priceResult);
        window.lastMayaPriceIntent = priceIntent;
        window.lastMayaPriceResult = priceResult;
        reply = buildPriceReply(priceIntent, priceResult);
      }
      const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(withMaya);
      messagesRef.current = withMaya;
      speakText(reply, reply);

      setLoading(false);
      isProcessingRef.current = false;
      return;
    }

    // ── Navigation confirmation handler ──────────────────────────────────────
    if (awaitingNavigationConfirmRef.current) {
      const lower = messageText.toLowerCase();
      const isYes = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'yup', 'keep', 'save', 'accept', 'lock'].some(w => lower.includes(w));

      const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
      setMessages(withUser);
      messagesRef.current = withUser;
      setInput('');
      setRecordedText('');

      const room = pendingNavigationRoomRef.current;
      pendingNavigationRoomRef.current = null;
      awaitingNavigationConfirmRef.current = false;
      hasPendingChangesRef.current = false;
      awaitingSatisfactionRef.current = false;
      resetFollowupCounterForNextPrompt();

      const unrealSend = typeof window.sendToUnreal === 'function' ? window.sendToUnreal : sendMsgToUnreal;
      if (isYes) {
        unrealSend({ msgType: 'acceptAllChanges' });
      } else {
        unrealSend({ msgType: 'disablePreview' });
      }
      if (room) {
        unrealSend({ msgType: 'gotoRoom', targetRoom: room.original });
      }

      const reply = isYes
        ? `Locked in. Off to the ${room?.display || 'next room'} now.`
        : `Got it — off to the ${room?.display || 'next room'}.`;
      const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(withMaya);
      messagesRef.current = withMaya;
      speakText(reply, reply);
      isProcessingRef.current = false;
      return;
    }

    // ── Followup answer handler ───────────────────────────────────────────────
    // User answered Maya's single style/color clarification.
    // IMPORTANT: Do NOT send this back into OpenAI again.
    // Merge original prompt + answer and fire the existing RecEngine/Unreal flow directly.
    if (awaitingFollowupRef.current && pendingRecEnginePayloadRef.current) {
      const { jsonData: originalJson, userQuery: originalQuery } = pendingRecEnginePayloadRef.current;
      const preferenceAnswer = messageText.trim();
      const clarificationQuestion = originalJson.reply || '';

      // No fixed style/color wording here. We keep the original user request,
      // the dynamic question Maya/LLM asked, and the user's answer.
      const enrichedQuery = [originalQuery, clarificationQuestion, preferenceAnswer]
        .filter(Boolean)
        .join(' ');

      const enrichedJson = {
        ...originalJson,
        needs_clarification: false,
        params: {
          ...(originalJson.params || {}),
          additional_params: {
            ...(originalJson.params?.additional_params || {}),
            clarification_question: clarificationQuestion || null,
            clarification_answer: preferenceAnswer,
          },
        },
      };

      console.log('🧠 [FOLLOWUP] Original query : "' + originalQuery + '"');
      console.log('🧠 [FOLLOWUP] User answer    : "' + preferenceAnswer + '"');
      console.log('🧠 [FOLLOWUP] Count used     : ' + followupCountRef.current + '/' + maxFollowupsPerDesignPromptRef.current);
      console.log('🧠 [FOLLOWUP] Sending query  : "' + enrichedQuery + '"');

      awaitingFollowupRef.current = false;
      pendingRecEnginePayloadRef.current = null;
      currentDesignPromptRef.current = { jsonData: enrichedJson, userQuery: enrichedQuery };

      const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
      setMessages(withUser);
      messagesRef.current = withUser;
      setInput('');
      setRecordedText('');

      // Do not add another fixed assistant line here. The next spoken message
      // should come from the normal Unreal/result/satisfaction flow.
      await sendMsgToRecEngine(enrichedJson, enrichedQuery);

      isProcessingRef.current = false;
      return;
    }

    // ── Satisfaction check handler ────────────────────────────────────────────
    if (awaitingSatisfactionRef.current) {
      const lower = messageText.toLowerCase();

      // A new design change query counts as implicit yes to the previous change
      const changeQueryKeywords = ['change', 'swap', 'replace', 'transform', 'redesign', 'update', 'switch', 'convert', 'make it', 'put a', 'put the'];
      const isNewChangeQuery = changeQueryKeywords.some(kw => lower.includes(kw));

      const isYes = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'yup', 'happy', 'satisfied', 'love', 'perfect', 'looks good', 'accept', 'apply', 'confirm', 'great', 'keep', 'save', "let's keep", 'lets keep', 'keep it', 'save it', 'lock it'].some(w => lower.includes(w));

      if (isNewChangeQuery) {
        // Implicit yes — silently accept the previous change, then fall through to process the new query
        awaitingSatisfactionRef.current = false;
        hasPendingChangesRef.current = false;
        resetFollowupCounterForNextPrompt();
        const unrealSend = typeof window.sendToUnreal === 'function' ? window.sendToUnreal : sendMsgToUnreal;
        unrealSend({ msgType: 'acceptAllChanges' });
        unrealSend({ msgType: 'getRoomCsv' });
        // Do NOT return — fall through so the new change query is processed normally
      } else if (isYes) {
        awaitingSatisfactionRef.current = false;
        hasPendingChangesRef.current = false;
        resetFollowupCounterForNextPrompt();

        const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
        setMessages(withUser);
        messagesRef.current = withUser;
        setInput('');
        setRecordedText('');

        const unrealSend = typeof window.sendToUnreal === 'function' ? window.sendToUnreal : sendMsgToUnreal;
        unrealSend({ msgType: 'acceptAllChanges' });
        unrealSend({ msgType: 'getRoomCsv' });

        const reply = "Applied. And for the record — excellent call.";
        const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
        setMessages(withMaya);
        messagesRef.current = withMaya;
        speakText(reply, reply);
        isProcessingRef.current = false;
        return;
      } else {
      // User said no — determine intent: navigate away or try a different option
      awaitingSatisfactionRef.current = false;
      resetFollowupCounterForNextPrompt();

      const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
      setMessages(withUser);
      messagesRef.current = withUser;
      setInput('');
      setRecordedText('');

      const navKeywords = ['go to', 'take me to', 'navigate', 'head to', 'different room', 'another room', 'move to', "let's go", 'lets go', 'change room', 'switch room'];
      const isNavigationNo = navKeywords.some(kw => lower.includes(kw));

      const altKeywords = ['different', 'another option', 'something else', 'try again', 'alternative', 'more option', 'other option', 'show me more', 'other one'];
      const isDifferentOption = !isNavigationNo && altKeywords.some(kw => lower.includes(kw));

      if (isNavigationNo) {
        const rooms = availableRoomsRef.current;
        const normStr = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const userNorm = normStr(lower);
        const foundRoom = rooms.find(r =>
          userNorm.includes(normStr(r.display)) || userNorm.includes(normStr(r.original))
        );

        const noKeywords = ['no', 'nope', 'nah', 'don\'t', 'dont', 'not happy', 'not satisfied', 'discard', 'revert'];
        const isExplicitNo = noKeywords.some(kw => lower.includes(kw));
        const unrealSend = typeof window.sendToUnreal === 'function' ? window.sendToUnreal : sendMsgToUnreal;

        if (foundRoom && isExplicitNo) {
          hasPendingChangesRef.current = false;
          unrealSend({ msgType: 'disablePreview' });
          unrealSend({ msgType: 'gotoRoom', targetRoom: foundRoom.original });
          unrealSend({ msgType: 'getRoomCsv' });
          const withMayaNav = [...messagesRef.current, { role: 'assistant', content: '' }];
          setMessages(withMayaNav);
          messagesRef.current = withMayaNav;
          speakText(`On our way to the ${foundRoom.display}.`, `On our way to the ${foundRoom.display}.`);
        } else if (foundRoom) {
          pendingNavigationRoomRef.current = foundRoom;
          awaitingNavigationConfirmRef.current = true;
          const cleanName = (n) => n.replace(/vizwalkai_db_/gi, '').replace(/_product_ai_sku/gi, '').replace(/[_-]/g, ' ').toLowerCase().trim();
          const cats = lastChangedCategories;
          const itemDesc = cats.length === 1 ? `the ${cleanName(cats[0])} update` : 'these updates';
          const confirmMsg = `Sure! Just to confirm — are we keeping ${itemDesc} as we head to the ${foundRoom.display}?`;
          const withMayaNav = [...messagesRef.current, { role: 'assistant', content: '' }];
          setMessages(withMayaNav);
          messagesRef.current = withMayaNav;
          speakText(confirmMsg, confirmMsg);
        } else {
          hasPendingChangesRef.current = false;
          unrealSend({ msgType: 'disablePreview' });
          awaitingRoomSelectionRef.current = true;
          const withMayaNav = [...messagesRef.current, { role: 'assistant', content: '' }];
          setMessages(withMayaNav);
          messagesRef.current = withMayaNav;
          speakText("Of course — which room shall we head to?", "Of course — which room shall we head to?");
        }
        isProcessingRef.current = false;
        return;
      }

      if (isDifferentOption) {
        lastChangeWasPriceQuery = true;

        const applied = applyCachedDifferentOption();

        if (!applied) {
          console.warn("⚠️ Cached option failed. Asking user for a fresh prompt.");

          const fallbackReply = "I don't have another saved option for this one — give me the direction again and I'll pull a fresh set.";
          const withFallback = [...messagesRef.current, { role: 'assistant', content: '' }];
          setMessages(withFallback);
          messagesRef.current = withFallback;
          speakText(fallbackReply, fallbackReply);
        }

        isProcessingRef.current = false;
        return;
      }

      // Generic no — revert the preview and ask what to change
      const rejectKeywords = ['no', 'nope', 'nah', "didn't like", 'didnt like', 'not happy', 'not satisfied', 'discard', 'revert', 'undo', 'go back', 'previous', 'old', "don't like", 'dont like'];
      const isExplicitReject = rejectKeywords.some(kw => lower.includes(kw));
      const unrealSend = typeof window.sendToUnreal === 'function' ? window.sendToUnreal : sendMsgToUnreal;
      if (isExplicitReject) {
        hasPendingChangesRef.current = false;
        unrealSend({ msgType: 'disablePreview' });
        //unrealSend({ msgType: 'getRoomCsv' });  TODO: Confirm this getRoomCsv is not needed
      }
      const noReply = "Of course — what would you like to change?";
      const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(withMaya);
      messagesRef.current = withMaya;
      speakText(noReply, noReply);
      isProcessingRef.current = false;
      return;
      } // end else (no-handling)
    }

    if (awaitingRoomSelectionRef.current) {
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const navPrefixes = ['go to ', 'take me to ', 'navigate to ', 'head to ', "let's go to ", 'lets go to ', 'teleport to ', 'move to ', 'i want to go to ', 'can we go to '];
      let cleanInput = messageText.toLowerCase().trim();
      for (const prefix of navPrefixes) {
        if (cleanInput.startsWith(prefix)) { cleanInput = cleanInput.slice(prefix.length).trim(); break; }
      }
      const userNorm = norm(cleanInput);
      const userStem = userNorm.replace(/s$/, '');
      const rooms = availableRoomsRef.current;

      const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
      setMessages(withUser);
      messagesRef.current = withUser;
      setInput('');
      setRecordedText('');

      const addMayaReply = (text) => {
        const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
        setMessages(withMaya);
        messagesRef.current = withMaya;
        speakText(text, text);
        isProcessingRef.current = false;
      };

      // "current room" — user is already here, skip gotoRoom
      const currentRoomPhrases = ['current room', 'this room', 'here', 'where i am', 'stay here'];
      if (currentRoomPhrases.some(p => cleanInput === p || cleanInput.includes(p))) {
        const currentRoom = rooms.find(r => r.original === currentRoomName)
                         || { original: currentRoomName, display: currentRoomName };
        awaitingRoomSelectionRef.current = false;
        pendingRoomConfirmRef.current = null;
        speechStartedRef.current = false;
        audioChunksRef.current = [];
        stopListeningImmediately();
        window.sendToUnreal({ msgType: 'getRoomCsv' });
        const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
        setMessages(withMaya);
        messagesRef.current = withMaya;
        speakText(
          `Great! What would you like to design in the ${currentRoom.display} today?`,
          `Great! What would you like to design in the ${currentRoom.display} today?`
        );
        isProcessingRef.current = false;
        return;
      }

      if (pendingRoomConfirmRef.current) {
        const lower = messageText.toLowerCase();
        const yesWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'sure', 'ok', 'okay', 'yup'];
        const noWords = ['no', 'nope', 'nah', 'not', 'wrong'];

        if (yesWords.some(w => lower.includes(w))) {
          const room = pendingRoomConfirmRef.current;
          pendingRoomConfirmRef.current = null;
          awaitingRoomSelectionRef.current = false;
          window.sendToUnreal({ msgType: 'gotoRoom', targetRoom: room.original });
          addMayaReply(`Let's go! Heading to the ${room.display} now.`);
          return;
        } else if (noWords.some(w => lower.includes(w))) {
          pendingRoomConfirmRef.current = null;
          addMayaReply(`No worries — which room would you like to go to?`);
          return;
        }
        pendingRoomConfirmRef.current = null;
      }

      let exactMatch = null;
      let partialMatch = null;
      for (const room of rooms) {
        const dn = norm(room.display);
        const on = norm(room.original);
        const dnStem = dn.replace(/s$/, '');
        const onStem = on.replace(/s$/, '');
        if (userNorm === dn || userNorm === on || userStem === dnStem || userStem === onStem || userNorm.includes(dn) || userNorm.includes(on)) { exactMatch = room; break; }
        if (!partialMatch && (dn.includes(userStem) || userStem.includes(dnStem))) {
          partialMatch = room;
        }
      }

      if (exactMatch) {
        awaitingRoomSelectionRef.current = false;
        if (exactMatch.original === currentRoomName) {
          window.sendToUnreal({ msgType: 'getRoomCsv' });
          addMayaReply(`Great! What would you like to design in the ${exactMatch.display} today?`);
        } else {
          window.sendToUnreal({ msgType: 'gotoRoom', targetRoom: exactMatch.original });
          addMayaReply(`Let's go! Heading to the ${exactMatch.display} now.`);
        }
      } else if (partialMatch) {
        pendingRoomConfirmRef.current = partialMatch;
        addMayaReply(`Do you mean the ${partialMatch.display}?`);
      } else {
        const roomList = availableRoomsRef.current.map(r => r.display);
        const suggestion = roomList.length === 0
          ? `Which room would you like to go to?`
          : roomList.length <= 3
          ? `Did you mean the ${roomList.join(' or the ')}?`
          : `We've got — ${roomList.join(', ')}. Which one did you mean?`;
        addMayaReply(`No ${cleanInput} on my list. ${suggestion}`);
      }
      return;
    }

    // Direct navigation intercept — if user explicitly says "go to X" and X matches a known room,
    // send gotoRoom immediately without hitting the AI pipeline
    if (availableRoomsRef.current.length > 0) {
      const navPrefixes = ['go to ', 'take me to ', 'navigate to ', 'head to ', "let's go to ", 'lets go to ', 'teleport to ', 'move to ', 'i want to go to ', 'can we go to '];
      let navInput = messageText.toLowerCase().trim();
      let hasNavPrefix = false;
      for (const prefix of navPrefixes) {
        if (navInput.startsWith(prefix)) { navInput = navInput.slice(prefix.length).trim(); hasNavPrefix = true; break; }
      }
      if (hasNavPrefix) {
        const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const uNorm = norm(navInput);
        const uStem = uNorm.replace(/s$/, '');
        for (const room of availableRoomsRef.current) {
          const dn = norm(room.display);
          const on = norm(room.original);
          const dnStem = dn.replace(/s$/, '');
          const onStem = on.replace(/s$/, '');
          if (uNorm === dn || uNorm === on || uStem === dnStem || uStem === onStem || dn.includes(uStem) || uStem.includes(dnStem)) {
            const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
            setMessages(withUser);
            messagesRef.current = withUser;
            setInput('');
            setRecordedText('');

            if (hasPendingChangesRef.current) {
              pendingNavigationRoomRef.current = room;
              awaitingNavigationConfirmRef.current = true;
              awaitingSatisfactionRef.current = false;
              const confirmMsg = `One thing before we leave — are we keeping these changes?`;
              const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
              setMessages(withMaya);
              messagesRef.current = withMaya;
              speakText(confirmMsg, confirmMsg);
            } else {
              window.sendToUnreal({ msgType: 'gotoRoom', targetRoom: room.original });
              const reply = `Off to the ${room.display}!`;
              const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
              setMessages(withMaya);
              messagesRef.current = withMaya;
              speakText(reply, reply);
            }
            isProcessingRef.current = false;
            return;
          }
        }
      }
    }

    const userMessage = { role: 'user', content: messageText };
    const newMessages = [...messagesRef.current, userMessage];

    setMessages(newMessages);
    messagesRef.current = newMessages;
    setInput('');
    setRecordedText('');
    setLoading(true);

    try {
      if (!OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY is missing - check your .env file');
        throw new Error('REACT_APP_OPENAI_API_KEY is missing');
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...newMessages],
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(`OpenAI Error ${response.status}`);
      if (!data.choices?.[0]?.message?.content) throw new Error('No response from OpenAI');

      const raw = data.choices[0].message.content;
      let displayText = raw;
      let jsonData = null;

      try {
        jsonData = JSON.parse(raw);

        // ✅ ONLY SHOW THE REPLY - Filter out any unrelated text/comments
        displayText = jsonData.reply && jsonData.reply.trim() ? jsonData.reply : '';

        // If no valid reply, don't show anything in chat
        if (!displayText) {
          setLoading(false);
          isProcessingRef.current = false;
          setListeningMode('listening');
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          listeningRef.current = false;
          setTimeout(() => startListening(), 1000);
          return;
        }

        window.lastMayaJSON = jsonData;

        const filterInstance = new MayaQueryFilter();
        const intentValid = filterInstance.validateIntent(jsonData);
        if (!intentValid) {
          setLoading(false);
          isProcessingRef.current = false;
          setListeningMode('listening');
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          listeningRef.current = false;
          setTimeout(() => startListening(), 1000);
          return;
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║           📦 MAYA JSON OUTPUT - OPENAI RESPONSE           ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('\n📋 COMPLETE JSON OBJECT:');
        console.log(JSON.stringify(jsonData, null, 2));
        console.log('\n💬 REPLY:');
        console.log(`'${jsonData.reply}'`);
        console.log('\n🎯 INTENT:');
        console.log(jsonData.intent);
        console.log('\n📊 PARAMETERS:');
        const p = jsonData.params;
        console.log('category:', p.category);
        console.log('style:', p.style);
        console.log('color:', p.color);
        console.log('room:', p.room);
        console.log('mood:', p.mood);
        console.log('budget:', p.budget);
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║ 💾 Accessible via: window.lastMayaJSON                   ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        currentDesignPromptRef.current = { jsonData, userQuery: messageText };
        // Store payload — don't fire RecEngine yet
        pendingRecEnginePayloadRef.current = {
          jsonData,
          userQuery: messageText,
        };

        const searchIntentsThatMayNeedPreference = [
          'change_theme',
          'selected_swap',
          'partial_swap',
          'style_consultation',
        ];

        const canAskAnotherFollowupBeforeUnreal =
          followupCountRef.current < maxFollowupsPerDesignPromptRef.current;

        const shouldAskStyleColorPreference =
          FOLLOWUP_QUESTIONS_ENABLED &&
          searchIntentsThatMayNeedPreference.includes(jsonData.intent) &&
          jsonData.needs_clarification === true &&
          canAskAnotherFollowupBeforeUnreal;

        // ─── UNREAL COMMUNICATION (per spec sheet) ───────────────────────
        // If Maya needs style/color preference, hold Unreal/RecEngine until the user answers.
        if (typeof window.sendToUnreal === 'function' && !shouldAskStyleColorPreference) {

          // 1. NAVIGATE → validate room, then gotoRoom + getRoomCsv
          if (jsonData.intent === 'navigate' && jsonData.params?.room) {
            const unrealRoomName = jsonData.params.room
              .split('_')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join('');

            const availableRooms = availableRoomsRef.current;
            const normStr = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const uNorm = normStr(unrealRoomName);
            const foundRoom = availableRooms.length > 0
              ? availableRooms.find(r =>
                  normStr(r.original).includes(uNorm) ||
                  uNorm.includes(normStr(r.original)) ||
                  normStr(r.display).includes(uNorm) ||
                  uNorm.includes(normStr(r.display))
                )
              : null;

            const targetRoom = foundRoom ? foundRoom.original : unrealRoomName;
            const roomToUse = foundRoom || { original: targetRoom, display: jsonData.params.room.replace(/_/g, ' ') };
            const lowerMsg = messageText.toLowerCase();
            const userSaidKeep = ['keep', 'save', 'accept', 'lock', 'confirm'].some(w => lowerMsg.includes(w));

            if (availableRooms.length > 0 && !foundRoom) {
              const roomList = availableRooms.map(r => r.display);
              const suggestion = roomList.length <= 3
                ? `Did you mean the ${roomList.join(' or the ')}?`
                : `We've got — ${roomList.join(', ')}. Which one did you mean?`;
              displayText = `No ${jsonData.params.room.replace(/_/g, ' ')} on my list — ${suggestion}`;
            } else if (hasPendingChangesRef.current && !userSaidKeep) {
              pendingNavigationRoomRef.current = roomToUse;
              awaitingNavigationConfirmRef.current = true;
              awaitingSatisfactionRef.current = false;
              displayText = `One thing before we leave — are we keeping these changes?`;
            } else {
              if (userSaidKeep) {
                window.sendToUnreal({ msgType: 'acceptAllChanges' });
                hasPendingChangesRef.current = false;
                awaitingSatisfactionRef.current = false;
              }
              window.sendToUnreal({ msgType: 'gotoRoom', targetRoom });
              window.sendToUnreal({ msgType: 'getRoomCsv' });
            }
          }

          // 2. CHANGE INTENTS → disablePreview (clear any active preview) + getRoomCsv
          if (
            jsonData.intent === 'change_theme' ||
            jsonData.intent === 'selected_swap' ||
            jsonData.intent === 'partial_swap' ||
            jsonData.intent === 'style_consultation'
          ) {
            hasPendingChangesRef.current = true;
            //window.sendToUnreal({ msgType: 'disablePreview' });
            window.pendingChange = { intent: jsonData.intent, params: jsonData.params, timestamp: Date.now() };
            console.log('💾 Stored pending change:', window.pendingChange.intent);
            window.sendToUnreal({ msgType: 'getRoomCsv' });
          }

          // 4. CONFIRM ORDER → acceptAllChanges + getRoomCsv (next change uses accepted state as base)
          if (jsonData.intent === 'confirm_order') {
            hasPendingChangesRef.current = false;
            awaitingSatisfactionRef.current = false;
            resetFollowupCounterForNextPrompt();
            window.sendToUnreal({ msgType: 'acceptAllChanges' });
            window.sendToUnreal({ msgType: 'getRoomCsv' });
          }

          // 5. GO BACK TO ORIGINAL → disablePreview
          if (jsonData.intent === 'go_back_original') {
            hasPendingChangesRef.current = false;
            awaitingSatisfactionRef.current = false;
            resetFollowupCounterForNextPrompt();
            window.sendToUnreal({ msgType: 'disablePreview' });
          }
        }

      } catch (parseErr) {
        displayText = raw;
      }

      const allMessages = [...messagesRef.current, { role: 'assistant', content: '' }];
      setMessages(allMessages);
      messagesRef.current = allMessages;

      // ── SINGLE CLARIFICATION GATE ───────────────────────────────────────
      // Product/design requests may ask exactly one style/color preference question.
      // Once the user answers, the followup handler above sends directly to RecEngine/Unreal.
      if (pendingRecEnginePayloadRef.current) {
        const { jsonData: pendingJson, userQuery: pendingQuery } = pendingRecEnginePayloadRef.current;
        const pendingIntent = pendingJson?.intent;

        const noSearchNeeded = ['navigate', 'confirm_order', 'budget_analysis', 'go_back_original', 'change_budget'];
        const searchIntentsThatMayNeedPreference = [
          'change_theme',
          'selected_swap',
          'partial_swap',
          'style_consultation',
        ];

        const clarificationRequested =
          searchIntentsThatMayNeedPreference.includes(pendingIntent) &&
          pendingJson?.needs_clarification === true;

        const canAskAnotherFollowup =
          followupCountRef.current < maxFollowupsPerDesignPromptRef.current;

        const shouldAskStyleColorPreference =
          FOLLOWUP_QUESTIONS_ENABLED && clarificationRequested && canAskAnotherFollowup;

        const clarificationLimitReached =
          clarificationRequested && !canAskAnotherFollowup;

        if (noSearchNeeded.includes(pendingIntent)) {
          awaitingFollowupRef.current = false;
          pendingRecEnginePayloadRef.current = null;
          sendMsgToRecEngine(pendingJson, pendingQuery);
          console.log('▶️ [RECENGINE FIRED] Non-search intent, fired immediately.');
        } else if (shouldAskStyleColorPreference) {
          followupCountRef.current += 1;
          awaitingFollowupRef.current = true;

          // Use Maya/LLM's own generated clarification question.
          // The frontend only controls how many times this can happen.
          displayText = pendingJson.reply || displayText;

          console.log(
            '⏸️ [RECENGINE HELD] Dynamic followup ' +
              followupCountRef.current +
              '/' +
              maxFollowupsPerDesignPromptRef.current +
              '. Stored query: "' +
              pendingQuery +
              '"'
          );
        } else if (clarificationLimitReached) {
          awaitingFollowupRef.current = false;
          pendingRecEnginePayloadRef.current = null;

          const forcedJson = {
            ...pendingJson,
            needs_clarification: false,
          };

          sendMsgToRecEngine(forcedJson, pendingQuery);
          console.log(
            '▶️ [RECENGINE FIRED] Clarification limit reached (' +
              followupCountRef.current +
              '/' +
              maxFollowupsPerDesignPromptRef.current +
              '), forcing send.'
          );
        } else {
          awaitingFollowupRef.current = false;
          pendingRecEnginePayloadRef.current = null;
          if (clarificationRequested) {
            // Followups disabled — LLM wanted to ask but we skip it.
            // Remove the placeholder bubble pushed above so it doesn't orphan.
            displayText = '';
            const trimmed = messagesRef.current.slice(0, -1);
            setMessages(trimmed);
            messagesRef.current = trimmed;
          }
          sendMsgToRecEngine(pendingJson, pendingQuery);
          console.log('▶️ [RECENGINE FIRED] Intent has enough detail, fired immediately.');
        }
      }

      speakText(displayText, displayText);

    } catch (err) {
      console.error('❌ Error:', err.message);
      const errorMessages = [...messagesRef.current, { role: 'assistant', content: 'Oops! Something went wrong. Please try again.' }];
      setMessages(errorMessages);
      messagesRef.current = errorMessages;
      setListeningMode('listening');
      speechStartedRef.current = false;
      pauseTimeoutRef.current = null;
      listeningRef.current = false;
      setTimeout(() => startListening(), 1000);
    } finally {
      setLoading(false);
      audioChunksRef.current = [];
      isProcessingRef.current = false;
    }
  };

  const handlePanelKeyDown = (e) => e.stopPropagation();

  // Phase 1 & 2: full-screen centered Maya (white screen with dots before sceneLoaded, fades out after)
  if (introPhase) {
    return (
      <>
        <div className="maya-intro-overlay" style={{ opacity: introFading ? 0 : 1 }}>
          <div className="maya-intro-blob" />
          <div className="maya-intro-blob-2" />
          <div className="maya-intro-blob-3" />
          <div className="maya-intro-circle">
            <MayaStateIcon state="idle" isSpeaking={false} size={64} />
          </div>
          <div className="maya-intro-text-wrapper">
            <span className="maya-intro-text">
              Hi, I&apos;m Maya. I&apos;m listening.
            </span>
          </div>
        </div>
      </>
    );
  }

  if (!visible) return null;

  const VISIBLE_MSG_COUNT = 6;
  const visibleMessages = messages.slice(-VISIBLE_MSG_COUNT);
  const totalMessages = messages.length;

  return (
    <>
      <style>{`
        @keyframes mayaPulseListening {
          0%   { box-shadow: 0 0 0 0px rgba(123,97,255,0.45), 0 8px 32px rgba(123,97,255,0.3); }
          70%  { box-shadow: 0 0 0 18px rgba(123,97,255,0.0), 0 8px 32px rgba(123,97,255,0.3); }
          100% { box-shadow: 0 0 0 0px rgba(123,97,255,0.45), 0 8px 32px rgba(123,97,255,0.3); }
        }
        @keyframes mayaPulseTalking {
          0%   { box-shadow: 0 0 0 0px rgba(123,97,255,0.6), 0 8px 32px rgba(123,97,255,0.4); transform: scale(1); }
          50%  { box-shadow: 0 0 0 22px rgba(123,97,255,0.0), 0 8px 32px rgba(123,97,255,0.4); transform: scale(1.04); }
          100% { box-shadow: 0 0 0 0px rgba(123,97,255,0.6), 0 8px 32px rgba(123,97,255,0.4); transform: scale(1); }
        }
        @keyframes mayaBreathThinking {
          0%, 100% { opacity: 0.82; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.02); }
        }
        @keyframes mayaTypingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes blurDotShimmer {
          0%   { background-position: 0 0; }
          100% { background-position: 64px 0; }
        }
        @keyframes transformTextShimmerLTR {
          0%   { background-position: 100% center; }
          100% { background-position: 0% center; }
        }
      `}</style>
      <div
        id="maya-blur-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 2px, transparent 1px)',
          backgroundSize: '64px 64px',
          animation: 'blurDotShimmer 4s linear infinite',
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.4s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{
          fontSize: 24,
          fontWeight: 400,
          letterSpacing: '0.04em',
          background: 'linear-gradient(90deg, #ffffff 10%, rgba(181,255,250,1) 45%, rgba(123,97,255,0.9) 55%, #ffffff 90%)',
          backgroundSize: '300% auto',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'transformTextShimmerLTR 3s linear infinite',
        }}>
          Transforming your scene...
        </span>
      </div>
      <div
        style={styles.overlayRoot}
        ref={panelRef}
        onKeyDown={handlePanelKeyDown}
      >
        <div style={styles.bubbleColumn}>
          {(visibleMessages.length > 0 || liveText || loading || isTypingMode) && (
            <div style={styles.bubbleList}>
              {visibleMessages.map((msg, i) => {
                const relativeAge = visibleMessages.length - 1 - i;
                const opacity = Math.max(0.35, 0.85 - relativeAge * (0.5 / Math.max(VISIBLE_MSG_COUNT - 1, 1)));
                const isUser = msg.role === 'user';
                return (
                  <div key={`msg-${totalMessages - visibleMessages.length + i}`} style={{ ...styles.bubbleRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 0 }}>
                      <div style={{
                        ...(isUser ? styles.userBubble : styles.aiBubble),
                        opacity,
                        transition: 'opacity 0.5s ease',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}

              {liveText && (
                <div style={{ ...styles.bubbleRow, justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                    <div style={{ ...styles.userBubble, fontStyle: 'italic', opacity: 0.6, letterSpacing: '0.01em' }}>
                      {liveText}
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ ...styles.bubbleRow, justifyContent: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
                    <div style={{ ...styles.aiBubble, width: 'fit-content', padding: '6px 10px', minHeight: 'unset', alignSelf: 'flex-start' }}>
                      <img src={iconMap.thinking} alt="thinking" width="32" height="32" style={{ objectFit: 'contain', display: 'block' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} style={{ height: 0 }} />

              {/* ── Typing mode: contentEditable div grows like a bubble ── */}
              {isTypingMode && (
                <div style={{ ...styles.bubbleRow, justifyContent: 'flex-end', pointerEvents: 'all' }}>
                  <div
                    ref={typingInputRef}
                    contentEditable="true"
                    suppressContentEditableWarning={true}
                    onInput={(e) => {
                      setInput(e.currentTarget.innerText);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const text = e.currentTarget.innerText.trim();
                        if (text) {
                          e.currentTarget.blur();
                          isTypingModeRef.current = false;
                          setIsTypingMode(false);
                          setInput('');
                          e.currentTarget.innerText = '';
                          sendMessage(text);
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.currentTarget.blur();
                        isTypingModeRef.current = false;
                        setIsTypingMode(false);
                        setInput('');
                      }
                    }}
                    style={styles.typingBubbleInput}
                    spellCheck={false}
                    tabIndex={0}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          if (listeningRef.current) {
            stopListeningImmediately();
          } else {
            startListening();
          }
        }}
        style={{
          ...styles.toggleBtn,
          ...(isSpeaking || listeningMode === 'talking' ? styles.toggleBtnTalking :
              (loading || listeningMode === 'thinking') ? styles.toggleBtnThinking :
              listeningMode === 'listening' ? styles.toggleBtnListening : {}),
          animation:
            listeningMode === 'listening'
              ? 'mayaPulseListening 1.8s ease-in-out infinite'
              : (isSpeaking || listeningMode === 'talking')
              ? 'mayaPulseTalking 1.1s ease-in-out infinite'
              : listeningMode === 'thinking'
              ? 'mayaBreathThinking 1.5s ease-in-out infinite'
              : 'none',
        }}
      >
        <MayaStateIcon state={loading ? 'thinking' : listeningMode} isSpeaking={isSpeaking} />
      </button>
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  overlayRoot: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 9998,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: 130,
    paddingRight: 24,
    paddingLeft: 24,
  },

  bubbleColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 550,
    maxHeight: 'calc(100vh - 200px)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
    pointerEvents: 'none',
  },

  bubbleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  bubbleRow: {
    display: 'flex',
    width: '100%',
  },

  userBubble: {
    maxWidth: 550,
    padding: '8px 12px',
    borderRadius: '16px 16px 4px 16px',
    background: 'rgba(30, 30, 30, 0.55)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    color: '#ffffff',
    fontSize: 13.5,
    lineHeight: 1.55,
    wordWrap: 'break-word',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    border: '1.5px solid rgba(255, 255, 255, 0.18)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
  },

  aiBubble: {
    maxWidth: 550,
    padding: '8px 12px',
    borderRadius: '16px 16px 16px 4px',
    background: 'rgba(220, 220, 220, 0.75)',
    minHeight: '36px',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#1a1a1a',
    fontSize: 13.5,
    lineHeight: 1.55,
    wordWrap: 'break-word',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    border: '2px solid rgba(220, 211, 211, 0.75)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  },

  hiddenInput: {
    position: 'fixed',
    width: 1,
    height: 1,
    padding: 0,
    border: 'none',
    outline: 'none',
    opacity: 0,
    pointerEvents: 'none',
    fontSize: 13.5,
    fontFamily: 'inherit',
    zIndex: -1,
  },

  typingBubbleInput: {
    maxWidth: 550,
    minWidth: 60,
    minHeight: '38px',
    padding: '8px 14px',
    borderRadius: '18px 18px 4px 18px',
    background: 'rgba(30, 30, 30, 0.55)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    color: '#ffffff',
    fontSize: 13.5,
    lineHeight: 1.55,
    border: '1.5px solid rgba(255, 255, 255, 0.18)',
    outline: 'none',
    fontFamily: 'inherit',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    cursor: 'text',
    display: 'inline-block',
    boxSizing: 'border-box',
    userSelect: 'text',
    WebkitUserSelect: 'text',
    boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
    pointerEvents: 'auto',
  },

  toggleBtn: {
    position: 'fixed',
    bottom: 30,
    right: 30,
    width: 88,
    height: 88,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #f0eeff 0%, #e4ddff 100%)',
    border: '2px solid rgba(123,97,255,0.3)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#7B61FF',
    boxShadow: '0 8px 32px rgba(123,97,255,0.3), 0 2px 8px rgba(0,0,0,0.12)',
    zIndex: 10000,
    transition: 'all 0.4s ease',
    pointerEvents: 'all',
  },

  toggleBtnListening: {
    background: 'linear-gradient(135deg, #eef0ff 0%, #dde2ff 100%)',
    boxShadow: '0 0 0 6px rgba(123,97,255,0.12), 0 8px 32px rgba(123,97,255,0.3)',
  },

  toggleBtnTalking: {
    background: 'linear-gradient(135deg, #f0eeff 0%, #e4ddff 100%)',
    border: '2px solid rgba(123,97,255,0.3)',
    boxShadow: '0 8px 32px rgba(123,97,255,0.3), 0 2px 8px rgba(0,0,0,0.12)',
  },

  toggleBtnThinking: {
    background: 'linear-gradient(135deg, #f5f0ff 0%, #e8e0ff 100%)',
    boxShadow: '0 8px 32px rgba(123,97,255,0.2)',
  },
};