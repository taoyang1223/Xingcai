import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DEFAULT_BETA, type Beta } from "./body";
import type { MannequinManifest } from "./manifest";

export type GlbHandle = {
  root: THREE.Group;
  applyBeta: (beta: Beta) => void;
  dispose: () => void;
  /** morph 名 → 是否在资产里找到 */
  bound: Record<string, boolean>;
  status: "ok" | "missing-morphs";
};

type MorphSlot = {
  mesh: THREE.Mesh;
  influences: number[];
  index: number;
};

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function ensureMorphNames(mesh: THREE.Mesh, names: string[]) {
  if (!mesh.morphTargetInfluences?.length) return;
  if (!mesh.morphTargetDictionary) mesh.morphTargetDictionary = {};
  const dict = mesh.morphTargetDictionary;
  if (Object.keys(dict).length > 0) return;
  names.forEach((n, i) => {
    if (i < mesh.morphTargetInfluences!.length) dict[n] = i;
  });
}

function bindMorph(
  meshes: THREE.Mesh[],
  name: string,
  fallbackIndex?: number
): MorphSlot | null {
  for (const mesh of meshes) {
    const influences = mesh.morphTargetInfluences;
    if (!influences) continue;
    const dict = mesh.morphTargetDictionary;
    if (dict && name in dict) {
      return { mesh, influences, index: dict[name] };
    }
    if (fallbackIndex != null && fallbackIndex < influences.length) {
      return { mesh, influences, index: fallbackIndex };
    }
  }
  return null;
}

/**
 * 占位 GLB：morph = (单轴拉满 − DEFAULT)。
 * 权重 0 = 默认体型；>0 往胖/鼓/宽；<0 往瘦侧线性近似。
 */
export function morphWeightFromBeta(value: number, mid: number): number {
  if (value >= mid) return (value - mid) / Math.max(1e-6, 1 - mid);
  return (value - mid) / Math.max(1e-6, mid);
}

/**
 * 按《12》合同把 β 写进 morph + 身高缩放。
 * 围度仍由 body.measure(β) 负责，本函数只管显示。
 */
export function applyBetaToGlb(
  root: THREE.Object3D,
  manifest: MannequinManifest,
  slots: { fat: MorphSlot | null; belly: MorphSlot | null; shoulder: MorphSlot | null },
  beta: Beta
) {
  if (slots.fat) {
    slots.fat.influences[slots.fat.index] = morphWeightFromBeta(beta.fat, DEFAULT_BETA.fat);
  }
  if (slots.belly) {
    slots.belly.influences[slots.belly.index] = morphWeightFromBeta(beta.belly, DEFAULT_BETA.belly);
  }
  if (slots.shoulder) {
    slots.shoulder.influences[slots.shoulder.index] = morphWeightFromBeta(
      beta.shoulder,
      DEFAULT_BETA.shoulder
    );
  }

  const s = beta.heightCm / manifest.baseHeightCm;
  if (manifest.heightMode === "scaleY") {
    root.scale.set(1, s, 1);
  } else {
    root.scale.setScalar(s);
  }
}

function polishMaterial(old: THREE.Material): THREE.Material {
  const phys = new THREE.MeshPhysicalMaterial({
    color: 0xcfc3b3,
    roughness: 0.82,
    metalness: 0.02,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
    sheen: 0.18,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xe8dcc8),
    envMapIntensity: 0.7,
  });
  old.dispose();
  return phys;
}

export async function loadGlbMannequin(manifest: MannequinManifest): Promise<GlbHandle> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(manifest.glbUrl);
  const root = gltf.scene;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(polishMaterial);
    } else if (mesh.material) {
      mesh.material = polishMaterial(mesh.material);
    }
  });

  const meshes = collectMeshes(root);
  const orderedNames = [manifest.morphs.fat, manifest.morphs.belly, manifest.morphs.shoulder];
  meshes.forEach((m) => ensureMorphNames(m, orderedNames));
  const slots = {
    fat: bindMorph(meshes, manifest.morphs.fat, 0),
    belly: bindMorph(meshes, manifest.morphs.belly, 1),
    shoulder: bindMorph(meshes, manifest.morphs.shoulder, 2),
  };
  const bound = {
    [manifest.morphs.fat]: !!slots.fat,
    [manifest.morphs.belly]: !!slots.belly,
    [manifest.morphs.shoulder]: !!slots.shoulder,
  };
  const missing = Object.values(bound).some((v) => !v);

  const applyBeta = (beta: Beta) => applyBetaToGlb(root, manifest, slots, beta);
  applyBeta(DEFAULT_BETA);

  return {
    root,
    applyBeta,
    bound,
    status: missing ? "missing-morphs" : "ok",
    dispose: () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m?.dispose());
      });
    },
  };
}
