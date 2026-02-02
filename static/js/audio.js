// Audio system for sound effects
import { settings } from './effects-settings.js';

let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playEatSound() {
  if (!settings.sfx.enabled || !settings.sfx.eat.enabled) return;

  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';

  const s = settings.sfx;
  const vol = s.masterVolume * s.eat.volume;
  const t = ac.currentTime;

  osc.frequency.setValueAtTime(s.eat.pitchStart, t);
  osc.frequency.exponentialRampToValueAtTime(s.eat.pitchEnd, t + s.eat.duration);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + s.eat.duration);
  osc.start(t);
  osc.stop(t + s.eat.duration);
}

export function playDeathSound() {
  if (!settings.sfx.enabled || !settings.sfx.death.enabled) return;

  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sawtooth';

  const s = settings.sfx;
  const vol = s.masterVolume * s.death.volume;
  const t = ac.currentTime;

  osc.frequency.setValueAtTime(s.death.pitchStart, t);
  osc.frequency.exponentialRampToValueAtTime(s.death.pitchEnd, t + s.death.duration);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + s.death.duration);
  osc.start(t);
  osc.stop(t + s.death.duration);

  const bufLen = ac.sampleRate * 0.12;
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const noise = ac.createBufferSource();
  const nGain = ac.createGain();
  noise.buffer = buf;
  noise.connect(nGain);
  nGain.connect(ac.destination);
  nGain.gain.setValueAtTime(vol * 0.75, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  noise.start(t);
}

export function triggerDeathScreenShake() {
  // Will be called from networking when player dies
  // Import triggerScreenShake from rendering.js
  import('./rendering.js').then(({ triggerScreenShake }) => {
    if (settings.screenShake.enabled && settings.screenShake.triggers.includes('death')) {
      triggerScreenShake(2);
    }
  });
}
