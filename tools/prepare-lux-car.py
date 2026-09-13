"""Process the actual Aholo Lux3D vehicle; the procedural GT is only a plate donor.

The processing entrypoint below is completed against the inspected source geometry.
No source or fallback files are overwritten.
"""
import bpy, bmesh, math, json, sys, os
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]


def game_point(p):
    return Vector((p[0],-p[2],p[1]))


def make_material(name,color,metal=0,rough=.4,emission=0):
    material=bpy.data.materials.new(name)
    material.diffuse_color=(*color,1)
    material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metal
    bsdf.inputs['Roughness'].default_value=rough
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*color,1)
        bsdf.inputs['Emission Strength'].default_value=emission
    return material


def append_physical_plates():
    """Copy only the existing physical stocks, tinted bands, lettering and screws.

    Mesh copies preserve the CORNER PlateTint layer (GLTF COLOR_0). Everything
    outside the two license-plate rectangles is rejected before joining.
    """
    with bpy.data.libraries.load(str(ROOT/'art/solstice-gt.blend'),link=False) as (source,target):
        target.objects=[name for name in source.objects if name in {'Plate','Graphite','Alloy'}]
    donors=[]
    for donor in target.objects:
        if donor:
            bpy.context.collection.objects.link(donor);donors.append(donor)
    bpy.context.view_layer.update()
    result={1:[],-1:[]}
    for sign in [1,-1]:
        center=game_point((0,.485 if sign>0 else .525,2.307 if sign>0 else -2.303))
        for donor in donors:
            copied=donor.copy();copied.data=donor.data.copy();bpy.context.collection.objects.link(copied)
            bm=bmesh.new();bm.from_mesh(copied.data)
            reject=[]
            for face in bm.faces:
                co=donor.matrix_world@face.calc_center_median()
                x,y,z=co.x,co.z,-co.y
                keep=abs(x)<.241 and abs(y-(.485 if sign>0 else .525))<.057 and (z>2.300 if sign>0 else z<-2.299)
                if not keep:reject.append(face)
            bmesh.ops.delete(bm,geom=reject,context='FACES')
            bmesh.ops.delete(bm,geom=[vertex for vertex in bm.verts if not vertex.link_faces],context='VERTS')
            if not bm.faces:
                bm.free();bpy.data.objects.remove(copied,do_unlink=True);continue
            for vertex in bm.verts:vertex.co=donor.matrix_world@vertex.co-center
            bm.to_mesh(copied.data);bm.free();copied.matrix_world=Matrix.Identity(4)
            copied.name=('Front' if sign>0 else 'Rear')+' physical VZ-0606 plate '+donor.name.split('.')[0]
            result[sign].append(copied)
    for donor in donors:bpy.data.objects.remove(donor,do_unlink=True)
    return result

