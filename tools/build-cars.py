
import bpy, math, os, bmesh
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
OUT=os.path.abspath('public/models'); os.makedirs(OUT,exist_ok=True)
def v(p): return (p[0],-p[2],p[1])
def mat(name,color,metal=0,rough=.4,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if name=='Paint':
  p.inputs['Coat Weight'].default_value=1;p.inputs['Coat Roughness'].default_value=.16
 if name=='Glass':
  p.inputs['IOR'].default_value=1.5;p.inputs['Coat Weight'].default_value=.65;p.inputs['Coat Roughness'].default_value=.10
 if emit:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
paint=mat('Paint',(.82,.15,.035),.55,.28);glass=mat('Glass',(.025,.045,.055),.05,.12)
window_glass=mat('Window glass',(.36,.44,.48),0,.09)
window_glass.diffuse_color=(.36,.44,.48,.30)
window_glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.30
window_glass.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.5
window_glass.use_backface_culling=False
dark=mat('Graphite',(.014,.018,.022),.45,.35);rubber=mat('Rubber',(.012,.014,.016),0,.8)
metal=mat('Alloy',(.23,.27,.3),.85,.26);red=mat('Tail',(.8,.012,.004),.1,.3,2)
white=mat('Headlight',(.75,.9,1),.1,.2,3)
grille=mat('Intake mesh',(.035,.044,.049),.5,.44)
caliper=mat('Caliper',(.55,.045,.015),.35,.30)
plate=mat('Plate',(.80,.82,.78),.12,.27)
# One vertex-coloured material carries both reflective plate stock and blue band.
plate.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(1,1,1,1)
plate_color=plate.node_tree.nodes.new('ShaderNodeVertexColor');plate_color.layer_name='PlateTint'
plate.node_tree.links.new(plate_color.outputs['Color'],plate.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
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
  b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=bevel;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
 for p in o.data.polygons:p.use_smooth=True
 n=o.modifiers.new('Corner normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=n.name)
 if collect:static.append(o)
 return o
def tube(name,pts,r,material,resolution=2):
 bpy.ops.object.select_all(action='DESELECT')
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=resolution
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
# A real cockpit well: no Paint slab through the seats, armrest or transparent windows.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update()
closed_cabin_skin=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
cabin_cutter=cube('Temporary cockpit volume',(0,1.25,-.20),(1.40,2.01,1.96),dark,.035,False)
bpy.context.view_layer.objects.active=body
well=body.modifiers.new('Open passenger compartment','BOOLEAN');well.operation='DIFFERENCE';well.solver='EXACT';well.object=cabin_cutter
bpy.ops.object.modifier_apply(modifier=well.name);bpy.data.objects.remove(cabin_cutter,do_unlink=True)
cube('Closed passenger lower pan',(0,.239,-.20),(1.36,.012,1.90),dark,.008)
# Window boundaries define an open, continuous coupe greenhouse, not glass over a painted cap.
profiles=[(-1.65,.79,.85,0),(-1.35,.8,.85,.16),(-.9,.79,.85,.37),(-.55,.78,.85,.46),(-.1,.78,.85,.46),(.22,.79,.85,.36),(.55,.81,.83,.20),(.93,.82,.8,0)]
def profile(z):
 # C1 Hermite interpolation removes the former longitudinal roof facets.
 for i in range(len(profiles)-1):
  a,b=profiles[i:i+2]
  if a[0]<=z<=b[0]:
   length=b[0]-a[0];t=(z-a[0])/length;previous=profiles[max(0,i-1)];following=profiles[min(len(profiles)-1,i+2)]
   result=[]
   for j in range(1,4):
    m0=(b[j]-previous[j])/(b[0]-previous[0]);m1=(following[j]-a[j])/(following[0]-a[0])
    result.append((2*t**3-3*t*t+1)*a[j]+(t**3-2*t*t+t)*length*m0+(-2*t**3+3*t*t)*b[j]+(t**3-t*t)*length*m1)
   return result
 return profiles[0][1:] if z<profiles[0][0] else profiles[-1][1:]

def canopy(z,u,offset=0):
 w,base,h=profile(z);return (w*u,base+h*max(0,1-u*u)**.42+offset,z)
def patch(name,z0,z1,u0,u1,material,offset=0,nz=32,nu=20):
 vs=[canopy(z0+(z1-z0)*i/nz,u0+(u1-u0)*j/nu,offset) for i in range(nz+1) for j in range(nu+1)]
 fs=[(i*(nu+1)+j,i*(nu+1)+j+1,(i+1)*(nu+1)+j+1,(i+1)*(nu+1)+j) for i in range(nz) for j in range(nu)]
 return mesh(name,vs,fs,material)
def greenhouse_quad(name,corners,material,rows=20,columns=12,offset=0,collect=True):
 # corners follow u/z parameter space: exact shared window/pillar boundaries.
 vs=[]
 for i in range(rows+1):
  t=i/rows
  for j in range(columns+1):
   f=j/columns
   u=(1-t)*((1-f)*corners[0][0]+f*corners[1][0])+t*((1-f)*corners[3][0]+f*corners[2][0])
   z=(1-t)*((1-f)*corners[0][1]+f*corners[1][1])+t*((1-f)*corners[3][1]+f*corners[2][1])
   vs.append(canopy(z,u,offset))
 fs=[(i*(columns+1)+j,i*(columns+1)+j+1,(i+1)*(columns+1)+j+1,(i+1)*(columns+1)+j) for i in range(rows) for j in range(columns)]
 ob=mesh(name,vs,fs,material,collect)
 # The open upper surfaces face outward; runtime may use FrontSide culling.
 bm=bmesh.new();bm.from_mesh(ob.data);bm.normal_update()
 wrong=[face for face in bm.faces if face.normal.z<0]
 if wrong:bmesh.ops.reverse_faces(bm,faces=wrong)
 bm.to_mesh(ob.data);bm.free()
 if material==paint:
  bpy.context.view_layer.objects.active=ob
  solid=ob.modifiers.new('Thin formed window frame','SOLIDIFY');solid.thickness=.014;solid.offset=-1
  bpy.ops.object.modifier_apply(modifier=solid.name)
 return ob

windows=[('Window windscreen',[(-.68,.09),(.68,.09),(.90,.79),(-.90,.79)]),('Window rear',[(-.88,-1.50),(.88,-1.50),(.65,-.79),(-.65,-.79)])]
for side in [-1,1]:windows.append(('Window side '+str(side),[(side*.75,-.75),(side*.75,.035),(side*.985,.73),(side*.985,-1.36)]))
for name,corners in windows:
 greenhouse_quad(name,corners,window_glass,24,14,.003,False)
 pts=[]
 for k in range(4):
  p0,p1=corners[k],corners[(k+1)%4]
  for i in range(16):
   t=i/16;pts.append(canopy(p0[1]*(1-t)+p1[1]*t,p0[0]*(1-t)+p1[0]*t,.004))
 pts.append(pts[0]);tube('Flush window gasket',pts,.006,dark,1)
greenhouse_quad('Continuous formed roof',[(-.71,-.78),(.71,-.78),(.71,.08),(-.71,.08)],paint,24,24)
greenhouse_quad('Front cowl band',[(-1,.79),(1,.79),(1,.93),(-1,.93)],paint,5,20)
greenhouse_quad('Rear deck window band',[(-1,-1.65),(1,-1.65),(1,-1.50),(-1,-1.50)],paint,5,20)
for side in [-1,1]:
 def frame(name,points,rows=16,columns=4):return greenhouse_quad(name,[(side*u,z) for u,z in points],paint,rows,columns)
 frame('Narrow A pillar',[(.68,.09),(.90,.79),(.985,.73),(.75,.035)])
 frame('Tapered C pillar',[(.65,-.79),(.88,-1.50),(.985,-1.36),(.75,-.75)])
 frame('Roof side rail',[(.71,-.78),(.71,.08),(.75,.035),(.75,-.75)])
 frame('Side belt window frame',[(.985,-1.36),(.985,.73),(1,.73),(1,-1.36)])
 frame('Front corner return',[(.90,.79),(.985,.73),(1,.73),(1,.93)],8,4)
 frame('Rear corner return',[(.88,-1.50),(.985,-1.36),(1,-1.36),(1,-1.65)],8,4)
 # Join the window sill to the actual body shoulder instead of leaving a dark floating gap.
 belt=[];segments=40
 for i in range(segments+1):
  z=-1.50+2.29*i/segments;upper=canopy(z,side)
  origin=Vector(v((upper[0]+side*.018,2,z)));hit,co,normal,_=body.ray_cast(origin,Vector(v((0,-1,0))))
  if not hit:raise RuntimeError('Body missing under window sill')
  co+=normal*.0015;lower=(co.x,co.z,-co.y)
  belt.extend([upper,lower])
 landing=mesh('Continuous shoulder to window sill',belt,[(i*2,i*2+1,(i+1)*2+1,(i+1)*2) for i in range(segments)],paint)
 bm=bmesh.new();bm.from_mesh(landing.data);bm.normal_update()
 wrong=[face for face in bm.faces if face.normal.x*side<0]
 if wrong:bmesh.ops.reverse_faces(bm,faces=wrong)
 bm.to_mesh(landing.data);bm.free()
 cube('Mirror stalk',(side*.85,.91,.52),(.18,.035,.045),dark,.01)
 cube('Integrated mirror',(side*1.015,.94,.55),(.23,.095,.2),paint,.04)
 cube('Mirror lens',(side*1.016,.947,.449),(.17,.055,.008),glass,.02)
 cube('Flush handle',(side*.954,.76,-.5),(.012,.026,.18),dark,.008)
 cube('Sill',(side*.92,.285,0),(.12,.085,1.85),dark,.025)
 # arch liner half-ring follows wheel arch, recessed inside body
 for z in [-1.34,1.38]:
  pts=[(side*(.934 if z>0 else .978),.385+.413*math.sin(a),z+.413*math.cos(a)) for a in [math.pi*i/32 for i in range(33)]]
  tube('Arch inner lip',pts,.012,dark)
# Fine panel gaps projected onto the real body surface, not floating trim.
def surface_seam(name,points,axis,side=1):
 result=[]
 for x,y,z in points:
  origin=Vector(v((side*2,y,z) if axis=='side' else (x,2,z)))
  direction=Vector(v((-side,0,0) if axis=='side' else (0,-1,0)))
  hit,co,normal,_=body.ray_cast(origin,direction)
  if hit:
   co+=normal*.007;result.append((co.x,co.z,-co.y))
 if len(result)>1:tube(name,result,.004,grille)
for side in [-1,1]:
 door=[]
 for i in range(12):door.append((0,.76-(.76-.385)*i/11,.73-.13*i/11))
 for i in range(20):door.append((0,.385,.60-1.32*i/19))
 for i in range(12):door.append((0,.385+(.76-.385)*i/11,-.72-.08*i/11))
 surface_seam('Inset door shutline',door,'side',side)
 # Slim belt trim meets the side glass without changing the body outline.
 pts=[canopy(-1.22+1.88*i/26,side*.982,.009) for i in range(27)]
 tube('Window seal',pts,.0035,dark)
hood=[]
for i in range(24):hood.append((-.56+.06*i/23,0,.98+1.04*i/23))
for i in range(18):hood.append((-.50+1.0*i/17,0,2.02))
for i in range(24):hood.append((.50+.06*i/23,0,2.02-1.04*i/23))
surface_seam('Hood shutline',hood,'top')
# Vertical grille vanes are inset behind the bumper lip.
for i in range(19):cube('Front intake vane',(-.39+i*.78/18,.482,2.289),(.008,.123,.008),grille,0)
for side in [-1,1]:
 for i in range(7):cube('Side inlet vane',(side*.66,.412+i*.018,2.258),(.29,.006,.008),grille,0)
for x in [-.57,-.285,0,.285,.57]:
 fin=mesh('Rear diffuser strake',[(x-.008,.251,-2.285),(x+.008,.251,-2.285),(x+.008,.251,-1.95),(x-.008,.251,-1.95),(x-.008,.388,-2.285),(x+.008,.388,-2.285),(x+.008,.30,-1.95),(x-.008,.30,-1.95)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],dark)
for side in [-1,1]:
 cube('Recessed rear vent',(side*.56,.594,-2.295),(.51,.080,.012),dark,.008)
 for i in range(12):cube('Rear extraction grille',(side*(.335+i*.45/11),.594,-2.305),(.007,.060,.007),grille,0)
# curved inset tail, lightbar and integrated ducktail
for name,y,r,ma in [('Inset tail surround',.68,.052,dark),('Continuous red LED',.735,.013,red),('Integrated ducktail',.804,.017,paint)]:
 tube(name,[(x,y,(-2.335 if ma==red else -2.255)+.13*(abs(x)/.86)**3) for x in [ -.86+i*1.72/40 for i in range(41)]],r,ma)
diffuser=cube('Rear diffuser',(0,.35,-2.17),(1.68,.19,.23),dark,.07)
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
# Original VZ branding stays within the existing body envelope. Project every
# badge vertex onto the actual finished surface so the applique never floats.
# Manufactured lamp assemblies and surface-fitted hardware reuse the existing batches.
# Cache the uncut skin for conforming details before opening shallow pockets.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update()
skin=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
# Preserve the smooth manufactured shell before topology-changing Boolean pockets.
from mathutils.geometry import barycentric_transform
body.data.calc_loop_triangles()
skin_vertices=[vertex.co.copy() for vertex in body.data.vertices]
skin_triangles=[tuple(triangle.vertices) for triangle in body.data.loop_triangles]
skin_corner_normals=[tuple(body.data.corner_normals[index].vector.copy() for index in triangle.loops) for triangle in body.data.loop_triangles]
skin_normals_bvh=BVHTree.FromPolygons(skin_vertices,skin_triangles,all_triangles=True)

def shell_normal(point):
 nearest,_,triangle_index,distance=skin_normals_bvh.find_nearest(point)
 if triangle_index is None:return None,100
 a,b,c=[skin_vertices[index] for index in skin_triangles[triangle_index]]
 na,nb,nc=skin_corner_normals[triangle_index]
 normal=barycentric_transform(nearest,a,b,c,na,nb,nc)
 return normal.normalized(),distance

def restore_shell_normals():
 # New cavity walls must never inherit exterior normals, even at their shared boundary.
 # Qualify whole faces by distance to the uncut shell, then interpolate each loop separately.
 source=[shell_normal(vertex.co) for vertex in body.data.vertices]
 normals=[entry.vector.copy() for entry in body.data.corner_normals]
 restored=0
 for polygon in body.data.polygons:
  outer=all(source[index][0] is not None and source[index][1]<.00002 for index in polygon.vertices)
  if not outer:continue
  average=sum((source[index][0] for index in polygon.vertices),Vector()).normalized()
  if polygon.normal.dot(average)<.5:continue
  for loop_index in polygon.loop_indices:
   normals[loop_index]=source[body.data.loops[loop_index].vertex_index][0];restored+=1
 body.data.normals_split_custom_set(normals)
 print('RESTORED_OUTER_SHELL_LOOP_NORMALS',restored)

detail_start=len(static)
def skin_point(point,axis='side',side=1,offset=0):
 x,y,z=point
 origin=Vector(v((side*2,y,z) if axis=='side' else (x,2,z)))
 direction=Vector(v((-side,0,0) if axis=='side' else (0,-1,0)))
 co,normal,_,_=skin.ray_cast(origin,direction)
 if co is None:raise RuntimeError('Hardware misses body skin: '+str(point))
 co+=normal*offset
 return (co.x,co.z,-co.y)

def cut_pocket(target,cutter,label):
 bpy.context.view_layer.objects.active=target
 mod=target.modifiers.new(label,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name)

def axis_ring(name,center,profile,material,segments=24):
 # Open turned section along game Z, with outward/inward wall normals from its closed profile.
 x,y,z=center;vs=[]
 for dz,r in profile:
  for i in range(segments):
   a=math.tau*i/segments;vs.append((x+r*math.cos(a),y+r*math.sin(a),z+dz))
 fs=[(row*segments+i,row*segments+(i+1)%segments,((row+1)%len(profile))*segments+(i+1)%segments,((row+1)%len(profile))*segments+i) for row in range(len(profile)) for i in range(segments)]
 return mesh(name,vs,fs,material)

def optical_disc(name,center,radius,depth,material,segments=20):
 bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=radius,depth=depth,location=v(center),rotation=(math.pi/2,0,0))
 ob=bpy.context.object;ob.name=name;ob.data.materials.append(material)
 for polygon in ob.data.polygons:polygon.use_smooth=len(polygon.vertices)==4
 static.append(ob);return ob

# Open the original hidden intakes through the nose while retaining plate and splitter positions.
for x,width in [(0,.89),(-.66,.385),(.66,.385)]:
 cutter=cube('Temporary inlet pocket',(x,.485 if x==0 else .47,2.260),(width,.184 if x==0 else .168,.23),dark,.027,False)
 cut_pocket(body,cutter,'Visible recessed front inlet');bpy.data.objects.remove(cutter,do_unlink=True)
for ob in list(static):
 if ob.name=='Front intake' or ob.name.startswith('Front intake.') or ob.name=='Headlight housing' or ob.name.startswith('Headlight housing.'):
  static.remove(ob);bpy.data.objects.remove(ob,do_unlink=True)
for side in [-1,1]:
 # Open tapered four-wall throat, with a separate dark backing well behind the vanes.
 vs=[]
 for depth,halfwidth,halfheight in [(2.217,.180,.073),(2.153,.140,.048)]:
  for cx,cy,angle0 in [(halfwidth-.020,halfheight-.020,0),(-halfwidth+.020,halfheight-.020,90),(-halfwidth+.020,-halfheight+.020,180),(halfwidth-.020,-halfheight+.020,270)]:
   for k in range(5):
    a=math.radians(angle0+90*k/4);vs.append((side*.66+cx+.020*math.cos(a),.47+cy+.020*math.sin(a),depth))
 n=20;fs=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(range(n,2*n))]
 throat=mesh('Recessed side intake throat',vs,fs,dark)
 bm=bmesh.new();bm.from_mesh(throat.data);bmesh.ops.reverse_faces(bm,faces=bm.faces);bm.to_mesh(throat.data);bm.free()
 # Open cup winding faces incoming view rather than being treated as an outward solid.
 for polygon in throat.data.polygons:polygon.use_smooth=False
# Center vanes sit ahead of their dark backing and behind the original plate.
for ob in static:
 if ob.name.startswith('Front intake vane'):ob.location.y-=.010
 if ob.name.startswith('Side inlet vane'):ob.location.y+=.037

# Existing DRL signature remains above two recessed projectors, not an extra luminous bar.
for side in [-1,1]:
 cutter=cube('Temporary lamp pocket',(side*.66,.671,2.225),(.438,.096,.24),dark,.018,False)
 cut_pocket(body,cutter,'Recessed optical chamber');bpy.data.objects.remove(cutter,do_unlink=True)
 # Recessed graphite carrier is visible through the nose opening; the old outer housing stays.
 cube('Headlamp inner carrier',(side*.66,.667,2.192),(.409,.076,.028),dark,.017)
 for x in [.553,.714]:
  z=2.238-(x-.48)*.111
  axis_ring('Projector machined bezel',(side*x,.656,z),[(-.026,.0275),(-.005,.0305),(.001,.0275),(.001,.023),(-.020,.020)],metal,20)
  optical_disc('Projector dark optic',(side*x,.656,z-.003),.023,.004,glass)
  optical_disc('Projector luminous core',(side*x,.656,z+.0002),.0165,.003,white)
 # One restrained metallic separator accent emphasizes the dark cavity depth.
 cube('Headlamp separator',(side*.636,.656,2.205),(.007,.046,.025),metal,.002)

# Preserve the uninterrupted upper light signature and add distinct lower optical chambers.
for side in [-1,1]:
 for i in range(6):
  x=side*(.354+i*.078);z=-2.315+.13*(abs(x)/.86)**3
  core=cube('Segmented tail optic',(x,.679,z),(.057,.031,.010),red,.006)
  core.rotation_euler.z=side*.13
  # Top/bottom thin reflectors stay within the original surround silhouette.
  for y in [.656,.702]:
   cube('Tail chamber reflector',(x,y,z+.005),(.057,.0035,.006),metal,0)

# Remove the old flat handle and black exhaust end-cap, now replaced by actual recesses.
for ob in list(static):
 if ob.name.startswith('Flush handle') or ob.name.startswith('Exhaust depth'):
  static.remove(ob);bpy.data.objects.remove(ob,do_unlink=True)
for side in [-1,1]:
 p=skin_point((0,.748,-.49),'side',side)
 cutter=cube('Temporary handle pocket',p,(.060,.053,.222),dark,.012,False)
 cut_pocket(body,cutter,'Door handle finger recess');bpy.data.objects.remove(cutter,do_unlink=True)
 cube('Handle inset well',(p[0]-side*.020,p[1],p[2]),(.013,.049,.209),dark,.010)
 cube('Flush painted handle',(p[0]-side*.003,p[1]+.006,p[2]),(.011,.020,.169),paint,.006)
 cube('Handle lower metal edge',(p[0]+side*.001,p[1]-.005,p[2]),(.003,.003,.140),metal,.001)
 # Real exhaust bore passes through the existing diffuser and shell. The rolled outer tip stays.
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.055,depth=.245,location=v((side*.64,.355,-2.215)),rotation=(math.pi/2,0,0))
 cutter=bpy.context.object
 cut_pocket(body,cutter,'Exhaust bore');cut_pocket(diffuser,cutter,'Diffuser exhaust opening');bpy.data.objects.remove(cutter,do_unlink=True)
 axis_ring('Exhaust inner turned sleeve',(side*.64,.355,-2.305),[(0,.055),(.100,.051),(.100,.047),(0,.050)],metal)
 axis_ring('Exhaust soot cavity',(side*.64,.355,-2.305),[(.032,.049),(.142,.045),(.142,.043),(.032,.047)],dark)
 optical_disc('Exhaust recessed darkness',(side*.64,.355,-2.159),.044,.005,dark,24)

