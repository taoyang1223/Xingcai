/**
 * 用 body.ts 同源截面烘焙占位 GLB。
 * 基准网格 = DEFAULT_BETA；morph = 单轴拉满 − 默认（支持负权重变瘦）。
 *
 *   npx tsx scripts/gen-placeholder-glb.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BETA,
  type Beta,
  armAt,
  armSpread,
  legAt,
  legSpread,
  superEllipse,
  torsoAt,
} from "../src/mannequin/body.ts";

/** 占位资产压到 ≤5k 三角面（《11》8.7）；正式美术可更高 */
const RADIAL = 24;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/mannequin");
const outGlb = path.join(outDir, "mannequin_headless_v1.glb");

/** 无头：躯干停在颈根 */
const TORSO_FROM = 0.468;
const TORSO_TO = 0.855;
const TORSO_RINGS = 24;
const LEG_FROM = 0.012;
const LEG_TO = 0.58;
const LEG_RINGS = 16;
const ARM_FROM = 0.398;
const ARM_TO = 0.845;
const ARM_RINGS = 14;

type PartKind = "torso" | "leg" | "arm";

type Part = {
  kind: PartKind;
  from: number;
  to: number;
  rings: number;
  n: number;
  side: -1 | 0 | 1;
  forward: number;
  /** 接进躯干的那一端不要盖，否则会鼓出一颗球 */
  capBottom: boolean;
  capTop: boolean;
  at: (b: Beta, h: number) => { a: number; b: number; cz: number };
  offsetX: (b: Beta, h: number) => number;
};

const PARTS: Part[] = [
  {
    kind: "torso",
    from: TORSO_FROM,
    to: TORSO_TO,
    rings: TORSO_RINGS,
    n: 2.45,
    side: 0,
    forward: 0,
    at: (b, h) => torsoAt(b, h),
    offsetX: () => 0,
    capBottom: false,
    capTop: true,
  },
  {
    kind: "leg",
    from: LEG_FROM,
    to: LEG_TO,
    rings: LEG_RINGS,
    n: 2.15,
    side: -1,
    forward: 0,
    at: (b, h) => legAt(b, h),
    offsetX: (b, h) => legSpread(b, h),
    capBottom: true,
    capTop: false,
  },
  {
    kind: "leg",
    from: LEG_FROM,
    to: LEG_TO,
    rings: LEG_RINGS,
    n: 2.15,
    side: 1,
    forward: 0,
    at: (b, h) => legAt(b, h),
    offsetX: (b, h) => legSpread(b, h),
    capBottom: true,
    capTop: false,
  },
  {
    kind: "arm",
    from: ARM_FROM,
    to: ARM_TO,
    rings: ARM_RINGS,
    n: 2.1,
    side: -1,
    forward: 0.012,
    at: (b, h) => armAt(b, h),
    offsetX: (b, h) => armSpread(b, h),
    capBottom: true,
    capTop: false,
  },
  {
    kind: "arm",
    from: ARM_FROM,
    to: ARM_TO,
    rings: ARM_RINGS,
    n: 2.1,
    side: 1,
    forward: 0.012,
    at: (b, h) => armAt(b, h),
    offsetX: (b, h) => armSpread(b, h),
    capBottom: true,
    capTop: false,
  },
];

function buildPositions(beta: Beta): Float32Array {
  const hm = beta.heightCm / 100;
  const coords: number[] = [];

  for (const part of PARTS) {
    const ringBases: number[] = [];
    for (let i = 0; i < part.rings; i++) {
      const h = part.from + ((part.to - part.from) * i) / (part.rings - 1);
      const slice = part.at(beta, h);
      const dx = part.offsetX(beta, h) * part.side * hm;
      const dz = part.forward * hm;
      const cz = slice.cz * hm;
      ringBases.push(coords.length / 3);
      for (let j = 0; j < RADIAL; j++) {
        const th = (j / RADIAL) * Math.PI * 2;
        const e = superEllipse(slice.a, slice.b, th, part.n);
        // front 压扁在 torsoAt 的 front 字段里——superEllipse 未用 front；
        // 程序化路径同样主要靠 a/b/cz；此处与 Mannequin3D.writePositions 对齐
        coords.push(e.x * hm + dx, h * hm, e.z * hm + dz + cz);
      }
    }
    // 端盖中心
    const h0 = part.from;
    const h1 = part.to;
    const s0 = part.at(beta, h0);
    const s1 = part.at(beta, h1);
    const dx0 = part.offsetX(beta, h0) * part.side * hm;
    const dx1 = part.offsetX(beta, h1) * part.side * hm;
    const dz = part.forward * hm;
    if (part.capBottom) coords.push(dx0, h0 * hm - s0.b * hm * 0.12, dz + s0.cz * hm);
    if (part.capTop) coords.push(dx1, h1 * hm + s1.b * hm * 0.2, dz + s1.cz * hm);
  }

  return new Float32Array(coords);
}

function buildIndex(): Uint32Array {
  const idx: number[] = [];
  let cursor = 0;
  for (const part of PARTS) {
    const ringStart = cursor;
    for (let i = 0; i < part.rings - 1; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const j2 = (j + 1) % RADIAL;
        const a = ringStart + i * RADIAL + j;
        const b = ringStart + (i + 1) * RADIAL + j;
        const c = ringStart + (i + 1) * RADIAL + j2;
        const d = ringStart + i * RADIAL + j2;
        idx.push(a, b, c, a, c, d);
      }
    }
    let capCursor = ringStart + part.rings * RADIAL;
    for (let j = 0; j < RADIAL; j++) {
      const j2 = (j + 1) % RADIAL;
      if (part.capBottom) {
        idx.push(capCursor, ringStart + j2, ringStart + j);
      }
      if (part.capTop) {
        const top = capCursor + (part.capBottom ? 1 : 0);
        idx.push(top, ringStart + (part.rings - 1) * RADIAL + j, ringStart + (part.rings - 1) * RADIAL + j2);
      }
    }
    if (part.capBottom) capCursor++;
    if (part.capTop) capCursor++;
    cursor = capCursor;
  }
  return new Uint32Array(idx);
}

function computeNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const n = pos.length / 3;
  const normals = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3;
    const ib = idx[t + 1] * 3;
    const ic = idx[t + 2] * 3;
    const ax = pos[ia],
      ay = pos[ia + 1],
      az = pos[ia + 2];
    const bx = pos[ib],
      by = pos[ib + 1],
      bz = pos[ib + 2];
    const cx = pos[ic],
      cy = pos[ic + 1],
      cz = pos[ic + 2];
    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const i of [ia, ib, ic]) {
      normals[i] += nx;
      normals[i + 1] += ny;
      normals[i + 2] += nz;
    }
  }
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const len = Math.hypot(normals[i3], normals[i3 + 1], normals[i3 + 2]) || 1;
    normals[i3] /= len;
    normals[i3 + 1] /= len;
    normals[i3 + 2] /= len;
  }
  return normals;
}

function delta(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

function align4(n: number) {
  return (n + 3) & ~3;
}

function buildGlb(
  pos: Float32Array,
  normals: Float32Array,
  idx: Uint32Array,
  morphs: Float32Array[],
  morphNames: string[]
) {
  const binParts: Uint8Array[] = [];
  const push = (buf: Uint8Array) => {
    const offset = binParts.reduce((s, b) => s + b.byteLength, 0);
    binParts.push(buf);
    const pad = align4(buf.byteLength) - buf.byteLength;
    if (pad) binParts.push(new Uint8Array(pad));
    return { byteOffset: offset, byteLength: buf.byteLength };
  };

  const posView = push(new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength));
  const nrmView = push(new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength));
  const idxView = push(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength));
  const morphViews = morphs.map((m) =>
    push(new Uint8Array(m.buffer, m.byteOffset, m.byteLength))
  );

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]);
    minY = Math.min(minY, pos[i + 1]);
    minZ = Math.min(minZ, pos[i + 2]);
    maxX = Math.max(maxX, pos[i]);
    maxY = Math.max(maxY, pos[i + 1]);
    maxZ = Math.max(maxZ, pos[i + 2]);
  }

  const binLength = binParts.reduce((s, b) => s + b.byteLength, 0);
  const accessors: object[] = [
    {
      bufferView: 0,
      componentType: 5126,
      count: pos.length / 3,
      type: "VEC3",
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ],
    },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5125, count: idx.length, type: "SCALAR" },
  ];
  morphViews.forEach((_, i) => {
    accessors.push({
      bufferView: 3 + i,
      componentType: 5126,
      count: pos.length / 3,
      type: "VEC3",
    });
  });

  const json = {
    asset: { version: "2.0", generator: "fitme-gen-placeholder-glb/body.ts" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "MannequinRoot" }],
    materials: [
      {
        name: "MatteSkin",
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.745, 0.67, 1],
          metallicFactor: 0.02,
          roughnessFactor: 0.9,
        },
        doubleSided: true,
      },
    ],
    meshes: [
      {
        name: "MannequinBody",
        weights: [0, 0, 0],
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
            targets: morphViews.map((_, i) => ({ POSITION: 3 + i })),
            extras: { targetNames: morphNames },
          },
        ],
        extras: {
          targetNames: morphNames,
          baseBeta: DEFAULT_BETA,
          morphSemantics: "delta_from_default_to_axis_max",
        },
      },
    ],
    accessors,
    bufferViews: [
      { buffer: 0, byteOffset: posView.byteOffset, byteLength: posView.byteLength, target: 34962 },
      { buffer: 0, byteOffset: nrmView.byteOffset, byteLength: nrmView.byteLength, target: 34962 },
      { buffer: 0, byteOffset: idxView.byteOffset, byteLength: idxView.byteLength, target: 34963 },
      ...morphViews.map((v) => ({
        buffer: 0,
        byteOffset: v.byteOffset,
        byteLength: v.byteLength,
        target: 34962,
      })),
    ],
    buffers: [{ byteLength: binLength }],
  };

  let jsonStr = JSON.stringify(json);
  jsonStr += " ".repeat(align4(jsonStr.length) - jsonStr.length);
  const jsonChunk = Buffer.from(jsonStr, "utf8");
  const binChunk = Buffer.concat(binParts.map((b) => Buffer.from(b)));

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

const base = buildPositions(DEFAULT_BETA);
const fatMax = buildPositions({ ...DEFAULT_BETA, fat: 1 });
const bellyMax = buildPositions({ ...DEFAULT_BETA, belly: 1 });
const shoulderMax = buildPositions({ ...DEFAULT_BETA, shoulder: 1 });
const idx = buildIndex();
const normals = computeNormals(base, idx);
const morphs = [delta(fatMax, base), delta(bellyMax, base), delta(shoulderMax, base)];
const morphNames = ["BS_Fat", "BS_Belly", "BS_Shoulder"];

fs.mkdirSync(outDir, { recursive: true });
const glb = buildGlb(base, normals, idx, morphs, morphNames);
fs.writeFileSync(outGlb, glb);
console.log(
  "wrote",
  outGlb,
  `(${glb.length} bytes, ~${idx.length / 3} tris, ${base.length / 3} verts, base=DEFAULT_BETA)`
);
