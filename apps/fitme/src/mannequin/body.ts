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

/** 躯干下缘即这具示意人体的分叉处。裆高是站直后从地面到该点的垂直距离。 */
export const CROTCH_H = 0.48;
/** 颈根变细处，当作后领位置。 */
export const BACK_NECK_H = 0.838;
/** 臀围最宽处。比分叉处高约 4 厘米（按 170 厘米身高），衣摆对齐这里。 */
export const TEE_HEM_H = 0.505;

/** 躯干 + 颈 + 头：一条从分叉处到头顶的连续轮廓 */
const TORSO: Section[] = [
  { h: CROTCH_H, a: 0.078, b: 0.060 },
  { h: TEE_HEM_H, a: 0.106, b: 0.080, cz: -0.006 },
  { h: 0.545, a: 0.094, b: 0.070, cz: -0.006 },
  { h: 0.575, a: 0.084, b: 0.062, cz: -0.004 },
  { h: 0.612, a: 0.076, b: 0.056 },
  { h: 0.648, a: 0.072, b: 0.056, cz: 0.004 },
  { h: 0.685, a: 0.086, b: 0.064, cz: 0.006 },
  { h: 0.718, a: 0.096, b: 0.074, cz: 0.008 },
  { h: 0.752, a: 0.094, b: 0.066, cz: 0.002 },
  { h: 0.792, a: 0.114, b: 0.056, cz: -0.004 },
  { h: 0.818, a: 0.102, b: 0.050, cz: -0.006 },
  { h: 0.838, a: 0.058, b: 0.042, cz: -0.005 },
  { h: 0.852, a: 0.036, b: 0.032, cz: -0.004 },
  { h: 0.866, a: 0.031, b: 0.031, cz: -0.002 },
  { h: 0.886, a: 0.030, b: 0.031, cz: -0.003 },
  { h: 0.903, a: 0.040, b: 0.045, cz: -0.006, front: 0.88 },
  { h: 0.926, a: 0.047, b: 0.055, cz: -0.008, front: 0.84 },
  { h: 0.952, a: 0.049, b: 0.058, cz: -0.009, front: 0.86 },
  { h: 0.978, a: 0.041, b: 0.049, cz: -0.010, front: 0.90 },
  { h: 1.000, a: 0.014, b: 0.016, cz: -0.010, front: 1 },
];

const LEG: Section[] = [
  { h: 0.008, a: 0.022, b: 0.048, cz: 0.024 },
  { h: 0.022, a: 0.020, b: 0.036, cz: 0.012 },
  { h: 0.042, a: 0.016, b: 0.020, cz: 0.000 },
  { h: 0.075, a: 0.018, b: 0.022, cz: -0.002 },
  { h: 0.150, a: 0.036, b: 0.040, cz: -0.006 },
  { h: 0.230, a: 0.026, b: 0.028, cz: -0.001 },
  { h: 0.285, a: 0.030, b: 0.032 },
  { h: 0.360, a: 0.046, b: 0.048 },
  { h: 0.440, a: 0.054, b: 0.056, cz: -0.004 },
  { h: 0.500, a: 0.056, b: 0.058, cz: -0.006 },
];

const ARM: Section[] = [
  { h: 0.396, a: 0.011, b: 0.014, cz: 0.004 },
  { h: 0.416, a: 0.014, b: 0.016, cz: 0.002 },
  { h: 0.450, a: 0.016, b: 0.017 },
  { h: 0.530, a: 0.020, b: 0.021 },
  { h: 0.590, a: 0.018, b: 0.019 },
  { h: 0.660, a: 0.026, b: 0.027 },
  { h: 0.740, a: 0.032, b: 0.033 },
  { h: 0.790, a: 0.036, b: 0.034 },
  { h: 0.822, a: 0.028, b: 0.026 },
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

export type PreviewDimension = {
  key?: string;
  label: string;
  value: number | null;
  source: "演示推算" | "手工录入 · 仅本页" | "缺失 · 未测";
};

export const WIDTH_STATIONS = {
  shoulder: 0.8,
  chest: 0.735,
  waist: 0.63,
  hip: TEE_HEM_H,
} as const;

export type WidthKey = keyof typeof WIDTH_STATIONS;

/** 截面左右全宽，单位厘米。不是围度。 */
export function sectionWidthCm(beta: Beta, h: number) {
  return 2 * torsoAt(beta, h).a * beta.heightCm;
}

const FIT_TOLERANCE_CM = 1.5;

export type FitWidthsResult = { ok: true; beta: Beta } | { ok: false; reason: string };

function solveWidth(beta: Beta, param: "fat" | "belly" | "shoulder", h: number, target: number) {
  const at = (value: number) => sectionWidthCm({ ...beta, [param]: value }, h);
  const low = at(0);
  const high = at(1);
  const increasing = high >= low;
  const outside = increasing ? target < low || target > high : target > low || target < high;
  if (outside) {
    const end = Math.abs(target - low) <= Math.abs(target - high) ? 0 : 1;
    return { value: end, error: Math.abs(at(end) - target) };
  }
  let left = 0;
  let right = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (left + right) / 2;
    const width = at(mid);
    if ((increasing && width < target) || (!increasing && width > target)) left = mid;
    else right = mid;
  }
  const value = (left + right) / 2;
  return { value, error: Math.abs(at(value) - target) };
}

/**
 * 用手填的截面宽度反推示意参数。胸宽和臀宽只能一起随胖瘦变，比例冲突或超出滑杆范围时不改模型。
 * 结果仍是外观，不是软尺真值。
 */
