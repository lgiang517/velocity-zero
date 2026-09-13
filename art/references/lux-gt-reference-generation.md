# 带车牌的 GT 建模参考图

2026-09-13，使用 OpenAI 内置 imagegen 工具生成，未使用 CLI。图片保存在 `art/references/lux-gt-plated-reference.png`，用于 Aholo Lux3D G1 整车建模任务 3431485。图中的前牌为 VZ-0606；游戏最终车牌由 Blender 实体几何补齐前后两块。

这是一张建模参考效果图，不能用作实际游戏运行画面的证据。游戏截图另存于 output/playwright/。

先前的四视图任务 3430881 含拼接残边，整车任务 3431294 出现双车重叠，未采用。最终整车采用任务 3431485 的单车网格；座椅采用任务 3430884。原始任务结果及模型哈希见 art/lux3d/ 下的来源记录。

## 实际生成提示词

Use case: product-mockup. Asset: clean photorealistic SINGLE-CAR source image for 3D reconstruction, not a poster. Generate exactly ONE whole original copper-orange long-bonnet two-door fastback luxury sports coupe in ONE front three-quarter view. No collage, no multiple panels, no other partial cars. Whole vehicle fully visible, wheels straight, car fills 80 percent of image with generous margin. Credible modern factory coupe proportions: 4.7m long, 1.97m wide, 1.35m tall, about 2.8m wheelbase. Copper-orange metallic clearcoat paint, sculpted continuous bonnet, subtly concave doors, muscular rear haunches, low fastback roof, narrow modern white headlamps integrated into body, black deep grille, realistic forged dark multi-spoke wheels and drilled brake discs. Real lightly smoked glass with a dark charcoal leather cabin visible behind it. Clean neutral pale gray photographic studio cyclorama, very subtle floor contact shadow, broad soft neutral daylight so body shape reads clearly, no dramatic baked light streaks, no landscape. Camera at car hood height, 70mm product photography, sharp details throughout. Add a REALISTIC front license plate mounted in its normal central bumper recess, ivory reflective plate with small blue left stripe and exact crisp black text 'VZ-0606'. The car also has a matching rear plate mounted normally, although it is naturally not visible from this front viewpoint. Original V-shaped small emblem only; no real automaker logos. Avoid stylization, cartoon toy proportions, exaggerated wings, oversized rims, distorted tires, people, labels outside the plate, watermarks, text overlays. Landscape 3:2 composition.
