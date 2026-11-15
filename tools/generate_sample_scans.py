"""Generate labeled SIMULATED ocular ultrasound sample scans with known ONSD.
Usage: python generate_sample_scans.py <onsd_mm> <seed> <out.png>
Scale: 0.04 mm/px, depth 40 mm. Written with AI assistance (Claude)."""
import numpy as np, sys
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
ONSD=float(sys.argv[1]); seed=int(sys.argv[2]); out=sys.argv[3]
rng=np.random.default_rng(seed)
MMPX=0.04; Wmm,Dmm=38.0,40.0; W,H=int(Wmm/MMPX),int(Dmm/MMPX)
x=(np.arange(W)*MMPX-Wmm/2)[None,:].repeat(H,0); z=(np.arange(H)*MMPX)[:,None].repeat(W,1)
def lowfreq(sig,amp): n=gaussian_filter(rng.normal(size=(H,W)),sig); return 1+amp*n/n.std()
def streak(): n=gaussian_filter(rng.normal(size=(H,W)),(0.15/MMPX,1.2/MMPX)); return n/n.std()
R=0.45*lowfreq(15,0.3)
R[z<0.5]=1.2; lidband=(z>0.5)&(z<3.2); R[lidband]=0.55*lowfreq(6,0.4)[lidband]
gc,gr=15.0,11.8; rr=np.sqrt(x**2+(z-gc)**2); ang=np.arctan2(z-gc,x)
globe=rr<gr; R[globe]=0.0004
# angle-dependent specular wall: bright where normal || beam (vertical)
spec=np.abs(np.sin(ang))**3
wall=(rr>=gr-0.2)&(rr<gr+0.9)
R[wall]=np.maximum(R[wall],(0.4+5.0*spec[wall])*lowfreq(4,0.3)[wall])
# lens: faint posterior capsule only, iris lines
lc=gc-gr+4.5; le=np.sqrt((x/4.6)**2+((z-lc)/2.0)**2)
# retrobulbar fat: bright heterogeneous with lateral streaks, cone
post=(z>gc)&(rr>=gr+0.9)
cone=post&(np.abs(x)<(3+0.75*(z-gc)))
fat=(1.8*lowfreq(8,0.35)*(1+0.35*streak())).clip(0.2,None)
R[cone]=fat[cone]
for s in (-1,1):
    mx=s*(9.5+0.45*(z-gc)); musc=post&(np.abs(x-mx)<1.8+0.05*(z-gc))&(z>gc+5); R[musc]=0.18*lowfreq(5,0.3)[musc]
# optic nerve with irregular edges, slight curve; truth at dz=3 mm
z0=gc+gr+0.9; dz=z-z0
wob=gaussian_filter(rng.normal(size=H),0.8/MMPX); wob=wob/np.abs(wob).max()*0.12
zi=(np.arange(H)*MMPX)-z0
wob=wob*np.clip(np.abs(zi-3)/1.0,0,1)          # no wobble at 3 mm
cx=0.25*np.clip(zi-3,0,None)**1.3*0.05          # slight curve deeper
half1=ONSD/2*(1+0.05*np.exp(-((zi-2.5)/3)**2))/(1+0.05*np.exp(-((3-2.5)/3)**2)) - 0.015*np.clip(zi-3,0,None)
half=(half1+wob)[:,None]; xc=x-cx[:,None]
inner=(dz>-0.4)&(np.abs(xc)<half)
edge=np.clip((half-np.abs(xc))/0.10+0.5,0,1)*(dz>-0.4)
nerve_R=np.where(np.abs(xc)<1.5,0.035,0.06)*(1+0.6*np.abs(streak()))
R=R*(1-edge)+edge*nerve_R
dura=(dz>0.2)&(np.abs(np.abs(xc)-half-0.3)<0.3); R[dura]=np.maximum(R[dura],(1.6*lowfreq(3,0.3))[dura])
# speckle
sc=(rng.normal(size=(H,W))+1j*rng.normal(size=(H,W)))*np.sqrt(np.clip(R,0,None))
pa,pl=0.07/MMPX,0.16/MMPX
env=np.abs(gaussian_filter(sc.real,(pa,pl))+1j*gaussian_filter(sc.imag,(pa,pl)))
# attenuation, slight shadow under nerve, lateral vignette, near-field reverb
att=np.exp(-0.045*z)*(1+0.35*np.clip((z-12)/25,0,1))
shadow=1-0.25*np.clip((z-z0-6)/10,0,1)*(np.abs(x)<3)
vig=1-0.35*(np.abs(x)/(Wmm/2))**3
env=env*att*shadow*vig
env[z<0.3]*=2.5
img=20*np.log10(env/np.percentile(env,99.9)+1e-7)
img=np.clip((img+46)/46,0,1)**1.15*240
img=gaussian_filter(img,0.6).astype(np.uint8)
M_r,M_t,M_b,M_l=90,40,80,40
C=Image.new('RGB',(W+M_l+M_r,H+M_t+M_b),(0,0,0)); C.paste(Image.fromarray(img).convert('RGB'),(M_l,M_t))
d=ImageDraw.Draw(C); F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22); Fb=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
X=M_l+W+10
for mm in range(0,int(Dmm)+1):
    y=M_t+int(mm/MMPX); L=18 if mm%10==0 else (11 if mm%5==0 else 5)
    d.line([(X,y),(X+L,y)],fill=(200,210,220),width=2)
    if mm%10==0: d.text((X+24,y-12),str(mm//10),font=F,fill=(200,210,220))
d.text((X+16,M_t+H+6),'cm',font=F,fill=(200,210,220))
d.text((M_l,8),'L12 linear  ·  Ocular  ·  MI 0.2',font=F,fill=(150,165,180))
d.text((M_l,M_t+H+10),'SIMULATED ultrasound (code-generated, AeroSANS) - not a real scan',font=Fb,fill=(255,215,0))
d.text((M_l,M_t+H+44),f'Ground-truth ONSD {ONSD:.1f} mm (3 mm behind globe) | 1 tick = 1 mm',font=F,fill=(170,180,190))
C.save(out); print(out,C.size,'globe pole y px',M_t+int((gc+gr)/MMPX),'x',M_l+W//2)
