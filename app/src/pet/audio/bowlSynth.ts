import { getContext, getMaster } from "./engine";
import type { Stoppable } from "./pool";

type PartialTimbre = {
  ratio: number;
  amplitude: number;
};

type BowlTimbre = {
  frequency: number;
  duration: number;
  partials: PartialTimbre[];
};

const BOWL_SOUND_VARIANTS = [
  {
    frequency: 174,
    duration: 2.0,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.71, amplitude: 0.38 },
      { ratio: 4.47, amplitude: 0.18 },
      { ratio: 6.63, amplitude: 0.08 },
    ],
  },
  {
    frequency: 191,
    duration: 2.3,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.68, amplitude: 0.34 },
      { ratio: 4.53, amplitude: 0.16 },
      { ratio: 6.71, amplitude: 0.07 },
    ],
  },
  {
    frequency: 208,
    duration: 2.6,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.74, amplitude: 0.36 },
      { ratio: 4.41, amplitude: 0.19 },
      { ratio: 6.59, amplitude: 0.09 },
    ],
  },
] satisfies BowlTimbre[] as readonly BowlTimbre[];

export type BowlSoundVariant = 0 | 1 | 2;

export function playBowlSound(variant: BowlSoundVariant): Stoppable {
  const timbre = BOWL_SOUND_VARIANTS[variant];
  const ctx = getContext();
  const master = getMaster();
  const now = ctx.currentTime;

  const soundGain = ctx.createGain();
  soundGain.gain.setValueAtTime(0.0001, now);
  soundGain.gain.exponentialRampToValueAtTime(1, now + 0.005);
  soundGain.gain.exponentialRampToValueAtTime(0.0001, now + timbre.duration);
  soundGain.connect(master);

  const totalAmplitude = timbre.partials.reduce((sum, partial) => sum + partial.amplitude, 0);
  const oscillators = timbre.partials.map(({ ratio, amplitude }) => {
    const oscillator = ctx.createOscillator();
    const partialGain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = timbre.frequency * ratio;
    partialGain.gain.value = amplitude / totalAmplitude;
    oscillator.connect(partialGain).connect(soundGain);
    oscillator.start(now);
    oscillator.stop(now + timbre.duration + 0.05);
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
    window.setTimeout(() => soundGain.disconnect(), 100);
  };

  oscillators[oscillators.length - 1].onended = () => soundGain.disconnect();
  return { stop };
}
