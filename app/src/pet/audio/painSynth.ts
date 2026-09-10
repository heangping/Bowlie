import { getContext, getMaster } from "./engine";
import type { Stoppable } from "./pool";

type PainTimbre = {
  wave: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  duration: number;
  filterFrequency: number;
  detune: number;
  volume: number;
};

const PAIN_SOUND_VARIANTS = [
  {
    wave: "triangle",
    startFrequency: 130,
    endFrequency: 95,
    duration: 0.48,
    filterFrequency: 700,
    detune: 6,
    volume: 0.55,
  },
  {
    wave: "sawtooth",
    startFrequency: 165,
    endFrequency: 120,
    duration: 0.36,
    filterFrequency: 1000,
    detune: 10,
    volume: 0.65,
  },
  {
    wave: "sawtooth",
    startFrequency: 205,
    endFrequency: 145,
    duration: 0.28,
    filterFrequency: 1500,
    detune: 16,
    volume: 0.75,
  },
] satisfies PainTimbre[] as readonly PainTimbre[];

export type PainSoundVariant = 0 | 1 | 2;

export function painVariantForLevel(level: number): PainSoundVariant {
  if (level <= 1) return 0;
  if (level === 2) return 1;
  return 2;
}

export function playPainSound(variant: PainSoundVariant): Stoppable {
  const timbre = PAIN_SOUND_VARIANTS[variant];
  const ctx = getContext();
  const master = getMaster();
  const now = ctx.currentTime;

  const soundGain = ctx.createGain();
  soundGain.gain.setValueAtTime(0.0001, now);
  soundGain.gain.exponentialRampToValueAtTime(timbre.volume, now + 0.02);
  soundGain.gain.exponentialRampToValueAtTime(0.0001, now + timbre.duration);
  soundGain.connect(master);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = timbre.filterFrequency;
  filter.Q.value = 1.2;
  filter.connect(soundGain);

  const oscillators = [-timbre.detune, timbre.detune].map((detune) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = timbre.wave;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(timbre.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(timbre.endFrequency, now + timbre.duration);
    oscillator.connect(filter);
    oscillator.start(now);
    oscillator.stop(now + timbre.duration + 0.02);
    return oscillator;
  });

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    const stopAt = ctx.currentTime + 0.04;
    soundGain.gain.cancelScheduledValues(ctx.currentTime);
    soundGain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    for (const oscillator of oscillators) {
      oscillator.stop(stopAt);
    }
    window.setTimeout(() => {
      filter.disconnect();
      soundGain.disconnect();
    }, 100);
  };

  oscillators[oscillators.length - 1].onended = () => {
    filter.disconnect();
    soundGain.disconnect();
  };
  return { stop };
}
