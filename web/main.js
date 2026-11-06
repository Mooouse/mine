import init, { Game } from "./pkg/mine_web.js";

// MINE web client. World generation, physics, edits and saves are all Rust/WASM.
// Only browser input, HTML controls and GPU drawing live in JavaScript.

const $ = id => document.getElementById(id);
const canvas = $("game");
const isMobile = matchMedia("(pointer: coarse)").matches;
const BLOCKS = [
  null,
  {name:"GRASS",hex:"#659b56"}, {name:"DIRT",hex:"#82634a"},
  {name:"STONE",hex:"#8d9792"}, {name:"SAND",hex:"#e8c78d"},
  {name:"OAK LOG",hex:"#89623f"}, {name:"LEAVES",hex:"#51865a"},
  {name:"SNOW",hex:"#e1e9e9"}, {name:"WATER",hex:"#459fc9"},
  {name:"BRICK",hex:"#a56152"}, {name:"GLASS",hex:"#b2dfe5"},
  {name:"PLANKS",hex:"#cb9a5b"}, {name:"BASALT",hex:"#444d5a"},
  {name:"LUMEN",hex:"#f8d775"}, {name:"FLOWER",hex:"#ef8da6"},
  {name:"CLAY",hex:"#a3a1a4"}, {name:"CACTUS",hex:"#4f9759"},
];
const HOTBAR_BLOCKS = [1,2,3,4,5,6,7,9,13,10,11,12,15,16,8,14];
const FACES = [
  { d:[1,0,0], n:[1,0,0], c:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]], light:.78 },
  { d:[-1,0,0],n:[-1,0,0],c:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]], light:.73 },
  { d:[0,1,0], n:[0,1,0], c:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]], light:1.0 },
  { d:[0,-1,0],n:[0,-1,0],c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]], light:.53 },
  { d:[0,0,1], n:[0,0,1], c:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]], light:.86 },
  { d:[0,0,-1],n:[0,0,-1],c:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]], light:.67 }
];
const TRI = [0,1,2,0,2,3];
const CHUNK=16, WORLD_HEIGHT=64;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let game,gl,worldProgram,skyProgram,lineProgram,vaoSky,vaoLine,vboLine;
let playing=false, paused=false, menuVisible=true, selected=0, page=0;
let yaw=.24,pitch=-.13,sensitivity=1, renderDistance=3, target=[], player=[8,34,8], seed=42042;
let previousTime=0, fps=60, frame=0, frameAccumulator=0, lastAutosave=0;
const held=new Set();
let joystick={x:0,y:0,pointer:null};
let touchLook={pointer:null,x:0,y:0};
let mouseLastAction=0, leftHeld=false, rightHeld=false, shouldBuildMeshes=true;
const chunkData=new Map(), meshes=new Map(), buildQueue=[];
const glState={camera:[0,0,0],vp:new Float32Array(16)};
const MOBILE_ACTIONS = {jump:false,break:false,place:false};
let glReady=false, visibleChunks=0;

function toast(message) {
  const box=$("notifications");
  const p=document.createElement("div");
  p.className="toast";
  p.textContent=message;
  box.prepend(p);
  while(box.children.length>3) box.lastElementChild.remove();
  setTimeout(()=>{ p.style.opacity="0";p.style.transition="opacity .25s";setTimeout(()=>p.remove(),280); },2600);
}

