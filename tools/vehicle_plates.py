"""Rebuild one physically mounted front/rear registration plate per car.
Run after body transforms/material conversion, before GLB export. Source files
are untouched. Lettering is geometry: source atlas UVs cannot corrupt the text.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
LABELS = {'aston-db12': 'VZ-DB12', 'ferrari-gtc4lusso': 'VZ-GTC4', 'ferrari-812-competizione': 'VZ-0812'}


def _material(name, color, metallic=0, roughness=.4):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m


def _plate_material(m):
    return m and any(t in m.name.lower() for t in ['license plate', 'licenseplate', 'licensplate', 'gb_plate', 'manufacturerplate'])


def _source_plate(o):
    return o.type == 'MESH' and (o.name.startswith(('LicensePlate_', 'ManufacturerPlate_')) or o.name == 'Front plate' or 'licensplate' in o.name.lower() or any(_plate_material(m) for m in o.data.materials))


def _basis(sign, nz=0):
    n = Vector((0, sign, nz)).normalized(); u = Vector((-sign, 0, 0)); v = n.cross(u).normalized()
    return u, v, n


def _source_anchor(o, sign):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    fs = [p for p in o.data.polygons if (o.matrix_world.to_3x3() @ p.normal).y * sign > .8]
    fs.sort(key=lambda p: p.area, reverse=True)
    selected = fs[:max(2, min(8, len(fs)))]
    normal = sum(((o.matrix_world.to_3x3() @ p.normal) * p.area for p in selected), Vector())
    nz = normal.z / abs(normal.y) if abs(normal.y) > 1e-6 else 0
    u, v, n = _basis(sign, nz)
    uc = (max(p.dot(u) for p in pts) + min(p.dot(u) for p in pts)) / 2
    vc = (max(p.dot(v) for p in pts) + min(p.dot(v) for p in pts)) / 2
    # Frame back sits inside the old plate thickness; face is 3 mm beyond it.
    depth = max(p.dot(n) for p in pts) - .009
    return dict(center=u*uc + v*vc + n*depth, sign=sign, nz=nz,
                width=max(p.dot(u) for p in pts)-min(p.dot(u) for p in pts),
                height=max(p.dot(v) for p in pts)-min(p.dot(v) for p in pts),
                source=o.name, basis=(u,v,n))


def _body_trees(objects):
    trees=[]
    for o in objects:
        if o.type!='MESH' or o.name.startswith(('Wheel_', 'Caliper_', 'SteeringWheel')):continue
        pts=[o.matrix_world @ v.co for v in o.data.vertices]
        trees.append((o.name, BVHTree.FromPolygons(pts,[list(p.vertices) for p in o.data.polygons])))
    return trees


def _front_hit(trees,x,z):
    hits=[]
    for name,tree in trees:
        loc,n,index,d = tree.ray_cast(Vector((x,-4,z)),Vector((0,1,0)),3)
        if loc is not None:hits.append((d,name,loc))
    if not hits:raise RuntimeError('No front bumper geometry under plate mount')
    return min(hits,key=lambda h:h[0])


def _front_anchor(trees,asset):
    # Both source cars lack a physical front registration mount. Use measured
    # bumper/grille samples over the complete new plate footprint, then make
    # two mounting pads that end at the actual body surface.
    w,h,z,nz = (.36,.105,.445,-.16) if asset=='ferrari-gtc4lusso' else (.31,.105,.245,-.20)
    u,v,n = _basis(-1,nz); center=Vector((0,0,z)); samples=[]
    for x in [-w/2, -w/4,0,w/4,w/2]:
        for dz in [-h/2,0,h/2]:
            _,name,loc=_front_hit(trees,x,z+dz)
            samples.append((name,loc))
    # Exactly 2 mm minimum gap between frame back and sampled bumper plane.
    d=max(p.dot(n) for _,p in samples)+.002
    center.y=(d-center.z*n.z)/n.y
    return dict(center=center,sign=-1,nz=nz,width=w,height=h,source='bumper raycast',basis=(u,v,n),samples=samples)


def _mesh_box(name,center,basis,w,h,depth,mat,objects):
    u,v,n=basis
    if depth < 0:
        center=center+n*depth;depth=-depth
    verts=[center+u*x+v*y+n*z for z in [0,depth] for y in [-h/2,h/2] for x in [-w/2,w/2]]
    faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o);objects.append(o)
    return o


def _lettering(name,label,center,basis,w,h,mat,objects):
    curve=bpy.data.curves.new(name,'FONT');curve.body=label;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=1;curve.extrude=.0002;curve.resolution_u=2
    fontpath=Path('C:/Windows/Fonts/arialbd.ttf')
    if fontpath.exists():curve.font=bpy.data.fonts.load(str(fontpath),check_existing=True)
    obj=bpy.data.objects.new(name,curve);bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    scale=min(w*.85/max(obj.dimensions.x,1e-6),h*.60/max(obj.dimensions.y,1e-6))
    graph=bpy.context.evaluated_depsgraph_get();mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
    u,v,n=basis
    for vert in mesh.vertices:
        p=vert.co.copy();vert.co=center+u*(p.x*scale)+v*(p.y*scale)+n*p.z
    bpy.data.objects.remove(obj,do_unlink=True)
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);mesh.materials.append(mat);objects.append(obj)
    return obj


def repair_plates(objects,asset):
    if asset not in LABELS:raise ValueError(asset)
    bpy.context.view_layer.update()
    old=[o for o in objects if _source_plate(o)]
    if not old:raise RuntimeError(f'{asset}: original plates missing; refuse unanchored replacement')
    anchors=[]
    if asset=='aston-db12':
        for name,sign in [('extra_5',-1),('extra_4',1)]:
            o=next(o for o in old if o.name==name);anchors.append(_source_anchor(o,sign))
    else:
        rear=next(o for o in old if ('licensplate' in o.name.lower() if asset=='ferrari-gtc4lusso' else o.name.startswith('LicensePlate_')))
        anchors.append(_source_anchor(rear,1))
    removed=[]
    for o in old:
        indices={i for i,m in enumerate(o.data.materials) if _plate_material(m)}
        faces=[p for p in o.data.polygons if p.material_index in indices]
        # Known plate-only objects have only plate surfaces. For a future
        # composite mesh remove matching faces only, never adjacent body faces.
        if len(faces)==len(o.data.polygons) or o.name.startswith(('LicensePlate_','ManufacturerPlate_')) or o.name=='Front plate':
            removed.append(dict(name=o.name,faces=len(o.data.polygons),operation='remove plate-only object'))
            objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)
        else:
            bm=bmesh.new();bm.from_mesh(o.data);targets=[f for f in bm.faces if f.material_index in indices]
            removed.append(dict(name=o.name,faces=len(targets),operation='remove plate material faces only'))
            bmesh.ops.delete(bm,geom=targets,context='FACES');bm.to_mesh(o.data);bm.free()
    trees=_body_trees(objects)
    if asset!='aston-db12':anchors.insert(0,_front_anchor(trees,asset))
    dark=_material('Registration frame',(.018,.021,.025),.25,.42)
    white=_material('Registration reflective base',(.88,.90,.86),.05,.36)
    ink=_material('Registration black letters',(.009,.012,.016),0,.48)
    report=dict(asset=asset,label=LABELS[asset],removed=removed,plates=[])
    for a in anchors:
        side='front' if a['sign']<0 else 'rear';name='LicensePlate_'+side
        center=a['center'];u,v,n=a['basis'];w=a['width'];h=a['height']
        frame=_mesh_box(name+'_frame',center,a['basis'],w,h,.009,dark,objects)
        frame['plateSide']=side;frame['plateRole']='frame'
        face=_mesh_box(name+'_face',center+n*.009,a['basis'],w-.009,h-.009,.003,white,objects)
        face['plateSide']=side;face['plateRole']='face';face['registration']=LABELS[asset]
        text=_lettering(name+'_text',LABELS[asset],center+n*.0125,a['basis'],w-.01,h-.01,ink,objects)
        text['plateSide']=side;text['plateRole']='text';text['registration']=LABELS[asset]
        mounts=[]
        if 'samples' in a or (asset=='aston-db12' and side=='front'):
            spread=.035 if asset=='aston-db12' else w*.28
            for x in [-spread,spread]:
                _,hitname,hit=_front_hit(trees,x,center.z)
                start=Vector((x,center.y,center.z));depth=(hit-start).dot(-n)
                if depth>.001:
                    _mesh_box(name+'_mount_'+str(len(mounts)),start,a['basis'],.022,h*.45,-depth-.002,dark,objects)
                    mounts.append(dict(body=hitname,depth=round(depth,5)))
        report['plates'].append(dict(side=side,anchorSource=a['source'],frameBack=[round(x,6) for x in center],normal=[round(x,6) for x in n],width=round(w,6),height=round(h,6),totalThickness=.0125,mounts=mounts,textMode='independent black mesh; no reused atlas UV'))
    dest=ROOT/'output/plate-repair';dest.mkdir(parents=True,exist_ok=True)
    (dest/(asset+'-plates.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report
