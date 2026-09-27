"""Render silent 1080p Lyverne motion lookbooks from approved photographic mockups.
These are animated still-image edits, not footage of moving garments or people.
Requires an ffmpeg binary with drawtext, overlay and xfade support.
"""
import argparse, subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--ffmpeg',required=True);parser.add_argument('--film',choices=['signature','graphics'],required=True);parser.add_argument('--reuse-clips',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
assets=root/'public/assets';scratch=root/'.preview/film-render'/args.film;scratch.mkdir(parents=True,exist_ok=True)
font=str(assets/'khand-bold.ttf');body=str(assets/'manrope-regular.ttf')
cream='0xF3EEE4';ink='0x20201C';orange='0xF26B24'
def text(content,x,y,size=75,color=ink,fontfile=font):
    escaped=content.replace('\\','\\\\').replace(':','\\:').replace("'",'’')
    return f"drawtext=fontfile='{fontfile}':text='{escaped}':fontcolor={color}:fontsize={size}:x={x}:y={y}"

def clip(index,image,title,subtitle,kind='product',bg=cream):
    out=scratch/f'{index}.mp4';seconds=5
    if args.reuse_clips and out.exists():return out
    cmd=[args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi','-i',f'color=c={bg}:s=1920x1080:r=24:d={seconds}','-loop','1','-i',str(assets/image),'-loop','1','-i',str(assets/'lyverne-navbar.png')]
    if kind=='editorial':
        art="[1:v]scale=1000:-1,crop=1000:1000:0:'10+8*sin(t*.6)',setsar=1[art];[0:v][art]overlay=880:40:shortest=1[base];"
    elif kind=='detail':
        art="[1:v]scale=1080:-1,crop=1080:1080:0:'150+24*sin(t*.5)',setsar=1[art];[0:v][art]overlay=840:0:shortest=1[base];"
    else:
        art="[1:v]scale=1030:1030:force_original_aspect_ratio=decrease,format=rgba[art];[0:v][art]overlay=x='835+8*sin(t*.5)':y='25+8*cos(t*.7)':shortest=1[base];"
    labels=[text('LYVERNE / MOTION NOTEBOOK',85,235,22,fontfile=body)]
    for n,line in enumerate(title):labels.append(text(line,80,310+n*132,140))
    labels.extend([text(subtitle,85,785,25,fontfile=body),text('THE FIRST EDITION / 2026',85,975,20,fontfile=body),text(f'0{index+1}',1760,978,25,fontfile=body)])
    filt=art+"[2:v]scale=330:-1[logo];[base][logo]overlay=80:70:shortest=1[marked];[marked]"+','.join(labels)+",format=yuv420p[v]"
    cmd+=['-filter_complex',filt,'-map','[v]','-t',str(seconds),'-r','24','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out)]
    subprocess.run(cmd,check=True);return out
if args.film=='signature':
    shots=[('studio-editorial.png',['EVERYDAY.','ELEVATED.'],'A relaxed silhouette. A quiet signature.','editorial'),('tee-front.png',['LESS NOISE.','MORE YOU.'],'The Signature Tee / Onyx Black','product'),('tee-detail.png',['A SMALL','SIGNATURE.'],'It is all in the details.','detail'),('tee-cream.png',['YOUR OWN','EVERYDAY.'],'The Signature Tee / Warm Cream','product')]
else:
    shots=[('graphic-paper-front.png',['PAPER DAY.','YOUR WAY.'],'Graphic edition / 01 / Warm Cream','product'),('graphic-talk-back.png',['TALK LESS.','DO MORE.'],'Graphic edition / 02 / Front-to-back expression','product'),('graphic-sigil-back.png',['AFTER','DARK.'],'Graphic edition / 03 / Night Sigil','product'),('graphic-cafe-front.png',['IN YOUR','OWN ORBIT.'],'Graphic edition / 04 / Midnight Navy','product')]
clips=[clip(i,*shot) for i,shot in enumerate(shots)]
command=[args.ffmpeg,'-hide_banner','-loglevel','error','-y']
for path in clips:command+=['-i',str(path)]
filters=[]
for i in range(4):filters.append(f'[{i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=24[v{i}]')
filters+=['[v0][v1]xfade=transition=fade:duration=0.6:offset=4.4,fps=24[x1]','[x1][v2]xfade=transition=fade:duration=0.6:offset=8.8,fps=24[x2]','[x2][v3]xfade=transition=fade:duration=0.6:offset=13.2,format=yuv420p[film]']
output=assets/f'lyverne-{args.film}-film.mp4'
command+=['-filter_complex',';'.join(filters),'-map','[film]','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(output)]
subprocess.run(command,check=True)
print(f'Created {output} (1920x1080, 24fps, 18.2 seconds, silent motion lookbook)')