# Rear deck lid and right fuel flap conform to the finished body; no floating rectangles.
deck=[]
for i in range(18):deck.append((-.59+.03*i/17,0,-1.68-.46*i/17))
for i in range(24):deck.append((-.56+1.12*i/23,0,-2.14))
for i in range(18):deck.append((.56+.03*i/17,0,-2.14+.46*i/17))
surface_seam('Rear deck shutline',deck,'top')
fuel=[(0,.835+.050*math.sin(math.tau*i/32),-1.01+.062*math.cos(math.tau*i/32)) for i in range(33)]
surface_seam('Fuel flap inset outline',fuel,'side',1)
# Individual annotations remain in the editable scene as custom properties after batch merging.
for ob in static[detail_start:]:ob['detail_generation']='lamp chambers, inset hardware, hollow exhaust v2'
# Integrate rear lamps, grilles and exhaust into the actual curved tail surface.
def rear_anchor(x,y,offset=0):
 co,normal,_,_=skin.ray_cast(Vector(v((x,y,-3))),Vector(v((0,0,1))))
 if co is None:raise RuntimeError('Rear trim misses shell: '+str((x,y)))
 co+=normal*offset
 return (co.x,co.z,-co.y),normal

def rear_panel(name,y0,y1,width,rows,columns):
 vs=[]
 for i in range(rows+1):
  t=i/rows;y=y0+(y1-y0)*t;halfwidth=width-.022*abs(t*2-1)**4
  for j in range(columns+1):vs.append(rear_anchor((j/columns*2-1)*halfwidth,y,.0025)[0])
 fs=[(i*(columns+1)+j,i*(columns+1)+j+1,(i+1)*(columns+1)+j+1,(i+1)*(columns+1)+j) for i in range(rows) for j in range(columns)]
 ob=mesh(name,vs,fs,dark)
 bm=bmesh.new();bm.from_mesh(ob.data);bm.normal_update();wrong=[face for face in bm.faces if face.normal.y<0]
 if wrong:bmesh.ops.reverse_faces(bm,faces=wrong)
 bm.to_mesh(ob.data);bm.free();return ob
