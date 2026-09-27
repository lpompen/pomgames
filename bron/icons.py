from PIL import Image, ImageDraw, ImageFont
BG=(21,15,38); CORAL=(255,107,91); YEL=(255,194,61); INK=(29,21,51)
import os as _o
F=_o.path.join(_o.path.dirname(_o.path.abspath(__file__)),'fonts','Bungee-Regular.ttf')
def shade(c,k): return tuple(int(x*k) for x in c)
def tile(size, color, letter, angle):
    w=size; h=int(size*1.08); t=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(t); r=int(size*0.24)
    d.rounded_rectangle([0,0,w-1,h-1],r,fill=shade(color,0.78))
    d.rounded_rectangle([0,0,w-1,int(h*0.9)],r,fill=color)
    f=ImageFont.truetype(F,int(size*0.76))
    bb=d.textbbox((0,0),letter,font=f); tw,th=bb[2]-bb[0],bb[3]-bb[1]
    d.text(((w-tw)/2-bb[0],(h*0.9-th)/2-bb[1]),letter,font=f,fill=INK)
    return t.rotate(angle,resample=Image.BICUBIC,expand=True)
def icon(S, pad):
    im=Image.new('RGBA',(S,S),BG+(255,)); inner=S*(1-2*pad); ts=int(inner*0.46)
    p=tile(ts,CORAL,'P',5); g=tile(ts,YEL,'G',-4); gap=int(inner*0.02)
    total=p.width+g.width+gap; x0=int((S-total)/2); y0=int((S-p.height)/2)
    im.alpha_composite(p,(x0,y0-int(ts*0.05))); im.alpha_composite(g,(x0+p.width+gap,y0+int(ts*0.07)))
    return im
import os
HERE=os.path.dirname(os.path.abspath(__file__))
OUTDIR=os.environ.get('PG_OUT') or (os.path.dirname(HERE) if os.path.basename(HERE)=='bron' else os.path.join(HERE,'out','pomgames'))
out=os.path.join(OUTDIR,'icons')+'/'
icon(512,0.07).save(out+'icon-512.png')
icon(512,0.07).resize((192,192),Image.LANCZOS).save(out+'icon-192.png')
icon(512,0.19).save(out+'icon-maskable-512.png')
icon(512,0.09).resize((180,180),Image.LANCZOS).convert('RGB').save(out+'apple-touch-icon.png')
b=Image.new('RGBA',(96,96),(0,0,0,0)); d=ImageDraw.Draw(b); f=ImageFont.truetype(F,50)
bb=d.textbbox((0,0),'PG',font=f); d.text(((96-(bb[2]-bb[0]))/2-bb[0],(96-(bb[3]-bb[1]))/2-bb[1]),'PG',font=f,fill=(255,255,255,255))
b.save(out+'badge-96.png'); print('ok')
