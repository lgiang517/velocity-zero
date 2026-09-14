"""Small, continuous fastback update for the retained Aholo canopy.

Call ``modernize_canopy()`` once immediately after importing/filtering the stable
package. This module does not clear scenes, create materials, export files or touch
body panels / wheels / cabin parts. All coordinates are vehicle-local game XYZ.

The front cabin (z >= -.4), the full rear-window lower row (z == -1.70), and the
side-glass lower belt (y == .92) are fixed. A single C1 displacement field is used
for rear roof, both side panels, rear window, seals and demister lines. Existing
corner normals are transformed with the field's inverse-transpose Jacobian;
material boundaries and existing sharp/smooth decisions are preserved.
"""
import math

START_Z = -.40
END_Z = -1.70
BELT_Y = .92
HEIGHT = .45
ROOF_DROP = .050
C_PILLAR_BULGE = .046
TOP_TUCK = .025
_NAMES = ('Unified canopy roof', 'Window rear', 'Window left', 'Window right',
          'Rear glass ', 'Brake_high')


def canopy_point(point, strength=1.0):
    """Return a game-XYZ point; exact identity outside the rear-canopy region."""
    x, y, z = point
    if z >= START_Z or z <= END_Z or y <= BELT_Y:
        return (x, y, z)
    t = (START_Z-z)/(START_Z-END_Z)
    weight = math.sin(math.pi*t)**2
    h = max(0., min(1., (y-BELT_Y)/HEIGHT))
    # Soft lower return, a subtly narrower upper rail, and a falling rear roof.
    u = min(1., abs(x)/.60)
    lateral = u*u*(3-2*u)
    height_envelope = h*h*(3-2*h)
    dx = (C_PILLAR_BULGE*math.sin(math.pi*h)**2-TOP_TUCK*height_envelope)*weight*lateral
    dy = -ROOF_DROP*weight*height_envelope
    return (x+(1 if x >= 0 else -1)*dx*strength, y+dy*strength, z)


def modernize_canopy(objects=None, strength=1.0):
    """Modify selected imported objects in place and return measured audit facts.

    Objects with the ``modernGtCanopy`` flag are skipped, making accidental repeat
    calls safe. Call before exporting assembly extras. Existing rearWindowLower
    metadata remains valid because the whole source row is unchanged exactly.
    """
    if not 0 <= strength <= 1.25:
        raise ValueError('Canopy strength must be between 0 and 1.25')
    import bpy
    from mathutils import Vector, Matrix
    bpy.context.view_layer.update()
    objects = list(objects if objects is not None else bpy.context.scene.objects)
    selected = [o for o in objects if o.type == 'MESH' and
                any(o.name == n or o.name.startswith(n) for n in _NAMES)]
    record = {'version': 1, 'strength': strength, 'objects': [], 'movedVertices': 0,
              'addedTriangles': 0, 'addedPrimitives': 0,
              'fixedFrontMaxDisplacementM': 0., 'fixedRearRowMaxDisplacementM': 0.,
              'fixedBeltMaxDisplacementM': 0., 'maxDisplacementM': 0.,
              'minJacobianDeterminant': 1.,
              'sourceWindowLowerUnchanged': True}
    to_game = lambda p: Vector((p[0], p[2], -p[1]))
    to_blender = lambda p: Vector((p[0], -p[2], p[1]))
    eps = 1e-5
    for obj in selected:
        if obj.get('modernGtCanopy'):
            continue
        data = obj.data
        world = obj.matrix_world.copy()
        inverse = world.inverted()
        normal_to_world = world.to_3x3().inverted().transposed()
        normal_to_local = world.to_3x3().transposed()
        old_normals = [n.vector.copy() for n in data.corner_normals]
        transforms = []
        moved = 0
        maximum = 0.
        for vertex in data.vertices:
            p = to_game(world @ vertex.co)
            q = Vector(canopy_point(p, strength))
            distance = (q-p).length
            maximum = max(maximum, distance)
            if distance > 1e-10:
                moved += 1
                columns = []
                for axis in range(3):
                    a, b = p.copy(), p.copy()
                    a[axis] += eps
                    b[axis] -= eps
                    columns.append((Vector(canopy_point(a, strength))-
                                    Vector(canopy_point(b, strength)))/(2*eps))
                jacobian = Matrix(columns).transposed()
                record['minJacobianDeterminant'] = min(record['minJacobianDeterminant'],
                                                       jacobian.determinant())
                transforms.append(jacobian.inverted().transposed())
                vertex.co = inverse @ to_blender(q)
            else:
                transforms.append(None)
            if p.z >= START_Z:
                record['fixedFrontMaxDisplacementM'] = max(record['fixedFrontMaxDisplacementM'], distance)
            if abs(p.z-END_Z) < 1e-6:
                record['fixedRearRowMaxDisplacementM'] = max(record['fixedRearRowMaxDisplacementM'], distance)
            if abs(p.y-BELT_Y) < 1e-6:
                record['fixedBeltMaxDisplacementM'] = max(record['fixedBeltMaxDisplacementM'], distance)
        if moved:
            normals = []
            for loop, normal in zip(data.loops, old_normals):
                transform = transforms[loop.vertex_index]
                if transform is None:
                    normals.append(normal)
                else:
                    game_normal = to_game(normal_to_world @ normal)
                    transformed = to_blender((transform @ game_normal).normalized())
                    normals.append((normal_to_local @ transformed).normalized())
            data.normals_split_custom_set(normals)
            data.update()
        obj['modernGtCanopy'] = {'version': 1, 'strength': strength}
        record['objects'].append({'name': obj.name, 'vertices': len(data.vertices),
                                  'movedVertices': moved, 'maxDisplacementM': maximum})
        record['movedVertices'] += moved
        record['maxDisplacementM'] = max(record['maxDisplacementM'], maximum)
    if record['minJacobianDeterminant'] <= 0:
        raise RuntimeError('Canopy deformation folded the source surface')
    return record