rear_panel('Continuous curved rear lamp and vent panel',.546,.720,.855,10,52)
for ob in list(static):
 if ob.name.startswith('Recessed rear vent') or ob.name.startswith('Rear extraction grille'):
  static.remove(ob);bpy.data.objects.remove(ob,do_unlink=True)
for side in [-1,1]:
 for i in range(12):
  x=side*(.335+i*.45/11)
  points=[rear_anchor(px,py,.0045)[0] for px,py in [(x-.0035,.564),(x+.0035,.564),(x+.0035,.624),(x-.0035,.624)]]
  vane=mesh('Flush tail extraction vane',points,[(0,1,2,3)],grille)
  bm=bmesh.new();bm.from_mesh(vane.data);bm.normal_update()
  bm.faces.ensure_lookup_table()
  if bm.faces[0].normal.y<0:bmesh.ops.reverse_faces(bm,faces=bm.faces)
  bm.to_mesh(vane.data);bm.free()
for ob in static:
 if ob.name.startswith('Segmented tail optic') or ob.name.startswith('Tail chamber reflector'):
  x,y=ob.location.x,ob.location.z;p,normal=rear_anchor(x,y,.007)
  ob.location=v(p);ob.rotation_euler.z=math.atan2(-normal.x,normal.y)
 if ob.name.startswith('Exhaust inner turned sleeve'):
  ob.data.materials.clear();ob.data.materials.append(dark)
 if ob.name.startswith('Full round exhaust'):
  # Slimmer rolled outer metal, with the inner bore kept dark.
  for vertex in ob.data.vertices:
   vertex.co.x*=.92;vertex.co.y*=.92;vertex.co.z*=.70
  x,y=ob.location.x,ob.location.z;p,_=rear_anchor(x,y,.0015);ob.location=v(p)
