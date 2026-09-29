import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  Beta,
  DEFAULT_BETA,
  RADIAL,
  armAt,
  armSpread,
  legAt,
  legSpread,
  BACK_NECK_H,
  CROTCH_H,
  TEE_HEM_H,
  WIDTH_STATIONS,
  crotchHeightCm,
  teeLengthCm,
  fitWidths,
  previewDimensions,
  sectionWidthCm,
  superEllipse,
  torsoAt,
  type WidthKey,
} from "./body";
import { loadGlbMannequin, type GlbHandle } from "./glbDriver";
import {
  PLACEHOLDER_MANIFEST,
  assetModeFromLocation,
  type AssetMode,
} from "./manifest";
import "./mannequin.css";

type PartSpec = {
  rings: number;
  from: number;
  to: number;
  n: number;
  at: (beta: Beta, h: number) => { a: number; b: number };
  offset: (beta: Beta, h: number) => number;
  side: 1 | -1 | 0;
  capBottom: boolean;
  capTop: boolean;
  /** 向前偏移，单位为身高占比。手臂略靠前，侧面才看得见腰腹轮廓 */
  forward?: number;
  shell?: number;
  limb?: "torso" | "leg" | "arm";
};

const BODY_PARTS: PartSpec[] = [
  { rings: 84, from: 0.468, to: 1.0, n: 2.45, at: torsoAt, offset: () => 0, side: 0, capBottom: false, capTop: true, limb: "torso" },
  { rings: 44, from: 0.012, to: 0.58, n: 2.15, at: legAt, offset: legSpread, side: -1, capBottom: true, capTop: false, limb: "leg" },
  { rings: 44, from: 0.012, to: 0.58, n: 2.15, at: legAt, offset: legSpread, side: 1, capBottom: true, capTop: false, limb: "leg" },
  { rings: 40, from: 0.398, to: 0.845, n: 2.1, at: armAt, offset: armSpread, side: -1, forward: 0.012, capBottom: true, capTop: false, limb: "arm" },
  { rings: 40, from: 0.398, to: 0.845, n: 2.1, at: armAt, offset: armSpread, side: 1, forward: 0.012, capBottom: true, capTop: false, limb: "arm" },
];

const GARMENT_PARTS: PartSpec[] = [
  { rings: 35, from: TEE_HEM_H, to: 0.825, n: 2.45, at: torsoAt, offset: () => 0, side: 0, shell: 0.009, capBottom: false, capTop: false },
  { rings: 20, from: 0.66, to: 0.825, n: 2.1, at: armAt, offset: armSpread, side: -1, forward: 0.012, shell: 0.007, capBottom: false, capTop: false },
  { rings: 20, from: 0.66, to: 0.825, n: 2.1, at: armAt, offset: armSpread, side: 1, forward: 0.012, shell: 0.007, capBottom: false, capTop: false },
];

function buildGeometry(spec: PartSpec, radial: number) {
  const rings = spec.rings;
  const count = rings * radial + (spec.capBottom ? 1 : 0) + (spec.capTop ? 1 : 0);
  const positions = new Float32Array(count * 3);
  const index: number[] = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const c = (i + 1) * radial + j2;
      const d = i * radial + j2;
      index.push(a, b, c, a, c, d);
    }
  }
  let cap = rings * radial;
  for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial;
    if (spec.capBottom) index.push(cap, j2, j);
    if (spec.capTop) {
      const top = cap + (spec.capBottom ? 1 : 0);
      index.push(top, (rings - 1) * radial + j, (rings - 1) * radial + j2);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(index);
  return geom;
}

function writePositions(geom: THREE.BufferGeometry, spec: PartSpec, beta: Beta) {
  const attr = geom.getAttribute("position") as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const hm = beta.heightCm / 100;
  const dz = (spec.forward ?? 0) * hm;
  let p = 0;
  for (let i = 0; i < spec.rings; i++) {
    const h = spec.from + ((spec.to - spec.from) * i) / (spec.rings - 1);
    const { a, b } = spec.at(beta, h);
    const dx = spec.offset(beta, h) * spec.side * hm;
    for (let j = 0; j < RADIAL; j++) {
      const th = (j / RADIAL) * Math.PI * 2;
      const e = superEllipse(a + (spec.shell ?? 0), b + (spec.shell ?? 0), th, spec.n);
      arr[p++] = e.x * hm + dx;
      arr[p++] = h * hm;
      arr[p++] = e.z * hm + dz;
    }
  }
  if (spec.capBottom) {
    const capLow = spec.at(beta, spec.from);
    const dx = spec.offset(beta, spec.from) * spec.side * hm;
    arr[p++] = dx;
    arr[p++] = spec.from * hm + capLow.b * hm * 0.1;
    arr[p++] = dz;
  }
  if (spec.capTop) {
    const capTop = spec.at(beta, spec.to);
    const dx = spec.offset(beta, spec.to) * spec.side * hm;
    arr[p++] = dx;
    arr[p++] = spec.to * hm + capTop.b * hm * 0.45;
    arr[p++] = dz;
  }
  attr.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
}

