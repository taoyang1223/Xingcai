# 13 · Maya 人台落地到 App（实现设计）

> 读者：客户端、美术/外包、测试  
> 状态：实现设计（2026-09-23）—— 运行时骨架已在 `apps/fitme`，本文规定怎么把 Maya 模型换上去  
> 上游：《11》8.7、《12》对接调研；代码真源：`apps/fitme/src/mannequin/`  
> 不在本文：照片反解、围度入库、选码规则、Unity

本文只回答一件事：**美术在 Maya 里做好的人台，怎样变成用户在捏人页里能转、能拖的那一具。**

App 不打开 Maya，也不读取 `.ma` / `.mb`。交付物只有一份 glTF 2.0 二进制（`.glb`）和一份清单。运行时用 three.js 加载，滑杆改 morph 权重。

---

## 1. 已经落地的部分

| 模块 | 路径 | 作用 |
| --- | --- | --- |
| 参数 | `src/mannequin/body.ts` 的 `Beta` | `heightCm`、`fat`、`belly`、`shoulder`。围度 `measure(β)` 与显示无关 |
| 合同 | `src/mannequin/manifest.ts` | GLB 地址、身高基准、三个 morph 名 |
| 加载 | `src/mannequin/glbDriver.ts` | `GLTFLoader`，把 β 写成权重和缩放 |
| 页面 | `src/mannequin/Mannequin3D.tsx` | 「程序化 / GLB 资产」切换；`/#shape?asset=glb` |
| 占位资产 | `public/mannequin/mannequin_headless_v1.glb` | 程序烘焙的无头网格，用来证明管子是通的 |

换官方人台时**不改滑杆、不改 β、不改围度公式**。只替换 GLB，并在清单里把版本号加一。

---

## 2. 数据怎么走

```
Maya
  基准网格 = 标准体（滑杆默认）
  Blend Shape：BS_Fat / BS_Belly / BS_Shoulder
        │
        │  导出 glTF Binary（.glb）
        │  Y-up，单位米，三角面 ≤ 5000
        ▼
apps/fitme/public/mannequin/mannequin_headless_v1.glb
        │
        │  浏览器请求 /mannequin/mannequin_headless_v1.glb?v=N
        ▼
GLTFLoader → 找到三个 morph
        │
        │  滑杆 β → 权重（第 4 节）+ 身高缩放
        ▼
屏幕上的人台
measure(β) 仍输出胸围 / 腰围 / 臀围（示意，不是档案）
```

身高不做成 Blend Shape。`heightCm / 170` 作为根节点的均匀缩放。170 cm 时缩放为 1，网格本身就是 1.7 米高。

---

## 3. Maya 交付合同

### 3.1 场景

| 项 | 要求 |
| --- | --- |
| 朝向 | 人物面向 +Z，头朝 +Y，脚底接近 y = 0 |
| 单位 | 米。170 cm 的人约 1.70 个单位高 |
| 姿态 | 双臂自然下垂、略离开躯干，双腿分开到大腿不相交。A-pose 或 T-pose 须在清单 `notes` 里写明，本期锁定下垂 |
| 头 | 无头，颈根收口。不做五官、不做头发 |
| 面数 | 三角面 ≤ 5000 |
| 材质 | 一个材质。金属度 ≤ 0.05，粗糙度 ≥ 0.8。导出前烘成 glTF metallic-roughness，不带 Arnold 节点 |
| 授权 | 自建或采购的商用许可，文件放 `docs/licenses/`。不用 SMPL |

基准网格必须是**滑杆在默认值时的体型**，对应：

```
heightCm = 170
fat      = 0.45
belly    = 0.35
shoulder = 0.5
```

三个 Blend Shape 各表示「只把这一根拉到 1、其余保持默认」时，相对基准网格的形状。Maya 的 Blend Shape 存的就是这份位移，和 glTF Morph Target 相同。

| 滑杆 | Maya 目标名 | 拉到 1 时只变哪里 |
| --- | --- | --- |
| 整体胖瘦 | `BS_Fat` | 躯干为主，四肢稍弱。头部位置无头，颈根不要胀成球 |
| 肚子 | `BS_Belly` | 腰腹带。主要往前（+Z）鼓，侧面能看出厚度 |
| 肩宽 | `BS_Shoulder` | 肩带左右拉开，上臂根跟着外移一点 |

名字区分大小写，不要加命名空间前缀。一个 mesh 上三个目标；若躯干和四肢分成多个 mesh，每个 mesh 里同名目标的含义必须一致，加载器会按名字分别绑定。

瘦的一侧不用另雕。运行时用负权重沿同一位移往回走，属于线性近似。若负权重穿模，再单独立项加反向目标，本期不增加 β 字段。

### 3.2 导出

推荐路径：**Maya → FBX（或 Maya2glTF）→ Blender 检查 Shape Key → 导出 glTF Binary**。

Blender 导出勾选：

