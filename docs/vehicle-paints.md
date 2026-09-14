# 三款车型官方代表配色

核查日期：2026-09-14。没有取得按车型统计的公开配色销量或统一社交热度排名，本次采用官方发布、官方社交或 Ferrari Approved 实车记录支持的代表色，不能称为热度前三。

色值是游戏材质使用的 sRGB 视觉近似，不是原厂漆配方。Silver Birch 参考 DB12 Goldfinger 展示，812 黄色参考官方 Tailor Made 哑光 Giallo Tristrato 展示；仅采用车身色彩方向，不复制特别版草图、金色装饰或完整涂装。保留现有模型条纹与材质。

## ASTON MARTIN DB12

- 翡翠绿 · Iridescent Emerald：[官方来源](https://media.astonmartin.com/aston-martin-db12-iridescent-emerald-south-of-france-photography/?lang=eng)
- 炽烈红 · Hyper Red：[官方来源](https://media.astonmartin.com/aston-martin-db12-hyper-red-south-of-france-photography/?lang=eng)
- 桦木银 · Silver Birch：[官方来源](https://media.astonmartin.com/q-by-aston-martin-celebrates-60-years-of-iconic-james-bond-partnership-with-db12-goldfinger-edition/?lang=eng)

## FERRARI GTC4LUSSO

- 烈焰红 · Rosso Fuoco：[官方来源](https://preowned.ferrari.com/en-PL/r/europe/used-ferrari/france/gtc4lusso/rfcm)
- 意大利白 · Bianco Italia：[官方来源](https://preowned.ferrari.com/en-PL/r/europe/used-ferrari/france/gtc4lusso/rfcm)
- 银石灰 · Grigio Silverstone：[官方来源](https://preowned.ferrari.com/en-PL/r/europe/used-ferrari/france/gtc4lusso/rfcm)

## FERRARI 812 COMPETIZIONE

- 竞速灰 · Grigio Competizione：[官方来源](https://preowned.ferrari.com/en-EN/a/europe/used-ferrari/france/charles-pozzi-paris/812-competizione/ZFF03TMB000271593-1743006409162)
- 赛车红 · Rosso Corsa：[官方来源](https://preowned.ferrari.com/en-EN/a/europe/used-ferrari/france/charles-pozzi-paris/812-competizione/ZFF03TMB000286619-1742233444058)
- 三层珍珠黄 · Giallo Tristrato：[官方来源](https://www.instagram.com/p/CwIovPUp88g/)

## 实现与验证

- 每款车提供三款官方代表色，并按用户后续参考图新增亮橙色与明黄色，共五色，切换车型后保留各自选择；旧共享颜色若不在新配色中则使用该车型首选色。
- 九色均已在运行模型中渲染检查；手机 390×844 逐色点击、切换车型与刷新保存通过。
- 178 项项目测试通过（含三项配色迁移/隔离测试），生产构建通过。
- 本地对照页：`output/playwright/official-paints/index.html`。

## 用户新增参考色

- 三款车型均增加 Gloss Orange 亮橙色 `#ef6808` 与 Solar Yellow 明黄色 `#edc600`。来源为用户本轮两张图片，名称为游戏描述名，不是已核实的原厂色号。
- 保留原先三个独立车型色，812 原有 Giallo Tristrato 不被替换。
- 五色色卡采用手机独立一行布局；15 个选项已逐一在游戏点击验证，三个车型刷新后均正确恢复新增颜色；六张新增配色模型截图已人工查看。新增配色后迁移测试与生产构建通过。
- 新增配色对照页：`output/playwright/official-paints/reference-paints.html`。
