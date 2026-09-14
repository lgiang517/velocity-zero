"""Assign explicit rear-light functions; never identify a reflector as a brake."""
import bpy, math
from pathlib import Path
from mathutils import Vector

def shader(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
def lamp(name,role,idle=0,active=2.5):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 p.inputs['Base Color'].default_value=(.19,.002,.006,1);p.inputs['Roughness'].default_value=.26;p.inputs['Metallic'].default_value=.05;p.inputs['Emission Color'].default_value=(1,.006,.002,1);p.inputs['Emission Strength'].default_value=idle
 if role in ['combined','brake']:p.inputs['Specular IOR Level'].default_value=0
 m['vehicleLightRole']=role;m['idleIntensity']=idle;m['brakeIntensity']=active
 return m

def assign(obj,mat):
 obj.data.materials.clear();obj.data.materials.append(mat)
 for f in obj.data.polygons:f.material_index=0

def db12(objects):
 emit=lamp('Rear combined LED','combined',.22,2.8);high=lamp('High brake LED','brake',0,2.8)
 reflector=lamp('Rear passive reflector','reflector',0,0);shader(reflector).inputs['Emission Color'].default_value=(0,0,0,1)
 removed=[]
 for o in list(objects):
  if o.type!='MESH':continue
  n=o.name
  # Keep adjacent position and brake ribbons. Only the turn-indicator
  # overlays occupy the same surface; their opaque placeholder hid the LEDs.
  if n.startswith('taillight'):
   assign(o,emit)
  elif n=='brakelight_m':assign(o,high)
  elif n.startswith('brakelight'):assign(o,high)
  elif n.startswith(('indicator_lr','indicator_rr')):
   removed.append(n);objects.remove(o);bpy.data.objects.remove(o,do_unlink=True);continue
  else:
   for i,m in enumerate(o.data.materials):
    if m and m.name=='Tail':o.data.materials[i]=reflector
 from db12_light_fix import repair_db12_lenses
 repair_db12_lenses(objects)
 return {'combined':[o.name for o in objects if o.type=='MESH' and emit in o.data.materials[:]],'high':['brakelight_m'],'removedOverlaps':removed}

def gtc4(objects):
 mapping={};roles={}
 for o in objects:
  if o.type!='MESH':continue
  if 'brakes_glows' in o.name:role='brake';idle=0
  elif 'position_back_glows' in o.name:role='combined';idle=.25
  else:continue
  src=o.data.materials[0];m=src.copy();m.name='High brake LED' if role=='brake' else 'Rear combined LED';m['vehicleLightRole']=role;m['idleIntensity']=idle;m['brakeIntensity']=2.5;shader(m).inputs['Emission Strength'].default_value=idle
  # Both maps keep the source lamp-specific UV atlas, including the black
  # non-emitting lens areas. Runtime changes intensity, never swaps the atlas.
  assign(o,m);roles[o.name]=role
 return roles

def f812(objects):
 target=next(o for o in objects if o.name.startswith('Light_Geo'))
 src=target.data.materials[0]
 rear=lamp('Rear combined LED','combined',.22,2.8)
 reflector=lamp('Rear passive reflector','reflector',0,0);shader(reflector).inputs['Emission Color'].default_value=(0,0,0,1)
 target.data.materials.clear();target.data.materials.append(src);target.data.materials.append(rear);target.data.materials.append(reflector)
 # The authored annular lenses are separate connected surfaces. Use those
 # physical rings, avoiding the chrome bulbs and the front-light atlas.
 parent=list(range(len(target.data.vertices)))
 def find(x):
  while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
  return x
 for e in target.data.edges:
  a,b=e.vertices;parent[find(a)]=find(b)
 groups={};uv=target.data.uv_layers.active
 for f in target.data.polygons:
  f.material_index=0
  if f.center.y>1.8:groups.setdefault(find(f.vertices[0]),[]).append(f)
 rings=[];emitters=[]
 for fs in groups.values():
  coords=[uv.data[l].uv for f in fs for l in f.loop_indices]
  lo=[min(v[i] for v in coords) for i in range(2)];hi=[max(v[i] for v in coords) for i in range(2)]
  if all(.64<x<.654 for x in lo) and all(.93<x<.95 for x in hi):
   vs=[target.data.vertices[v].co for f in fs for v in f.vertices]
   cx=(min(v.x for v in vs)+max(v.x for v in vs))/2;cz=(min(v.z for v in vs)+max(v.z for v in vs))/2
   emitters.append((cx,cz));rings.append(len(fs))
  elif all(f.center.z<.45 for f in fs):
   for f in fs:f.material_index=2
 if len(rings)!=4:raise ValueError('Expected four authored 812 LED ring anchors: '+str(rings))
 # Seat a 15 mm-wide red lens within each original circular lamp housing.
 # Sample its curved cover instead of placing flat rings over the body.
 cover=next(o for o in objects if o.name.startswith('Window_Geo'))
 added=[]
 for index,(cx,cz) in enumerate(emitters):
  verts=[];faces=[];segments=96
  for radius in [.046,.061]:
   for i in range(segments):
    angle=2*math.pi*i/segments;x=cx+radius*math.cos(angle);z=cz+radius*math.sin(angle)
    ok,hit,normal,face=cover.ray_cast(Vector((x,3,z)),Vector((0,-1,0)))
    if not ok:raise ValueError('812 lens outside authored cover')
    verts.append((x,hit.y+.0015,z))
  for i in range(segments):j=(i+1)%segments;faces.append((i,j,j+segments,i+segments))
  mesh=bpy.data.meshes.new('LED annular lens');mesh.from_pydata(verts,[],faces);mesh.materials.append(rear)
  o=bpy.data.objects.new('Rear_LED_ring_'+str(index+1),mesh);bpy.context.scene.collection.objects.link(o);objects.append(o);added.append(o.name)
 lens=lamp('Clear rear lamp cover','lens',0,0);lp=shader(lens);lp.inputs['Base Color'].default_value=(.15,.17,.18,1);lp.inputs['Emission Color'].default_value=(0,0,0,1);lp.inputs['Alpha'].default_value=.045;lp.inputs['Roughness'].default_value=.16;lp.inputs['Metallic'].default_value=0;lens.surface_render_method='DITHERED'
 for o in objects:
  if o.type=='MESH' and o.name.startswith('Window_Geo'):
   idx=len(o.data.materials);o.data.materials.append(lens)
   for f in o.data.polygons:
    if f.center.y>1.8:f.material_index=idx
 return {'authoredRingAnchors':rings,'lensInserts':added,'frontMaterialSeparate':True,'passiveReflectors':True}

def repair_lights(objects,asset):
 return {'aston-db12':db12,'ferrari-gtc4lusso':gtc4,'ferrari-812-competizione':f812}[asset](objects)
