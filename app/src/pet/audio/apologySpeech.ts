const APOLOGY_TEXT = "对不起，我错了";

let voicesReady = false;
let warmupStarted = false;

export function apologyProsodyForLevel(level: number): {
  pitch: number;
  rate: number;
} {
  const safeLevel = Math.min(Math.max(level, 1), 4);
  return {
    pitch: 1 + (safeLevel - 1) * 0.1,
    rate: 0.95 + (safeLevel - 1) * 0.03,
  };
}

function hasChineseVoice(): boolean {
  if (!("speechSynthesis" in window)) return false;
  return window.speechSynthesis
    .getVoices()
    .some((voice) => voice.lang.toLowerCase().startsWith("zh"));
}

export function warmUpApologySpeech(): void {
  if (!("speechSynthesis" in window) || warmupStarted) return;
  warmupStarted = true;
  voicesReady = hasChineseVoice();
  if (voicesReady) return;

  window.speechSynthesis.addEventListener("voiceschanged", () => {
    voicesReady = hasChineseVoice();
  });
}

export function speakApology(level: number): boolean {
  if (!voicesReady || !hasChineseVoice()) return false;

  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();

  const utterance = new SpeechSynthesisUtterance(APOLOGY_TEXT);
  utterance.lang = "zh-CN";
  const { pitch, rate } = apologyProsodyForLevel(level);
  utterance.pitch = pitch;
  utterance.rate = rate;
  synth.speak(utterance);
  return true;
}

export function stopApologySpeech(): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
