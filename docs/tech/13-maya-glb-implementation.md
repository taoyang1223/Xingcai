# 13 · 展示角色落地到 App（实现设计）

> 客户看到的人以 [《14》](./14-display-character.md) 为准。本文只保留「GLB 怎样进捏人页」这条管子。文中的无头占位文件是旧资产，用来证明加载能通，不再当交付标准。

> 读者：客户端、美术/外包、测试  
> 状态：管子仍在（2026-09-23）。展示标准已改到《14》，DCC 用 Blender，不再把无头 Maya 人台当交付  
> 上游：《14》展示角色、《11》8.7、《12》对接调研；代码真源：`apps/fitme/src/mannequin/`  
> 不在本文：照片反解、围度入库、选码规则、Unity

本文只回答一件事：**按《14》做好的展示角色，怎样变成用户在捏人页里能转、能拖的那一具。**

App 不打开 Blender 或 Maya，也不读取工程文件。交付物只有一份 glTF 2.0 二进制（`.glb`）和一份清单。运行时用 three.js 加载，滑杆改 morph 权重。

---

## 0. 工作流（2026-09-23 定）

Maya 装在开发者自己的电脑上。服务器（当前内网 `172.24.11.106`，仓库 `/root/Xingcai`）不装 Maya：系统是 Ubuntu 24.04 的虚拟机，没有可用独显和显示器，也不在 Maya 2026 官方支持的发行版里。本会话只能操作这台服务器，不能同时操作开发者电脑上的 Maya。

两段分开做。中间只交接两样东西：一份共享 GLB，和每个用户的一组 β。

### 0.1 开发者电脑：资产只做一次

1. 在 Maya 里建基准网格，体型等于滑杆默认值（170 cm，fat 0.45，belly 0.35，shoulder 0.5）。
2. 加三个 Blend Shape：`BS_Fat`、`BS_Belly`、`BS_Shoulder`。合同见第 3 节。
3. 在 Maya 视口里转一圈。侧面能看出肚子，正面能看出肩宽，再导出。
4. 需要赶工时，AI 只留在这台电脑上：帮写 `mayapy`、摆 Blend Shape、导出 GLB。参考图也留在这台电脑上，用开发者有权使用的参考。
5. 按第 3.2 节经 Blender 导出 glTF Binary，关掉 Draco。先用 glTF 查看器拖过三个 Shape Key。
6. 把文件拷到服务器：

```bash
scp mannequin_headless_v1.glb root@172.24.11.106:/root/Xingcai/apps/fitme/public/mannequin/
```

开发者电脑必须能访问该内网地址的 22 端口，并用 root 的 SSH 登录。地址变了就换主机名，路径不变。

### 0.2 服务器：只收文件并给人看

1. 覆盖 `apps/fitme/public/mannequin/mannequin_headless_v1.glb`。
2. 把 `src/mannequin/manifest.ts` 里 `glbUrl` 的 `?v=` 加一。
3. 打开 `http://172.24.11.106:5174/#shape?asset=glb`，按第 6 节点完。

页面上拖滑杆只改 β 的显示。胸围、腰围、臀围仍由 `measure(β)` 计算。

### 0.3 每个用户：照片只变成 β

用户侧自动化是「照片 → β → 已有 GLB 的 morph 权重」。照片按《06》《11》：单独同意、端侧糊脸、短存、建模完成即删（最多 1 小时）。反解写进同一组 β，不新做网格。

用户身体照片留在这条链路里：不交给公网大模型，不把 Maya 开成每个用户一具新模型的服务。

---

## 1. 已经落地的部分

| 模块 | 路径 | 作用 |
| --- | --- | --- |
| 参数 | `src/mannequin/body.ts` 的 `Beta` | `heightCm`、`fat`、`belly`、`shoulder`。围度 `measure(β)` 与显示无关 |
| 合同 | `src/mannequin/manifest.ts` | GLB 地址、身高基准、三个 morph 名 |
| 加载 | `src/mannequin/glbDriver.ts` | `GLTFLoader`，把 β 写成权重和缩放 |
| 页面 | `src/mannequin/Mannequin3D.tsx` | 「程序化 / GLB 资产」切换；`/#shape?asset=glb` |
| 占位资产 | `public/mannequin/mannequin_headless_v1.glb` | 旧的无头网格，只证明加载能通。新展示角色见《14》 |

换官方人台时**不改滑杆、不改 β、不改围度公式**。只替换 GLB，并在清单里把版本号加一。

---

## 2. 数据怎么走

```
Maya
  基准网格 = 标准体（滑杆默认）
  Blend Shape：BS_Fat / BS_Belly / BS_Shoulder
        │
        │  导出 glTF Binary（.glb）
        │  Y-up，单位米，三角面 ≤ 25000
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
| 头 | 固定的抽象头，可有简化五官和头发。不从用户照片重建脸，不采集人脸 |
| 衣服 | 可与身体分开，便于看出体型。滑杆只改体型，不改衣服款式 |
| 面数 | 三角面 ≤ 25000。当前占位网格仍可远小于此 |
| 材质 | 皮肤与衣服分开。皮肤金属度 ≤ 0.05、粗糙度 ≥ 0.8。导出前烘成 glTF metallic-roughness，不带 Arnold 节点 |
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
| 整体胖瘦 | `BS_Fat` | 躯干为主，四肢稍弱。头保持抽象形状，不要胀成球 |
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
| 1 | 刚进页，不拖滑杆 | 与《14》基准网格一致：站立、通用头、衣服在身上、脚在地面上 |
| 2 | 只把「肚子」拉到最右，切到侧面 | 腰腹向前鼓；胸肩变化明显小于肚子 |
| 3 | 只把「肩宽」拉到最右，看正面 | 肩变宽；肚子厚度基本不动 |
| 4 | 只把「整体胖瘦」拉到最右 | 躯干变壮，人仍像人，不炸顶点 |
| 5 | 三根都拉到最左 | 变瘦，不出现洞、不出现飞出的面 |
| 6 | 身高改成 150 和 190 | 人变矮或变高，比例不扁、不拉成一根 |
| 7 | 开发者工具看 Network | 只请求一份 glb；三角面 ≤ 25000；文件 ≤ 8 MB |
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
| 2026-09-23 | 记下工作流：Maya 在开发者电脑做一次共享 GLB；服务器只收文件；用户照片只反解成 β |