function createShader(type,source){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function createProgram(vs,fs){
  const program=gl.createProgram();
  gl.attachShader(program,createShader(gl.VERTEX_SHADER,vs));
  gl.attachShader(program,createShader(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  return program;
}

const worldVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in float aMat;
layout(location=3) in float aBright;
uniform mat4 uVP;
out vec3 vPos;
out vec3 vNorm;
out float vMat;
out float vBright;
void main(){
  vPos=aPos;vNorm=aNorm;vMat=aMat;vBright=aBright;
  gl_Position=uVP*vec4(aPos,1.);
}`;
const worldFS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNorm; in float vMat; in float vBright;
uniform vec3 uCam;uniform vec3 uFog;uniform float uFogStart;
uniform float uDay;uniform float uTime;
out vec4 outColor;
float hash3(vec3 p){
 p=fract(p*.1031);p+=dot(p,p.yxz+33.33);
 return fract((p.x+p.y)*p.z);
}
vec3 palette(float m,vec3 n,vec3 p){
 float top=step(.5,n.y); float side=1.-abs(n.y);
 if(m<1.5) {
   vec3 dirt=vec3(.44,.315,.225);
   float band=step(.78,fract(p.y+.001));
   return mix(dirt,vec3(.35,.56,.265),max(top,band*side));
 }
 if(m<2.5) return vec3(.44,.32,.245);
 if(m<3.5) return vec3(.49,.54,.545);
 if(m<4.5) return vec3(.87,.735,.505);
 if(m<5.5){
   if(top>0.5) return vec3(.67,.49,.29);
   return vec3(.46,.295,.15)*(.94+.07*sin(p.y*12.+p.x*14.));
 }
 if(m<6.5)return vec3(.27,.48,.30);
 if(m<7.5)return mix(vec3(.69,.77,.79),vec3(.91,.97,.96),top);
 if(m<8.5)return vec3(.26,.60,.79);
 if(m<9.5){
    vec3 q=fract(p*2.);float mortar=step(q.y,.045)+step(fract(p.x*2.+floor(p.y*2.)*.5),.052);
    return mix(vec3(.61,.315,.255),vec3(.31,.23,.22),min(mortar,1.));
 }
 if(m<10.5)return vec3(.61,.84,.88);
 if(m<11.5){float seam=step(fract(p.y*2.),.04);return mix(vec3(.71,.48,.25),vec3(.36,.22,.13),seam);}
 if(m<12.5)return vec3(.23,.27,.34);
 if(m<13.5)return vec3(1.,.84,.40);
 if(m<14.5)return mix(vec3(.22,.55,.24),vec3(.96,.43,.58),step(.55,fract(p.y)));
 if(m<15.5)return vec3(.58,.57,.62);
 return vec3(.26,.56,.31);
}
void main(){
  vec3 p=vPos-vNorm*.001;
  vec3 color=palette(vMat,vNorm,p);
  float gran=hash3(floor(vPos*4.0)+vec3(2.1))*2.-1.;
  float patch=hash3(floor(vPos*1.22))*2.-1.;
  color*=1.+gran*.075+patch*.075;
  // Lighting is oriented by the mesher, with subtle ambient occlusion.
  color *= mix(.38,1.,uDay) * vBright + (1.-uDay)*.035;
  if(vMat>12.5&&vMat<13.5)color += vec3(.36,.28,.08);
  if(vMat>7.5&&vMat<8.5)color = mix(color,vec3(.32,.72,.91),.17);
  if(vMat>9.5&&vMat<10.5)color = mix(color,vec3(.74,.91,.93),.42);
  float distanceToCamera=length(vPos-uCam);
  float fog=smoothstep(uFogStart,uFogStart+40.,distanceToCamera);
  color=mix(color,uFog,fog*.94);
  float alpha=1.;
  if(vMat>7.5&&vMat<8.5)alpha=.76;
  if(vMat>9.5&&vMat<10.5)alpha=.5;
  outColor=vec4(color,alpha);
}`;
const skyVS = `#version 300 es
precision highp float;
void main() {
 vec2 p=vec2(float((gl_VertexID << 1) & 2),float(gl_VertexID & 2));
 gl_Position=vec4(p*2.-1.,1.,1.);
}`;
const skyFS = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uLook;
uniform float uDay;
uniform float uTime;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.545);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
            mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution;
 float h=clamp((uv.y-.40)+uLook.y*.36,-.4,1.2);
 vec3 night=vec3(.035,.07,.14);
 vec3 horizon=vec3(.69,.85,.83);
 vec3 zenith=vec3(.15,.42,.67);
 vec3 day=mix(horizon,zenith,smoothstep(.05,.95,h));
 vec3 col=mix(night,day,uDay);
 float cloudMask=smoothstep(.12,.72,h);
 vec2 c=vec2((uv.x+uLook.x*.08)*5.+uTime*.0009, (uv.y+uLook.y*.1)*4.);
 float cn=noise(c*2.3)*.56+noise(c*5.1)*.31+noise(c*10.7)*.13;
 float cloud=smoothstep(.55,.77,cn)*cloudMask;
 col=mix(col,vec3(.90,.94,.91)*(.60+uDay*.4),cloud*.31*uDay);
 float sun=length((uv-vec2(.74,.72))*vec2(uResolution.x/uResolution.y,1.));
 col+=vec3(1.,.69,.30)*exp(-sun*17.)*.20*uDay;
 col+=vec3(1.,.91,.66)*smoothstep(.032,.023,sun)*.7*uDay;
 if(uDay<.35){
   float stars=step(.998,hash(floor(uv*uResolution*.55)));
   col+=vec3(.8,.86,1.)*stars*(.35-uDay)*1.4;
 }
 outColor=vec4(col,1.);
}`;
const lineVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
void main(){gl_Position=uVP*vec4(aPos,1.);}`;
const lineFS = `#version 300 es
precision highp float;
out vec4 outColor;
void main(){outColor=vec4(.85,1.,.62,.87);}`;

function initGL(){
  gl=canvas.getContext("webgl2",{alpha:false,antialias:true,depth:true,powerPreference:"high-performance"});
  if(!gl)throw new Error("WebGL2 is unavailable in this browser");
  worldProgram=createProgram(worldVS,worldFS);
  skyProgram=createProgram(skyVS,skyFS);
  lineProgram=createProgram(lineVS,lineFS);
  vaoSky=gl.createVertexArray();
  vaoLine=gl.createVertexArray();
  vboLine=gl.createBuffer();
  gl.bindVertexArray(vaoLine);
  gl.bindBuffer(gl.ARRAY_BUFFER,vboLine);
  gl.bufferData(gl.ARRAY_BUFFER,24*3*4,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  resize();
  addEventListener("resize",resize,{passive:true});
  glReady=true;
}
function resize(){
  if(!gl)return;
  const dpr=Math.min(devicePixelRatio||1,isMobile?1.6:2);
  canvas.width=Math.max(1,Math.floor(canvas.clientWidth*dpr));
  canvas.height=Math.max(1,Math.floor(canvas.clientHeight*dpr));
  gl.viewport(0,0,canvas.width,canvas.height);
}

function rawChunk(cx,cz) {
  const key=cx+","+cz;
  let c=chunkData.get(key);
  if(!c) { c=game.chunk(cx,cz);chunkData.set(key,c); }
  return c;
}
function blockAt(x,y,z){
  if(y<0)return 12;
  if(y>=WORLD_HEIGHT)return 0;
  const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
  const lx=x-cx*CHUNK,lz=z-cz*CHUNK;
  return rawChunk(cx,cz)[(y*CHUNK+lz)*CHUNK+lx];
}
function facesMesh(cx,cz){
  const solid=[],trans=[];
  const x0=cx*CHUNK,z0=cz*CHUNK;
  const chunk=rawChunk(cx,cz);
  const addFace=(buffer,x,y,z,id,face)=>{
    const corners=face.c;
    for(let k=0;k<6;k++){
      const c=corners[TRI[k]];
      buffer.push(x+c[0],y+c[1],z+c[2],face.n[0],face.n[1],face.n[2],id,face.light);
    }
  };
  for(let y=0;y<WORLD_HEIGHT;y++){
    for(let z=0;z<CHUNK;z++){
      for(let x=0;x<CHUNK;x++){
        const id=chunk[(y*CHUNK+z)*CHUNK+x];
        if(!id)continue;
        if(id===14){
          const wx=x0+x,wz=z0+z;
          const stem=[[.22,.18,.22],[.78,.82,.78],[.78,.18,.78],[.22,.82,.22]];
          const faces=[[0,2,1],[0,3,2],[2,0,1],[2,3,0]];
          for(const f of faces)for(const v of f){
            const p=stem[v];solid.push(wx+p[0],y+p[1],wz+p[2],0,1,0,14,1);
          }
          continue;
        }
        const wx=x0+x,wz=z0+z;
        const transparent=id===8||id===10;
        const buf=transparent?trans:solid;
        for(const face of FACES){
          const next=blockAt(wx+face.d[0],y+face.d[1],wz+face.d[2]);
          let exposed;
          if(id===8)exposed=next===0 || next===14;
          else if(id===10)exposed=next!==10;
          else exposed=next===0 || next===8 || next===10 || next===14;
          if(exposed)addFace(buf,wx,y,wz,id,face);
        }
      }
    }
  }
  return [solid,trans];
}
function gpuMesh(data){
  if(!data.length)return null;
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  const stride=8*4;
  for(const [loc,size,offset] of [[0,3,0],[1,3,12],[2,1,24],[3,1,28]]) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,offset);
  }
  gl.bindVertexArray(null);
  return {vao,buffer,count:data.length/8};
}
function disposeMesh(mesh){
  if(!mesh)return;
  for(const m of [mesh.solid,mesh.trans]){
    if(m){gl.deleteVertexArray(m.vao);gl.deleteBuffer(m.buffer);}
  }
}
function rebuild(cx,cz){
  const key=cx+","+cz;
  const [a,b]=facesMesh(cx,cz);
  const old=meshes.get(key);
  if(old)disposeMesh(old);
  meshes.set(key,{solid:gpuMesh(a),trans:gpuMesh(b),cx,cz});
}
function invalidateBlocks(x,z) {
  const cx=Math.floor(x/16),cz=Math.floor(z/16);
  const keys=[[cx,cz],[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]];
  for(const [a,b] of keys){
    const key=a+","+b;
    if(chunkData.has(key))chunkData.set(key,game.chunk(a,b));
    if(meshes.has(key))rebuild(a,b);
  }
}
function updateVisibleChunks(){
  const cx=Math.floor(player[0]/CHUNK),cz=Math.floor(player[2]/CHUNK);
  const list=[];
  for(let dz=-renderDistance;dz<=renderDistance;dz++){
    for(let dx=-renderDistance;dx<=renderDistance;dx++){
      if(dx*dx+dz*dz > (renderDistance+.6)**2)continue;
      const x=cx+dx,z=cz+dz,key=x+","+z;
      if(!meshes.has(key)) list.push({x,z,d:dx*dx+dz*dz});
    }
  }
  list.sort((a,b)=>a.d-b.d);
  // Limit per-frame chunk work to avoid long stalls while exploring.
  for(let i=0;i<Math.min(isMobile?1:2,list.length);i++)rebuild(list[i].x,list[i].z);
  for(const [key,m] of meshes) {
    if(Math.abs(m.cx-cx)>renderDistance+2 || Math.abs(m.cz-cz)>renderDistance+2) {
      disposeMesh(m);
      meshes.delete(key);
    }
  }
  visibleChunks=meshes.size;
}