export function fitWidths(beta: Beta, targets: Partial<Record<WidthKey, number>>): FitWidthsResult {
  const keys = (Object.keys(WIDTH_STATIONS) as WidthKey[]).filter((key) => targets[key] != null);
  if (keys.length === 0) return { ok: true, beta };
  for (const key of keys) {
    const value = targets[key] as number;
    if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: "宽度需要是正数，未改模型" };
  }
  if (targets.chest != null && targets.hip != null) {
    const sample = { ...beta, fat: 0.45, belly: 0.35, shoulder: 0.5 };
    const ratio = sectionWidthCm(sample, WIDTH_STATIONS.chest) / sectionWidthCm(sample, WIDTH_STATIONS.hip);
    const asked = targets.chest / targets.hip;
    if (Math.abs(asked - ratio) / ratio > 0.08) {
      return { ok: false, reason: "胸宽和臀宽与示意人体的截面比例冲突，未改模型" };
    }
  }
  let next: Beta = { ...beta };
  const fatTarget = targets.hip ?? targets.chest;
  if (fatTarget != null) {
    const station = targets.hip != null ? WIDTH_STATIONS.hip : WIDTH_STATIONS.chest;
    const solved = solveWidth(next, "fat", station, fatTarget);
    if (solved.error > FIT_TOLERANCE_CM) return { ok: false, reason: "该宽度超出示意人体可调范围，未改模型" };
    next = { ...next, fat: solved.value };
  }
  if (targets.waist != null) {
    const solved = solveWidth(next, "belly", WIDTH_STATIONS.waist, targets.waist);
    if (solved.error > FIT_TOLERANCE_CM) return { ok: false, reason: "腰宽超出示意人体可调范围，未改模型" };
    next = { ...next, belly: solved.value };
  }
  if (targets.shoulder != null) {
    const solved = solveWidth(next, "shoulder", WIDTH_STATIONS.shoulder, targets.shoulder);
    if (solved.error > FIT_TOLERANCE_CM) return { ok: false, reason: "肩宽超出示意人体可调范围，未改模型" };
    next = { ...next, shoulder: solved.value };
  }
  for (const key of keys) {
    const got = sectionWidthCm(next, WIDTH_STATIONS[key]);
    if (Math.abs(got - (targets[key] as number)) > FIT_TOLERANCE_CM) {
      return { ok: false, reason: "这几项宽度不能同时落在示意人体上，未改模型" };
    }
  }
  return { ok: true, beta: next };
}

/** 裆高：站直后从地面到两腿分叉处的垂直距离，取这具示意人体的躯干下缘。 */
export function crotchHeightCm(beta: Beta) {
  return beta.heightCm * CROTCH_H;
}

/** 后领到衣摆的垂直距离。衣摆取臀宽高度，不是裆高，也不是真实衣服的衣长。 */
export function teeLengthCm(beta: Beta) {
  return beta.heightCm * (BACK_NECK_H - TEE_HEM_H);
}

/** 所有推算只针对参数化示意网格，不代表照片或真人尺寸。 */
export function previewDimensions(beta: Beta, heightEntered: boolean) {
  const width = (h: number) => 2 * torsoAt(beta, h).a * beta.heightCm;
  const crotch = crotchHeightCm(beta);
  return {
    widths: [
      { key: "shoulder", label: "肩宽", value: width(0.8), source: "演示推算" },
      { key: "chest", label: "胸宽", value: width(0.735), source: "演示推算" },
      { key: "waist", label: "腰宽", value: width(0.63), source: "演示推算" },
      { key: "hip", label: "臀宽", value: width(TEE_HEM_H), source: "演示推算" },
    ] as PreviewDimension[],
    heights: [
      { label: "身高", value: beta.heightCm, source: heightEntered ? "手工录入 · 仅本页" : "演示推算" },
      { label: "裆高", value: crotch, source: "演示推算" },
      { label: "后领到衣摆", value: teeLengthCm(beta), source: "演示推算" },
    ] as PreviewDimension[],
  };
}

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
  for (let h = 0.49; h <= 0.53; h += 0.004) {
    hip = Math.max(hip, girth(...atH(beta, h), beta.heightCm));
  }
  return { chest, waist, hip };
}

function atH(beta: Beta, h: number): [number, number] {
  const s = torsoAt(beta, h);
  return [s.a, s.b];
}

/** 大腿根埋在骨盆里，越往下站得越开。返回中心离身体中线的距离，单位是身高占比。 */
export function legSpread(beta: Beta, h: number) {
  const hip = torsoAt(beta, 0.52).a;
  const t = Math.min(1, Math.max(0, (0.58 - h) / (0.58 - 0.02)));
  return hip * (0.22 + 0.22 * t);
}

/** 肩根埋进肩带，往下垂到体侧。 */
export function armSpread(beta: Beta, h: number) {
  const shoulder = torsoAt(beta, 0.8).a;
  const rib = torsoAt(beta, 0.7).a;
  const t = Math.min(1, Math.max(0, (0.845 - h) / (0.845 - 0.398)));
  const root = shoulder * 0.42;
  const hang = rib + 0.018;
  return root + (hang - root) * Math.pow(t, 0.55);
}

export const PARTS = {
  torso: { from: 0.468, to: 1.0, rings: 84, at: torsoAt, offsetX: 0, n: N_TORSO },
  leg: { from: 0.012, to: 0.505, rings: 44, at: legAt, offsetX: 0.032, n: 2.15 },
  arm: { from: 0.398, to: 0.828, rings: 40, at: armAt, offsetX: 0.126, n: 2.1 },
} as const;

export const RADIAL = 40;
