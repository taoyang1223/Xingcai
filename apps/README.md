# C 端（对照设计稿）

正式客户端仍是 **Flutter**（相机 / 3D 批次再立工程）。本目录用 Web 把已定的**登录 + 首页**先跑通，便于在浏览器里点。

- 登录：微信 / 支付宝一键（开发环境用设备号当匿名账号），或手机号 + `000000`
- 不采集真实姓名、身份证
- 首页空态主按钮是「拍照建档」；可用「预览已建档首页」看完整度卡片
- 拍照：换贴身衣服 → 靠墙 → 填身高 → 走进正面人台框倒计时 → 转 90° 拍侧面。原图不上传。

```bash
cd apps/fitme && npm install && npm run dev
# http://127.0.0.1:5174
# 需本机 API：make dev
```

## 3D 人台（捏人 demo）

`src/mannequin/`。可转可捏，三根滑杆：整体胖瘦、肚子、肩宽。

```bash
npm run dev
# http://127.0.0.1:5174/#shape   ← 直接进这一屏，不需要后端
```

- 客户看到的人改以 `docs/tech/14-display-character.md` 为准：对标 Snow 的完成度，通用头在 `public/mannequin/heads/snow_head_v1.glb`。
- `body.ts` 和页面上的程序化人台是旧占位，围度公式还在这里，不再当展示标准。
- `Mannequin3D.tsx`：three.js 场景、滑杆、视角切换。
- three.js 走懒加载：首屏不含 3D，进这一屏才拉。
