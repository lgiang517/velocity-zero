"""Adapt the licensed 812 asset without changing its authored body shape."""
import bpy,importlib.util,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',ROOT/'tools/build-selectable-cars.py');build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output/selectable-cars/f812-source.blend'))
objects=build.bake(list(bpy.context.scene.objects),Matrix.Scale(100,4),{})
groups={};static=[]
for o in objects:
 if o.name.startswith('polySurface'):
  vs=[Vector(v) for v in o.bound_box];center=sum(vs,Vector())/8
  slot=('l' if center.x>0 else 'r')+('f' if center.y<0 else 'r')
  kind='Caliper_' if any('Calliper' in m.name for m in o.data.materials) else 'Wheel_'
  groups.setdefault(kind+slot,[]).append(o)
 else:static.append(o)
assembled=[];centers={}
for key,parts in sorted(groups.items(),key=lambda item:not item[0].startswith('Wheel_')):
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=key
 if key.startswith('Wheel_'):
  vs=[Vector(v) for v in o.bound_box];center=Vector([(min(v[i] for v in vs)+max(v[i] for v in vs))/2 for i in range(3)]);centers[key[-2:]]=center
 else:center=centers[key[-2:]]
 o.data.transform(Matrix.Translation(-center));o.location=center
 if key.startswith('Wheel_'):o['radius']=max(v.z for v in vs)-center.z
 assembled.append(o)
objects=static+assembled
for m in list(bpy.data.materials):
 if not m.use_nodes:continue
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if not p:continue
 n=m.name
 if 'Paint_Material' in n:
  m.name='Paint';p.inputs['Metallic'].default_value=.4;p.inputs['Roughness'].default_value=.27;p.inputs['Coat Weight'].default_value=1;p.inputs['Coat Roughness'].default_value=.14
 elif 'Window' in n:
  m.name='Window glass' if 'Inside' not in n else 'Inner glazing';p.inputs['Base Color'].default_value=(.12,.17,.20,1);p.inputs['Alpha'].default_value=.24;p.inputs['Roughness'].default_value=.08;p.inputs['Metallic'].default_value=0;m.surface_render_method='DITHERED'
 elif 'Base_' in n or 'Carbon' in n:p.inputs['Roughness'].default_value=.5;p.inputs['Base Color'].default_value=(.025,.029,.032,1)
 elif 'Coloured_' in n:p.inputs['Base Color'].default_value=(.03,.034,.038,1);p.inputs['Roughness'].default_value=.6
 elif 'SeatBelt' in n:p.inputs['Base Color'].default_value=(.34,.015,.008,1)
 elif 'Wheel' in n:p.inputs['Metallic'].default_value=.6;p.inputs['Roughness'].default_value=.35
plate=build.material('License plate',(1,1,1,1),.1,.4,bpy.data.images.load(str(ROOT/'output/selectable-cars/f812-plate.png')))
for o in objects:
 if o.name.startswith(('LicensePlate_','ManufacturerPlate_')):
  o.data.materials.clear();o.data.materials.append(plate)
  uv=o.data.uv_layers.active or o.data.uv_layers.new();vs=[v.co for v in o.data.vertices];xmin=min(v.x for v in vs);xmax=max(v.x for v in vs);zmin=min(v.z for v in vs);zmax=max(v.z for v in vs)
  for loop in o.data.loops:
   v=o.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((v.x-xmin)/(xmax-xmin),(v.z-zmin)/(zmax-zmin))
# Front plate is a separate shallow surface, centered on the lower bumper.
mesh=bpy.data.meshes.new('Front plate');mesh.from_pydata([(-.17,-2.34,.23),(.17,-2.34,.23),(.17,-2.34,.35),(-.17,-2.34,.35)],[],[(0,1,2,3)]);uv=mesh.uv_layers.new()
for i,xy in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=xy
obj=bpy.data.objects.new('Front plate',mesh);bpy.context.scene.collection.objects.link(obj);mesh.materials.append(plate);objects.append(obj)
# All lights share a material in the source, so split the rear lamp geometry to
# control brake emission without turning the headlights red.
for o in objects:
 if o.name.startswith('Light_Geo'):
  old=o.data.materials[0];tail=old.copy();tail.name='Tail';p=next(n for n in tail.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Color'].default_value=(.1,.001,.001,1);p.inputs['Emission Strength'].default_value=.4;o.data.materials.append(tail)
  for f in o.data.polygons:
   if f.center.y>1.8:f.material_index=1
build.export('ferrari-812-competizione',objects,dict(nativeCabin=True,driverEye=[.38,1.02,-.40],hoodEye=[0,1.09,1.03],license='CC-BY-NC-SA-4.0',author='Ddiaz Design',source='https://sketchfab.com/3d-models/2023-ferrari-812-competizione-2a1c6415c50048e0abdca02067fae59d',adaptations='100x unit correction, authored wheel pieces grouped by corner, plate, PBR tuning',steeringWheel='Baked into source interior; no independent animation'))
