"""DB12 rear lamp covers must not share the tinted cabin window material."""
import bpy

def repair_db12_lenses(objects):
    lens=bpy.data.materials.new('DB12 clear lamp lens');lens.use_nodes=True
    p=next(n for n in lens.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(.75,.78,.8,1)
    p.inputs['Alpha'].default_value=.035
    p.inputs['Roughness'].default_value=.14
    p.inputs['Metallic'].default_value=0
    lens.surface_render_method='DITHERED'
    lens['vehicleLampLens']=True
    changed=[]
    diffusers=set()
    for o in objects:
        if o.type!='MESH':continue
        for mat in o.data.materials:
            if mat and mat.get('vehicleLightRole') in {'combined','brake'}:
                bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                bs.inputs['Specular IOR Level'].default_value=0
                bs.inputs['Metallic'].default_value=0
                bs.inputs['Roughness'].default_value=.5
                mat['vehicleLightDiffuser']=True
                diffusers.add(mat.name)
    for o in objects:
        if o.type!='MESH' or o.name not in {'misc_a','misc_b','misc_c','misc_m','misc_n'}:continue
        o.data.materials.clear();o.data.materials.append(lens)
        for f in o.data.polygons:f.material_index=0
        o['vehicleLampLens']=True
        changed.append(o.name)
    return {'separateLampCovers':changed,'alpha':.035,'keepOriginalLensGeometry':True,'noSpecularDiffusers':sorted(diffusers)}
