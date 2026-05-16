// ============================================================================
// SARVAM SERVICE — Isolated STT + TTS module
// Dev2: You can import and test this independently, or stub it out entirely.
// If REACT_APP_SARVAM_API_KEY is missing or the API is unreachable,
// all callbacks receive null and the caller falls back to text-only mode.
// ============================================================================

const SARVAM_API_KEY = process.env.REACT_APP_SARVAM_API_KEY || '';
// Set REACT_APP_SARVAM_ENABLED=false in .env.local to disable Sarvam on dev (avoids CORS errors).
// Callbacks will receive null and the caller falls back to text-only mode silently.
const SARVAM_ENABLED = process.env.REACT_APP_SARVAM_ENABLED !== 'false';

// const RECEIVER_API_URL = "http://localhost:8080"; // 'https://maya-receiver-api.onrender.com';  //
const RECEIVER_API_URL = "https://maya-receiver-api.onrender.com";


let sarvamFailureCount = 0;

// Separate queues for STT and TTS — they never block each other
export let sttQueue = [];
export let ttsQueue = [];
let isSTTProcessing = false;
let isTTSProcessing = false;

export const processSTTQueue = async () => {
  if (isSTTProcessing || sttQueue.length === 0) return;
  isSTTProcessing = true;
  const { data, callback } = sttQueue.shift();
  try {
    await sarvamSTT(data, callback);
  } catch (err) {}
  isSTTProcessing = false;
  setTimeout(processSTTQueue, 500);
};

export const processTTSQueue = async () => {
  if (isTTSProcessing || ttsQueue.length === 0) return;
  isTTSProcessing = true;
  const { data, callback } = ttsQueue.shift();
  try {
    await sarvamTTS(data, callback);
  } catch (err) {}
  isTTSProcessing = false;
  setTimeout(processTTSQueue, 500);
};

export const sarvamSTT = async (audioBlob, callback) => {
  try {
    if (!SARVAM_API_KEY || !SARVAM_ENABLED) {
      if (!SARVAM_ENABLED) console.info('ℹ️ Sarvam STT disabled (REACT_APP_SARVAM_ENABLED=false)');
      else console.warn('⚠️ SARVAM_API_KEY not set');
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

    const response = await fetch(`${RECEIVER_API_URL}/api/speech-to-text-translate`, {
      method: 'POST',
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
      const confidence = data.confidence || 0;
      console.log(`✅ STT: "${transcript}" (Confidence: ${(confidence * 100).toFixed(1)}%)`);
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

export const sarvamTTS = async (text, callback) => {
  try {
    if (!SARVAM_API_KEY || !SARVAM_ENABLED) {
      if (!SARVAM_ENABLED) console.info('ℹ️ Sarvam TTS disabled (REACT_APP_SARVAM_ENABLED=false)');
      else console.warn('⚠️ SARVAM_API_KEY not set');
      callback(null);
      return;
    }

    const ttsResponse = await fetch(`${RECEIVER_API_URL}/api/text-to-speech`, {
      method: 'POST',
      headers: {
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

    
    if (ttsResponse.status !== 200) {
      console.warn('⚠️ Sarvam ERROR');
      console.warn(ttsResponse.body.error || 'No error message');
      callback(null);
      return;
    }

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