/** 让人台不论多高都占满画面同样的比例 */
function fitCamera(camera: THREE.PerspectiveCamera, heightCm: number) {
  const h = heightCm / 100;
  const dist = h / 0.70 / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(0, h * 0.46, dist);
  camera.lookAt(0, h * 0.46, 0);
  camera.updateProjectionMatrix();
}

const rulerPoint = new THREE.Vector3();

function rulerScreen(group: THREE.Object3D, camera: THREE.Camera, x: number, y: number, z: number, width: number, height: number) {
  rulerPoint.set(x, y, z);
  group.localToWorld(rulerPoint);
  rulerPoint.project(camera);
  return {
    x: (rulerPoint.x * 0.5 + 0.5) * width,
    y: (-rulerPoint.y * 0.5 + 0.5) * height,
  };
}

function drawMannequinRulers(svg: SVGSVGElement, host: HTMLElement, camera: THREE.Camera, group: THREE.Object3D, beta: Beta) {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width < 20 || height < 20) return;
  group.updateMatrixWorld();
  const meters = beta.heightCm / 100;
  const head = rulerScreen(group, camera, 0, meters, 0, width, height);
  const foot = rulerScreen(group, camera, 0, 0.012 * meters, 0, width, height);
  const half = (key: WidthKey) => sectionWidthCm(beta, WIDTH_STATIONS[key]) / 200;
  const shoulder = half("shoulder");
  const left = rulerScreen(group, camera, -shoulder, 0.02 * meters, 0, width, height);
  const right = rulerScreen(group, camera, shoulder, 0.02 * meters, 0, width, height);
  const center = (left.x + right.x) / 2;
  const halfPx = Math.abs(right.x - center);
  const rulerX = Math.min(Math.max(Math.max(left.x, right.x) + 14, width * 0.56), width - 78);
  const parts: string[] = [];
  parts.push(`<line x1="${rulerX}" y1="${head.y}" x2="${rulerX}" y2="${foot.y}"/>`);
  for (let cm = 0; cm <= beta.heightCm + 0.1; cm += 10) {
    const y = rulerScreen(group, camera, 0, (cm / beta.heightCm) * meters, 0, width, height).y;
    const major = cm % 20 === 0;
    parts.push(`<line x1="${rulerX}" y1="${y}" x2="${rulerX + (major ? 9 : 5)}" y2="${y}"/>`);
    if (major) parts.push(`<text x="${rulerX + 12}" y="${y + 3}" text-anchor="start">${cm}</text>`);
  }
  const crotchCm = crotchHeightCm(beta);
  const crotchY = rulerScreen(group, camera, 0, CROTCH_H * meters, 0, width, height).y;
  const floorY = rulerScreen(group, camera, 0, 0, 0, width, height).y;
  const crotchEdge = rulerScreen(group, camera, torsoAt(beta, CROTCH_H).a * meters, CROTCH_H * meters, 0, width, height);
  const dimX = rulerX - 12;
  const leadStart = Math.min(crotchEdge.x + 2, dimX - 8);
  parts.push(`<line x1="${leadStart}" y1="${crotchY}" x2="${rulerX + 9}" y2="${crotchY}"/>`);
  parts.push(`<line x1="${dimX}" y1="${floorY}" x2="${dimX}" y2="${crotchY}"/>`);
  parts.push(`<polygon points="${dimX},${crotchY} ${dimX - 3.5},${crotchY + 8} ${dimX + 3.5},${crotchY + 8}"/>`);
  parts.push(`<polygon points="${dimX},${floorY} ${dimX - 3.5},${floorY - 8} ${dimX + 3.5},${floorY - 8}"/>`);
  parts.push(`<text x="${leadStart}" y="${crotchY - 6}" text-anchor="end">裆高 ${crotchCm.toFixed(1)}</text>`);
  const neckY = rulerScreen(group, camera, 0, BACK_NECK_H * meters, 0, width, height).y;
  const hemY = rulerScreen(group, camera, 0, TEE_HEM_H * meters, 0, width, height).y;
  const neckEdge = rulerScreen(group, camera, -torsoAt(beta, BACK_NECK_H).a * meters, BACK_NECK_H * meters, 0, width, height);
  const hemEdge = rulerScreen(group, camera, -torsoAt(beta, TEE_HEM_H).a * meters, TEE_HEM_H * meters, 0, width, height);
  const teeX = Math.min(neckEdge.x, hemEdge.x) - 14;
  parts.push(`<line x1="${neckEdge.x}" y1="${neckY}" x2="${rulerX + 9}" y2="${neckY}"/>`);
  parts.push(`<line x1="${hemEdge.x}" y1="${hemY}" x2="${rulerX + 9}" y2="${hemY}"/>`);
  parts.push(`<line x1="${teeX}" y1="${neckY}" x2="${teeX}" y2="${hemY}"/>`);
  parts.push(`<polygon points="${teeX},${neckY} ${teeX - 3.5},${neckY + 8} ${teeX + 3.5},${neckY + 8}"/>`);
  parts.push(`<polygon points="${teeX},${hemY} ${teeX - 3.5},${hemY - 8} ${teeX + 3.5},${hemY - 8}"/>`);
  parts.push(`<text x="${Math.max(4, teeX - 6)}" y="${(neckY + hemY) / 2}" text-anchor="end">后领到衣摆 ${teeLengthCm(beta).toFixed(1)}</text>`);
  parts.push(`<text x="${rulerX + 12}" y="${Math.max(12, head.y - 6)}" text-anchor="start">身高 ${beta.heightCm.toFixed(0)}</text>`);
  const soleY = Math.max(
    foot.y,
    rulerScreen(group, camera, 0, 0, 0.06 * meters, width, height).y,
    rulerScreen(group, camera, shoulder, 0, 0.05 * meters, width, height).y,
    rulerScreen(group, camera, -shoulder, 0, 0.05 * meters, width, height).y
  );
  const shoulderCm = sectionWidthCm(beta, WIDTH_STATIONS.shoulder);
  const barY = Math.min(soleY + 22, height - 46);
  const originX = center - halfPx;
  const pxPerCm = (halfPx * 2) / shoulderCm;
  parts.push(`<line x1="${originX}" y1="${barY}" x2="${originX + shoulderCm * pxPerCm}" y2="${barY}"/>`);
  for (let cm = 0; cm <= shoulderCm + 0.1; cm += 5) {
    const x = originX + cm * pxPerCm;
    const major = cm % 10 === 0;
    parts.push(`<line x1="${x}" y1="${barY}" x2="${x}" y2="${barY + (major ? 8 : 4)}"/>`);
    if (major) parts.push(`<text x="${x}" y="${barY + 18}" text-anchor="middle">${cm}</text>`);
  }
  const widthNotes = (["shoulder", "chest", "waist", "hip"] as WidthKey[])
    .map((key) => `${{ shoulder: "肩", chest: "胸", waist: "腰", hip: "臀" }[key]}${sectionWidthCm(beta, WIDTH_STATIONS[key]).toFixed(1)}`)
    .join("  ");
  parts.push(`<text x="${center}" y="${Math.min(barY + 32, height - 4)}" text-anchor="middle">${widthNotes}</text>`);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = parts.join("");
}

