import { useState, useRef, useEffect } from "react";
import { MayaQueryEngine } from './MayaQueryEngine';
import { MayaQueryFilter } from './MayaQueryFilter';

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

// ============================================================================
// GOOGLE SHEETS CONFIGURATION
// ============================================================================
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbw_elUc3irWx6yy3X9JfF9AR7Z2sxoA3j9eZYRZdK_ty0b4iDis8OQpm0vo2AQN3Q9m/exec";

// ============================================================================
// CSV STORAGE FUNCTIONS
// ============================================================================

function storeRoomCSV(csvRows) {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║ 📥 CSV RECEIVED FROM UNREAL            ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  if (!Array.isArray(csvRows) || csvRows.length === 0) {
    console.error('❌ Invalid CSV format');
    return false;
  }

  let startIndex = 0;
  const firstRow = csvRows[0].toLowerCase();
  
  const isHeaderRow = firstRow.includes('spacename') || 
                      firstRow.includes('productname') || 
                      firstRow.includes('category');
  
  if (isHeaderRow) {
    console.log('✅ First row identified as HEADER - skipping');
    startIndex = 1;
  }

  csvStorage.original = csvRows.slice(startIndex);
  csvStorage.current = csvRows.slice(startIndex);
  csvStorage.currentState = 'received';
  csvStorage.completionPercent = 0;

  window.csvStorage = csvStorage;
  window.lastRoomCsv = csvRows.slice(startIndex);

  console.log(`✅ CSV Stored Successfully: ${csvStorage.original.length} data rows\n`);

  console.log('📤 Auto-exporting to Google Sheet...');
  
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
// HELPER: Parse CSV correctly (handles quoted fields)
// ============================================================================

function parseCSVRowCorrectly(row) {
  const result = [];
  let current = '';
  let insideQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// ============================================================================
// FIXED: populateRecommendations() - NO DOUBLE ESCAPING
// ============================================================================

function populateRecommendations(apiResponse, sendUpdatedCSVRowsToUnreal, showCSVPreviewModal) {
  if (!csvStorage.original || csvStorage.original.length === 0) {
    console.error('❌ No CSV stored yet');
    return false;
  }
 
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║ 📤 POPULATING RECOMMENDATIONS        ║');
  console.log('╚════════════════════════════════════════╝\n');
 
  csvStorage.recommendations = apiResponse;
  
  // ========== KEY FIX: Use original CSV directly, NO RE-ESCAPING ==========
  const completeCsv = csvStorage.original.map((row, idx) => {
    try {
      const cols = parseCSVRowCorrectly(row);
      
      const spaceName = cols[0] || "";
      const category = cols[1] || "";
      const productName = cols[2] || "";
      const productSKU = cols[3] || "";
      const productPrice = cols[4] || "";
      const productQuantity = cols[5] || "";
      const finishes = cols[6] || "";  // ← KEEP AS-IS!
      
      let updatedProductName = productName;
      let updatedProductSKU = productSKU;
      let updatedProductPrice = productPrice;
      let updatedProductQuantity = productQuantity;
      let updatedFinishes = finishes;
      
      if (apiResponse && apiResponse.categories && Array.isArray(apiResponse.categories)) {
        const categoryMatch = apiResponse.categories.find(c => {
          if (!c || !c.category) return false;
          return c.category.toUpperCase() === (category || "").toUpperCase();
        });
        
        if (categoryMatch && categoryMatch.skus && categoryMatch.skus.length > 0) {
          updatedProductName = categoryMatch.category;
          updatedProductSKU = categoryMatch.skus[0];
        }
      }
      
      // ========== BUILD NEW ROW - NO RE-ESCAPING ==========
      const newRow = [
        spaceName,
        category,
        productName,
        productSKU,
        productPrice,
        productQuantity,
        finishes,  // ← ALREADY PROPERLY ESCAPED FROM UNREAL
        updatedProductName,
        updatedProductSKU,
        updatedProductPrice,
        updatedProductQuantity,
        updatedFinishes,
        ""
      ].join(',');  // ← SIMPLE JOIN - NO RE-ESCAPING
      
      return newRow;
      
    } catch (err) {
      console.error(`Error parsing row ${idx}:`, err);
      return row;
    }
  });
  
  csvStorage.current = completeCsv;
  csvStorage.currentState = 'completed';
  csvStorage.completionPercent = 100;
  window.csvStorage = csvStorage;
  
  console.log(`✅ ${completeCsv.length} rows populated\n`);
  
  setTimeout(() => {
    const exported = {
      csvRows: completeCsv,
      metadata: {
        sessionId: csvStorage.sessionId,
        status: csvStorage.currentState,
        completionPercent: csvStorage.completionPercent,
        exportedAt: new Date().toISOString()
      }
    };
    
    if (GOOGLE_SHEET_URL) {
      console.log('📤 Saving to Google Sheet...');
      saveToGoogleSheet(exported);
    }
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ 🚀 PREPARING CSV FOR UNREAL          ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    // ========== CRITICAL: Don't modify the rows - send as-is ==========
    const headerRow = 'SpaceName,Category,ProductName,ProductSKU,ProductPrice,ProductQuantity,Finishes,UpdatedProductName,UpdatedProductSKU,UpdatedProductPrice,UpdatedProductQuantity,UpdatedFinishes,Area';
    
    const unrealCsv = [headerRow, ...completeCsv];
    
    console.log(`✅ Ready to send ${completeCsv.length} rows to Unreal`);
    console.log(unrealCsv);
    sendUpdatedCSVRowsToUnreal(unrealCsv);
    
    console.log('📋 Opening CSV Preview Modal...');
    
    if (typeof showCSVPreviewModal === 'function') {
      showCSVPreviewModal(unrealCsv, (confirmedCsv) => {
        console.log('\n✅ CSV Confirmed by User - Sending to Unreal');
        sendReplacementCsvToUnreal(confirmedCsv);
      });
    } else {
      console.warn('⚠️ showCSVPreviewModal not available');
      // sendReplacementCsvToUnreal(unrealCsv);
    }
  }, 500);
  
  return true;
}

function verifyCSVColumns() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║ 🔍 COLUMN VERIFICATION               ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  if (!csvStorage.current || csvStorage.current.length === 0) {
    console.error('No CSV data');
    return;
  }
  
  const firstRow = csvStorage.current[0];
  const columns = firstRow.split(',');
  
  console.log(`Total columns: ${columns.length}`);
  columns.forEach((col, idx) => {
    console.log(`  ${idx}: ${col.substring(0, 40)}`);
  });
}

function addQueryToStack(query, intent, params) {
  const record = {
    id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query,
    intent,
    params,
    spaceName: 'ConferenceRoom',
    csvStateAtQuery: csvStorage.currentState,
    completionPercentAtQuery: csvStorage.completionPercent,
    timestamp: new Date().toISOString(),
    source: 'voice'
  };

  queryQueue.unshift(record);
  
  if (queryQueue.length > 50) {
    queryQueue = queryQueue.slice(0, 50);
  }

  console.log(`📝 Query Added: "${query.substring(0, 50)}..."`);
  window.queryQueue = queryQueue;
  
  return record;
}

function exportFilledCSV() {
  if (!csvStorage.current) {
    console.error('❌ No CSV to export');
    return null;
  }

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║ 📋 EXPORTING FILLED CSV                  ║');
  console.log('╚════════════════════════════════════════╝\n');

  const exported = {
    csvRows: csvStorage.current,
    metadata: {
      sessionId: csvStorage.sessionId,
      status: csvStorage.currentState,
      completionPercent: csvStorage.completionPercent,
      exportedAt: new Date().toISOString()
    }
  };

  console.log(`✅ CSV exported: ${csvStorage.completionPercent}%\n`);

  window.lastExportedCSV = exported;
  
  if (GOOGLE_SHEET_URL) {
    saveToGoogleSheet(exported);
  }
  
  return exported;
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

const SYSTEM_PROMPT = `You are Maya, a witty and charming interior design assistant for Vizwalk.

PERSONALITY: Speak like a confident, stylish friend with great taste. Warm, playful, slightly witty.
Keep responses short (1–2 lines max). Use natural design language.

CRITICAL: RESPOND ONLY IN VALID JSON - Never use plain text!

JSON FORMAT:
{
  "reply": "<1-2 line conversational response>",
  "intent": "<search_product|display_products|apply_theme|style_consultation|product_swap|palette_match|room_setup|budget_analysis|quick_filter|bundle|comparison|upgrade|refine>",
  "params": {
    "category": "<sofa|chair|table|lamp|decor or null>",
    "style": "<modern|traditional|minimalist|eclectic or null>",
    "color": "<color or null>",
    "secondary_colors": ["<color1>", "<color2>"] or [],
    "room": "<living_room|bedroom|kitchen|dining_room|conference_room or null>",
    "mood": "<cozy|bold|minimal|warm|elegant or null>",
    "price_range": "<budget or null>",
    "material": "<leather|wood|fabric|metal or null>",
    "quantity": <number or null>,
    "seating_capacity": <number or null>,
    "budget": <numeric or null>,
    "additional_params": {
      "finish": "<matte|glossy|natural or null>",
      "texture": "<velvet|linen|smooth|rough or null>",
      "lighting": "<natural|warm|cool or null>"
    }
  }
}

RULES: Extract ALL parameters. Use null for missing values. Return ONLY JSON.`;

const WAKE_WORDS = ["hi maya", "hey maya", "maaya", "maya", "mara", "hi mara"];
const SILENCE_TIMEOUT = 2000;
const NOISE_THRESHOLD = 50;
const SPEECH_CONFIDENCE_THRESHOLD = 0.85;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || "";
const SARVAM_API_KEY = process.env.REACT_APP_SARVAM_API_KEY || "";
const RECEIVER_API_URL = "http://localhost:8000";

let sarvamFailureCount = 0;
let sttQueue = [];
let ttsQueue = [];
let isSTTProcessing = false;
let isTTSProcessing = false;

const processSTTQueue = async () => {
  if (isSTTProcessing || sttQueue.length === 0) return;
  isSTTProcessing = true;
  const { data, callback } = sttQueue.shift();
  try {
    await sarvamSTT(data, callback);
  } catch (err) {}
  isSTTProcessing = false;
  setTimeout(processSTTQueue, 500);
};

const processTTSQueue = async () => {
  if (isTTSProcessing || ttsQueue.length === 0) return;
  isTTSProcessing = true;
  const { data, callback } = ttsQueue.shift();
  try {
    await sarvamTTS(data, callback);
  } catch (err) {}
  isTTSProcessing = false;
  setTimeout(processTTSQueue, 500);
};

const sarvamSTT = async (audioBlob, callback) => {
  try {
    if (!SARVAM_API_KEY) {
      console.warn("⚠️ SARVAM_API_KEY not set");
      callback(null);
      return;
    }

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp4");
    formData.append("model", "saaras:v2.5");

    const response = await fetch("https://api.sarvam.ai/speech-to-text-translate", {
      method: "POST",
      headers: { "api-subscription-key": SARVAM_API_KEY },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      sarvamFailureCount++;
      if (response.status === 429) {
        console.warn("⚠️ Sarvam rate limited (429)");
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      callback(null);
      return;
    }

    sarvamFailureCount = 0;

    if (data.transcript) {
      const transcript = data.transcript.toLowerCase().trim();
      callback(transcript);
    } else {
      callback(null);
    }
  } catch (err) {
    console.error("STT Error:", err);
    callback(null);
  }
};

const sarvamTTS = async (text, callback) => {
  try {
    if (!SARVAM_API_KEY) {
      console.warn("⚠️ SARVAM_API_KEY not set");
      callback(null);
      return;
    }

    const ttsResponse = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: "en-IN",
        model: "bulbul:v3",
        speaker: "ritu",
        pace: 1.0,
        temperature: 0.6,
      }),
    });

    if (!ttsResponse.ok) {
      callback(null);
      return;
    }

    const audioData = await ttsResponse.json();

    if (audioData.audios && audioData.audios.length > 0) {
      callback(audioData.audios[0]);
    } else {
      callback(null);
    }
  } catch (err) {
    console.error("TTS Error:", err);
    callback(null);
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MayaChat({ sendUpdatedCSVRowsToUnreal }) {
  const [visible, setVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningMode, setListeningMode] = useState("idle");
  const [recordedText, setRecordedText] = useState("");
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [csvStatus, setCSVStatus] = useState(null);

  // ========== CSV PREVIEW MODAL STATES ==========
  const [csvPreviewVisible, setCSVPreviewVisible] = useState(false);
  const [csvPreviewData, setCSVPreviewData] = useState([]);
  const [csvEditData, setCSVEditData] = useState([]);
  const pendingUnrealSendRef = useRef(null);

  const messagesEndRef = useRef(null);
  const panelRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const pauseTimeoutRef = useRef(null);
  const listeningRef = useRef(false);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
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
  const liveTextRef = useRef("");
  const lastMayaRequestIdRef = useRef("");
  const resultPollIntervalRef = useRef(null);

  // ========== CSV PREVIEW MODAL FUNCTIONS ==========
  
  const showCSVPreviewModal = (csvRows, onConfirm) => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ 📋 CSV PREVIEW MODAL OPENED           ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    setCSVPreviewData(csvRows);
    // ========== CRITICAL: Store as-is, don't modify ==========
    setCSVEditData([...csvRows]);
    pendingUnrealSendRef.current = onConfirm;
    setCSVPreviewVisible(true);
  };

  const confirmCSVSend = () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ ✅ CSV CONFIRMED - SENDING TO UNREAL ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('CSV rows to send:');
    csvEditData.forEach((row, idx) => {
      console.log(`Row ${idx}: ${row}`);
    });
    
    if (pendingUnrealSendRef.current) {
      pendingUnrealSendRef.current(csvEditData);
    }
    
    setCSVPreviewVisible(false);
  };

  const cancelCSVSend = () => {
    console.log('❌ CSV send cancelled by user');
    setCSVPreviewVisible(false);
    setCSVPreviewData([]);
    setCSVEditData([]);
    pendingUnrealSendRef.current = null;
  };

  const updateCSVRow = (rowIndex, newValue) => {
    const updated = [...csvEditData];
    updated[rowIndex] = newValue;
    setCSVEditData(updated);
    console.log(`Row ${rowIndex} updated (length: ${newValue.length})`);
  };

  // ========== CSV PREVIEW MODAL COMPONENT ==========
  const CSVPreviewModal = () => {
    if (!csvPreviewVisible) return null;

    return (
      <div style={styles.csvModalOverlay}>
        <div style={styles.csvModal}>
          <div style={styles.csvModalHeader}>
            <h3 style={styles.csvModalTitle}>📋 CSV Preview - Ready to Send</h3>
            <button
              onClick={cancelCSVSend}
              style={styles.csvModalClose}
            >
              ✕
            </button>
          </div>

          <div style={styles.csvModalBody}>
            <div style={styles.csvScrollContainer}>
              {csvEditData.map((row, idx) => (
                <div key={idx} style={styles.csvRowContainer}>
                  <div style={styles.csvRowNumber}>
                    {idx === 0 ? '📌 HEADER' : `📊 Row ${idx}`}
                  </div>
                  <textarea
                    value={row}
                    onChange={(e) => updateCSVRow(idx, e.target.value)}
                    style={styles.csvRowInput}
                    spellCheck="false"
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={styles.csvModalFooter}>
            <div style={styles.csvInfo}>
              Total: {csvEditData.length} rows
            </div>
            <div style={styles.csvModalButtons}>
              <button
                onClick={cancelCSVSend}
                style={styles.csvCancelBtn}
              >
                ❌ Cancel
              </button>
              <button
                onClick={confirmCSVSend}
                style={styles.csvConfirmBtn}
              >
                ✅ Send to Unreal
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========== LISTEN FOR CSV FROM UNREAL ==========
  useEffect(() => {
    const handleMessage = (event) => {
      const data = event.data;

      if (Array.isArray(data) && data[0]?.includes('SpaceName')) {
        console.log('\n📥 CSV RECEIVED VIA postMessage');
        storeRoomCSV(data);
        setCSVStatus(getCsvStatus());
      }
    };

    window.addEventListener('message', handleMessage);

    const checkInterval = setInterval(() => {
      if (window.lastRoomCsv && !csvStorage.original) {
        console.log('\n📥 CSV RECEIVED VIA window.lastRoomCsv');
        storeRoomCSV(window.lastRoomCsv);
        setCSVStatus(getCsvStatus());
      }
    }, 500);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkInterval);
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

      if (e.key === 'e' || e.key === 'E') {
        const exported = exportFilledCSV();
        if (exported) {
          console.log('✅ CSV exported');
        }
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
  E → Export Filled CSV
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
      const timer = setTimeout(() => {
        setIsOpen(true);
        setVisible(true);
        setTimeout(() => {
          startListening();
        }, 500);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleSpaceBar = (e) => {
      if (e.code !== "Space") return;
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
      e.preventDefault();

      if (!isOpen) {
        setIsOpen(true);
        setVisible(true);
        setTimeout(() => !listeningRef.current && startListening(), 300);
      } else {
        stopListeningImmediately();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleSpaceBar);
    return () => window.removeEventListener("keydown", handleSpaceBar);
  }, [isOpen]);

  useEffect(() => {
    messagesRef.current = messages;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startWebSpeechAPI = () => {
    try {
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = "en-IN";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;

          if (!event.results[i].isFinal) {
            interimTranscript += transcript;
          }
        }

        if (interimTranscript) {
          liveTextRef.current = interimTranscript;
          setLiveText(interimTranscript);
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

          populateRecommendations(data.data, sendUpdatedCSVRowsToUnreal, showCSVPreviewModal);
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

    try {
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      streamRef.current = stream;
      listeningRef.current = true;
      lastAudioTimeRef.current = Date.now();
      wakeWordDetectedRef.current = false;
      speechStartedRef.current = false;

      let audioContext = audioContextRef.current;
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;
      }

      if (audioContext.state === "suspended") await audioContext.resume();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/mp4",
        audioBitsPerSecond: 16000
      });

      if (!MediaRecorder.isTypeSupported("audio/mp4")) {
        mediaRecorderRef.current = new MediaRecorder(stream, { audioBitsPerSecond: 16000 });
      } else {
        mediaRecorderRef.current = mediaRecorder;
      }

      const actualRecorder = mediaRecorderRef.current;
      audioChunksRef.current = [];

      actualRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      actualRecorder.onstop = async () => {
        const blobCount = audioChunksRef.current.length;
        const audioBlob = blobCount > 0 ? new Blob(audioChunksRef.current, { type: "audio/mp4" }) : null;
        const blobSize = audioBlob ? audioBlob.size : 0;

        if (audioBlob && blobCount > 0) {
          const hasSpeech = speechStartedRef.current || blobSize > 30000;

          if (hasSpeech && blobSize > 15000) {
            const liveTextLower = (liveTextRef.current || "").toLowerCase();
            const hasWakeWordInLive = liveTextLower.length > 0 &&
              WAKE_WORDS.some(word => liveTextLower.includes(word));

            if (liveTextLower.length > 3 && !hasWakeWordInLive) {
              setListeningMode("idle");
              speechStartedRef.current = false;
              liveTextRef.current = "";
              setLiveText("");
              setTimeout(() => startListening(), 300);
              return;
            }

            await sendAudioToSarvam(audioBlob);
          } else {
            setListeningMode("idle");
            speechStartedRef.current = false;
            setTimeout(() => startListening(), 500);
          }
        } else {
          setListeningMode("idle");
          speechStartedRef.current = false;
          setTimeout(() => startListening(), 500);
        }
      };

      actualRecorder.onerror = () => {
        stopListeningImmediately();
      };

      actualRecorder.start(500);
      setIsListening(true);
      setListeningMode("idle");

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

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
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
          setListeningMode("continuous");
        }

        if (pauseTimeoutRef.current) {
          clearTimeout(pauseTimeoutRef.current);
          pauseTimeoutRef.current = null;
        }
      } else {
        silenceFrameCount++;
        const timeSinceSpeech = Date.now() - lastSpeechTime;

        if (speechStartedRef.current && silenceFrameCount > 2 && timeSinceSpeech > SILENCE_TIMEOUT) {
          if (!pauseTimeoutRef.current) {
            setListeningMode("paused");
            pauseTimeoutRef.current = true;

            if (listeningRef.current) {
              stopListeningImmediately();
              setListeningMode("processing");
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  };

  const handleTranscript = async (transcript) => {
    if (!transcript || transcript.trim().length === 0) {
      setListeningMode("idle");
      setTimeout(() => startListening(), 1000);
      return;
    }

    const lowerTranscript = transcript.toLowerCase();

    const hasWakeWord = WAKE_WORDS.some(word => lowerTranscript.includes(word));
    if (!hasWakeWord) {
      setListeningMode("idle");
      setTimeout(() => startListening(), 1000);
      return;
    }

    const validation = queryEngineRef.current.validateQuery(transcript);

    if (!validation.isValid) {
      setListeningMode("idle");
      setTimeout(() => startListening(), 1000);
      return;
    }

    const command = validation.cleanCommand;
    setRecordedText(command);
    sendMessage(command);
  };

  const sendAudioToSarvam = async (audioBlob) => {
    sttQueue.push({
      data: audioBlob,
      callback: (transcript) => {
        if (transcript) {
          liveTextRef.current = "";
          setLiveText("");
          handleTranscript(transcript);
        } else {
          audioChunksRef.current = [];
          speechStartedRef.current = false;
          setListeningMode("idle");
          setTimeout(() => startListening(), 1500);
        }
      }
    });
    processSTTQueue();
  };

  const postJsonToReceiver = async (jsonData, userQuery = "") => {
    if (!RECEIVER_API_URL) return;

    try {
      addQueryToStack(userQuery, jsonData.intent, jsonData.params);

      const payloadWithId = {
        ...jsonData,
        search_query: userQuery,
        request_id: `maya-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: "maya_frontend",
        created_at: new Date().toISOString(),
      };

      console.log("📤 Sending payload to receiver");

      const res = await fetch(`${RECEIVER_API_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithId),
      });

      const result = await res.json().catch(() => null);
      console.log("✅ Receiver status:", res.status);

      startPollingForResult(payloadWithId.request_id);
    } catch (err) {
      console.error("Failed to post:", err);
    }
  };

  const speakText = (text, fullText) => {
    if (!text || text.trim().length === 0) return;

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
            const audioBlob = new Blob([bytes], { type: "audio/mpeg" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onloadedmetadata = () => {
              const words = fullText.split(" ");
              const audioDurationMs = audio.duration * 1000;
              const delayPerWord = Math.max(80, audioDurationMs / words.length);

              audio.play().catch(() => setIsSpeaking(false));

              setListeningMode("talking");
              stopListeningImmediately();

              let currentIndex = 0;
              let displayedText = "";

              const streamNextWord = () => {
                if (currentIndex < words.length) {
                  displayedText += (currentIndex > 0 ? " " : "") + words[currentIndex];
                  const streamedMessages = [
                    ...messagesRef.current.slice(0, -1),
                    { role: "assistant", content: displayedText }
                  ];
                  setMessages(streamedMessages);
                  messagesRef.current = streamedMessages;
                  currentIndex++;
                  setTimeout(streamNextWord, delayPerWord);
                }
              };

              streamNextWord();
            };

            audio.onended = () => {
              setIsSpeaking(false);
              URL.revokeObjectURL(audioUrl);
              setListeningMode("idle");
              speechStartedRef.current = false;
              pauseTimeoutRef.current = null;
              listeningRef.current = false;
              setTimeout(() => startListening(), 1000);
            };

            audio.onerror = () => {
              setIsSpeaking(false);
              URL.revokeObjectURL(audioUrl);
            };

          } catch (err) {
            setIsSpeaking(false);
          }
        } else {
          setListeningMode("idle");
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          listeningRef.current = false;
          setTimeout(() => startListening(), 1000);
        }
      }
    });
    processTTSQueue();
  };

  const sendMessage = async (textToSend = null) => {
    const messageText = textToSend || input;

    if (isProcessingRef.current) {
      sttQueue = [];
      return;
    }

    if (!messageText || !messageText.trim() || loading) return;

    isProcessingRef.current = true;

    stopListeningImmediately();
    setListeningMode("processing");

    const userMessage = { role: "user", content: messageText };
    const newMessages = [...messagesRef.current, userMessage];

    setMessages(newMessages);
    messagesRef.current = newMessages;
    setInput("");
    setRecordedText("");
    setLoading(true);

    try {
      if (!OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY is missing");
        throw new Error("REACT_APP_OPENAI_API_KEY is missing");
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...newMessages],
          max_tokens: 1000,
          response_format: { type: "json_object" },
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(`OpenAI Error ${response.status}`);
      if (!data.choices?.[0]?.message?.content) throw new Error("No response from OpenAI");

      const raw = data.choices[0].message.content;
      let displayText = raw;
      let jsonData = null;

      try {
        jsonData = JSON.parse(raw);
        displayText = jsonData.reply || raw;

        window.lastMayaJSON = jsonData;

        const filterInstance = new MayaQueryFilter();
        const intentValid = filterInstance.validateIntent(jsonData);
        if (!intentValid) {
          setLoading(false);
          isProcessingRef.current = false;
          setListeningMode("idle");
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          listeningRef.current = false;
          setTimeout(() => startListening(), 1000);
          return;
        }

        console.log("\n📦 Maya JSON Response received");
        console.log(JSON.stringify(jsonData, null, 2));

        postJsonToReceiver(jsonData, messageText);
      } catch (parseErr) {
        displayText = raw;
      }

      const allMessages = [...messagesRef.current, { role: "assistant", content: "" }];

      setMessages(allMessages);
      messagesRef.current = allMessages;

      speakText(displayText, displayText);
    } catch (err) {
      console.error("❌ Error:", err.message);
      const errorMessages = [...messagesRef.current, { role: "assistant", content: "Oops! Something went wrong. Please try again." }];
      setMessages(errorMessages);
      messagesRef.current = errorMessages;
      setListeningMode("idle");
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

  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Backspace") e.stopPropagation();
  };

  const handlePanelKeyDown = (e) => e.stopPropagation();

  if (!visible) return null;

  return (
    <>
      {isOpen && (
        <div style={styles.panel} ref={panelRef} onKeyDown={handlePanelKeyDown}>
          <button
            onClick={() => {
              stopListeningImmediately();
              setIsOpen(false);
            }}
            style={styles.closeBtn}
          >
            ✕
          </button>

          <div style={styles.statusBar}>
            {listeningMode === "talking" ? (
              <span style={styles.statusLive}>
                🗣️ TALKING
              </span>
            ) : listeningMode === "processing" || listeningMode === "paused" ? (
              <span style={styles.statusLive}>
                🧠 THINKING
              </span>
            ) : (
              <span style={styles.statusLive}>
                👂 LISTENING
              </span>
            )}
            {csvStatus && (
              <span style={{ fontSize: 11, marginLeft: 'auto', color: '#666' }}>
                CSV: {csvStatus.completionPercent}%
              </span>
            )}
          </div>

          <div style={styles.chatBody}>
            {messages.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {messages.map((msg, i) => (
                  <div
                    key={`msg-${i}`}
                    style={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                      marginBottom: 12,
                      width: "100%",
                    }}
                  >
                    <div style={msg.role === "user" ? styles.userBubble : styles.aiBubble}>
                      {msg.content}
                    </div>
                  </div>
                ))}

                {liveText && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBottom: 12,
                      width: "100%",
                    }}
                  >
                    <div style={{ ...styles.userBubble, fontStyle: "italic", opacity: 0.8, fontSize: 12.5 }}>
                      {liveText}
                    </div>
                  </div>
                )}

                {loading && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                    <div style={styles.aiBubble}>
                      <span style={styles.loadingDots}>●●●</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} style={{ height: 0 }} />
              </div>
            ) : isListening ? (
              <div style={styles.listeningContainer}>
                <div style={styles.listeningAnimation}>
                  <span style={styles.listeningDot}></span>
                  <span style={styles.listeningDot}></span>
                  <span style={styles.listeningDot}></span>
                </div>
                <p style={styles.listeningText}>Hi, I'm Maya. I'm listening.</p>
                <p style={styles.statusText}>
                  {listeningMode === "talking" && "🗣️ Speaking..."}
                  {(listeningMode === "processing" || listeningMode === "paused") && "🧠 Processing..."}
                  {(listeningMode === "idle" || listeningMode === "continuous") && "👂 Waiting..."}
                </p>
                {csvStatus && (
                  <p style={styles.recordedTextDisplay}>
                    📊 CSV: {csvStatus.rowsCount} rows | {csvStatus.completionPercent}%
                  </p>
                )}
              </div>
            ) : (
              <div style={styles.greeting}>
                <div style={styles.sparkleIcon}>✦</div>
                <p style={styles.greetingTitle}>Hi! I'm Maya</p>
                <p style={styles.greetingSub}>Say 'Hi Maya' to begin</p>
              </div>
            )}
          </div>

          {error && <div style={styles.errorBanner}>⚠️ {error}</div>}

          <div style={styles.inputRow}>
            <input
              style={styles.input}
              placeholder="Or type here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || isListening}
            />

            <button
              onClick={() => sendMessage()}
              style={{
                ...styles.sendBtn,
                opacity: loading || !input.trim() ? 0.5 : 1,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              }}
              disabled={loading || !input.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {!isOpen && visible && (
        <button onClick={() => setIsOpen(true)} style={styles.toggleBtn}>
          ✦
        </button>
      )}

      {/* CSV PREVIEW MODAL */}
      <CSVPreviewModal />
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  toggleBtn: {
    position: "fixed",
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.95)",
    border: "none",
    cursor: "pointer",
    fontSize: 24,
    color: "#6b5c45",
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    zIndex: 10000,
    transition: "all 0.3s ease",
  },
  panel: {
    position: "fixed",
    bottom: 30,
    right: 30,
    width: 380,
    height: 600,
    background: "rgba(255,255,255,0.75)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    borderRadius: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    zIndex: 10000,
    border: "1px solid rgba(255,255,255,0.4)",
  },
  statusBar: {
    padding: "8px 16px",
    background: "rgba(0,0,0,0.05)",
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLive: {
    color: "#ff6b6b",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.08)",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#666",
    zIndex: 10,
    transition: "background 0.2s ease",
  },
  chatBody: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    minHeight: 0,
  },
  greeting: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 12,
  },
  listeningContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
  },
  listeningAnimation: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  listeningDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#6b5c45",
    animation: "bounce 1.4s infinite",
  },
  listeningText: {
    fontSize: 16,
    color: "#2d2d2d",
    margin: 0,
    fontWeight: "500",
  },
  statusText: {
    fontSize: 13,
    color: "#888",
    margin: 0,
  },
  recordedTextDisplay: {
    fontSize: 13,
    color: "#666",
    margin: "8px 0 0 0",
    fontStyle: "italic",
    maxWidth: "90%",
  },
  sparkleIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #e8e0f5, #d4c5f0)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 28,
    color: "#7c5cbf",
  },
  greetingTitle: {
    fontFamily: "Georgia, serif",
    fontSize: 24,
    color: "#2d2d2d",
    margin: 0,
    fontWeight: "600",
  },
  greetingSub: {
    fontSize: 14,
    color: "#888",
    margin: 0,
  },
  userBubble: {
    maxWidth: "75%",
    padding: "12px 16px",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 4,
    background: "#e8e8e8",
    color: "#2d2d2d",
    fontSize: 13.5,
    lineHeight: 1.5,
    wordWrap: "break-word",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  },
  aiBubble: {
    maxWidth: "75%",
    padding: "12px 16px",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 20,
    background: "#f0ecfb",
    color: "#2d2d2d",
    fontSize: 13.5,
    lineHeight: 1.5,
    wordWrap: "break-word",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  },
  loadingDots: {
    animation: "pulse 1s infinite",
    letterSpacing: "2px",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 16px",
    borderTop: "1px solid rgba(0,0,0,0.06)",
    background: "rgba(255,255,255,0.4)",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: 13.5,
    color: "#2d2d2d",
    background: "transparent",
    fontFamily: "inherit",
    padding: "0 4px",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#2d2d2d",
    color: "white",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    transition: "opacity 0.2s ease",
  },
  errorBanner: {
    padding: "8px 12px",
    background: "#fff3cd",
    color: "#856404",
    fontSize: 12,
    borderTop: "1px solid rgba(0,0,0,0.06)",
    maxHeight: "60px",
    overflowY: "auto",
  },

  // CSV MODAL STYLES
  csvModalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10001,
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
  csvModal: {
    width: "90%",
    maxWidth: "1000px",
    height: "80vh",
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderRadius: "16px",
    boxShadow: "0 25px 50px rgba(0, 0, 0, 0.3)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  csvModalHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  csvModalTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "600",
    color: "#2d2d2d",
  },
  csvModalClose: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "rgba(0, 0, 0, 0.08)",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    transition: "background 0.2s",
  },
  csvModalBody: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    backgroundColor: "#ffffff",
  },
  csvScrollContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  csvRowContainer: {
    padding: "12px",
    backgroundColor: "#f8f9fa",
    borderRadius: "8px",
    border: "1px solid rgba(0, 0, 0, 0.1)",
  },
  csvRowNumber: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#666",
    marginBottom: "8px",
    padding: "0 4px",
  },
  csvRowInput: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontFamily: "monospace",
    fontSize: "12px",
    lineHeight: "1.4",
    resize: "vertical",
    minHeight: "60px",
    backgroundColor: "#ffffff",
  },
  csvModalFooter: {
    padding: "16px 24px",
    borderTop: "1px solid rgba(0, 0, 0, 0.1)",
    backgroundColor: "#f8f9fa",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  csvInfo: {
    fontSize: "12px",
    color: "#666",
  },
  csvModalButtons: {
    display: "flex",
    gap: "12px",
  },
  csvCancelBtn: {
    padding: "10px 20px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    backgroundColor: "#ffffff",
    color: "#2d2d2d",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "all 0.2s",
  },
  csvConfirmBtn: {
    padding: "10px 20px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#2d2d2d",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "all 0.2s",
  },
};

const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes bounce {
    0%, 80%, 100% { opacity: 0.4; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.2); }
  }
`;
document.head.appendChild(styleSheet);