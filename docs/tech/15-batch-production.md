# 15 · 批量生产：方法论与数学模型

客户看到的完成度按《14》做一次。之后每一个体型都是同一具角色上的一组参数，不再按人重做模型。

公式与代码一致，实现在 `apps/fitme/src/mannequin/body.ts`。那份代码现在画出的是旧胶囊，**公式留下，胶囊网格退役**。展示网格改成 Snow 那种分件角色，用同一组 \(\beta\) 去推。

## 1. 方法论：做一次，参数出全部

批量的单位不是「又一具人」，而是 \(\beta\) 里的一个点。

\[
\beta = (\mathrm{heightCm},\ \mathrm{fat},\ \mathrm{belly},\ \mathrm{shoulder})
\]

默认点（基准体）：

\[
\beta_0 = (170,\ 0.45,\ 0.35,\ 0.5)
\]

| 步骤 | 做几次 | 产出 |
| --- | --- | --- |
| 1. 定拓扑 | 一次 | 身体、T 恤、裤子、鞋。头用现成的通用头，不进这张表 |
| 2. 雕基准 | 一次 | \(\beta_0\) 下的网格 \(V_0\)，完成度对标 Snow |
| 3. 雕三个极端 | 一次 | 只把一根滑杆拉到 1、其余保持 \(\beta_0\)，得到 \(V_{\mathrm{fat}}\)、\(V_{\mathrm{belly}}\)、\(V_{\mathrm{shoulder}}\) |
| 4. 存成形态键 | 一次 | `BS_Fat`、`BS_Belly`、`BS_Shoulder`，存的是相对 \(V_0\) 的位移 |
| 5. 每个用户 | 无数次 | 只算 \(\beta\)，不改顶点文件 |

第 3 步的形体必须跟下一节的截面公式对齐：极端网格在肩、腰、臀的宽和厚，要落在 `torsoAt` 算出来的半宽、半厚上。美术不另发明一套胖法。

头、头发、眼睛、牙齿的权重恒为 0。公式里头部也不吃胖瘦（见下节 \(1-\mathrm{smoothstep}\)）。

衣服三块网格用**同一组**形态键名字和同一组权重。批量时衣服跟着身体变，不用每人重做一件 T 恤。

## 2. 运行时：一个用户怎么变出来

身高先变成统一缩放，基准身高 170 cm：

\[
s = \mathrm{heightCm} / 170
\]

三根滑杆在基准与 1 之间的权重。低于基准时权重为负，沿同一位移往回走（变瘦），不另雕一套瘦模：

\[
w_{\mathrm{fat}} = \frac{\mathrm{fat}-0.45}{0.55},\quad
w_{\mathrm{belly}} = \frac{\mathrm{belly}-0.35}{0.65},\quad
w_{\mathrm{shoulder}} = \frac{\mathrm{shoulder}-0.5}{0.5}
\]

展示顶点：

\[
V(\beta) = s \Big(
  V_0
  + w_{\mathrm{fat}}(V_{\mathrm{fat}}-V_0)
  + w_{\mathrm{belly}}(V_{\mathrm{belly}}-V_0)
  + w_{\mathrm{shoulder}}(V_{\mathrm{shoulder}}-V_0)
\Big)
\]

这是线性混合，用来批量显示。围度数字不要对 \(V(\beta)\) 再量一遍，下面的截面积分才是数。

## 3. 数学模型：截面

身高归一化。\(h=0\) 在脚底，\(h=1\) 在头顶。半宽 \(a\)（左右）、半厚 \(b\)（前后）都是身高的比例，乘 \(\mathrm{heightCm}\) 得到厘米。

躯干、腿、手臂各有一张控制点表 \((h_i, a_i, b_i, c_{z,i})\)。控制点之间用保形三次样条（PCHIP）连接，这样光照下不会在接点处出一圈折痕。样条记为 \(a_0(h)\)、\(b_0(h)\)、\(c_{z0}(h)\)。表在 `body.ts` 的 `TORSO`、`LEG`、`ARM`。

### 3.1 滑杆怎么乘上截面

往瘦收得慢，往胖放得开。对称去乘会把腰收到不存在的尺寸。

