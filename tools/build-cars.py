
import bpy, math, os, bmesh
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
OUT=os.path.abspath('public/models'); os.makedirs(OUT,exist_ok=True)
def v(p): return (p[0],-p[2],p[1])
def mat(name,color,metal=0,rough=.4,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if name=='Paint':p.inputs['Coat Weight'].default_value=1
 if emit:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
paint=mat('Paint',(.82,.15,.035),.55,.28);glass=mat('Glass',(.018,.033,.042),.22,.19)
dark=mat('Graphite',(.014,.018,.022),.45,.35);rubber=mat('Rubber',(.012,.014,.016),0,.8)
metal=mat('Alloy',(.23,.27,.3),.85,.26);red=mat('Tail',(.8,.012,.004),.1,.3,2)
white=mat('Headlight',(.75,.9,1),.1,.2,3)
static=[]
def mesh(name,verts,faces,material,collect=True):
 me=bpy.data.meshes.new(name);me.from_pydata([v(p) for p in verts],[],faces);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(material)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 for p in me.polygons:p.use_smooth=True
 if collect:static.append(ob)
 return ob
def cube(name,pos,scale,material,bevel=.03,collect=True):
 bpy.ops.mesh.primitive_cube_add(size=1,location=v(pos));o=bpy.context.object;o.name=name;o.dimensions=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=bevel;b.segments=3;bpy.ops.object.modifier_apply(modifier=b.name)
 for p in o.data.polygons:p.use_smooth=True
 n=o.modifiers.new('Corner normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=n.name)
 if collect:static.append(o)
 return o
def tube(name,pts,r,material):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2
 sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*v(co),1)
 ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(material)
 bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False);static.append(ob);return ob
secs=[(-2.3,.83,.69),(-2.18,.94,.81),(-1.85,1.0,.91),(-1.34,1.01,.94),(-.6,.95,.85),(.2,.92,.8),(.85,.95,.84),(1.38,.99,.87),(1.85,.94,.8),(2.2,.9,.71),(2.32,.78,.64)]
verts=[]
for z,w,t in secs:
 for x,y in [(-.82,.26),(-1,.34),(-1,t-.13),(-.94,t-.025),(-.75,t),(-.35,t-.025),(0,t-.035),(.35,t-.025),(.75,t),(.94,t-.025),(1,t-.13),(1,.34),(.82,.26),(0,.23)]:
  verts.append((x*w,y,z))
n=14;faces=[]
for i in range(len(secs)-1):
 for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
