from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys
FONT='/home/claude/fonts/src/fonts/ttf/InstrumentSerif-Italic.ttf'
S=4; W=1024*S
def icon(bg, ink, hot, rule, out, shadow):
    img=Image.new('RGBA',(W,W),(0,0,0,0))
    # macOS icon grid: 824px body, centered, ~185px corner radius
    m=100*S; r=185*S
    if shadow:
        sh=Image.new('RGBA',(W,W),(0,0,0,0)); d=ImageDraw.Draw(sh)
        d.rounded_rectangle([m,m+12*S,W-m,W-m+12*S],r,fill=(0,0,0,90))
        sh=sh.filter(ImageFilter.GaussianBlur(14*S)); img.alpha_composite(sh)
    body=Image.new('RGBA',(W,W),(0,0,0,0)); d=ImageDraw.Draw(body)
    d.rounded_rectangle([m,m,W-m,W-m],r,fill=bg)
    img.alpha_composite(body)
    d=ImageDraw.Draw(img)
    # masthead rules: double rule on top, single below
    x0=m+150*S; x1=W-m-150*S
    top=m+190*S
    d.rectangle([x0,top,x1,top+10*S],fill=rule)
    d.rectangle([x0,top+24*S,x1,top+28*S],fill=rule)
    bot=W-m-190*S
    d.rectangle([x0,bot-10*S,x1,bot],fill=rule)
    # the E
    f=ImageFont.truetype(FONT,470*S)
    text='E'
    bb=d.textbbox((0,0),text,font=f)
    tw=bb[2]-bb[0]; th=bb[3]-bb[1]
    dot=40*S; gap=22*S
    total=tw+gap+dot
    cx=(W-total)//2-bb[0]+10*S
    cy=(top+28*S+bot-10*S)//2 - th//2 - bb[1] + 4*S
    d.text((cx,cy),text,font=f,fill=ink)
    # red full stop, sitting on the baseline
    bx=cx+bb[2]+gap-34*S; by=cy+bb[3]-dot
    d.rectangle([bx,by,bx+dot,by+dot],fill=hot)
    img=img.resize((1024,1024),Image.LANCZOS)
    img.save(out)
icon((250,250,247,255),(17,17,17,255),(200,16,46,255),(17,17,17,255),'icon-day.png',True)
icon((18,18,18,255),(237,237,232,255),(255,107,94,255),(237,237,232,255),'icon-night.png',True)
# side-by-side preview on a neutral background
p=Image.new('RGBA',(2200,1124),(128,128,128,255))
p.alpha_composite(Image.open('icon-day.png'),(50,50)); p.alpha_composite(Image.open('icon-night.png'),(1126,50))
p.convert('RGB').save('preview.png')
