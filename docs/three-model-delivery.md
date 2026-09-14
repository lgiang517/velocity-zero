# 三款确认车型交付记录

日期：2026-09-14。

最终名单：Aston Martin DB12、Ferrari GTC4Lusso、Ferrari 812 Competizione。SOLSTICE GT、KAZE R、IRONWOOD V8 已从可选列表和运行入口移除。默认与旧存档回退使用 DB12，非巡逻对手与交通车使用 GTC4，812按需加载。

## 资产与实现

- DB12：使用下载原版并补齐四轮，保留原生驾驶舱与独立方向盘。修复通用缺失材质、添加车牌、转换DDS贴图，去掉隐藏发动机舱和无用UV/顶点通道。
- GTC4Lusso：保留原四轮与外观，提供引擎盖视角。源模型不含驾驶舱。原游戏灯光特效平面使用加法混合，在普通PBR中变为黑色遮挡；隔离验证后已移除该特效平面，保留并确认原生实体大灯正确显示。
- 812 Competizione：修正源glTF缩小100倍的单位，942个网格合并为31个（含新增前车牌），保留四轮与内饰。方向盘合并在源内饰中，目前为静态；未叠加旧驾驶舱。
- 三车分别有独立轮心与转向节点，卡钳跟随前轮转向而不参与滚动。实际坐标尺寸用于碰撞与护栏包络。
- 许可与作者见 public/models/CREDITS.md；游戏页脚可打开 public/model-credits.html。812衍生模型沿用CC BY-NC-SA 4.0，仅非商业使用及相同许可共享。

## 验证

- 174项测试通过，output/selectable-cars/three-car-tests.log；构建通过，output/playwright/three-models/final-build.log。
- 浏览器三车切换成功，各四轮，DB12/812原生驾驶舱，GTC4引擎盖视角。
- 812实际开赛、对手生成、切换座舱、按W加速验证通过，眼点坐标有限且画面已目视检查。
- 最终三款各8个方位检查，24张外观图。GTC4修复旧灯光特效后重新检查该车型8方位。
- 手机390×844菜单仅出现db12/gtc4lusso/f812。旧gt存档回退db12；网络检查未请求solstice或gt-seat资产。手机硬件帧率未实机测试。

可审查页面：http://127.0.0.1:5188/output/playwright/three-models/index.html
本地游戏：http://127.0.0.1:5188/

## 发布状态

用户于 2026-09-14 明确要求更新网上版本并只保留当前最新版，授权发布本批源码和运行模型。发布通过 main 分支的 GitHub Pages 工作流整包替换，旧的车型、音乐和原始音频不再进入网站构建；开发历史与测试参考文件仍保留在仓库中。线上 version.json 记录实际部署提交。
