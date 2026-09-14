"""Independent GT clay study: new sectional body and canopy, no old shell deformation."""
import bpy,bmesh,math,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/gt-rebuild';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools'))
def gp(p):return (p[0],-p[2],p[1])
def material(name,color,rough=.5,metal=0):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal;return m
def mesh(name,vs,fs,mat,up=None,thickness=0):
 d=bpy.data.meshes.new(name);d.from_pydata([gp(v) for v in vs],[],fs);d.materials.append(mat);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 if up and sum(f.normal.dot(Vector(gp(up)))*f.calc_area() for f in bm.faces)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
 bm.to_mesh(d);bm.free()
 for f in d.polygons:f.use_smooth=True
 if thickness:
  bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Panel thickness','SOLIDIFY');m.thickness=thickness;m.offset=-1;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
def box(name,center,size,mat,bevel=.01):
 bpy.ops.mesh.primitive_cube_add(size=1,location=gp(center));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Edge radius','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
def tube(name,points,r,mat,segments=8):
 vs=[];fs=[]
 for j,p in enumerate(points):
  t=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized();a=t.cross(Vector((0,1,0)))
  if a.length<.01:a=t.cross(Vector((1,0,0)))
  a.normalize();b=t.cross(a).normalized()
  for i in range(segments):vs.append(tuple(Vector(p)+r*(a*math.cos(2*math.pi*i/segments)+b*math.sin(2*math.pi*i/segments))))
 for j in range(len(points)-1):
  for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;fs.append((a,b,b+segments,a+segments))
 fs+=[tuple(reversed(range(segments))),tuple((len(points)-1)*segments+i for i in range(segments))]
 return mesh(name,vs,fs,mat)
def hermite(table,z,k=1):
 if z<=table[0][0]:return table[0][k]
 if z>=table[-1][0]:return table[-1][k]
 for i in range(len(table)-1):
  a,b=table[i],table[i+1]
  if a[0]<=z<=b[0]:
   prev=table[max(0,i-1)];nxt=table[min(len(table)-1,i+2)];t=(z-a[0])/(b[0]-a[0]);m0=(b[k]-prev[k])/(b[0]-prev[0]);m1=(nxt[k]-a[k])/(nxt[0]-a[0]);span=b[0]-a[0]
   return (2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*span*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*span*m1
# Longitudinal stations: Z, half width, centre crown, outer shoulder height.
BODY=[(-2.38,.84,.895,.84),(-2.29,.92,.985,.923),(-2.10,.969,1.015,.957),(-1.80,.987,1.012,.967),(-1.34,.996,.972,.951),(-.90,.965,.929,.907),(-.35,.939,.911,.886),(.35,.945,.917,.893),(.80,.971,.917,.909),(1.388,.987,.865,.892),(1.80,.965,.804,.849),(2.15,.917,.742,.767),(2.38,.790,.622,.641)]
# A continuously lofted, closed cross-section. These are editable styling curves.
def section(z):
 w,c,s=[hermite(BODY,z,k) for k in (1,2,3)];h=s-.18
 return [(0,c),(.47*w,c-.006),(.77*w,.48*c+.52*s+.014),(.955*w,s),(w,s-.058),(.993*w,.18+.66*h),(.943*w,.18+.31*h),(.905*w,.205),(.74*w,.16),(0,.16)]
def catmull(points,t):
 t=max(0,min(len(points)-1-1e-8,t));i=int(t);u=t-i;p0=Vector(points[max(0,i-1)]);p1=Vector(points[i]);p2=Vector(points[min(len(points)-1,i+1)]);p3=Vector(points[min(len(points)-1,i+2)])
 return tuple(.5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u))
def body_pt(z,t):
 p=section(z);q=p+[(-x,y) for x,y in reversed(p[1:-1])]+[p[0]];x,y=catmull(q,t*(len(q)-1));return(x,y,z)
bpy.ops.wm.read_factory_settings(use_empty=True)
# Only known reusable wheel anchors and physical plates are imported.
bpy.ops.import_scene.gltf(filepath=str(ROOT/'art/lux3d/aholo-gt-package.glb'))
for o in list(bpy.context.scene.objects):
 if o.name not in ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'] and not o.name.startswith(('Front physical ','Rear physical ')):bpy.data.objects.remove(o,do_unlink=True)
