import { CONFIG } from '../engine/config';
import type { BonusTier, Grid, SpinPresentation, SymbolId, WildState, Win } from '../engine/types';
import { SymbolArtwork, SYMBOL_LABELS, SYMBOLS } from './artwork';
export { drawSymbolPreview, SYMBOL_LABELS } from './artwork';

export interface RendererOptions {
  translate?: (key: string) => string;
  onEvent?: (name: 'reel-stop' | 'split' | 'nudge' | 'vip-lock' | 'vip-miss' | 'win') => void;
}
interface BoardView { grid: Grid; frames: boolean[][]; wilds: WildState[]; wins: Win[] }
interface PartialBoardView { grid: Grid; frames?: boolean[][]; wilds?: WildState[]; wins?: Win[]; tier?: BonusTier|null }
interface SpinAnimation { target: SpinPresentation; elapsed: number; stops: number[]; duration: number; stopped: Set<number> }
interface VipView { locked: boolean[]; revealed: boolean[]; attempt: number; reveal: number; done: boolean }
interface Particle { x:number; y:number; vx:number; vy:number; angle:number; spin:number; color:string; size:number; born:number }
const WIDTH=1060, HEIGHT=650;
const AREA={x:53,y:59,w:954,h:528};
const FRAME_COLORS=['#ecd263','#ed94ba','#90c8c1','#f1aa72'];

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function easeOut(t:number){return 1-(1-t)**3;}
function smooth(t:number){return t*t*(3-2*t);}
function seedValue(i:number){const n=Math.sin(i*127.1+311.7)*43758.5453123;return n-Math.floor(n);}

