# 车辆外观重建与验证

使用 Codex 内置 imagegen 生成 art/solstice-gt-concept.png，再使用 Blender 5.2 后台 Python 建模并导出 glTF。概念目标：橙色低矮双门 GT，连贯车顶与玻璃、真实轮拱、嵌入式贯穿尾灯、完整圆形排气口、克制鸭尾和深色分叉轮辐。概念图用于造型参照，不作为游戏画面。

可编辑源文件：art/solstice-gt.blend；生成脚本：tools/build-cars.py；运行资产：public/models/solstice-gt.glb。静态车身按材质合并，四轮独立保留转向/旋转。三款驾驶配置保留，并使用该 GT 基础车身的比例变体。

截图迭代：第一轮检查连续车身、修正轮辐旋转与尾灯深度；第二轮增加轮圈边缘并改善驾驶舱遮挡、门板和底板连接。最终截图在 output/playwright/car-final.jpg。

验证环境：本机 Chromium，1440×900，默认画质，日落海岸 Sprint。真实按键加速至约 141 km/h，10 次半秒间隔 FPS 采样均为 60；驾驶舱比赛状态 12 秒 requestAnimationFrame 采样为 60.05 FPS，95 百分位帧间隔 16.8 ms。音乐状态 ready/playing；暂停后停止播放。10 项驾驶测试与生产构建通过。

限制：以上性能是该机器及场景实测，并非所有硬件、天气、赛段下的最低帧率保证。实时车身主要轮廓与概念方向一致，曲面和材质细节仍简化，未达到概念图的写实精度。音乐来源与署名详见 docs/music-credits.md。
