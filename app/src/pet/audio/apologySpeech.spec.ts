import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ApologySpeechModule = typeof import("./apologySpeech");

let apologySpeech: ApologySpeechModule;
let originalSpeechSynthesis: PropertyDescriptor | undefined;

class TestUtterance {
  text: string;
  lang = "";
  pitch = 1;
  rate = 1;

  constructor(text: string) {
    this.text = text;
  }
}

function mockSpeechSynthesis(options: {
  voices?: Array<{ lang: string }>;
  speaking?: boolean;
  pending?: boolean;
}) {
  const speechSynthesis = {
    getVoices: vi.fn(() => options.voices ?? []),
    speaking: options.speaking ?? false,
    pending: options.pending ?? false,
    cancel: vi.fn(),
    speak: vi.fn(),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", {
    value: speechSynthesis,
    configurable: true,
  });
  return speechSynthesis;
}

beforeEach(async () => {
  vi.resetModules();
  apologySpeech = await import("./apologySpeech");
  originalSpeechSynthesis = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
  vi.stubGlobal("SpeechSynthesisUtterance", TestUtterance);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalSpeechSynthesis) {
    Object.defineProperty(window, "speechSynthesis", originalSpeechSynthesis);
  } else {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  }
  vi.restoreAllMocks();
});

describe("apology speech", () => {
  it("increases pitch and rate with pressure", () => {
    expect(apologySpeech.apologyProsodyForLevel(1)).toEqual({ pitch: 1, rate: 0.95 });
    expect(apologySpeech.apologyProsodyForLevel(4)).toEqual({ pitch: 1.3, rate: 1.04 });
  });

  it("clamps pressure outside the valid range", () => {
    expect(apologySpeech.apologyProsodyForLevel(0)).toEqual(apologySpeech.apologyProsodyForLevel(1));
    expect(apologySpeech.apologyProsodyForLevel(99)).toEqual(apologySpeech.apologyProsodyForLevel(4));
  });

  it("falls back when no Chinese voice is available", () => {
    mockSpeechSynthesis({ voices: [{ lang: "en-US" }] });
    apologySpeech.warmUpApologySpeech();

    expect(apologySpeech.speakApology(1)).toBe(false);
  });

  it("speaks the apology with a Chinese voice", () => {
    const speechSynthesis = mockSpeechSynthesis({ voices: [{ lang: "zh-CN" }] });
    apologySpeech.warmUpApologySpeech();

    expect(apologySpeech.speakApology(2)).toBe(true);
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
    const utterance = speechSynthesis.speak.mock.calls[0][0] as TestUtterance;
    expect(utterance.text).toBe("对不起，我错了");
    expect(utterance.lang).toBe("zh-CN");
    expect(utterance.pitch).toBeCloseTo(1.1);
    expect(utterance.rate).toBeCloseTo(0.98);
  });

  it("cancels an active apology before speaking again", () => {
    const speechSynthesis = mockSpeechSynthesis({
      voices: [{ lang: "zh-CN" }],
      speaking: true,
    });
    apologySpeech.warmUpApologySpeech();

    apologySpeech.speakApology(3);

    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
});
