// Generate call sounds using Web Audio API
const audioCtx = () => new (window.AudioContext || (window as any).webkitAudioContext)();

let activeOscillators: OscillatorNode[] = [];
let activeCtx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;

export function playRingtone() {
  stopAllSounds();
  const ctx = audioCtx();
  activeCtx = ctx;

  const playRingBurst = () => {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.value = 440;
    osc2.type = "sine";
    osc2.frequency.value = 480;
    gain.gain.value = 0.15;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.8);
    osc2.stop(ctx.currentTime + 0.8);
    activeOscillators.push(osc1, osc2);
  };

  playRingBurst();
  ringInterval = setInterval(playRingBurst, 2000);
}

export function playDialTone() {
  stopAllSounds();
  const ctx = audioCtx();
  activeCtx = ctx;

  const playBeep = () => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 425;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    activeOscillators.push(osc);
  };

  playBeep();
  ringInterval = setInterval(playBeep, 3000);
}

export function playCallEnd() {
  stopAllSounds();
  const ctx = audioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 480;
  gain.gain.value = 0.12;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.stop(ctx.currentTime + 0.8);
}

export function stopAllSounds() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  activeOscillators.forEach((o) => {
    try { o.stop(); } catch {}
  });
  activeOscillators = [];
  if (activeCtx) {
    try { activeCtx.close(); } catch {}
    activeCtx = null;
  }
}