function perspective(fovy,aspect,near,far){
  const t=1/Math.tan(fovy/2),m=new Float32Array(16);
  m[0]=t/aspect;m[5]=t;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);
  return m;
}
function lookAt(eye,forward){
  const e=eye,z=[-forward[0],-forward[1],-forward[2]];
  const zl=Math.hypot(...z);z[0]/=zl;z[1]/=zl;z[2]/=zl;
  let x=[z[2],0,-z[0]];let xl=Math.hypot(...x);if(xl<.00001)xl=1;
  x=x.map(n=>n/xl);
  const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -x[0]*e[0]-x[1]*e[1]-x[2]*e[2],
    -y[0]*e[0]-y[1]*e[1]-y[2]*e[2],
    -z[0]*e[0]-z[1]*e[1]-z[2]*e[2],1
  ]);
}
function multiply(a,b){
  const out=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)
    out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}
function skyColor(day){return [.038+day*.59,.07+day*.73,.14+day*.70];}
function drawSelection(vp,coord){
  if(!coord || coord.length!==7)return;
  const [x,y,z]=coord,eps=.003;
  const pts=[];
  const points=[
    [0,0,0],[1,0,0],[1,1,0],[0,1,0],
    [0,0,1],[1,0,1],[1,1,1],[0,1,1]
  ];
  for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){
    for(const p of [points[a],points[b]])pts.push(x+p[0]+(p[0]?eps:-eps),y+p[1]+(p[1]?eps:-eps),z+p[2]+(p[2]?eps:-eps));
  }
  gl.useProgram(lineProgram);
  gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram,"uVP"),false,vp);
  gl.bindVertexArray(vaoLine);
  gl.bindBuffer(gl.ARRAY_BUFFER,vboLine);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(pts));
  gl.disable(gl.CULL_FACE);
  gl.lineWidth(2);
  gl.drawArrays(gl.LINES,0,24);
  gl.enable(gl.CULL_FACE);
}
function render(time){
  if(!glReady||!game)return;
  const cx=player[0],cy=player[1]+1.62,cz=player[2];
  const cp=Math.cos(pitch);
  const forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  const eye=[cx,cy,cz];
  const proj=perspective(70*Math.PI/180,canvas.width/canvas.height,.055,Math.max(160,renderDistance*16+72));
  const vp=multiply(proj,lookAt(eye,forward));
  glState.vp=vp;glState.camera=eye;
  const day=clamp(.35+Math.sin(game.time()/1200*Math.PI*2)*.85,.15,1);
  const fog=skyColor(day);
  gl.clearColor(...fog,1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(skyProgram);
  gl.uniform2f(gl.getUniformLocation(skyProgram,"uResolution"),canvas.width,canvas.height);
  gl.uniform2f(gl.getUniformLocation(skyProgram,"uLook"),yaw,pitch);
  gl.uniform1f(gl.getUniformLocation(skyProgram,"uDay"),day);
  gl.uniform1f(gl.getUniformLocation(skyProgram,"uTime"),time);
  gl.bindVertexArray(vaoSky);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(worldProgram);
  gl.uniformMatrix4fv(gl.getUniformLocation(worldProgram,"uVP"),false,vp);
  gl.uniform3f(gl.getUniformLocation(worldProgram,"uCam"),...eye);
  gl.uniform3f(gl.getUniformLocation(worldProgram,"uFog"),...fog);
  gl.uniform1f(gl.getUniformLocation(worldProgram,"uFogStart"),renderDistance*16*.78);
  gl.uniform1f(gl.getUniformLocation(worldProgram,"uDay"),day);
  gl.uniform1f(gl.getUniformLocation(worldProgram,"uTime"),time);
  // opaque before translucent
  for(const m of meshes.values()){
    if(!m.solid)continue;
    gl.bindVertexArray(m.solid.vao);
    gl.drawArrays(gl.TRIANGLES,0,m.solid.count);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  for(const m of meshes.values()){
    if(!m.trans)continue;
    gl.bindVertexArray(m.trans.vao);
    gl.drawArrays(gl.TRIANGLES,0,m.trans.count);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  if(playing&&!paused)drawSelection(vp,target);
  gl.bindVertexArray(null);
}
function getLook(){
  const cp=Math.cos(pitch);
  return [Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
}
function getTarget(){
  const f=getLook();
  return game.raycast(player[0],player[1]+1.62,player[2],...f,7);
}
function action(place=false){
  if(!playing||paused||menuVisible)return;
  const found=getTarget();
  if(found.length!==7)return;
  const [x,y,z,tx,ty,tz,id]=found;
  if(place){
    const chosen=HOTBAR_BLOCKS[selected];
    const overlap = Math.abs(player[0]-(tx+.5)) < .8 &&
                    Math.abs(player[2]-(tz+.5)) < .8 &&
                    ty<player[1]+1.76 && ty+1>player[1];
    if(overlap)return;
    if(game.set_block(tx,ty,tz,chosen)){
      invalidateBlocks(tx,tz);
      player=game.player();
    }
  }else if(game.set_block(x,y,z,0)){
    invalidateBlocks(x,z);
  }
}
function renderHotbar(){
  const hotbar=$("hotbar");
  hotbar.replaceChildren();
  const start=page*9;
  HOTBAR_BLOCKS.slice(start,start+9).forEach((id,i)=>{
    const info=BLOCKS[id];
    const n=start+i;
    const el=document.createElement("button");
    el.className="slot"+(n===selected?" selected":"");
    el.setAttribute("aria-label",info.name);
    el.title=info.name;
    el.innerHTML='<span class="num">'+(i+1)+'</span><span class="cube" style="background:'+info.hex+'"></span><span class="name">'+info.name+'</span>';
    el.addEventListener("click",()=>{selected=n;renderHotbar()});
    hotbar.appendChild(el);
  });
}
function setSelected(index){
  selected=(index+HOTBAR_BLOCKS.length)%HOTBAR_BLOCKS.length;
  page=Math.floor(selected/9);
  renderHotbar();
}
function renderHUD(){
  $("coordinates").textContent=player.slice(0,3).map(v=>Math.floor(v)).join(", ");
  $("fps").textContent=Math.round(fps)+" FPS";
  $("mode").firstChild.textContent=game.flying()?"FLY MODE ":"WALK MODE ";
  $("block-count").textContent=game.edits_count().toLocaleString();
  $("block-name").textContent=target.length===7?BLOCKS[target[6]]?.name||"BLOCK":"";
  const degrees=(yaw*180/Math.PI%360+360)%360;
  const dirs=["N","NE","E","SE","S","SW","W","NW"];
  $("compass").innerHTML=dirs[Math.round(degrees/45)%8]+' <span>•</span> '+String(Math.round(degrees)).padStart(3,"0")+'°';
}
function save(){
  if(!game)return;
  try {
    localStorage.setItem("mine_world_"+seed,game.export_save());
    localStorage.setItem("mine_last_seed",String(seed));
  }catch(e){toast("Storage limit reached. Cannot save additional changes.");}
}
function switchWorld(newSeed,loadSaved,skipOldSave=false){
  if(!skipOldSave)save();
  for(const mesh of meshes.values())disposeMesh(mesh);
  meshes.clear();chunkData.clear();buildQueue.length=0;
  seed=Number(newSeed)>>>0||42042;
  game=new Game(seed);
  if(loadSaved){
    const data=localStorage.getItem("mine_world_"+seed);
    if(data)game.import_save(data);
  }
  $("seedInput").value=seed;
  player=game.player();
  localStorage.setItem("mine_last_seed",String(seed));
  renderHUD();
}
function start(){
  playing=true;paused=false;menuVisible=false;
  $("menu").classList.add("hidden");
  $("pause").classList.add("hidden");
  $("hud").classList.remove("hidden");
  if(isMobile)$("mobile-controls").classList.remove("hidden");
  else canvas.requestPointerLock?.().catch(()=>{});
  toast("Welcome to your world! "+(isMobile?"Drag to look around.":"Press F to toggle flight."));
}
function pause(){
  if(!playing || paused)return;
  paused=true;leftHeld=false;rightHeld=false;save();
  $("pause").classList.remove("hidden");
  document.exitPointerLock?.();
}
function resume(){
  if(!playing)return;
  paused=false;
  $("pause").classList.add("hidden");
  if(!isMobile)canvas.requestPointerLock?.().catch(()=>{});
}
function returnMenu(){
  save();paused=false;playing=false;menuVisible=true;
  $("menu").classList.remove("hidden");
  $("pause").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("mobile-controls").classList.add("hidden");
  document.exitPointerLock?.();
}
function connectControls(){
  $("playButton").addEventListener("click",start);
  $("newButton").addEventListener("click",()=>{
    const n=Number($("seedInput").value)||42042;
    const old=localStorage.getItem("mine_world_"+(n>>>0));
    if(old && !confirm("Create a new world with this seed? The previous save for this seed will be replaced."))return;
    localStorage.removeItem("mine_world_"+(n>>>0));
    switchWorld(n,false,true);
    start();
  });
  $("randomSeed").addEventListener("click",()=>{
    const n=(Math.floor(Math.random()*2147483647)||42);
    $("seedInput").value=n;
  });
  $("seedInput").addEventListener("change",()=>switchWorld(Number($("seedInput").value),true));
  $("pauseButton").addEventListener("click",pause);
  $("resumeButton").addEventListener("click",resume);
  $("leaveButton").addEventListener("click",returnMenu);
  $("saveButton").addEventListener("click",()=>{save();toast("WORLD SAVED");});
  $("renderDistance").addEventListener("change",e=>{renderDistance=Number(e.target.value);localStorage.setItem("mine_distance",String(renderDistance));});
  $("sensitivity").addEventListener("input",e=>{sensitivity=Number(e.target.value);localStorage.setItem("mine_sensitivity",String(sensitivity));});
  addEventListener("keydown",e=>{
    if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)return;
    if(["Space","Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    if(e.code==="Escape"){
      if(menuVisible)return;
      if(paused)resume();else pause();
      return;
    }
    if(!playing||paused)return;
    held.add(e.code);
    if(/^Digit[1-9]$/.test(e.code))setSelected(page*9+Number(e.code.slice(5))-1);
    if(e.code==="Tab"&&!e.repeat){page=1-page;selected=page*9;renderHotbar();toast("MATERIAL PALETTE "+(page+1)+"/2");}
    if(e.code==="KeyF"&&!e.repeat){game.set_flying(!game.flying());toast(game.flying()?"FLIGHT MODE ENABLED":"WALK MODE ENABLED");}
  });
  addEventListener("keyup",e=>held.delete(e.code));
  addEventListener("blur",()=>{held.clear();leftHeld=false;rightHeld=false;});
  document.addEventListener("mousemove",e=>{
    if(document.pointerLockElement!==canvas||!playing||paused)return;
    yaw+=e.movementX*.0025*sensitivity;
    pitch=clamp(pitch-e.movementY*.0025*sensitivity,-1.54,1.54);
  });
  canvas.addEventListener("mousedown",e=>{
    if(isMobile||!playing||paused||menuVisible)return;
    if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.().catch(()=>{});return;}
    if(e.button===0){leftHeld=true;action(false);mouseLastAction=performance.now();}
    if(e.button===2){rightHeld=true;action(true);mouseLastAction=performance.now();}
  });
  addEventListener("mouseup",e=>{if(e.button===0)leftHeld=false;if(e.button===2)rightHeld=false;});
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  canvas.addEventListener("wheel",e=>{
    if(!playing||paused)return;
    e.preventDefault();
    setSelected(selected+(e.deltaY>0?1:-1));
  },{passive:false});
  document.addEventListener("pointerlockchange",()=>{
    if(!isMobile&&playing&&!menuVisible&&!paused&&document.pointerLockElement!==canvas)pause();
  });
  if(isMobile)connectTouch();
}
function connectTouch(){
  canvas.addEventListener("pointerdown",e=>{
    if(!playing||paused||menuVisible||touchLook.pointer!==null)return;
    touchLook={pointer:e.pointerId,x:e.clientX,y:e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove",e=>{
    if(e.pointerId!==touchLook.pointer)return;
    const dx=e.clientX-touchLook.x,dy=e.clientY-touchLook.y;
    yaw+=dx*.004*sensitivity;
    pitch=clamp(pitch-dy*.004*sensitivity,-1.5,1.5);
    touchLook.x=e.clientX;touchLook.y=e.clientY;
  });
  function resetLook(e){if(e.pointerId===touchLook.pointer)touchLook.pointer=null;}
  canvas.addEventListener("pointerup",resetLook);
  canvas.addEventListener("pointercancel",resetLook);
  const base=$("joystick"),stick=$("stick");
  function moveStick(e){
    const rect=base.getBoundingClientRect();
    const x=e.clientX-(rect.left+rect.width/2),y=e.clientY-(rect.top+rect.height/2);
    const radius=rect.width*.33,len=Math.hypot(x,y);
    const px=len>radius?x/len*radius:x,py=len>radius?y/len*radius:y;
    stick.style.transform="translate("+px+"px,"+py+"px)";
    joystick.x=px/radius;joystick.y=-py/radius;
  }
  base.addEventListener("pointerdown",e=>{e.preventDefault();joystick.pointer=e.pointerId;base.setPointerCapture(e.pointerId);moveStick(e);});
  base.addEventListener("pointermove",e=>{if(e.pointerId===joystick.pointer)moveStick(e);});
  const resetJoy=e=>{if(e.pointerId!==joystick.pointer)return;joystick={x:0,y:0,pointer:null};stick.style.transform="translate(0,0)";};
  base.addEventListener("pointerup",resetJoy);base.addEventListener("pointercancel",resetJoy);
  for(const [id,key] of [["touch-break","break"],["touch-place","place"],["touch-jump","jump"]]){
    const button=$(id);
    button.addEventListener("pointerdown",e=>{e.preventDefault();button.setPointerCapture(e.pointerId);MOBILE_ACTIONS[key]=true;if(key!=="jump")action(key==="place");});
    button.addEventListener("pointerup",()=>MOBILE_ACTIONS[key]=false);
    button.addEventListener("pointercancel",()=>MOBILE_ACTIONS[key]=false);
  }
}
function simulation(dt,time){
  const fw=(held.has("KeyW")||held.has("ArrowUp")?1:0)-(held.has("KeyS")||held.has("ArrowDown")?1:0)+joystick.y;
  const st=(held.has("KeyD")||held.has("ArrowRight")?1:0)-(held.has("KeyA")||held.has("ArrowLeft")?1:0)+joystick.x;
  const mx=Math.sin(yaw)*fw+Math.cos(yaw)*st;
  const mz=-Math.cos(yaw)*fw+Math.sin(yaw)*st;
  const jump=held.has("Space")||MOBILE_ACTIONS.jump;
  const down=held.has("ControlLeft")||held.has("KeyC")?1:0;
  game.step(dt,mx,mz,jump,held.has("ShiftLeft")||held.has("ShiftRight"),down);
  player=game.player();
  target=getTarget();
  if((leftHeld||rightHeld||MOBILE_ACTIONS.break||MOBILE_ACTIONS.place)&&time-mouseLastAction>210) {
    action(rightHeld||MOBILE_ACTIONS.place);
    mouseLastAction=time;
  }
}
function frameLoop(time){
  const dt=clamp((time-previousTime)/1000||.016,0,.05);previousTime=time;
  frame++;frameAccumulator+=dt;
  if(frameAccumulator>.42){fps=frame/frameAccumulator;frame=0;frameAccumulator=0;}
  if(playing&&!paused)simulation(dt,time);
  else player=game.player();
  updateVisibleChunks();
  render(time);
  if(playing&&!paused&&Math.floor(time/180)%2===0)renderHUD();
  if(time-lastAutosave>5000){if(playing&&!paused)save();lastAutosave=time;}
  requestAnimationFrame(frameLoop);
}
async function main(){
  try{
    $("loading-progress").style.width="23%";
    const wasm=await init();
    $("loading-message").textContent="GENERATING A NEW WORLD";
    $("loading-progress").style.width="68%";
    const storedSeed=Number(localStorage.getItem("mine_last_seed"))||42042;
    seed=storedSeed>>>0||42042;
    game=new Game(seed);
    const data=localStorage.getItem("mine_world_"+seed);
    if(data)game.import_save(data);
    player=game.player();
    $("seedInput").value=seed;
    initGL();
    renderHotbar();
    connectControls();
    renderDistance=Number(localStorage.getItem("mine_distance"))||3;
    renderDistance=clamp(renderDistance,2,5);
    sensitivity=Number(localStorage.getItem("mine_sensitivity"))||1;
    $("renderDistance").value=String(renderDistance);
    $("sensitivity").value=String(sensitivity);
    for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){
      const cx=Math.floor(player[0]/16)+x,cz=Math.floor(player[2]/16)+z;
      rebuild(cx,cz);
    }
    $("loading-progress").style.width="100%";
    renderHUD();
    setTimeout(()=>{$("loading").style.opacity="0";setTimeout(()=>$("loading").remove(),520);},190);
    requestAnimationFrame(frameLoop);
  }catch(e){
    console.error(e);
    $("loading-message").textContent="STARTUP FAILED: "+e.message;
    $("loading-message").style.color="#ffab9a";
    $("loading-progress").style.background="#ed8277";
  }
}
main();
