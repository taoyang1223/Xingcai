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
  measure,
  superEllipse,
  torsoAt,
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
};

const PARTS: PartSpec[] = [
  { rings: 84, from: 0.468, to: 1.0, n: 2.45, at: torsoAt, offset: () => 0, side: 0, capBottom: false, capTop: true },
  { rings: 44, from: 0.012, to: 0.58, n: 2.15, at: legAt, offset: legSpread, side: -1, capBottom: true, capTop: false },
  { rings: 44, from: 0.012, to: 0.58, n: 2.15, at: legAt, offset: legSpread, side: 1, capBottom: true, capTop: false },
  { rings: 40, from: 0.398, to: 0.845, n: 2.1, at: armAt, offset: armSpread, side: -1, forward: 0.012, capBottom: true, capTop: false },
  { rings: 40, from: 0.398, to: 0.845, n: 2.1, at: armAt, offset: armSpread, side: 1, forward: 0.012, capBottom: true, capTop: false },
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
      const e = superEllipse(a, b, th, spec.n);
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
  const dist = h / 0.80 / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(0, h * 0.54, dist);
  camera.lookAt(0, h * 0.54, 0);
  camera.updateProjectionMatrix();
}

const VIEWS = [
  { id: "front", label: "正面", angle: 0 },
  { id: "three", label: "45°", angle: -Math.PI / 4 },
  { id: "side", label: "侧面", angle: -Math.PI / 2 },
];

export default function Mannequin3D({ onBack, onSave }: { onBack: () => void; onSave: (b: Beta) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesRef = useRef<{ geom: THREE.BufferGeometry; spec: PartSpec }[]>([]);
  const proceduralMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const glbRef = useRef<GlbHandle | null>(null);
  const betaRef = useRef<Beta>(DEFAULT_BETA);
  const targetYaw = useRef(0);
  const yaw = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const [beta, setBeta] = useState<Beta>(DEFAULT_BETA);
  const [view, setView] = useState("front");
  const [fps, setFps] = useState(0);
  const [mode, setMode] = useState<AssetMode>(() => assetModeFromLocation());
  const [glbStatus, setGlbStatus] = useState<"idle" | "loading" | "ok" | "error" | "missing-morphs">("idle");
  const [glbError, setGlbError] = useState("");

  const girths = useMemo(() => measure(beta), [beta]);
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
      host.removeChild(renderer.domElement);
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
    glbRef.current?.dispose();
    glbRef.current = null;
  }

  function mountProcedural(betaNow: Beta) {
    const group = groupRef.current;
    const material = proceduralMatRef.current;
    if (!group || !material) return;
    clearVisual();
    meshesRef.current = PARTS.map((spec) => {
      const geom = buildGeometry(spec, RADIAL);
      writePositions(geom, spec, betaNow);
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = true;
      group.add(mesh);
      return { geom, spec };
    });
    setGlbStatus("idle");
    setGlbError("");
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
        group.add(handle.root);
        handle.applyBeta(betaRef.current);
        setGlbStatus(handle.status === "ok" ? "ok" : "missing-morphs");
        if (cameraRef.current) fitCamera(cameraRef.current, betaRef.current.heightCm);
      })
      .catch((e) => {
        if (cancelled) return;
        setGlbStatus("error");
        setGlbError(e instanceof Error ? e.message : "GLB 加载失败");
        mountProcedural(betaRef.current);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    targetYaw.current += (e.clientX - lastX.current) * 0.011;
    lastX.current = e.clientX;
    setView("");
  }
  function pointerUp() {
    dragging.current = false;
  }

  function pickView(id: string, angle: number) {
    setView(id);
    targetYaw.current = angle;
  }

  function switchMode(next: AssetMode) {
    setMode(next);
    const url = new URL(window.location.href);
    if (next === "glb") {
      if (url.hash.startsWith("#shape")) url.hash = "#shape?asset=glb";
      else url.searchParams.set("asset", "glb");
    } else {
      if (url.hash.startsWith("#shape")) url.hash = "#shape";
      else url.searchParams.delete("asset");
    }
    history.replaceState(null, "", url.toString());
  }

  const sliders: { key: keyof Beta; label: string; hint: (v: number) => string }[] = [
    { key: "fat", label: "整体胖瘦", hint: (v) => (v < 0.3 ? "偏瘦" : v < 0.55 ? "标准" : v < 0.78 ? "偏胖一点" : "偏胖") },
    { key: "belly", label: "肚子", hint: (v) => (v < 0.25 ? "平" : v < 0.5 ? "有一点" : v < 0.75 ? "明显" : "很明显") },
    { key: "shoulder", label: "肩宽", hint: (v) => (v < 0.3 ? "偏窄" : v < 0.7 ? "标准" : "偏宽") },
  ];

  return (
    <div className="page mq-page">
      <button className="linkbtn" onClick={onBack}>返回</button>
      <h1 className="h1" style={{ marginTop: 4 }}>调成你的样子</h1>
      <p className="muted" style={{ margin: "4px 0 10px" }}>拖动人台可以转；只有三个杆，不用回忆厘米数。</p>

      <div className="mq-modes" role="tablist" aria-label="人台资产">
        <button
          type="button"
          className={mode === "procedural" ? "mq-mode on" : "mq-mode"}
          onClick={() => switchMode("procedural")}
        >
          程序化
        </button>
        <button
          type="button"
          className={mode === "glb" ? "mq-mode on" : "mq-mode"}
          onClick={() => switchMode("glb")}
        >
          GLB 资产
        </button>
      </div>
      {mode === "glb" ? (
        <p className="mq-asset-note muted">
          {glbStatus === "loading" && "正在加载占位 GLB…"}
          {glbStatus === "ok" && `已加载 ${PLACEHOLDER_MANIFEST.assetId}（morph → β）`}
          {glbStatus === "missing-morphs" && "已加载，但部分 morph 名未对齐，请查 manifest"}
          {glbStatus === "error" && `加载失败，已回退程序化：${glbError}`}
          {glbStatus === "idle" && null}
        </p>
      ) : null}

      <div className="mq-stage">
        <div
          ref={hostRef}
          className="mq-canvas"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
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
      </div>

      {view === "side" ? (
        <p className="mq-tip">侧面负责腰腹厚度——「肚子」这根杆只有在这个角度才看得懂。</p>
      ) : null}

      <div className="mq-row">
        <label>身高</label>
        <input
          className="mq-num"
          type="number"
          min={140}
          max={200}
          value={beta.heightCm}
          onChange={(e) => setBeta({ ...beta, heightCm: Number(e.target.value) || 170 })}
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
            onChange={(e) => setBeta({ ...beta, [s.key]: Number(e.target.value) })}
          />
        </div>
      ))}

      <div className="mq-girths">
        <div className="mq-girths-h">
          <b>同一组 β 上量出来的</b>
          <span className="muted">示意值，非真实档案</span>
        </div>
        <div className="mq-girths-row">
          <span>胸围 {girths.chest.toFixed(1)}</span>
          <span>腰围 {girths.waist.toFixed(1)}</span>
          <span>臀围 {girths.hip.toFixed(1)}</span>
        </div>
        <p className="muted">
          {mode === "glb"
            ? "围度仍由 measure(β) 计算；GLB 只负责显示。换成美术资产后两边不能打架。"
            : "拖杆时数字跟着动——网格和围度是同一组参数，不会对不上。"}
        </p>
      </div>

      <button className="btn btn-primary" onClick={() => onSave(beta)}>像了，存成我的人台</button>
      <p className="muted" style={{ marginTop: 10 }}>捏出来的仍是弱档，拍照后才会准。</p>
    </div>
  );
}