- Format: glTF Binary（`.glb`）
- Include: Selected Objects，只要人台网格
- Transform: +Y Up
- Data → Mesh: Apply Modifiers，UVs，Normals
- Data → Shape Keys: **开**（这就是 morph）
- Data → Compression: 关 Draco。Draco 会重排顶点，morph 位移会贴错。体积要再压时用 `EXT_meshopt_compression`，本期占位文件不压也可以

导出后用 https://gltf-viewer.donmccurdy.com/ 打开，三个 Shape Key 能拖，正面朝屏幕，脚在地上。这一步没过，不要放进仓库。

### 3.3 放进仓库

覆盖：

```
apps/fitme/public/mannequin/mannequin_headless_v1.glb
```

把 `src/mannequin/manifest.ts` 里的 `glbUrl` 从 `?v=3` 改成下一个整数，避免浏览器继续用旧文件。同步改 `public/mannequin/mannequin_v1.manifest.json` 的 `notes`，写上美术版本和导出日期。

加载器按 manifest 里的名字找 morph。找不到名字时会按顺序 0、1、2 去绑，页面上会标「部分 morph 名未对齐」。验收以三个名字都能对上为准，不接受只靠顺序。

---

## 4. 滑杆到权重

`glbDriver.ts` 里的 `morphWeightFromBeta`：

```
默认值 mid：fat 0.45，belly 0.35，shoulder 0.5

value >= mid 时：weight = (value - mid) / (1 - mid)     → 默认是 0，拉满是 1
value <  mid 时：weight = (value - mid) / mid           → 拖到 0 是 -1
```

身高：

```
scale = heightCm / 170
heightMode = uniformScale 时，x/y/z 一起乘
```

因此 Maya 里把某个 Blend Shape 权重设为 1，应等于 App 里把对应滑杆拉到最右。权重 0 应等于刚进页面的默认体型。

围度数字不要从 GLB 顶点去量。继续用 `measure(β)`。同一 β 下，视觉上的肚子、肩和这三个数不能明显打架（允许小偏差，不允许「数字 81、看起来像 90」却没有说明）。

---

## 5. 页面行为

1. 用户打开 `/#shape`，默认仍是程序化网格（不依赖 GLB）。
2. 点「GLB 资产」，或直接打开 `/#shape?asset=glb`。
3. 请求 manifest 里的 `glbUrl`。失败则回到程序化网格，并在页面上写失败原因。
4. 拖滑杆只调用 `applyBeta`，不重新下载、不重建拓扑。
5. 拖拽旋转、正面 / 45° / 侧面与程序化模式相同。侧面必须能看出 `BS_Belly`。
6. 「存成我的人台」交出的是 `Beta`，不是 GLB，也不是截图。

本期 GLB 放在前端静态目录，进捏人页才请求。不上后端、不把用户照片送去 Maya。

---

## 6. 验收

替换 GLB 之后，逐条看 `/#shape?asset=glb`：

| # | 做法 | 通过 |
| --- | --- | --- |
| 1 | 刚进页，不拖滑杆 | 与 Maya 基准网格一致：站立、无头、脚在地面阴影上 |
| 2 | 只把「肚子」拉到最右，切到侧面 | 腰腹向前鼓；胸肩变化明显小于肚子 |
| 3 | 只把「肩宽」拉到最右，看正面 | 肩变宽；肚子厚度基本不动 |
| 4 | 只把「整体胖瘦」拉到最右 | 躯干变壮，人仍像人，不炸顶点 |
| 5 | 三根都拉到最左 | 变瘦，不出现洞、不出现飞出的面 |
| 6 | 身高改成 150 和 190 | 人变矮或变高，比例不扁、不拉成一根 |
| 7 | 开发者工具看 Network | 只请求一份 glb；三角面 ≤ 5000；文件 ≤ 2 MB |
| 8 | 断网或把 glb 改名 | 自动回到程序化网格，页面有错误说明 |

查看器里能拖 Shape Key，但 App 里名字对不上，算不通过。

---

## 7. 剩余工作（按这个顺序做）

1. 美术按第 3 节交第一版 GLB（可以先粗糙，但名字、轴向、单位必须对）。
2. 覆盖占位文件，`glbUrl` 版本加一。
3. 按第 6 节在桌面浏览器点完。真机帧率仍是《11》未完成项，不在这次替换里假装已经过。
4. 若负权重穿模，记录在清单 `notes`，再决定要不要加反向目标。
5. 授权文件进 `docs/licenses/` 之后，这一版才允许当正式资产。占位 GLB 没有第三方人体，可以一直留在仓库里当加载失败时的对照。

不要做的事：App 里调用 Maya；每次用户拍照就导出一具新 GLB；为了这具模型改 β 的字段名；用 Draco 压这份带 morph 的网格。

---

## 8. 修订记录

| 日期 | 写入 |
| --- | --- |
| 2026-09-23 | 初稿：在已有 GLB 加载骨架上，规定 Maya 导出、替换路径、权重和验收 |