lower_tail=rear_panel('Curved diffuser surround',.305,.452,.79,10,48)
bpy.context.view_layer.objects.active=lower_tail
solid=lower_tail.modifiers.new('Diffuser skin thickness','SOLIDIFY');solid.thickness=.008;solid.offset=-1
bpy.ops.object.modifier_apply(modifier=solid.name)
for side in [-1,1]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.059,depth=.4,location=v((side*.64,.355,-2.22)),rotation=(math.pi/2,0,0))
 cutter=bpy.context.object;cut_pocket(lower_tail,cutter,'Recessed exhaust aperture');bpy.data.objects.remove(cutter,do_unlink=True)

print('CAR_DETAIL_LAYER_ADDED')

branding_start=len(static)
# The nose skin closes ahead of the old cosmetic grille. A shallow license
# pocket exposes the front plate without pushing it beyond the original nose.
bpy.ops.mesh.primitive_cube_add(size=1,location=v((0,.485,2.310)))
license_cutter=bpy.context.object;license_cutter.dimensions=(.481,.072,.120)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bevel=license_cutter.modifiers.new('Plate pocket corner','BEVEL');bevel.width=.007;bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name)
bpy.context.view_layer.objects.active=body
cut=body.modifiers.new('Recessed front license pocket','BOOLEAN');cut.operation='DIFFERENCE';cut.object=license_cutter;bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(license_cutter,do_unlink=True)
bpy.context.view_layer.update()
branding_surfaces=list(static)
def badge_anchor(kind,point,offset):
 x,y,z=point
 origin=Vector(v((x,2,z) if kind=='hood' else (x,y,-3)))
 direction=Vector(v((0,-1,0) if kind=='hood' else (0,0,1)))
 best=None;distance=100
 for ob in branding_surfaces:
  inverse=ob.matrix_world.inverted()
  hit,co,normal,_=ob.ray_cast(inverse@origin,(inverse.to_3x3()@direction).normalized())
  if hit:
   world=ob.matrix_world@co;d=(world-origin).length
   if d<distance:
    distance=d;normal=(ob.matrix_world.to_3x3().inverted().transposed()@normal).normalized();best=world+normal*offset
 if best is None:raise RuntimeError('No vehicle surface under '+kind+' badge')
 return (best.x,best.z,-best.y)
