"""Inspect, measure and render the original Lux3D GT without modifying it.
Run: blender --background --python tools/inspect-lux-car.py
Outputs use Blender world coordinates and explicitly converted glTF Y-up coordinates.
"""
import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from collections import defaultdict,Counter

root=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
stem=args[0] if args else 'car-source'
source=root/f'art/lux3d/{stem}.glb'
source_record=json.loads(source.with_suffix('.json').read_text(encoding='utf-8'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
if not meshes:raise RuntimeError('No generated car meshes')
# Imported node transforms are preserved for the renders and applied only to
# coordinates written into the analysis arrays.
def gltf(v):return [float(v[0]),float(v[2]),float(-v[1])]
def xyz_bounds(points):return [[float(v) for v in np.min(points,axis=0)],[float(v) for v in np.max(points,axis=0)]]
all_world=[];objects=[];samples=[];image_cache={};material_records=[]
for material in bpy.data.materials:
 images=[];pbr={}
 if material.use_nodes:
  for node in material.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image:
    image=node.image
    if image.name not in image_cache:
     pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels)
     image_cache[image.name]=(pixels.reshape((image.size[1],image.size[0],4)),image)
    pixels=image_cache[image.name][0]
    images.append({'name':image.name,'size':list(image.size),'colorSpace':image.colorspace_settings.name,'rgbMean':pixels[...,:3].mean(axis=(0,1)).tolist(),'rgbP10':np.quantile(pixels[...,:3].reshape((-1,3)),.1,axis=0).tolist(),'rgbP90':np.quantile(pixels[...,:3].reshape((-1,3)),.9,axis=0).tolist()})
   if node.type=='BSDF_PRINCIPLED':
    for name in ['Base Color','Metallic','Roughness','Alpha']:
     inlet=node.inputs[name];value=inlet.default_value
     pbr[name]={'value':list(value) if hasattr(value,'__len__') else value,'links':[(l.from_node.name,l.from_socket.name) for l in inlet.links]}
 material_records.append({'name':material.name,'pbr':pbr,'images':images})

for object_index,obj in enumerate(meshes):
 mesh=obj.data;mesh.calc_loop_triangles();world=np.array([obj.matrix_world@vertex.co for vertex in mesh.vertices],dtype=np.float64)
 all_world.extend(world.tolist());world_gltf=world[:,[0,2,1]].copy();world_gltf[:,2]*=-1
 # Welded-coordinate connectivity is read-only. UV seams do not masquerade
 # as thousands of unrelated objects in the component statistics.
 parent=list(range(len(world)));representative={}
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 def union(a,b):
  a=find(a);b=find(b)
  if a!=b:parent[b]=a
 for i,point in enumerate(world):
  key=tuple(np.round(point,5))
  if key in representative:union(i,representative[key])
  else:representative[key]=i
 for edge in mesh.edges:union(edge.vertices[0],edge.vertices[1])
 groups=defaultdict(list)
 for i in range(len(world)):groups[find(i)].append(i)
 faces_by_root=Counter(find(face.vertices[0]) for face in mesh.polygons)
 components=[]
 for key,indices in groups.items():
  if len(indices)<3:continue
  coordinates=world_gltf[indices]
  components.append({'vertices':len(indices),'polygons':faces_by_root[key],'glTFBounds':xyz_bounds(coordinates),'glTFCenter':coordinates.mean(axis=0).tolist()})
 components.sort(key=lambda c:c['polygons'],reverse=True)
 # Keep exact imported polygon indices alongside spatial and UV colour samples.
 uv=mesh.uv_layers.active;cache={}
 for slot_index,slot in enumerate(obj.material_slots):
  if not slot.material or not slot.material.use_nodes:continue
  for node in slot.material.node_tree.nodes:
   if node.type=='BSDF_PRINCIPLED':
    links=node.inputs['Base Color'].links
    if links and links[0].from_node.type=='TEX_IMAGE':
     image=links[0].from_node.image
     if image:cache[slot_index]=image_cache[image.name][0]
 for face in mesh.polygons:
  coords=world_gltf[list(face.vertices)];center=coords.mean(axis=0)
  normal=obj.matrix_world.to_3x3().inverted().transposed()@face.normal;normal.normalize()
  color=np.array([1,1,1],dtype=np.float32)
  if uv and face.material_index in cache:
   coordinate=sum((uv.data[loop].uv for loop in face.loop_indices),Vector((0,0)))/len(face.loop_indices)
   pixels=cache[face.material_index];h,w=pixels.shape[:2]
   color=pixels[min(h-1,max(0,int(coordinate.y*(h-1)))),min(w-1,max(0,int(coordinate.x*(w-1)))),:3]
  samples.append([object_index,face.index,*center,*gltf(normal),*color,face.material_index])
 objects.append({'name':obj.name,'vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'triangles':len(mesh.loop_triangles),'glTFBounds':xyz_bounds(world_gltf),'uvLayers':[layer.name for layer in mesh.uv_layers],'materialSlots':[slot.material.name if slot.material else None for slot in obj.material_slots],'componentCount':len(components),'components':components[:60]})

samples=np.asarray(samples,dtype=np.float32)
np.savez_compressed(root/f'art/lux3d/{stem}-face-samples.npz',samples=samples,columns=np.array(['object_index','polygon_index','x','y','z','normal_x','normal_y','normal_z','base_r','base_g','base_b','material_index']),object_names=np.array([obj.name for obj in meshes]))
points=np.asarray(all_world);points_gltf=points[:,[0,2,1]].copy();points_gltf[:,2]*=-1
minimum,maximum=xyz_bounds(points_gltf);dimensions=(np.array(maximum)-minimum).tolist()
colors=samples[:,8:11];bright=colors.mean(axis=1);warm=(colors[:,0]>colors[:,1]*1.35)&(colors[:,1]>colors[:,2]*1.2)&(colors[:,0]>.08);dark=bright<.11
record={'source':source.name,'taskId':source_record['taskId'],'blender':bpy.app.version_string,'glTFBounds':[minimum,maximum],'dimensionsXYZ':dimensions,'objects':objects,'materials':material_records,'sampleCount':len(samples),'faceSamples':f'{stem}-face-samples.npz','faceSampleCoordinates':'glTF world coordinates: Y-up; exact imported polygon index per mesh','sampleColorCaveat':'Base texture sampled at polygon UV centroid; colour heuristics are not authoritative semantic labels','warmFaceCount':int(warm.sum()),'darkFaceCount':int(dark.sum()),'baseColorMean':colors.mean(axis=0).tolist()}
# Spatial lower-band histograms help identify wheel centres independently of
# the paint. The longest horizontal axis identifies the provisional length.
length_axis=0 if dimensions[0]>dimensions[2] else 2;width_axis=2 if length_axis==0 else 0
height=dimensions[1];low=samples[:,3]<minimum[1]+height*.43
side=np.abs(samples[:,2+width_axis]-(minimum[width_axis]+maximum[width_axis])*.5)>dimensions[width_axis]*.37
hist,edges=np.histogram(samples[low&side&dark,2+length_axis],bins=60,range=(minimum[length_axis],maximum[length_axis]))
record['provisionalLengthAxis']='X' if length_axis==0 else 'Z';record['lowerSideDarkFaceHistogram']={'edges':edges.tolist(),'counts':hist.tolist()}
record.update({key:source_record[key] for key in ['vehicleFrame','wheelEstimates'] if key in source_record})
(root/f'art/lux3d/{stem}-inspection.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print('LUX_CAR_SOURCE '+json.dumps({key:record[key] for key in ['glTFBounds','dimensionsXYZ','sampleCount','warmFaceCount','darkFaceCount','provisionalLengthAxis']})+' OBJECTS '+json.dumps([{'name':o['name'],'triangles':o['triangles'],'components':o['componentCount'],'largest':o['components'][:5]} for o in objects]))

# Source model previews use neutral lighting; no changes to generated paint,
# roughness, glass or geometry are made during this read-only inspection.
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Source inspection studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.28,.32,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
bmin=np.min(points,axis=0);bmax=np.max(points,axis=0);center=Vector((bmin+bmax)*.5);span=max(bmax-bmin)
bpy.ops.mesh.primitive_plane_add(size=span*30,location=(center.x,center.y,bmin[2]-.012*span));floor=bpy.context.object
floor_mat=bpy.data.materials.new('Inspection floor only');floor_mat.diffuse_color=(.065,.08,.095,1);floor.data.materials.append(floor_mat)
def area(offset,power,size):
 bpy.ops.object.light_add(type='AREA',location=center+Vector(offset)*span);obj=bpy.context.object;obj.data.energy=power*span*span;obj.data.shape='DISK';obj.data.size=size*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
area((.5,-.75,1.2),90,1.1);area((-.7,-.3,.6),42,1);area((.15,.8,1),65,.85)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.lens=55
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=93
views=[('front',(.85,-1.10,.54)),('back',(-.82,1.14,.52)),('side',(1.45,0,.25))]
# Source 3431485 is visually confirmed to face glTF -X; place its
# cameras accordingly without rotating or modifying the source model.
if source_record['taskId']==3431485:views=[('front',(-.82,1.14,.52)),('back',(.85,-1.10,.54)),('side',(0,-1.45,.25))]
for label,offset in views:
 cam.location=center+Vector(offset)*span*1.35;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(root/f'art/lux3d/{stem}-preview-{label}.jpg');bpy.ops.render.render(write_still=True)
