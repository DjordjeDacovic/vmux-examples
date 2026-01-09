import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_SETTINGS = {
  model: 'spectrum',
  amplitude: 2.2,
  wavelength: 3.2,
  speed: 0.6,
  steepness: 0.75,
  components: 12,
  minWavelength: 0.8,
  maxWavelength: 5.5,
  windDir: 20,
  spread: 120,
  seed: 1337,
  basinModes: 28,
  basinDepth: 2.2,
  basinEdge: 'free',
  crestWidth: 0.8,
  curl: 0.7,
  ripple: 0.12,
  colorMode: 'mono',
  hue: 200,
  hueRange: 120,
  saturation: 70,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const smoothstep = (edge0, edge1, x) => {
  if (edge0 === edge1) {
    return 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const mod = (value, period) => {
  if (!period) {
    return 0;
  }
  let x = value % period;
  if (x < 0) {
    x += period;
  }
  return x;
};

const wrapSigned = (value, period) => mod(value + period / 2, period) - period / 2;

const reflectCoord = (value, half) => {
  const L = half * 2;
  const period = L * 2;
  let x = value + half;
  x = ((x % period) + period) % period;
  if (x > L) {
    x = period - x;
  }
  return x - half;
};

const sampleBilinear = (field, n, half, x, z) => {
  const L = half * 2;
  const fx = clamp(((x + half) / L) * (n - 1), 0, n - 1);
  const fz = clamp(((z + half) / L) * (n - 1), 0, n - 1);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, n - 1);
  const z1 = Math.min(z0 + 1, n - 1);
  const tx = fx - x0;
  const tz = fz - z0;

  const i00 = z0 * n + x0;
  const i10 = z0 * n + x1;
  const i01 = z1 * n + x0;
  const i11 = z1 * n + x1;

  const a = field[i00] * (1 - tx) + field[i10] * tx;
  const b = field[i01] * (1 - tx) + field[i11] * tx;
  return a * (1 - tz) + b * tz;
};

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const getRoute = () =>
  window.location.hash === '#/settings' ? 'settings' : 'wave';

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [route, setRoute] = useState(() =>
    typeof window === 'undefined' ? 'wave' : getRoute(),
  );

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openSettings = () => {
    window.location.hash = '#/settings';
  };

  const openWave = () => {
    window.location.hash = '#/';
  };

  if (route === 'settings') {
    return (
      <SettingsView
        settings={settings}
        setSettings={setSettings}
        onBack={openWave}
      />
    );
  }

  return (
    <WaveView
      settings={settings}
      setSettings={setSettings}
      onOpenSettings={openSettings}
    />
  );
}

function WaveView({ settings, setSettings, onOpenSettings }) {
  const [t, setT] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [fps, setFps] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight,
  }));
  const [, bumpMetrics] = useState(0);
  const preRef = useRef(null);
  const containerRef = useRef(null);
  const wheelRef = useRef({ x: 0, y: 0, raf: 0 });
  const fpsRef = useRef({ lastTime: 0, smoothed: 0, lastReport: 0 });
  const metricsRef = useRef({ charWidth: 6, lineHeight: 9 });
  const buffersRef = useRef({
    size: 0,
    zBuf: new Float32Array(0),
    lum: new Float32Array(0),
    heightBuf: new Float32Array(0),
  });
  const basinSimRef = useRef(null);

  const FONT_FAMILY = 'SF Mono, Menlo, monospace';
  const FONT_SIZE_PX = 9;
  const LINE_HEIGHT_PX = 9;

  const baseW = 90;
  const baseH = 32;
  const maxW = 240;
  const maxH = 120;

  const charWidth = metricsRef.current.charWidth || 6;
  const lineHeight = metricsRef.current.lineHeight || LINE_HEIGHT_PX;

  const W = isFull
    ? Math.floor(clamp((viewport.w * 0.98) / charWidth, baseW, maxW))
    : baseW;
  const H = isFull
    ? Math.floor(clamp((viewport.h * 0.98) / lineHeight, baseH, maxH))
    : baseH;
  const PW = W * 2;
  const PH = H * 4;
  const bufSize = PW * PH;

  const buffers = buffersRef.current;
  if (buffers.size < bufSize) {
    buffers.size = bufSize;
    buffers.zBuf = new Float32Array(bufSize);
    buffers.lum = new Float32Array(bufSize);
    buffers.heightBuf = new Float32Array(bufSize);
  }

  const zBuf = buffers.zBuf;
  const lum = buffers.lum;
  const heightBuf = buffers.heightBuf;

  zBuf.fill(0, 0, bufSize);
  lum.fill(0, 0, bufSize);
  heightBuf.fill(0, 0, bufSize);

  useEffect(() => {
    const interval = setInterval(() => {
      setT((prev) => prev + 0.045);
    }, 45);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const now = performance.now();
    if (!fpsRef.current.lastTime) {
      fpsRef.current.lastTime = now;
      return;
    }

    const dt = now - fpsRef.current.lastTime;
    fpsRef.current.lastTime = now;

    const inst = dt > 0 ? 1000 / dt : 0;
    fpsRef.current.smoothed = fpsRef.current.smoothed
      ? fpsRef.current.smoothed * 0.9 + inst * 0.1
      : inst;

    if (now - fpsRef.current.lastReport > 250) {
      fpsRef.current.lastReport = now;
      setFps(Math.round(fpsRef.current.smoothed));
    }
  }, [t]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        setIsFull((prev) => !prev);
      }
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        onOpenSettings();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenSettings]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const probe = document.createElement('span');
    probe.textContent = '⣿'.repeat(16);
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = FONT_FAMILY;
    probe.style.fontSize = `${FONT_SIZE_PX}px`;
    probe.style.lineHeight = `${LINE_HEIGHT_PX}px`;

    node.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();

    const nextCharWidth = rect.width ? rect.width / 16 : metricsRef.current.charWidth;
    const nextLineHeight = rect.height || LINE_HEIGHT_PX;
    if (nextCharWidth && nextLineHeight) {
      metricsRef.current = { charWidth: nextCharWidth, lineHeight: nextLineHeight };
      bumpMetrics((prev) => prev + 1);
    }
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const applyWheel = () => {
      wheelRef.current.raf = 0;
      const dx = wheelRef.current.x;
      const dy = wheelRef.current.y;
      wheelRef.current.x = 0;
      wheelRef.current.y = 0;

      if (!dx && !dy) {
        return;
      }

      setSettings((prev) => {
        const next = { ...prev };

        if (dy) {
          next.speed = clamp(prev.speed + dy * 0.0015, 0.05, 2.5);
        }

        if (dx) {
          const wind = (prev.windDir ?? 0) + dx * 0.1;
          next.windDir = ((wind % 360) + 360) % 360;
        }

        return next;
      });
    };

    const onWheel = (event) => {
      event.preventDefault();
      const modeScale =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;

      wheelRef.current.x += event.deltaX * modeScale;
      wheelRef.current.y += event.deltaY * modeScale;

      if (!wheelRef.current.raf) {
        wheelRef.current.raf = requestAnimationFrame(applyWheel);
      }
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      if (wheelRef.current.raf) {
        cancelAnimationFrame(wheelRef.current.raf);
        wheelRef.current.raf = 0;
      }
    };
  }, [setSettings]);
  const sampleStep = clamp(
    0.05 * Math.sqrt((baseW * 2) / Math.max(1, PW)),
    0.03,
    0.07,
  );

  const spectrum = useMemo(() => {
    if (settings.model !== 'spectrum') {
      return null;
    }

    const count = Math.round(clamp(settings.components, 1, 24));
    const minWL = clamp(settings.minWavelength, 0.4, 12);
    const maxWL = clamp(settings.maxWavelength, minWL + 0.2, 12);
    const spread = clamp(settings.spread, 0, 180) * (Math.PI / 180);
    const rand = mulberry32(Math.floor(settings.seed || 1));
    const g = 9.81;

    const waves = [];
    for (let i = 0; i < count; i++) {
      const lambda = minWL * Math.pow(maxWL / minWL, rand());
      const k = (Math.PI * 2) / lambda;
      const w = Math.sqrt(g * k);
      const angleOffset = (rand() - 0.5) * spread * 2;
      const dirX0 = Math.cos(angleOffset);
      const dirZ0 = Math.sin(angleOffset);
      const weight = (0.3 + 0.7 * rand()) * Math.pow(lambda / maxWL, 1.25);
      const phase = rand() * Math.PI * 2;
      waves.push({ dirX0, dirZ0, k, w, weight, phase });
    }

    let sum = 0;
    for (const wave of waves) {
      sum += wave.weight;
    }
    const norm = sum || 1;
    for (const wave of waves) {
      wave.weight /= norm;
    }
    return waves;
  }, [
    settings.components,
    settings.maxWavelength,
    settings.minWavelength,
    settings.model,
    settings.seed,
    settings.spread,
  ]);

  const orientedSpectrum = useMemo(() => {
    if (!spectrum || spectrum.length === 0) {
      return spectrum;
    }

    const wind = ((settings.windDir % 360) * Math.PI) / 180;
    const c = Math.cos(wind);
    const s = Math.sin(wind);

    return spectrum.map((wave) => ({
      ...wave,
      dirX: wave.dirX0 * c - wave.dirZ0 * s,
      dirZ: wave.dirX0 * s + wave.dirZ0 * c,
    }));
  }, [spectrum, settings.windDir]);

  if (settings.model === 'basin') {
    const n = 96;
    const half = 3.5;
    const edge = settings.basinEdge === 'fixed' ? 'fixed' : 'free';
    const seed = Math.floor(settings.seed || 1);
    const depthBase = clamp(settings.basinDepth, 0.2, 10);
    const key = `${n}|${half}|${edge}|${seed}|${depthBase.toFixed(2)}`;

    if (!basinSimRef.current || basinSimRef.current.key !== key) {
      const size = n * n;
      const prev = new Float32Array(size);
      const curr = new Float32Array(size);
      const next = new Float32Array(size);
      const c2 = new Float32Array(size);
      const solid = new Uint8Array(size);
      const L = half * 2;
      const dx = L / (n - 1);
      const rand = mulberry32(seed);
      const paddleProfile = new Float32Array(n);

      for (let j = 0; j < n; j++) {
        const s = j / (n - 1);
        paddleProfile[j] = Math.pow(Math.sin(Math.PI * s), 2);
      }

      let maxC = 0;
      for (let j = 0; j < n; j++) {
        const z = (j / (n - 1) - 0.5) * L;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1) - 0.5) * L;
          const r = clamp(Math.hypot(x, z) / half, 0, 1);
          const bowl = 0.35 + 0.65 * (1 - r * r);
          const sandbar =
            1 -
            0.12 *
              Math.exp(-((x + 1.1) * (x + 1.1) + (z - 0.9) * (z - 0.9)) / 0.8) -
            0.09 *
              Math.exp(-((x - 1.4) * (x - 1.4) + (z + 1.0) * (z + 1.0)) / 1.1);

          const h = clamp(depthBase * bowl * sandbar, 0.15, 12);
          const c = Math.sqrt(h);
          const idx = j * n + i;
          c2[idx] = h;
          if (c > maxC) {
            maxC = c;
          }
        }
      }

      basinSimRef.current = {
        key,
        n,
        half,
        dx,
        prev,
        curr,
        next,
        c2,
        solid,
        edge,
        time: 0,
        rand,
        paddleProfile,
        maxC,
      };

      const impulseCount = 6;
      for (let k = 0; k < impulseCount; k++) {
        const i0 = Math.floor(n * (0.25 + 0.5 * rand()));
        const j0 = Math.floor(n * (0.25 + 0.5 * rand()));
        const idx = j0 * n + i0;
        curr[idx] = 0.5 * (0.4 + 0.6 * rand());
        prev[idx] = -curr[idx] * 0.6;
      }
    }

    const sim = basinSimRef.current;
    sim.edge = edge;

    const dtWanted = 0.045 * clamp(settings.speed, 0.05, 2.5);
    const dtMax = (0.65 * sim.dx) / Math.max(0.01, sim.maxC);
    const subSteps = Math.max(1, Math.min(10, Math.ceil(dtWanted / dtMax)));
    const dt = dtWanted / subSteps;
    const dt2 = dt * dt;
    const gamma = 0.85;

    const forcing = clamp(settings.basinModes / 48, 0, 1);
    const dropRate = 1.5 + forcing * 10.5;
    const dropMag = 0.6 + forcing * 1.8;
    const paddleMag = 0.7 + forcing * 0.7;

    for (let step = 0; step < subSteps; step++) {
      sim.time += dt;
      const gdt = gamma * dt;
      const n0 = sim.n;
      const size0 = n0 * n0;
      const factor = dt2 / (sim.dx * sim.dx);

      for (let idx = 0; idx < size0; idx++) {
        sim.next[idx] = 0;
      }

      for (let j = 0; j < n0; j++) {
        const row = j * n0;
        const isTop = j === 0;
        const isBottom = j === n0 - 1;
        for (let i = 0; i < n0; i++) {
          const idx = row + i;
          if (sim.solid[idx]) {
            sim.next[idx] = 0;
            continue;
          }

          const center = sim.curr[idx];

          const leftIdx = i > 0 ? idx - 1 : -1;
          const rightIdx = i < n0 - 1 ? idx + 1 : -1;
          const downIdx = !isTop ? idx - n0 : -1;
          const upIdx = !isBottom ? idx + n0 : -1;

          const edgeValue = sim.edge === 'fixed' ? 0 : center;

          const left =
            leftIdx >= 0 && !sim.solid[leftIdx] ? sim.curr[leftIdx] : edgeValue;
          const right =
            rightIdx >= 0 && !sim.solid[rightIdx] ? sim.curr[rightIdx] : edgeValue;
          const down =
            downIdx >= 0 && !sim.solid[downIdx] ? sim.curr[downIdx] : edgeValue;
          const up =
            upIdx >= 0 && !sim.solid[upIdx] ? sim.curr[upIdx] : edgeValue;

          const lap = left + right + down + up - 4 * center;

          sim.next[idx] =
            (2 - gdt) * center -
            (1 - gdt) * sim.prev[idx] +
            sim.c2[idx] * factor * lap;
        }
      }

      const omega0 = 1.8;
      const omega1 = 2.3;
      const zCenter = Math.sin(sim.time * 0.22) * 1.6;
      const sigmaZ = 1.3;
      const drive =
        (Math.sin(sim.time * omega0) * 0.85 +
          Math.sin(sim.time * omega1 + 1.4) * 0.45) *
        paddleMag;

      const iPaddle = 1;
      for (let j = 0; j < n0; j++) {
        const z = (j / (n0 - 1) - 0.5) * half * 2;
        const envelope = Math.exp(-((z - zCenter) * (z - zCenter)) / (2 * sigmaZ * sigmaZ));
        const idx = j * n0 + iPaddle;
        sim.next[idx] += drive * sim.paddleProfile[j] * envelope * dt2;
      }

      const expected = dropRate * dt;
      let drops = Math.floor(expected);
      if (sim.rand() < expected - drops) {
        drops += 1;
      }

      for (let d = 0; d < drops; d++) {
        const i = 2 + Math.floor(sim.rand() * (n0 - 4));
        const j = 2 + Math.floor(sim.rand() * (n0 - 4));
        const idx = j * n0 + i;
        const impulse = dropMag * (0.6 + 0.4 * sim.rand());

        sim.next[idx] += impulse;
        sim.next[idx - 1] += impulse * 0.45;
        sim.next[idx + 1] += impulse * 0.45;
        sim.next[idx - n0] += impulse * 0.45;
        sim.next[idx + n0] += impulse * 0.45;
        sim.next[idx - n0 - 1] += impulse * 0.22;
        sim.next[idx - n0 + 1] += impulse * 0.22;
        sim.next[idx + n0 - 1] += impulse * 0.22;
        sim.next[idx + n0 + 1] += impulse * 0.22;
      }

      if (sim.edge === 'fixed') {
        for (let i = 0; i < n0; i++) {
          sim.next[i] = 0;
          sim.next[(n0 - 1) * n0 + i] = 0;
        }
        for (let j = 0; j < n0; j++) {
          sim.next[j * n0] = 0;
          sim.next[j * n0 + (n0 - 1)] = 0;
        }
      }

      let meanSum = 0;
      let meanCount = 0;
      for (let idx = 0; idx < size0; idx++) {
        if (sim.solid[idx]) {
          continue;
        }
        meanSum += sim.next[idx];
        meanCount += 1;
      }
      const mean = meanCount ? meanSum / meanCount : 0;
      if (mean) {
        for (let idx = 0; idx < size0; idx++) {
          if (sim.solid[idx]) {
            continue;
          }
          sim.next[idx] -= mean;
        }

        if (sim.edge === 'fixed') {
          for (let i = 0; i < n0; i++) {
            sim.next[i] = 0;
            sim.next[(n0 - 1) * n0 + i] = 0;
          }
          for (let j = 0; j < n0; j++) {
            sim.next[j * n0] = 0;
            sim.next[j * n0 + (n0 - 1)] = 0;
          }
        }
      }

      const swap = sim.prev;
      sim.prev = sim.curr;
      sim.curr = sim.next;
      sim.next = swap;
    }
  }

  const amp = Math.max(0.001, settings.amplitude);
  const k = (Math.PI * 2) / Math.max(0.5, settings.wavelength);

  const tsunami = (() => {
    if (settings.model !== 'tsunami') {
      return null;
    }

    const wind = ((settings.windDir % 360) * Math.PI) / 180;
    const dirX = Math.cos(wind);
    const dirZ = Math.sin(wind);
    const absSum = Math.max(0.25, Math.abs(dirX) + Math.abs(dirZ));
    const half = 3.5;
    const period = 2 * half * absSum;
    const time = t * settings.speed;
    const center = wrapSigned(0.55 - time * 1.35, period);

    const crestWidth = clamp(settings.crestWidth, 0.3, 1.6);
    const curl = clamp(settings.curl, 0, 1.4);
    const ripple = clamp(settings.ripple, 0, 0.4);

    const y = (uu, vv) => {
      const s = dirX * uu + dirZ * vv;
      const q = -dirZ * uu + dirX * vv;
      const d = wrapSigned(s - center, period);

      const cw = crestWidth * 1.1;
      const crest = amp * Math.exp(-(d * d) * cw);
      const drawdown =
        -amp * 0.62 * Math.exp(-((d + 1.45) * (d + 1.45)) * cw * 0.55);

      const curlFactor = Math.max(0, crest - amp * 0.52);
      const curlTerm =
        Math.sin((s + time) * 2.6 + 0.5) * curlFactor * curl;

      const wakeGate = smoothstep(0.0, 2.8, d);
      const wakeTerm =
        Math.sin(s * 1.55 + time * 2.0) *
        (0.22 + 0.08 * curl) *
        wakeGate *
        Math.exp(-(d * d) * 0.22);

      const crestMask = 1 - clamp(crest / (amp * 1.1), 0, 1);
      const rippleTerm =
        Math.sin(q * 2.45 + time * 1.65) * ripple * crestMask;

      const texture =
        (Math.sin(uu * 5 + vv * 3 + time * 2) +
          Math.sin(uu * 7 - vv * 4 + time * 2.8) * 0.6) *
        0.04;

      return crest + drawdown + curlTerm + wakeTerm + rippleTerm + texture;
    };

    const baselineCoords = [-3, -1, 1, 3];
    let baselineSum = 0;
    for (const uu of baselineCoords) {
      for (const vv of baselineCoords) {
        baselineSum += y(uu, vv);
      }
    }
    const baseline = baselineSum / (baselineCoords.length * baselineCoords.length);

    return { dirX, dirZ, half, period, time, center, y, baseline };
  })();

  const sampleWave = (u, v) => {
    const light = { x: 0.3, y: 1, z: -0.4 };

    if (settings.model === 'basin' && basinSimRef.current) {
      const sim = basinSimRef.current;
      const eps = 0.055;
      const y0 = sampleBilinear(sim.curr, sim.n, sim.half, u, v);
      const y = y0 * amp;
      const hu = sampleBilinear(sim.curr, sim.n, sim.half, u + eps, v) * amp;
      const hv = sampleBilinear(sim.curr, sim.n, sim.half, u, v + eps) * amp;
      const dx = (hu - y) / eps;
      const dz = (hv - y) / eps;

      const nx = -dx;
      const ny = 1;
      const nz = -dz;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const L = (nx * light.x + ny * light.y + nz * light.z) / nl;

      const slope = Math.hypot(dx, dz);
      const foam = clamp((slope - 0.75) * 0.28, 0, 0.32);
      const lumOut = Math.max(0, Math.min(1, L * 0.6 + foam + 0.08));

      return { x: u, y, z: v, lum: lumOut };
    }

    if (
      settings.model === 'spectrum' &&
      orientedSpectrum &&
      orientedSpectrum.length > 0
    ) {
      let x0 = u;
      let z0 = v;
      let x = x0;
      let z = z0;
      let y = 0;

      let dx_dx0 = 1;
      let dx_dz0 = 0;
      let dz_dx0 = 0;
      let dz_dz0 = 1;
      let dy_dx0 = 0;
      let dy_dz0 = 0;

      for (const wave of orientedSpectrum) {
        const A = amp * wave.weight;
        const phase =
          wave.k * (wave.dirX * x0 + wave.dirZ * z0) -
          wave.w * t * settings.speed +
          wave.phase;
        const sinP = Math.sin(phase);
        const cosP = Math.cos(phase);

        y += A * sinP;

        const QA = (settings.steepness * wave.weight) / wave.k;
        x += wave.dirX * QA * cosP;
        z += wave.dirZ * QA * cosP;

        const common = QA * wave.k * sinP;
        dx_dx0 -= common * wave.dirX * wave.dirX;
        dx_dz0 -= common * wave.dirX * wave.dirZ;
        dz_dx0 -= common * wave.dirZ * wave.dirX;
        dz_dz0 -= common * wave.dirZ * wave.dirZ;

        const dyCommon = A * wave.k * cosP;
        dy_dx0 += dyCommon * wave.dirX;
        dy_dz0 += dyCommon * wave.dirZ;
      }

      const jac = dx_dx0 * dz_dz0 - dx_dz0 * dz_dx0;
      const breakness = clamp((0.55 - jac) * 2.2, 0, 1);
      const crestness = clamp(y / (amp * 0.85), 0, 1);
      const foam = breakness * crestness * 0.35;

      const nx = dy_dz0 * dz_dx0 - dz_dz0 * dy_dx0;
      const ny = dz_dz0 * dx_dx0 - dx_dz0 * dz_dx0;
      const nz = dx_dz0 * dy_dx0 - dy_dz0 * dx_dx0;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const nxf = nx / nl;
      const nyf = ny / nl;
      const nzf = nz / nl;
      const L = nxf * light.x + nyf * light.y + nzf * light.z;
      const lumOut = Math.max(0, Math.min(1, L * 0.6 + foam + 0.08));

      return { x, y, z, lum: lumOut };
    }

    if (settings.model === 'trochoidal') {
      const g = 9.81;
      const w = Math.sqrt(g * k);
      const wind = ((settings.windDir % 360) * Math.PI) / 180;
      const dirX = Math.cos(wind);
      const dirZ = Math.sin(wind);
      const phase = k * (dirX * u + dirZ * v) - w * t * settings.speed;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);

      const QA = settings.steepness / k;
      const x = u + dirX * QA * cosP;
      const z = v + dirZ * QA * cosP;
      const y = amp * sinP;

      const steepSin = settings.steepness * sinP;
      const dx_dx0 = 1 - steepSin * dirX * dirX;
      const dx_dz0 = -steepSin * dirX * dirZ;
      const dz_dx0 = -steepSin * dirZ * dirX;
      const dz_dz0 = 1 - steepSin * dirZ * dirZ;
      const dy_dx0 = amp * k * cosP * dirX;
      const dy_dz0 = amp * k * cosP * dirZ;
      const jac = dx_dx0 * dz_dz0 - dx_dz0 * dz_dx0;
      const foam =
        clamp((0.55 - jac) * 2.2, 0, 1) * clamp(y / (amp * 0.85), 0, 1) * 0.3;

      const nx = dy_dz0 * dz_dx0 - dz_dz0 * dy_dx0;
      const ny = dz_dz0 * dx_dx0 - dx_dz0 * dz_dx0;
      const nz = dx_dz0 * dy_dx0 - dy_dz0 * dx_dx0;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const nxf = nx / nl;
      const nyf = ny / nl;
      const nzf = nz / nl;
      const L = nxf * light.x + nyf * light.y + nzf * light.z;
      const lumOut = Math.max(0, Math.min(1, L * 0.6 + foam + 0.08));

      return { x, y, z, lum: lumOut };
    }

    if (settings.model === 'tsunami' && tsunami) {
      const y = tsunami.y(u, v) - tsunami.baseline;
      const eps = 0.05;
      const hu = tsunami.y(u + eps, v) - tsunami.baseline;
      const hv = tsunami.y(u, v + eps) - tsunami.baseline;
      const dx = (hu - y) / eps;
      const dz = (hv - y) / eps;

      const slope = Math.hypot(dx, dz);
      const crestness = clamp((y - amp * 0.15) / (amp * 0.85), 0, 1);
      const breaking = clamp((slope - 0.85) * 0.75 + crestness * 1.15, 0, 1);
      const foam = breaking * 0.38;

      const nx = -dx;
      const ny = 1;
      const nz = -dz;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const L = (nx * light.x + ny * light.y + nz * light.z) / nl;
      const lumOut = Math.max(0, Math.min(1, L * 0.6 + foam + 0.08));

      return { x: u, y, z: v, lum: lumOut };
    }

    return { x: u, y: 0, z: v, lum: 0 };
  };

  // Rotation
  const B = Math.sin(t * 0.08) * 0.35;
  const cA = Math.cos(0.4 + Math.sin(t * 0.2) * 0.2);
  const sA = Math.sin(0.4 + Math.sin(t * 0.2) * 0.2);
  const cB = Math.cos(B);
  const sB = Math.sin(B);

  // Sample wave surface
  for (let u = -3.5; u <= 3.5; u += sampleStep) {
    for (let v = -3.5; v <= 3.5; v += sampleStep) {
      const { x, y, z, lum: lumOut } = sampleWave(u, v);

      const y1 = y * cA - z * sA;
      const z1 = y * sA + z * cA;
      const x2 = x * cB + z1 * sB;
      const z2 = -x * sB + z1 * cB;
      const y2 = y1;

      const camDist = 7;
      const depth = z2 + camDist;
      if (depth <= 0.1) {
        continue;
      }

      const fov = 75;
      const scale = fov / depth;
      const px = Math.floor(PW / 2 + x2 * scale * 4);
      const py = Math.floor(PH / 2 - y2 * scale * 4);

      if (px >= 0 && px < PW && py >= 0 && py < PH) {
        const idx = py * PW + px;
        const invZ = 1 / depth;

        if (invZ > zBuf[idx]) {
          zBuf[idx] = invZ;
          lum[idx] = lumOut;
          heightBuf[idx] = y;
        }
      }
    }
  }

  // Spray
  if (settings.model === 'tsunami' && tsunami) {
    const { dirX, dirZ, center, time, y: tsunamiY, baseline } = tsunami;

    for (let i = 0; i < 90; i++) {
      const q = Math.sin(i * 1.31) * 3.1;
      const s = center + Math.sin(i * 0.73 + time * 0.6) * 0.24;
      const sx = dirX * s - dirZ * q + Math.sin(i * 2.1) * 0.12;
      const sz = dirZ * s + dirX * q + Math.cos(i * 1.7) * 0.12;
      const crest = tsunamiY(sx, sz) - baseline;

      if (crest > amp * 0.72) {
        const sy = crest + 0.25 + Math.sin(time * 10 + i) * 0.22;

        const y1 = sy * cA - sz * sA;
        const z1 = sy * sA + sz * cA;
        const x2 = sx * cB + z1 * sB;
        const z2 = -sx * sB + z1 * cB;
        const y2 = y1;

        const depth = z2 + 7;
        if (depth > 0.1) {
          const scale = 75 / depth;
          const px = Math.floor(PW / 2 + x2 * scale * 4);
          const py = Math.floor(PH / 2 - y2 * scale * 4);

          if (px >= 0 && px < PW && py >= 0 && py < PH) {
            if (Math.sin(t * 10 + i * 0.7) > 0) {
              const idx = py * PW + px;
              lum[idx] = 1;
              zBuf[idx] = 1;
              heightBuf[idx] = sy;
            }
          }
        }
      }
    }
  }

  // Braille render
  const patterns = [
    0x2800, 0x2801, 0x2821, 0x2825, 0x282d, 0x282f, 0x286f, 0x28ef, 0x28ff,
  ];

  const blankChar = String.fromCharCode(0x2800);
  const useColor = settings.colorMode !== 'mono';
  const coloredOutput = useColor ? [] : null;
  let output = '';

  const hueStep = 12;
  const lightStep = 6;
  const saturation = clamp(Math.round(settings.saturation), 0, 100);
  const hueShift = settings.colorMode === 'phase' ? t * 25 : 0;

  for (let cy = 0; cy < H; cy++) {
    let runColorKey = '';
    let runColor = '#f5f5f7';
    let runText = '';
    let runIndex = 0;

    for (let cx = 0; cx < W; cx++) {
      let total = 0;
      let count = 0;
      let heightTotal = 0;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const idx = (cy * 4 + dy) * PW + (cx * 2 + dx);
          if (zBuf[idx] > 0) {
            total += lum[idx];
            heightTotal += heightBuf[idx];
            count += 1;
          }
        }
      }

      let char = blankChar;
      let color = '#f5f5f7';
      let colorKey = '';

      if (count > 0) {
        const avgLum = total / count;
        const level = Math.min(8, Math.floor(avgLum * 9));
        char = String.fromCharCode(patterns[level]);

        if (useColor) {
          const avgHeight = heightTotal / count;
          const heightNorm = clamp((avgHeight + amp) / (2 * amp), 0, 1);
          const hue = (settings.hue + heightNorm * settings.hueRange + hueShift) % 360;
          const lightness = clamp(15 + avgLum * 70, 8, 90);

          const hueQ =
            ((Math.round(hue / hueStep) * hueStep) % 360 + 360) % 360;
          const lightQ = clamp(
            Math.round(lightness / lightStep) * lightStep,
            0,
            100,
          );

          colorKey = `${hueQ}|${lightQ}`;
          color = `hsl(${hueQ} ${saturation}% ${lightQ}%)`;
        }
      }

      if (useColor) {
        if (colorKey !== runColorKey) {
          if (runText) {
            coloredOutput.push(
              <span key={`r-${cy}-${runIndex}`} style={{ color: runColor }}>
                {runText}
              </span>,
            );
            runIndex += 1;
          }

          runColorKey = colorKey;
          runColor = color;
          runText = char;
        } else {
          runText += char;
        }
      } else {
        output += char;
      }
    }

    if (useColor) {
      coloredOutput.push(
        <span key={`r-${cy}-${runIndex}`} style={{ color: runColor }}>
          {runText + '\n'}
        </span>,
      );
    } else {
      output += '\n';
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: '100vh',
        width: '100vw',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
    >
      <button
        onClick={onOpenSettings}
        style={{
          position: 'absolute',
          top: '18px',
          left: '18px',
          background: 'transparent',
          color: '#f5f5f7',
          border: '1px solid #2c2c2c',
          padding: '6px 10px',
          fontSize: '12px',
          fontFamily: FONT_FAMILY,
          cursor: 'pointer',
        }}
      >
        settings
      </button>
      {isFull ? (
        <div
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'rgba(0, 0, 0, 0.35)',
            color: '#f5f5f7',
            border: '1px solid #2c2c2c',
            padding: '6px 10px',
            fontSize: '12px',
            fontFamily: FONT_FAMILY,
            opacity: 0.85,
            userSelect: 'none',
          }}
        >
          {fps} fps · {W}×{H}
        </div>
      ) : null}
      <pre
        ref={preRef}
        onClick={() => setIsFull((prev) => !prev)}
        title="scroll: speed · horizontal scroll: direction · f: fullscreen · s: settings"
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: `${FONT_SIZE_PX}px`,
          lineHeight: `${LINE_HEIGHT_PX}px`,
          letterSpacing: 0,
          color: '#f5f5f7',
          opacity: 0.95,
          cursor: isFull ? 'zoom-out' : 'zoom-in',
          margin: 0,
          padding: 0,
          userSelect: 'none',
        }}
      >
        {useColor ? coloredOutput : output}
      </pre>
    </div>
  );
}

