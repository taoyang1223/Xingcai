import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DEFAULT_BETA, type Beta } from "./body";
import type { MannequinManifest } from "./manifest";

export type GlbHandle = {
  root: THREE.Group;
  garment: THREE.Group;
  bodyMeshes: THREE.Mesh[];
  setClothesVisible: (show: boolean) => void;
  applyBeta: (beta: Beta) => void;
  dispose: () => void;
};

type MorphSlot = {
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

function bindMorph(mesh: THREE.Mesh, name: string): MorphSlot | null {
  const influences = mesh.morphTargetInfluences;
  const index = mesh.morphTargetDictionary?.[name];
  if (!influences || index == null || index >= influences.length) return null;
  return { influences, index };
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
  slots: { fat: MorphSlot[]; belly: MorphSlot[]; shoulder: MorphSlot[] },
  beta: Beta
) {
  slots.fat.forEach((slot) => { slot.influences[slot.index] = morphWeightFromBeta(beta.fat, DEFAULT_BETA.fat); });
  slots.belly.forEach((slot) => { slot.influences[slot.index] = morphWeightFromBeta(beta.belly, DEFAULT_BETA.belly); });
  slots.shoulder.forEach((slot) => {
    slot.influences[slot.index] = morphWeightFromBeta(beta.shoulder, DEFAULT_BETA.shoulder);
  });

  const s = beta.heightCm / manifest.baseHeightCm;
  if (manifest.heightMode === "scaleY") {
    root.scale.set(1, s, 1);
  } else {
    root.scale.setScalar(s);
  }
}

function polishMaterial(kind: "body" | "garment"): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    color: kind === "body" ? 0xcfc3b3 : 0x3a8e87,
    roughness: kind === "body" ? 0.82 : 0.92,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

/** 衣服沿法线外移，避免和里面的身体贴在同一面上发虚。 */
function liftAlongNormals(geometry: THREE.BufferGeometry, amount: number) {
  const pos = geometry.getAttribute("position");
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const nor = geometry.getAttribute("normal");
  if (!pos || !nor) return;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * amount,
      pos.getY(i) + nor.getY(i) * amount,
      pos.getZ(i) + nor.getZ(i) * amount,
    );
  }
  pos.needsUpdate = true;
}

export async function loadGlbMannequin(manifest: MannequinManifest): Promise<GlbHandle> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(manifest.glbUrl);
  const root = gltf.scene;
  const garment = new THREE.Group();
  garment.name = "DemoGarment";
  root.add(garment);
  const meshes = collectMeshes(root);
  const bodyMeshes: THREE.Mesh[] = [];
  const garmentMeshes: THREE.Mesh[] = [];
  meshes.forEach((mesh) => {
    const kind = /garment/i.test(mesh.name) ? "garment" : "body";
    (kind === "garment" ? garmentMeshes : bodyMeshes).push(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = polishMaterial(kind);
    oldMaterials.forEach((mat) => mat?.dispose());
  });
  const sourceBody = [...bodyMeshes];
  const underMeshes: THREE.Mesh[] = [];
  garmentMeshes.forEach((mesh) => {
    const under = new THREE.Mesh(mesh.geometry.clone(), polishMaterial("body"));
    under.name = "body_under";
    under.castShadow = true;
    under.position.copy(mesh.position);
    under.quaternion.copy(mesh.quaternion);
    under.scale.copy(mesh.scale);
    mesh.parent?.add(under);
    underMeshes.push(under);
    bodyMeshes.push(under);
    liftAlongNormals(mesh.geometry, 0.004);
    garment.attach(mesh);
  });

  const complete = new THREE.Group();
  complete.name = "BodyComplete";
  complete.visible = false;
  root.add(complete);
  if (manifest.bodyCompleteUrl) {
    try {
      const extra = await loader.loadAsync(manifest.bodyCompleteUrl);
      extra.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = polishMaterial("body");
        oldMaterials.forEach((mat) => mat?.dispose());
        bodyMeshes.push(mesh);
      });
      complete.add(extra.scene);
    } catch {
      complete.clear();
    }
  }

  const setClothesVisible = (show: boolean) => {
    const filled = complete.children.length > 0;
    garment.visible = show;
    sourceBody.forEach((mesh) => { mesh.visible = show || !filled; });
    underMeshes.forEach((mesh) => { mesh.visible = !show && !filled; });
    complete.visible = !show && filled;
  };
  setClothesVisible(true);

  const bindAll = (name: string) =>
    [...bodyMeshes, ...garmentMeshes].map((mesh) => bindMorph(mesh, name)).filter((slot): slot is MorphSlot => slot !== null);
  const slots = {
    fat: bindAll(manifest.morphs.fat),
    belly: bindAll(manifest.morphs.belly),
    shoulder: bindAll(manifest.morphs.shoulder),
  };
  if (!bodyMeshes.length && !garmentMeshes.length) {
    throw new Error("GLB 里没有网格");
  }

  const applyBeta = (beta: Beta) => applyBetaToGlb(root, manifest, slots, beta);
  applyBeta(DEFAULT_BETA);

  return {
    root,
    garment,
    bodyMeshes,
    setClothesVisible,
    applyBeta,
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
