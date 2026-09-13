import bpy, json, sys
from pathlib import Path
from mathutils import Vector

# Run with Blender 5.2: --background --python tools/prepare-coastal-rock.py -- source.glb
root = Path(__file__).resolve().parents[1]
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
source = Path(args[0]) if args else root / 'art/lux3d/coastal-rock-source.glb'
out = root / 'public/models/coastal-rock/coastal-rock-lods.glb'
blend = root / 'art/lux3d/coastal-rock-lods.blend'
report = root / 'art/lux3d/coastal-rock-build.json'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes: raise RuntimeError('Lux3D asset contains no mesh')
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes: obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes)>1: bpy.ops.object.join()
master = bpy.context.object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
coords = [v.co.copy() for v in master.data.vertices]
minimum = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
maximum = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
center = Vector(((minimum.x+maximum.x)/2, (minimum.y+maximum.y)/2, minimum.z))
scale = 12 / max(maximum.x-minimum.x, .001)
for vert in master.data.vertices: vert.co = (vert.co-center)*scale
master.data.update()
source_triangles = len(master.data.polygons)
master.data.calc_loop_triangles()
source_triangles = len(master.data.loop_triangles)
# Generated stone is dielectric. Keep generated roughness, normal and occlusion maps.
for mat in bpy.data.materials:
 if not mat.use_nodes: continue
 for node in mat.node_tree.nodes:
  if node.type == 'BSDF_PRINCIPLED':
   metal=node.inputs.get('Metallic')
   if metal:
    for link in list(metal.links): mat.node_tree.links.remove(link)
    metal.default_value=0
# Mip-friendly 1K source maps are shared by all three LOD meshes in one GLB.
textures=[]
for img in bpy.data.images:
 if img.source not in {'FILE','GENERATED'} or img.size[0] < 1: continue
 old=list(img.size)
 cap=1024
 if max(old)>cap:
  factor=cap/max(old);img.scale(max(1,round(old[0]*factor)),max(1,round(old[1]*factor)))
 img.pack()
 textures.append({'name':img.name,'sourceSize':old,'size':list(img.size)})
levels=[]
for level,budget in enumerate([24000,7000,1400]):
 obj=master.copy();obj.data=master.data.copy();bpy.context.collection.objects.link(obj)
 obj.name=f'CoastalRock_LOD{level}'
 bpy.context.view_layer.objects.active=obj
 if source_triangles>budget:
  mod=obj.modifiers.new('Game triangle budget','DECIMATE');mod.ratio=min(1,budget/source_triangles);mod.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=mod.name)
 obj.data.calc_loop_triangles()
 bounds=[min(v.co[i] for v in obj.data.vertices) for i in range(3)]+[max(v.co[i] for v in obj.data.vertices) for i in range(3)]
 levels.append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'blenderBounds':bounds})
bpy.data.objects.remove(master,do_unlink=True)
# Remove imported cameras/lights/empty nodes, leaving the self-contained mesh kit.
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH': bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_image_format='JPEG',export_image_quality=90,use_selection=True,export_apply=True,export_yup=True)
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  hidden=obj.name!='CoastalRock_LOD0';obj.hide_render=hidden;obj.hide_set(hidden)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
record={'generator':'Aholo Lux3D G1','taskId':3429656,'processor':bpy.app.version_string,'sourceTriangles':source_triangles,'levels':levels,'textures':textures,'glbBytes':out.stat().st_size,'units':'meters, exported Y-up; base Y=0, width=12'}
report.write_text(json.dumps(record,indent=2,ensure_ascii=False),encoding='utf-8')
print('COASTAL_ROCK_BUILD '+json.dumps(record,ensure_ascii=False))