function SettingsView({ settings, setSettings, onBack }) {
  const setNumber = (key) => (event) => {
    const value = Number(event.target.value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const setValue = (key) => (event) => {
    setSettings((prev) => ({ ...prev, [key]: event.target.value }));
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#f5f5f7',
        fontFamily: 'SF Mono, Menlo, monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 'min(640px, 92vw)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            color: '#f5f5f7',
            border: '1px solid #2c2c2c',
            padding: '6px 10px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          back
        </button>
        <button
          onClick={() => setSettings(DEFAULT_SETTINGS)}
          style={{
            background: 'transparent',
            color: '#f5f5f7',
            border: '1px solid #2c2c2c',
            padding: '6px 10px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          reset
        </button>
      </div>

      <div
        style={{
          width: 'min(640px, 92vw)',
          marginTop: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <SectionLabel text="physics" />
        <SelectRow
          label="model"
          value={settings.model}
          onChange={setValue('model')}
          options={[
            { value: 'trochoidal', label: 'trochoidal' },
            { value: 'spectrum', label: 'spectrum' },
            { value: 'basin', label: 'basin' },
            { value: 'tsunami', label: 'tsunami' },
          ]}
        />
        <RangeRow
          label="amplitude"
          value={settings.amplitude}
          min={0.4}
          max={3.8}
          step={0.05}
          onChange={setNumber('amplitude')}
        />
        {settings.model === 'trochoidal' ? (
          <>
            <RangeRow
              label="wavelength"
              value={settings.wavelength}
              min={1.2}
              max={6}
              step={0.05}
              onChange={setNumber('wavelength')}
            />
            <RangeRow
              label="steepness"
              value={settings.steepness}
              min={0}
              max={1}
              step={0.02}
              onChange={setNumber('steepness')}
            />
          </>
        ) : null}
        {settings.model === 'spectrum' ? (
          <>
            <RangeRow
              label="components"
              value={settings.components}
              min={1}
              max={24}
              step={1}
              onChange={setNumber('components')}
            />
            <RangeRow
              label="min λ"
              value={settings.minWavelength}
              min={0.4}
              max={6}
              step={0.05}
              onChange={setNumber('minWavelength')}
            />
            <RangeRow
              label="max λ"
              value={settings.maxWavelength}
              min={0.6}
              max={10}
              step={0.05}
              onChange={setNumber('maxWavelength')}
            />
            <RangeRow
              label="wind dir"
              value={settings.windDir}
              min={0}
              max={360}
              step={1}
              onChange={setNumber('windDir')}
            />
            <RangeRow
              label="spread"
              value={settings.spread}
              min={0}
              max={180}
              step={1}
              onChange={setNumber('spread')}
            />
            <RangeRow
              label="steepness"
              value={settings.steepness}
              min={0}
              max={1}
              step={0.02}
              onChange={setNumber('steepness')}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 60px',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '13px', color: '#bdbdbd' }}>seed</span>
              <input
                type="number"
                value={settings.seed}
                onChange={setNumber('seed')}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: '#0b0b0b',
                  border: '1px solid #2c2c2c',
                  color: '#f5f5f7',
                  fontFamily: 'SF Mono, Menlo, monospace',
                  fontSize: '12px',
                }}
              />
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    seed: Math.floor(Math.random() * 1_000_000),
                  }))
                }
                style={{
                  background: 'transparent',
                  color: '#f5f5f7',
                  border: '1px solid #2c2c2c',
                  padding: '6px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                roll
              </button>
            </div>
          </>
        ) : null}
        {settings.model === 'basin' ? (
          <>
            <RangeRow
              label="forcing"
              value={settings.basinModes}
              min={1}
              max={48}
              step={1}
              onChange={setNumber('basinModes')}
            />
            <RangeRow
              label="depth"
              value={settings.basinDepth}
              min={0.1}
              max={10}
              step={0.1}
              onChange={setNumber('basinDepth')}
            />
            <SelectRow
              label="edge"
              value={settings.basinEdge}
              onChange={setValue('basinEdge')}
              options={[
                { value: 'free', label: 'free (slope=0)' },
                { value: 'fixed', label: 'fixed (height=0)' },
              ]}
            />
          </>
        ) : null}
        {settings.model === 'tsunami' ? (
          <>
            <RangeRow
              label="crest width"
              value={settings.crestWidth}
              min={0.3}
              max={1.6}
              step={0.05}
              onChange={setNumber('crestWidth')}
            />
            <RangeRow
              label="curl"
              value={settings.curl}
              min={0}
              max={1.4}
              step={0.05}
              onChange={setNumber('curl')}
            />
            <RangeRow
              label="ripple"
              value={settings.ripple}
              min={0}
              max={0.4}
              step={0.01}
              onChange={setNumber('ripple')}
            />
          </>
        ) : null}
        <RangeRow
          label="speed"
          value={settings.speed}
          min={0.05}
          max={2.5}
          step={0.05}
          onChange={setNumber('speed')}
        />

        <SectionLabel text="color" />
        <SelectRow
          label="mode"
          value={settings.colorMode}
          onChange={setValue('colorMode')}
          options={[
            { value: 'mono', label: 'mono' },
            { value: 'depth', label: 'depth' },
            { value: 'phase', label: 'phase' },
          ]}
        />
        <RangeRow
          label="hue"
          value={settings.hue}
          min={0}
          max={360}
          step={1}
          onChange={setNumber('hue')}
        />
        <RangeRow
          label="hue range"
          value={settings.hueRange}
          min={0}
          max={200}
          step={1}
          onChange={setNumber('hueRange')}
        />
        <RangeRow
          label="saturation"
          value={settings.saturation}
          min={0}
          max={100}
          step={1}
          onChange={setNumber('saturation')}
        />
      </div>
    </div>
  );
}

function SectionLabel({ text }) {
  return (
    <div
      style={{
        fontSize: '12px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#7a7a7a',
      }}
    >
      {text}
    </div>
  );
}

function RangeRow({ label, value, min, max, step, onChange }) {
  const formatted =
    typeof value === 'number'
      ? step >= 1
        ? String(Math.round(value))
        : value.toFixed(2)
      : value;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 60px',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: '13px', color: '#bdbdbd' }}>{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        style={{
          width: '100%',
          accentColor: '#f5f5f7',
        }}
      />
      <span style={{ fontSize: '12px', color: '#8d8d8d' }}>
        {formatted}
      </span>
    </div>
  );
}

function SelectRow({ label, value, onChange, options }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 60px',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: '13px', color: '#bdbdbd' }}>{label}</span>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          padding: '6px 8px',
          background: '#0b0b0b',
          border: '1px solid #2c2c2c',
          color: '#f5f5f7',
          fontFamily: 'SF Mono, Menlo, monospace',
          fontSize: '12px',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: '12px', color: '#8d8d8d' }}>{value}</span>
    </div>
  );
}