for o in bpy.context.scene.objects:
 if o.name.startswith('Wheel_'):
  front='_F' in o.name;o['tireRadius']=.36295 if front else .3612;o['tireWidth']=.275 if front else .315;o.location.z=o['tireRadius']+.004
 if o.name.startswith('Rear physical '):o.location.y+=.058
 if o.name.startswith('Front physical '):o.location.y-=.075
clay=material('Clay',(.46,.48,.48),.60);glass=material('Study glass',(.035,.055,.063),.24,.18);trim=material('Study trim',(.023,.031,.036),.56)
nu=96;nz=160;vs=[body_pt(-2.38+4.76*j/nz,i/nu) for j in range(nz+1) for i in range(nu)];fs=[]
for j in range(nz):
 for i in range(nu):a=j*nu+i;b=j*nu+(i+1)%nu;fs.append((a,b,b+nu,a+nu))
fs += [tuple(reversed(range(nu))),tuple(nz*nu+i for i in range(nu))]
body=mesh('New GT sectional body',vs,fs,clay)
for z,y in [(1.38821876,.36695),(-1.33881247,.3652)]:
 for side in [-1,1]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.398,depth=.72,location=gp((side*.92,y,z)),rotation=(0,math.pi/2,0));c=bpy.context.object;bpy.context.view_layer.objects.active=body;m=body.modifiers.new('Wheel opening','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=c;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(c,do_unlink=True)
# The new canopy is designed with the body, not constrained by the old trapezoid.
ROOF=[(-1.82,1.002,.784),(-1.60,1.085,.780),(-1.30,1.205,.763),(-1.02,1.288,.746),(-.68,1.325,.755),(-.32,1.316,.767),(.02,1.258,.779),(.34,1.125,.799),(.67,.932,.818)]
def canopy(z,u,offset=0):
 r=hermite(ROOF,z);w=hermite(ROOF,z,2);base=hermite(BODY,z,2)-.020;f=max(0,math.cos(abs(u)*math.pi/2))**.47
 return(u*w,base+(r-base)*f+offset,z)
def patch(name,fun,nu,nv,mat):
 return mesh(name,[fun(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)],[(j*(nu+1)+i,j*(nu+1)+i+1,(j+1)*(nu+1)+i+1,(j+1)*(nu+1)+i) for j in range(nv) for i in range(nu)],mat,(0,1,0))
patch('New coupe canopy',lambda u,v:canopy(-1.82+2.49*v,2*u-1),64,100,clay)
# Opaque glazing zones are a clay-stage layout, not completed interior glazing.
patch('New rear glazing layout',lambda u,v:canopy(-1.70+.72*v,(2*u-1)*(.80-.12*v),.0025),48,36,glass)
patch('New windscreen layout',lambda u,v:canopy(.055+.565*v,(2*u-1)*(.71+.11*v),.0025),48,28,glass)
for side,label in [(-1,'left'),(1,'right')]:
 def sideglass(u,v,s=side):
  across=.66+.328*v;rear=-.89-.46*v;front=.08+.47*v;z=rear+(front-rear)*u
  return canopy(z,s*across,.0028)
 patch('New side glazing '+label,sideglass,56,18,glass)
 # Gentle sill blade establishes the lower line without carving a channel.
 box('Sill '+label,(side*.874,.205,-.015),(.030,.042,1.55),trim,.012)
# Minimal graphic placeholders to read the body. Detailed lamps follow approval.
for side in [-1,1]:
 pts=[(side*(.28+.52*i/32),.806-.040*(i/32)**2,-2.385) for i in range(33)]
 tube('Tail layout '+str(side),pts,.009,trim,6)
box('Lower rear layout',(0,.305,-2.386),(1.53,.19,.012),trim,.048)
box('Front intake layout',(0,.43,2.384),(1.18,.21,.012),trim,.072)
for side in [-1,1]:box('Headlight layout '+str(side),(side*.635,.607,2.386),(.25,.030,.012),trim,.013)
# Reusable mirrors are an assembly reference, not a constraint on the new skin.
from vehicle_mirrors import build_mirrors
build_mirrors(mesh,tube,box,lambda name,color,metal=0,rough=.4:material(name,color,rough,metal))
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gt-clay.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'gt-clay.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
(OUT/'study.json').write_text(json.dumps({'stage':'Independent clay body for silhouette approval; not game-ready','bodyStations':BODY,'canopyStations':ROOF,'nominalLength':4.76,'nominalWidth':1.992,'roofHeight':1.325,'oldShellReused':False,'glazing':'opaque layout patches; cockpit opening and glass thickness deferred'},indent=2),encoding='utf-8')
