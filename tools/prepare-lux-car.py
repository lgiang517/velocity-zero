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
    def mesh_object(name,vertices,faces,material):
        data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update();data.materials.append(material)
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
        return obj
    def box(name,center,size,material=lining):
        bpy.ops.mesh.primitive_cube_add(size=1,location=game_point(center));obj=bpy.context.object;obj.name=name;obj.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(material);return obj
    def boolean(target,cutter,operation='DIFFERENCE'):
        bpy.context.view_layer.objects.active=target
        modifier=target.modifiers.new('Exact continuous cut','BOOLEAN');modifier.operation=operation;modifier.solver='EXACT';modifier.object=cutter
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
                slots.append(1 if glazed and 1<=col<cols-1 and 1<=row<rows-1 else 0)
        obj=mesh_object(name,verts,faces,paint);obj.data.materials.append(window)
        for face,slot in zip(obj.data.polygons,slots):face.material_index=slot;face.use_smooth=True
        return obj
    top_panel('Window windscreen',front,roof_front,True)
    top_panel('Unified canopy roof',roof_front,roof_rear,False)
    top_panel('Window rear',roof_rear,rear,True)
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
                faces.append(face);slots.append(1 if 2<=col<cols-3 and 1<=row<rows-1 else 0)
        obj=mesh_object('Window right' if side>0 else 'Window left',verts,faces,paint);obj.data.materials.append(window)
        for face,slot in zip(obj.data.polygons,slots):face.material_index=slot;face.use_smooth=True
    # Shared lower perimeter bridges the generated shoulder height variation.
    # These are sloped structural belt surfaces, not glass or loose patch pieces.
    belt_vertices=[];belt_faces=[];segments=32
    curves=[
        (lambda t:(.83*(2*t-1),.92+.035*(1-(2*t-1)**2),.80),lambda t:(.87*(2*t-1),.875+.02*(1-(2*t-1)**2),.91)),
        (lambda t:(.84*(2*t-1),.92+.035*(1-(2*t-1)**2),-1.70),lambda t:(.91*(2*t-1),.875+.02*(1-(2*t-1)**2),-1.80)),
    ]
    for side in [-1,1]:
        curves.append((lambda t,side=side:(side*(.83+.01*t),.92,.80-2.50*t),lambda t,side=side:(side*(.87+.04*t),.845,.91-2.71*t)))
    for upper,lower in curves:
        offset=len(belt_vertices)
        for i in range(segments+1):
            t=i/segments;belt_vertices.extend([game_point(upper(t)),game_point(lower(t))])
        for i in range(segments):belt_faces.append((offset+2*i,offset+2*i+1,offset+2*i+3,offset+2*i+2))
    belt=mesh_object('Continuous canopy shoulder transition',belt_vertices,belt_faces,paint)
    for face in belt.data.polygons:face.use_smooth=True
    box('Dark closed passenger floor',(0,.245,-.35),(1.39,.014,2.0))
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
    # Replace the last generated rear-window debris with one continuous low deck.
    rear_cleanup=box('Remove defective rear upper skin',(0,1.31,-1.99),(2.50,.88,.64),paint)
    boolean(body,rear_cleanup);remove(rear_cleanup)
    verts=[];faces=[];cols=24;rows=12
    for row in range(rows+1):
        t=row/rows;z=-1.67-.65*t;width=.91-.61*(t**3)
        for col in range(cols+1):
            u=2*col/cols-1;y=.895-.115*t*t+.018*(1-u*u)
            verts.append(game_point((width*u,y,z)))
    for row in range(rows):
        for col in range(cols):
            i=row*(cols+1)+col;faces.append((i,i+1,i+cols+2,i+cols+1))
    deck=mesh_object('Continuous rear deck',verts,faces,paint)
    for face in deck.data.polygons:face.use_smooth=True
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
    for end in [1,-1]:
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
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.data.validate(verbose=True);obj.data.update()
    out=ROOT/'public/models/solstice-lux-gt.glb';temporary=ROOT/'art/lux3d/solstice-lux-gt-export.glb'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',export_image_format='JPEG',export_image_quality=88,export_yup=True,export_apply=True,export_extras=True)
    os.replace(temporary,out);bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/lux3d/solstice-lux-gt.blend'))
    import struct
    binary=out.read_bytes();length=struct.unpack_from('<I',binary,12)[0];gltf=json.loads(binary[20:20+length])
    triangles=sum(gltf['accessors'][primitive['indices']]['count']//3 for mesh in gltf['meshes'] for primitive in mesh['primitives'])
    record={'generator':'Aholo Lux3D G1','taskId':3431485,'source':'art/lux3d/car-plated-source.glb','blender':bpy.app.version_string,'method':'Lux lower body with 12mm solid repair and exact wheel/lamp cuts; manually rebuilt shared-boundary canopy/roof/four windows/pillars; low fitted bonnet; full black wheel housings','uniformScale':scale,'triangles':triangles,'primitives':sum(len(mesh['primitives']) for mesh in gltf['meshes']),'materials':[m['name'] for m in gltf['materials']],'glbBytes':len(binary),'wheelNodes':[node for node in gltf['nodes'] if node.get('name') in ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR']],'driverHoodMaterials':['Paint','Cabin lining'],'preview':'output/car-detail/lux-continuous-{front,rear,side}.jpg'}
    (ROOT/'art/lux3d/lux-car-build.json').write_text(json.dumps(record,indent=2),encoding='utf8')
    print('CONTINUOUS_LUX_EXPORT',out.stat().st_size)

if __name__=='__main__':main()