\[
\mathrm{asym}(v, m, d, u) = 1 + (v-m)\times\begin{cases}u & v\ge m \\ d & v<m\end{cases}
\]

一根滑杆只作用在一段身高上。钟形权重两端导数为 0：

\[
\mathrm{band}(h; L, H) = \sin^2\Big(\pi\frac{h-L}{H-L}\Big)
\quad (L<h<H),\ \text{否则 } 0
\]

躯干（\(h\) 为身高比例）：

\[
\begin{aligned}
f &= 1 + \big(\mathrm{asym}(\mathrm{fat},0.45,0.24,0.60)-1\big)\,(1-\mathrm{smoothstep}(0.845,0.885,h)) \\
w_b &= \mathrm{band}(h; 0.545, 0.735) \\
w_s &= \mathrm{band}(h; 0.735, 0.845) \\
g_a &= 1 + \big(\mathrm{asym}(\mathrm{belly},0.35,0.22,0.34)-1\big)\,w_b \\
g_b &= 1 + \big(\mathrm{asym}(\mathrm{belly},0.35,0.30,0.86)-1\big)\,w_b \\
q &= 1 + \big(\mathrm{asym}(\mathrm{shoulder},0.5,0.30,0.32)-1\big)\,w_s \\
a(h) &= a_0(h)\,f\,g_a\,q \\
b(h) &= b_0(h)\,f\,g_b\,\big(1+0.3(q-1)\big)
\end{aligned}
\]

\(1-\mathrm{smoothstep}(0.845,0.885,h)\) 在头的高度变成 0，所以捏身材不会把脸捏变形。

肚子主要增加前后厚度，并把截面中心往前推，不往后长：

\[
c_z(h) = c_{z0}(h) + \big(\mathrm{asym}(\mathrm{belly},0.35,0.004,0.012)-1\big)\,w_b\times 1.4
\]

腿、手臂只吃胖瘦，大腿上段再吃一点肚子。系数见 `legAt`、`armAt`。脚（\(h<0.05\)）少跟一半胖瘦，避免鞋子被撑爆。

肢体根部埋进身体，用 `legSpread`、`armSpread` 给出离中线的距离，单位仍是身高比例。

### 3.2 截面形状与围度

每一层不是圆，是超椭圆。躯干指数 \(n=2.45\)，腿 \(2.15\)，手臂 \(2.1\)。指数越大越方。

\[
\begin{aligned}
x(\theta) &= a\,\mathrm{sign}(\cos\theta)\,|\cos\theta|^{2/n} \\
z(\theta) &= b\,\mathrm{sign}(\sin\theta)\,|\sin\theta|^{2/n}
\end{aligned}
\]

围度是这一圈的周长，数值积分 256 步，再乘身高（厘米）：

\[
C(a,b) = \mathrm{heightCm}\sum_{i=1}^{256}\big\|p(\theta_i)-p(\theta_{i-1})\big\|
\]

胸取 \(h=0.735\)。腰在 \(h\in[0.595,0.665]\) 里取最小。臀在 \(h\in[0.505,0.575]\) 里取最大。这就是 `measure(β)`。

## 4. 批量时每个人交付什么

| 交付 | 来源 | 是否新文件 |
| --- | --- | --- |
| 胸围、腰围、臀围 | `measure(β)` | 否，现场算 |
| 屏幕上的人 | 上一节的 \(V(\beta)\)，外加固定通用头 | 否，同一份 GLB |
| 头 | `snow_head_v1.glb`，权重 0 | 否 |
| 照片 | 只用来求 \(\beta\)，不进批量网格 | 端侧糊脸后短存即删 |

要出一版新风格（另一种头、另一套衣服），才回到第 1 节重做一次拓扑和三个极端。换风格是换资产，不是换公式。

## 5. 和线性形态键的差别

截面公式是乘上去的，滑杆之间会交叉（又胖又有肚子）。三个形态键是相加的，交叉项是近似。

批量生产接受这个近似，因为手机上要实时拖。验收只看三件事：

1. \(\beta_0\) 的外形就是雕出来的基准。
2. 单独拉满肚子时，腰腹前后径跟上式的 \(b(h)\)，侧面能看出来。
3. `measure(β)` 的厘米数和看起来的胖瘦不打架。数字不是从展示网格上重新积分的。
