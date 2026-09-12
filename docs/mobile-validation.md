# 手机适配验证

日期：2026-09-12。浏览器：Chromium / Pixel 7 触屏模拟，DPR 2.625；并非实体手机性能或 Safari 兼容性认证。

## 布局与视野

- 320×568、390×844 竖屏和 844×390 横屏均检查了菜单、车外与驾驶舱画面。页面宽度与视口一致，visualViewport.scale 为 1，没有横向溢出。
- 所有驾驶、暂停与相机工具按钮至少 44×44 CSS px，位于视口内，中心命中对应元素；横屏方向和踏板分置两侧，速度表居中，地图上移。
- 采用 viewport-fit=cover、100dvh 与 env(safe-area-inset-*) 布局。浏览器模拟没有真实刘海或系统手势区，仍需实体设备检查安全区表现。
- 竖屏扩大驾驶相机视野，前路与方向盘可同时看到。已检查两种镜头，未改变驾驶眼位或物理操控参数。
- 中文和英文 320px 菜单均没有页面横向溢出；车库换车、赛道列表末项、设置返回按钮、暂停和结算返回按钮均可滚动到并点击。

## 实际触控事件

通过 Chromium Input.dispatchTouchEvent 输入多个真实触点，而非仅调用游戏测试接口：

- 同时按方向与油门：steer=1、throttle=1、touchPointers=2。
- 只松开方向：steer=0、throttle=1、touchPointers=1；全部松开后均为零。
- 按住油门时用另一手指暂停：进入 paused，输入和触点清零；恢复后没有遗留油门。
- 修复 secondary touch 通常不会产生 click 的浏览器行为：触屏动作在 pointerdown 激活，随后合成 click 不重复执行；鼠标和键盘激活仍保留。
- 触摸切换两种镜头；驾驶舱禁用缩放；车外缩放距离 8.5 → 9.46，拖动使 yaw 0 → -0.36、pitch .33 → .41。
- 复位按钮增加三秒比赛用时并清空输入。
- 横竖屏切换自动暂停；普通同方向高度变化（568 → 550）继续 race，不把地址栏收缩当成旋转。
- 结算通过开发专用测试入口移到终点，验证小屏结果滚动及返回；没有声称完整触屏跑完全程。

## 渲染与检查

- 320×568 视口，High 的画布为 640×1136，Balanced 为 320×568；renderer 与后处理 composer 同步像素比例。
- 修复旧低高度样式隐藏驾驶按钮的问题，降低触屏 Balanced 在高 DPR 上的渲染负担。
- 触控单元测试 6 项覆盖独立指针、键盘混合、取消捕获、清空输入、环绕归属、多指动作去重。
- 完整测试 67 项全部通过，生产构建通过（792.36 kB JS / 222.99 kB gzip）；保留 Vite 单包超过 500 kB 的体积提示。浏览器上述流程 pageerror 为空。

本地画面证据保存于 output/playwright/mobile-race-*-cam*.jpg、mobile-menu-english-small.jpg、mobile-pause-small.jpg、mobile-results-small.jpg；此目录不提交到仓库。
