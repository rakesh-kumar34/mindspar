// Game audio + haptics. Everything is synthesized with WebAudio at play time —
// no audio files, nothing to license. The context is created lazily on the
// first user gesture (browsers block audio before one). Mute persists per
// browser; haptics ride along with the sounds on devices that support them.
let ctx = null;
let muted = localStorage.getItem("mindspar-muted") === "1";

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, { type = "sine", gain = 0.07, when = 0, glide = 0 } = {}) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

const buzz = pattern => {
  if (muted) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* unsupported */ }
};

export const sfx = {
  correct() { tone(880, 0.09); tone(1318, 0.13, { when: 0.07 }); buzz(12); },
  wrong() { tone(196, 0.16, { type: "square", gain: 0.045 }); buzz([30, 40, 30]); },
  timeout() { tone(240, 0.25, { glide: 130, gain: 0.05 }); buzz(60); },
  tick() { tone(1050, 0.05, { gain: 0.035 }); },
  count() { tone(660, 0.08, { gain: 0.055 }); },
  go() { tone(990, 0.16, { gain: 0.07 }); buzz(15); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, { when: i * 0.11 })); buzz([20, 30, 20]); },
  lose() { tone(392, 0.18); tone(294, 0.24, { when: 0.16 }); },
  draw() { tone(523, 0.14); tone(523, 0.14, { when: 0.18 }); },
  send() { tone(740, 0.08, { glide: 990 }); },
};

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  localStorage.setItem("mindspar-muted", m ? "1" : "0");
}
