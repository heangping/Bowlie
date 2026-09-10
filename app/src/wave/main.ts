import { startWaveEngine } from "./waveEngine";

const canvas = document.getElementById("wave-canvas");
if (canvas instanceof HTMLCanvasElement) {
  startWaveEngine(canvas);
}