faces+=[tuple(range(n-1,-1,-1)),tuple((len(secs)-1)*n+j for j in range(n))]
body=mesh('Sculpted continuous body',verts,faces,paint)
bpy.context.view_layer.objects.active=body
sub=body.modifiers.new('Surface curvature','SUBSURF');sub.levels=2;bpy.ops.object.modifier_apply(modifier=sub.name)
for z in [-1.34,1.38]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.425,depth=3,location=v((0,.385,z)),rotation=(0,math.pi/2,0))
 cutter=bpy.context.object;bpy.context.view_layer.objects.active=body
 mod=body.modifiers.new('Real wheel well','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
b=body.modifiers.new('Arch edge','BEVEL');b.width=.012;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
# Continuous coupe canopy with surface-conforming glass; no detached roof/pillars.
profiles=[(-1.65,.79,.85,0),(-1.35,.8,.85,.16),(-.9,.79,.85,.37),(-.55,.78,.85,.43),(-.1,.78,.85,.43),(.22,.79,.85,.36),(.55,.81,.83,.20),(.93,.82,.8,0)]
def profile(z):
 for i in range(len(profiles)-1):
  a,b=profiles[i:i+2]
  if a[0]<=z<=b[0]:
   t=(z-a[0])/(b[0]-a[0]);return [a[j]+(b[j]-a[j])*t for j in range(1,4)]
 return profiles[0][1:] if z<profiles[0][0] else profiles[-1][1:]
def canopy(z,u,offset=0):
 w,base,h=profile(z);return (w*u,base+h*max(0,1-u*u)**.42+offset,z)
def patch(name,z0,z1,u0,u1,material,offset=0,nz=32,nu=20):
 vs=[canopy(z0+(z1-z0)*i/nz,u0+(u1-u0)*j/nu,offset) for i in range(nz+1) for j in range(nu+1)]
 fs=[(i*(nu+1)+j,i*(nu+1)+j+1,(i+1)*(nu+1)+j+1,(i+1)*(nu+1)+j) for i in range(nz) for j in range(nu)]
 return mesh(name,vs,fs,material)
patch('Integrated roof and pillars',-1.65,.93,-1,1,paint)
patch('Raked windscreen',.26,.84,-.86,.86,glass,.009)
patch('Fastback rear glass',-1.5,-.76,-.85,.85,glass,.009)
for side in [-1,1]:
 # side windows taper at both ends
 vs=[];nz=26;nu=8
 for i in range(nz+1):
  t=i/nz;z=-1.32+2.07*t
  upper=.73+.20*abs(2*t-1)**2
  for j in range(nu+1):vs.append(canopy(z,side*(upper+(.985-upper)*j/nu),.007))
 mesh('Side glass',vs,[(i*(nu+1)+j,i*(nu+1)+j+1,(i+1)*(nu+1)+j+1,(i+1)*(nu+1)+j) for i in range(nz) for j in range(nu)],glass)
 cube('Mirror stalk',(side*.85,.91,.52),(.18,.035,.045),dark,.01)
 cube('Integrated mirror',(side*1.015,.94,.55),(.23,.095,.2),paint,.04)
 cube('Mirror lens',(side*1.016,.947,.449),(.17,.055,.008),glass,.02)
 cube('Flush handle',(side*.954,.76,-.5),(.012,.026,.18),dark,.008)
 cube('Sill',(side*.92,.285,0),(.12,.085,1.85),dark,.025)
 # arch liner half-ring follows wheel arch, recessed inside body
 for z in [-1.34,1.38]:
  pts=[(side*.967,.385+.413*math.sin(a),z+.413*math.cos(a)) for a in [math.pi*i/32 for i in range(33)]]
  tube('Arch inner lip',pts,.012,dark)
# curved inset tail, lightbar and integrated ducktail
for name,y,r,ma in [('Inset tail surround',.68,.077,dark),('Continuous red LED',.735,.013,red),('Integrated ducktail',.804,.017,paint)]:
 tube(name,[(x,y,(-2.335 if ma==red else -2.255)+.13*(abs(x)/.86)**3) for x in [ -.86+i*1.72/40 for i in range(41)]],r,ma)
cube('Rear diffuser',(0,.35,-2.17),(1.68,.19,.23),dark,.07)
cube('License recess',(0,.525,-2.287),(.48,.115,.025),dark,.014)
for side in [-1,1]:
 tube('Front LED',[(side*(.48+i*.36/18),.687+.025*i/18,2.244-.04*i/18) for i in range(19)],.017,white)
 cube('Headlight housing',(side*.65,.672,2.20),(.46,.083,.07),dark,.025)
 cube('Front intake',(side*.66,.47,2.195),(.39,.17,.12),dark,.05)
 # torus exhaust ring oriented along front-back axis
 bpy.ops.mesh.primitive_torus_add(major_radius=.069,minor_radius=.013,major_segments=24,minor_segments=8,location=v((side*.64,.355,-2.305)),rotation=(math.pi/2,0,0))
 o=bpy.context.object;o.name='Full round exhaust';o.data.materials.append(metal);static.append(o)
 cube('Exhaust depth',(side*.64,.355,-2.288),(.1,.10,.012),dark,.04)
cube('Central front grille',(0,.485,2.255),(.86,.17,.07),dark,.04)
cube('Front splitter',(0,.325,2.13),(1.79,.043,.34),dark,.025)
# Wheel assemblies each pivot contains a single mesh with material slots.
for side in [-1,1]:
 for z,label in [(-1.34,'R'),(1.38,'F')]:
  center=(side*.965,.385,z);parts=[]
  def cyl(name,r,depth,ma,off=0):
   bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=v((center[0]+off,center[1],center[2])),rotation=(0,math.pi/2,0))
   ob=bpy.context.object;ob.name=name;ob.data.materials.append(ma)
   bevel=ob.modifiers.new('Rounded edge','BEVEL');bevel.width=.025;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
   for p in ob.data.polygons:p.use_smooth=True
   parts.append(ob);return ob
  cyl('Tire',.375,.275,rubber);cyl('Rim barrel',.286,.279,dark)
  cyl('Brake disc',.225,.02,metal,side*.115)
  cyl('Hub',.07,.025,metal,side*.161)
  bpy.ops.mesh.primitive_torus_add(major_radius=.275,minor_radius=.014,major_segments=32,minor_segments=8,location=v((center[0]+side*.153,center[1],center[2])),rotation=(0,math.pi/2,0))
  lip=bpy.context.object;lip.data.materials.append(metal);parts.append(lip)
  for i in range(5):
   for delta in [-.09,.09]:
    a=i*math.tau/5+delta
    p=cube('Split spoke',(center[0]+side*.153,center[1]+math.sin(a)*.15,center[2]+math.cos(a)*.15),(.029,.028,.245),metal,.009,False)
    # long dimension is Blender Y, rotate around Blender X
    p.rotation_euler.x=-a;parts.append(p)
  bpy.ops.object.select_all(action='DESELECT')
  for p in parts:p.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);bpy.ops.object.join();wheel=bpy.context.object
  bpy.context.scene.cursor.location=v(center);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
  wheel.name='Wheel_'+label+('L' if side>0 else 'R')
# Merge static meshes per material, limiting draw calls.
groups=[[o for o in static if o.data.materials[0]==ma] for ma in [paint,glass,dark,metal,red,white]]
for ma,objs in zip([paint,glass,dark,metal,red,white],groups):

 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 if objs:
  bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();bpy.context.object.name=ma.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('art/solstice-gt.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'solstice-gt.glb'),export_format='GLB',export_yup=True,export_apply=True)
print('CAR_MODEL_EXPORTED',sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'))




