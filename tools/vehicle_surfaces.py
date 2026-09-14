"""Shared outer-skin geometry in vehicle-local metres, independent of Blender.

Every panel uses these same sections and the same rounded rear transformation.
The source-coordinate boundary is shared before any physical panel separation.
"""
import math


def smooth(t):
    t = min(1., max(0., t))
    return t*t*(3-2*t)


def raw_width(z):
    return (1.01 + .068*math.exp(-((z+1.35)/.62)**2)
            + .022*math.exp(-((z-1.35)/.55)**2)
            - .035*math.exp(-(z/.68)**2)
            - .030*smooth((abs(z)-2.10)/.20))


def width(z):
    if z>=-2.08:return raw_width(z)
    t=min(1.,max(0.,(-z-2.08)/.22))
    w0=raw_width(-2.08);e=1e-5
    m0=-.22*(raw_width(-2.08+e)-raw_width(-2.08-e))/(2*e)
    return (2*t**3-3*t*t+1)*w0+(t**3-2*t*t+t)*m0+(-2*t**3+3*t*t)*.965


def cabwidth(z):
    return .84-(z+1.7)/2.5*.01


def crown(z):
    if z <= -1.7:
        return .955-.070*smooth((-1.7-z)/.42)+.022*smooth((-z-2.13)/.17)
    if z <= .8:
        return .955
    return .955-.18*((z-.8)/1.5)**1.55


def shoulder_height(z):
    return crown(z)-.155


def side_x(y,z):
    u=(y-.205)/(shoulder_height(z)-.205)
    waist=.055*math.exp(-((u-.40)/.23)**2)*math.exp(-((z+.16)/1.08)**4)
    lower_tuck=.052*(1-smooth((y-.205)/.28))*smooth((-z-1.72)/.40)
    return width(z)-.085*(1-u)**2+.023*math.sin(math.pi*u)-waist-lower_tuck


def shoulder_x(t,z):
    w=cabwidth(max(-1.7,min(.8,z)));outer=width(z);end=shoulder_height(z)
    p1=w+min(.065,(outer-w)*.40);p2=outer-.055*.023*math.pi/(end-.205);a=1-t
    return a*a*a*w+3*a*a*t*p1+3*a*t*t*p2+t*t*t*outer


def top(x,z):
    a=abs(x); w=cabwidth(max(-1.7,min(.8,z))); base=crown(z)
    if a<=w:
        return base-.035*(a/w)**2
    outer=width(z); y0=base-.035; end=shoulder_height(z)
    if a>outer:return end-(a-outer)*(end-.205)/(.023*math.pi)
    # The first tangent matches the canopy boundary; the final tangent matches
    # side_x at its top. This is a shaped shoulder, not two touching flat skins.
    p0=(w,y0)
    p1=(w+min(.065,(outer-w)*.40),y0)
    p1=(p1[0],y0-(p1[0]-w)*.070/w)
    p2=(outer-.055*.023*math.pi/(end-.205),end+.055)
    p3=(outer,end)
    def bez(t,k):
        s=1-t
        return s*s*s*p0[k]+3*s*s*t*p1[k]+3*s*t*t*p2[k]+t*t*t*p3[k]
    lo=0.; hi=1.
    for _ in range(28):
        t=(lo+hi)/2
        if bez(t,0)<a: lo=t
        else: hi=t
    t=(lo+hi)/2
    # Broad rear haunch: endpoint value and tangent remain common with the side.
    haunch=.048*math.exp(-((z+1.30)/.64)**2)*smooth((z+1.70)/.30)*16*t*t*(1-t)*(1-t)
    return bez(t,1)+haunch


def rear_contour(x,y):
    # A restrained bumper crown, formed plate pocket and tucked lower valance.
    crown=-.028*math.exp(-((y-.55)/.16)**2)*(1-.6*(x/1.15)**2)
    pocket=.042*math.exp(-(x/.305)**8-((y-.535)/.090)**8)
    tuck=.13*smooth((.49-y)/.285)*(1-.20*(x/1.05)**4)
    # Retract the corner bumper beneath the muscular quarter and the lamp shelf.
    corner=.050*math.exp(-((abs(x)-.73)/.22)**4-((y-.50)/.20)**4)
    return crown+pocket+tuck+corner


def deform(p):
    """One common deformation for skin and attachments; source Z is forward."""
    x,y,z=p
    if z>1.90:
        t=(z-1.90)/.40
        z-=.18*smooth(t)*(abs(x)/1.04)**2+.045*smooth(t)*max(0,(.42-y)/.22)**2
        return x,y,z
    if z>=-2.08:
        return x,y,z
    raw_z=z; raw_y=y
    # Round the top-to-rear edge, preserving a common terminal curve. Squircle
    # mapping turns the two rectangle edges into a tangent-continuous ellipse.
    ry=.065; rz=.10; upper=top(x,max(-2.30,z))
    q=max(0.,min(1.,(y-upper+ry)/ry))
    s=max(0.,min(1.,(-z-2.20)/rz))
    if q>0 and s>0:
        y=upper-ry+ry*q*math.sqrt(1-.5*s*s)
        z=-2.20-rz*s*math.sqrt(1-.5*q*q)+min(0.,raw_z+2.30)
    # Plan-view rear corners use the SAME map on upper, side and rear skins.
    radius=.22; outer=side_x(y,max(-2.30,z)); a=abs(x)
    p=max(0.,min(1.,(a-outer+radius)/radius))
    s=max(0.,min(1.,(-z-2.08)/radius))
    if p>0 and s>0:
        a=outer-radius+radius*p*math.sqrt(1-.5*s*s)
        z=-2.08-radius*s*math.sqrt(1-.5*p*p)+min(0.,z+2.30)
        x=math.copysign(a,x)
    z+=rear_contour(x,y)*smooth((-z-2.08)/.18)
    return x,y,z


def top_point(x,z):
    return deform((x,top(x,z),z))


def side_point(y,z,sign):
    return deform((sign*side_x(y,z),y,z))


def back_point(x,y):
    return deform((x,y,-2.30))


def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])


def difference(a,b):
    return tuple(x-y for x,y in zip(a,b))


def surface_normal(fun,u,v,orient):
    e=1e-5
    n=cross(difference(fun(u+e,v),fun(u-e,v)),difference(fun(u,v+e),fun(u,v-e)))
    length=math.sqrt(sum(a*a for a in n))
    if length<1e-12:return orient
    n=tuple(a/length for a in n)
    if sum(a*b for a,b in zip(n,orient))<0:n=tuple(-a for a in n)
    return n


# Exact shared longitudinal edge samples, with more points at the rear corner.
REAR_Z=[-2.30+.60*(i/40)**2 for i in range(41)]
CABIN_Z=[-1.70+2.50*i/80 for i in range(81)]
FRONT_Z=[.80+1.50*i/50 for i in range(51)]
SIDE_Z=REAR_Z+CABIN_Z[1:]+FRONT_Z[1:]


def station(values,t):
    return values[min(len(values)-1,round(t*(len(values)-1)))]
