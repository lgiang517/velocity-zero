# VELOCITY ZERO

**An original coastal driving experience for the browser.** Chase the horizon along a continuous ~6.75 km island road that threads coast, mountain, tunnel, city, harbour and a sea bridge. Dynamic single-track vehicle physics, PBR cars, licensed racing music and short event sound effects, seven race rules and competitors with their own driving styles.

> **Play it online:** [**https://lgiang517.github.io/velocity-zero/**](https://lgiang517.github.io/velocity-zero/) — or build locally with `npm run build`, then serve `dist/` (or run `npm run preview`). Details below.

---

一款原创的浏览器海岸赛车游戏。沿海岸、山路、隧道、城市、港口和跨海桥驾驶，路线连续，全长约 6.75 公里。

## 启动

需要 Node.js 20.19+ 或 22.12+，以及支持 WebGL2、开启硬件加速的现代浏览器。

```sh
npm install
npm run dev
```

打开终端给出的地址。正式版本使用 `npm run build` 生成，然后 `npm run preview` 预览。除可选字体外，运行素材均在项目内；字体无法加载时使用本机字体。

## 操作

- W / ↑：油门；S / ↓：刹车，静止后持续按住进入倒车。
- A、D / ←、→：方向。
- Space：手刹；Shift：氮气。
- C：四种镜头；R：回到道路中央，增加三秒用时。
- Esc：暂停；离开窗口自动暂停。
- 小屏幕显示触摸按钮。

入弯前刹车，松油门帮助车头转入，侧滑时反打方向，再逐渐补油。氮气通过高速驾驶、尾流、近距离超车和漂移补充。

## 已有内容

三种原创汽车、七种比赛规则、四种驾驶镜头、完整倒计时和比赛结算、个人纪录、交通车辆、具有不同驾驶风格的对手。所有比赛模式使用同一条海岛公路，山路模式使用其中一段。

驾驶采用动态单轨车辆模型，包括连续转向、轮胎侧滑、纵向重量转移、前后轴抓地力、空气阻力、制动、ABS、手刹和湿地抓地变化。对手使用同一驾驶模型，根据前方弯道和附近车辆调整路线，不使用按排名直接修改速度的作弊加速。

车辆使用 PBR 车漆、反射玻璃、旋转车轮、制动灯和发热刹车盘。道路采用 GLSL 表面处理和湿润反射近似。场景使用批量绘制、距离隐藏和固定大小的粒子池。

发动机、轮胎、风噪、换挡、碰撞和隧道回声由 Web Audio 实时合成；原创 160 BPM 电子音乐会随速度和比赛进度增加声部。声音需用户点击后启动。

## 交付范围

这是完整可玩的浏览器原型，不等同于商业 AAA 游戏的制作规模和写实程度。汽车、环境和音乐均在项目中生成，没有使用授权真实车型或录音素材。玻璃和路面采用反射近似，不是完整屏幕空间反射。车辆没有完整的独立悬挂刚体模拟或永久车损，驾驶舱较简洁。尚不支持联机和手柄。

晴天、黄昏、夜晚、雨、暴雨、雾和变化天气可切换；湿路会减少抓地力，高速经过模拟积水区会进一步短暂减小抓地力。雨滴和水花属于实时视觉近似。

流畅度取决于电脑和浏览器。“Balanced”限制渲染分辨率；“Performance”关闭泛光和动态阴影。60 帧是目标，不是对所有设备的保证。

## 检查

`npm test` 检查车辆加速差异、干湿路刹车、漂移、氮气、道路接缝、对手完整跑完路线和复杂输入稳定性。

`npm run build` 检查正式版本能否正常生成。另行通过真实浏览器检查画面、驾驶按键、菜单、镜头、暂停、天气和结算。

`window.__velocity.getState()` 提供只读运行状态。只有开发环境并带 `?test=1` 的地址才提供测试控制入口，正式版本不包含该入口。

