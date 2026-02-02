// Audio system for sound effects
let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playEatSound() {
  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';
  const t = ac.currentTime;
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.start(t);
  osc.stop(t + 0.15);
}

export function playDeathSound() {
  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sawtooth';
  const t = ac.currentTime;
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.start(t);
  osc.stop(t + 0.35);
  const bufLen = ac.sampleRate * 0.12;
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const noise = ac.createBufferSource();
  const nGain = ac.createGain();
  noise.buffer = buf;
  noise.connect(nGain);
  nGain.connect(ac.destination);
  nGain.gain.setValueAtTime(0.15, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  noise.start(t);
}
