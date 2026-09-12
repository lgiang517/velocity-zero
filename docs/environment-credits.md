# 环境素材来源

以下素材从 Poly Haven 官方接口获取，使用 1K 版本并随游戏本地打包。来源页标注 CC0；无运行时外部图片请求。文件原始 MD5 已与下载接口校验一致，详情见 `art/environment-assets.json`。

| 素材 | 作者 | 用途 | 来源与许可 |
| --- | --- | --- | --- |
| Aerial Rocks 04 | Rob Tuytel | 地形岩石颜色、OpenGL法线与粗糙度 | https://polyhaven.com/a/aerial_rocks_04 — CC0 |
| Venice Sunset | Greg Zaal | HDR环境照明、车漆及金属反射 | https://polyhaven.com/a/venice_sunset — CC0 |

针叶纹理、草丛、道路、建筑、海面与动态云层均由项目代码生成。汽车通过 `tools/build-cars.py` 在 Blender 5.2 中构建，可编辑源为 `art/solstice-gt.blend`。
