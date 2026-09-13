# 环境素材来源

以下素材从 Poly Haven 官方接口获取，使用 1K 版本并随游戏本地打包。来源页标注 CC0；无运行时外部图片请求。文件原始 MD5 已与下载接口校验一致，详情见 `art/environment-assets.json`。

| 素材 | 作者 | 用途 | 来源与许可 |
| --- | --- | --- | --- |
| Aerial Rocks 04 | Rob Tuytel | 地形岩石颜色、OpenGL法线与粗糙度 | https://polyhaven.com/a/aerial_rocks_04 — CC0 |
| Venice Sunset | Greg Zaal | HDR环境照明、车漆及金属反射 | https://polyhaven.com/a/venice_sunset — CC0 |

针叶纹理、草丛、道路、建筑、海面与动态云层均由项目代码生成。原程序化汽车与车牌细节通过 `tools/build-cars.py` 在 Blender 5.2 中构建，可编辑源为 `art/solstice-gt.blend`。当前整车与座椅使用以下生成资产。

## Lux3D 生成岩体

海岸侵蚀岩体由 Aholo Lux3D G1 本次生成，任务号 3429656；原始模型为 33,148 三角形。通过 Blender 5.2.1 LTS 归一化、处理材质、压缩贴图并制作 24,000 / 7,000 / 1,400 三角形三级模型，共享两张 1K 贴图。运行包 1,507,456 字节，沿道路外侧布置并按距离选择精度。它属于生成资产，与上表 Poly Haven 的 CC0 素材来源不同。

原始模型、请求记录及可编辑 Blender 文件位于 art/lux3d/；复现脚本为 tools/prepare-coastal-rock.py。

## Lux3D 生成汽车与座椅

整车由 Aholo Lux3D G1 任务 3431485 生成，输入是本次自行生成的单车图片，图片及完整提示词保存于 `art/references/`。源模型 SHA256 为 `5f79f1606c7773e7947c5dc02e84c6d7f72ce7b2153c54fe1eaf844e672a5838`；原始任务结果保存在 `art/lux3d/car-plated-source.json`。

皮革座椅由 Aholo Lux3D G1 任务 3430884 生成，原始任务结果保存在 `art/lux3d/seat-source.json`。这两项属于生成资产，与上表 Poly Haven 的 CC0 素材来源不同。

Blender 5.2.1 LTS 用于实际导入、几何清理、车窗和轮组分离、前后实体 VZ-0606 牌照装配及轻量化导出。复现脚本为 `tools/prepare-lux-car.py`、`tools/prepare-lux-seat.py`；可编辑文件位于 `art/lux3d/`。运行模型为 `public/models/solstice-lux-gt.glb` 与 `public/models/gt-seat.glb`。前一个整车任务 3431294 因出现重叠车体被弃用。