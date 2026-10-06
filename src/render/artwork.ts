import type { SymbolId } from '../engine/types';

export const SYMBOL_LABELS: Record<SymbolId, string> = {
  book: 'КОНСПЕКТ', coffee: 'КАФЕ', noodles: 'БЪРЗА ВЕЧЕРЯ', doner: 'ДЮНЕР',
  female: 'КОЛЕЖКАТА', male: 'СЕСИЯТА', dj: 'DJ', couple: 'ДВОЙКАТА',
  wild: 'ПИЯНИЯТ КОЛЕГА', scatter: 'ПОКАНА ЗА КУПОН', vip: 'VIP ПРОПУСК',
};
export const SYMBOLS: SymbolId[] = ['book','coffee','noodles','doner','female','male','dj','couple','wild','scatter','vip'];
// Tight source bounds keep neighbouring cutouts off the symbols. The illustrated
// sheet has intentionally loose contours rather than mechanically aligned tiles.
const ATLAS_BOUNDS: Record<SymbolId,[number,number,number,number]> = {
  book:[17,7,377,332], coffee:[414,0,258,340], noodles:[724,5,350,337], doner:[1080,7,359,334],
  female:[5,339,354,361], male:[360,343,355,358], dj:[710,347,331,354], couple:[1086,347,359,352],
  wild:[20,700,328,345], scatter:[346,723,372,303], vip:[726,708,359,320],
};

