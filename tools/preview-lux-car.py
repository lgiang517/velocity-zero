import bpy,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'art/lux3d/solstice-lux-gt.blend'))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=800;scene.render.resolution_y=500;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Review studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.28,.32,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
bpy.ops.mesh.primitive_plane_add(size=40);floor=bpy.context.object;floor.location.z=-.015
mat=bpy.data.materials.new('Review floor');mat.diffuse_color=(.08,.09,.10,1);floor.data.materials.append(mat)
center=Vector((0,0,.7))
for position,power,size in [((3,-4,6),1500,5),((-4,-2,3),1000,4),((2,5,5),1500,4)]:
 bpy.ops.object.light_add(type='AREA',location=position);obj=bpy.context.object;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.lens=48
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=88
for label,position in [('front',(5,-7,3.2)),('rear',(-5,7,3)),('side',(8,0,2.3))]:
 cam.location=position;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(root/f'output/car-detail/lux-continuous-{label}.jpg');bpy.ops.render.render(write_still=True)
