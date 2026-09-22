# 12 · App 三维展示与 DCC 资产对接调研

> 读者：产品、客户端、算法、美术/外包  
> 状态：调研备忘（2026-09-22）—— **不定排期**，不定推翻《11》8.7 的 three.js / B 档结论  
> 目的：把「App 怎么展示 3D」「怎么对接 Maya 等建模软件」收成可检索的一页：标准、开源、文献、与我们 `Beta` 的对齐  
> 上游：《11》8.7～8.7.3、《10》人体模型、《04》算法；代码真源：`apps/fitme/src/mannequin/body.ts`

本文只回答：别人怎么做、开源/文献在哪、我们怎么接。  
不写具体接口字段（那是阶段 1 拆解）、不替代《11》当期口径。

---

## 1. 业界已收敛的结论

**App 运行时不直连 Maya / Blender。**  
建模软件是**离线工厂**；对接面是 **glTF 2.0（通常交付 `.glb`）+ 变形通道命名约定 + 参数映射表**。

```
DCC（Maya / Blender / …）
  → 雕模 / UV / PBR / BlendShape
  → 导出 .glb（可选 Draco / KTX2 压缩）
  → CDN 或包内资源（进捏人页再拉）
  → 运行时：Web = three.js / Babylon；原生 = Filament / SceneKit / RealityKit
  → β（或围度）→ morph 权重 / 骨骼比例 → 屏幕上的人
```

两条必须分开记的技术线：

| 线 | 解决什么 | 典型产出 |
| --- | --- | --- |
| **A 显示与资产** | 好看、可转、可捏 | GLB、材质、morph、光照 |
| **B 体型与选码** | 准、可解释、降退货 | \(\beta\)、22 项围度、推荐引擎 |

Zalando 等公开材料里，B 谈得多、A 的引擎细节几乎不公开；**不要从「虚拟试衣宣传」反推必须用 Unity**。

与《11》对齐：阶段 1 = L2 实时网格 + B 档磨砂无头；Unity/UE 属 C 档上限，阶段 4 再议。

---

## 2. 交换格式与 DCC 导出（对接 Maya 的「正道」）

### 2.1 标准

| 资源 | 链接 | 我们怎么用 |
| --- | --- | --- |
| **Khronos glTF 2.0** | https://github.com/KhronosGroup/glTF | **唯一推荐交付格式**；含 mesh、PBR、morph、动画 |
| glTF Sample Models | https://github.com/KhronosGroup/glTF-Sample-Models | 验收加载器、看 morph 样例 |
| glTF-Transform（压缩/批处理） | https://github.com/donmccurdy/glTF-Transform | CI 里压 Draco/网格；对齐《11》包体积 ≤ 2 MB |

术语对照（必须写进外包合同）：

| Maya | Blender | three.js / glTF |
| --- | --- | --- |
| Blend Shape | Shape Key | Morph Target |
| Lambert/AI Standard Surface → 烘到金属度粗糙度 | Principled BSDF | `metallicRoughness` PBR |
| Y-up（约定） | Z-up 导出时常转 Y-up | 运行时按 manifest 校验 |

### 2.2 从各 DCC 到 GLB