function path(ctx:CanvasRenderingContext2D, data:string, fill:string|CanvasGradient, stroke='#251923', width=2.8) {
  const p = new Path2D(data); ctx.fillStyle=fill; ctx.fill(p);
  if(width) { ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke(p); }
}
function ellipse(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string,stroke?:string,width=2) {
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
  if(stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function line(ctx:CanvasRenderingContext2D,data:string,color:string,width=2) {
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke(new Path2D(data));
}
function text(ctx:CanvasRenderingContext2D,label:string,x:number,y:number,size:number,color:string,angle=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.font=`900 ${size}px "Arial",sans-serif`;ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(label,0,0);ctx.restore();
}
function gradient(ctx:CanvasRenderingContext2D,a:string,b:string,top=20,bottom=140) {
  const g=ctx.createLinearGradient(0,top,100,bottom);g.addColorStop(0,a);g.addColorStop(1,b);return g;
}
function face(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,hair:string,female=false,tired=false) {
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  if(female) path(ctx,'M -30 -5 Q -40 -55 0 -55 Q 39 -56 31 -2 L 33 30 L -33 29 Z',gradient(ctx,hair,'#301a29',-55,35));
  ellipse(ctx,-25,0,6,10,'#d9956e','#482a29');ellipse(ctx,25,0,6,10,'#d9956e','#482a29');
  path(ctx,'M -24 -25 Q -23 -48 0 -44 Q 25 -47 25 -25 L 23 13 Q 15 35 0 35 Q -18 32 -23 12 Z',gradient(ctx,'#ffd3aa','#d88c64',-45,32),'#573129',2);
  path(ctx,female?'M -28 -11 Q -38 -46 -8 -52 Q 22 -57 30 -31 L 28 3 Q 22 -20 2 -25 Q -7 -8 -28 -11 Z':'M -28 -13 L -29 -35 Q -27 -54 -4 -50 L 3 -57 L 12 -48 L 22 -50 L 29 -27 L 22 -10 L 18 -30 Q 1 -22 -17 -28 L -20 -7 Z',gradient(ctx,hair,'#231826',-55,0),'#281a23',2);
  line(ctx,'M -17 -5 Q -11 -9 -6 -5 M 7 -5 Q 13 -9 18 -5','#4a2830',2.8);
  ellipse(ctx,-11,0,2.3,3.3,'#312532');ellipse(ctx,12,0,2.3,3.3,'#312532');
  if(tired) line(ctx,'M -18 8 Q -10 14 -5 8 M 6 8 Q 13 14 19 8','#9b5f69',2);
  line(ctx,'M 0 1 L -2 12 L 4 14','#ad614c',1.5);
  if(female) {path(ctx,'M -8 21 Q 0 16 9 21 Q 0 28 -8 21 Z','#b74151','#963147',1);ellipse(ctx,-26,14,4,7,'#f6cb57','#a27630',1);ellipse(ctx,26,14,4,7,'#f6cb57','#a27630',1);}
  else line(ctx,tired?'M -7 23 Q 0 19 8 22':'M -9 20 Q 1 28 11 19','#6a3634',1.8);
  ellipse(ctx,-15,13,5,3,'#eea183');ellipse(ctx,16,13,5,3,'#eea183');
  ctx.restore();
}
function stars(ctx:CanvasRenderingContext2D,color:string,phase:number) {
  for(let i=0;i<5;i++) {const x=18+(i*31)%126,y=18+(i*47)%122,s=3+(i%2)*2;ctx.save();ctx.translate(x,y);ctx.rotate(phase*.12+i);path(ctx,`M 0 ${-s*2} L ${s} ${-s} L ${s*2} 0 L ${s} ${s} L 0 ${s*2} L ${-s} ${s} L ${-s*2} 0 L ${-s} ${-s} Z`,color,color,0);ctx.restore();}
}

/** Original vector fallback remains available while painted artwork loads. */
export function drawIllustration(ctx:CanvasRenderingContext2D,symbol:SymbolId,time=0) {
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  switch(symbol) {
    case 'book': {
      path(ctx,'M 21 49 L 114 26 L 140 111 L 47 136 L 21 127 Z',gradient(ctx,'#f6d196','#9e7652'),'#342528',3);
      path(ctx,'M 22 40 L 114 18 L 139 103 L 47 127 L 22 117 Z',gradient(ctx,'#ed7856','#992e3d'),'#3b2030',3);
      path(ctx,'M 30 43 L 44 118 L 56 114 L 40 40 Z','#ffb081','#7b3936',1.5);
      path(ctx,'M 54 50 L 105 38 L 118 87 L 67 99 Z','#f4d5ac','#e4b97e',1.6);
      text(ctx,'СЕСИЯ',86,69,15,'#73353e',-.24);text(ctx,'2026',91,88,10,'#805b4a',-.24);
      line(ctx,'M 50 128 L 137 105 M 52 132 L 138 111','#f5e7be',2);
      path(ctx,'M 80 114 L 88 143 L 96 134 L 105 137 L 96 111 Z','#69c4c6','#305e63',1.8);
      break;
    }
    case 'coffee': {
      path(ctx,'M 44 40 L 122 40 L 111 136 Q 80 151 52 136 Z',gradient(ctx,'#fff0ca','#c9a078'),'#442d28',3);
      path(ctx,'M 47 76 Q 82 84 117 76 L 113 113 Q 82 125 50 112 Z',gradient(ctx,'#d49251','#895539'),'#633b2c',1.5);
      path(ctx,'M 36 35 Q 80 22 130 34 L 128 45 Q 81 56 38 45 Z','#342937','#1b1723',3);
      path(ctx,'M 44 27 Q 82 18 122 28 L 129 34 Q 83 45 36 35 Z',gradient(ctx,'#806064','#392936'),'#211c26',2);
      ellipse(ctx,85,100,14,14,'#ead1a4','#d8ad70',1);text(ctx,'08',85,105,15,'#593936');
      line(ctx,'M 64 15 Q 55 6 63 -4 M 91 15 Q 83 5 91 -5 M 109 17 Q 102 10 110 1','#e9d8bb',3);
      break;
    }
    case 'noodles': {
      path(ctx,'M 40 61 L 129 58 L 119 139 Q 87 150 52 138 Z',gradient(ctx,'#ef7950','#ab293d'),'#482338',3);
      ellipse(ctx,84,62,46,13,'#fff0b5','#684139',3);
      for(let i=0;i<6;i++) line(ctx,`M ${48+i*11} 61 Q ${57+i*10} 49 ${63+i*9} 63 Q ${68+i*8} 70 ${78+i*8} 61`,'#cba952',2.5);
      path(ctx,'M 55 90 L 115 88 L 111 119 L 59 122 Z','#f8d78b','#a34e35',1.7);
      text(ctx,'NOODLES',85,108,12,'#953c32');text(ctx,'3 МИН',88,137,9,'#ffe6b0');
      line(ctx,'M 104 7 L 73 58','#f2c67d',5);line(ctx,'M 120 11 L 97 58','#e6b766',5);
      ellipse(ctx,104,60,4,3,'#61a46a');ellipse(ctx,65,57,4,2,'#72a454');ellipse(ctx,86,65,3,2,'#db5f46');
      break;
    }
    case 'doner': {
      path(ctx,'M 45 52 Q 82 14 122 53 L 104 137 Q 87 152 70 138 Z',gradient(ctx,'#f7d39b','#b47a49'),'#4e3428',3);
      path(ctx,'M 44 54 Q 54 32 69 41 Q 80 17 94 41 Q 121 27 123 54 L 111 75 L 57 78 Z','#70a844','#344f34',2.4);
      path(ctx,'M 53 53 Q 74 41 80 56 Q 101 46 115 63 L 108 93 L 60 90 Z',gradient(ctx,'#c68154','#7c4437'),'#693b2c',2);
      path(ctx,'M 55 66 Q 86 50 114 65 L 109 83 Q 83 69 59 85 Z','#f9dfb4','#caa373',1.7);
      ellipse(ctx,71,59,10,6,'#ec5e4e','#b73e3c',1);ellipse(ctx,102,61,9,6,'#e45b48','#a83e3a',1);
      line(ctx,'M 63 65 Q 84 74 106 63','#faf0cd',4);
      path(ctx,'M 57 88 L 113 85 L 104 138 Q 88 150 71 138 Z',gradient(ctx,'#f3e9d7','#b7aca4'),'#695a51',2.3);
      line(ctx,'M 59 99 L 109 96 M 64 107 L 106 104','#e9ddd0',2);
      text(ctx,'ДЮНЕР',87,126,14,'#b54f47',-.07);break;
    }
    case 'female': {
      path(ctx,'M 19 151 L 24 112 Q 40 88 59 90 L 99 90 Q 124 99 141 147 Z',gradient(ctx,'#ede6d7','#9d9aa6'),'#392637',3);
      path(ctx,'M 62 80 L 99 80 L 94 105 L 80 118 L 66 104 Z','#e6a17d','#5b332f',2);
      path(ctx,'M 61 98 L 80 114 L 103 97 L 115 151 L 48 151 Z','#462740','#312436',2);
      face(ctx,81,61,1.03,'#754335',true);
      path(ctx,'M 46 96 L 65 110 L 48 119 L 39 143 M 113 97 L 94 111 L 111 121 L 123 148','#f4edde','#625565',2);
      path(ctx,'M 112 113 L 134 104 L 147 146 L 123 153 Z','#e8ad55','#624038',2);
      text(ctx,'A+',129,135,17,'#594144',-.3);ellipse(ctx,112,131,7,6,'#f0b28e','#754939',1.5);
      break;
    }
    case 'male': {
      path(ctx,'M 20 153 L 29 113 Q 43 93 68 88 L 101 90 Q 126 104 139 151 Z',gradient(ctx,'#bca3d4','#655184'),'#302638',3);
      path(ctx,'M 62 88 L 101 89 L 96 109 L 79 121 L 63 106 Z','#b8755d','#5f3331',2);
      face(ctx,81,59,1.04,'#594033',false,true);
      path(ctx,'M 56 100 L 78 127 L 104 98 L 115 151 L 42 151 Z','#d1c2dc','#73628a',2);
      line(ctx,'M 51 104 L 43 136 M 112 110 L 124 139','#ead7eb',2);
      path(ctx,'M 45 116 L 112 108 L 120 147 L 53 155 Z','#fff0cb','#9d7e63',2.4);
      text(ctx,'ИЗПИТ',81,129,13,'#84627e',-.12);line(ctx,'M 59 137 L 104 130 M 64 145 L 109 138','#ba9c91',1.5);
      ellipse(ctx,48,135,8,7,'#e6a17f','#724036',1.5);ellipse(ctx,116,132,8,7,'#e6a17f','#724036',1.5);
      break;
    }
    case 'dj': {
      path(ctx,'M 17 142 L 25 109 Q 46 86 67 88 L 100 89 Q 127 102 141 143 Z',gradient(ctx,'#5bc1bc','#286c89'),'#22283b',3);
      path(ctx,'M 66 84 L 99 84 L 95 104 L 80 114 L 67 102 Z','#bd7c5b','#4d3030',2);
      face(ctx,82,57,.98,'#26222c');
      path(ctx,'M 47 51 Q 42 13 82 9 Q 124 13 118 51','#323345','#1c1b27',7);
      path(ctx,'M 44 47 L 54 43 L 56 73 L 44 75 Z','#5cd4cc','#243344',3);
      path(ctx,'M 110 43 L 122 47 L 121 75 L 109 72 Z','#5cd4cc','#243344',3);
      path(ctx,'M 57 51 L 105 51 L 102 62 L 85 67 L 80 61 L 64 66 Z','#3c3043','#e7be65',2);
      path(ctx,'M 18 130 L 142 130 L 152 156 L 9 156 Z',gradient(ctx,'#675362','#282331'),'#1b1824',3);
      ellipse(ctx,43,143,21,7,'#272735','#928082',2);ellipse(ctx,111,143,21,7,'#272735','#928082',2);
      for(let i=0;i<3;i++){ellipse(ctx,74+i*7,141,2,2,['#ffb161','#ea629a','#71eddb'][i]);}
      ellipse(ctx,43,127,9,5,'#d99c72','#54372f',1.5);ellipse(ctx,110,128,9,5,'#d99c72','#54372f',1.5);break;
    }
    case 'couple': {
      path(ctx,'M 7 150 L 16 115 Q 31 94 53 99 L 70 113 L 85 151 Z',gradient(ctx,'#ee7793','#a43f5e'),'#40273a',3);
      path(ctx,'M 74 151 L 87 111 Q 105 97 133 100 L 148 151 Z',gradient(ctx,'#73a6c7','#436382'),'#2a2a3b',3);
      face(ctx,48,72,.83,'#603649',true);face(ctx,113,70,.83,'#3e3030');
      path(ctx,'M 54 108 Q 76 94 90 109 L 85 117 Q 69 106 59 119 Z','#e5aa86','#5e3935',2);
      path(ctx,'M 57 122 L 78 122 L 75 145 L 60 145 Z','#eeb246','#714f3c',2);path(ctx,'M 86 120 L 106 120 L 103 143 L 89 143 Z','#eeb246','#714f3c',2);
      ellipse(ctx,67,122,11,4,'#fff0d1','#8d6744',1.5);ellipse(ctx,96,120,11,4,'#fff0d1','#8d6744',1.5);
      path(ctx,'M 79 26 Q 67 12 61 24 Q 54 38 79 49 Q 101 32 94 22 Q 86 11 79 26 Z','#f378a5','#ab446d',2);
      break;
    }
    case 'wild': {
      path(ctx,'M 15 150 L 26 112 Q 44 93 70 95 L 102 87 Q 134 100 150 142 Z',gradient(ctx,'#c2b65b','#637848'),'#303a2d',3);
      path(ctx,'M 64 92 L 101 87 L 98 108 L 80 122 L 66 109 Z','#e4a079','#61352f',2);
      ctx.save();ctx.translate(81,55);ctx.rotate(-.16);face(ctx,0,0,1.02,'#815238');ctx.restore();
      path(ctx,'M 61 111 L 82 127 L 103 105 L 117 154 L 45 154 Z','#f9deb0','#817354',2);
      line(ctx,'M 55 133 L 111 126 M 52 146 L 113 139','#b5574e',5);
      path(ctx,'M 112 94 L 135 97 L 130 136 L 111 133 Z','#f0b44d','#735532',2);
      ellipse(ctx,123,96,12,6,'#fff2d2','#ba8854',2);ellipse(ctx,108,116,9,7,'#e8a77e','#744332',1.5);
      text(ctx,'W',41,126,20,'#fcdd91',-.12);break;
    }
    case 'scatter': {
      stars(ctx,'#e662a0',time);
      ctx.save();ctx.translate(80,80);ctx.rotate(-.10);ctx.translate(-80,-80);
      path(ctx,'M 31 22 L 134 31 L 124 142 L 22 132 Z',gradient(ctx,'#f593cb','#ce357d'),'#632851',3.5);
      path(ctx,'M 37 32 L 123 39 L 116 130 L 33 122 Z','#382444','#ffe28c',2.3);
      path(ctx,'M 47 84 L 49 67 L 63 61 L 71 40 L 87 57 L 111 53 L 102 74 L 117 93 L 93 96 L 85 117 L 69 99 L 47 105 Z','#f7c653','#ed9956',2);
      text(ctx,'КУПОН',82,80,20,'#43233e',.07);text(ctx,'СЛЕД 22:00',79,114,8,'#ffe6b6',.07);
      path(ctx,'M 54 14 L 94 18 L 91 35 L 51 30 Z','#f6e6aa','#b99467',1.5);
      ctx.restore();break;
    }
    case 'vip': {
      stars(ctx,'#ffe689',time);
      ctx.save();ctx.translate(80,80);ctx.rotate(-.12);ctx.translate(-80,-80);
      path(ctx,'M 23 43 L 137 43 L 137 69 Q 124 80 137 91 L 137 121 L 23 121 L 23 94 Q 36 81 23 69 Z',gradient(ctx,'#ffe9a0','#ba8435',40,130),'#654226',3);
      path(ctx,'M 33 52 L 127 52 L 127 68 Q 114 80 127 94 L 127 112 L 33 112 L 33 94 Q 46 80 33 68 Z','#4d3540','#f4ce6e',2);
      text(ctx,'VIP',80,89,41,'#ffe292');text(ctx,'СТУДЕНТСКИ ГРАД',80,104,7,'#dec49b');
      line(ctx,'M 40 56 L 120 56 M 40 109 L 120 109','#dfac5c',1.5);
      path(ctx,'M 66 60 L 73 55 L 79 61 L 87 53 L 95 60 L 91 66 L 70 66 Z','#f9db77','#ae793c',1);
      ctx.restore();break;
    }
  }
  ctx.restore();
}

export class SymbolArtwork {
  readonly image = new Image();
  ready = false;
  constructor() {
    this.image.onload=()=>{this.ready=true;};
    this.image.src='/art/symbols.png';
  }
  draw(ctx:CanvasRenderingContext2D,symbol:SymbolId,cx:number,cy:number,width:number,height:number,time=0) {
    ctx.save();
    if(this.ready) {
      const [x,y,w,h]=ATLAS_BOUNDS[symbol],sx=this.image.naturalWidth/1448,sy=this.image.naturalHeight/1086;
      const scale=Math.min(width/w,height/h),dw=w*scale,dh=h*scale;
      ctx.drawImage(this.image,x*sx,y*sy,w*sx,h*sy,cx-dw/2,cy-dh/2,dw,dh);
    } else {
      ctx.translate(cx-width/2,cy-height/2);ctx.scale(width/160,height/160);drawIllustration(ctx,symbol,time);
    }
    ctx.restore();
  }
  drawWildPortrait(ctx:CanvasRenderingContext2D,cx:number,cy:number,size:number,time=0) {
    if(!this.ready){this.draw(ctx,'wild',cx,cy,size,size,time);return;}
    const sx=this.image.naturalWidth/1448,sy=this.image.naturalHeight/1086;
    ctx.drawImage(this.image,45*sx,700*sy,158*sx,158*sy,cx-size/2,cy-size/2,size,size);
  }
}

let previewArt:SymbolArtwork | undefined;
export function drawSymbolPreview(canvas:HTMLCanvasElement,symbol:SymbolId) {
  const ctx=canvas.getContext('2d');if(!ctx)return;
  previewArt??=new SymbolArtwork();
  const dpr=Math.min(devicePixelRatio||1,2),size=112;
  canvas.width=size*dpr;canvas.height=size*dpr;canvas.style.width=`${size}px`;canvas.style.height=`${size}px`;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
  previewArt.draw(ctx,symbol,size/2,size/2,100,100);
  if(!previewArt.ready)previewArt.image.addEventListener('load',()=>drawSymbolPreview(canvas,symbol),{once:true});
}