def badge_patch(name,points,faces,kind,offset,material):
 verts=[];polys=[];steps=4
 for face in faces:
  for corner in range(1,len(face)-1):
   tri=[points[face[0]],points[face[corner]],points[face[corner+1]]];grid={}
   for i in range(steps+1):
    for j in range(steps+1-i):
     a=i/steps;b=j/steps;point=tuple(tri[0][k]*(1-a-b)+tri[1][k]*a+tri[2][k]*b for k in range(3))
     grid[i,j]=len(verts);verts.append(badge_anchor(kind,point,offset))
   for i in range(steps):
    for j in range(steps-i):
     polys.append((grid[i,j],grid[i+1,j],grid[i,j+1]))
     if i+j<steps-1:polys.append((grid[i+1,j],grid[i+1,j+1],grid[i,j+1]))
 ob=mesh(name,verts,polys,material)
 # Explicit outward winding also works when the runtime uses FrontSide culling.
 bm=bmesh.new();bm.from_mesh(ob.data);bm.normal_update();outward=Vector(v((0,1,0) if kind=='hood' else (0,0,-1)))
 inward=[face for face in bm.faces if face.normal.dot(outward)<0]
 if inward:bmesh.ops.reverse_faces(bm,faces=inward)
 bm.normal_update();bm.to_mesh(ob.data);bm.free();ob.data.update()
 return ob
