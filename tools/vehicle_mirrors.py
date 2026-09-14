"""Mirror assemblies in game XYZ metres; no scene clearing or export side effects.

The optical aperture and housing share the same rounded asymmetric outline.
Retains the original lateral optical centres with a shorter forward mount; the folding root lies inside the sail.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def build_mirrors(mesh, tube, box, mat):
    paint = bpy.data.materials.get('Paint') or mat('Paint', (.62, .19, .055), .62, .25)
    lower = mat('Mirror lower satin graphite', (.018, .023, .029), .28, .29)
    rubber = mat('Mirror EPDM gasket', (.009, .012, .014), 0, .58)
    glass = mat('Glass', (.66, .73, .77), .95, .075)
    indicator = mat('Mirror indicator lens', (.29, .36, .40), .25, .20)
    created = []

    def visible(obj):
        obj['driverVisibleExterior'] = True
        created.append(obj)
        return obj

    # Rounded six-corner wing outline: taller inboard, swept/clipped outer tip.
    # This deliberately avoids an ellipse and remains the single aperture datum.
    corners = [(-.119, -.034), (.088, -.044), (.129, -.013),
               (.113, .038), (-.080, .059), (-.126, .029)]
    outline = []
    for i, p in enumerate(corners):
        prev, nxt = corners[i - 1], corners[(i + 1) % len(corners)]
        a = tuple(p[k] + .22 * (prev[k] - p[k]) for k in (0, 1))
        b = tuple(p[k] + .22 * (nxt[k] - p[k]) for k in (0, 1))
        for j in range(8):
            t = j / 8
            outline.append(tuple((1-t)**2*a[k] + 2*t*(1-t)*p[k] + t*t*b[k] for k in (0, 1)))
    n = len(outline)

    for side, label in [(-1, 'right'), (1, 'left')]:
        center = Vector((side * 1.005, .992, .495))
        normal = Vector((-side * .4, .03, -.916)).normalized()
        outward = Vector((side * .916, 0, -.4)).normalized()
        vertical = normal.cross(outward).normalized()
        if vertical.y < 0:
            vertical = -vertical

        def point(a, b, d):
            return tuple(center + outward * a + vertical * b + normal * d)

        # An open optical rear and broad convex forward crown: section scale and
        # centre sweep form a wing housing, rather than a closed egg over glass.
        rings = [(0, 1, 1, 0, 0), (-.013, 1.027, 1.025, 0, .001),
                 (-.047, 1.008, 1.025, .002, .004),
                 (-.078, .925, .91, .006, .004),
                 (-.093, .73, .70, .008, .005),
                 (-.102, .37, .34, .008, .006),
                 (-.104, .10, .09, .008, .006)]
        vertices = [point(a*sx+da, b*sy+db, d)
                    for d, sx, sy, da, db in rings for a, b in outline]
        faces = []
        lower_faces = []
        for j in range(len(rings) - 1):
            for i in range(n):
                faces.append((j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i))
                # The lower moulding has its own finish but an exactly shared
                # shell boundary, with no protruding second cover.
                lower_faces.append((outline[i][1] + outline[(i+1)%n][1])/2 < -.018)
        faces.append(tuple((len(rings)-1)*n+i for i in range(n)))
        lower_faces.append(False)
        shell = visible(mesh('Mirror shell ' + label, vertices, faces, paint, None, .003))
        shell.data.materials.append(lower)
        # Bisect the actual shared shell at the moulding parting plane. A
        # material chosen by angular face index creates a visibly jagged seam.
        bm = bmesh.new()
        bm.from_mesh(shell.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-7, plane_co=Vector((0,0,.974)), plane_no=Vector((0,0,1)),
            clear_inner=False, clear_outer=False)
        for f in bm.faces:
            f.material_index = int(f.calc_center_median().z < .974)
        bm.to_mesh(shell.data)
        bm.free()
        shell.data.update()
        shell['opticalNormalGame'] = list(normal)
        shell['opticalCenterGame'] = list(center)
        shell['design'] = 'shared aperture swept upper wing and lower housing'

        # The flexible sealing lip stays outside the optical clear aperture.
        gasket = [point(a*.969, b*.950, .002) for a, b in outline]
        visible(tube('Mirror seal ' + label, gasket + gasket[:1], .0032, rubber, 6))
        lens = [point(0, .003, .005)] + [point(a*.934, b*.902, .0045) for a, b in outline]
        optical = visible(mesh('Mirror reflective lens ' + label, lens,
            [(0, i+1, (i+1)%n+1) for i in range(n)], glass, tuple(normal), .0015))
        optical['opticalNormalGame'] = list(normal)

        # A shaped, slightly convex mounting sail follows the original window
        # plane. The root is inside this triangle, not floating behind its edge.
        sail = [(side*.833, .921, .520), (side*.832, .921, .794),
                (side*.799, 1.009, .656)]
        visible(mesh('Mirror sail ' + label, sail, [(0, 1, 2)], lower, (side, 0, 0), .008))
        seal = [(x+side*.001, y, z) for x,y,z in sail]
        visible(tube('Mirror sail gasket ' + label, seal + seal[:1], .002, rubber, 6))

        # Capped elliptical section arm: continuous flared root -> folding neck
        # -> underside of housing. Coordinates never approach a wheel opening.
        stations = [(side*.817, .944, .685, .020, .025),
                    (side*.839, .945, .670, .022, .026),
                    (side*.866, .947, .651, .021, .025),
                    (side*.898, .950, .627, .019, .024),
                    (side*.932, .952, .601, .020, .027),
                    (side*.958, .953, .580, .024, .031)]
        count = 12
        av = []
        for k, (x,y,z,ry,rz) in enumerate(stations):
            for i in range(count):
                angle = 2*math.pi*i/count
                av.append((x, y+ry*math.sin(angle), z+rz*math.cos(angle)))
        af = []
        for k in range(len(stations)-1):
            for i in range(count):
                af.append((k*count+i,k*count+(i+1)%count,(k+1)*count+(i+1)%count,(k+1)*count+i))
        af += [tuple(reversed(range(count))), tuple((len(stations)-1)*count+i for i in range(count))]
        arm = visible(mesh('Mirror folding arm ' + label, av, af, lower))
        arm['mountRootGame'] = [side*.817, .944, .685]
        arm['housingJoinGame'] = [side*.958, .953, .580]
        # Fine split line on the real root articulation, rather than a block.
        fold = [(side*.853, .947+.022*math.sin(2*math.pi*i/24),
                 .660+.025*math.cos(2*math.pi*i/24)) for i in range(25)]
        visible(tube('Mirror folding joint seal ' + label, fold, .0015, rubber, 6))

        # Narrow turn-signal diffuser integrated across the forward housing.
        # Not emissive at rest and not a thick chrome decorative bar.
        pts = []
        bpy.context.view_layer.update()
        for i in range(19):
            start = point(-.088+.18*i/18, -.012, -.20)
            hit, location, surface_normal, _ = shell.ray_cast(
                Vector((start[0], -start[2], start[1])),
                Vector((normal.x, -normal.z, normal.y)))
            if not hit:
                raise ValueError('Mirror indicator does not lie on its housing')
            mounted = location + surface_normal * .0011
            pts.append((mounted.x, mounted.z, -mounted.y))
        visible(tube('Mirror indicator ' + label, pts, .0015, indicator, 6))

        # Coalesce same-finish trim without changing optical mesh or housing.
        for material, prefix in [(lower, 'Mirror trim '), (rubber, 'Mirror rubber trim ')]:
            trim = [o for o in created if o.name.endswith(label) and o != shell and o != optical
                    and len(o.data.materials) == 1 and o.data.materials[0] == material]
            if len(trim) < 2:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in trim:
                o.select_set(True)
                created.remove(o)
            bpy.context.view_layer.objects.active = trim[0]
            bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = prefix + label
            joined['driverVisibleExterior'] = True
            joined['mountRootGame'] = [side*.817, .944, .685]
            joined['housingJoinGame'] = [side*.958, .953, .580]
            created.append(joined)

    return created
