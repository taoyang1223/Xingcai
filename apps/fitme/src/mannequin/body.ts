/**
 * 参数化人台：同一组参数既长出网格，也算出围度。
 *
 * 这是 M(β) 的最小可行版本——β 在这里只有三个可拖的量加身高。
 * 阶段 2 照片反解要替换的是 β 的来源，不是这里的形状函数。
 *
 * 所有截面尺寸以身高为单位（乘 heightCm 得厘米），因此拖身高时围度会跟着变。
 */

export type Beta = {
  heightCm: number;
  /** 0..1 整体胖瘦 */
  fat: number;
  /** 0..1 肚子 */
  belly: number;
  /** 0..1 肩宽 */
  shoulder: number;
};

export const DEFAULT_BETA: Beta = { heightCm: 170, fat: 0.45, belly: 0.35, shoulder: 0.5 };

/**
 * 半宽 a（左右）与半厚 b（前后），单位为身高占比。
 * cz 把截面整体前后挪（后脑要凸、脚掌要往前），front 只压前半边（脸是平的，后脑不是）。
 */
type Section = { h: number; a: number; b: number; cz?: number; front?: number };

export type Slice = { a: number; b: number; cz: number; front: number };

/** 躯干 + 颈 + 头：一条从胯到头顶的连续轮廓 */
const TORSO: Section[] = [
  { h: 0.470, a: 0.079, b: 0.061 },
  { h: 0.510, a: 0.089, b: 0.066, cz: -0.004 },
  { h: 0.545, a: 0.095, b: 0.071, cz: -0.006 },
  { h: 0.575, a: 0.090, b: 0.066, cz: -0.004 },
  { h: 0.612, a: 0.074, b: 0.054 },
  { h: 0.648, a: 0.073, b: 0.053 },
  { h: 0.685, a: 0.082, b: 0.059, cz: 0.001 },
  { h: 0.718, a: 0.090, b: 0.066, cz: 0.003 },
  { h: 0.752, a: 0.092, b: 0.064, cz: 0.002 },
  { h: 0.792, a: 0.096, b: 0.060, cz: -0.002 },
  { h: 0.818, a: 0.093, b: 0.055, cz: -0.004 },
  { h: 0.838, a: 0.071, b: 0.049, cz: -0.005 },
  { h: 0.852, a: 0.045, b: 0.038, cz: -0.004 },
  { h: 0.866, a: 0.031, b: 0.031, cz: -0.002 },
  { h: 0.886, a: 0.030, b: 0.031, cz: -0.003 },
  { h: 0.903, a: 0.040, b: 0.045, cz: -0.006, front: 0.88 },
  { h: 0.926, a: 0.047, b: 0.055, cz: -0.008, front: 0.84 },
  { h: 0.952, a: 0.049, b: 0.058, cz: -0.009, front: 0.86 },
  { h: 0.978, a: 0.041, b: 0.049, cz: -0.010, front: 0.90 },
  { h: 1.000, a: 0.014, b: 0.016, cz: -0.010, front: 1 },
];

const LEG: Section[] = [
  { h: 0.008, a: 0.022, b: 0.046, cz: 0.021 },
  { h: 0.022, a: 0.021, b: 0.039, cz: 0.014 },
  { h: 0.042, a: 0.019, b: 0.024, cz: 0.002 },
  { h: 0.075, a: 0.022, b: 0.025, cz: -0.002 },
  { h: 0.150, a: 0.031, b: 0.034, cz: -0.004 },
  { h: 0.230, a: 0.029, b: 0.030, cz: -0.001 },
  { h: 0.285, a: 0.032, b: 0.033 },
  { h: 0.360, a: 0.040, b: 0.042 },
  { h: 0.440, a: 0.047, b: 0.049, cz: -0.002 },
  { h: 0.500, a: 0.050, b: 0.052, cz: -0.004 },
];

const ARM: Section[] = [
  { h: 0.396, a: 0.013, b: 0.019, cz: 0.003 },
  { h: 0.416, a: 0.016, b: 0.022, cz: 0.002 },
  { h: 0.450, a: 0.017, b: 0.018 },
  { h: 0.530, a: 0.019, b: 0.020 },
  { h: 0.590, a: 0.021, b: 0.022 },
  { h: 0.660, a: 0.024, b: 0.025 },
  { h: 0.740, a: 0.029, b: 0.030 },
  { h: 0.790, a: 0.031, b: 0.032 },
  { h: 0.822, a: 0.024, b: 0.025 },
];

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 保形三次样条（PCHIP）。
 * 必须是 C1 连续的：分段线性或分段 smoothstep 会在控制点留下折痕，
 * 光照一打就是一圈圈横条纹。
 */
