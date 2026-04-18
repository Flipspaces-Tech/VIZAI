import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are Maya, a witty and charming interior design assistant for Vizwalk — a real-time AI-powered design platform.

PERSONALITY & VOICE:
- Speak like a confident, stylish friend with great taste
- Warm, playful, slightly witty — never robotic
- Keep responses short (1–2 lines max)
- Use natural design language (mood, palette, texture, tone)

CRITICAL: YOU MUST RETURN VALID JSON OBJECT ONLY - NOT TEXT!
The user interface requires valid JSON. Always respond with the exact JSON format below. Never return plain text.

SUPPORTED INTENTS:
search_product, display_products, apply_theme, style_consultation, product_swap, palette_match, room_setup, budget_analysis, quick_filter

MANDATORY - ALWAYS RETURN THIS EXACT JSON FORMAT (no exceptions):
{
  "reply": "<conversational response 1-2 lines only>",
  "intent": "<one intent from list or null>",
  "params": {
    "category": "<sofa/chair/table/lamp/decor or null>",
    "style": "<modern/traditional/minimalist/eclectic or null>",
    "color": "<primary color or null>",
    "secondary_colors": ["<color1>", "<color2>"] or [],
    "room": "<living_room/bedroom/kitchen/dining_room or null>",
    "mood": "<cozy/bold/minimal/warm/elegant or null>",
    "price_range": "<budget range or null>",
    "material": "<leather/wood/fabric/metal or null>",
    "quantity": <number or null>,
    "seating_capacity": <number or null>,
    "budget": <numeric value or null>,
    "additional_params": {
      "finish": "<matte/glossy/natural or null>",
      "texture": "<velvet/linen/smooth/rough or null>",
      "lighting": "<natural/warm/cool or null>"
    }
  }
}

RULES:
1. RESPOND ONLY IN JSON - Never use markdown, code blocks, or plain text
2. Extract ALL design parameters from user message
3. Always include ALL fields in params (use null for missing values)
4. Map to the most specific intent
5. Keep reply to 1-2 lines maximum
6. Return valid JSON that can be parsed immediately

EXAMPLES - Copy this format exactly:

User: "Show me modern green sofas for living room"
{"reply": "Modern green sofas — strong choice. Pulling options.", "intent": "search_product", "params": {"category": "sofa", "style": "modern", "color": "green", "secondary_colors": [], "room": "living_room", "mood": null, "price_range": null, "material": null, "quantity": null, "seating_capacity": null, "budget": null, "additional_params": {"finish": null, "texture": null, "lighting": null}}}

User: "I want a cozy traditional setup under 50k"
{"reply": "Perfect! Cozy traditional pieces coming right up.", "intent": "room_setup", "params": {"category": "furniture_set", "style": "traditional", "color": null, "secondary_colors": [], "room": null, "mood": "cozy", "price_range": "under 50000", "material": null, "quantity": null, "seating_capacity": null, "budget": 50000, "additional_params": {"finish": null, "texture": null, "lighting": null}}}

User: "What colors match my blue sofa?"
{"reply": "Blue is versatile! Neutrals ground it, or try terracotta.", "intent": "palette_match", "params": {"category": "sofa", "style": null, "color": "blue", "secondary_colors": ["neutral", "terracotta"], "room": null, "mood": null, "price_range": null, "material": null, "quantity": null, "seating_capacity": null, "budget": null, "additional_params": {"finish": null, "texture": null, "lighting": null}}}