def badge(kind,outline,letter):
 if kind=='hood':
  outline=[(x,y,z-.105) for x,y,z in outline];letter=[(x,y,z-.105) for x,y,z in letter]
 center=tuple(sum(p[i] for p in outline)/len(outline) for i in range(3))
 inner=[tuple(center[i]+(p[i]-center[i])*.79 for i in range(3)) for p in outline];n=len(outline)
 badge_patch('Badge '+kind+' inset',outline,[tuple(range(n))],kind,.0018,dark)
 badge_patch('Badge '+kind+' metal shield rim',outline+inner,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],kind,.0034,metal)
 badge_patch('Badge '+kind+' V monogram',letter,[(0,1,4,5),(1,2,3,4)],kind,.0039,metal)
badge('hood',[(-.061,0,1.975),(.061,0,1.975),(.053,0,2.047),(0,0,2.083),(-.053,0,2.047)],
 [(-.031,0,1.999),(0,0,2.057),(.032,0,1.999),(.021,0,1.999),(0,0,2.035),(-.020,0,1.999)])
badge('rear',[(-.058,.705,0),(.058,.705,0),(.050,.667,0),(0,.638,0),(-.050,.667,0)],
 [(-.030,.692,0),(0,.653,0),(.032,.692,0),(.021,.692,0),(0,.669,0),(-.019,.692,0)])