def main():
    import numpy as np
    from collections import Counter
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'art/lux3d/car-plated-source.glb'))
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.polygons));body.name='Lux continuous body'
    source_material=body.data.materials[0].copy();source_material.name='Wheel surface';source_material['preserveColor']=True
    scale=.96875;minimum=min((body.matrix_world@v.co).z for v in body.data.vertices)
    matrix=Matrix.Translation((0,0,-minimum*scale))@Matrix.Scale(scale,4)@Matrix.Rotation(math.pi/2,4,'Z')@body.matrix_world
    for vertex in body.data.vertices:vertex.co=matrix@vertex.co
    body.matrix_world=Matrix.Identity(4)
    bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.00001)
    visited=set();components=[]
    for vertex in bm.verts:
        if vertex in visited:continue
        stack=[vertex];visited.add(vertex);component=[]
        while stack:
            current=stack.pop();component.append(current)
            for edge in current.link_edges:
                other=edge.other_vert(current)
                if other not in visited:visited.add(other);stack.append(other)
        components.append(component)
    main_component=max(components,key=len)
    bmesh.ops.delete(bm,geom=[v for component in components if component is not main_component for v in component],context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
    body.data.normals_split_custom_set([(0,0,0)]*len(body.data.loops))
    paint=make_material('Paint',(.62,.19,.055),.62,.29)
    paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=1
    dark=make_material('Graphite',(.018,.025,.029),.1,.42)
    lining=make_material('Cabin lining',(.012,.018,.022),0,.7)
    window=make_material('Window glass',(.30,.38,.41),0,.09)
    window.diffuse_color=(.30,.38,.41,.30);window.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.30;window.use_backface_culling=False
    headlight=make_material('Headlight',(.70,.82,.90),.1,.18,1.6);tail=make_material('Tail',(.44,.005,.002),.1,.22,1.2)
    body.data.materials.clear();body.data.materials.append(paint);body.data.materials.append(lining)
    for face in body.data.polygons:face.material_index=0;face.use_smooth=True
    # Fair the source before exact cuts. Boundary vertices from later cuts therefore
    # never drift and every intersected original triangle gets real new edge vertices.
    bm=bmesh.new();bm.from_mesh(body.data)
    interior=[v for v in bm.verts if not v.is_boundary and all(e.calc_face_angle(0)<.7 for e in v.link_edges)]
    original={v:v.co.copy() for v in interior}
    for _ in range(18):bmesh.ops.smooth_vert(bm,verts=interior,factor=.35,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    for v,co in original.items():
        delta=v.co-co
        if delta.length>.010:v.co=co+delta.normalized()*.010
    bm.normal_update();bm.to_mesh(body.data);bm.free()
    def mesh_object(name,vertices,faces,material,outward=None):
        data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update();data.materials.append(material)
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        # Open optical/detail surfaces have an explicit outward direction. Closed
        # solids still use the usual manifold orientation calculation.
        if outward is not None:
            direction=game_point(outward)
            if sum(face.normal.dot(direction)*face.calc_area() for face in bm.faces)<0:
                bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
        bm.to_mesh(data);bm.free()
        return obj
    def box(name,center,size,material=lining):
        bpy.ops.mesh.primitive_cube_add(size=1,location=game_point(center));obj=bpy.context.object;obj.name=name;obj.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(material);return obj
    def boolean(target,cutter,operation='DIFFERENCE'):
        bpy.context.view_layer.objects.active=target
        modifier=target.modifiers.new('Exact continuous cut','BOOLEAN');modifier.operation=operation;modifier.solver='EXACT';modifier.object=cutter
        if operation=='UNION':modifier.use_self=True;modifier.use_hole_tolerant=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    def remove(obj):bpy.data.objects.remove(obj,do_unlink=True)
    # Exact cylinder partitions replace centroid wheel deletion.
    for side in [-1,1]:
        for end,z,raw_y,radius in [('F',1.433,-.3149,.403),('R',-1.382,-.3219,.4002)]:
            name='Wheel_'+end+('L' if side>0 else 'R');center=(side*.90*scale,(raw_y-minimum)*scale,z*scale);radius*=scale
            bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=radius+.014,depth=.60,location=game_point(center),rotation=(0,math.pi/2,0))
            cutter=bpy.context.object;cutter.data.materials.append(lining)
            wheel=body.copy();wheel.data=body.data.copy();bpy.context.collection.objects.link(wheel);wheel.name=name+' generated mesh'
            boolean(wheel,cutter,'INTERSECT');boolean(body,cutter)
            wheel.data.materials.clear();wheel.data.materials.append(source_material)
            for face in wheel.data.polygons:face.material_index=0
            anchor=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(anchor);anchor.location=game_point(center);anchor['tireRadius']=radius;anchor['tireWidth']=.2325
            for vertex in wheel.data.vertices:vertex.co-=anchor.location
            wheel.parent=anchor;remove(cutter)
    # The AI shell has self-intersecting and overlapping internal skins. A small
    # voxel reconstruction produces a single valid solid before window booleans.
    bpy.context.view_layer.objects.active=body
    body.data.remesh_voxel_size=.012
    bpy.ops.object.voxel_remesh()
    fair=body.modifiers.new('Fair remeshed Lux surface','SMOOTH');fair.factor=.8;fair.iterations=7
    bpy.ops.object.modifier_apply(modifier=fair.name)
    body.data.calc_loop_triangles();count=len(body.data.loop_triangles)
    if count>65000:
        reduction=body.modifiers.new('Lux body surface budget','DECIMATE');reduction.ratio=65000/count
        bpy.ops.object.modifier_apply(modifier=reduction.name)
    body.data.materials.clear();body.data.materials.append(paint);body.data.materials.append(lining)
    for face in body.data.polygons:face.material_index=0;face.use_smooth=True
    # Remove the whole defective generated upper cabin at one continuous beltline.
    old_canopy=box('Replace complete generated upper cabin',(0,1.40,-.63),(2.5,.96,2.94),paint)
    boolean(body,old_canopy);remove(old_canopy)
    # Open a real passenger well below that beltline.
    cabin=box('Passenger cavity',(0,.62,-.35),(1.39,.75,2.0));boolean(body,cabin);remove(cabin)
    hood_cut=box('Continuous low bonnet partition',(0,.99,1.43),(1.36,.46,1.22))
    hood=body.copy();hood.data=body.data.copy();bpy.context.collection.objects.link(hood);hood.name='Driver_hood';hood['driverHood']=True
    boolean(hood,hood_cut,'INTERSECT');boolean(body,hood_cut);remove(hood_cut)

    # One coherent parameterized upper cabin replaces the entire generated canopy.
    # Every adjacent section shares the same four boundary curves/vertices.
    # Front and rear section tuples: centerline z, edge y, half-width.
    front=(.80,.92,.83);roof_front=(.035,1.335,.68)
    roof_rear=(-.78,1.335,.67);rear=(-1.70,.92,.84)
    slope_y={front:-.55,roof_front:-.12,roof_rear:.12,rear:.60}
    slope_w={front:.20,roof_front:.025,roof_rear:-.025,rear:-.18}
    def section(start,end,t):
        h00=2*t*t*t-3*t*t+1;h10=t*t*t-2*t*t+t;h01=-2*t*t*t+3*t*t;h11=t*t*t-t*t;dz=end[0]-start[0]
        y=h00*start[1]+h10*dz*slope_y[start]+h01*end[1]+h11*dz*slope_y[end]
        width=h00*start[2]+h10*dz*slope_w[start]+h01*end[2]+h11*dz*slope_w[end]
        return (start[0]+dz*t,y,width)
    def top_panel(name,start,end,glazed):
        cols=24;rows=16;verts=[];faces=[];slots=[]
        for row in range(rows+1):
            v=row/rows;z,y,width=section(start,end,v)
            for col in range(cols+1):
                u=col/cols;signed=2*u-1
                # Cross-crown is shared with the roof and windshield top edge.
                crown=.035*(1-signed*signed)
                verts.append(game_point((signed*width,y+crown,z)))
        for row in range(rows):
            for col in range(cols):
                i=row*(cols+1)+col;faces.append((i,i+1,i+cols+2,i+cols+1))
                if name=='Window rear':
                    # Painted sail panels and a substantial lower sill make the
                    # rear glass a fitted window rather than an open passenger well.
                    is_glass=4<=col<cols-4 and 2<=row<rows-3
                else:is_glass=1<=col<cols-1 and 1<=row<rows-1
                slots.append(1 if glazed and is_glass else 0)
        obj=mesh_object(name,verts,faces,paint);obj.data.materials.append(window)
        for face,slot in zip(obj.data.polygons,slots):face.material_index=slot;face.use_smooth=True
        return obj
    top_panel('Window windscreen',front,roof_front,True)
    top_panel('Unified canopy roof',roof_front,roof_rear,False)
    top_panel('Window rear',roof_rear,rear,True)
    # Actual inset rubber edge and fine defroster traces make the fitted rear
    # glass legible from the chase camera. All traces share one mesh/material.
    def rear_glass_point(u,v,lift=.002):
        z,y,width=section(roof_rear,rear,v);signed=2*u-1
        return game_point((signed*width,y+.035*(1-signed*signed)+lift,z))
    uv_min=4/24;uv_max=20/24;v_min=2/16;v_max=13/16
    seal_vertices=[];seal_faces=[]
    for axis,value,start_uv,end_uv in [('u',uv_min,v_min,v_max),('u',uv_max,v_min,v_max),('v',v_min,uv_min,uv_max),('v',v_max,uv_min,uv_max)]:
        offset=len(seal_vertices);segments=32;width=.003 if axis=='u' else .005
        for step in range(segments+1):
            variable=start_uv+(end_uv-start_uv)*step/segments
            for delta in [-width,width]:
                u,v=(value+delta,variable) if axis=='u' else (variable,value+delta)
                seal_vertices.append(rear_glass_point(u,v))
        for step in range(segments):
            i=offset+step*2;seal_faces.append((i,i+1,i+3,i+2))
    seal=mesh_object('Rear glass rubber perimeter',seal_vertices,seal_faces,dark,(0,1,-1))
    demister=make_material('Rear window demister',(.23,.16,.095),.35,.5)
    demister['preserveColor']=True
    verts=[];faces=[];segments=40
    for row in range(7):
        v=v_min+.070+row*(v_max-v_min-.14)/6;offset=len(verts)
        for step in range(segments+1):
            u=uv_min+.020+(uv_max-uv_min-.040)*step/segments
            for delta in [-.0008,.0008]:verts.append(rear_glass_point(u,v+delta,.003))
        for step in range(segments):
            i=offset+step*2;faces.append((i,i+1,i+3,i+2))
    traces=mesh_object('Rear glass seven fine demister traces',verts,faces,demister,(0,1,-1))
    for side in [-1,1]:
        quad=[(side*front[2],front[1],front[0]),(side*rear[2],rear[1],rear[0]),(side*roof_rear[2],roof_rear[1],roof_rear[0]),(side*roof_front[2],roof_front[1],roof_front[0])]
        q=[game_point(point) for point in quad];cols=24;rows=16;verts=[];faces=[];slots=[]
        for row in range(rows+1):
            v=row/rows
            for col in range(cols+1):
                u=col/cols
                fz,fy,fw=section(front,roof_front,v);rz,ry,rw=section(roof_rear,rear,1-v);tz,ty,tw=section(roof_front,roof_rear,u)
                edge_front=game_point((side*fw,fy,fz));edge_rear=game_point((side*rw,ry,rz));edge_top=game_point((side*tw,ty,tz));edge_bottom=q[0]*(1-u)+q[1]*u
                bilinear=q[0]*(1-u)*(1-v)+q[1]*u*(1-v)+q[2]*u*v+q[3]*(1-u)*v
                co=edge_front*(1-u)+edge_rear*u+edge_bottom*(1-v)+edge_top*v-bilinear
                co.x+=side*.009*math.sin(math.pi*u)*math.sin(math.pi*v);verts.append(co)
        for row in range(rows):
            for col in range(cols):
                i=row*(cols+1)+col;face=(i,i+1,i+cols+2,i+cols+1)
                if side<0:face=tuple(reversed(face))
                faces.append(face);slots.append(1 if 2<=col<cols-6 and 1<=row<rows-1 else 0)
        obj=mesh_object('Window right' if side>0 else 'Window left',verts,faces,paint);obj.data.materials.append(window)
        for face,slot in zip(obj.data.polygons,slots):face.material_index=slot;face.use_smooth=True
    # Shared lower perimeter bridges the generated shoulder height variation.
    # These are sloped structural belt surfaces, not glass or loose patch pieces.
    belt_vertices=[];belt_faces=[];segments=32
    curves=[
        (lambda t:(.83*(2*t-1),.92+.035*(1-(2*t-1)**2),.80),lambda t:(.87*(2*t-1),.875+.02*(1-(2*t-1)**2),.91)),
    ]
    for side in [-1,1]:
        curves.append((lambda t,side=side:(side*(.83+.0096*t),.92,.80-2.40*t),lambda t,side=side:(side*(.87+.037*t),.845,.91-2.51*t)))
    for upper,lower in curves:
        offset=len(belt_vertices)
        for i in range(segments+1):
            t=i/segments;belt_vertices.extend([game_point(upper(t)),game_point(lower(t))])
        for i in range(segments):belt_faces.append((offset+2*i,offset+2*i+1,offset+2*i+3,offset+2*i+2))
    belt=mesh_object('Continuous canopy shoulder transition',belt_vertices,belt_faces,paint)
    for face in belt.data.polygons:face.use_smooth=True
    box('Dark closed passenger floor',(0,.245,-.35),(1.39,.014,2.0))
    box('Rear parcel shelf',(0,.785,-1.25),(1.40,.035,.79),lining)
    # Full black semicylindrical wheel-house lining masks light inner cut surfaces.
    for side in [-1,1]:
        for end,z,raw_y,radius in [('F',1.433,-.3149,.403),('R',-1.382,-.3219,.4002)]:
            cy=(raw_y-minimum)*scale;cz=z*scale;r=radius*scale+.012;verts=[];faces=[];steps=64
            for i in range(steps+1):
                angle=-.12+(math.pi+.24)*i/steps
                for x in [.60,.995]:verts.append(game_point((side*x,cy+r*math.sin(angle),cz+r*math.cos(angle))))
            for i in range(steps):faces.append((2*i,2*i+1,2*i+3,2*i+2))
            obj=mesh_object('Black wheel housing '+end+str(side),verts,faces,dark)
            for face in obj.data.polygons:face.use_smooth=True
    dark.use_backface_culling=False
    # Replace the defective tail and C-pillar-foot strip with one closed solid.
    # The source cross-section contains thin U-shaped internal returns; these
    # may define the retained silhouette, but must never become exterior rows.
    cut_z=-1.55
    def cut_front(y):return cut_z
    heights=[-.10,.20,.45,.65,.80,.92,1.1,1.6]
    cutter_vertices=[]
    for x in [-1.35,1.35]:
        for y in heights:cutter_vertices.extend([game_point((x,y,cut_front(y))),game_point((x,y,-3.0))])
    per_side=len(heights)*2;cutter_faces=[]
    for side_index in [0,1]:
        o=side_index*per_side
        for i in range(len(heights)-1):cutter_faces.append((o+2*i,o+2*i+1,o+2*i+3,o+2*i+2))
    for i in range(len(heights)-1):
        for edge in [0,1]:
            a=2*i+edge;b=a+2;cutter_faces.append((a,b,b+per_side,a+per_side))
    cutter_faces.extend([(0,per_side,per_side+1,1),(per_side-2,per_side-1,2*per_side-1,2*per_side-2)])
    cutter=mesh_object('Rear reconstruction volume',cutter_vertices,cutter_faces,lining)
    boolean(body,cutter);remove(cutter)
    bm=bmesh.new();bm.from_mesh(body.data)
    # Inspect a temporary uncapped BMesh to sample the retained perimeter.
    # The production body keeps its Boolean cap for the later solid union.
    def on_cut(v):return abs(-v.co.y-cut_front(v.co.z))<.001
    cap=[f for f in bm.faces if all(on_cut(v) for v in f.verts)]
    bmesh.ops.delete(bm,geom=cap,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    edges=[e for e in bm.edges if e.is_boundary and all(on_cut(v) for v in e.verts)]
    adjacency={v:[] for e in edges for v in e.verts}
    for e in edges:
        a,b=e.verts;adjacency[a].append(b);adjacency[b].append(a)
    if not edges or any(len(a)!=2 for a in adjacency.values()):raise RuntimeError('Rear cut must have closed boundary loops')
    remaining=set(adjacency);loops=[]
    while remaining:
        first=min(remaining,key=lambda v:(v.co.x,v.co.z));loop=[first];previous=None;current=first
        while True:
            following=next(v for v in adjacency[current] if v is not previous)
            if following is first:break
            loop.append(following);previous,current=current,following
            if len(loop)>len(adjacency):raise RuntimeError('Invalid rear boundary traversal')
        loops.append(loop);remaining.difference_update(loop)
    # Fit a clean convex outer cross-section across ALL disconnected source
    # skins. Their U-return faces are not allowed to become exterior loft rows.
    candidates=[(float(v.co.x),float(v.co.z)) for loop in loops for v in loop]
    candidates.extend([(-.84,.935),(0,.969),(.84,.935)])
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    unique=sorted(set(candidates));lower=[];upper=[]
    for p in unique:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(unique):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    hull=lower[:-1]+upper[:-1]
    # Cross-section is convex and counter-clockwise. Resample its actual outline
    # uniformly in angle so the rear panel cannot twist or collapse into ribs.
    center=Vector((0,.58));segments=128;source_points=[]
    for i in range(segments):
        angle=2*math.pi*i/segments;direction=Vector((math.sin(angle),math.cos(angle)));best=None
        for a,b in zip(hull,hull[1:]+hull[:1]):
            a=Vector(a);edge=Vector(b)-a;delta=a-center;den=direction.x*edge.y-direction.y*edge.x
            if abs(den)<1e-9:continue
            t=(delta.x*edge.y-delta.y*edge.x)/den;u=(delta.x*direction.y-delta.y*direction.x)/den
            if t>0 and -.000001<=u<=1.000001 and (best is None or t<best):best=t
        if best is None:raise RuntimeError('Rear silhouette ray missed convex hull')
        point=center+direction*best
        # The full outline reaches outside the source cut before the cut plane.
        # An inset closed front cap joins this outline inside the retained body;
        # Exact union consumes the overlap, instead of exporting cover meshes.
        point+=direction*.018
        source_points.append(Vector((point.x,point.y,-1.53)))
    bm.free()
    def signed_power(value,power):return math.copysign(abs(value)**power,value)
    def rear_surface_z(x,y=.585):return -2.285+.105*(abs(x)/.97)**6+.075*(abs((y-.57)/.315))**4
    targets=[]
    for i in range(segments):
        angle=2*math.pi*i/segments;x=.97*signed_power(math.sin(angle),.5);y=.58+.305*signed_power(math.cos(angle),.5)
        targets.append(Vector((x,y,rear_surface_z(x,y))))
    verts=[];faces=[];transition_sections=10;loft_sections=28;sections=transition_sections+loft_sections
    for step in range(transition_sections):
        t=step/transition_sections;ease=t*t*(3-2*t)
        for p in source_points:
            direction=Vector((p.x,p.y-.58,0)).normalized()
            q=p-direction*(.092*(1-ease));q.z=-1.35-.18*t
            verts.append(game_point(q))
    for step in range(loft_sections+1):
        t=step/loft_sections;h00=2*t*t*t-3*t*t+1;h10=t*t*t-2*t*t+t;h01=-2*t*t*t+3*t*t;h11=t*t*t-t*t
        for p,end in zip(source_points,targets):
            d0=Vector((0,-.06,-1))*(p.z-end.z)
            radial=Vector((-end.x,-(end.y-.58),0)).normalized()*.075
            eps=.001;radial.z=(rear_surface_z(end.x+radial.x*eps,end.y+radial.y*eps)-end.z)/eps
            q=p*h00+d0*h10+end*h01+radial*h11;verts.append(game_point(q))
    for row in range(sections):
        for i in range(segments):a=row*segments+i;b=row*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
    # Front and rear are true closed faces of this one solid reconstruction.
    faces.append(tuple(reversed(range(segments))))
    previous=[sections*segments+i for i in range(segments)]
    for scale_ring in [.97,.88,.72,.53,.33,.15,.045]:
        current=[]
        for p in targets:
            x=p.x*scale_ring;y=.58+(p.y-.58)*scale_ring;current.append(len(verts));verts.append(game_point((x,y,rear_surface_z(x,y))))
        for i in range(segments):faces.append((previous[i],previous[(i+1)%segments],current[(i+1)%segments],current[i]))
        previous=current
    c=len(verts);verts.append(game_point((0,.58,rear_surface_z(0,.58))))
    for i in range(segments):faces.append((previous[i],previous[(i+1)%segments],c))
    tail_shell=mesh_object('Continuous solid rear reconstruction',verts,faces,paint)
    for f in tail_shell.data.polygons:f.use_smooth=True
    tail_shell.data.materials.append(lining);tail_shell.data.polygons[sections*segments].material_index=1
    boolean(body,tail_shell,'UNION');remove(tail_shell)
    # Reapply the exact rear wheel cylinders after the union. This preserves
    # the original envelopes even where the clean solid begins near the arch.
    for side in [-1,1]:
        center=(side*.90*scale,(-.3219-minimum)*scale,-1.382*scale)
        bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=.4002*scale+.014,depth=.60,location=game_point(center),rotation=(0,math.pi/2,0))
        cutter=bpy.context.object;cutter.data.materials.append(lining);boolean(body,cutter);remove(cutter)
    # The exported body contains the Boolean result only: no hidden old tail,
    # no independent deck, and no duplicate fascia remain in the scene.
    source_ring=[tuple(p) for p in source_points]
    rear_repair={'cutLowerZ':cut_z,'reconstructionFrontZ':-1.35,'fullCrossSectionZ':-1.53,'crossSectionMarginM':.018,'sourceBoundaryVertices':sum(len(a) for a in loops),'outerBoundaryVertices':segments,'loftSections':sections,'singleExternalShell':True,'separateDeckOrFascia':False,'solidBooleanUnion':True,'retainsFrontBodyAndWheelPivots':True}

    # Continuous, gently swept light bar and its dark optical housing. Unlike the
    # old source-fitted strips these never follow dents or cut overlapping lips.
    for name,half_height,offset,material in [('Rear lamp smoked housing',.027,.010,dark),('Rear continuous Tail',.0065,.014,tail)]:
        verts=[];faces=[];steps=64
        for i in range(steps+1):
            x=-.87+1.74*i/steps;y=.808-.023*(abs(x)/.87)**4
            for dy in [-half_height,half_height]:verts.append(game_point((x,y+dy,rear_surface_z(x,y+dy)-offset)))
        for i in range(steps):faces.append((2*i,2*i+1,2*i+3,2*i+2))
        lens=mesh_object(name,verts,faces,material,(0,0,-1))
        for face in lens.data.polygons:face.use_smooth=True
    # A clean dark lower valance separates the body from the road. Low fins and
    # real hollow metal exhaust tips replace the melted generated protrusions.
    verts=[];faces=[];cols=48;rows=5
    for row in range(rows+1):
        v=row/rows
        for col in range(cols+1):
            x=-.85+1.70*col/cols;top=.435-.018*(abs(x)/.85)**4
            y=.300+(top-.300)*v
            verts.append(game_point((x,y,rear_surface_z(x,y)-.008)))
    for row in range(rows):
        for col in range(cols):
            i=row*(cols+1)+col;faces.append((i,i+1,i+cols+2,i+cols+1))
    diffuser=mesh_object('Rear graphite diffuser',verts,faces,dark,(0,0,-1))
    for face in diffuser.data.polygons:face.use_smooth=True
    plinth=box('Rear plate mounting plinth',(0,.52,-2.310),(.55,.15,.035),dark)
    edge=plinth.modifiers.new('Rounded plate support','BEVEL');edge.width=.012;edge.segments=3
    for x in [-.40,-.20,0,.20,.40]:
        fin=box('Diffuser vertical fin',(x,.33,-2.295),(.014,.105,.07),dark)
        bevel=fin.modifiers.new('Soft diffuser edge','BEVEL');bevel.width=.005;bevel.segments=2
    exhaust_metal=make_material('Exhaust brushed alloy',(.28,.31,.33),.92,.24)
    for side in [-1,1]:
        verts=[];faces=[];steps=48;cx=side*.68;cy=.355
        for z,radius in [(-2.325,.067),(-2.335,.062),(-2.335,.048),(-2.247,.048)]:
            for i in range(steps):
                angle=2*math.pi*i/steps;verts.append(game_point((cx+radius*math.cos(angle),cy+radius*math.sin(angle),z)))
        for band in range(3):
            for i in range(steps):
                a=band*steps+i;b=band*steps+(i+1)%steps;faces.append((a,b,b+steps,a+steps))
        tip=mesh_object('Polished hollow exhaust '+str(side),verts,faces,exhaust_metal)
        for face in tip.data.polygons:face.use_smooth=True
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.047,depth=.003,location=game_point((cx,cy,-2.251)),rotation=(math.pi/2,0,0))
        bpy.context.object.name='Exhaust dark inner bore';bpy.context.object.data.materials.append(dark)
    # Complete mirror assemblies were removed with the defective AI upper cabin.
    mirror_glass=make_material('Glass',(.25,.32,.39),.95,.075);mirror_glass.use_backface_culling=False
    for side in [-1,1]:
        box('Mirror short support',(side*.89,.963,.34),(.20,.036,.065),dark)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28,ring_count=14,radius=1,location=game_point((side*.995,.990,.30)))
        shell=bpy.context.object;shell.name='Mirror streamlined shell';shell.scale=(.145,.092,.055);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);shell.data.materials.append(paint)
        for face in shell.data.polygons:face.use_smooth=True
        vertices=[game_point((side*.995,.990,.202))];faces=[];segments=40
        for i in range(segments):
            angle=2*math.pi*i/segments;vertices.append(game_point((side*.995+.109*math.cos(angle),.990+.038*math.sin(angle),.235)))
        for i in range(segments):faces.append((0,(i+1)%segments+1,i+1))
        lens=mesh_object('Mirror reflective lens',vertices,faces,mirror_glass)
        for face in lens.data.polygons:face.use_smooth=True
    # Continuous inset front grille; replace baked triangles with actual black depth.
    cutter=box('Central grille cut',(0,.48,2.25),(1.09,.245,.40),dark);boolean(body,cutter);remove(cutter)
    box('Recessed central grille',(0,.48,2.064),(1.075,.232,.016),dark)
    for side in [-1,1]:
        cutter=box('Side intake cut',(side*.79,.445,2.08),(.25,.19,.45),dark);boolean(body,cutter);remove(cutter)
        box('Side intake depth',(side*.79,.445,1.865),(.24,.18,.018),dark)
    # Fitted continuous lamp openings and luminous surfaces (true +Z/-Z winding).
    source_points=[]
    for vertex in body.data.vertices:source_points.append(vertex.co.copy())
    tree=BVHTree.FromPolygons(source_points,[list(f.vertices) for f in body.data.polygons])
    for end in [1]:
        for side in [-1,1]:
            points=[];steps=28
            for i in range(steps+1):
                x=side*(.52+.40*i/steps);y=(.77 if end>0 else .86)-.025*i/steps
                hit,_,_,_=tree.ray_cast(game_point((x,y,end*3)),game_point((0,0,-end)),2)
                z=-hit.y if hit is not None else end*2.15
                points.append((x,y,z))
            # A regularized quadratic removes millimetric source dents from the
            # optical strip while interpolating its original endpoint depths.
            values=np.array(points);t=np.linspace(0,1,len(points));fit=np.polyval(np.polyfit(t,values[:,2],2),t)
            fit+=(values[0,2]-fit[0])*(1-t)+(values[-1,2]-fit[-1])*t
            points=[(float(x),float(y),float(z)) for (x,y,_),z in zip(points,fit)]
            verts=[]
            for x,y,z in points:
                for dy,dz in [(-.030,-end*.13),(.030,-end*.13),(-.030,end*.08),(.030,end*.08)]:verts.append(game_point((x,y+dy,z+dz)))
            faces=[(0,2,3,1),(steps*4,steps*4+1,steps*4+3,steps*4+2)]
            for i in range(steps):
                a=i*4;b=a+4
                for j,k in [(0,1),(1,3),(3,2),(2,0)]:faces.append((a+j,b+j,b+k,a+k))
            cutter=mesh_object('Continuous lamp cavity',verts,faces,dark);boolean(body,cutter);remove(cutter)
            for name,height,offset,material in [('Black lamp interior',.029,-.022,dark),('LED' if end>0 else 'Rear continuous Tail',.007,-.016,headlight if end>0 else tail)]:
                vs=[];fs=[]
                for x,y,z in points:
                    for dy in [-height,height]:vs.append(game_point((x,y+dy,z+end*offset)))
                for i in range(steps):
                    face=(i*2,i*2+2,i*2+3,i*2+1)
                    if side*end<0:face=tuple(reversed(face))
                    fs.append(face)
                obj=mesh_object(name,vs,fs,material)
                # Emissive panes must render from both sides despite local curve winding.
                material.use_backface_culling=False
    # Reuse only real physical front/rear license plate components from fallback.
    for sign,parts in append_physical_plates().items():
        center=game_point((0,.48 if sign>0 else .52,2.322 if sign>0 else -2.334))
        for obj in parts:
            obj.location=center
            for material in list(obj.data.materials):
                if material is None:continue
                if material.name.startswith('Graphite'):obj.data.materials.clear();obj.data.materials.append(dark)
                elif material.name.startswith('Alloy'):material.name='Alloy'
                elif material.name.startswith('Plate'):material.name='Plate'
    for name,p in [('Brake_high',(0,1.16,-.94)),('Exhaust_L',(-.68,.33,-2.30)),('Exhaust_R',(.68,.33,-2.30))]:
        obj=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(obj);obj.location=game_point(p)
    # Manually rebuilt bonnet height: preserve the Lux perimeter while fitting
    # a low-frequency road-visible center surface below the fixed driver eye.
    def smoothstep(a,b,value):
        t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)
    for vertex in list(body.data.vertices)+list(hood.data.vertices):
        x,y,z=vertex.co.x,vertex.co.z,-vertex.co.y
        if .58<z<2.18 and y>.74:
            weight=(1-smoothstep(.71,.95,abs(x)))*smoothstep(.58,.82,z)*(1-smoothstep(1.92,2.18,z))
            target=.895-.026*max(0,min(1,(z-.82)/1.25))+.012*(1-min(1,(x/.84)**2))
            vertex.co.z=y*(1-weight)+min(y,target)*weight
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj in [body,hood]:
            obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
            for face in obj.data.polygons:face.use_smooth=face.material_index==0
    # Group static rear trim by material, applying small edge bevels before join.
    # This keeps the new fins/bores/plinth from each adding a car draw call.
    for group_name,prefixes in [('Rear graphite detailing',('Diffuser vertical fin','Rear graphite diffuser','Rear plate mounting plinth','Exhaust dark inner bore','Rear lamp smoked housing')),('Rear hollow exhaust pair',('Polished hollow exhaust',))]:
        objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.name.startswith(prefixes)]
        for obj in objects:
            bpy.context.view_layer.objects.active=obj
            for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
        if objects:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name=group_name
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            if obj.data.validate(verbose=False):print('SANITIZED_SOURCE_MESH',obj.name)
            obj.data.update()
    # Fair only the repaired shoulder band. The wheel-cylinder intersection,
    # band ends and fixed window meshes remain constrained. The independent
    # shoulder strip is fitted to the resulting outer body below.
    def ramp(a,b,x):
     t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
    group=body.vertex_groups.new(name='Rear shoulder constrained fairing');chosen=[]
    for v in body.data.vertices:
     x,y,z=v.co.x,v.co.z,-v.co.y
     w=ramp(-1.90,-1.76,z)*(1-ramp(-1.43,-1.29,z))*ramp(.75,.86,abs(x))*ramp(.68,.85,y)
     wheel_distance=abs(math.hypot(y-.3902368,z+1.3388125)-.40169375)
     w*=ramp(.003,.022,wheel_distance)
     if w>.0001:group.add([v.index],w,'REPLACE');chosen.append(v.index)
    before={i:body.data.vertices[i].co.copy() for i in chosen}
    bpy.context.view_layer.objects.active=body;m=body.modifiers.new('Constrained rear shoulder fairing','SMOOTH');m.factor=.72;m.iterations=42;m.vertex_group=group.name;bpy.ops.object.modifier_apply(modifier=m.name)
    rear_repair['shoulderFairing']={'vertices':len(chosen),'iterations':42,'factor':.72,'maxDisplacementM':max((body.data.vertices[i].co-before[i]).length for i in chosen),'wheelArchLockM':.003}
    for f in body.data.polygons:f.use_smooth=f.material_index==0
    body.data.normals_split_custom_set([(0,0,0)]*len(body.data.loops));body.data.update()
    # Replace the existing side-rear shoulder strip; do not stack a new cover.
    # Its upper edge follows the fixed side-window sill. Its lower edge follows
    # one external Paint branch, picked by a horizontal ray from outside.
    # Adaptive subdivision limits sampled edge-to-body gaps, not just vertex gaps.
    points=[v.co.copy() for v in body.data.vertices];tree=BVHTree.FromPolygons(points,[list(f.vertices) for f in body.data.polygons])
    def ramp(a,b,v):
     t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
    def contact(upper,side,reference=None):
     height=.902-.032*ramp(.80,1.70,upper.y)
     p,n,index,d=tree.ray_cast(Vector((side*1.4,upper.y,height)),Vector((-side,0,0)),1)
     if p is None or body.data.polygons[index].material_index!=0 or abs(p.x)<.88 or p.z<.84:raise RuntimeError('No outer Paint shoulder at '+str((tuple(upper),tuple(p) if p else None,body.data.polygons[index].material_index if index is not None else None)))
     return p,(p-upper).length
    paint_tree=BVHTree.FromPolygons(points,[list(f.vertices) for f in body.data.polygons if f.material_index==0])
    vertices=[v.co.copy() for v in belt.data.vertices[:66]];faces=[tuple(f.vertices) for f in belt.data.polygons[:32]];records=[];edge_max=0
    for side in [-1,1]:
     def row(z,reference=None):
      upper=Vector((side*(.8332-.004*z),-z,.92));t=(.80-z)/2.40;lower=Vector((side*(.87+.037*t),-(.91-2.51*t),.845));actual=None;weight=0
      if z<-.55:
       actual,distance=contact(upper,side,reference);weight=ramp(.55,.80,-z);lower=lower.lerp(actual,weight)
      return {'z':z,'upper':upper,'lower':lower,'contact':actual,'blend':weight}
     stations=[];reference=None
     for i in range(101):
      item=row(.80-2.50*i/100,reference);stations.append(item)
      if item['contact'] is not None:reference=item['contact']
     for iteration in range(10):
      refined=[stations[0]];changed=False
      for a,b in zip(stations,stations[1:]):
       error=max(paint_tree.find_nearest(a['lower'].lerp(b['lower'],t))[3] for t in [.125,.25,.375,.5,.625,.75,.875]) if a['z']<=-.79999 else 0
       if error>.00020:
        refined.append(row((a['z']+b['z'])/2,a['lower'].lerp(b['lower'],.5)));changed=True
       refined.append(b)
      stations=refined
      if not changed:break
     start=len(vertices)
     for item in stations:
      vertices.extend([item['upper'],item['lower']])
      records.append({'side':side,'z':item['z'],'upper':[item['upper'].x,item['upper'].z,-item['upper'].y],'lower':[item['lower'].x,item['lower'].z,-item['lower'].y],'blend':item['blend']})
     for i,(a,b) in enumerate(zip(stations,stations[1:])):
      offset=start+2*i;face=(offset,offset+1,offset+3,offset+2)
      if side<0:face=tuple(reversed(face))
      faces.append(face)
      if a['z']<=-.79999:edge_max=max(edge_max,max(paint_tree.find_nearest(a['lower'].lerp(b['lower'],t))[3] for t in [.125,.25,.375,.5,.625,.75,.875]))
    if edge_max>.0005:raise RuntimeError('Shoulder edge left the real body surface')
    mesh=bpy.data.meshes.new('Body-fitted canopy shoulder transition');mesh.from_pydata(vertices,[],faces);mesh.materials.append(belt.data.materials[0]);mesh.update();belt.data=mesh
    for f in mesh.polygons:f.use_smooth=True
    rear_repair['shoulderConnection']={'method':'outer Paint horizontal first hit; fixed window upper edge','fullContactZ':[-.80,-1.70],'transitionZ':[-.55,-.80],'heightStartM':.902,'heightEndM':.870,'subdivisionPassLimit':10,'constructionBlenderEdgeGapLimitM':.0005,'constructionBlenderMaxSampledEdgeGapM':edge_max,'note':'curve-fit construction measurement before solid union; not an exported assembly-gap result','stationCount':len(records)}
    original=body.data.copy()
    planes_common=[(Vector((0,.5,0)),Vector((0,1,0))),(Vector((0,0,.82)),Vector((0,0,1)))]
    def on_plane(v,p,n):return abs((v.co-p).dot(n))<.000002
    def cut_and_cap(bm,p,n):
     bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=p,plane_no=n,dist=.000001,clear_inner=True,clear_outer=False)
     boundary=[e for e in bm.edges if e.is_boundary and all(on_plane(v,p,n) for v in e.verts)]
     filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
     for f in filled.get('faces',[]):f.material_index=1
     bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    locals=[];local_checks=[]
    for side in [-1,1]:
     planes=planes_common+[(Vector((side*.78,0,0)),Vector((side,0,0)))]
     bm=bmesh.new();bm.from_mesh(original)
     for p,n in planes:cut_and_cap(bm,p,n)
     bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
     if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
     print('LOCAL_OPERAND',side,'BOUNDARY',sum(e.is_boundary for e in bm.edges),'NONMANIFOLD',sum(not e.is_manifold for e in bm.edges),'VOLUME',bm.calc_volume(signed=True))
     if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Local shoulder operand must be closed and manifold')
     local_checks.append({'side':side,'operandBoundary':sum(e.is_boundary for e in bm.edges),'operandNonmanifold':sum(not e.is_manifold for e in bm.edges)})
     mesh=bpy.data.meshes.new('Isolated shoulder');bm.to_mesh(mesh);bm.free();local=bpy.data.objects.new('Local closed shoulder',mesh);bpy.context.collection.objects.link(local)
     for mat in body.data.materials:mesh.materials.append(mat)
     rear=belt.copy();rear.data=belt.data.copy();bpy.context.collection.objects.link(rear);rear.name='Local structural shoulder strip'
     bm=bmesh.new();bm.from_mesh(rear.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if not all(v.co.y>=.54999 and side*v.co.x>0 for v in f.verts)],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(rear.data);bm.free()
     rear.data.materials.append(lining);bpy.context.view_layer.objects.active=rear;m=rear.modifiers.new('Inward structural thickness','SOLIDIFY');m.thickness=.02;m.offset=-1;m.use_even_offset=True;m.material_offset=1;m.material_offset_rim=1;bpy.ops.object.modifier_apply(modifier=m.name)
     bm=bmesh.new();bm.from_mesh(rear.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
     if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
     bm.to_mesh(rear.data);bm.free()
     bpy.context.view_layer.objects.active=local;m=local.modifiers.new('Local structural union','BOOLEAN');m.operation='UNION';m.solver='EXACT';m.object=rear;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(rear,do_unlink=True)
     bm=bmesh.new();bm.from_mesh(local.data);print('LOCAL_UNION',side,'BOUNDARY',sum(e.is_boundary for e in bm.edges),'NONMANIFOLD',sum(not e.is_manifold for e in bm.edges))
     if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Local shoulder union must stay manifold')
     local_checks[-1].update({'unionBoundary':sum(e.is_boundary for e in bm.edges),'unionNonmanifold':sum(not e.is_manifold for e in bm.edges)})
     caps=[f for f in bm.faces if any(all(on_plane(v,p,n) for v in f.verts) for p,n in planes)];bmesh.ops.delete(bm,geom=caps,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(local.data);bm.free();locals.append(local)
    # Split the original at the same fixed planes, retaining every face outside the
    # isolated upper shoulders. The temporary cap faces are not inserted here.
    bm=bmesh.new();bm.from_mesh(original)
    for p,n in planes_common+[(Vector((-.78,0,0)),Vector((-1,0,0))),(Vector((.78,0,0)),Vector((1,0,0)))]:bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=p,plane_no=n,dist=.000001,clear_inner=False,clear_outer=False)
    remove=[f for f in bm.faces if (lambda p:abs(p.x)>.780001 and p.y>.500001 and p.z>.820001)(f.calc_center_median())];bmesh.ops.delete(bm,geom=remove,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    for obj in locals:bm.from_mesh(obj.data);bpy.data.objects.remove(obj,do_unlink=True)
    seam=[v for v in bm.verts if abs(v.co.y-.5)<.000003 or abs(v.co.z-.82)<.000003 or abs(abs(v.co.x)-.78)<.000003];bmesh.ops.remove_doubles(bm,verts=seam,dist=.000004);bm.to_mesh(body.data);bm.free();body.data.update()
    # Remove exactly the independent rear strip already included by the union.
    bm=bmesh.new();bm.from_mesh(belt.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if all(v.co.y>=.54999 for v in f.verts)],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(belt.data);bm.free()
    for f in body.data.polygons:f.use_smooth=f.material_index==0
    body.data.normals_split_custom_set([(0,0,0)]*len(body.data.loops));body.data.update()
    rear_repair['shoulderAssembly']={'method':'isolate closed upper side volumes, union inward shoulder solid, remove temporary caps and weld to retained body on the same cut planes','isolationGame':{'rearOfZ':-.5,'aboveY':.82,'outsideAbsX':.78},'stripThicknessM':.02,'stripStartsZ':-.55,'seamWeldM':.000004,'operands':local_checks,'independentRearStripRemoved':True}

    mesh=body.data
    # Refine long local faces before deformation so the prescribed curved top is
    # sampled across the strip, rather than interpolated only from its two edges.
    bm=bmesh.new();bm.from_mesh(mesh)
    def refine_face(f):return any(abs(v.co.x)>.77999 and v.co.z>.81999 and .49999<v.co.y<1.87001 for v in f.verts)
    planes=[(Vector((side*(.78+.02*i),0,0)),Vector((1,0,0))) for side in [-1,1] for i in range(1,16)]+[(Vector((0,.5+.02*i,0)),Vector((0,1,0))) for i in range(1,69)]
    for p,n in planes:
     faces=[f for f in bm.faces if refine_face(f)];edges=list({e for f in faces for e in f.edges});verts=list({v for f in faces for v in f.verts})
     bmesh.ops.bisect_plane(bm,geom=verts+edges+faces,plane_co=p,plane_no=n,dist=.0000001,clear_inner=False,clear_outer=False)
    print('REFINED',sum(e.is_boundary for e in bm.edges),sum(not e.is_manifold for e in bm.edges),len(bm.verts))
    bm.to_mesh(mesh);bm.free();mesh.update()
    points=[v.co.copy() for v in mesh.vertices];tree=BVHTree.FromPolygons(points,[list(f.vertices) for f in mesh.polygons])
    def ramp(a,b,v):
     t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
    changes=[]
    for v in mesh.vertices:
     x,by,h=abs(v.co.x),v.co.y,v.co.z;side=1 if v.co.x>0 else -1;sill=.8332+.004*by
     weight=ramp(.5,.72,by)*(1-ramp(1.70,1.87,by))*ramp(.78,sill-.008,x)
     if h<=.820001 or weight<=0:continue
     p,n,index,d=tree.ray_cast(Vector((v.co.x,by,1.10)),Vector((0,0,-1)),.3)
     edge,en,ei,ed=tree.ray_cast(Vector((side*1.4,by,.82)),Vector((-side,0,0)),.8)
     if p is None or edge is None:continue
     top=max(p.z,h);width=max(abs(edge.x),sill+.1);t=max(0,min(1,(x-sill)/(width-sill)))
     exponent=5-3.7*ramp(1.35,1.70,by);target=.92-.10*(t**exponent)
     mapped=.82+(h-.82)*(target-.82)/max(.00001,top-.82)
     new=h+weight*(mapped-h)
     if abs(new-h)>.0000001:changes.append({'i':v.index,'old':h,'new':new});v.co.z=new
    foot_changes=[]
    # Keep the already fixed sill height while compressing the small undercut at
    # the closed C-pillar-foot cap. This mapping is strictly increasing vertically.
    for v in mesh.vertices:
     x,by,h=abs(v.co.x),v.co.y,v.co.z;sill=.8332+.004*by
     w=ramp(1.56,1.67,by)*(1-ramp(1.72,1.82,by))*ramp(.79,.825,x)*(1-ramp(sill+.004,sill+.035,x))
     if .82<h<.92 and w>0:
      mapped=.92-.10*((.92-h)/.10)**3;v.co.z=h+w*(mapped-h);foot_changes.append(v.co.z-h)
    # Remove only inherited local sharpness; retain source front/bottom and material boundaries.
    local=lambda v:abs(v.co.x)>.78 and v.co.z>=.81999 and .49999<v.co.y<1.87001
    for e in mesh.edges:
     if any(local(mesh.vertices[i]) for i in e.vertices):e.use_edge_sharp=False
    for f in mesh.polygons:
     if f.material_index==0:f.use_smooth=True
    if mesh.attributes.get('custom_normal'):mesh.attributes.remove(mesh.attributes['custom_normal'])
    mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bm.normal_update();record={'columnMappingVertexCount':len(changes),'columnMappingMinDeltaM':min(c['new']-c['old'] for c in changes),'columnMappingMaxDeltaM':max(c['new']-c['old'] for c in changes),'footMappingVertexCount':len(foot_changes),'footMappingMaxDeltaM':max(foot_changes,default=0),'rawBoundary':sum(e.is_boundary for e in bm.edges),'rawNonmanifold':sum(not e.is_manifold for e in bm.edges),'localBoundary':sum(e.is_boundary and all(local(v) for v in e.verts) for e in bm.edges),'localNonmanifold':sum(not e.is_manifold and all(local(v) for v in e.verts) for e in bm.edges)};bm.free();rear_repair['finalShoulderShape']=record
    if record['localBoundary'] or record['localNonmanifold']:raise RuntimeError('Final shoulder must remain closed and manifold')
    rear_repair['finalShoulderShape'].update({'method':'20mm local X/Z section refinement followed by strictly monotonic vertical column mapping; 0.82m lower cut fixed, 0.92m sill fixed, ends eased to retained body; final C-foot undercut compressed monotonically','sectionStepM':.02,'lowerFixedY':.82,'sillFixedY':.92,'gameZRange':[-.50,-1.87],'inheritedCustomNormalsRemoved':True})

    mesh=body.data;mesh.calc_loop_triangles();tree=BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices],[list(f.vertices) for f in mesh.polygons]);corrected=set()
    for triangle in mesh.loop_triangles:
     face=mesh.polygons[triangle.polygon_index]
     if face.material_index!=1:continue
     c=sum((mesh.vertices[i].co for i in triangle.vertices),Vector())/3
     if not(abs(c.x)>.815 and c.z>.82 and .55<c.y<1.84):continue
     side=1 if c.x>0 else -1
     for origin,direction in [(Vector((c.x,c.y,1.10)),Vector((0,0,-1))),(Vector((side*1.4,c.y,c.z)),Vector((-side,0,0)))]:
      p,n,index,d=tree.ray_cast(origin,direction,1)
      if p is not None and (p-c).length<.00030 and (triangle.normal.dot(-direction)>.015):corrected.add(face.index);break
    for i in corrected:mesh.polygons[i].material_index=0;mesh.polygons[i].use_smooth=True
    mesh.update();rear_repair['externalPaintRestoredFaces']=len(corrected)

    bm=bmesh.new();bm.from_mesh(body.data)
    local=lambda v:.795<abs(v.co.x)<.945 and .835<v.co.z<.941 and 1.625<v.co.y<1.755
    before=(len(bm.verts),len(bm.faces));bmesh.ops.remove_doubles(bm,verts=[v for v in bm.verts if local(v)],dist=.000002)
    bmesh.ops.dissolve_degenerate(bm,edges=[e for e in bm.edges if all(local(v) for v in e.verts)],dist=.000002)
    bmesh.ops.delete(bm,geom=[e for e in bm.edges if not e.link_faces],context='EDGES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    record={'before':before,'after':(len(bm.verts),len(bm.faces)),'rawBoundary':sum(e.is_boundary for e in bm.edges),'rawNonmanifold':sum(not e.is_manifold for e in bm.edges),'localBoundary':sum(e.is_boundary and any(local(v) for v in e.verts) for e in bm.edges),'localNonmanifold':sum(not e.is_manifold and any(local(v) for v in e.verts) for e in bm.edges)}
    rear_repair['footMicroscopicCleanup']=record
    if record['localBoundary'] or record['localNonmanifold']:raise RuntimeError('Microscopic cleanup did not retain closed C foot')
    bm.to_mesh(body.data);bm.free();body.data.update()
    mesh=body.data;mesh.calc_loop_triangles();tree=BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices],[list(f.vertices) for f in mesh.polygons]);corrected=set()
    for triangle in mesh.loop_triangles:
     face=mesh.polygons[triangle.polygon_index]
     if face.material_index!=1:continue
     c=sum((mesh.vertices[i].co for i in triangle.vertices),Vector())/3
     if not(.795<abs(c.x)<1.00 and c.z>.835 and 1.66<c.y<1.73):continue
     side=1 if c.x>0 else -1
     for origin in [Vector((c.x,3,c.z)),Vector((side*2.7,3.5,1.7)),Vector((side*2.0,3.2,1.2))]:
      direction=(c-origin).normalized();start=origin.copy()
      for attempt in range(8):
       p,n,index,d=tree.ray_cast(start,direction,5)
       if p is None or n.dot(direction)<0:break
       start=p+direction*.0000001
      if p is not None and (p-c).length<.00030 and triangle.normal.dot(-direction)>.015:corrected.add(face.index);break
    for i in corrected:mesh.polygons[i].material_index=0;mesh.polygons[i].use_smooth=True
    mesh.update();rear_repair['rearFacingExteriorCapPaint']={'faces':len(corrected),'gameZRange':[-1.66,-1.73],'method':'FrontSide visibility from rear and both rear quarters; exterior end-cap faces assigned Paint before shared-point normals'}

    mesh=body.data;tree=BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices],[list(f.vertices) for f in mesh.polygons])
    def ramp(a,b,v):
     t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
    def top(x,by):
     side=1 if x>0 else -1;sill=.8332+.004*by;p,n,i,d=tree.ray_cast(Vector((side*1.4,by,.82)),Vector((-side,0,0)),.8)
     if p is None:return .82
     width=max(abs(p.x),sill+.1);t=max(0,min(1,(abs(x)-sill)/(width-sill)));return .92-.10*t**(5-3.7*ramp(1.35,1.70,by))
    values=[n.vector.copy() for n in mesh.corner_normals];changed=0
    for f in mesh.polygons:
     if f.material_index!=0:continue
     for li in f.loop_indices:
      v=mesh.vertices[mesh.loops[li].vertex_index].co;x,by,h=v.x,v.y,v.z
      weight=ramp(.55,.8,by)*(1-ramp(1.74,1.87,by))*ramp(.78,.835,abs(x))*ramp(.82,.885,h)
      if weight<=0:continue
      step=.005;dx=(top(x+step,by)-top(x-step,by))/(2*step);dy=(top(x,by+step)-top(x,by-step))/(2*step);target=Vector((-dx,-dy,1)).normalized();values[li]=values[li].lerp(target,weight).normalized();changed+=1
    # All coincident Paint corners in the repaired band share one normal, including
    # the fade to the source body. This removes split shading fans at the old seam.
    groups={}
    for f in mesh.polygons:
     if f.material_index!=0:continue
     for li in f.loop_indices:
      v=mesh.vertices[mesh.loops[li].vertex_index].co
      if abs(v.x)>.78 and v.z>.82 and .55<v.y<1.87:groups.setdefault(tuple(round(c,6) for c in v),[]).append(li)
    for ids in groups.values():
     n=sum((values[i] for i in ids),Vector())
     if n.length_squared>1e-12:
      n.normalize()
      for i in ids:values[i]=n.copy()
    mesh.normals_split_custom_set(values);mesh.update();
    rear_repair['continuousShoulderNormals']={'method':'analytic derivatives of the constrained shoulder profile, blended into retained body; coincident Paint corners use a common unit normal','affectedCorners':changed,'positionQuantizationM':.000001,'normalMatchGroups':len(groups)}

    out=ROOT/'public/models/solstice-lux-gt.glb';temporary=ROOT/'art/lux3d/solstice-lux-gt-export.glb'
    bpy.context.preferences.filepaths.save_version=0
    # Source wheel meshes remain editable in Blender; the game replaces them.
    bpy.ops.object.select_all(action='DESELECT');omitted_wheels=[]
    for obj in bpy.context.scene.objects:
        parent=obj.parent;wheel_child=False
        while parent:
            if parent.name in ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR']:wheel_child=True;break
            parent=parent.parent
        if wheel_child and obj.type=='MESH':omitted_wheels.append(obj.name)
        else:obj.select_set(True)
    rear_repair['runtimeWheelMeshesOmitted']=omitted_wheels
    bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',export_image_format='JPEG',export_image_quality=88,export_yup=True,export_apply=True,export_extras=True,use_selection=True)
    import time,shutil
    for attempt in range(8):
        try:os.replace(temporary,out);break
        except PermissionError:
            if attempt==7:
                shutil.copyfile(temporary,out);temporary.unlink();break
            time.sleep(.25*(attempt+1))
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/lux3d/solstice-lux-gt.blend'))
    import struct,hashlib
    binary=out.read_bytes();length=struct.unpack_from('<I',binary,12)[0];gltf=json.loads(binary[20:20+length])
    triangles=sum(gltf['accessors'][primitive['indices']]['count']//3 for mesh in gltf['meshes'] for primitive in mesh['primitives'])
    record={'generator':'Aholo Lux3D G1','taskId':3431485,'source':'art/lux3d/car-plated-source.glb','blender':bpy.app.version_string,'method':'Lux lower body with 12mm solid repair and exact wheel/front lamp cuts; shared-boundary canopy with wider rear C pillars and parcel shelf; single solid rear union with integrated deck and fascia, constrained shoulder fairing; fixed-window shoulder connection fused into isolated closed upper sides and shaped by monotonic vertical columns with continuous shared-point shoulder normals, clean tail bar and hollow exhaust; low fitted bonnet; full black wheel housings','uniformScale':scale,'triangles':triangles,'primitives':sum(len(mesh['primitives']) for mesh in gltf['meshes']),'materials':[m['name'] for m in gltf['materials']],'glbBytes':len(binary),'assetSha256':hashlib.sha256(binary).hexdigest(),'rearRepair':rear_repair,'wheelNodes':[node for node in gltf['nodes'] if node.get('name') in ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR']],'driverHoodMaterials':['Paint','Cabin lining'],'preview':'output/car-audit/final-{rear-quarter,rear-top,side}.jpg'}
    (ROOT/'art/lux3d/lux-car-build.json').write_text(json.dumps(record,indent=2),encoding='utf8')
    print('CONTINUOUS_LUX_EXPORT',out.stat().st_size)

if __name__=='__main__':main()