FINAL REMINDER: You must ONLY output valid JSON object. No other text. No markdown. No code blocks. Only JSON.`;

const WAKE_WORDS = ["hi maya", "maya"];
const PAUSE_TIMEOUT = 1500;  // Reduced from 2000ms to 1.5 seconds
const NOISE_THRESHOLD = 15;
const SPEECH_CONFIDENCE_THRESHOLD = 0.6;

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || "";
const SARVAM_API_KEY = process.env.REACT_APP_SARVAM_API_KEY || "";
const RECEIVER_API_URL = "https://maya-receiver-api.onrender.com";

// Verify API keys are loaded
console.log("🔑 API Keys Status:");
console.log("✅ OPENAI_API_KEY loaded:", !!OPENAI_API_KEY);
console.log("✅ SARVAM_API_KEY loaded:", !!SARVAM_API_KEY);
console.log("✅ RECEIVER_API_URL:", RECEIVER_API_URL);

// Flag to track if Sarvam is failing - fallback to Web Speech API
let sarvamFailureCount = 0;
const SARVAM_FAILURE_THRESHOLD = 3; // Switch after 3 failures
let useFallbackAPI = false;

export default function MayaChat() {
  const [visible, setVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(false);  // ← Start CLOSED
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);  // ← NEW: Reliable message tracking
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningMode, setListeningMode] = useState("idle");
  const [recordedText, setRecordedText] = useState("");
  const [error, setError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);  // ← NEW: Track Maya speaking

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
  const firstMessageSentRef = useRef(false);  // ← NEW: Track if first message sent

  // Don't auto-start - wait for spacebar
  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     startListening();
  //   }, 500);
  //   return () => clearTimeout(timer);
  // }, []);
  useEffect(() => {
    const handleSpaceBar = (e) => {
      // Only if spacebar pressed
      if (e.code !== "Space") return;
      
      // Don't trigger if user is typing in an input field
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
        return;
      }

      e.preventDefault();

      if (!isOpen) {
        // Open the chat and start listening
        console.log("🔓 Opening chat via spacebar");
        
        // Reset conversation state for fresh start
        firstMessageSentRef.current = false;
        wakeWordDetectedRef.current = false;
        speechStartedRef.current = false;
        
        setIsOpen(true);
        setVisible(true);
        setMessages([]);
        messagesRef.current = [];
        
        setTimeout(() => {
          if (!listeningRef.current) {
            console.log("🎙️ Starting listening automatically");
            startListening();
          }
        }, 300);
      } else if (isListening) {
        // Stop listening completely (not just pause)
        console.log("🛑 Stopping listening via spacebar");
        stopListeningImmediately();
        setListeningMode("idle");
        
        // Reset conversation state for fresh start next time
        console.log("🔄 Resetting conversation state");
        firstMessageSentRef.current = false;
        wakeWordDetectedRef.current = false;
        speechStartedRef.current = false;
        setMessages([]);
        messagesRef.current = [];
      } else {
        // Resume listening if paused
        console.log("▶️ Resuming listening via spacebar");
        setListeningMode("idle");
        resumeListening();
      }
    };

    window.addEventListener("keydown", handleSpaceBar);
    return () => window.removeEventListener("keydown", handleSpaceBar);
  }, [isOpen, isListening]);

  useEffect(() => {
    console.log("📱 Messages state updated. Current messages:", messages);
    console.log("📱 Messages count:", messages.length);
    messagesRef.current = messages;  // ← Keep ref in sync with state
    if (messages.length > 0) {
      console.log("📋 Full messages list:", JSON.stringify(messages, null, 2));
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Debug hook to monitor state changes
  useEffect(() => {
    console.log("🔍 DEBUG: Component rendered with", messages.length, "messages");
  });

  const startListening = async () => {
    console.log("🎙️ startListening called. Current listeningRef:", listeningRef.current);
    
    // If already listening, don't start again
    if (listeningRef.current) {
      console.log("⚠️ Already listening, skipping restart");
      return;
    }

    try {
      setError("");
      console.log("🔄 Starting fresh listening session...");
      console.log("   - Requesting microphone access...");
      
      // Clean up any leftover audio chunks
      audioChunksRef.current = [];
      console.log("🧹 Audio chunks cleared before new session");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,  // Changed to true for better audio levels
        },
      });

      console.log("✅ Microphone access granted. Stream:", stream);
      streamRef.current = stream;
      listeningRef.current = true;
      lastAudioTimeRef.current = Date.now();
      wakeWordDetectedRef.current = false;
      speechStartedRef.current = false;

      console.log("✅ listeningRef.current set to true");

      // Create fresh AudioContext for each session (avoid reuse issues)
      let audioContext = audioContextRef.current;
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;
        console.log("✅ New AudioContext created (previous was closed)");
      } else {
        console.log("✅ Reusing existing AudioContext");
      }

      // Resume context if suspended
      if (audioContext.state === "suspended") {
        await audioContext.resume();
        console.log("✅ AudioContext resumed");
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      console.log("✅ Audio source connected to analyser");

      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: "audio/mp4",  // Changed to mp4 which is widely supported
        audioBitsPerSecond: 16000
      });
      
      // Fallback if mp4 not supported
      if (!MediaRecorder.isTypeSupported("audio/mp4")) {
        console.warn("⚠️ audio/mp4 not supported, trying audio/webm");
        const recorder = new MediaRecorder(stream, { 
          audioBitsPerSecond: 16000 
        });
        mediaRecorderRef.current = recorder;
      } else {
        mediaRecorderRef.current = mediaRecorder;
      }
      
      const actualRecorder = mediaRecorderRef.current;
      audioChunksRef.current = [];

      console.log("✅ MediaRecorder created");

      actualRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log("📝 Audio chunk received:", event.data.size, "bytes");
        }
      };

      actualRecorder.onstop = async () => {
        console.log("🛑 MediaRecorder stopped. Total chunks:", audioChunksRef.current.length);
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mp4" });
          console.log("🔊 Audio blob created:", audioBlob.size, "bytes");
          await sendAudioToSarvam(audioBlob);
        } else {
          console.warn("⚠️ No audio chunks to process");
        }
      };

      actualRecorder.onerror = (event) => {
        console.error("❌ MediaRecorder error:", event?.error?.message);
        setError("Recording error: " + (event?.error?.message || "unknown error"));
        stopListeningImmediately();
      };

      actualRecorder.start(500);  // Request data every 500ms for faster processing
      console.log("🔴 MediaRecorder started. Ready to listen!");
      setIsListening(true);
      setListeningMode("idle");
      monitorAudioLevels(analyser);
    } catch (err) {
      console.error("❌ Error in startListening:", err.message);
      setError("Microphone access denied. Check browser permissions.");
      listeningRef.current = false;
      setIsListening(false);
    }
  };

  // PAUSE listening (pause recording and monitoring)
  const pauseListening = () => {
    console.log("⏸️ pauseListening called - pausing audio recording and monitoring");
    
    // Stop the animation frame monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Pause the MediaRecorder if it's recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.pause();
        console.log("⏸️ MediaRecorder paused");
      } catch (err) {
        console.error("Error pausing MediaRecorder:", err);
      }
    }

    listeningRef.current = false;
    setIsListening(false);
    console.log("✅ Listening paused. listeningRef.current =", listeningRef.current);
  };

  // RESUME listening (resume recording and monitoring)
  const resumeListening = () => {
    console.log("▶️ resumeListening called - resuming audio recording and monitoring");
    
    // Resume the MediaRecorder if it's paused
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      try {
        mediaRecorderRef.current.resume();
        console.log("▶️ MediaRecorder resumed");
      } catch (err) {
        console.error("Error resuming MediaRecorder:", err);
      }
    }
    
    if (!listeningRef.current && analyserRef.current) {
      listeningRef.current = true;
      setIsListening(true);
      speechStartedRef.current = false;
      monitorAudioLevels(analyserRef.current);
      console.log("✅ Listening resumed. listeningRef.current =", listeningRef.current);
    }
  };

  const stopListeningImmediately = () => {
    console.log("🛑 stopListeningImmediately called");
    console.log("   - animationFrameRef.current:", !!animationFrameRef.current);
    console.log("   - mediaRecorderRef.current:", !!mediaRecorderRef.current);
    console.log("   - streamRef.current:", !!streamRef.current);
    
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

    listeningRef.current = false;
    setIsListening(false);
    console.log("✅ Listening stopped. listeningRef.current =", listeningRef.current);
  };

  const monitorAudioLevels = (analyser) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceFrameCount = 0;  // Track consecutive silence frames
    let lastSpeechTime = Date.now();

    const checkAudio = () => {
      if (!listeningRef.current) {
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Calculate more sophisticated audio metrics
      let sum = 0;
      let count = 0;
      const relevantBins = dataArray.slice(10, 150); // Focus on speech frequencies (100Hz-4kHz)

      for (let i = 0; i < relevantBins.length; i++) {
        sum += relevantBins[i] * relevantBins[i];
        if (relevantBins[i] > NOISE_THRESHOLD) count++;
      }

      const speechEnergy = Math.sqrt(sum / relevantBins.length);
      const speechConfidence = count / relevantBins.length;
      const isSpeech = speechEnergy > NOISE_THRESHOLD && speechConfidence > SPEECH_CONFIDENCE_THRESHOLD;

      // Detect speech (not just noise)
      if (isSpeech) {
        lastSpeechTime = Date.now();
        lastAudioTimeRef.current = lastSpeechTime;
        silenceFrameCount = 0;  // Reset silence counter on speech
        
        if (!speechStartedRef.current) {
          speechStartedRef.current = true;
          setListeningMode("continuous");
        }

        if (pauseTimeoutRef.current) {
          clearTimeout(pauseTimeoutRef.current);
          pauseTimeoutRef.current = null;
        }
      } else {
        // Silence detected
        silenceFrameCount++;
        const timeSinceSpeech = Date.now() - lastSpeechTime;
        
        // Detect pause: Stop as soon as we detect silence (very aggressive)
        // silenceFrameCount > 3 = ~300ms of silence = definitely a pause
        if (speechStartedRef.current && silenceFrameCount > 3 && timeSinceSpeech > 800) {
          if (!pauseTimeoutRef.current) {
            console.log("⏸️ PAUSE DETECTED! Silence:", silenceFrameCount, "frames, Time:", timeSinceSpeech, "ms");
            setListeningMode("paused");
            pauseTimeoutRef.current = true;

            // Stop listening and process on pause - IMMEDIATELY
            if (listeningRef.current) {
              console.log("🛑 STOPPING RECORDING IMMEDIATELY");
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

  const sendAudioToSarvam = async (audioBlob) => {
    try {
      if (!SARVAM_API_KEY) {
        setError("Sarvam API key missing.");
        console.error("❌ Sarvam API key is missing");
        return;
      }

      console.log("🎙️ Sending audio to Sarvam. Blob size:", audioBlob.size, "Type:", audioBlob.type);
      console.log("🔑 SARVAM_API_KEY present:", !!SARVAM_API_KEY);

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.mp4");
      formData.append("language_code", "en-IN");

      console.log("📤 FormData prepared. Sending to Sarvam API...");

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SARVAM_API_KEY}`,
        },
        body: formData,
      });

      console.log("📥 Sarvam API response status:", response.status);

      const data = await response.json();
      console.log("📦 Sarvam API response data:", data);

      if (!response.ok) {
        const errorMsg = data.error || data.message || JSON.stringify(data);
        console.error("❌ Sarvam API Error:", response.status, errorMsg);
        
        sarvamFailureCount++;
        console.warn(`⚠️ Sarvam failure count: ${sarvamFailureCount}/${SARVAM_FAILURE_THRESHOLD}`);
        
        if (sarvamFailureCount >= SARVAM_FAILURE_THRESHOLD) {
          console.error("🔄 Sarvam API failing repeatedly. Switching to fallback STT...");
          useFallbackAPI = true;
        }
        
        setError(`API Error ${response.status}: ${errorMsg}`);
        // Restart listening on error
        setTimeout(() => {
          console.log("🔄 Restarting listening after Sarvam error...");
          startListening();
        }, 1000);
        return;
      }
      
      // Reset failure count on success
      sarvamFailureCount = 0;

      if (data.transcript) {
        const transcript = data.transcript.toLowerCase().trim();
        console.log("🎤 Transcript:", transcript);

        // Check for wake words
        const wakeWordFound = WAKE_WORDS.some((word) => transcript.includes(word));
        
        // Only require wake word on the FIRST message of the conversation
        // Use ref to track this, not messages.length (which has async issues)
        const isFirstMessage = !firstMessageSentRef.current;

        console.log("📊 First message?", isFirstMessage, "Wake word found?", wakeWordFound);

        if (isFirstMessage) {
          // First message: Accept ANY command (don't require wake word)
          if (transcript && transcript.length > 0) {
            firstMessageSentRef.current = true;  // ← Mark first message as sent
            
            // Remove wake words if present, but don't require them
            let command = transcript;
            for (const word of WAKE_WORDS) {
              const regex = new RegExp(`\\b${word}\\b\\s*`, "i");
              command = command.replace(regex, "").trim();
            }
            
            // If removing wake words left nothing, use original
            if (!command || command.length === 0) {
              command = transcript;
            }

            console.log("✅ First message accepted. Command:", command);
            setRecordedText(command);
            sendMessage(command);
          } else {
            // Empty transcript, restart listening
            console.log("⚠️ Empty transcript on first message, restarting...");
            setListeningMode("idle");
            setTimeout(() => startListening(), 1000);
          }
        } else {
          // Subsequent messages: accept any speech, no wake word needed
          console.log("✅ Conversation already started. Processing transcript as command.");
          
          // Remove wake words if present (for consistency), but don't require them
          let command = transcript;
          for (const word of WAKE_WORDS) {
            const regex = new RegExp(`\\b${word}\\b\\s*`, "i");
            command = command.replace(regex, "").trim();
          }
          
          // If removing wake words left us with nothing, use original
          if (!command || command.length === 0) {
            command = transcript;
          }

          console.log("📤 Sending command:", command);
          setRecordedText(command);
          sendMessage(command);
        }
      } else {
        // Sarvam returned empty transcript - use Web Speech API fallback IMMEDIATELY
        console.log("⚠️ Sarvam returned empty! Using Web Speech API fallback...");
        sarvamFailureCount++;
        
        console.log("🎤 Starting Web Speech API (immediate fallback)...");
        
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = "en-IN";
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onstart = () => {
          console.log("🎤 Web Speech API listening...");
          setListeningMode("continuous");
        };
        
        recognition.onresult = (event) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          console.log("🎤 Web Speech transcript:", transcript);
          if (transcript.trim()) {
            const command = transcript.trim();
            console.log("✅ Web Speech recognized:", command);
            sendMessage(command);
          } else {
            console.log("⚠️ Web Speech empty, restarting...");
            setListeningMode("idle");
            speechStartedRef.current = false;
            pauseTimeoutRef.current = null;
            setTimeout(() => startListening(), 1000);
          }
        };
        
        recognition.onerror = (event) => {
          console.error("❌ Web Speech error:", event.error);
          setListeningMode("idle");
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          setTimeout(() => startListening(), 1500);
        };
        
        recognition.onend = () => {
          console.log("🎤 Web Speech API ended - restarting listening");
          setListeningMode("idle");
          speechStartedRef.current = false;
          pauseTimeoutRef.current = null;
          setTimeout(() => {
            console.log("🔄 Restarting listening after Web Speech API ended");
            startListening();
          }, 1000);
        };
        
        recognition.start();
      }
    } catch (err) {
      setError("Transcription error: " + err.message);
      console.error("❌ Transcription error:", err);
      setListeningMode("idle");
      speechStartedRef.current = false;
      pauseTimeoutRef.current = null;
      setTimeout(() => startListening(), 1500);
    }
  };

  const postJsonToReceiver = async (jsonData) => {
    if (!RECEIVER_API_URL) {
      console.warn("REACT_APP_RECEIVER_API_URL is missing");
      return;
    }

    try {
      const response = await fetch(`${RECEIVER_API_URL}/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonData),
      });

      if (!response.ok) {
        const txt = await response.text();
        console.error("Receiver API error:", response.status, txt);
      }
    } catch (err) {
      console.error("Receiver API network error:", err);
    }
  };

  // Text-to-Speech function using Web Speech API
  const speakText = async (text) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    if (!text || text.trim().length === 0) {
      console.warn("⚠️ No text to speak");
      return;
    }

    console.log("🔊 Speaking text:", text.substring(0, 50) + "...");
    setIsSpeaking(true);

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;  // Normal speed
      utterance.pitch = 1.0;  // Normal pitch
      utterance.volume = 1.0;  // Full volume
      utterance.lang = "en-IN";  // Indian English

      utterance.onstart = () => {
        console.log("🎤 Speaking started");
      };

      utterance.onend = () => {
        console.log("✅ Speaking finished - Auto-resuming listening");
        setIsSpeaking(false);
        
        // AUTO-RESUME LISTENING after Maya finishes speaking
        setListeningMode("idle");
        speechStartedRef.current = false;
        pauseTimeoutRef.current = null;
        
        setTimeout(() => {
          console.log("🔄 Auto-resuming listening for next command");
          startListening();
        }, 500);
      };

      utterance.onerror = (event) => {
        console.error("❌ Speech error:", event.error);
        setIsSpeaking(false);
        
        // Resume listening even on error
        setListeningMode("idle");
        speechStartedRef.current = false;
        pauseTimeoutRef.current = null;
        setTimeout(() => startListening(), 1000);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("❌ Text-to-speech error:", err);
      setIsSpeaking(false);
      
      // Resume listening on error
      setListeningMode("idle");
      speechStartedRef.current = false;
      pauseTimeoutRef.current = null;
      setTimeout(() => startListening(), 1000);
    }
  };

  const sendMessage = async (textToSend = null) => {
    // Use textToSend directly, don't rely on state
    const messageText = textToSend || input;

    if (!messageText || !messageText.trim() || loading) {
      console.warn("⚠️ Message text invalid or already loading:", messageText, loading);
      return;
    }

    console.log("💬 Sending message:", messageText);
    console.log("📊 Current messages count before (from ref):", messagesRef.current.length);
    console.log("📋 Current messages before (from ref):", messagesRef.current);

    const userMessage = { role: "user", content: messageText };
    // IMPORTANT: Use ref to get latest messages, not state!
    const newMessages = [...messagesRef.current, userMessage];
    
    console.log("📝 User message created:", userMessage);
    console.log("📊 New messages array will have:", newMessages.length, "messages");
    console.log("📋 New messages array content:", newMessages);
    
    setMessages(newMessages);
    messagesRef.current = newMessages;  // ← Also update ref immediately
    setInput("");
    setRecordedText("");
    setLoading(true);
    setError("");
    
    console.log("✅ setMessages called with", newMessages.length, "messages");

    try {
      if (!OPENAI_API_KEY) {
        throw new Error("REACT_APP_OPENAI_API_KEY is missing");
      }

      console.log("🚀 Calling OpenAI API with model: gpt-4o-mini");

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

      console.log("📥 OpenAI response status:", response.status);

      const data = await response.json();
      console.log("📦 OpenAI response data:", data);

      if (!response.ok) {
        const errorMsg = data.error?.message || data.message || JSON.stringify(data);
        console.error("❌ OpenAI API Error:", response.status, errorMsg);
        throw new Error(`OpenAI Error ${response.status}: ${errorMsg}`);
      }

      if (!data.choices?.[0]?.message?.content) {
        console.error("❌ No response content from OpenAI:", data);
        throw new Error("No response from OpenAI");
      }

      const raw = data.choices[0].message.content;

      let displayText = raw;
      let jsonData = null;

      try {
        jsonData = JSON.parse(raw);
        displayText = jsonData.reply || raw;
        
        // Make JSON accessible from console window
        window.lastMayaJSON = jsonData;
        
        // Log the JSON in console - VERY VISIBLE
        console.log("\n\n");
        console.log("════════════════════════════════════════");
        console.log("📦 📦 📦 MAYA JSON OUTPUT 📦 📦 📦");
        console.log("════════════════════════════════════════");
        console.log("📋 FORMATTED JSON:");
        console.log(JSON.stringify(jsonData, null, 2));
        console.log("════════════════════════════════════════");
        console.log("🔍 JSON OBJECT (Expandable in console):");
        console.log(jsonData);
        console.log("════════════════════════════════════════");
        console.log("💾 Access from console: window.lastMayaJSON");
        console.log("════════════════════════════════════════\n\n");

        await postJsonToReceiver(jsonData);
      } catch (parseErr) {
        console.error("❌ JSON parse ERROR:", parseErr.message);
        console.error("❌ Raw response:", raw);
        displayText = raw;
      }

      console.log("💭 Adding assistant message to chat:", displayText);
      // Use ref to ensure we have all previous messages
      const allMessages = [...messagesRef.current, { role: "assistant", content: displayText }];
      console.log("📊 Messages before adding assistant:", messagesRef.current.length);
      console.log("📊 Messages after adding assistant:", allMessages.length);
      console.log("📋 Full messages array now:", allMessages);
      
      setMessages(allMessages);
      messagesRef.current = allMessages;  // ← Update ref immediately
      
      // Speak the response text
      console.log("🔊 Calling speakText for Maya's response");
      await speakText(displayText);
    } catch (err) {
      console.error("❌ Maya error:", err);
      console.error("❌ Error details:", err.message);
      const errorMessages = [...messagesRef.current, { role: "assistant", content: "Oops! Something went wrong. Please try again." }];
      setMessages(errorMessages);
      messagesRef.current = errorMessages;
      setError("Error: " + err.message);
    } finally {
      console.log("🔄 Finally block executing...");
      setLoading(false);
      console.log("✅ Loading set to false");
      
      // Clear any pending audio chunks
      audioChunksRef.current = [];
      console.log("🧹 Audio chunks cleared");
      
      // Don't restart listening here - speakText will do it after speech ends
      console.log("⏳ Waiting for speech to end, then auto-resume listening");
    }
  };

  const handleKeyDown = (e) => {
    e.stopPropagation();

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }

    if (e.key === "Backspace") {
      e.stopPropagation();
    }
  };

  const handlePanelKeyDown = (e) => {
    e.stopPropagation();
  };

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
            {isListening ? (
              <span style={styles.statusLive}>
                🔴{" "}
                <span style={{ fontSize: 11 }}>
                  {listeningMode === "idle" && "LISTENING for wake word..."}
                  {listeningMode === "continuous" && "SPEAKING... (pause to send)"}
                  {listeningMode === "paused" && "PROCESSING..."}
                  {listeningMode === "processing" && "THINKING..."}
                </span>
              </span>
            ) : (
              <span style={styles.statusIdle}>
                ⭕ <span style={{ fontSize: 11 }}>Say "Hi Maya" to start</span>
              </span>
            )}
          </div>

          <div style={styles.chatBody}>
            {/* Debug: Check messages state */}
            {messages.length > 0 && console.log(`🔍 RENDER: ${messages.length} messages to display`)}
            
            {/* Always show messages if they exist */}
            {messages.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {messages.map((msg, i) => {
                  // Stable key: use array index only
                  const msgKey = `msg-${i}`;
                  console.log(`🔑 RENDERING msg ${i}/${messages.length}:`, msg.role, msg.content.substring(0, 30));
                  
                  return (
                    <div
                      key={msgKey}
                      style={{
                        display: "flex",
                        justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                        marginBottom: 12,
                        width: "100%",
                        minHeight: "auto",
                      }}
                    >
                      <div style={msg.role === "user" ? styles.userBubble : styles.aiBubble}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
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
              // Show listening animation only if no messages yet
              <div style={styles.listeningContainer}>
                <div style={styles.listeningAnimation}>
                  <span style={styles.listeningDot}></span>
                  <span style={styles.listeningDot}></span>
                  <span style={styles.listeningDot}></span>
                </div>
                <p style={styles.listeningText}>Hi, I'm Maya. I'm listening.</p>
                <p style={styles.statusText}>
                  {listeningMode === "continuous" && "🎤 Keep speaking... (pause to send)"}
                  {listeningMode === "paused" && "⏸️ Processing your request..."}
                  {listeningMode === "processing" && "🤔 Crafting a response..."}
                  {listeningMode === "idle" && "👂 Waiting for 'Hi Maya'..."}
                </p>
                {recordedText && <p style={styles.recordedTextDisplay}>"{recordedText}"</p>}
              </div>
            ) : (
              // Empty state - not listening, no messages
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 20,
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
    borderRadius: 20,
    borderBottomLeftRadius: 4,
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