def tint_plate(ob,color):
 attribute=ob.data.color_attributes.new(name='PlateTint',type='FLOAT_COLOR',domain='CORNER')
 for entry in attribute.data:entry.color=(*color,1)
 ob.data.color_attributes.active_color=attribute
 return ob
for sign,y,z in [(1,.485,2.307),(-1,.525,-2.303)]:
 if sign>0:cube('Front license mounting recess',(0,y,2.294),(.478,.117,.014),dark,.007)
 tint_plate(cube('Reflective VZ plate',(0,y,z),(.450,.097,.003),plate,.003),(.76,.79,.73))
 # The band is viewer-left on both faces; its blue tint shares the plate material.
 tint_plate(cube('Fictional navy plate band',(-sign*.208,y,z+sign*.0020),(.028,.091,.0008),plate,0),(.014,.038,.095))
 bpy.ops.object.select_all(action='DESELECT')
 font=bpy.data.curves.new('VZ-0606 lettering','FONT');font.body='VZ-0606';font.align_x='CENTER';font.align_y='CENTER';font.size=.078;font.space_character=1.03;font.resolution_u=2;font.extrude=.00024
 text=bpy.data.objects.new('Plate lettering VZ-0606',font);bpy.context.collection.objects.link(text);text.data.materials.append(dark)
 text.location=v((sign*.014,y,z+sign*.0027));text.rotation_euler=(math.pi/2,0,0 if sign>0 else math.pi)
 bpy.context.view_layer.update()
 factor=min(1,.347/max(text.dimensions.x,.001),.066/max(text.dimensions.z,.001));text.scale=(factor,)*3
 bpy.context.view_layer.objects.active=text;text.select_set(True);bpy.ops.object.convert(target='MESH');text=bpy.context.object;text.select_set(False);static.append(text)
 for x in [-.188,.188]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.0030,depth=.0007,location=v((x,y+.037,z+sign*.0023)),rotation=(math.pi/2,0,0))
  screw=bpy.context.object;screw.name='Plate fixing';screw.data.materials.append(metal);static.append(screw)
branding_triangles=0
for ob in static[branding_start:]:ob.data.calc_loop_triangles();branding_triangles+=len(ob.data.loop_triangles)
print('BRANDING_ADDED_TRIANGLES',branding_triangles)
# Wheel assemblies each pivot contains a single mesh with material slots.
for side in [-1,1]:
 for z,label in [(-1.34,'R'),(1.38,'F')]:
  center=(side*.965,.385,z);parts=[]
  def cyl(name,r,depth,ma,off=0,segments=32,edge=.025):
   bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=depth,location=v((center[0]+off,center[1],center[2])),rotation=(0,math.pi/2,0))
   ob=bpy.context.object;ob.name=name;ob.data.materials.append(ma)
   bevel=ob.modifiers.new('Rounded edge','BEVEL');bevel.width=edge;bevel.segments=2 if segments<16 else 3;bpy.ops.object.modifier_apply(modifier=bevel.name)
   for p in ob.data.polygons:p.use_smooth=True
   parts.append(ob);return ob
  def ring(name,profile,ma,segments=40):
   vs=[]
   for off,radius in profile:
    for i in range(segments):
     a=i*math.tau/segments;vs.append((center[0]+side*off,center[1]+radius*math.sin(a),center[2]+radius*math.cos(a)))
   fs=[]
   for row in range(len(profile)):
    for i in range(segments):fs.append((row*segments+i,row*segments+(i+1)%segments,((row+1)%len(profile))*segments+(i+1)%segments,((row+1)%len(profile))*segments+i))
   ob=mesh(name,vs,fs,ma,False);parts.append(ob);return ob
  ring('Open performance tire',[(-.137,.289),(-.137,.339),(-.119,.362),(-.08,.375),(.08,.375),(.119,.362),(.137,.339),(.137,.289)],rubber)
  ring('Hollow rim barrel',[(-.139,.286),(.139,.286),(.139,.264),(-.139,.264)],dark)
  for radius in [.309,.341]:ring('Embossed sidewall bead',[(.137+math.cos(a)*.0017,radius+math.sin(a)*.002) for a in [i*math.tau/4 for i in range(4)]],rubber,32)
  # Recessed circumferential tread grooves remain inside the original tire radius.
  for off in [-.045,.045]:ring('Tread groove',[(off-.002,.375),(off+.002,.375),(off+.002,.372),(off-.002,.372)],dark,32)
  # Calipers stay fixed to the body; they must not spin with the wheel mesh.
  fixed_caliper=cube('Fixed brake caliper',(center[0]+side*.108,center[1]+.03,center[2]-.17),(.033,.19,.105),caliper,.022)

  cyl('Brake disc',.225,.02,metal,side*.115)
  cyl('Hub',.07,.025,metal,side*.157)
  # Five recessed wheel bolts and twelve disc perforations share existing materials.
  for i in range(5):
   a=i*math.tau/5
   ob=cyl('Lug bolt',.012,.012,dark,side*.165,10,.002)
   ob.location.z+=math.sin(a)*.044;ob.location.y-=math.cos(a)*.044
  for i in range(12):
   a=i*math.tau/12
   bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.009,depth=.0015,location=v((center[0]+side*.127,center[1]+math.sin(a)*.184,center[2]+math.cos(a)*.184)),rotation=(0,math.pi/2,0))
   ob=bpy.context.object;ob.name='Brake disc perforation';ob.data.materials.append(dark);parts.append(ob)

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
  visual_inset=.16 if label=='F' else .12
  for vertex in wheel.data.vertices:vertex.co.x-=side*visual_inset
  fixed_caliper.location.x-=side*visual_inset