const VIEWS = [
  { id: "front", label: "正面", angle: 0 },
  { id: "three", label: "45°", angle: -Math.PI / 4 },
  { id: "side", label: "侧面", angle: -Math.PI / 2 },
];

export default function Mannequin3D({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesRef = useRef<{ geom: THREE.BufferGeometry; spec: PartSpec }[]>([]);
  const hitTargetsRef = useRef<THREE.Object3D[]>([]);
  const garmentRef = useRef<THREE.Group | null>(null);
  const proceduralMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const garmentMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const glbRef = useRef<GlbHandle | null>(null);
  const betaRef = useRef<Beta>(DEFAULT_BETA);
  const targetYaw = useRef(0);
  const yaw = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const pointerStart = useRef({ x: 0, y: 0 });
  const pointerMoved = useRef(false);
  const [beta, setBeta] = useState<Beta>(DEFAULT_BETA);
  const [view, setView] = useState("front");
  const [fps, setFps] = useState(0);
  const [mode] = useState<AssetMode>(() => assetModeFromLocation());
  const [glbStatus, setGlbStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [glbError, setGlbError] = useState("");
  const [showGarment, setShowGarment] = useState(true);
  const [detail, setDetail] = useState<"hand" | "foot" | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [heightEntered, setHeightEntered] = useState(false);
  const [manualWidths, setManualWidths] = useState<Partial<Record<WidthKey, true>>>({});
  const [widthDraft, setWidthDraft] = useState<{ key: WidthKey; text: string } | null>(null);
  const [fitNote, setFitNote] = useState("");

  function clearWidthFit() {
    setManualWidths({});
    setWidthDraft(null);
    setFitNote("");
  }

  function commitWidth(key: WidthKey, raw: string) {
    const value = Number(raw);
    const result = fitWidths(betaRef.current, { [key]: value });
    setWidthDraft(null);
    if (!result.ok) {
      setFitNote(result.reason);
      return;
    }
    setBeta(result.beta);
    setManualWidths({ [key]: true });
    setFitNote("已按手填截面宽度调整示意人体。这不是围度，也不会保存。");
  }

  const dimensions = useMemo(() => previewDimensions(beta, heightEntered), [beta, heightEntered]);
  betaRef.current = beta;

  // 场景只建一次；程序化 / GLB 在 group 里切换
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    host.appendChild(renderer.domElement);
    const ruler = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ruler.setAttribute("class", "mq-ruler");
    ruler.setAttribute("aria-label", "身高和宽度刻度");
    host.parentElement?.appendChild(ruler);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(32, host.clientWidth / host.clientHeight, 0.1, 30);
    cameraRef.current = camera;
    fitCamera(camera, DEFAULT_BETA.heightCm);

    const key = new THREE.DirectionalLight(0xfff6e8, 2.2);
    key.position.set(1.5, 3.05, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 9;
    key.shadow.camera.left = -1.3;
    key.shadow.camera.right = 1.3;
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -0.3;
    key.shadow.bias = -0.0012;
    key.shadow.radius = 3;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xdfeaf5, 1.15);
    rim.position.set(-2.4, 1.9, -2.1);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc7bb, 0.5));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 64).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.26 })
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const material = new THREE.MeshPhysicalMaterial({
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
    proceduralMatRef.current = material;
    garmentMatRef.current = new THREE.MeshStandardMaterial({ color: 0x3a8e87, roughness: 0.92, side: THREE.DoubleSide });

    const group = new THREE.Group();
    groupRef.current = group;
    scene.add(group);

    let raf = 0;
    let frames = 0;
    let tick = performance.now();
    const loop = () => {
      yaw.current += (targetYaw.current - yaw.current) * 0.12;
      group.rotation.y = yaw.current;
      renderer.render(scene, camera);
      try {
        drawMannequinRulers(ruler, host, camera, group, betaRef.current);
      } catch {
        ruler.replaceChildren();
      }
      frames++;
      const now = performance.now();
      if (now - tick > 1000) {
        setFps(Math.round((frames * 1000) / (now - tick)));
        frames = 0;
        tick = now;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      if (!host.clientWidth) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      renderer.render(scene, camera);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      clearVisual();
      renderer.dispose();
      pmrem.dispose();
      material.dispose();
      garmentMatRef.current?.dispose();
      scene.environment?.dispose();
      host.removeChild(renderer.domElement);
      ruler.remove();
      groupRef.current = null;
      cameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 场景只初始化一次
  }, []);

  function clearVisual() {
    const group = groupRef.current;
    if (group) {
      while (group.children.length) group.remove(group.children[0]);
    }
    meshesRef.current.forEach((m) => m.geom.dispose());
    meshesRef.current = [];
    hitTargetsRef.current = [];
    garmentRef.current = null;
    glbRef.current?.dispose();
    glbRef.current = null;
  }

  function mountProcedural(betaNow: Beta, keepError = false) {
    const group = groupRef.current;
    const material = proceduralMatRef.current;
    if (!group || !material) return;
    clearVisual();
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "DemoBody";
    const garmentGroup = new THREE.Group();
    garmentGroup.name = "DemoGarment";
    garmentGroup.visible = showGarment;
    garmentRef.current = garmentGroup;
    group.add(bodyGroup, garmentGroup);
    hitTargetsRef.current = [bodyGroup];
    meshesRef.current = [
      ...BODY_PARTS.map((spec) => ({ spec, parent: bodyGroup, mat: material })),
      ...GARMENT_PARTS.map((spec) => ({ spec, parent: garmentGroup, mat: garmentMatRef.current! })),
    ].map(({ spec, parent, mat }) => {
      const geom = buildGeometry(spec, RADIAL);
      writePositions(geom, spec, betaNow);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.userData.limb = spec.limb;
      parent.add(mesh);
      return { geom, spec };
    });
    if (!keepError) {
      setGlbStatus("idle");
      setGlbError("");
    }
  }

  // 切换资产模式
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    let cancelled = false;

    if (mode === "procedural") {
      mountProcedural(betaRef.current);
      if (cameraRef.current) fitCamera(cameraRef.current, betaRef.current.heightCm);
      return;
    }

    setGlbStatus("loading");
    setGlbError("");
    clearVisual();
    loadGlbMannequin(PLACEHOLDER_MANIFEST)
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        glbRef.current = handle;
        hitTargetsRef.current = handle.bodyMeshes;
        garmentRef.current = handle.garment;
        handle.setClothesVisible(showGarment);
        group.add(handle.root);
        handle.applyBeta(betaRef.current);
        setGlbStatus("ok");
        if (cameraRef.current) fitCamera(cameraRef.current, betaRef.current.heightCm);
      })
      .catch((e) => {
        if (cancelled) return;
        setGlbStatus("error");
        setGlbError(e instanceof Error ? e.message : "GLB 加载失败");
        mountProcedural(betaRef.current, true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    glbRef.current?.setClothesVisible(showGarment);
    if (!glbRef.current && garmentRef.current) garmentRef.current.visible = showGarment;
  }, [showGarment]);

  useEffect(() => {
    if (glbRef.current) {
      glbRef.current.applyBeta(beta);
    } else {
      meshesRef.current.forEach(({ geom, spec }) => writePositions(geom, spec, beta));
    }
    if (cameraRef.current) fitCamera(cameraRef.current, beta.heightCm);
  }, [beta]);

  function pointerDown(e: React.PointerEvent) {
    dragging.current = true;
    pointerMoved.current = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    if (Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y) > 6) pointerMoved.current = true;
    targetYaw.current += (e.clientX - lastX.current) * 0.011;
    lastX.current = e.clientX;
    setView("");
  }
  function pointerUp(e: React.PointerEvent) {
    if (dragging.current && !pointerMoved.current && cameraRef.current && groupRef.current) {
      const canvas = e.currentTarget;
      const bounds = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((e.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cameraRef.current);
      const hit = ray.intersectObjects(hitTargetsRef.current, true)[0];
      if (hit && groupRef.current) {
        const local = groupRef.current.worldToLocal(hit.point.clone());
        const part = local.y / (betaRef.current.heightCm / 100);
        const limb = hit.object.userData.limb;
        if (limb === "leg" && part < 0.22) setDetail("foot");
        else if (limb === "arm" && part < 0.55) setDetail("hand");
      }
    }
    dragging.current = false;
  }

  useEffect(() => {
    if (detail) detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [detail]);

  function pickView(id: string, angle: number) {
    setView(id);
    targetYaw.current = angle;
  }

  const sliders: { key: keyof Beta; label: string; hint: (v: number) => string }[] = [
    { key: "fat", label: "整体胖瘦", hint: (v) => (v < 0.3 ? "偏瘦" : v < 0.55 ? "标准" : v < 0.78 ? "偏胖一点" : "偏胖") },
    { key: "belly", label: "肚子", hint: (v) => (v < 0.25 ? "平" : v < 0.5 ? "有一点" : v < 0.75 ? "明显" : "很明显") },
    { key: "shoulder", label: "肩宽", hint: (v) => (v < 0.3 ? "偏窄" : v < 0.7 ? "标准" : "偏宽") },
  ];

  return (
    <div className="page mq-page">
      <button className="linkbtn" onClick={onBack}>返回</button>
      <h1 className="h1" style={{ marginTop: 4 }}>人台 · 本地演示</h1>
      <p className="muted" style={{ margin: "4px 0 10px" }}>以下数字仅为演示网格推算，不是你的测量结果。拖动旋转，滑杆实时校准 3D；离开本页即丢弃，不保存、不上传。</p>

      {glbStatus === "error" ? (
        <p className="mq-asset-note muted">外形文件没有加载成功，当前显示的是参数人台。{glbError}</p>
      ) : null}

      <label className="mq-toggle">
        <input type="checkbox" checked={showGarment} onChange={(e) => setShowGarment(e.target.checked)} />
        显示独立示意衣服（非试穿、非正式服装资产）
      </label>
      <div className="mq-stage">
        <div
          ref={hostRef}
          className="mq-canvas"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => { dragging.current = false; }}
        />
        <div className="mq-views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? "mq-view on" : "mq-view"}
              onClick={() => pickView(v.id, v.angle)}
            >
              {v.label}
            </button>
          ))}
        </div>
        {fps > 0 ? <div className="mq-fps">{fps} fps</div> : null}
        <div className="mq-part-actions" aria-label="手脚详情">
          <button type="button" onClick={() => setDetail("hand")}>手部详情</button>
          <button type="button" onClick={() => setDetail("foot")}>脚部详情</button>
        </div>
      </div>
      {detail ? (
        <div className="mq-detail" ref={detailRef} role="region" aria-label={`${detail === "hand" ? "手" : "脚"}部详情`}>
          <div className="mq-detail-head"><b>{detail === "hand" ? "手部" : "脚部"}详情</b><button type="button" onClick={() => setDetail(null)} aria-label="关闭详情">关闭</button></div>
          {(detail === "hand" ? ["手掌长", "手掌宽", "手腕围", "臂长"] : ["脚长", "脚宽", "足围"]).map((item) => (
            <div className="mq-detail-row" key={item}><span>{item}</span><span>未测 · 无照片测算值</span></div>
          ))}
          <p className="muted">示意网格的末端形状不代表真实手脚尺寸；此处不生成估值。</p>
        </div>
      ) : null}

      {view === "side" ? (
        <p className="mq-tip">侧面负责腰腹厚度——「肚子」这根杆只有在这个角度才看得懂。</p>
      ) : null}

      <div className="mq-row">
        <label htmlFor="mq-height">身高 · 手工录入仅本页</label>
        <input
          id="mq-height"
          className="mq-num"
          type="number"
          min={140}
          max={200}
          defaultValue={DEFAULT_BETA.heightCm}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value >= 140 && value <= 200) {
              setBeta((current) => ({ ...current, heightCm: value }));
              setHeightEntered(true);
              clearWidthFit();
            }
          }}
        />
        <span className="muted">厘米</span>
      </div>

      {sliders.map((s) => (
        <div className="mq-slider" key={s.key}>
          <div className="mq-slider-h">
            <b>{s.label}</b>
            <span>{s.hint(beta[s.key] as number)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={beta[s.key] as number}
            onChange={(e) => {
              clearWidthFit();
              setBeta({ ...beta, [s.key]: Number(e.target.value) });
            }}
          />
        </div>
      ))}

      <div className="mq-dimensions">
        <section className="mq-girths" aria-label="底部宽度面板">
          <div className="mq-girths-h"><b>底部宽度 · 演示估值</b></div>
          <div className="mq-girths-row">
            {dimensions.widths.map((item) => {
              const key = item.key as WidthKey;
              return (
                <label className="mq-dimension" key={item.label}>
                  <span>{item.label}</span>
                  <input
                    inputMode="decimal"
                    aria-label={item.label}
                    value={widthDraft?.key === key ? widthDraft.text : (item.value?.toFixed(1) ?? "")}
                    onFocus={() => setWidthDraft({ key, text: item.value?.toFixed(1) ?? "" })}
                    onChange={(e) => setWidthDraft({ key, text: e.target.value })}
                    onBlur={(e) => commitWidth(key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <small>{manualWidths[key] ? "手工录入 · 仅本页" : item.source}</small>
                </label>
              );
            })}
          </div>
          <p className="muted">这里改的是网格截面左右宽度，不是胸围等围度。胸宽和臀宽会一起带动胖瘦；改不动时保持原模型。不会保存或上传。</p>
          {fitNote ? <p className="muted">{fitNote}</p> : null}
        </section>
        <section className="mq-height-panel" aria-label="右侧身高和上下身面板">
          <b>身高 / 裆高</b>
          {dimensions.heights.map((item) => (
            <div className="mq-height-item" key={item.label}>
              <span>{item.label}</span><strong>{item.value?.toFixed(1)} cm</strong><small>{item.source}</small>
            </div>
          ))}
          <p className="muted">裆高从地面量到两腿分叉处。后领到衣摆停在臀围最宽处，那里只比分叉处高出大约 4 厘米。不是袖长，也不是真实衣服量出来的衣长。</p>
        </section>
      </div>
      <button className="btn btn-outline" onClick={onBack}>结束本地预览（不保存）</button>
      <p className="muted" style={{ marginTop: 10 }}>无身体数据写入、无拍照、无上传；请勿将演示估值用于选码。</p>
    </div>
  );
}