| 工具 | 现实路径 | 备注 |
| --- | --- | --- |
| **Blender** | 原生导出 glTF/GLB | 开源团队首选；Shape Key → morph 最稳 |
| **Maya** | [Maya2glTF](https://github.com/WonderMediaProductions/Maya2glTF)；或 FBX → Blender → GLB；或 FBX2glTF | Autodesk 无一流官方 glTF；导出后**必须**用巴比伦/three 查看器双端验 |
| **3ds Max** | 类似：插件或经 Blender | 同 Maya，最终仍交 GLB |
| **不要指望** | Maya nCloth 点缓存直接进手机 | 须先烘焙成 morph 序列或骨骼动画（three.js 论坛多例） |

验收查看器（不装 App 也能卡导出问题）：

- https://gltf-viewer.donmccurdy.com/
- https://sandbox.babylonjs.com/

### 2.3 建议交付物清单（给美术/外包）

1. `mannequin_vN.glb`（无头、≤ 5k 三角面、Draco 可选）  
2. `mannequin_vN.manifest.json`（见第 4 节 schema）  
3. 授权证明 → 仓内 `docs/licenses/`（或本目录旁 `licenses/`，与《11》8.7 一致）  
4. 三视图 PNG（标准体 / 拉满肚子 / 拉满肩）便于产品评审  

---

## 3. App 展示层：开源路线图

### 3.1 Web（与当前 `apps/fitme` 同栈）

| 项目 | 链接 | 用途 |
| --- | --- | --- |
| three.js | https://github.com/mrdoob/three.js | `GLTFLoader` + `morphTargetInfluences` |
| react-three-fiber | https://github.com/pmndrs/react-three-fiber | React 声明式场景（可选，非必须） |
| drei | https://github.com/pmndrs/drei | `useGLTF`、环境光、控件 |
| **gltfjsx** | https://github.com/pmndrs/gltfjsx | GLB → 可改材质/morph 的 React 组件 |
| Babylon.js | https://github.com/BabylonJS/Babylon.js | 备选引擎；同吃 glTF |

实践向教程 / 仓库：

| 资源 | 链接 | 相关性 |
| --- | --- | --- |
| Character Configurator（R3F + morph） | https://wawasensei.dev/tuto/how-to-create-a-character-configurator-screen-using-three-js-and-react-three-fiber | 滑杆改表情/外观的同类 UX |
| glTF Explorer（看 morph、导出 R3F） | https://github.com/dannyshmueli/glTF-explorer | 验收外包 GLB、生成接入草稿 |
| mbt-3d（npm） | https://www.npmjs.com/package/mbt-3d | 角色查看 + morph 组件封装，可参考 API 形态 |

**移动 Web 注意**：同时激活的 morph 在 WebGL1 上大约 4～8 个上限；WebGL2 可用纹理存更多，但低端机要实测（three.js [#24545](https://github.com/mrdoob/three.js/issues/24545)）。我们阶段 1 只有 3 个形态目标 + 身高缩放，远在安全区。

### 3.2 原生（与《10》原 Flutter 路线对齐时）

| 项目 | 链接 | 用途 |
| --- | --- | --- |
| Google Filament | https://github.com/google/filament | Android（及跨平台）PBR + glTF |
| Apple SceneKit / RealityKit | Apple 文档 | iOS；同样吃 USDZ/或自转 glTF 管线 |
| Filament glTF 样例 | Filament 仓 `samples` | 对标 Web 同一 GLB |

原则（《11》8.7.1）：**人体资产（GLB + morph）与 \(\beta\)→变形映射两端通用**，禁止 Web / Flutter 各做一套网格语义。

### 3.3 游戏引擎（仅作对照，非阶段 1）

| 方案 | 何时考虑 | 代价（摘自《11》8.7.3） |
| --- | --- | --- |
| Unity | C 档写实 / 复杂布料预研 | 原生 +30～50 MB；WebGL 更重 |
| Unreal / Style3D 类 | B 端打版、服务端仿真 | 工作站或按分钟算力，非手机主路径 |

---

## 4. 与我们 `Beta` 的对齐（对接合同）

代码真源（阶段 1 最小 \(\beta\)）：

```ts
// apps/fitme/src/mannequin/body.ts
export type Beta = {
  heightCm: number; // 身高 cm
  fat: number;      // 0..1 整体胖瘦
  belly: number;    // 0..1 肚子（侧面厚度关键）
  shoulder: number; // 0..1 肩宽
};
```

### 4.1 推荐 morph 命名（写入 manifest，禁止随意改名）

| `Beta` 字段 | glTF morph 名 | 权重 | 运行时 |
| --- | --- | --- | --- |
| `fat` | `BS_Fat` | 0 → 1 | `morphTargetInfluences[i] = beta.fat` |
| `belly` | `BS_Belly` | 0 → 1 | 同上 |
| `shoulder` | `BS_Shoulder` | 0 → 1 | 同上 |
| `heightCm` | **不做 morph** | — | 根节点均匀或 `scale.y`（须在 manifest 声明） |

基准网格 =「标准体」（对应大约 `DEFAULT_BETA`：170 / 0.45 / 0.35 / 0.5）。  
morph 拉满 = 滑杆 = 1 时的视觉上限；**不得**用负权重表达「瘦」，瘦侧靠基准网格设计或单独 `BS_FatThin`（若加第四通道须改 `Beta` 并改《02》字典流程）。

### 4.2 `manifest.json` 最小 schema（草案）

```json
{
  "assetId": "mannequin_headless_v1",
  "format": "glb",
  "units": "meters",
  "upAxis": "Y",
  "headless": true,
  "triangleCountMax": 5000,
  "baseHeightCm": 170,
  "heightMode": "uniformScale",
  "morphs": {
    "fat": "BS_Fat",
    "belly": "BS_Belly",
    "shoulder": "BS_Shoulder"
  },
  "licenseRef": "docs/licenses/mannequin_v1.txt",
  "notes": "无脸；磨砂皮肤；T 或 A-pose 写清"
}
```

### 4.3 算法层与显示层分工（禁止打架）

| 职责 | 谁做 | 说明 |
| --- | --- | --- |
| 档案真相 | \(M(\beta)\) / 围度字段 | 《11》8.1A；SDK 不当真相 |
| 屏幕网格 | GLB + morph **或** 现程序化网格 | 可并行对照一个版本 |
| 胸腰臀读数 | `measure(beta)` 或预烘焙表 | **不得**只从屏幕像素估 |
| 照片反解 | 只改 \(\beta\) 来源 | 不改 morph 名、不改字段字典 |

切换美术资产时的验收：**同一 \(\beta\)，视觉肚子/肩与 `measure` 读数不矛盾**（允许小偏差，不许「数字 81、看起来像 90」无说明）。

### 4.4 程序化人台 → GLB 的过渡

| 阶段 | 显示 | 围度 |
| --- | --- | --- |
| 现在 | `Mannequin3D` 程序化截面 | `measure(beta)` 同源 |
| 接 GLB 后 | 优先 GLB；程序化可留「调试开关」 | 仍 `measure`；或美术提供校准表 |
| 资产未就绪 | 禁止阻塞选码内核 | 《11》：3D 超期先砍显示保推荐 |

**已落地骨架（2026-09-22）**

| 路径 | 作用 |
| --- | --- |
| `apps/fitme/src/mannequin/manifest.ts` | `Beta`↔morph 合同、`PLACEHOLDER_MANIFEST`、`?asset=glb` |
| `apps/fitme/src/mannequin/glbDriver.ts` | `GLTFLoader` + `applyBeta`（身高缩放 + 三 morph） |
| `apps/fitme/public/mannequin/mannequin_headless_v1.glb` | 占位无头胶囊（`npm run gen:mannequin-glb` 可再生） |
| `apps/fitme/public/mannequin/mannequin_v1.manifest.json` | 给美术对照的 JSON 副本 |
| 捏人页 UI | 「程序化 / GLB 资产」切换；直达 `#shape?asset=glb` |

美术替换时：覆盖同路径 GLB，保持 `BS_Fat` / `BS_Belly` / `BS_Shoulder` 命名即可，无需改业务代码。

---

## 5. 文献与行业材料（偏「体型 / 选码」，不是引擎）

| 材料 | 链接 | 对我们 |
| --- | --- | --- |
| ALiSNet（Zalando，端侧人体分割） | https://arxiv.org/abs/2304.07533 | 正侧图 → 剪影；强调端侧与隐私 |
| Zalando body measurement fairness | https://ceur-ws.org/Vol-3442/paper-17.pdf | 正侧剪影 → 云端重建 + 围度；公平性评测思路 |
| 正侧图估 SMPL + 围度 | https://arxiv.org/abs/2205.14347 | 反解管线参考；**SMPL 商用许可要单独谈** |
| Nestler et al., SizeFlags, KDD 2021 | ACM / 机构页检索 “SizeFlags Zalando” | **无 3D** 也能显著降退货——支撑「推荐优先于炫技」 |
| Zalando 虚拟试衣间 + 测量整合（新闻） | https://corporate.zalando.com/en/technology/zalando-enhances-its-virtual-fitting-room-enabling-customers-create-3d-avatar-their-body | 产品叙事：先统计体型，再接测量；引擎未公开 |
| SMPL 官方 | https://smpl.is.tue.mpg.de/ | 学术人体模型；**不得未授权商用**（《11》8.7） |
| MakeHuman | http://www.makehumancommunity.org/ | 可导出低模做人台草案；导出后仍要过商用授权与精修 |

**读文献时的纪律**：论文解决的是「\(\beta\) / 围度从哪来」；App 展示仍走第 2～3 节的 glTF 路线。二者用第 4 节 `Beta` 粘合。

---

## 6. 推荐给我们的落地顺序（调研结论）

1. **保持** Web three.js L2 + 现有 \(\beta\)（已跑通 demo）。  
2. **并行** 用 Blender（或 Maya→GLB）做一版无头磨砂人台 + 三个 morph，按第 4 节命名。  
3. **`Mannequin3D` 增加 GLB 加载路径**（feature flag），与程序化对照。  
4. 真机测帧率与包体（《11》未完成项）。  
5. 阶段 2 照片反解只写入同一 `Beta`；勿为「更真实」提前上 Unity。  

手绘全图：[`drawings/12-mannequin-workflow.png`](../drawings/12-mannequin-workflow.png) · [`mannequin-workflow.html`](../mannequin-workflow.html)

**不要做成主路径**：每人拍照 → GPT/Grok 调 Maya 雕一具新模再导回 App。Maya 只在离线工厂；在线只写 \(\beta\)。

---

## 7. 修订记录

| 日期 | 写入 |
| --- | --- |
| 2026-09-22 | 初稿：标准 / 开源 / 文献 / `Beta`↔morph 合同 |
| 2026-09-22 | 补 4.4：fitme 已挂 GLB feature flag + 占位资产 |
| 2026-09-22 | 补图纸 12：工厂一次 / 用户 β / 禁止 GPT 调 Maya |
