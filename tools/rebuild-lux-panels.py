"""Deterministic panel rebuild of the Aholo GT, using its approved canopy and axle package.
No original body skin survives: all lower exterior panels use controlled shared curves.
The default output is an isolated candidate; promotion is a separate reviewed operation.
"""
import bpy,bmesh,math,json,struct,hashlib,argparse,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
def gp(p):return (p[0],-p[2],p[1])
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 return m
def mesh(name,vs,fs,material,up=None,thickness=0):
 d=bpy.data.meshes.new(name);d.from_pydata([gp(v) for v in vs],[],fs);d.materials.append(material);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 if up and sum(f.normal.dot(Vector(gp(up)))*f.calc_area() for f in bm.faces)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
 bm.to_mesh(d);bm.free()
 for p in d.polygons:p.use_smooth=True
 if thickness:
  bpy.context.view_layer.objects.active=o;s=o.modifiers.new('True inward panel thickness','SOLIDIFY');s.thickness=thickness;s.offset=-1;s.use_even_offset=True;bpy.ops.object.modifier_apply(modifier=s.name)
 return o
def grid(name,fun,nu,nv,material,up=None,thickness=.008):
 return mesh(name,[fun(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)],[(j*(nu+1)+i,j*(nu+1)+i+1,(j+1)*(nu+1)+i+1,(j+1)*(nu+1)+i) for j in range(nv) for i in range(nu)],material,up,thickness)
def box(name,center,size,material,bevel=.01):
 bpy.ops.mesh.primitive_cube_add(size=1,location=gp(center));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  b=o.modifiers.new('Machined edge radius','BEVEL');b.width=bevel;b.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
 for p in o.data.polygons:p.use_smooth=True
 n=o.modifiers.new('Weighted hard surface normals','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name)
 return o
def boolean(o,c):
 bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Real component opening','BOOLEAN');m.object=c;m.operation='DIFFERENCE';m.solver='EXACT';bpy.ops.object.modifier_apply(modifier=m.name)
def tube(name,points,r,material,segments=8):
 vs=[];fs=[]
 for k,p in enumerate(points):
  tangent=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(0,k-1)]);tangent.normalize();axis=tangent.cross(Vector((0,1,0)))
  if axis.length<.01:axis=tangent.cross(Vector((1,0,0)))
  axis.normalize();other=tangent.cross(axis).normalized()
  for i in range(segments):vs.append(tuple(Vector(p)+r*(axis*math.cos(i*2*math.pi/segments)+other*math.sin(i*2*math.pi/segments))))
 for j in range(len(points)-1):
  for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;fs.append((a,b,b+segments,a+segments))
 fs.extend([tuple(reversed(range(segments))),tuple((len(points)-1)*segments+i for i in range(segments))]);return mesh(name,vs,fs,material)
def smooth(t):return t*t*(3-2*t)
def width(z):
 # Broad rear haunch, pinched door waist and front wheel shoulder; low-frequency shape only.
 return 1.01+.028*math.exp(-((z+1.35)/.65)**2)+.022*math.exp(-((z-1.35)/.55)**2)-.035*math.exp(-(z/.68)**2)-.055*smooth(max(0,(abs(z)-2.10)/.20))
def cabwidth(z):return .84-(z+1.7)/2.5*.01
def crown(z):
 if z<=-1.7:return .955-.13*((-1.7-z)/.60)**1.45
 if z<=.8:return .955
 return .955-.18*((z-.8)/1.5)**1.55

def side_x(y,z):
 u=(y-.205)/(top(width(z),z)-.205)
 return width(z)-.085*(1-u)**2+.023*math.sin(math.pi*u)-.025*math.exp(-((u-.38)/.23)**2)*math.exp(-(z/.95)**4)