/** Canvas presentation consumes settled engine results; it never draws gameplay randomness. */
export class SlotRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly artwork = new SymbolArtwork();
  private readonly tallWildImage = new Image();
  private tallWildBounds: { x:number; y:number; w:number; h:number }|null=null;
  private readonly options: RendererOptions;
  private current: BoardView;
  private spin: SpinAnimation|null=null;
  private vip: VipView|null=null;
  private wildProgress=1;
  private splitProgress=1;
  private tier:BonusTier|null=null;
  private previousTier:BonusTier|null=null;
  private sceneChangedAt=0;
  private particles:Particle[]=[];
  private celebrationAt=0;
  private celebrationMax=false;
  private lastDraw=0;
  private frameId=0;
  private destroyed=false;
  private skipRequested=false;
  private active=false;
  private resizeObserver:ResizeObserver;
  private hover:{reel:number;row:number}|null=null;
  private readonly pointerMove:(event:PointerEvent)=>void;
  private readonly pointerLeave:()=>void;

  constructor(readonly canvas:HTMLCanvasElement, options:RendererOptions={}) {
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)throw new Error('Canvas 2D is unavailable');
    this.ctx=ctx;this.options=options;
    this.tallWildImage.onload=()=>{
      const image=this.tallWildImage,probe=document.createElement('canvas');probe.width=image.naturalWidth;probe.height=image.naturalHeight;
      const probeCtx=probe.getContext('2d');if(!probeCtx)return;
      probeCtx.drawImage(image,0,0);const data=probeCtx.getImageData(0,0,probe.width,probe.height).data;
      let left=probe.width,right=0,top=probe.height,bottom=0;
      for(let y=0;y<probe.height;y++)for(let x=0;x<probe.width;x++)if(data[(y*probe.width+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(right>left&&bottom>top)this.tallWildBounds={x:left,y:top,w:right-left+1,h:bottom-top+1};
    };
    this.tallWildImage.src='/art/wild-tall.png';
    this.current={grid:Array.from({length:CONFIG.reels},(_,c)=>Array.from({length:CONFIG.rows},(_,r)=>SYMBOLS[(c*3+r*5)%8])),frames:Array.from({length:CONFIG.reels},()=>Array(CONFIG.rows).fill(false)),wilds:[],wins:[]};
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Студентски град — игрални барабани');
    canvas.style.display='block';canvas.style.width='100%';canvas.style.height='auto';canvas.style.aspectRatio=`${WIDTH}/${HEIGHT}`;
    this.pointerMove=(event)=>{
      const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*WIDTH/rect.width,y=(event.clientY-rect.top)*HEIGHT/rect.height;
      const reel=Math.floor((x-AREA.x)/(AREA.w/CONFIG.reels)),row=Math.floor((y-AREA.y)/(AREA.h/CONFIG.rows));
      this.hover=reel>=0&&reel<CONFIG.reels&&row>=0&&row<CONFIG.rows?{reel,row}:null;
      canvas.title=this.hover?this.label(this.current.grid[reel]?.[row]??'book'):'';
    };
    this.pointerLeave=()=>{this.hover=null;};
    canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerleave',this.pointerLeave);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    this.resize();this.frameId=requestAnimationFrame(this.tick);
  }

  get busy(){return this.active;}
  private label(id:SymbolId){const k=`symbol.${id}`,value=this.options.translate?.(k);return value&&value!==k?value:SYMBOL_LABELS[id];}
  private translate(key:string,fallback:string){const value=this.options.translate?.(key);return value&&value!==key?value:fallback;}

  resize() {
    const cssWidth=this.canvas.getBoundingClientRect().width||WIDTH;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(cssWidth*dpr)),height=Math.round(width*HEIGHT/WIDTH);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    this.ctx.setTransform(width/WIDTH,0,0,height/HEIGHT,0,0);
    this.draw(performance.now());
  }

  setScene(tier:BonusTier|null){
    if(this.tier===tier)return;
    this.previousTier=this.tier;this.tier=tier;this.sceneChangedAt=performance.now();
    this.canvas.dataset.scene=tier??'base';
  }

  render(presentation:SpinPresentation|Grid|PartialBoardView,frames?:boolean[][],wilds?:WildState[],wins?:Win[]) {
    this.vip=null;this.spin=null;
    if(Array.isArray(presentation))this.current={grid:presentation,frames:frames??this.blankFrames(),wilds:wilds??[],wins:wins??[]};
    else {this.current={grid:presentation.grid,frames:presentation.frames??this.blankFrames(),wilds:presentation.wilds??[],wins:presentation.wins??[]};if(presentation.tier!==undefined)this.setScene(presentation.tier);}
    this.wildProgress=1;this.splitProgress=1;this.draw(performance.now());
  }

  private blankFrames(){return Array.from({length:CONFIG.reels},()=>Array(CONFIG.rows).fill(false));}

  async animateSpin(presentation:SpinPresentation,turbo=false):Promise<void> {
    if(presentation.kind==='vip'){await this.animateVip(presentation,turbo);return;}
    this.active=true;this.skipRequested=false;this.vip=null;
    this.current={...this.current,wins:[]};
    this.setScene(presentation.tier);
    const stops=Array.from({length:CONFIG.reels},(_,reel)=>(turbo?420:1120)+reel*(turbo?58:165));
    this.spin={target:presentation,elapsed:0,stops,duration:stops[stops.length-1]+150,stopped:new Set()};
    await this.animate(this.spin.duration,(progress)=>{
      if(!this.spin)return;this.spin.elapsed=progress*this.spin.duration;
      stops.forEach((stop,reel)=>{if(this.spin!.elapsed>=stop&&!this.spin!.stopped.has(reel)){this.spin!.stopped.add(reel);this.options.onEvent?.('reel-stop');}});
    });
    this.spin=null;this.current={...presentation,wins:[]};
    const needsNudge=presentation.wilds.some(wild=>wild.steps>0);
    this.wildProgress=needsNudge?0:1;
    const hasFrames=presentation.frames.some(column=>column.some(Boolean));
    if(hasFrames){this.splitProgress=0;this.options.onEvent?.('split');await this.animate(turbo?150:420,(p)=>{this.splitProgress=smooth(p);});}
    this.splitProgress=1;
    if(needsNudge){
      this.wildProgress=0;
      const maxSteps=Math.max(...presentation.wilds.map(wild=>wild.steps));
      let sounded=-1;
      await this.animate(turbo?220:Math.min(1500,620+maxSteps*180),(p)=>{
        this.wildProgress=p;
        const step=Math.floor(p*maxSteps);if(step!==sounded){sounded=step;this.options.onEvent?.('nudge');}
      });
    }
    this.wildProgress=1;this.current=presentation;
    if(presentation.wins.length||presentation.maxWin){this.options.onEvent?.('win');await this.animate(turbo?140:300,()=>{});}
    this.active=false;this.draw(performance.now());
  }

  async animateVip(presentation:SpinPresentation|boolean[][],turbo=false):Promise<void> {
    this.active=true;this.skipRequested=false;this.spin=null;
    const attempts=Array.isArray(presentation)?presentation:presentation.vipAttempts??Array.from({length:3},()=>Array(5).fill(false));
    this.vip={locked:Array(5).fill(false),revealed:Array(5).fill(false),attempt:0,reveal:-1,done:false};
    for(let attempt=0;attempt<3;attempt++){
      this.vip.attempt=attempt+1;this.vip.revealed=Array(5).fill(false);
      for(let reel=0;reel<5;reel++){
        this.vip.reveal=reel;
        if(this.vip.locked[reel])continue;
        await this.animate(turbo?80:250,()=>{});
        this.vip.revealed[reel]=true;
        if(attempts[attempt]?.[reel]){this.vip.locked[reel]=true;this.options.onEvent?.('vip-lock');this.emitParticles(AREA.x+(reel+.5)*AREA.w/5,AREA.y+AREA.h*.5,12,false);}
        else this.options.onEvent?.('vip-miss');
      }
      await this.animate(turbo?130:420,()=>{});
    }
    this.vip.reveal=-1;this.vip.done=true;
    if(!Array.isArray(presentation))this.current=presentation;
    this.active=false;this.draw(performance.now());
  }

  async celebrate(ratio:number,maxWin=false,turbo=false):Promise<void> {
    this.skipRequested=false;this.celebrationAt=performance.now();this.celebrationMax=maxWin;
    this.emitParticles(WIDTH/2,HEIGHT*.25,maxWin?180:ratio>=50?100:55,true);
    await this.animate(turbo?500:maxWin?3200:ratio>=50?1800:1100,()=>{});
    this.celebrationAt=0;
  }

  skip(){this.skipRequested=true;}

  private animate(duration:number,update:(progress:number)=>void):Promise<void> {
    if(this.skipRequested||this.destroyed){update(1);return Promise.resolve();}
    return new Promise(resolve=>{
      const start=performance.now();
      const step=(time:number)=>{
        const progress=this.skipRequested||this.destroyed?1:Math.min(1,(time-start)/duration);
        update(progress);
        if(progress>=1){resolve();return;}requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  private tick=(time:number)=>{
    if(this.destroyed)return;
    if(this.active||this.celebrationAt||time-this.lastDraw>32){this.draw(time);this.lastDraw=time;}
    this.frameId=requestAnimationFrame(this.tick);
  };

  private draw(time:number) {
    const ctx=this.ctx;ctx.clearRect(0,0,WIDTH,HEIGHT);
    ctx.save();
    this.drawCabinet(time);
    ctx.save();rounded(ctx,AREA.x,AREA.y,AREA.w,AREA.h,7);ctx.clip();
    if(this.vip)this.drawVip(time);else this.drawBoard(time);
    this.drawAtmosphere(time);
    ctx.restore();
    this.drawCabinetFront(time);
    this.drawParticles(time);
    if(this.celebrationAt){const p=Math.min(1,(time-this.celebrationAt)/300);ctx.globalAlpha=(1-p)*.27;ctx.fillStyle=this.celebrationMax?'#ffedb3':'#f9e6a1';ctx.fillRect(0,0,WIDTH,HEIGHT);}
    ctx.restore();
  }

  private drawCabinet(time:number){
    const ctx=this.ctx;
    ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=32;ctx.shadowOffsetY=14;
    const concrete=ctx.createLinearGradient(0,20,0,630);concrete.addColorStop(0,'#6b605a');concrete.addColorStop(.14,'#37343a');concrete.addColorStop(.9,'#373039');concrete.addColorStop(1,'#201f28');
    rounded(ctx,31,32,998,585,15);ctx.fillStyle=concrete;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle='#97877a';ctx.lineWidth=2;ctx.stroke();
    for(let i=0;i<100;i++){ctx.fillStyle=i%3?'#ba9d7910':'#0d0d1935';ctx.fillRect(36+seedValue(i)*988,38+seedValue(i+120)*576,seedValue(i+77)*7+1,seedValue(i+180)*2+1);}
    const interior=ctx.createLinearGradient(0,AREA.y,0,AREA.y+AREA.h);interior.addColorStop(0,'#231c29');interior.addColorStop(.5,'#2c2431');interior.addColorStop(1,'#181b26');
    rounded(ctx,AREA.x-7,AREA.y-7,AREA.w+14,AREA.h+14,11);ctx.fillStyle='#15131d';ctx.fill();
    rounded(ctx,AREA.x,AREA.y,AREA.w,AREA.h,7);ctx.fillStyle=interior;ctx.fill();
    const accent=this.tier==='december'?'#efc564':this.tier==='friday'?'#ef7caa':this.tier==='dorm'?'#65cbc7':'#cf8678';
    ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.shadowColor=accent;ctx.shadowBlur=9;ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle='#ceba96';ctx.font='700 12px "Grad Text",Arial,sans-serif';ctx.textAlign='left';ctx.fillText(this.translate('render.block','БЛОК 42 / СТУДЕНТСКИ'),56,42);
    ctx.textAlign='right';ctx.font='700 11px "Grad Text",Arial,sans-serif';ctx.fillStyle='#d4cab6';ctx.fillText(this.translate('render.lecture','ЛЕКЦИЯ: 08:00'),1005,42);
    // An ivory timetable and a torn party flyer overlap the concrete border.
    ctx.save();ctx.translate(36,199);ctx.rotate(-.07);ctx.fillStyle='#d3c9aa';ctx.fillRect(-20,-46,24,110);ctx.strokeStyle='#66615d';ctx.lineWidth=1;
    for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(-18,-26+i*10);ctx.lineTo(2,-26+i*10);ctx.stroke();}ctx.fillStyle='#bb5c66';ctx.fillRect(-20,18,24,10);ctx.restore();
    ctx.save();ctx.translate(1031,469);ctx.rotate(.09);ctx.fillStyle='#b75c7d';ctx.fillRect(-2,-48,22,100);ctx.fillStyle='#2c2030';ctx.fillRect(1,-30,13,38);ctx.restore();
    // Small screw heads keep the stage grounded in a street-side poster case.
    for(const x of [43,1017])for(const y of [46,603]){ctx.fillStyle='#aa9886';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#3c363a';ctx.beginPath();ctx.moveTo(x-2,y+1);ctx.lineTo(x+2,y-1);ctx.stroke();}
    if(this.sceneChangedAt&&time-this.sceneChangedAt<650){ctx.save();ctx.globalAlpha=(1-(time-this.sceneChangedAt)/650)*.13;ctx.fillStyle=accent;rounded(ctx,AREA.x,AREA.y,AREA.w,AREA.h,7);ctx.fill();ctx.restore();}
  }

  private drawCabinetFront(time:number){
    const ctx=this.ctx;
    ctx.strokeStyle='#a8936d70';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(54,598);ctx.lineTo(1006,598);ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#c5b493';ctx.font='700 12px "Grad Text",Arial,sans-serif';ctx.fillText(this.translate('render.tagline','УТРЕ СЪМ НА ЛЕКЦИИ.'),WIDTH/2,611);
    ctx.font='600 10px "Grad Text",Arial,sans-serif';ctx.fillStyle='#a5a1aa';ctx.fillText(this.translate('render.demo','ВИРТУАЛНИ ДЕМО ЕВРО · БЕЗ РЕАЛНИ ПАРИ'),WIDTH/2,638);
    // Reflections from the nearby club drift along the metal rim.
    ctx.globalAlpha=.2+.09*Math.sin(time*.001);const light=ctx.createLinearGradient(130,0,WIDTH,0);light.addColorStop(0,'#eecc80');light.addColorStop(.4,'#e37cad');light.addColorStop(1,'#5fbcb8');ctx.strokeStyle=light;ctx.lineWidth=2;rounded(ctx,34,34,992,581,13);ctx.stroke();ctx.globalAlpha=1;
  }

  private drawBoard(time:number){
    const ctx=this.ctx,cw=AREA.w/CONFIG.reels,ch=AREA.h/CONFIG.rows;
    const winners=new Set(this.current.wins.flatMap(win=>win.cells.map(cell=>`${cell.reel}:${cell.row}`)));
    for(let reel=0;reel<CONFIG.reels;reel++){
      const x=AREA.x+reel*cw;
      ctx.save();ctx.beginPath();ctx.rect(x+1,AREA.y,cw-2,AREA.h);ctx.clip();
      const spin=this.spin,stop=spin?.stops[reel]??0;
      if(spin&&spin.elapsed<stop){
        const delay=reel*(spin.duration<1000?25:55),p=Math.max(0,Math.min(1,(spin.elapsed-delay)/(stop-delay)));
        const remaining=(1-easeOut(p))*(CONFIG.rows*3+reel*2);
        const offset=remaining%1*ch,advance=Math.floor(remaining);
        for(let row=-1;row<=CONFIG.rows;row++){
          const targetRow=((row+advance)%CONFIG.rows+CONFIG.rows)%CONFIG.rows;
          const symbol=spin.target.grid[reel][targetRow];
          this.drawCell(symbol,x,AREA.y+row*ch+offset,cw,ch,false,false,time,Math.min(.18,remaining*.02));
        }
        const blur=ctx.createLinearGradient(0,AREA.y,0,AREA.y+AREA.h);blur.addColorStop(0,'#17132298');blur.addColorStop(.12,'#17132200');blur.addColorStop(.88,'#17132200');blur.addColorStop(1,'#17132298');ctx.fillStyle=blur;ctx.fillRect(x,AREA.y,cw,AREA.h);
      }else{
        const board=spin?.target??this.current;
        const bounce=spin?Math.sin(Math.max(0,spin.elapsed-stop)/150*Math.PI)*Math.max(0,1-(spin.elapsed-stop)/150)*9:0;
        const wild=board.wilds.find(item=>item.reel===reel);
        for(let row=0;row<CONFIG.rows;row++){
          this.drawCell(board.grid[reel][row],x,AREA.y+row*ch+bounce,cw,ch,spin?false:board.frames[reel]?.[row]??false,winners.has(`${reel}:${row}`),time,0,!!wild);
        }
        if(wild)this.drawTallWild(wild,x,cw,time,spin?0:this.wildProgress,spin?[]:board.frames[reel]);
      }
      ctx.restore();
      if(reel){ctx.strokeStyle='#100e1b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,AREA.y);ctx.lineTo(x,AREA.y+AREA.h);ctx.stroke();ctx.strokeStyle='#94847527';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+2,AREA.y);ctx.lineTo(x+2,AREA.y+AREA.h);ctx.stroke();}
    }
  }

  private drawCell(symbol:SymbolId,x:number,y:number,w:number,h:number,framed:boolean,winning:boolean,time:number,motion=0,hideSymbol=false){
    const ctx=this.ctx,split=framed&&symbol!=='scatter'&&symbol!=='vip';
    const cellLight=ctx.createRadialGradient(x+w*.5,y+h*.48,4,x+w*.5,y+h*.48,h*.7);cellLight.addColorStop(0,symbol==='scatter'?'#d457931f':symbol==='vip'?'#c6a23d28':'#ae8d7320');cellLight.addColorStop(1,'#2a223400');ctx.fillStyle=cellLight;ctx.fillRect(x+2,y+1,w-4,h-2);
    ctx.strokeStyle='#b9a7820d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+9,y+h);ctx.lineTo(x+w-9,y+h);ctx.stroke();
    if(framed){
      const color=FRAME_COLORS[(Math.floor((x-AREA.x)/w)+Math.floor((y-AREA.y)/h)*3)%FRAME_COLORS.length]??FRAME_COLORS[0];
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=winning?14:4;ctx.strokeStyle=color;ctx.lineWidth=split?3.2:2;rounded(ctx,x+8,y+7,w-16,h-14,4);ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x+w-33,y+6);ctx.lineTo(x+w-7,y+6);ctx.lineTo(x+w-7,y+32);ctx.closePath();ctx.fill();
      ctx.fillStyle='#263139';ctx.font='800 12px "Grad Text",Arial,sans-serif';ctx.textAlign='center';ctx.fillText(split?'×2':'',x+w-17,y+21);ctx.restore();
    }
    if(!hideSymbol){
      const bob=winning?Math.sin(time*.008)*2:Math.sin(time*.0008+(x+y)*.009)*.55;
      const icon=Math.min(h*.92,w*.84)*(winning?1+.024*Math.sin(time*.007):1),cx=x+w/2,cy=y+h/2+bob;
      ctx.save();ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=8;ctx.shadowOffsetY=4;
      if(split&&this.splitProgress>0){
        const p=this.splitProgress;
        const size=lerp(icon,Math.min(h*.72,w*.49),p),distance=w*.222*p;
        ctx.save();ctx.translate(cx-distance,cy);ctx.rotate(-.025*p);this.artwork.draw(ctx,symbol,0,0,size,size,time);ctx.restore();
        ctx.save();ctx.translate(cx+distance,cy);ctx.rotate(.025*p);this.artwork.draw(ctx,symbol,0,0,size,size,time);ctx.restore();
        ctx.shadowBlur=0;ctx.shadowOffsetY=0;
        ctx.strokeStyle='#ecd87c55';ctx.setLineDash([2,5]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,y+18);ctx.lineTo(cx,y+h-18);ctx.stroke();ctx.setLineDash([]);
      }else this.artwork.draw(ctx,symbol,cx,cy,icon,icon,time);
      ctx.restore();
      if(motion>0){ctx.save();ctx.globalAlpha=motion;this.artwork.draw(ctx,symbol,cx,cy+14,icon,icon,time);ctx.restore();}
    }
    if(winning){
      ctx.save();ctx.shadowColor='#ffd986';ctx.shadowBlur=15;ctx.strokeStyle='#ffe0a3';ctx.lineWidth=2.5+Math.sin(time*.005)*.6;rounded(ctx,x+4,y+4,w-8,h-8,7);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=`rgba(255,213,115,${.025+.025*Math.sin(time*.005)})`;ctx.fill();ctx.restore();
    }
    if(this.hover?.reel===Math.floor((x-AREA.x)/w)&&this.hover.row===Math.round((y-AREA.y)/h)&&!this.active){ctx.strokeStyle='#eee2ce45';ctx.lineWidth=1;rounded(ctx,x+7,y+7,w-14,h-14,6);ctx.stroke();}
  }

  private drawTallWild(wild:WildState,x:number,w:number,time:number,progress:number,frames:boolean[]=[]){
    const ctx=this.ctx;
    const steps=wild.steps,step=Math.min(steps,Math.floor(progress*steps)),local=(progress*steps)%1;
    const nudge=progress<1&&steps>0?(steps-step)*(AREA.h/CONFIG.rows)*.22+Math.sin(local*Math.PI)*15:0;
    const multiplier=progress>=1||steps===0?wild.multiplier:Math.max(1,wild.multiplier-steps+step);
    const glow=ctx.createLinearGradient(x,0,x+w,0);glow.addColorStop(0,'#dd9d451e');glow.addColorStop(.5,'#dab45933');glow.addColorStop(1,'#dd9d451e');ctx.fillStyle=glow;ctx.fillRect(x+5,AREA.y,w-10,AREA.h);
    if(this.tallWildBounds){
      const bounds=this.tallWildBounds,scale=Math.min((w-16)/bounds.w,(AREA.h-70)/bounds.h),dw=bounds.w*scale,dh=bounds.h*scale;
      ctx.save();ctx.translate(x+w/2,AREA.y+AREA.h/2-23+nudge);ctx.rotate(progress<1?Math.sin(local*Math.PI)*.024:Math.sin(time*.0013)*.006);
      ctx.shadowColor='#08090e';ctx.shadowBlur=10;ctx.shadowOffsetY=5;ctx.drawImage(this.tallWildImage,bounds.x,bounds.y,bounds.w,bounds.h,-dw/2,-dh/2,dw,dh);ctx.restore();
    }else{
    ctx.save();ctx.translate(x+w/2,AREA.y+AREA.h*.31+nudge);ctx.rotate(progress<1?Math.sin(local*Math.PI)*.025:Math.sin(time*.0013)*.007);
    // The full-reel friend has a body as well as a readable painted portrait.
    const scale=w/180;ctx.scale(scale,scale);
    const bodyY=-8,bodyH=AREA.h/scale*.52;
    const jacket=ctx.createLinearGradient(-60,0,60,bodyH);jacket.addColorStop(0,'#ea625a');jacket.addColorStop(.5,'#b83e48');jacket.addColorStop(1,'#702d38');
    ctx.fillStyle=jacket;ctx.strokeStyle='#262b2b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-60,bodyY);ctx.bezierCurveTo(-83,bodyY+20,-70,bodyH*.65,-62,bodyH*.8);ctx.lineTo(-39,bodyH*.8);ctx.lineTo(-30,bodyH*.98);ctx.lineTo(32,bodyH*.98);ctx.lineTo(42,bodyH*.8);ctx.lineTo(68,bodyH*.77);ctx.bezierCurveTo(78,bodyH*.5,80,bodyY+18,59,bodyY);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#ead2a5';ctx.beginPath();ctx.moveTo(-23,34);ctx.lineTo(26,34);ctx.lineTo(31,bodyH*.77);ctx.lineTo(-31,bodyH*.77);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#cfb79d';ctx.lineWidth=3;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-25,55+i*30);ctx.lineTo(28,53+i*30);ctx.stroke();}
    ctx.strokeStyle='#edd7b5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-57,19);ctx.lineTo(-48,bodyH*.75);ctx.moveTo(61,19);ctx.lineTo(52,bodyH*.75);ctx.stroke();
    ctx.fillStyle='#8a3542';ctx.fillRect(-34,bodyH*.78,31,bodyH*.29);ctx.fillRect(5,bodyH*.78,31,bodyH*.29);
    ctx.strokeStyle='#dfc9a6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-27,bodyH*.81);ctx.lineTo(-27,bodyH*1.05);ctx.moveTo(29,bodyH*.81);ctx.lineTo(29,bodyH*1.05);ctx.stroke();
    this.artwork.drawWildPortrait(ctx,0,-66,169,time);
    ctx.restore();
    }
    const bannerY=AREA.y+AREA.h-74;
    ctx.save();ctx.shadowColor='#ffd57d';ctx.shadowBlur=10;ctx.fillStyle='#342832';rounded(ctx,x+8,bannerY,w-16,62,5);ctx.fill();ctx.strokeStyle='#e8c26f';ctx.lineWidth=2;ctx.stroke();ctx.shadowBlur=0;
    ctx.textAlign='center';ctx.fillStyle='#f8e3a2';ctx.font='800 12px "Grad Text",Arial,sans-serif';ctx.fillText(this.label('wild'),x+w/2,bannerY+20,w-26);ctx.font='700 36px "Grad Display",Arial,sans-serif';ctx.fillStyle='#ffdc79';ctx.fillText(`×${multiplier}`,x+w/2,bannerY+53);ctx.restore();
    ctx.strokeStyle='#ecc773';ctx.lineWidth=3;rounded(ctx,x+4,AREA.y+5,w-8,AREA.h-10,5);ctx.stroke();
    frames.forEach((framed,row)=>{
      if(!framed)return;
      const y=AREA.y+row*(AREA.h/CONFIG.rows)+11;
      ctx.save();ctx.shadowBlur=5;ctx.shadowColor='#ead176';ctx.fillStyle='#e8cf79';rounded(ctx,x+w-43,y,32,20,3);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#443334';ctx.font='800 13px "Grad Text",Arial,sans-serif';ctx.textAlign='center';ctx.fillText('×2',x+w-27,y+15);ctx.restore();
    });
  }

  private drawVip(time:number){
    const ctx=this.ctx,vip=this.vip!,w=AREA.w/5;
    const bg=ctx.createLinearGradient(0,AREA.y,0,AREA.y+AREA.h);bg.addColorStop(0,'#27242b');bg.addColorStop(.5,'#323128');bg.addColorStop(1,'#141824');ctx.fillStyle=bg;ctx.fillRect(AREA.x,AREA.y,AREA.w,AREA.h);
    ctx.textAlign='center';ctx.font='700 40px "Grad Display",Arial,sans-serif';ctx.fillStyle='#f7ddb0';ctx.fillText(this.translate('render.god','БОГЪТ НА СТУДЕНТСКИ'),WIDTH/2,AREA.y+62);
    ctx.font='700 27px "Grad Text",Arial,sans-serif';ctx.fillStyle='#b7a88e';ctx.fillText(`${this.translate('render.attempt','ОПИТ')} ${vip.attempt||1} / 3`,WIDTH/2,AREA.y+95);
    for(let reel=0;reel<5;reel++){
      const x=AREA.x+reel*w+14,y=AREA.y+140,cx=x+(w-28)/2;
      const active=vip.reveal===reel&&!vip.done,locked=vip.locked[reel];
      ctx.save();ctx.shadowColor=locked?'#ffe08f':active?'#c8a35c':'transparent';ctx.shadowBlur=locked?15:8;ctx.fillStyle=locked?'#9f804024':'#161a2480';rounded(ctx,x,y,w-28,208,8);ctx.fill();ctx.strokeStyle=locked?'#f4d28b':active?'#c7a65d':'#81725a65';ctx.lineWidth=locked?2.5:1.3;ctx.stroke();ctx.shadowBlur=0;
      if(locked)this.artwork.draw(ctx,'vip',cx,y+94,w*.82,w*.82,time);
      else{
        ctx.strokeStyle='#9e875e';ctx.lineWidth=2;ctx.setLineDash([5,5]);rounded(ctx,cx-52,y+56,104,80,5);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=vip.revealed[reel]?'#ae9582':'#cab18a';ctx.font='700 39px "Grad Display",Arial,sans-serif';ctx.fillText(vip.revealed[reel]?'—':'?',cx,y+110);
      }
      ctx.fillStyle=locked?'#f5d48b':'#988d7d';ctx.font='700 22px "Grad Display",Arial,sans-serif';ctx.fillText(locked?this.translate('render.locked','ЗАКЛЮЧЕН'):String(reel+1).padStart(2,'0'),cx,y+181);
      ctx.restore();
    }
    const collected=vip.locked.filter(Boolean).length;
    ctx.fillStyle=collected===5?'#ffdc89':'#d3c1a4';ctx.font='700 33px "Grad Display",Arial,sans-serif';
    ctx.fillText(vip.done&&collected===5?this.translate('render.maxwin','СТУДЕНТСКИ Е ТВОЙ!'):`${collected} / 5 ${this.translate('render.passes','VIP ПРОПУСКА')}`,WIDTH/2,AREA.y+404);
    ctx.font='600 24px "Grad Text",Arial,sans-serif';ctx.fillStyle='#aca092';ctx.fillText(vip.done&&collected<5?this.translate('render.vipzero','НЕПЪЛНА КОЛЕКЦИЯ · €0.00'):this.translate('render.viprule','ПРОПУСКИТЕ ОСТАВАТ ЗАКЛЮЧЕНИ'),WIDTH/2,AREA.y+442);
  }

  private drawAtmosphere(time:number){
    const ctx=this.ctx;
    // Slow dust catches the streetlights; upgraded scenes gain hanging fairy lights.
    ctx.save();
    for(let i=0;i<12;i++){const x=AREA.x+((seedValue(i+20)*AREA.w+time*(.003+i*.0001))%AREA.w),y=AREA.y+((seedValue(i+42)*AREA.h-time*.004+AREA.h*10)%AREA.h);ctx.globalAlpha=.06+.08*Math.sin(time*.0007+i)**2;ctx.fillStyle='#ffdead';ctx.beginPath();ctx.arc(x,y,1+i%2*.5,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
    if(this.tier){
      ctx.strokeStyle='#281e27';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(AREA.x,AREA.y);ctx.quadraticCurveTo(WIDTH/2,AREA.y+28,AREA.x+AREA.w,AREA.y);ctx.stroke();
      for(let i=0;i<15;i++){const x=AREA.x+25+i*(AREA.w-50)/14,t=(x-AREA.x)/AREA.w,y=AREA.y+4+4*t*(1-t)*22,color=['#f1c673','#dc789b','#76c1b7'][i%3];ctx.globalAlpha=.65+.35*Math.sin(time*.002+i*.7)**2;ctx.shadowColor=color;ctx.shadowBlur=7;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y+3,2.5,4,0,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }

  private emitParticles(x:number,y:number,count:number,wide:boolean){
    const now=performance.now(),start=this.particles.length;
    for(let i=0;i<count;i++){const n=i+start;this.particles.push({x:wide?seedValue(n+24)*WIDTH:x,y:wide?-10-seedValue(n+12)*220:y,vx:(seedValue(n+30)-.5)*(wide?100:190),vy:wide?90+seedValue(n+91)*160:-100-seedValue(n+29)*120,angle:seedValue(n+20)*Math.PI,spin:(seedValue(n+18)-.5)*5,color:['#f8d070','#ed80a8','#85d7c7','#f7e6be'][i%4],size:3+seedValue(n+17)*5,born:now});}
  }
  private drawParticles(time:number){
    const ctx=this.ctx;this.particles=this.particles.filter(p=>time-p.born<4600);
    for(const p of this.particles){const t=(time-p.born)/1000;ctx.save();ctx.globalAlpha=Math.min(1,(4.6-t)*.8);ctx.translate(p.x+p.vx*t,p.y+p.vy*t+40*t*t);ctx.rotate(p.angle+p.spin*t);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55);ctx.restore();}
  }

  destroy(){this.destroyed=true;this.skipRequested=true;cancelAnimationFrame(this.frameId);this.resizeObserver.disconnect();this.canvas.removeEventListener('pointermove',this.pointerMove);this.canvas.removeEventListener('pointerleave',this.pointerLeave);}
}

export { SlotRenderer as Renderer };