function makeSpline(hs: number[], vs: number[]) {
  const n = hs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (hs[i + 1] - hs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * (hs[i + 1] - hs[i]) + (hs[i] - hs[i - 1]);
      const w2 = (hs[i + 1] - hs[i]) + 2 * (hs[i] - hs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (h: number) => {
    if (h <= hs[0]) return vs[0];
    if (h >= hs[n - 1]) return vs[n - 1];
    let i = 0;
    while (i < n - 2 && h > hs[i + 1]) i++;
    const dh = hs[i + 1] - hs[i];
    const t = (h - hs[i]) / dh;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * vs[i] +
      (t3 - 2 * t2 + t) * dh * m[i] +
      (-2 * t3 + 3 * t2) * vs[i + 1] +
      (t3 - t2) * dh * m[i + 1]
    );
  };
}

function compile(sections: Section[]) {
  const hs = sections.map((s) => s.h);
  return {
    a: makeSpline(hs, sections.map((s) => s.a)),
    b: makeSpline(hs, sections.map((s) => s.b)),
    cz: makeSpline(hs, sections.map((s) => s.cz ?? 0)),
    front: makeSpline(hs, sections.map((s) => s.front ?? 1)),
  };
}

/**
 * 滑杆到尺寸的映射是非对称的：往瘦拖收得慢，往胖拖放得开。
 * 人瘦下去有骨架兜底，胖上去没有上限——对称映射会拖出腰围 47 这种不存在的身材。
 */
function asym(v: number, mid: number, down: number, up: number) {
  return 1 + (v - mid) * (v >= mid ? up : down);
}

/** 一个区间内的钟形权重，把某根滑杆的影响限制在身体的一段上。sin² 保证两端导数为零 */
function band(h: number, lo: number, hi: number) {
  if (h <= lo || h >= hi) return 0;
  const s = Math.sin((Math.PI * (h - lo)) / (hi - lo));
  return s * s;
}

/**
 * 把三根滑杆作用到截面上。头部不受影响——捏的是身材，不是脸。
 */
export function torsoAt(beta: Beta, h: number): Slice {
  const base = { a: TORSO_S.a(h), b: TORSO_S.b(h) };
  const notHead = 1 - smoothstep(0.845, 0.885, h);
  const fat = 1 + (asym(beta.fat, 0.45, 0.24, 0.60) - 1) * notHead;
  const bellyW = band(h, 0.545, 0.735);
  const shoulderW = band(h, 0.735, 0.845);
  const bellyA = 1 + (asym(beta.belly, 0.35, 0.22, 0.34) - 1) * bellyW;
  const bellyB = 1 + (asym(beta.belly, 0.35, 0.30, 0.86) - 1) * bellyW;
  const shW = 1 + (asym(beta.shoulder, 0.5, 0.30, 0.32) - 1) * shoulderW;
  return {
    a: base.a * fat * bellyA * shW,
    b: base.b * fat * bellyB * (1 + (shW - 1) * 0.3),
    // 肚子往前顶，不往后长：截面中心跟着往前挪一点
    cz: TORSO_S.cz(h) + (asym(beta.belly, 0.35, 0.004, 0.012) - 1) * bellyW * 1.4,
    front: TORSO_S.front(h),
  };
}

export function legAt(beta: Beta, h: number): Slice {
  const base = { a: LEG_S.a(h), b: LEG_S.b(h) };
  const fat = asym(beta.fat, 0.45, 0.22, 0.48);
  const thigh = 1 + (asym(beta.belly, 0.35, 0.08, 0.18) - 1) * band(h, 0.36, 0.52);
  const footless = 1 - (h < 0.05 ? 1 : 0) * 0.5;
  return {
    a: base.a * (1 + (fat - 1) * footless) * thigh,
    b: base.b * (1 + (fat - 1) * footless) * thigh,
    cz: LEG_S.cz(h),
    front: 1,
  };
}

export function armAt(beta: Beta, h: number): Slice {
  const base = { a: ARM_S.a(h), b: ARM_S.b(h) };
  const fat = asym(beta.fat, 0.45, 0.20, 0.44);
  return { a: base.a * fat, b: base.b * fat, cz: ARM_S.cz(h), front: 1 };
}

const TORSO_S = compile(TORSO);
const LEG_S = compile(LEG);
const ARM_S = compile(ARM);

/** 躯干截面用超椭圆，比正圆更像人；指数越大越方 */
const N_TORSO = 2.45;

export function superEllipse(a: number, b: number, theta: number, n = N_TORSO) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const z = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  return { x, z };
}

/** 数值积分算周长，单位厘米 */
function girth(a: number, b: number, heightCm: number, n = N_TORSO) {
  const steps = 256;
  let len = 0;
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const p = superEllipse(a, b, th, n);
    if (i > 0) len += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return len * heightCm;
}

export type Girths = { chest: number; waist: number; hip: number };

/**
 * 围度不是另填的数字，是从同一条轮廓上量出来的。
 * 腰取最细、臀取最宽，和软尺的找法一致。
 */
export function measure(beta: Beta): Girths {
  const chest = girth(...atH(beta, 0.735), beta.heightCm);
  let waist = Infinity;
  for (let h = 0.595; h <= 0.665; h += 0.004) {
    waist = Math.min(waist, girth(...atH(beta, h), beta.heightCm));
  }
  let hip = 0;
  for (let h = 0.505; h <= 0.575; h += 0.004) {
    hip = Math.max(hip, girth(...atH(beta, h), beta.heightCm));
  }
  return { chest, waist, hip };
}

function atH(beta: Beta, h: number): [number, number] {
  const s = torsoAt(beta, h);
  return [s.a, s.b];
}

/** 手臂自然下垂时略外张，肩点窄、腕点宽 */
export function armSpread(beta: Beta, h: number) {
  const shoulder = torsoAt(beta, 0.8).a;
  const t = Math.min(1, Math.max(0, (0.822 - h) / (0.822 - 0.396)));
  return shoulder + 0.010 + t * 0.013;
}

export const PARTS = {
  torso: { from: 0.468, to: 1.0, rings: 84, at: torsoAt, offsetX: 0, n: N_TORSO },
  leg: { from: 0.012, to: 0.505, rings: 44, at: legAt, offsetX: 0.032, n: 2.15 },
  arm: { from: 0.398, to: 0.828, rings: 40, at: armAt, offsetX: 0.126, n: 2.1 },
} as const;

export const RADIAL = 40;
