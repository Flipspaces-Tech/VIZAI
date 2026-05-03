import { useState, useRef, useEffect } from 'react';
import { MayaQueryEngine } from './MayaQueryEngine';
import { MayaQueryFilter } from './MayaQueryFilter';

// 🎨 IMPORT YOUR CUSTOM ICONS
import idleIcon from '../assets/maya icons/idle.png';
import listeningIcon from '../assets/maya icons/Listening.png';
import thinkingIcon from '../assets/maya icons/Thinking.png';
import talkingIcon from '../assets/maya icons/Talking.png';
import previewingIcon from '../assets/maya icons/Previewing.png';

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

const WAKE_WORDS = ['hi maya', 'hey maya', 'maaya', 'maya', 'mara', 'hi mara'];
const SILENCE_TIMEOUT = 2000;
const NOISE_THRESHOLD = 50;
const SPEECH_CONFIDENCE_THRESHOLD = 0.85;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';
const SARVAM_API_KEY = process.env.REACT_APP_SARVAM_API_KEY || '';
const RECEIVER_API_URL = 'https://maya-receiver-api.onrender.com';

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
      console.warn('⚠️ SARVAM_API_KEY not set');
      callback(null);
      return;
    }

    let fileExtension = 'webm';
    if (audioBlob.type.includes('mp4') || audioBlob.type.includes('aac')) {
      fileExtension = 'mp4';
    } else if (audioBlob.type.includes('mpeg') || audioBlob.type.includes('mp3')) {
      fileExtension = 'mp3';
    } else if (audioBlob.type.includes('wav')) {
      fileExtension = 'wav';
    }

    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${fileExtension}`);
    formData.append('model', 'saaras:v2.5');
    formData.append('language_code', 'en-IN');

    console.log(`📤 Sending audio (${fileExtension}, ${audioBlob.size} bytes) to Sarvam STT...`);

    const response = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
      method: 'POST',
      headers: { 'api-subscription-key': SARVAM_API_KEY },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      sarvamFailureCount++;
      if (response.status === 429) {
        console.warn('⚠️ Sarvam rate limited (429) — backing off 10s');
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.error(`❌ Sarvam STT Error ${response.status}:`, data);
      }
      callback(null);
      return;
    }

    sarvamFailureCount = 0;

    if (data.transcript) {
      const transcript = data.transcript.toLowerCase().trim();
      // ✅ Get confidence score from Sarvam response
      const confidence = data.confidence || 0; // Default to 0 if not provided
      console.log(`✅ STT: "${transcript}" (Confidence: ${(confidence * 100).toFixed(1)}%)`);
      
      // ✅ Pass both transcript and confidence to callback
      callback({ transcript, confidence });
    } else {
      console.warn('⚠️ No transcript in Sarvam response');
      callback(null);
    }
  } catch (err) {
    console.error('❌ STT Error:', err);
    callback(null);
  }
};

const sarvamTTS = async (text, callback) => {
  try {
    if (!SARVAM_API_KEY) {
      console.warn('⚠️ SARVAM_API_KEY not set');
      callback(null);
      return;
    }

    const ttsResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: 'en-IN',
        model: 'bulbul:v3',
        speaker: 'simran',
        pace: 1.0,
        temperature: 0.6,
        audio_quality: 'high',
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
    console.error('TTS Error:', err);
    callback(null);
  }
};

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
    : state === 'processing' || state === 'paused'
    ? 'thinking'
    : state === 'continuous'
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
  } else if (state === 'thinking' || state === 'processing') {  // ✅ Added this
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

export default function MayaChat() {
  const [visible, setVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningMode, setListeningMode] = useState('idle');
  const [recordedText, setRecordedText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

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
  const textInputRef = useRef(null);

  useEffect(() => {
    const keepFocused = () => {
      if (textInputRef.current && document.activeElement !== textInputRef.current) {
        textInputRef.current.focus();
      }
    };
    const interval = setInterval(keepFocused, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const timer = setTimeout(() => {
        const greetingMessage = { role: 'assistant', content: "Hi, I'm Maya. Ready to help with your space!" };
        setMessages([greetingMessage]);
        messagesRef.current = [greetingMessage];
        
        // ✅ Show UI and set to IDLE state
        setIsOpen(true);
        setVisible(true);
        setListeningMode('idle');  // IDLE - waiting for wake word
        
        if (typeof window.sendToUnreal === 'function') {
          const msg = JSON.stringify({msgType: 'getRoomNames'});
          console.log(`MayaChat → Unreal: ${msg}`);
          window.sendToUnreal({msgType: 'getRoomNames'});
        }
        
        // ✅ START WAKE WORD DETECTOR - listens for "hi maya" automatically
        startWakeWordDetector();
        
        if (textInputRef.current) {
          textInputRef.current.focus();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // ✅ SIMPLIFIED: Click button to start listening
  // No need for complex background listening - just click the Maya bubble

  // ✅ SPACE BAR: Also works to toggle listening state

  useEffect(() => {
    const handleSpaceBar = (e) => {
      if (e.code !== 'Space') return;
      if (document.activeElement === textInputRef.current) return;
      
      e.preventDefault();

      // ✅ SPACE toggles listening state
      if (!listeningRef.current) {
        // Not listening → Start listening
        console.log('🎤 SPACE pressed - Starting listening...');
        setIsOpen(true);
        setVisible(true);
        startListening();
      } else {
        // Already listening → Stop listening
        stopListeningImmediately();
      }
    };

    window.addEventListener('keydown', handleSpaceBar);
    return () => window.removeEventListener('keydown', handleSpaceBar);
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
      console.log('⚠️ Wake word detector already initialized');
      return;
    }
    wakeWordInitializedRef.current = true;

    console.log('🚀 Page loaded - Starting wake word detector...');
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
    try {
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'en-IN';
      recognition.continuous = true;  // Keep listening continuously
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase();

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

      recognition.onerror = (error) => {
        console.log('Wake word detector error:', error.error);
      };
      
      recognition.onend = () => {
        // ✅ Clear the ref so a new detector can be created
        recognitionRef.current = null;
        
        // ✅ If not currently listening, restart wake word detector
        if (!listeningRef.current) {
          console.log('🔄 Wake word detector ended, restarting...');
          setTimeout(() => startWakeWordDetector(), 500);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      console.log('🎤 Wake word detector started');
    } catch (err) {
      console.log('Wake word detector error:', err.message);
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
            console.log('📝 Live interim (design): "' + interimTranscript + '"');
            liveTextRef.current = interimTranscript;
            setLiveText(interimTranscript);
          } else {
            // ✅ Don't show: comments, side talk, off-topic interim text
            console.log('⊗ Interim blocked (not design-related): "' + interimTranscript + '"');
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
          const hasSpeech = speechStartedRef.current || blobSize > 30000;

          if (hasSpeech && blobSize > 15000) {
            await sendAudioToSarvam(audioBlob);
          } else {
            setListeningMode('continuous');
            speechStartedRef.current = false;
            setTimeout(() => startListening(), 500);
          }
        } else {
          setListeningMode('continuous');
          speechStartedRef.current = false;
          setTimeout(() => startListening(), 500);
        }
      };

      actualRecorder.onerror = () => {
        stopListeningImmediately();
      };

      actualRecorder.start(100);
      setIsListening(true);
      setListeningMode('continuous');

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
          setListeningMode('continuous');
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
            setListeningMode('paused');
            pauseTimeoutRef.current = true;

            if (listeningRef.current) {
              stopListeningImmediately();
              setListeningMode('processing');
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
      setListeningMode('continuous');
      setTimeout(() => startListening(), 1000);
      return;
    }

    const lowerTranscript = transcript.toLowerCase();
    const originalTranscript = transcript;

    // ✅ CONFIDENCE THRESHOLD: Only process if confidence is above threshold
    const CONFIDENCE_THRESHOLD = 0.75;
    if (confidence < CONFIDENCE_THRESHOLD && confidence > 0) {  // Only check if confidence is provided
      console.log(`⚠️ Low confidence (${(confidence * 100).toFixed(1)}%) - ignoring: "${transcript}"`);
      setListeningMode('continuous');
      setLiveText('');
      setTimeout(() => startListening(), 1000);
      return;
    }

    const hasWakeWord = WAKE_WORDS.some(word => lowerTranscript.includes(word));
    
    // ✅ LOG: Wake word detection
    if (hasWakeWord) {
      console.log('✅ WAKE WORD DETECTED IN TRANSCRIPT: "' + transcript + '" - Processing as command trigger');
    }
    
    // ✅ BLACKLIST: Topics that should NEVER be processed
    const offTopicPatterns = [
      /laptop|computer|phone|charging|battery|tech support|software|program/i,
      /weather|time|date|temperature|season/i,
      /food|eat|recipe|cook|restaurant|dinner|lunch|breakfast/i,
      /sports|game|score|player|match|team|football|cricket/i,
      /movie|film|watch|actor|cinema|series|episode/i,  // ✅ REMOVED "show" - was blocking "show me sofas"
      /music|song|listen|singer|album|concert/i,
      /news|politics|election|government|president|minister/i,
      /travel|flight|hotel|airport|vacation|trip/i,
      /health|medicine|doctor|hospital|sick|disease|covid/i,
      /joke|funny|laugh|comedy|humor/i,
      /what time|what date|what is your name|who are you|how old/i,
      /(?<!maya\s)(?<!mara\s)(?<!maaya\s)(hello|hi|bye|goodbye|thanks|thank you)(?!.*design)/i,
    ];

    const isOffTopic = offTopicPatterns.some(pattern => pattern.test(lowerTranscript));

    // ✅ EXCEPTION: If it has a wake word, DON'T block it even if it matches blacklist
    // "hi maya" won't be blocked because it contains "maya"
    if (isOffTopic && !hasWakeWord) {
      // ✅ NEW: Log as "side talk" / "comment" instead of blocking
      console.log('💬 SIDE TALK (not a command): "' + transcript + '" - High confidence: ' + (confidence * 100).toFixed(1) + '%');
      
      // ✅ Only show in live transcription if confidence is HIGH (80%+)
      // This filters out low-confidence mumbles
      if (confidence >= 0.80) {
        console.log('📝 Transcribed side comment: "' + transcript + '"');
        setRecordedText('[Comment: ' + originalTranscript + ']');
      } else {
        console.log('⚠️ Low confidence side talk ignored: "' + transcript + '"');
      }
      
      setListeningMode('continuous');
      setLiveText('');
      setTimeout(() => startListening(), 1000);
      return;
    }

    // ✅ VALIDATE AGAINST INTENTS (not just keywords)
    const validation = queryEngineRef.current.validateQuery(transcript);
    const isValidIntent = validation && validation.isValid;

    // ✅ NEW: If no wake word AND not a valid intent - treat as side talk/comment
    if (!hasWakeWord && !isValidIntent) {
      console.log('💬 SIDE TALK (no valid intent): "' + transcript + '" - High confidence: ' + (confidence * 100).toFixed(1) + '%');
      
      // ✅ Only show in live transcription if confidence is HIGH (80%+)
      if (confidence >= 0.80) {
        console.log('📝 Transcribed side comment: "' + transcript + '"');
        setRecordedText('[Comment: ' + originalTranscript + ']');
      } else {
        console.log('⚠️ Low confidence side talk ignored: "' + transcript + '"');
      }
      
      setListeningMode('continuous');
      setLiveText('');
      setTimeout(() => startListening(), 1000);
      return;
    }

    if (!isValidIntent) {
      setListeningMode('continuous');
      setLiveText('');
      setTimeout(() => startListening(), 1000);
      return;
    }

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
          // ✅ Pass both transcript and confidence to handleTranscript
          handleTranscript(transcript, confidence);
        } else {
          audioChunksRef.current = [];
          speechStartedRef.current = false;
          setListeningMode('continuous');
          setTimeout(() => startListening(), 1500);
        }
      }
    });
    processSTTQueue();
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
            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onloadedmetadata = () => {
              const words = fullText.split(' ');
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
                setListeningMode('continuous');
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
          setListeningMode('continuous');
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
    setListeningMode('processing');

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
          setListeningMode('continuous');
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
          setListeningMode('continuous');
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

        // ✅ ADDED: Send preview command to Unreal
        if (typeof window.sendToUnreal === 'function') {
          const msg = JSON.stringify({msgType: 'showPreview'});
          console.log(`MayaChat → Unreal: ${msg}`);
          window.sendToUnreal({ msgType: 'showPreview' });
        }

        if (typeof window.sendToUnreal === 'function') {
          const roomKeywords = ['room', 'kitchen', 'bedroom', 'living', 'dining', 'conference', 'go to', 'take me', 'navigate', 'where', 'move to'];
          const isRoomRelated = roomKeywords.some(kw => messageText.toLowerCase().includes(kw)) || jsonData.intent === 'navigate';

          if (isRoomRelated) {
            const msg = JSON.stringify({msgType: 'getRoomNames'});
            console.log(`MayaChat → Unreal: ${msg}`);
            window.sendToUnreal({ msgType: 'getRoomNames' });
          }

          if (jsonData.intent === 'navigate') {
            const roomRaw = jsonData.params?.room;
            
            if (roomRaw) {
              const unrealRoomName = roomRaw
                .split('_')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join('');

              const msg = JSON.stringify({msgType: 'gotoRoom', targetRoom: unrealRoomName});
              console.log(`MayaChat → Unreal: ${msg}`);
              window.sendToUnreal({ msgType: 'gotoRoom', targetRoom: unrealRoomName });
            }
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
      setListeningMode('continuous');
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        sendMessage();
      }
    }
  };

  const handlePanelKeyDown = (e) => e.stopPropagation();

  if (!visible) return null;

  const VISIBLE_MSG_COUNT = 6;
  const visibleMessages = messages.slice(-VISIBLE_MSG_COUNT);
  const totalMessages = messages.length;

  return (
    <>
      <div 
        style={styles.overlayRoot} 
        ref={panelRef} 
        onKeyDown={handlePanelKeyDown}
        onClick={() => textInputRef.current?.focus()}
      >

        <div style={styles.bubbleColumn}>
          {(visibleMessages.length > 0 || liveText || loading) && (
            <div style={styles.bubbleList}>
              {visibleMessages.map((msg, i) => {
                const relativeAge = visibleMessages.length - 1 - i;
                const opacity = Math.max(0.15, 1 - relativeAge * (0.85 / Math.max(VISIBLE_MSG_COUNT - 1, 1)));
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
                    <div style={{ ...styles.userBubble, fontStyle: 'italic', opacity: 0.7 }}>
                      {liveText}
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ ...styles.bubbleRow, justifyContent: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
                    <div style={{...styles.aiBubble, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px'}}>
                      <MayaBubbleIcon state={listeningMode} />
                  
                      {/* 🎨 CUSTOM ICON IN MAYA BUBBLE */}
                      <MayaBubbleIcon state={listeningMode} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} style={{ height: 0 }} />
            </div>
          )}
        </div>

        {input.trim() && (
          <div style={{ ...styles.bubbleRow, justifyContent: 'flex-end' }}>
            <div style={{ ...styles.userBubble, opacity: 0.85 }}>
              {input}
            </div>
          </div>
        )}
      </div>

      <textarea
        ref={textInputRef}
        style={styles.hiddenInput}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        onBlur={() => {
          setTimeout(() => textInputRef.current?.focus(), 0);
        }}
        placeholder="Type your message and press Enter..."
      />

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
              listeningMode === 'processing' || listeningMode === 'paused' ? styles.toggleBtnThinking :
              isListening ? styles.toggleBtnListening : {}),
        }}
      >
        <MayaStateIcon state={listeningMode} isSpeaking={isSpeaking} />
      </button>
    </>
  );
}

const styles = {
  overlayRoot: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
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
    maxWidth: 420,
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
    background: 'rgba(18, 18, 18, 0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#ffffff',
    fontSize: 13.5,
    lineHeight: 1.55,
    wordWrap: 'break-word',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    border: '2px solid rgba(220, 211, 211, 0.75)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
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