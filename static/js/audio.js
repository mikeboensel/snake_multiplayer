// Audio system for sound effects
import { settings } from './effects-settings.js';

let audioCtx = null;

// Music player state
let musicElement = null;
let userHasInteracted = false;

function createMusicElement() {
  if (musicElement) return;
  musicElement = new Audio();
  musicElement.preload = 'none';
  musicElement.loop = true;
  musicElement.src = '/static/audio/ClementPanchout_TheSickoGecko.mp3';
}

export function startMusicOnInteraction() {
  const tryPlay = () => {
    userHasInteracted = true;
    if (!settings.sfx.music.enabled) return;
    playMusic();
  };

  // Try immediately (works if user has prior interaction with domain)
  tryPlay();

  // Listen for ANY user interaction
  const events = ['click', 'keydown', 'touchstart', 'mousedown'];
  const handler = () => {
    tryPlay();
    events.forEach(e => document.removeEventListener(e, handler));
  };
  events.forEach(e => document.addEventListener(e, handler, { once: false }));
}

export function playMusic() {
  if (!userHasInteracted) return;
  createMusicElement();
  musicElement.volume = settings.sfx.music.volume * settings.sfx.masterVolume;
  musicElement.play().catch(() => {});
}

export function pauseMusic() {
  if (musicElement) musicElement.pause();
}

export function setMusicVolume(volume) {
  settings.sfx.music.volume = volume;
  if (musicElement) {
    musicElement.volume = volume * settings.sfx.masterVolume;
  }
}

export function updateMusicMasterVolume() {
  if (musicElement) {
    musicElement.volume = settings.sfx.music.volume * settings.sfx.masterVolume;
  }
}

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
