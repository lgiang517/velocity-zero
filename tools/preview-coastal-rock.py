import bpy
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'art/lux3d/coastal-rock-lods.blend'))
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  hidden=obj.name!='CoastalRock_LOD0';obj.hide_render=hidden;obj.hide_set(hidden)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'art/lux3d/coastal-rock-lods.blend'))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Coastal studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.19,.23,.27,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.15));floor=bpy.context.object
mat=bpy.data.materials.new('Preview floor');mat.diffuse_color=(.075,.09,.1,1);floor.data.materials.append(mat)
bpy.ops.object.light_add(type='AREA',location=(4,-8,16));light=bpy.context.object;light.data.energy=2100;light.data.shape='DISK';light.data.size=9;light.rotation_euler=(Vector((0,0,4))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='SUN',location=(-8,8,15));sun=bpy.context.object;sun.data.energy=2.3;sun.data.angle=.08;sun.rotation_euler=(Vector((0,0,3))-sun.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(18,-24,14));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,4.0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=49;scene.camera=cam
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=91
scene.render.filepath=str(root/'output/playwright/lux-rock-blender.jpg')
bpy.ops.render.render(write_still=True)
