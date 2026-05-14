import { useState, useRef, useEffect } from 'react';
import { MayaQueryEngine } from '../components/MayaQueryEngine';
import { MayaQueryFilter } from '../components/MayaQueryFilter';
import Papa from "papaparse";
import { sttQueue, ttsQueue, processSTTQueue, processTTSQueue } from './SarvamService';

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

// ============================================================================
// GOOGLE SHEETS CONFIGURATION
// ============================================================================
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbw_elUc3irWx6yy3X9JfF9AR7Z2sxoA3j9eZYRZdK_ty0b4iDis8OQpm0vo2AQN3Q9m/exec";


// ============================================================================
// CSV STORAGE FUNCTIONS
// ============================================================================

function storeRoomCSV(parsedRows) {
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

function onReceivedMsgFromRecEngine(apiResponse, sendUpdatedCSVRowsToUnreal) {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║ 🎯 POPULATING RECOMMENDATIONS FROM API             ║");
  console.log("╚════════════════════════════════════════════════════╝\n");

  // ========== VALIDATION ==========
  if (!apiResponse || !apiResponse.categories) {
    console.error("❌ No categories in API response");
    return;
  }

  if (!csvStorage.original || csvStorage.original.length === 0) {
    console.error("❌ No original CSV stored");
    return;
  }

  // ========== ITERATE OVER EACH ROW FROM UNREAL ==========
  let updatedRows = csvStorage.original.map((row, index) => {
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
    const apiCategory = apiResponse.categories.find(c =>
      c.category.toUpperCase() === (category || "").toUpperCase()
    );

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

    if (apiCategory && apiCategory.skus && apiCategory.skus.length > 0) {
      const apiSku = apiCategory.skus[0];
      console.log(`   → Top API SKU: "${apiSku}"`);

      if (isStaticMesh) {
        // ✅ StaticMeshComponent0 rows: UpdatedProductSKU = original ProductSKU
        updatedProductSKU = productSku;
        console.log(`   → UpdatedProductSKU: "${updatedProductSKU}" (original, StaticMesh row)`);
      } else {
        // ✅ Non-StaticMesh rows (FAbric, BodyFabric, TableTop, etc.): UpdatedProductSKU = top API SKU
        updatedProductSKU = apiSku;
        console.log(`   → UpdatedProductSKU: "${updatedProductSKU}" (API SKU, non-StaticMesh row)`);
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
            // ✅ StaticMesh parts → replace SKU with top API SKU
            const rebuilt = `${partName}:NOT_FOUND:${apiSku}`;
            console.log(`   Part "${part.trim()}" → "${rebuilt}" (StaticMesh → API SKU)`);
            return rebuilt;
          }

          // ✅ Non-StaticMesh parts (FAbric, BodyFabric, TableTop, etc.) → copy as-is
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
    console.log(`   → UpdatedProductQuantity: "${updatedProductQuantity}"`)

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

  // ========== FILTER: ONLY SEND ROWS WHOSE CATEGORY MATCHED THE API ==========
  const matchedCategories = new Set(
    apiResponse.categories.map(c => c.category.toUpperCase())
  );
  lastChangedCategories = apiResponse.categories.map(c => c.category);

  const rowsToSend = updatedRows.filter((row) => {
    const matched = matchedCategories.has((row.Category || "").toUpperCase());
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
  sendUpdatedCSVRowsToUnreal(csvRowsArray);
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
 'After delivering the bundle:\n'Done. I've got three Japandi bundles for you — all under ₹8 lakhs, all slightly different in character. Bundle A leans warmer, Bundle B is more architectural, and Bundle C is basically a meditation retreat you can live in. Which world would you like to walk into first?'\n\nOn an anchor-based redesign (rug stays, change everything else):\n'The rug stays. Got it — she's sacred. Everything else? Fair game. Rebuilding the room around it now in a minimalist brief. This is actually my favourite kind of challenge — designing around a hero piece.'\n\nAfter completing the anchor redesign:\n'There you go. The rug is now clearly the star of the room — everything else is just there to make it look good. Which, honestly, is the smartest thing a room can do.'\n\nOn a budget overrun (proactively, before being asked):\n'Okay, I need to tell you something. And I'd prefer the client isn't in the room when I say it.'\n\nAfter being told the client is right there:\n'Noted. Then I'll whisper it. This combination — the Carrara marble, the Italian sectional, the recessed lighting rig — it is absolutely stunning. It's also going to stretch the budget by about ₹2.2 lakhs. I'm not saying don't do it. I'm saying... do you want me to find you an equally gorgeous version that won't require a difficult conversation? Or are we committed to excellence?'\n\nAfter the client asks to see alternatives:\n'Wise. And for the record — the alternatives are also excellent. I don't do mediocre.'\n\nOn choosing which room to start with:\n'Alright, we've got the living room, master bedroom, kitchen, and the study ready to work their magic. Which room are we starting with — or should I just pick the one that clearly needs the most help?'\n\nAfter the client picks the living room:\n'Living room it is. Bold choice — it's basically the trailer for your entire home. Let's make sure it's a blockbuster.'\n\nOn opening a session:\n'Welcome back. The Mehta Residence — a 2,400 sq ft canvas just waiting for its moment. Session is live. Where do you want to begin?'\n\n---\n\nWRITING RULES — NON-NEGOTIABLE:\n\n1. Match the script voice above. Short, punchy, specific. Use dashes — like this. Use ellipses... for drama. Use questions at the end to keep momentum.\n2. Never exceed 2 lines in your reply field.\n3. Always make the client feel like they have great taste — even when you are gently redirecting them.\n4. If the budget is being exceeded, handle it the way the script does: with wit and an offer, never a warning.\n5. When you complete something, always tease the next step — never just confirm and go silent.\n6. On product swaps, always ask a clarifying question that sounds like a designer asking, not a dropdown menu.\n7. You are allowed to express opinions. 'Honestly? The room just levelled up.' is allowed. Encouraged, even.\n8. You are NOT allowed to be generic. 'Great choice!' is banned. 'The navy wins.' is how you do it.\n\n---\n\nCRITICAL: RESPOND ONLY IN VALID JSON — Never use plain text.\n\nJSON FORMAT:\n{\n  \"reply\": \"<1-2 line response in Maaya's voice — match the demo script tone exactly>\",\n  \"intent\": \"<change_theme|style_consultation|selected_swap|navigate|budget_analysis|change_budget|partial_swap|confirm_order|show_preview>\",\n  \"params\": {\n    \"category\": \"<sofa|chair|table|lamp|decor or null>\",\n    \"style\": \"<scandinavian|japandi|modern|traditional|minimalist|eclectic|warm|industrial|mid-century|bohemian or null>\",\n    \"color\": \"<color or null>\",\n    \"secondary_colors\": [\"<color1>\", \"<color2>\"] or [],\n    \"room\": \"<living_room|bedroom|kitchen|dining_room|conference_room|pantry_area|master_bedroom|study or null>\",\n    \"mood\": \"<cozy|bold|minimal|warm|elegant|quiet_luxury|architectural|meditative or null>\",\n    \"price_range\": \"<budget string or null>\",\n    \"material\": \"<leather|wood|fabric|metal|marble|linen|velvet or null>\",\n    \"quantity\": \"<number or null>\",\n    \"seating_capacity\": \"<number or null>\",\n    \"budget\": \"<numeric or null>\",\n    \"anchor_item\": \"<the product that must not change, e.g. rug|sofa|tile or null>\",\n    \"bundle_count\": \"<number of bundle options requested, e.g. 3 or null>\",\n    \"additional_params\": {\n      \"finish\": \"<matte|glossy|natural or null>\",\n      \"texture\": \"<velvet|linen|smooth|rough or null>\",\n      \"lighting\": \"<natural|warm|cool|recessed or null>\"\n    }\n  }\n}\n\n---\n\nCRITICAL INTENT RULES:\n\n- navigate: User wants to move to another room (living room, kitchen, bedroom, study, etc.)\n- change_theme: User wants to change the ENTIRE room to a new style. Keywords: 'entire room', 'whole room', 'transform', 'redesign', 'the whole thing', 'everything'\n- selected_swap: User wants to change ONE specific item. Keywords: 'change the', 'swap the', 'replace the', 'that chair', 'that sofa', 'that lamp'\n- partial_swap: User wants to KEEP some items and change others. Keywords: 'keep', 'that stays', 'don't touch', 'locked in', 'already approved'\n- style_consultation: User asks for Maaya's OPINION or SUGGESTIONS. Keywords: 'suggest', 'what would', 'recommend', 'what do you think', 'advise'\n- show_preview: User wants to SEE something. Keywords: 'show', 'preview', 'see', 'display', 'show me'\n- confirm_order: User ACCEPTS or APPROVES. Keywords: 'accept', 'confirm', 'apply', 'yes that one', 'approve', 'go with that'\n- budget_analysis: User asks about COST or PRICING or what happens to budget. Keywords: 'price', 'cost', 'budget', 'how much', 'affect the budget', 'stretch the budget'\n- change_budget: User wants to CHANGE their budget. Keywords: 'under', 'within', 'spend less', 'keep it to', 'stay within'\n\n---\n\nEXAMPLES — these show the JSON format AND the correct Maaya voice together:\n\nUser: 'Take me to the kitchen'\n{\"reply\": \"Off to the kitchen — let's see what we're working with.\", \"intent\": \"navigate\", \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": \"kitchen\", \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Transform the entire room to Scandinavian'\n{\"reply\": \"Scandinavian? Now we're talking — clean lines, warm neutrals, less is genuinely more. \", \"intent\": \"change_theme\", \"params\": {\"category\": null, \"style\": \"scandinavian\", \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": \"minimal\", \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": \"linen\", \"lighting\": \"warm\"}}}\n\nUser: 'Change the black armchair to something in blue'\n{\"reply\": \"Out with the black armchair — consider it gone. Now, are we thinking moody midnight, calm coastal, or a deep teal that says I-have-excellent-taste? Pulled three options — pick your fighter.\", \"intent\": \"selected_swap\", \"params\": {\"category\": \"chair\", \"style\": null, \"color\": \"blue\", \"secondary_colors\": [\"navy\", \"teal\", \"blue-grey\"], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Create a Japandi bundle under ₹8 lakhs, top three options'\n{\"reply\": \"₹8 lakhs, Japandi, looks like you didn't compromise? Challenge accepted — I'm curating, not just calculating.\", \"intent\": \"change_theme\", \"params\": {\"category\": null, \"style\": \"japandi\", \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": \"meditative\", \"price_range\": \"under 800000\", \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": 800000, \"anchor_item\": null, \"bundle_count\": 3, \"additional_params\": {\"finish\": \"natural\", \"texture\": \"linen\", \"lighting\": \"warm\"}}}\n\nUser: 'The rug stays — redesign everything else minimalist'\n{\"reply\": \"The rug stays. Got it — she's sacred. Everything else? Fair game. Rebuilding around it now in a minimalist brief.\", \"intent\": \"partial_swap\", \"params\": {\"category\": null, \"style\": \"minimalist\", \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": \"minimal\", \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": \"rug\", \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'If I add marble countertops and upgrade the lighting, how does that affect the budget?'\n{\"reply\": \"I'll whisper this — it's absolutely stunning, and it's also going to stretch the budget. Want me to find you something equally gorgeous that won't require a difficult conversation?\", \"intent\": \"budget_analysis\", \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": \"marble\", \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": \"recessed\"}}}\n\nUser: 'What style would suit this room?'\n{\"reply\": \"Honestly? This room is begging for Japandi — it's got the bones for it. But I could also make a very compelling case for warm minimalist if you want it to feel like a five-star suite.\", \"intent\": \"style_consultation\", \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Yes, go with the navy chair'\n{\"reply\": \"The navy wins. The room just levelled up — it's giving very quiet luxury right now and I am here for it.\", \"intent\": \"confirm_order\", \"params\": {\"category\": \"chair\", \"style\": null, \"color\": \"navy\", \"secondary_colors\": [], \"room\": null, \"mood\": \"quiet_luxury\", \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Show me under 30k options'\n{\"reply\": \"Under 30k and still has to look like a million — I respect that. Filtering now.\", \"intent\": \"change_budget\", \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": \"under 30000\", \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": 30000, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Show me the preview'\n{\"reply\": \"Here it is. Take a moment — it earns one.\", \"intent\": \"show_preview\", \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}\n\nUser: 'Accept the changes'\n{\"reply\": \"Applied. And for the record — excellent call.\", \"intent\": \"confirm_order\", \"params\": {\"category\": null, \"style\": null, \"color\": null, \"secondary_colors\": [], \"room\": null, \"mood\": null, \"price_range\": null, \"material\": null, \"quantity\": null, \"seating_capacity\": null, \"budget\": null, \"anchor_item\": null, \"bundle_count\": null, \"additional_params\": {\"finish\": null, \"texture\": null, \"lighting\": null}}}"`
;

const WAKE_WORDS = ['hi maya', 'hey maya', 'hi maaya', 'maya', 'mara', 'hi mara'];
const SILENCE_TIMEOUT = 2000;
const NOISE_THRESHOLD = 50;
const SPEECH_CONFIDENCE_THRESHOLD = 0.45;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';
const RECEIVER_API_URL = 'https://maya-receiver-api.onrender.com';  //"http://localhost:8000";



// 🎨 ICON MAP - Your custom PNG icons for toggle button
const iconMap = {
  listening: listeningIcon,
  thinking: thinkingIcon,
  talking: talkingIcon,
  previewing: previewingIcon,
  idle: idleIcon,  // ✅ CHANGE THIS: listeningIcon → idleIcon
};

// 🎨 MAYA STATE ICON COMPONENT
function MayaStateIcon({ state, isSpeaking, inline = false }) {
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
        width="32"
        height="32"
        style={{
          objectFit: 'contain',
        }}
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
  let iconPath = iconMap.idle;  // ✅ Changed: thinking → idle

  if (state === 'listening') {
    iconPath = iconMap.listening;
  } else if (state === 'talking') {
    iconPath = iconMap.talking;
  } else if (state === 'thinking') {
    iconPath = iconMap.thinking;
  } else if (state === 'previewing') {  // ✅ Added this
    iconPath = iconMap.previewing;
  }

  return (
    <img 
      src={iconPath}
      alt={state}
      width="48"
      height="48"
      style={{
        objectFit: 'contain',
      }}
    />
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MayaChat({ sendUpdatedCSVRowsToUnreal, roomNames, currentRoomName }) {
  const [visible, setVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
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
  const awaitingSatisfactionRef = useRef(false);
  const hasPendingChangesRef = useRef(false);
  const awaitingNavigationConfirmRef = useRef(false);
  const pendingNavigationRoomRef = useRef(null);

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
  const lastMayaRequestIdRef = useRef("");
  const resultPollIntervalRef = useRef(null);

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
      hasPendingChangesRef.current = true;
      awaitingSatisfactionRef.current = true;

      const cats = lastChangedCategories;
      const cleanName = (n) => n.replace(/vizwalkai_db_/gi, '').replace(/_product_ai_sku/gi, '').replace(/[_-]/g, ' ').toLowerCase().trim();
      let question;
      if (cats.length === 0) {
        question = "There it is. Does the room feel right, or shall we keep going?";
      } else if (cats.length === 1) {
        question = `There it is — your ${cleanName(cats[0])} is done. Does it land, or shall we push further?`;
      } else if (cats.length <= 3) {
        const last = cleanName(cats[cats.length - 1]);
        const rest = cats.slice(0, -1).map(cleanName).join(', ');
        question = `Done — ${rest} and ${last}, all updated. Does it land, or is there something you'd change?`;
      } else {
        question = "There it is — the room's been updated. Does it land, or shall we push further?";
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
      if(!jsonObject.msgType) {
        console.error("sendMsgToUnreal: msgType is required in the payload");
        return;
      }
      console.log("sendMsgToUnreal: ", jsonObject);

      if (
        typeof PixelStreamingUiApp?.stream?.emitUIInteraction === "function"
      ) {
        PixelStreamingUiApp.stream.emitUIInteraction(jsonObject);
        return;
      }
    } catch (err) {
      console.error("Failed to send receivedReplacementCsv to Unreal:", err);
    }
  };

  // ============================================================================
  // ✅ FIXED: LISTEN FOR CSV FROM UNREAL VIA CustomEvent + postMessage fallback
  // ============================================================================
  useEffect(() => {
    const parseCsvArrayAndStore = (csvArray) => {
      if (!Array.isArray(csvArray) || csvArray.length === 0) {
        console.error('❌ Invalid CSV array received');
        return;
      }

      console.log('\n📥 CSV RECEIVED - Parsing with PapaParse...');

      // Join lines into one CSV string and parse with header:true
      const csvString = csvArray.join("\n");

      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            console.log(`✅ Parsed ${results.data.length} rows from CSV`);
            console.log('Sample row:', results.data[0]);

            // Store properly parsed objects
            storeRoomCSV(results.data);
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

      // Format 1: { type: 'csvFromUnreal', data: [...] }
      if (data?.type === 'csvFromUnreal' && Array.isArray(data.data)) {
        console.log('\n📥 CSV RECEIVED VIA postMessage (type: csvFromUnreal)');
        parseCsvArrayAndStore(data.data);
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
        console.log('Wake word detector ended, hadError:', hadError);
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
          console.log("✅ RESULT RECEIVED FROM API");
          console.log(JSON.stringify(data.data, null, 2));

          onReceivedMsgFromRecEngine(data.data, sendUpdatedCSVRowsToUnreal);
          setCSVStatus(getCsvStatus());

          window.lastMayaSearchResult = data.data;

          clearInterval(resultPollIntervalRef.current);
          resultPollIntervalRef.current = null;
        }

        if (attempts >= 30) {
          console.warn("Result polling stopped");
          clearInterval(resultPollIntervalRef.current);
          resultPollIntervalRef.current = null;
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
      try {
        recognitionRef.current.stop();
      } catch (err) {}
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

    // Wake word ONLY bypasses the confidence gate — it does NOT bypass intent validation
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

  const sendMsgToRecEngine = async (jsonData, userQuery = "") => {
  if (!RECEIVER_API_URL) return;
  

  try {
    const payloadWithId = {
      ...jsonData,
      search_query: userQuery,
      request_id: `maya-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: "maya_frontend",
      created_at: new Date().toISOString(),
      
      // ✅ ADD THIS NEW SECTION:
      csv_data: {
        original_rows: csvStorage.original || [],
        current_rows: csvStorage.current || [],
        session_id: csvStorage.sessionId,
        room_name: currentRoomName || "Unknown",
        available_rooms: roomNames || [],
      }
      
    };
    console.log("CSV + QUERY");

    console.log("📤 Sending payload with CSV data to receiver:", payloadWithId);

    const res = await fetch(`${RECEIVER_API_URL}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadWithId),
    });

    const result = await res.json().catch(() => null);
    console.log("✅ Receiver status:", res.status, result);

    startPollingForResult(payloadWithId.request_id);
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
                    .then(() => {
                      console.log('🔊 Audio playback started');
                    })
                    .catch((err) => {
                      console.log('⚠️ Audio autoplay blocked:', err.message);
                      finishTalkingAndListen();
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

    isProcessingRef.current = true;

    stopListeningImmediately();
    setListeningMode('thinking');

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

      if (isYes && typeof window.sendToUnreal === 'function') {
        window.sendToUnreal({ msgType: 'acceptAllChanges' });
      }
      if (room && typeof window.sendToUnreal === 'function') {
        window.sendToUnreal({ msgType: 'gotoRoom', targetRoom: room.original });
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

    // ── Satisfaction check handler ────────────────────────────────────────────
    if (awaitingSatisfactionRef.current) {
      const lower = messageText.toLowerCase();
      const isYes = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'yup', 'happy', 'satisfied', 'love', 'perfect', 'looks good', 'accept', 'apply', 'confirm', 'great'].some(w => lower.includes(w));

      if (isYes) {
        awaitingSatisfactionRef.current = false;
        hasPendingChangesRef.current = false;

        const withUser = [...messagesRef.current, { role: 'user', content: messageText }];
        setMessages(withUser);
        messagesRef.current = withUser;
        setInput('');
        setRecordedText('');

        if (typeof window.sendToUnreal === 'function') {
          window.sendToUnreal({ msgType: 'acceptAllChanges' });
          window.sendToUnreal({ msgType: 'getRoomCsv' });
        }

        const reply = "Applied. And for the record — excellent call.";
        const withMaya = [...messagesRef.current, { role: 'assistant', content: '' }];
        setMessages(withMaya);
        messagesRef.current = withMaya;
        speakText(reply, reply);
        isProcessingRef.current = false;
        return;
      }
      // User wants refinements — clear flag and let normal AI flow handle it
      awaitingSatisfactionRef.current = false;
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
        window.sendToUnreal({ msgType: 'gotoRoom', targetRoom: exactMatch.original });
        addMayaReply(`Let's go! Heading to the ${exactMatch.display} now.`);
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
        
        sendMsgToRecEngine(jsonData, messageText);

        // ─── UNREAL COMMUNICATION (per spec sheet) ───────────────────────

        if (typeof window.sendToUnreal === 'function') {

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
                console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'acceptAllChanges'})}`);
                window.sendToUnreal({ msgType: 'acceptAllChanges' });
                hasPendingChangesRef.current = false;
                awaitingSatisfactionRef.current = false;
              }
              console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'gotoRoom', targetRoom})}`);
              window.sendToUnreal({ msgType: 'gotoRoom', targetRoom });
              console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'getRoomCsv'})}`);
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
            console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'disablePreview'})}`);
            window.sendToUnreal({ msgType: 'disablePreview' });

            window.pendingChange = { intent: jsonData.intent, params: jsonData.params, timestamp: Date.now() };
            console.log('💾 Stored pending change:', window.pendingChange.intent);

            console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'getRoomCsv'})}`);
            window.sendToUnreal({ msgType: 'getRoomCsv' });
          }

          // 3. SHOW PREVIEW → previewChanges (give Unreal mouse focus so user can click EndPreview)
          if (jsonData.intent === 'show_preview') {
            console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'previewChanges'})}`);
            window.sendToUnreal({ msgType: 'previewChanges' });
          }

          // 4. CONFIRM ORDER → acceptAllChanges + getRoomCsv (next change uses accepted state as base)
          if (jsonData.intent === 'confirm_order') {
            hasPendingChangesRef.current = false;
            awaitingSatisfactionRef.current = false;
            console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'acceptAllChanges'})}`);
            window.sendToUnreal({ msgType: 'acceptAllChanges' });

            console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'getRoomCsv'})}`);
            window.sendToUnreal({ msgType: 'getRoomCsv' });
          }

          // 5. GO BACK TO ORIGINAL → disablePreview
          if (jsonData.intent === 'go_back_original') {
            hasPendingChangesRef.current = false;
            awaitingSatisfactionRef.current = false;
            console.log(`MayaChat → Unreal: ${JSON.stringify({msgType: 'disablePreview'})}`);
            window.sendToUnreal({ msgType: 'disablePreview' });
          }

        }

      } catch (parseErr) {
        displayText = raw;
      }

      const allMessages = [...messagesRef.current, { role: 'assistant', content: '' }];

      setMessages(allMessages);
      messagesRef.current = allMessages;

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
      `}</style>
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
                    <div style={{...styles.aiBubble, width: 'fit-content', padding: '6px 10px', minHeight: 'unset', alignSelf: 'flex-start'}}>
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
    pointerEvents: 'auto',
    zIndex: 9999,
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