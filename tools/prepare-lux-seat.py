"""Prepare Lux3D task 3430884 as a shared, metre-scale GT seat.
Run: blender --background --python tools/prepare-lux-seat.py
The exported GLB contains only the seat; studio objects are preview-only.
"""
import bpy, bmesh, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
source=root/'art/lux3d/seat-source.glb'
out=root/'public/models/gt-seat.glb'
blend=root/'art/lux3d/seat-optimized.blend'
report=root/'art/lux3d/seat-build.json'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
if not meshes: raise RuntimeError('Generated asset contains no seat mesh')
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes: obj.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
if len(meshes)>1: bpy.ops.object.join()
seat=bpy.context.object;seat.name='GTSeat_Lux3D'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
seat.data.calc_loop_triangles();source_triangles=len(seat.data.loop_triangles)

def bounds(obj):
 return [min(v.co[i] for v in obj.data.vertices) for i in range(3)],[max(v.co[i] for v in obj.data.vertices) for i in range(3)]
minimum,maximum=bounds(seat)
# glTF +Z is Blender -Y. The upper backrest identifies the rear of this
# generated seat; a half turn puts its sitting surface toward glTF +Z.
upper=[v.co for v in seat.data.vertices if v.co.z>minimum[2]+(maximum[2]-minimum[2])*.58]
back_y=sum(v.y for v in upper)/len(upper)
rotated=back_y<(minimum[1]+maximum[1])/2
if rotated:
 for vertex in seat.data.vertices: vertex.co.x=-vertex.co.x;vertex.co.y=-vertex.co.y

# UVs are stored per loop, so welding coincident imported vertices preserves
# the atlas while allowing smooth normals across the former primitive seams.
if seat.data.has_custom_normals:
 bpy.ops.mesh.customdata_custom_splitnormals_clear()
bm=bmesh.new();bm.from_mesh(seat.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00003)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(seat.data);bm.free()
smooth=seat.modifiers.new('Soften generated leather surface','SMOOTH');smooth.factor=.28;smooth.iterations=2
bpy.ops.object.modifier_apply(modifier=smooth.name)
# Preserve the UVs while simplifying the generated surface. A single mesh and
# material are reused by both seats at runtime.
mod=seat.modifiers.new('GT seat triangle budget','DECIMATE')
mod.ratio=min(1,8200/source_triangles);mod.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=mod.name)
seat.data.validate(verbose=True,clean_customdata=True)
# Normalize after decimation so the final geometric bounds match the contract.
minimum,maximum=bounds(seat)
center=Vector(((minimum[0]+maximum[0])*.5,(minimum[1]+maximum[1])*.5,minimum[2]))
scales=Vector((.49/(maximum[0]-minimum[0]),.56/(maximum[1]-minimum[1]),.74/(maximum[2]-minimum[2])))
for vertex in seat.data.vertices:
 p=vertex.co-center;vertex.co=Vector((p.x*scales.x,p.y*scales.y,p.z*scales.z))
seat.data.update()
for polygon in seat.data.polygons: polygon.use_smooth=True

materials=list(dict.fromkeys(slot.material for slot in seat.material_slots if slot.material))
if len(materials)!=1: raise RuntimeError(f'Expected one generated UV material, got {len(materials)}')
material=materials[0];material.name='GTSeat_CharcoalNappa'
for node in material.node_tree.nodes:
 if node.type=='BSDF_PRINCIPLED':
  for link in list(node.inputs['Metallic'].links): material.node_tree.links.remove(link)
  node.inputs['Metallic'].default_value=0
  node.inputs['IOR'].default_value=1.46
  node.inputs['Specular IOR Level'].default_value=.42
# Keep the generated roughness variation in a leather range. The source has
# metallic-looking low roughness on parts of its upholstered side bolsters.
rough_images=set()
for node in material.node_tree.nodes:
 if node.type=='BSDF_PRINCIPLED':
  for link in node.inputs['Roughness'].links:
   separator=link.from_node
   for inlet in separator.inputs:
    for image_link in inlet.links:
     if image_link.from_node.type=='TEX_IMAGE':rough_images.add(image_link.from_node.image)
for image in rough_images:
 import numpy as np
 pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels)
 rgba=pixels.reshape((-1,4));rgba[:,1]=.50+rgba[:,1]*.36
 image.pixels.foreach_set(pixels);image.update()
# Source includes base colour and roughness, with no authored normal map.
# Keep these two genuine generated maps; do not invent a baked normal signal.
textures=[]
for image in bpy.data.images:
 if image.source not in {'FILE','GENERATED'} or image.size[0]<1: continue
 original=list(image.size)
 if max(original)>1024:
  scale=1024/max(original);image.scale(round(original[0]*scale),round(original[1]*scale))
 image.pack();textures.append({'name':image.name,'sourceSize':original,'size':list(image.size)})
for obj in list(bpy.context.scene.objects):
 if obj!=seat: bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT');seat.select_set(True);bpy.context.view_layer.objects.active=seat
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_image_format='JPEG',export_image_quality=82,use_selection=True,export_apply=True,export_yup=True,export_extras=True)
seat.data.calc_loop_triangles();minimum,maximum=bounds(seat)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
record={'generator':'Aholo Lux3D G1','taskId':3430884,'processor':bpy.app.version_string,'sourceTriangles':source_triangles,'triangles':len(seat.data.loop_triangles),'vertices':len(seat.data.vertices),'materials':1,'textures':textures,'rotationAroundUpDegrees':180 if rotated else 0,'sourceUpperBackMeanBlenderY':back_y,'blenderBounds':[minimum,maximum],'glTFBounds':[[-.245,0,-.28],[.245,.74,.28]],'units':'metres','up':'+Y','front':'+Z','origin':'horizontal bounds centre at the lowest seat point','glbBytes':out.stat().st_size,'glbSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'normalMap':'not present in Lux3D source; no artificial normal map added','processing':['weld coincident vertices while preserving loop UVs','clear imported split normals and recalculate smooth surface','two light smoothing passes before decimation','metallic=0; generated roughness remapped to leather range','resize genuine generated maps to 1024; JPEG quality 82']}
report.write_text(json.dumps(record,indent=2,ensure_ascii=False),encoding='utf-8')
print('GT_SEAT_BUILD '+json.dumps(record,ensure_ascii=False))

# Preview after export: floor, camera and lights are never part of the GLB.
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1050;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Seat preview studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.28,.32,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object
floor_mat=bpy.data.materials.new('Preview only floor');floor_mat.diffuse_color=(.07,.085,.1,1);floor.data.materials.append(floor_mat)
def light(location,power,size,color):
 bpy.ops.object.light_add(type='AREA',location=location);obj=bpy.context.object;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.data.color=color;obj.rotation_euler=(Vector((0,0,.4))-obj.location).to_track_quat('-Z','Y').to_euler()
light((.9,-1.4,1.8),95,1.1,(1,.87,.73));light((-1.1,-.6,.8),35,.8,(.73,.83,1));light((.2,.9,1.5),75,.75,(.88,.94,1))
bpy.ops.object.camera_add(location=(1.12,-1.45,.98));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.38))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=60;scene.camera=cam
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92
scene.render.filepath=str(root/'art/lux3d/seat-preview-front.jpg');bpy.ops.render.render(write_still=True)
cam.location=(-1.12,.95,.90);cam.rotation_euler=(Vector((0,0,.37))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(root/'art/lux3d/seat-preview-back.jpg');bpy.ops.render.render(write_still=True)