# Classify individual triangles: a clipped n-gon can span both rim and cavity.
bpy.context.view_layer.objects.active=body
tri=body.modifiers.new('Unambiguous cavity triangles','TRIANGULATE');tri.quad_method='BEAUTY';tri.ngon_method='BEAUTY'
bpy.ops.object.modifier_apply(modifier=tri.name)
# Restore exterior shading, then split only new front cavity faces into the existing dark batch.
body.data.set_sharp_from_angle(angle=.65)
restore_shell_normals()
body.data.materials.clear();body.data.materials.append(paint);body.data.materials.append(dark)
source_distance=[shell_normal(vertex.co)[1] for vertex in body.data.vertices]
lining_faces=[]
for polygon in body.data.polygons:
 # Game forward Z is negative Blender Y. Original outer skin remains Paint, including its rim.
 front=all(-body.data.vertices[index].co.y>2.099 for index in polygon.vertices)
 inset=any(source_distance[index]>.00002 for index in polygon.vertices)
 center_normal,center_distance=shell_normal(polygon.center)
 follows_skin=center_normal is not None and polygon.normal.dot(center_normal)>.60 and center_distance<.006
 center=polygon.center
 in_cabin=abs(center.x)<.706 and -1.181<-center.y<.781 and .244<center.z<.96
 cabin_distance=closed_cabin_skin.find_nearest(center)[3] if in_cabin else 0
 cabin_lining=in_cabin and cabin_distance is not None and cabin_distance>.003
 polygon.material_index=1 if (front and inset and not follows_skin) or cabin_lining else 0
 if polygon.material_index==1:lining_faces.append(polygon.index)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='DESELECT');bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.tool_settings.mesh_select_mode=(False,False,True)
for polygon in body.data.polygons:polygon.select=polygon.index in lining_faces
before_objects=set(bpy.context.scene.objects)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
for liner in set(bpy.context.scene.objects)-before_objects:
 liner.name='Front cavity graphite lining'
 for polygon in liner.data.polygons:polygon.material_index=0
 liner.data.materials.clear();liner.data.materials.append(dark);static.append(liner)
for polygon in body.data.polygons:polygon.material_index=0
body.data.materials.clear();body.data.materials.append(paint)
print('FRONT_CAVITY_GRAPHITE_FACES',len(lining_faces))
# Merge static meshes per material, limiting draw calls.
groups=[[o for o in static if o.data.materials[0]==ma] for ma in [paint,glass,dark,metal,red,white,grille,caliper,plate]]
for ma,objs in zip([paint,glass,dark,metal,red,white,grille,caliper,plate],groups):

 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 if objs:
  bpy.context.view_layer.objects.active=objs[0]
  if len(objs)>1:bpy.ops.object.join()
  bpy.context.object.name=ma.name
bpy.ops.object.select_all(action='SELECT')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('art/solstice-gt.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'solstice-gt.glb'),export_format='GLB',export_yup=True,export_apply=True)
triangles=0
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
print('CAR_MODEL_EXPORTED_TRIANGLES',triangles)
coords=[ob.matrix_world@Vector(c) for ob in bpy.context.scene.objects if ob.type=='MESH' for c in ob.bound_box]
game_coords=[(p.x,p.z,-p.y) for p in coords]
print('CAR_MODEL_BOUNDS_GAME',tuple(min(p[i] for p in game_coords) for i in range(3)),tuple(max(p[i] for p in game_coords) for i in range(3)))
# Optional studio preview is kept outside game assets and out of the saved model.
if '--preview' in __import__('sys').argv:
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
 scene.render.resolution_x=960;scene.render.resolution_y=640;scene.render.resolution_percentage=100
 scene.world.color=(.15,.15,.15)
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));floor=bpy.context.object;floor.data.materials.append(mat('Preview floor',(.075,.085,.095),.1,.42))
 for loc,power,size in [((4,5,-3),1000,5),((-4,3,2),850,4),((0,5,4),700,3)]:
  bpy.ops.object.light_add(type='AREA',location=v(loc));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector(v((0,.6,0)))-light.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=v((4.8,2.8,-6.2)));camera=bpy.context.object;camera.rotation_euler=(Vector(v((0,.64,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=52;scene.camera=camera
 scene.render.filepath=os.path.join(os.environ.get('TEMP','/tmp'),'solstice-gt-detail-preview.png');bpy.ops.render.render(write_still=True)
 print('CAR_PREVIEW',scene.render.filepath)




