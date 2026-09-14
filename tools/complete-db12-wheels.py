"""Complete the downloaded DB12 wheel set without reshaping the source vehicle.
Run with Blender --background --python tools/complete-db12-wheels.py.
The original downloaded FBX is never overwritten. Existing missing textures are
recorded, not silently treated as repaired. Output is a Blender source asset.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('C:/Users/lgian/Downloads/aston-martin-db12/source/aston martin db12/aston martin db12/Untitled.fbx')
OUT=ROOT/'art/db12';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(SOURCE))
arm=bpy.data.objects['astdb12']
source=bpy.data.objects['wheel_lf.child']
original_matrix=source.matrix_world.copy()
original_mesh_count=sum(o.type=='MESH' for o in bpy.context.scene.objects)
# Bake the tiny source orientation into shared local coordinates once. All wheel
# transforms stay proper rotations, never negative scale / inverted normals.
mesh=source.data.copy();mesh.name='DB12 shared tire and rim'
mesh.transform(original_matrix.to_3x3().to_4x4())
source.data=mesh
wheels=[]
for slot in ['lf','rf','lr','rr']:
 center=arm.matrix_world@arm.data.bones['wheel_'+slot].head_local
 wheel=source if slot=='lf' else bpy.data.objects.new('Wheel_'+slot,mesh)
 if slot!='lf':bpy.context.scene.collection.objects.link(wheel)
 wheel.name='Wheel_'+slot
 wheel.parent=arm
 wheel.matrix_parent_inverse=arm.matrix_world.inverted()
 wheel.matrix_world=Matrix.Translation(center)@Matrix.Rotation(math.pi if slot[0]=='r' else 0,4,'Z')
 wheel['db12_wheel_slot']=slot
 wheel['source']='Untitled.fbx / wheel_lf.child'
 wheel['local_spin_axis']='X'
 wheel['local_outboard_axis']='-X'
 wheel['front_steering']=slot.endswith('f')
 wheels.append(wheel)
bpy.context.view_layer.update()
rows=[]
for w in wheels:
 center=arm.matrix_world@arm.data.bones['wheel_'+w['db12_wheel_slot']].head_local
 assert (w.matrix_world.translation-center).length<1e-6
 assert w.matrix_world.to_3x3().determinant()>0.999
 outward=w.matrix_world.to_3x3()@Vector((-1,0,0))
 assert outward.x*(-1 if w['db12_wheel_slot'][0]=='l' else 1)>.999
 pts=[w.matrix_world@Vector(p) for p in w.bound_box]
 rows.append(dict(name=w.name,anchor=list(center),dimensions=list(w.dimensions),outward=list(outward),bottom=min(p.z for p in pts)))
assert len(wheels)==4 and len({w.data.as_pointer() for w in wheels})==1
assert sum(o.type=='MESH' for o in bpy.context.scene.objects)==original_mesh_count+3
missing=[];packed=0
for img in bpy.data.images:
 if not img.filepath:continue
 if Path(bpy.path.abspath(img.filepath)).is_file():
  img.pack();packed+=1
 else:missing.append(img.name)
report=dict(source=str(SOURCE),wheelCount=4,sharedMesh=True,addedWheelMeshes=3,sourceWheelDimensions=list(source.dimensions),wheels=rows,packedImages=packed,unresolvedSourceTextures=missing,scope='Wheel completion only; materials and game integration pending')
(OUT/'wheel-completion.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'db12-four-wheels.blend'))
print('WHEEL_COMPLETION',json.dumps(report))
