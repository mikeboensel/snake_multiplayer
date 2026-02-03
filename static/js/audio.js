// Audio system for sound effects
import { settings } from './effects-settings.js';

let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function randomVariation(base, variationRange) {
  return base * (1 + (Math.random() * 2 - 1) * variationRange);
}

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function playEatSound() {
  if (!settings.sfx.enabled || !settings.sfx.eat.enabled) return;

  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  const s = settings.sfx;
  const eat = s.eat;

  // Random waveform selection
  const waveforms = eat.waveforms || ['sine'];
  osc.type = randomFromArray(waveforms);

  // Random detune for richer sound
  const detuneRange = eat.detuneRange || 0;
  osc.detune.value = (Math.random() * 2 - 1) * detuneRange;

  const vol = s.masterVolume * eat.volume;
  const t = ac.currentTime;

  // Random pitch variation
  const pitchVar = eat.pitchVariation || 0;
  const pitchStart = randomVariation(eat.pitchStart, pitchVar);
  const pitchEnd = randomVariation(eat.pitchEnd, pitchVar);

  // Random duration variation
  const durVar = eat.durationVariation || 0;
  const duration = randomVariation(eat.duration, durVar);

  osc.frequency.setValueAtTime(pitchStart, t);
  osc.frequency.exponentialRampToValueAtTime(pitchEnd, t + duration);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

export function playDeathSound() {
  if (!settings.sfx.enabled || !settings.sfx.death.enabled) return;

  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  const s = settings.sfx;
  const death = s.death;

  // Random waveform selection
  const waveforms = death.waveforms || ['sawtooth'];
  osc.type = randomFromArray(waveforms);

  // Random detune for variation
  const detuneRange = death.detuneRange || 0;
  osc.detune.value = (Math.random() * 2 - 1) * detuneRange;

  const vol = s.masterVolume * death.volume;
  const t = ac.currentTime;

  // Random pitch variation
  const pitchVar = death.pitchVariation || 0;
  const pitchStart = randomVariation(death.pitchStart, pitchVar);
  const pitchEnd = randomVariation(death.pitchEnd, pitchVar);

  // Random duration variation
  const durVar = death.durationVariation || 0;
  const duration = randomVariation(death.duration, durVar);

  osc.frequency.setValueAtTime(pitchStart, t);
  osc.frequency.exponentialRampToValueAtTime(pitchEnd, t + duration);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);

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
