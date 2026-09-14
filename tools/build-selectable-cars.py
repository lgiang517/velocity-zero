"""Build independent browser-ready cars from user-supplied assets.
Keeps body shapes, exports static geometry with centered rotating wheel nodes.
Run in Blender 5.2: --background --python tools/build-selectable-cars.py
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models';AUDIT=ROOT/'output/selectable-cars'
DDS=Path('C:/Users/lgian/Downloads/aston-martin-db12/source/aston martin db12/aston martin db12/astdb12')
FTEX=Path('C:/Users/lgian/Downloads/ferrari-gtc4lusso/textures')

def material(name,color=(.15,.17,.19,1),metal=0,rough=.5,image=None,alpha=False,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=color
 m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');output=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],output.inputs['Surface']);p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if name=='Paint':p.inputs['Coat Weight'].default_value=1;p.inputs['Coat Roughness'].default_value=.16
 if image:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if alpha:m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
 if alpha:m.surface_render_method='DITHERED'
 if emission:p.inputs['Emission Color'].default_value=color;p.inputs['Emission Strength'].default_value=emission
 return m

def image_for(name,folder):
 target=next((p for p in folder.iterdir() if p.stem.lower()==name.lower().removesuffix('.dds')),None)
 if not target:return None
 try:
  im=bpy.data.images.load(str(target),check_existing=True)
  if max(im.size)>1024:
   f=1024/max(im.size);im.scale(int(im.size[0]*f),int(im.size[1]*f))
  return im
 except Exception:return None

def bake(objects,transform,centers):
 graph=bpy.context.evaluated_depsgraph_get();result=[]
 for o in objects:
  if o.type!='MESH':continue
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
  # New materials use one UV set and no source-game vertex shader channels.
  active=mesh.uv_layers.active
  if active:
   keep=active.name
   for layer in list(mesh.uv_layers):
    if layer.name!=keep:mesh.uv_layers.remove(layer)
  for layer in list(mesh.color_attributes):mesh.color_attributes.remove(layer)
  world=transform@o.matrix_world
  center=centers.get(o.name,Vector((0,0,0)))
  mesh.transform(Matrix.Translation(-center)@world)
  n=bpy.data.objects.new(o.name+'_static',mesh);n.name=o.name+'_static';bpy.context.scene.collection.objects.link(n);n.location=center
  n['sourceName']=o.name;result.append(n)
 for o in objects:bpy.data.objects.remove(o,do_unlink=True)
 # Removing imported parents only after all evaluated meshes have been baked.
 for o in list(bpy.context.scene.objects):
  if o not in result:bpy.data.objects.remove(o,do_unlink=True)
 for o in result:o.name=o['sourceName']
 return result

def export(asset,objects,meta):
 import sys
 sys.path.insert(0,str(ROOT/'tools'))
 from vehicle_lights import repair_lights
 meta['lightRepair']=repair_lights(objects,asset)
 from vehicle_plates import repair_plates
 meta['plateRepair']=repair_plates(objects,asset)
 root=bpy.data.objects.new('Vehicle',None);bpy.context.scene.collection.objects.link(root)
 for o in objects:
  if not o.parent:o.parent=root
 root['vehicleId']=asset;root['nativeCabin']=meta['nativeCabin'];root['driverEye']=meta.get('driverEye',[0,1,0]);root['bonnetEye']=meta['hoodEye']
 bpy.context.view_layer.update()
 for o in objects:
  if o.type=='MESH':o.data.calc_loop_triangles()
 path=OUT/(asset+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_animations=False,export_skins=False,export_extras=True,export_cameras=False,export_lights=False,export_image_format='AUTO',export_materials='EXPORT')
 report=dict(**meta,file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),triangles=sum(len(o.data.loop_triangles) for o in objects if o.type=='MESH'),meshes=sum(o.type=='MESH' for o in objects))
 (AUDIT/(asset+'-build.json')).write_text(json.dumps(report,indent=2),encoding='utf-8');print('BUILT',json.dumps(report))

def db12():
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/db12/db12-four-wheels.blend'))
 arm=bpy.data.objects['astdb12'];rot=Matrix.Rotation(math.pi,4,'Z');transform=Matrix.Translation((0,0,.5793740153))@rot
 centers={}
 for o in bpy.context.scene.objects:
  if o.name.startswith('Wheel_'):centers[o.name]=transform@o.matrix_world.translation
 for slot in ['lf','rf','lr','rr']:centers['hub_'+slot]=transform@(arm.matrix_world@arm.data.bones['wheel_'+slot].head_local)
 centers['steeringwheel']=transform@(arm.matrix_world@arm.data.bones['steeringwheel'].head_local)
 remove=bpy.data.objects.get('enginebay')
 if remove:bpy.data.objects.remove(remove,do_unlink=True)
 objects=bake(list(bpy.context.scene.objects),transform,centers)
 originals=list(bpy.data.materials);mapping={};paint=material('Paint',(.38,.09,.035,1),.38,.27)
 glass=material('Window glass',(.10,.15,.18,.30),0,.10);next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Alpha'].default_value=.30;glass.surface_render_method='DITHERED'
 tail=material('Tail',(.32,.003,.008,1),.15,.25,emission=.8)
 plate=material('License plate',(1,1,1,1),.15,.38,image=bpy.data.images.load(str(AUDIT/'db12-plate.png')))
 for old in originals:
  n=old.name.lower()
  if '[primary]' in n:new=paint
  elif 'glass' in n:new=glass
  elif 'licenseplate' in n or n=='gb_plate':new=plate
  elif n in ['taillight_c','reflector_taillight_mp']:new=tail
  else:
   paths=[x.image.filepath for x in old.node_tree.nodes if x.type=='TEX_IMAGE' and x.image] if old.use_nodes else []
   img=image_for(Path(paths[0]).stem,DDS) if paths else image_for(old.name.split(' [')[0].split('.00')[0],DDS)
   color=(.16,.18,.2,1);metal=.1;rough=.48
   if '[secondary]' in n or 'leather' in n:color=(.10,.055,.03,1);rough=.65
   if any(s in n for s in ['black','carbon','carpet','tire','default']):color=(.027,.032,.038,1);rough=.72
   if 'wheel' in n or 'metal' in n or n=='7.001':metal=.8;rough=.27;color=(.3,.33,.36,1)
   if img:
    color=(1,1,1,1)
    if any(k in n for k in ['interior','leather','alcantara','stitch']):color=(.25,.23,.21,1)
    if 'wheel' in n:color=(.42,.45,.48,1)
    if 'tire' in n:color=(.24,.24,.24,1)
   new=material('DB12 '+old.name,color,metal,rough,img,alpha=any(s in n for s in ['badge','stitch','transparent','grille']))
  mapping[old]=new
 for o in objects:
  for i,m in enumerate(o.data.materials):o.data.materials[i]=mapping.get(m,m)
  if o.name.startswith('hub_'):o.name='Caliper_'+o.name[4:]
  if o.name=='steeringwheel':o.name='SteeringWheel';o['steeringAxis']=[0,-.333,.943]
  if o.name.startswith('Wheel_'):o['radius']=.36286
 # Source lamps have overlapping brake/indicator surfaces; keep a single opaque
 # brake surface for runtime emission and preserve the detailed lamp housings.
 for o in objects:
  if o.name.startswith('brakelight'):
   o.data.materials.clear();o.data.materials.append(tail)
 export('aston-db12',objects,dict(nativeCabin=True,driverEye=[.38,1.08,-.48],hoodEye=[0,1.17,1.13],removedHiddenTriangles=31061,texturePolicy='DDS converted to embedded PNG; source missing generic materials rebuilt; custom plate'))

def ferrari():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath='C:/Users/lgian/Downloads/ferrari-gtc4lusso/source/gtc4.fbx')
 objects=bake(list(bpy.context.scene.objects),Matrix.Identity(4),{})
 groups={};wheelparts=[]
 for o in objects:
  if o.name.startswith('Wheel'):
   pts=[o.matrix_world@Vector(v) for v in o.bound_box];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)])
   slot=('l' if (lo.x+hi.x)>0 else 'r')+('f' if (lo.y+hi.y)<0 else 'r');groups.setdefault(slot,[]).append(o);wheelparts.append(o)
 wheels=[]
 for slot,parts in groups.items():
  tire=next(o for o in parts if 'tyres' in o.name);vs=[Vector(v) for v in tire.bound_box];center=Vector([(min(v[i] for v in vs)+max(v[i] for v in vs))/2 for i in range(3)])
  pivot=bpy.data.objects.new('Wheel_'+slot,None);bpy.context.scene.collection.objects.link(pivot);pivot.location=center;pivot['radius']=.35
  for o in parts:o.data.transform(Matrix.Translation(-center));o.parent=pivot;o.location=(0,0,0)
  wheels.append(pivot)
  for o in objects:
   if 'caliper' in o.name:
    p=o.data.vertices[0].co
    if ('l' if p.x>0 else 'r')+('f' if p.y<0 else 'r')==slot:
     o.data.transform(Matrix.Translation(-center));o.location=center;o.name='Caliper_'+slot
 paint=material('Paint',(1,1,1,1),.38,.27,image_for('car_ferrari_gtc4lusso_occ_Out',FTEX))
 details=material('Ferrari details',(1,1,1,1),.35,.37,image_for('car_ferrari_gtc4lusso_df_Out',FTEX))
 tiremat=material('Rubber',(1,1,1,1),.0,.82,image_for('car_tyres_new_occ_Out',FTEX))
 glass=material('Window glass',(.012,.022,.028,1),.25,.09)
 lens=material('Headlight lens',(.23,.30,.34,.22),.15,.13);next(n for n in lens.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Alpha'].default_value=.035;lens.surface_render_method='DITHERED'
 tail=material('Tail',(1,1,1,1),.12,.28,image_for('car_ferrari_gtc4lusso_glows_Out',FTEX),emission=.5)
 p=next(n for n in tail.node_tree.nodes if n.type=='BSDF_PRINCIPLED');t=tail.node_tree.nodes.new('ShaderNodeTexImage');t.image=image_for('car_ferrari_gtc4lusso_glows_Out',FTEX);tail.node_tree.links.new(t.outputs['Color'],p.inputs['Emission Color'])
 lights=material('Ferrari lamp texture',(1,1,1,1),.1,.27,image_for('car_ferrari_gtc4lusso_glows_Out',FTEX))
 plate=material('License plate',(1,1,1,1),.1,.36,bpy.data.images.load(str(AUDIT/'gtc4lusso-plate.png')))
 for o in objects:
  n=o.name.lower();mat=details
  if 'carpaint' in n:mat=paint
  elif 'tyres' in n:mat=tiremat
  elif 'glass_windows' in n:mat=glass
  elif 'glass_lights' in n:mat=lens
  elif 'brakes_glows' in n or 'position_back_glows' in n:mat=tail
  elif 'glows' in n:mat=lights
  elif 'licensplate' in n:mat=plate
  elif 'bottom' in n:mat=material('Underbody',(1,1,1,1),.0,.9,image_for('car_bottom_df_Out',FTEX))
  o.data.materials.clear();o.data.materials.append(mat)
  for p in o.data.polygons:p.material_index=0
  # One combined light mesh contains stray geometry 1.6 m ahead of the nose.
  if 'front_and_back_glows' in n:
   import bmesh
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.y < -2.55],context='VERTS');bm.to_mesh(o.data);bm.free()
 # These source-game glow billboards use an additive shader. Opaque PBR
 # export makes them black masks over the real headlights; retain the
 # authored physical lights underneath instead.
 for obj in list(objects):
  if 'front_and_back_glows' in obj.name:
   objects.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
 export('ferrari-gtc4lusso',objects+wheels,dict(nativeCabin=False,hoodEye=[0,1.16,1.08],texturePolicy='Relink supplied PNG textures; opaque glazing because source has no cabin; custom plate',removedSourceDefect='Source additive glow billboards masking the authored physical headlights'))

if __name__=='__main__':
 db12();ferrari()
