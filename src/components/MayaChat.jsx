import { useState, useRef, useEffect } from "react";
import { MayaQueryEngine } from './MayaQueryEngine';
import { MayaQueryFilter } from './MayaQueryFilter';

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

RULES: Extract ALL parameters. Use null for missing values. Return ONLY JSON.

EXAMPLES:

User: "Show me modern sofas under ₹50,000"
{"reply": "Modern sofas coming right up!", "intent": "search_product", "params": {"category": "sofa", "style": "modern", "color": null, "secondary_colors": [], "room": null, "mood": null, "price_range": "under 50000", "material": null, "quantity": null, "seating_capacity": null, "budget": 50000, "additional_params": {"finish": null, "texture": null, "lighting": null}}}

User: "I want Warm Minimal conference room: sofa + 2 chairs + lighting under ₹80,000"
{"reply": "Creating your warm minimal conference setup...", "intent": "bundle", "params": {"category": "sofa,chair,lighting", "style": "minimal", "color": null, "secondary_colors": [], "room": "conference_room", "mood": "warm", "price_range": "under 80000", "material": null, "quantity": {"sofa": 1, "chair": 2, "lighting": 1}, "seating_capacity": null, "budget": 80000, "additional_params": {"finish": null, "texture": null, "lighting": "warm"}}}`;

// ✅ FIXED: Simple API key loading for Create React App
const WAKE_WORDS = ["hi maya", "hey maya", "maaya", "maya"];
const SILENCE_TIMEOUT = 2000;
const NOISE_THRESHOLD = 25;
const SPEECH_CONFIDENCE_THRESHOLD = 0.75;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || "";
const SARVAM_API_KEY = process.env.REACT_APP_SARVAM_API_KEY || "";
const RECEIVER_API_URL = "https://maya-receiver-api.onrender.com";

let sarvamFailureCount = 0;
let sarvamQueue = [];
let isSarvamProcessing = false;

const processSarvamQueue = async () => {
  if (isSarvamProcessing || sarvamQueue.length === 0) return;

  isSarvamProcessing = true;
  const { type, data, callback } = sarvamQueue.shift();

  try {
    if (type === "STT") {
      await sarvamSTT(data, callback);
    } else if (type === "TTS") {
      await sarvamTTS(data, callback);
    }
  } catch (err) {
    // Error handled in the function
  }

  isSarvamProcessing = false;
  
  // Process next item after 3 second delay
  setTimeout(processSarvamQueue, 3000);
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
    formData.append("language_code", "en-IN");

    const response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { Authorization: `Bearer ${SARVAM_API_KEY}` },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      sarvamFailureCount++;
      // 429 = rate limited — back off for 10 seconds before allowing next call
      if (response.status === 429) {
        console.warn("⚠️ Sarvam rate limited (429) — backing off 10s");
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
        Authorization: `Bearer ${SARVAM_API_KEY}`,
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

export default function MayaChat() {
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
  const [isPausedListening, setIsPausedListening] = useState(false);

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
        // Open chatbot — resume listening, keep existing chat history
        setIsOpen(true);
        setVisible(true);
        setTimeout(() => !listeningRef.current && startListening(), 300);
      } else {
        // Minimize chatbot — stop mic but keep chat history intact
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
          setLiveText(interimTranscript);
        }
      };

      recognition.onerror = () => {
        // Silent
      };

      recognition.onend = () => {
        // Silent
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      // Silent
    }
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
        if (audioChunksRef.current.length > 0 && speechStartedRef.current) {
          // Only send to Sarvam if real speech was detected by audio monitor
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mp4" });
          if (audioBlob.size > 15000) {
            await sendAudioToSarvam(audioBlob);
          } else {
            // Speech detected but blob too small — noise, restart quietly
            setListeningMode("idle");
            speechStartedRef.current = false;
            setTimeout(() => startListening(), 500);
          }
        } else {
          // No speech detected at all — restart quietly, never call Sarvam
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

    // Wake word check — every query, every time, must start with "Maaya"
    const hasWakeWord = WAKE_WORDS.some(word => lowerTranscript.includes(word));
    if (!hasWakeWord) {
      // Silently ignore — no wake word detected
      setListeningMode("idle");
      setTimeout(() => startListening(), 1000);
      return;
    }

    // Wake word found — now validate the command
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
    sarvamQueue.push({
      type: "STT",
      data: audioBlob,
      callback: (transcript) => {
        if (transcript) {
          setLiveText("");
          handleTranscript(transcript);
        } else {
          // Sarvam failed — reset state cleanly and restart listening
          audioChunksRef.current = [];
          speechStartedRef.current = false;
          setListeningMode("idle");
          setTimeout(() => startListening(), 1500);
        }
      }
    });

    processSarvamQueue();
  };

  const streamMessageText = (fullText) => {
    const words = fullText.split(" ");
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
        setTimeout(streamNextWord, 120);
      }
    };

    streamNextWord();
  };

  const postJsonToReceiver = async (jsonData) => {
    if (!RECEIVER_API_URL) return;
    try {
      await fetch(`${RECEIVER_API_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonData),
      });
    } catch (err) {
      // Silent fail
    }
  };

  const speakText = (text) => {
    if (!text || text.trim().length === 0) return;

    sarvamQueue.push({
      type: "TTS",
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
            const audioBlob = new Blob([bytes], { type: "audio/wav" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => {
              setIsSpeaking(false);
              URL.revokeObjectURL(audioUrl);

              // 🗣️ TALKING done — go back to 👂 LISTENING
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

            audio.play().catch(() => setIsSpeaking(false));

            // 🗣️ TALKING — mic fully paused, prevents feedback loop
            setListeningMode("talking");
            stopListeningImmediately();
          } catch (err) {
            setIsSpeaking(false);
          }
        }
      }
    });

    processSarvamQueue();
  };

  const sendMessage = async (textToSend = null) => {
    const messageText = textToSend || input;

    if (isProcessingRef.current) {
      return;
    }

    if (!messageText || !messageText.trim() || loading) return;

    isProcessingRef.current = true;

    // 🧠 THINKING — mic fully off, no new query can sneak in
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
        console.error("❌ OPENAI_API_KEY is missing - check your .env file");
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
        if (!filterInstance.validateIntent(jsonData)) {
          setLoading(false);
          isProcessingRef.current = false;
          setListeningMode("idle");
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          listeningRef.current = false;
          setTimeout(() => startListening(), 1000);
          return;
        }

        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║           📦 MAYA JSON OUTPUT - OPENAI RESPONSE           ║");
        console.log("╚════════════════════════════════════════════════════════════╝");
        console.log("\n📋 COMPLETE JSON OBJECT:");
        console.log(JSON.stringify(jsonData, null, 2));
        console.log("\n💬 REPLY:");
        console.log(`"${jsonData.reply}"`);
        console.log("\n🎯 INTENT:");
        console.log(jsonData.intent);
        console.log("\n📊 PARAMETERS:");
        const p = jsonData.params;
        console.log("category:", p.category);
        console.log("style:", p.style);
        console.log("color:", p.color);
        console.log("room:", p.room);
        console.log("mood:", p.mood);
        console.log("budget:", p.budget);
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║ 💾 Accessible via: window.lastMayaJSON                   ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");

        postJsonToReceiver(jsonData);
      } catch (parseErr) {
        displayText = raw;
      }

      const allMessages = [...messagesRef.current, { role: "assistant", content: displayText }];

      setMessages(allMessages);
      messagesRef.current = allMessages;

      speakText(displayText);
      streamMessageText(displayText);
    } catch (err) {
      console.error("❌ Error:", err.message);
      const errorMessages = [...messagesRef.current, { role: "assistant", content: "Oops! Something went wrong. Please try again." }];
      setMessages(errorMessages);
      messagesRef.current = errorMessages;
      // On error only — reset and restart listening since speakText won't be called
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
                🗣️ <span style={{ fontSize: 13, fontWeight: "600" }}>TALKING</span>
              </span>
            ) : listeningMode === "processing" || listeningMode === "paused" ? (
              <span style={styles.statusLive}>
                🧠 <span style={{ fontSize: 13, fontWeight: "600" }}>THINKING</span>
              </span>
            ) : (
              <span style={styles.statusLive}>
                👂 <span style={{ fontSize: 13, fontWeight: "600" }}>LISTENING</span>
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
                  {listeningMode === "talking" && "🗣️ Maaya is speaking..."}
                  {(listeningMode === "processing" || listeningMode === "paused") && "🧠 Processing your request..."}
                  {(listeningMode === "idle" || listeningMode === "continuous") && "👂 Waiting for 'Maaya'..."}
                </p>
                {recordedText && <p style={styles.recordedTextDisplay}>"{recordedText}"</p>}
              </div>
            ) : (
              <div style={styles.greeting}>
                <div style={styles.sparkleIcon}>✦</div>
                <p style={styles.greetingTitle}>Hi! I'm Maya</p>
                <p style={styles.greetingSub}>Say "Hi Maya" to begin</p>
              </div>
            )}
          </div>

          {error && <div style={styles.errorBanner}>⚠️ {error}</div>}

          <div style={styles.inputRow}>
            <input
              style={styles.input}
              placeholder="Or type here and press Enter..."
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
    </>
  );
}

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
  },
  statusLive: {
    color: "#ff6b6b",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  statusIdle: {
    color: "#6b5c45",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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