def top(x,z):
 # At the rear window this is EXACTLY the retained window's transverse boundary.
 a=abs(x);w=cabwidth(max(-1.7,min(.8,z)));base=crown(z)
 if a<=w:return base-.035*(a/w)**2
 q=(a-w)/(width(z)-w);return base-.035-.083333*(a-w)-.115*q*q

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--out-dir',default=str(ROOT/'output/vehicle-rebuild/candidate'));parser.add_argument('--baseline',default=str(ROOT/'art/lux3d/aholo-gt-package.glb'));args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 out=Path(args.out_dir);out.mkdir(parents=True,exist_ok=True);source=Path(args.baseline)
 if not source.exists():raise FileNotFoundError('The retained Aholo package is required; do not rebuild from an already modified production vehicle.')
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
 keep=lambda n:n.startswith(('Wheel_','Window ','Unified canopy roof','Rear glass ','Front physical ','Rear physical ','Dark closed passenger floor','Rear parcel shelf','Brake_high'))
 for o in list(bpy.context.scene.objects):
  if not keep(o.name):bpy.data.objects.remove(o,do_unlink=True)
 package=ROOT/'art/lux3d/aholo-gt-package.glb'
 if not package.exists():
  bpy.ops.export_scene.gltf(filepath=str(package),export_format='GLB',export_yup=True,export_extras=True)
 paint=mat('Paint',(.62,.19,.055),.62,.25);paint.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=1
 dark=mat('Graphite',(.016,.02,.024),.2,.38);lining=mat('Cabin lining',(.012,.018,.022),0,.75);alloy=mat('Exhaust brushed alloy',(.34,.38,.41),.94,.24);lamp=mat('Tail',(.48,.004,.002),.2,.18)
 lamp.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.48,.002,.001,1);lamp.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1.2
 led=mat('Headlight',(.72,.83,.91),.2,.18);led.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.72,.83,.91,1);led.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1.3
 # Open-backed aerodynamic mirror shell, rear-facing inset glass and a real seal.
 mirrorGlass=mat('Glass',(.66,.73,.77),.95,.075)
 for side,label in [(-1,'right'),(1,'left')]:
  center=Vector((side*1.005,.992,.245));normal=Vector((-side*.4,.03,-.916)).normalized();u=Vector((.916,0,-side*.4)).normalized();v=normal.cross(u).normalized()
  if v.y<0:v=-v
  def mp(a,b,d):return tuple(center+u*a+v*b+normal*d)
  n=40;vs=[];fs=[]
  for d,sx,sy in [(0,1,1),(-.025,1.035,1.02),(-.070,.92,.88),(-.105,.60,.62),(-.119,.12,.15)]:
   for i in range(n):a=2*math.pi*i/n;vs.append(mp(.125*sx*math.cos(a),.054*sy*math.sin(a),d))
  for j in range(4):
   for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
  fs.append(tuple(4*n+i for i in range(n)))
  o=mesh('Mirror shell '+label,vs,fs,paint,None,.004);o['driverVisibleExterior']=True
  # Rounded perimeter ring stays behind and outside the actual optical face.
  pts=[mp(.119*math.cos(2*math.pi*i/n),.050*math.sin(2*math.pi*i/n),.003) for i in range(n+1)]
  o=tube('Mirror seal '+label,pts,.004,dark,6);o['driverVisibleExterior']=True
  vs=[mp(0,0,.006)]+[mp(.114*math.cos(2*math.pi*i/n),.046*math.sin(2*math.pi*i/n),.005) for i in range(n)]
  o=mesh('Mirror reflective lens '+label,vs,[(0,i+1,(i+1)%n+1) for i in range(n)],mirrorGlass,tuple(normal),.002);o['driverVisibleExterior']=True
  o=tube('Mirror support '+label,[(side*.837,.939,.402),(side*.90,.957,.359),(side*.973,.973,.314)],.020,dark,10);o['driverVisibleExterior']=True
  o=box('Mirror mount '+label,(side*.832,.944,.400),(.028,.048,.079),dark,.009);o['driverVisibleExterior']=True
  o=mesh('Mirror sail '+label,[(side*.839,.841,.15),(side*.833,.841,.67),(side*.815,1.010,.64)],[(0,1,2)],dark,(side,0,0),.008);o['driverVisibleExterior']=True
  bpy.ops.object.select_all(action='DESELECT')
  trim=[bpy.data.objects[prefix+label] for prefix in ['Mirror seal ','Mirror support ','Mirror mount ','Mirror sail ']]
  for o in trim:o.select_set(True)
  bpy.context.view_layer.objects.active=trim[0];bpy.ops.object.join();bpy.context.object.name='Mirror trim '+label
 # Preserve actual window rows, only their shared connection is rebuilt.
 def deck_x(u,z):
  i=u*76;w=width(z)
  if i<14:return -w+(w-.84)*i/14
  if i<=62:return -.84+1.68*(i-14)/48
  return .84+(w-.84)*(i-62)/14
 rear=grid('Rear deck',lambda u,v:(deck_x(u,-1.7-.60*v),top(deck_x(u,-1.7-.60*v),-1.7-.60*v),-1.7-.60*v),76,32,paint,(0,1,0),.012)
 # The analytic edge is shared with the retained window. Independent exported-mesh
 # checks measure tessellation error along that edge, rather than trusting this formula.
 for side,label in [(-1,'left'),(1,'right')]:
  grid('Canopy sill '+label,lambda u,v,s=side:(s*(cabwidth(-1.7+2.5*v)+(width(-1.7+2.5*v)-cabwidth(-1.7+2.5*v))*u),top(cabwidth(-1.7+2.5*v)+(width(-1.7+2.5*v)-cabwidth(-1.7+2.5*v))*u,-1.7+2.5*v),-1.7+2.5*v),14,64,paint,(0,1,0),.012)
  # Door and fender skin share a single fair side function, with genuine wheel openings.
  def sidept(u,v,s=side):
   z=-2.3+4.6*v;yTop=top(width(z),z);y=.205+(yTop-.205)*u;x=side_x(y,z)
   return(s*x,y,z)
  body=grid('Body side '+label,sidept,12,104,paint,(side,0,0),.012)
  for axz,cy,r in [(1.38821876,.39701805,.412),(-1.33881247,.39023679,.410)]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=.70,location=gp((side*.93,cy,axz)),rotation=(0,math.pi/2,0));c=bpy.context.object;boolean(body,c);bpy.data.objects.remove(c,do_unlink=True)
   # Restrained rolled wheel arch lip: radial highlight follows the true wheel opening.
   pts=[]
   for i in range(65):
    a=.02+(math.pi-.04)*i/64;z=axz+r*math.cos(a);y=cy+r*math.sin(a)
    if y<=top(width(z),z):x=side_x(y,z)
    else:
     lo=.78;hi=width(z)
     for _ in range(20):
      mid=(lo+hi)/2
      if top(mid,z)>y:lo=mid
      else:hi=mid
     x=(lo+hi)/2
    pts.append((side*(x+.003),y,z))
   tube('Wheel arch rolled lip '+label+str(axz),pts,.004,paint)
  # Real door shutlines and flush handle, on the fair side skin.
  for endz in [-.87,.70]:
   pts=[]
   for i in range(25):
    t=i/24;y=.275+(.885-.275)*t;z=endz+(.09 if endz<0 else -.03)*(1-t);u=(y-.205)/(top(width(z),z)-.205);x=width(z)-.085*(1-u)**2+.023*math.sin(math.pi*u)-.025*math.exp(-((u-.38)/.23)**2)*math.exp(-(z/.95)**4)+.001
    if y<=top(width(z),z):pts.append((side*x,y,z))
   tube('Door shut line '+label+str(endz),pts,.0015,dark,6)
  box('Flush door handle '+label,(side*(width(-.50)+.003),.735,-.50),(.012,.022,.16),dark,.007)
  box('Sill aero blade '+label,(side*.963,.217,-.02),(.045,.045,1.52),dark,.009)
 # Hood and front wings use the same transverse top curve, divided by a 3 mm true panel gap.
 hz0=.84;hz1=2.10;hw=.78
 hood=grid('Driver_hood',lambda u,v:((2*u-1)*hw,top((2*u-1)*hw,hz0+(hz1-hz0)*v),hz0+(hz1-hz0)*v),40,44,paint,(0,1,0),.008);hood['driverHood']=True;hood['driverVisibleExterior']=True
 frontParts=[]
 for side in [-1,1]:
  o=grid('Front wing '+str(side),lambda u,v,s=side:(s*(hw+.003+(width(.84+1.26*v)-hw-.003)*u),top(hw+.003+(width(.84+1.26*v)-hw-.003)*u,.84+1.26*v),.84+1.26*v),16,44,paint,(0,1,0),.012);frontParts.append(o)
 cowl=grid('Driver_cowl',lambda u,v:((2*u-1)*width(.8+.037*v),top((2*u-1)*width(.8+.037*v),.8+.037*v),.8+.037*v),72,8,paint,(0,1,0),.014);cowl['driverVisibleExterior']=True
 frontParts.append(grid('Front nose top',lambda u,v:((2*u-1)*width(2.103+.197*math.sin(v*math.pi/2)),top((2*u-1)*width(2.103+.197*math.sin(v*math.pi/2)),2.103+.197*math.sin(v*math.pi/2))-.13*(1-math.cos(v*math.pi/2)),2.103+.197*math.sin(v*math.pi/2)),96,16,paint,(0,1,0),.012))
 bpy.ops.object.select_all(action='DESELECT')
 for o in frontParts:o.select_set(True)
 bpy.context.view_layer.objects.active=frontParts[0];bpy.ops.object.join();front=bpy.context.object;front.name='Driver_front_structure';front['driverVisibleExterior']=True
 # Fender sides remain visible in cockpit via a clipped copy of this full side structure.
 for side,label in [(-1,'left'),(1,'right')]:
  sourceObj=bpy.data.objects['Body side '+label];o=sourceObj.copy();o.data=sourceObj.data.copy();bpy.context.collection.objects.link(o);o.name='Driver front side '+label
  # Bisect the copy at the fixed front corner; delete front vertices from original to avoid duplicate geometry.
  for obj,clearInner,clearOuter in [(o,False,True),(sourceObj,True,False)]:
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector(gp((0,0,.622))),plane_no=Vector(gp((0,0,1))),clear_inner=clearInner,clear_outer=clearOuter);bm.to_mesh(obj.data);bm.free()
  # normal +Z: clear_outer removes +Z. Correct selection swaps below if necessary.
  if max((-v.co.y for v in o.data.vertices),default=0)<.81:
   old=o.data;o.data=sourceObj.data;sourceObj.data=old
  o['driverVisibleExterior']=True
  sill=bpy.data.objects['Canopy sill '+label];cp=sill.copy();cp.data=sill.data.copy();bpy.context.collection.objects.link(cp);cp.name='Driver cowl side '+label;cp['driverVisibleExterior']=True
  for obj,inside,outside in [(cp,True,False),(sill,False,True)]:
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector(gp((0,0,.622))),plane_no=Vector(gp((0,0,1))),clear_inner=inside,clear_outer=outside);bm.to_mesh(obj.data);bm.free()
 # The same wheel cutter also trims the top shoulder skin, so the rolled arch
 # follows a real opening through the complete fender rather than a side-only cut.
 for side,label in [(-1,'left'),(1,'right')]:
  for axz,cy,r in [(1.38821876,.39701805,.412),(-1.33881247,.39023679,.410)]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=.70,location=gp((side*.93,cy,axz)),rotation=(0,math.pi/2,0));c=bpy.context.object
   targets=[bpy.data.objects['Driver_front_structure']] if axz>0 else [bpy.data.objects['Canopy sill '+label]]
   for o in targets:boolean(o,c)
   bpy.data.objects.remove(c,do_unlink=True)
 # Matched wheel-house liners replace the narrower retained source semicylinders.
 # Their outer return is behind the physical arch edge, not outside the door skin.
 for side,label in [(-1,'left'),(1,'right')]:
  for axz,cy,r in [(1.38821876,.39701805,.414),(-1.33881247,.39023679,.412)]:
   def liner_pt(u,v,s=side,az=axz,ay=cy,ar=r):
    a=-.50+(math.pi+1.0)*v;z=az+ar*math.cos(a);y=ay+ar*math.sin(a)
    if y<=top(width(z),z):outer=side_x(y,z)-.014
    else:
     lo=.78;hi=width(z)
     for _ in range(20):
      mid=(lo+hi)/2
      if top(mid,z)>y:lo=mid
      else:hi=mid
     outer=(lo+hi)/2-.014
    return(s*(.54+(outer-.54)*u),y,z)
   grid('Wheelhouse felt '+label+str(axz),liner_pt,2,48,lining,(0,-1,0),.004)
   # A real inner tub wall prevents the wheel opening looking through the cabin.
   # Its X=.54 wall is outside the worst .56 rad steering sweep of every variant.
   pts=[(side*.54,cy,axz)]+[(side*.54,cy+r*math.sin(-.50+(math.pi+1)*i/48),axz+r*math.cos(-.50+(math.pi+1)*i/48)) for i in range(49)]
   mesh('Wheelhouse inner wall '+label+str(axz),pts,[(0,i+1,i+2) for i in range(48)]+[(0,49,1)],lining,(side,0,0),.004)
 # Front/rear bumper surfaces are controlled closed solids with physically subtracted apertures.
 def fascia(name,z,material):
  sign=1 if z>0 else -1
  o=grid(name,lambda u,v:((2*u-1)*width(z),.205+(top((2*u-1)*width(z),z)-(.13 if z>0 else 0)-.205)*v,z-sign*.045*(2*u-1)**4),96,24,material,(0,0,sign),.035)
  return o
 back=fascia('Rear bumper',-2.30,paint);face=fascia('Front bumper',2.30,paint)
 # Bumper inset trim uses a real opening at the exhaust axes.
 valance=grid('Rear graphite valance',lambda u,v:((2*u-1)*.93,.23+.21*v,-2.310),64,6,dark,(0,0,-1),.045)
 for side,label in [(-1,'left'),(1,'right')]:
  cx=side*.68;cy=.355
  bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.068,depth=.70,location=gp((cx,cy,-2.30)),rotation=(math.pi/2,0,0));c=bpy.context.object
  for target in [back,valance]:boolean(target,c)
  bpy.data.objects.remove(c,do_unlink=True)
  # Annular metal tube with finite wall, full inner bore and deep dark stop.
  vs=[];fs=[];n=48
  for z,r in [(-2.355,.066),(-2.355,.053),(-2.155,.053),(-2.155,.066)]:
   for i in range(n):a=i*2*math.pi/n;vs.append((cx+r*math.cos(a),cy+r*math.sin(a),z))
  for j in range(4):
   for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
  mesh('Exhaust metal '+label,vs,fs,alloy)
  mesh('Exhaust interior '+label,[(cx,cy,-2.13)]+[(cx+.054*math.cos(i*2*math.pi/n),cy+.054*math.sin(i*2*math.pi/n),-2.13) for i in range(n)],[(0,i+1,(i+1)%n+1) for i in range(n)],lining,(0,0,-1))
 # One thick enclosed tail lens with black gasket and housing.
 grid('Tail lamp recessed housing',lambda u,v:((2*u-1)*.92,.773-.065*(2*u-1)**4+(v-.5)*.042,-2.316),64,4,dark,(0,0,-1),.024)
 grid('Rear continuous Tail',lambda u,v:((2*u-1)*.895,.779-.060*(2*u-1)**4+(v-.5)*.012,-2.338),64,2,lamp,(0,0,-1),.012)
 for x in [-.43,-.22,0,.22,.43]:box('Rear diffuser fin '+str(x),(x,.255,-2.31),(.012,.10,.12),dark,.004)
 # Recessed front grille cavity; actual bumper opening, grille behind and clean rim.
 cutter=box('Grille cutter',(0,.455,2.30),(1.22,.23,.35),dark,.065);boolean(face,cutter);bpy.data.objects.remove(cutter,do_unlink=True)
 box('Front grille cavity',(0,.455,2.20),(1.21,.22,.08),lining,.055)
 for i in range(-16,17):box('Grille vertical '+str(i),(i*.034,.455,2.25),(.003,.18,.009),dark,.001)
 for y in [.39,.422,.454,.486,.518]:box('Grille crossbar '+str(y),(0,y,2.257),(1.1,.003,.006),dark,.001)
 for side in [-1,1]:
  outline=[(-.17,-.010),(.13,-.015),(.18,.027),(-.13,.017)]
  vs=[(side*(.76+x),.648+y,z) for z in [2.277,2.309] for x,y in outline];fs=[(0,3,2,1),(4,5,6,7)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
  mesh('Headlamp inset housing '+str(side),vs,fs,dark)
  points=[(side*(.76+x),.648+y,2.313) for x,y in [(-.14,-.002),(.12,-.006),(.155,.014)]]
  tube('Headlamp fine LED '+str(side),points,.004,led,6)
  box('Front air duct '+str(side),(side*.805,.43,2.299),(.235,.22,.075),dark,.045)
 box('Front lower splitter',(0,.215,2.29),(1.91,.036,.15),dark,.016)
 # Existing physical plate letters and COLOR_0 remain untouched; shift all components together.
 for o in bpy.context.scene.objects:
  if o.name.startswith('Front physical '):o.location+=Vector(gp((0,0,-.012)))
  if o.name.startswith('Rear physical '):o.location+=Vector(gp((0,.015,.019)))
 # The nose wraps around the car in plan and tucks inward below the bumper belt.
 # One coordinate transformation is shared by skin, lamp, grille and lip vertices.
 for o in bpy.context.scene.objects:
  if o.type!='MESH' or o.name.startswith(('Front physical ','Rear physical ','Window ','Mirror ','Wheel_','Black wheel housing','Driver cowl side','Driver_cowl')):continue
  for v in o.data.vertices:
   world=o.matrix_world@v.co;x,y,z=world.x,world.z,-world.y
   if z>1.90:
    t=min(1,(z-1.90)/.40);offset=.18*smooth(t)*(abs(x)/1.04)**2+.045*smooth(t)*max(0,(.42-y)/.22)**2
    world.y+=offset;v.co=o.matrix_world.inverted()@world
   elif z<-2.05:
    t=min(1,(-z-2.05)/.25);world.y-=.10*smooth(t)*(abs(x)/1.04)**2;v.co=o.matrix_world.inverted()@world
 # Declare shared exterior boundaries in canonical game XYZ, consumed by Three.js.
 transverse=lambda w,z,fn:[[w*(i/16-1),fn(w*(i/16-1)),z] for i in range(33)]
 declaration={'version':1,'coordinateSpace':'vehicle-local-game-xyz','units':'m','windscreenLower':transverse(.83,.8,lambda x:.955-.035*(x/.83)**2),'windscreenUpper':transverse(.68,.035,lambda x:1.37-.035*(x/.68)**2),'hoodRear':transverse(hw,.84,lambda x:top(x,.84)),'rearWindowLower':transverse(.84,-1.70,lambda x:.955-.035*(x/.84)**2),'panelThickness':{'hood':.008,'body':.012,'cowl':.014},'roles':{'Driver_hood':{'driverVisibleExterior':True},'Driver_front_structure':{'driverVisibleExterior':True},'Driver_cowl':{'driverVisibleExterior':True},'Driver front side left':{'driverVisibleExterior':True},'Driver front side right':{'driverVisibleExterior':True},'Window windscreen':{'driverVisibleExterior':True},'Window left':{'driverVisibleExterior':True},'Window right':{'driverVisibleExterior':True},'exhaustInterior':['Exhaust interior left','Exhaust interior right']},'exhaustAxes':[{'center':[s*.68,.355,-2.355+.10*(.68/1.04)**2],'direction':[0,0,1]} for s in [-1,1]],'fixedCorners':{}}
 for label,s in [('left',-1),('right',1)]:declaration['fixedCorners'][label]={'aPillarFoot':[s*.83,.92,.8],'cowlOuter':[s*.83,.92,.8],'doorFrontUpper':[s*.835,.852,.622],'doorFrontLower':[s*.835,.23,.622]}
 for side in [-1,1]:
  anchor=bpy.data.objects.new('Exhaust_L' if side>0 else 'Exhaust_R',None);bpy.context.collection.objects.link(anchor);anchor.location=gp((side*.68,.355,-2.355+.10*(.68/1.04)**2))
 e=bpy.data.objects.new('Vehicle_assembly',None);bpy.context.collection.objects.link(e);e['vehicleAssembly']=declaration
 # Merge repeated small details by material to reduce draw calls without losing structural names.
 prefixes=['Wheelhouse inner wall ','Wheelhouse felt ','Grille ','Door shut line ','Wheel arch rolled lip ','Rear diffuser fin ','Headlamp ','Front air duct ','Sill aero blade ','Flush door handle ']
 for prefix in prefixes:
  groups={}
  for o in list(bpy.context.scene.objects):
   if o.type=='MESH' and o.name.startswith(prefix):groups.setdefault(o.data.materials[0].name,[]).append(o)
  for material,items in groups.items():
   if len(items)<2:continue
   bpy.ops.object.select_all(action='DESELECT')
   for o in items:o.select_set(True)
   bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();bpy.context.object.name=prefix.strip()+' '+material
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'solstice-lux-gt.blend'))
 bpy.ops.export_scene.gltf(filepath=str(out/'solstice-lux-gt.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
 binary=(out/'solstice-lux-gt.glb').read_bytes();j=json.loads(binary[20:20+struct.unpack_from('<I',binary,12)[0]])
 report={'method':'Shared-boundary controlled exterior panel rebuild; retained approved Aholo canopy, axle package and plate geometry; rebuilt correctly opened mirrors','sourcePackageSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourcePackage':str(source.relative_to(ROOT)),'referenceBaselineSha256':'f36cc7ea33220924f411738476ee6b6f8e00019d2a0d767c0308db7d1c5747da','assetSha256':hashlib.sha256(binary).hexdigest(),'glbBytes':len(binary),'triangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in j['meshes']),'blender':bpy.app.version_string,'assembly':declaration}
 (out/'lux-car-build.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('CANDIDATE_REBUILD',json.dumps({k:v for k,v in report.items() if k!='assembly'}))
if __name__=='__main__':main()
