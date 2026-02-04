// Effect settings management with localStorage persistence
// All settings are client-side only and do not affect other players

export const defaultSettings = {
  // Visual Effects
  particles: {
    enabled: true,
    count: 30,
    velocityMin: 60,
    velocityMax: 140,
    life: 0.4,
    sizeMin: 2,
    sizeMax: 4,
    patterns: ['burst', 'spiral', 'ring', 'sparkle'],
    colorVariation: 0.15,
    angleJitter: 0.5,
  },
  screenShake: {
    enabled: true,
    intensity: 5,
    duration: 0.6,
    triggers: ['eat', 'death', 'collision'],
  },
  areaWarp: {
    enabled: false,
    intensity: 10,
    radius: 100,
    duration: 0.3,
  },
  foodPulse: {
    enabled: true,
    intensity: 0.3,
    speed: 150,
  },
  glow: {
    enabled: true,
    intensity: 1.0,
  },
  avatarSize: {
    scale: 2.5,
    range: [1.0, 3.0],
  },

  // Audio SFX
  sfx: {
    enabled: true,
    masterVolume: 0.5,

    music: {
      enabled: true,
      volume: 0.3,
    },

    eat: {
      enabled: true,
      volume: 0.18,
      pitchStart: 520,
      pitchEnd: 1200,
      duration: 0.15,
      pitchVariation: 0.12,
      durationVariation: 0.1,
      waveforms: ['sine', 'triangle'],
      detuneRange: 10,
    },
    death: {
      enabled: true,
      volume: 0.2,
      pitchStart: 180,
      pitchEnd: 40,
      duration: 0.35,
      pitchVariation: 0.15,
      durationVariation: 0.1,
      waveforms: ['sawtooth', 'square'],
      detuneRange: 15,
    },
  },
};

let settings = loadSettings();

export function loadSettings() {
  try {
    const saved = localStorage.getItem('neonSnake_effects');
    if (saved) {
      const parsed = JSON.parse(saved);
      return deepMerge(defaultSettings, parsed);
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return { ...defaultSettings };
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function saveSettings() {
  try {
    localStorage.setItem('neonSnake_effects', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

export function resetSettings() {
  settings = { ...defaultSettings };
  saveSettings();
}

export { settings };
