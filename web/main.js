import init, { Game } from "./pkg/mine_web.js";
import {MiniGames} from "./minigames.js";
import {SurvivalUI} from "./survival-ui.js";

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
  ...Array(8).fill(null), // IDs 17–24: flowing water.
  {name:"COBBLESTONE",hex:"#7a817c"}, {name:"GRAVEL",hex:"#a0a096"},
  {name:"MOSS",hex:"#5b8d50"}, {name:"DARK OAK LOG",hex:"#574232"},
  {name:"COPPER ORE",hex:"#b87e68"}, {name:"GOLD ORE",hex:"#c6a75c"},
  {name:"RED SAND",hex:"#b86943"}, {name:"GLOWSTONE",hex:"#f5ce83"},
];
BLOCKS[33]={name:"WORKBENCH",hex:"#9e754d"};
const MATERIALS = [...Array.from({length:16},(_,i)=>i+1),...Array.from({length:8},(_,i)=>i+25)];
const INITIAL_HOTBAR = [1,2,3,4,5,6,7,9,8];
const INVENTORY_SIZE=36;
let inventorySlots=Array.from({length:INVENTORY_SIZE},(_,i)=>INITIAL_HOTBAR[i]||0);
let inventoryOpen=false, heldItem=0, offhandBlock=0, inventoryFilter="all", lastSpaceTap=-1000, lastWaterTick=0;
function loadInventory(reset=false){
  inventorySlots=Array.from({length:INVENTORY_SIZE},(_,i)=>INITIAL_HOTBAR[i]||0);
  if(!reset){
    try{
      const stored=JSON.parse(localStorage.getItem("mine_inventory_"+seed));
      if(Array.isArray(stored)&&stored.length===INVENTORY_SIZE){
        inventorySlots=stored.map(v=>Number.isInteger(v)&&v>=0&&(v<=16||(v>=25&&v<=32))?v:0);
      }
    }catch(e){/* Ignore outdated inventory format. */}
  }
  offhandBlock=reset?0:(Number(localStorage.getItem("mine_offhand_"+seed))||0);
  if(offhandBlock<0||(offhandBlock>16&&offhandBlock<25)||offhandBlock>32)offhandBlock=0;
  selected=clamp(selected,0,8);
  renderHotbar();
}
function saveInventory(){
  if(isSurvival())return;
  try{
    localStorage.setItem("mine_inventory_"+seed,JSON.stringify(inventorySlots));
    localStorage.setItem("mine_offhand_"+seed,String(offhandBlock));
  }catch(e){}
}
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
let playing=false, paused=false, menuVisible=true, selected=0;
let minigames=null,botVao=null,botVbo=null,arenaWorldActive=false;
let survivalUI=null,worldMode="creative",requestedMode="creative",survivalDead=false;
const isSurvival=()=>worldMode==="survival"&&!arenaWorldActive;
const saveKey=(id,mode=worldMode)=>mode==="survival"?"mine_survival_world_"+id:"mine_world_"+id;
const survivalKey=id=>"mine_survival_state_"+id;
function updateControlsHint(){
  const node=$("controlsHint");
  if(!node)return;
  if(!node.dataset.creativeMarkup)node.dataset.creativeMarkup=node.innerHTML;
  if(isSurvival()){
    node.textContent="WASD MOVE · SPACE JUMP · CTRL SPRINT · HOLD LEFT TO MINE · RIGHT PLACE/EAT · E CRAFT · R EAT";
  }else node.innerHTML=node.dataset.creativeMarkup;
}
function updateModePicker(){
  for(const btn of document.querySelectorAll("[data-world-mode]")){
    const active=btn.dataset.worldMode===requestedMode;
    btn.classList.toggle("selected",active);
    btn.setAttribute("aria-pressed",String(active));
  }
}
let yaw=.24,pitch=-.13,sensitivity=1, fov=75, soundEnabled=true, debugVisible=false, renderDistance=3, target=[], player=[8,34,8], seed=42042;
let previousTime=0, fps=60, frame=0, frameAccumulator=0, lastAutosave=0;
const held=new Set();
let joystick={x:0,y:0,pointer:null};
let touchLook={pointer:null,x:0,y:0};
let mouseLastAction=0, creatureLastAttack=0, leftHeld=false, rightHeld=false, shouldBuildMeshes=true, crouchBlend=0;
const chunkData=new Map(), meshes=new Map(), buildQueue=[];
const glState={camera:[0,0,0],vp:new Float32Array(16)};
const MOBILE_ACTIONS = {jump:false,break:false,place:false};
let glReady=false, visibleChunks=0;
const waterDirty=new Set();
let itemToastTimer=0, helpTimer=0, audioContext=null;
function showSelectedName(){
  const id=isSurvival()?(survivalUI?.slots()[selected].id||0):inventorySlots[selected];
  const node=$("itemToast");
  clearTimeout(itemToastTimer);
  node.textContent=(isSurvival()?survivalUI?.itemName(id):BLOCKS[id]?.name)||"";
  node.classList.toggle("hidden",!id);
  if(id)itemToastTimer=setTimeout(()=>node.classList.add("hidden"),1700);
}
function soundEffect(place){
  if(!soundEnabled||menuVisible)return;
  try {
    const AudioAPI=window.AudioContext||window.webkitAudioContext;
    if(!AudioAPI)return;
    if(!audioContext)audioContext=new AudioAPI();
    const ctx=audioContext;
    if(ctx.state==="suspended")ctx.resume().catch(()=>{});
    const length=Math.floor(ctx.sampleRate*(place?.075:.135));
    const buffer=ctx.createBuffer(1,length,ctx.sampleRate),samples=buffer.getChannelData(0);
    let seed=1717+(place?193:59);
    for(let i=0;i<length;i++){
      seed=(1664525*seed+1013904223)>>>0;
      samples[i]=((seed/4294967296)*2-1)*Math.pow(1-i/length,place?1.5:2.1);
    }
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;filter.type="lowpass";filter.frequency.value=place?520:860;
    gain.gain.value=place?.065:.08;
    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
    source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  } catch(e) { /* Audio disabled or browser suspended. */ }
}
function spawnDebris(id){
  const box=$("particles");
  if(!box)return;
  const color=BLOCKS[id]?.hex||"#bdad8c";
  for(let i=0;i<9;i++){
    const p=document.createElement("i");
    p.className="debris";
    p.style.background=color;
    p.style.setProperty("--dx",(Math.random()*120-60)+"px");
    p.style.setProperty("--dy",(Math.random()*90-70)+"px");
    p.style.setProperty("--rot",(Math.random()*250-125)+"deg");
    p.style.left="50%";p.style.top="50%";
    box.appendChild(p);
    setTimeout(()=>p.remove(),440);
  }
}
function showHelp(){
  const hud=$("hud");
  if(hud.classList.contains("hidden"))return;
  clearTimeout(helpTimer);
  hud.classList.add("help-visible");
  helpTimer=setTimeout(()=>hud.classList.remove("help-visible"),10000);
}
let suppressPointerUnlockUntil=0;
const isWater=id=>id===8||(id>=17&&id<=24);
const waterHeight=(id,aboveWater=false)=>{
  if(aboveWater)return 1;
  if(id===8)return .94;
  if(id===24)return .96;
  return Math.max(.23,.94-(id-16)*.10);
};

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
vec2 faceCoords(vec3 p,vec3 n){
  if(abs(n.y)>.5)return p.xz;
  if(abs(n.x)>.5)return p.zy;
  return p.xy;
}
vec3 palette(float m,vec3 n,vec3 p){
  vec2 uv=faceCoords(p,n);
  vec2 pixel=floor(uv*16.0);
  float r=hash3(vec3(pixel,m+0.5));
  float r2=hash3(vec3(floor(uv*7.0),m+5.4));
  float high=step(.78,r);
  float low=step(r,.16);
  float top=step(.5,n.y);
  float fringe=step(.87,fract(p.y+0.001));
  vec3 shade=vec3(.94+r*.14+r2*.06);
  if(m<1.5){
    vec3 soil=vec3(.45,.33,.225)*shade;
    vec3 turf=vec3(.33,.53,.25);
    turf=mix(turf,vec3(.52,.64,.30),high*.44);
    turf=mix(turf,vec3(.19,.42,.18),low*.4);
    return mix(soil,turf,max(top,fringe*(1.0-top)));
  }
  if(m<2.5)return vec3(.43,.31,.22)*shade*(1.0-high*.11);
  if(m<3.5){
    vec3 stone=vec3(.48,.52,.51)*shade;
    stone=mix(stone,vec3(.33,.38,.40),low*.7);
    return stone;
  }
  if(m<4.5)return vec3(.89,.76,.54)*shade+vec3(high*.027);
  if(m<5.5 || (m>27.5&&m<28.5)){
    if(top>.5){
      vec2 mid=fract(p.xz)-.5;
      float rings=sin(length(mid)*48.)*.13;
      return vec3(.59,.40,.24)*(1.+rings)*shade;
    }
    float bark=sin(uv.x*16.0)*.055+step(.84,r)*.075;
    vec3 wood=m<5.5?vec3(.46,.30,.17):vec3(.31,.225,.16);
    return wood*(1.0+bark)*shade;
  }
  if(m<6.5){
    vec3 leaves=vec3(.26,.46,.255);
    return mix(leaves,vec3(.38,.58,.31),high*.7+low*.26)*shade;
  }
  if(m<7.5)return mix(vec3(.72,.78,.79),vec3(.92,.95,.93),top)*shade;
  if(m<8.5)return vec3(.26,.56,.69);
  if(m<9.5){
    float mortar=max(step(fract(p.y*2.),.07),step(fract(p.x*2.+floor(p.y*2.)*.5),.052));
    return mix(vec3(.62,.33,.26)*shade,vec3(.30,.24,.22),mortar);
  }
  if(m<10.5)return vec3(.71,.86,.90);
  if(m<11.5){
    float seam=step(fract(p.y*2.),.055);
    return mix(vec3(.72,.49,.28)*shade,vec3(.39,.28,.18),seam);
  }
  if(m<12.5)return vec3(.245,.28,.33)*shade;
  if(m<13.5)return vec3(.97,.81,.38)*(1.0+high*.20);
  if(m<14.5)return mix(vec3(.20,.50,.24),vec3(.95,.40,.59),step(.56,fract(p.y)));
  if(m<15.5)return vec3(.60,.60,.62)*shade;
  if(m<16.5)return vec3(.28,.55,.29)*shade;
  if(m<25.5){
    float crack=step(r2,.16);
    return mix(vec3(.48,.52,.49)*shade,vec3(.31,.36,.35),crack*.77);
  }
  if(m<26.5)return mix(vec3(.60,.60,.57),vec3(.44,.44,.42),high+low)*shade;
  if(m<27.5)return mix(vec3(.28,.47,.25),vec3(.40,.56,.30),high)*shade;
  if(m<28.5)return vec3(.31,.24,.17)*shade;
  if(m<29.5){
    vec3 ore=vec3(.48,.51,.50)*shade;
    return mix(ore,vec3(.66,.34,.22),step(.82,r)*step(.20,r2));
  }
  if(m<30.5){
    vec3 ore=vec3(.50,.53,.52)*shade;
    return mix(ore,vec3(.92,.71,.25),step(.78,r)*step(.18,r2));
  }
  if(m<31.5)return vec3(.73,.37,.21)*shade;
  if(m>32.5){
    float grid=step(.90,fract(uv.x*4.))*0.18+step(.90,fract(uv.y*4.))*0.16;
    vec3 wood=top>.5?vec3(.71,.52,.30):vec3(.52,.35,.19);
    return (wood-grid)*shade;
  }
  return mix(vec3(.78,.58,.31),vec3(1.0,.87,.52),high)*shade;
}
void main(){
  vec3 p=vPos-vNorm*.001;
  vec3 color=palette(vMat,vNorm,p);
  float gran=hash3(floor(vPos*4.0)+vec3(2.1))*2.-1.;
  float detailNoise=hash3(floor(vPos*1.22))*2.-1.;
  color*=1.+gran*.075+detailNoise*.075;
  // Lighting is oriented by the mesher, with subtle ambient occlusion.
  color *= mix(.38,1.,uDay) * vBright + (1.-uDay)*.035;
  if(vMat>12.5&&vMat<13.5)color += vec3(.36,.28,.08);
  if(vMat>31.5&&vMat<32.5)color += vec3(.25,.19,.07);
  if(vMat>7.5&&vMat<8.5){
    float waveA=sin(vPos.x*2.2+vPos.z*.8+uTime*.0019);
    float waveB=sin(vPos.z*2.9-vPos.x*.65-uTime*.0015);
    float ripples=(waveA+waveB)*.5;
    float viewAngle=clamp(dot(normalize(uCam-vPos),normalize(vNorm)),0.,1.);
    float fresnel=pow(1.-viewAngle,3.);
    color=mix(vec3(.045,.26,.38),vec3(.16,.58,.74),.53+ripples*.13);
    color+=vec3(.14,.20,.21)*fresnel*uDay;
    float glint=pow(max(0.,ripples),12.)*.13*uDay*max(vNorm.y,0.);
    color+=vec3(glint);
  }
  if(vMat>9.5&&vMat<10.5)color = mix(color,vec3(.74,.91,.93),.42);
  float distanceToCamera=length(vPos-uCam);
  float fog=smoothstep(uFogStart,uFogStart+40.,distanceToCamera);
  color=mix(color,uFog,fog*.94);
  float alpha=1.;
  if(vMat>7.5&&vMat<8.5)alpha=.68;
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
uniform vec2 uCameraXZ;
uniform float uDay;
uniform float uTime;
uniform float uCycle;
out vec4 outColor;

float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float valueNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),f.x),
             mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),f.x),f.y);
}
float clouds(vec2 p){
  float v=valueNoise(p)*.56;
  v+=valueNoise(p*2.06+3.6)*.29;
  v+=valueNoise(p*4.27+6.1)*.15;
  return v;
}
void main(){
  vec2 screen=gl_FragCoord.xy/uResolution*2.0-1.0;
  float y0=uLook.y, a=uLook.x;
  vec3 forward=vec3(sin(a)*cos(y0),sin(y0),-cos(a)*cos(y0));
  vec3 right=vec3(cos(a),0.0,sin(a));
  vec3 upward=vec3(-sin(a)*sin(y0),cos(y0),cos(a)*sin(y0));
  float aspect=uResolution.x/uResolution.y;
  vec3 ray=normalize(forward+right*(screen.x*aspect*.70)+upward*(screen.y*.70));

  float elevation=clamp(ray.y,-.15,1.0);
  float horizon=pow(1.0-clamp(elevation*1.8,0.0,1.0),3.0);
  vec3 blueHorizon=vec3(.67,.81,.87);
  vec3 blueZenith=vec3(.105,.31,.62);
  vec3 blue=mix(blueHorizon,blueZenith,smoothstep(-.08,.85,elevation));
  vec3 night=mix(vec3(.045,.067,.12),vec3(.005,.017,.052),smoothstep(-.1,.8,elevation));
  vec3 sky=mix(night,blue,smoothstep(.0,.32,uDay));
  float phase=uCycle*6.28318530718/1200.0;
  vec3 sunDir=normalize(vec3(.56,sin(phase),-.76));
  vec3 moonDir=-sunDir;
  float sunDot=dot(ray,sunDir);
  float moonDot=dot(ray,moonDir);
  float warm=(1.0-smoothstep(.0,.43,sunDir.y))*uDay;
  sky+=vec3(1.0,.40,.14)*warm*horizon*.36;
  float glare=exp(-max(0.0,1.0-sunDot)*24.0)*uDay;
  sky+=vec3(1.0,.72,.37)*glare*.26;
  float sunDisk=1.0-smoothstep(.00010,.00029,1.0-sunDot);
  sky=mix(sky,vec3(1.0,.97,.76),sunDisk*uDay);
  float moonDisk=1.0-smoothstep(.00008,.00025,1.0-moonDot);
  sky=mix(sky,vec3(.74,.82,.93),moonDisk*(1.0-uDay));

  float starNight=1.0-smoothstep(.03,.32,uDay);
  if(starNight>.01 && ray.y>-.04){
    vec3 cell=floor(ray*355.0);
    float star=h2(cell.xy+vec2(cell.z*15.17,cell.z*9.91));
    star=step(.997,star)*(.65+.35*h2(cell.yz));
    sky+=vec3(.76,.86,1.0)*star*starNight;
  }

  if(ray.y>.055){
    float layer=155.0/max(ray.y,.11);
    vec2 cloudUV=(uCameraXZ+ray.xz*layer)*.0085;
    cloudUV+=vec2(uTime*.0000018,uTime*.0000006);
    float density=clouds(cloudUV);
    float coverage=smoothstep(.49,.71,density);
    float fade=smoothstep(.04,.19,ray.y)*smoothstep(.03,.35,uDay);
    float cloudEdge=coverage*coverage*(3.0-2.0*coverage);
    float fine=valueNoise(cloudUV*13.0+vec2(2.1,3.7));
    float shade=clamp(.78+fine*.25+(density-.55)*1.1,.48,1.12);
    vec3 cloudWhite=mix(vec3(.35,.42,.52),vec3(.98,.98,.95),clamp(uDay+.10,0.0,1.0));
    cloudWhite*=shade;
    cloudWhite+=vec3(.18,.085,.025)*warm;
    sky=mix(sky,cloudWhite,cloudEdge*fade*.87);
  }
  outColor=vec4(max(sky,vec3(.0)),1.0);
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
  botVao=gl.createVertexArray();
  botVbo=gl.createBuffer();
  gl.bindVertexArray(botVao);
  gl.bindBuffer(gl.ARRAY_BUFFER,botVbo);
  gl.bufferData(gl.ARRAY_BUFFER,60000,gl.DYNAMIC_DRAW);
  for(const [loc,size,offset] of [[0,3,0],[1,3,12],[2,1,24],[3,1,28]]){
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);
  }
  gl.bindVertexArray(null);
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
  const addFace=(buffer,x,y,z,id,face,height=1)=>{
    const corners=face.c;
    for(let k=0;k<6;k++){
      const c=corners[TRI[k]];
      buffer.push(x+c[0],y+(c[1]?height:0),z+c[2],face.n[0],face.n[1],face.n[2],isWater(id)?8:id,face.light);
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
        const watery=isWater(id),transparent=watery||id===10;
        const aboveWater=watery&&isWater(blockAt(wx,y+1,wz));
        const h=watery?waterHeight(id,aboveWater):1;
        const buf=transparent?trans:solid;
        for(const face of FACES){
          const next=blockAt(wx+face.d[0],y+face.d[1],wz+face.d[2]);
          let exposed;
          if(watery){
            exposed=!isWater(next) && (next===0||next===14||next===10);
            if(face.d[1]===1)exposed=!isWater(next);
            // A visible lip where one flowing cell is deeper than its neighbor.
            if(!exposed&&face.d[1]===0&&isWater(next)){
              const hh=waterHeight(next,isWater(blockAt(wx+face.d[0],y+1,wz+face.d[2])));
              if(h-hh>.025){
                addFace(buf,wx,y+hh,wz,id,face,h-hh);
              }
            }
          }else if(id===10)exposed=next!==10;
          else exposed=next===0 || isWater(next) || next===10 || next===14;
          if(exposed)addFace(buf,wx,y,wz,id,face,h);
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
function advanceWater(time){
  if(time-lastWaterTick<110 || !game)return;
  lastWaterTick=time;
  const dirty=game.tick_water(isMobile?42:72);
  for(let i=0;i<dirty.length;i+=2){
    const cx=dirty[i],cz=dirty[i+1],key=cx+","+cz;
    if(chunkData.has(key))chunkData.set(key,game.chunk(cx,cz));
    if(meshes.has(key))waterDirty.add(key);
  }
}
function rebuildWaterMeshes(){
  let left=isMobile?1:2;
  for(const key of waterDirty){
    if(left--<=0)break;
    waterDirty.delete(key);
    if(meshes.has(key)){
      const [cx,cz]=key.split(",").map(Number);
      rebuild(cx,cz);
    }
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
function skyColor(day){return [.045+day*.625,.067+day*.74,.12+day*.75];}
function botBox(buffer,bot,x,y,z,sx,sy,sz,mat){
  const swing=Math.sin(bot.step)*.07;
  // Rotate each limb about the avatar's central vertical axis.
  const ca=Math.cos(bot.heading),sa=Math.sin(bot.heading);
  for(const face of FACES){
    for(const idx of TRI){
      const p=face.c[idx];
      const lx=x+(p[0]-.5)*sx;
      const ly=y+p[1]*sy;
      const lz=z+(p[2]-.5)*sz;
      const nx=bot.x+lx*ca-lz*sa;
      const nz=bot.z+lx*sa+lz*ca;
      const n=face.n;
      buffer.push(nx,bot.y+ly,nz,n[0]*ca-n[2]*sa,n[1],n[0]*sa+n[2]*ca,mat,face.light);
    }
  }
}
function drawMiniBots(){
  if(!minigames?.active||!botVao)return;
  const bots=minigames.getBots();
  if(!bots.length)return;
  const vertices=[];
  for(const b of bots){
    const sway=Math.sin(b.step)*.09;
    // Boots, legs, torso, articulated sleeves, head and little eyes.
    botBox(vertices,b,-.19,.06+sway,0,.22,.68,.31,12);
    botBox(vertices,b,.19,.06-sway,0,.22,.68,.31,12);
    botBox(vertices,b,0,.74,0,.63,.68,.37,b.color);
    botBox(vertices,b,-.45,.75-sway,0,.20,.61,.31,b.color);
    botBox(vertices,b,.45,.75+sway,0,.20,.61,.31,b.color);
    botBox(vertices,b,0,1.41,0,.56,.55,.52,4);
    botBox(vertices,b,0,1.91,0,.58,.105,.55,b.id%2?28:12);
    botBox(vertices,b,-.13,1.73,-.274,.08,.08,.03,12);
    botBox(vertices,b,.13,1.73,-.274,.08,.08,.03,12);
  }
  gl.bindVertexArray(botVao);
  gl.bindBuffer(gl.ARRAY_BUFFER,botVbo);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES,0,vertices.length/8);
}
function drawWildlife(vp){
  if(!isSurvival()||!playing||menuVisible||minigames?.active){
    $("wildlifeLabels").replaceChildren();return;
  }
  const data=game.survival_creatures();
  const vertices=[],seen=new Set(),labels=$("wildlifeLabels");
  const width=canvas.clientWidth,height=canvas.clientHeight;
  for(let i=0;i+7<data.length;i+=8){
    const [id,kind,x,y,z,heading,step,hp]=data.slice(i,i+8);
    if(!Number.isFinite(x)||!Number.isFinite(z))continue;
    const dx=x-player[0],dz=z-player[2];
    if(dx*dx+dz*dz>(renderDistance*16+10)**2)continue;
    seen.add(id);
    const b={x,y,z,heading,step};
    const sway=Math.sin(step)*0.08;
    if(kind===1){
      // Moss grazer: squat four-legged creature, leafy hide, pale horns.
      botBox(vertices,b,0,.36,0,.85,.67,1.10,6);
      botBox(vertices,b,0,.44,-.62,.56,.56,.50,1);
      botBox(vertices,b,-.30,.06,-.36,.21,.43,.27,5);
      botBox(vertices,b,.30,.06,-.36,.21,.43,.27,5);
      botBox(vertices,b,-.30,.06+sway,.39,.21,.43,.27,5);
      botBox(vertices,b,.30,.06-sway,.39,.21,.43,.27,5);
      botBox(vertices,b,-.22,.87,-.74,.14,.20,.14,7);
      botBox(vertices,b,.22,.87,-.74,.14,.20,.14,7);
      botBox(vertices,b,-.17,.63,-.88,.105,.105,.07,12);
      botBox(vertices,b,.17,.63,-.88,.105,.105,.07,12);
      botBox(vertices,b,0,.79,.15,.48,.19,.43,27);
    }else{
      // Dusk prowler: lean biped, coal-colored torso, luminous amber eyes.
      botBox(vertices,b,-.21,.05+sway,0,.25,.85,.35,12);
      botBox(vertices,b,.21,.05-sway,0,.25,.85,.35,12);
      botBox(vertices,b,0,.86,0,.70,.79,.40,3);
      botBox(vertices,b,-.48,.84-sway,-.02,.24,.78,.28,12);
      botBox(vertices,b,.48,.84+sway,-.02,.24,.78,.28,12);
      botBox(vertices,b,0,1.67,-.06,.62,.61,.55,15);
      botBox(vertices,b,-.19,1.91,-.37,.12,.13,.08,13);
      botBox(vertices,b,.19,1.91,-.37,.12,.13,.08,13);
      botBox(vertices,b,0,1.42,-.35,.25,.12,.12,29);
    }
    const ly=y+(kind===1?1.55:2.45);
    const pz=vp[3]*x+vp[7]*ly+vp[11]*z+vp[15];
    const px=vp[0]*x+vp[4]*ly+vp[8]*z+vp[12];
    const py=vp[1]*x+vp[5]*ly+vp[9]*z+vp[13];
    const key="wild-"+id;
    let el=document.getElementById(key);
    if(!el){
      el=document.createElement("span");el.id=key;
      el.className="wildlife-name";
      labels.appendChild(el);
    }
    if(pz<=.05||Math.abs(px/pz)>1.2||Math.abs(py/pz)>1.25){
      el.classList.add("hidden");continue;
    }
    el.classList.remove("hidden");
    el.innerHTML='<strong>'+(kind===1?"MOSS GRAZER":"DUSK PROWLER")+
      '</strong><span class="wild-hp"><i style="width:'+
      Math.min(100,Math.max(0,hp/(kind===1?5:8)*100))+'%"></i></span>';
    el.style.left=(px/pz*.5+.5)*width+"px";
    el.style.top=(.5-py/pz*.5)*height+"px";
  }
  for(const el of labels.children){
    const id=Number(el.id.slice(5));
    if(!seen.has(id))el.remove();
  }
  if(vertices.length){
    gl.bindVertexArray(botVao);
    gl.bindBuffer(gl.ARRAY_BUFFER,botVbo);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/8);
  }
}
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
  const cx=player[0],cy=player[1]+1.62-crouchBlend*.33,cz=player[2];
  const cp=Math.cos(pitch);
  const forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  const eye=[cx,cy,cz];
  const proj=perspective(fov*Math.PI/180,canvas.width/canvas.height,.055,Math.max(160,renderDistance*16+72));
  const vp=multiply(proj,lookAt(eye,forward));
  glState.vp=vp;glState.camera=eye;
  const day=clamp(.42+Math.sin(game.time()/1200*Math.PI*2)*.67,0,1);
  const fog=skyColor(day);
  gl.clearColor(...fog,1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(skyProgram);
  gl.uniform2f(gl.getUniformLocation(skyProgram,"uResolution"),canvas.width,canvas.height);
  gl.uniform2f(gl.getUniformLocation(skyProgram,"uLook"),yaw,pitch);
  gl.uniform1f(gl.getUniformLocation(skyProgram,"uDay"),day);
  gl.uniform1f(gl.getUniformLocation(skyProgram,"uTime"),time);
  gl.uniform1f(gl.getUniformLocation(skyProgram,"uCycle"),game.time());
  gl.uniform2f(gl.getUniformLocation(skyProgram,"uCameraXZ"),cx,cz);
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
  if(minigames?.active){
    drawMiniBots();
    minigames.updateTags(vp,canvas.clientWidth,canvas.clientHeight);
  }else drawWildlife(vp);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  // Sort transparent chunks back-to-front to avoid distant water surfaces
  // drawing on top of nearby glass/water as the player moves.
  const transparentMeshes=[...meshes.values()].filter(m=>m.trans);
  transparentMeshes.sort((a,b)=>{
    const da=(a.cx*16+8-cx)**2+(a.cz*16+8-cz)**2;
    const db=(b.cx*16+8-cx)**2+(b.cz*16+8-cz)**2;
    return db-da;
  });
  for(const m of transparentMeshes){
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
  return game.raycast(player[0],player[1]+1.62-crouchBlend*.33,player[2],...f,7);
}
function action(place=false){
  if(!playing||paused||menuVisible||inventoryOpen)return;
  if(minigames?.active){
    minigames.action(place,getLook());
    return;
  }
  if(isSurvival()){
    if(place)survivalUI.place(getTarget());
    return; // breaking is a timed Rust action while the mouse is held
  }
  const found=getTarget();
  if(found.length!==7)return;
  const [x,y,z,tx,ty,tz,id]=found;
  if(place){
    const chosen=inventorySlots[selected];
    if(!chosen) return;
    const overlap = Math.abs(player[0]-(tx+.5)) < .8 &&
                    Math.abs(player[2]-(tz+.5)) < .8 &&
                    ty<player[1]+1.76 && ty+1>player[1];
    if(overlap&&chosen!==8&&chosen!==10&&chosen!==14)return;
    if(game.set_block(tx,ty,tz,chosen)){
      invalidateBlocks(tx,tz);
      soundEffect(true);
      player=game.player();
    }
  }else if(game.set_block(x,y,z,0)){
    invalidateBlocks(x,z);
    spawnDebris((id>=17&&id<=24)?8:id);
    soundEffect(false);
  }
}
function tintColor(hex,scale){
  const rgb=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16));
  return '#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v*scale))).toString(16).padStart(2,'0')).join('');
}
function blockIcon(id){
  const info=BLOCKS[id];
  if(!info)return '';
  // Original little voxel model — independent of any Minecraft item textures.
  const top=id===1?'#6caa4e':id===7?'#e9f1ed':id===5||id===28?'#b89b6e':tintColor(info.hex,1.20);
  const left=id===1?'#705239':tintColor(info.hex,.65);
  const right=id===1?'#896544':tintColor(info.hex,.87);
  return '<svg class="block-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'+
    '<path d="M20 3 37 12 20 21 3 12Z" fill="'+top+'"/>'+
    '<path d="M3 12 20 21 20 38 3 29Z" fill="'+left+'"/>'+
    '<path d="M20 21 37 12 37 29 20 38Z" fill="'+right+'"/>'+
    '<path d="M3 12 20 21 37 12M20 21V38" stroke="#000" stroke-opacity=".19" stroke-width=".8" fill="none"/>'+
    '</svg>';
}
function inventoryButton(id,index,type){
  const el=document.createElement("button");
  el.className="inv-slot"+(!id?" empty":"")+(type==="slot"&&index===selected?" active":"");
  el.dataset.index=index;el.dataset.type=type;
  el.title=id?BLOCKS[id].name:"Empty slot";
  el.setAttribute("aria-label",id?BLOCKS[id].name:"Empty slot");
  el.innerHTML=blockIcon(id)+(type==="slot"&&index<9?'<span class="small-num">'+(index+1)+'</span>':'');
  return el;
}
function renderHotbar(){
  if(isSurvival()&&survivalUI){survivalUI.renderHotbar();return;}
  $("offhandHud").classList.remove("hidden");
  const hotbar=$("hotbar");hotbar.replaceChildren();
  const off=$("offhandHud");
  off.innerHTML=blockIcon(offhandBlock);
  off.classList.toggle("offhand-empty",!offhandBlock);
  off.title=offhandBlock?"Offhand: "+BLOCKS[offhandBlock].name+" (F)":"Offhand empty (F)";
  for(let i=0;i<9;i++){
    const id=inventorySlots[i],info=BLOCKS[id];
    const el=document.createElement("button");
    el.className="slot"+(i===selected?" selected":"");
    el.setAttribute("aria-label",info?.name||"Empty");
    el.title=info?.name||"Empty";
    el.innerHTML='<span class="num">'+(i+1)+'</span>'+blockIcon(id)+'<span class="name">'+(info?.name||"")+'</span>';
    el.addEventListener("click",()=>setSelected(i));
    hotbar.appendChild(el);
  }
}
function setSelected(i){
  selected=(i+9)%9;
  renderHotbar();
  showSelectedName();
  if(inventoryOpen)renderInventory();
}
function setHeldItem(id){
  heldItem=id;
  const cur=$("cursorItem");
  cur.innerHTML=blockIcon(id);
  cur.classList.toggle("hidden",!id);
}
function swapSlot(a,b){
  const t=inventorySlots[a];inventorySlots[a]=inventorySlots[b];inventorySlots[b]=t;
  saveInventory();renderInventory();renderHotbar();
}
function quickPut(id){
  if(!id)return;
  let index=inventorySlots.indexOf(id,0);
  if(index>=9)index=-1;
  if(index<0)index=inventorySlots.findIndex((v,i)=>i<9&&v===0);
  if(index<0)index=selected;
  inventorySlots[index]=id;selected=index;
  saveInventory();renderHotbar();renderInventory();
}
function addCatalogItem(id){
  const b=inventoryButton(id,id,"catalog");
  b.addEventListener("click",e=>{
    if(e.shiftKey){quickPut(id);return;}
    setHeldItem(id);
  });
  b.addEventListener("contextmenu",e=>{e.preventDefault();quickPut(id);});
  b.draggable=true;
  b.addEventListener("dragstart",e=>e.dataTransfer?.setData("text/plain","catalog:"+id));
  return b;
}
function drawSlot(container,index){
  const id=inventorySlots[index],b=inventoryButton(id,index,"slot");
  b.addEventListener("click",e=>{
    if(e.shiftKey){
      if(!inventorySlots[index])return;
      const dest=index<9?
        inventorySlots.findIndex((id,i)=>i>=9&&id===0):
        inventorySlots.findIndex((id,i)=>i<9&&id===0);
      if(dest>=0)swapSlot(index,dest);
      return;
    }
    const prior=inventorySlots[index];
    inventorySlots[index]=heldItem;
    setHeldItem(prior);
    saveInventory();renderInventory();renderHotbar();
  });
  b.addEventListener("contextmenu",e=>{
    e.preventDefault();
    if(heldItem){inventorySlots[index]=heldItem;saveInventory();renderInventory();renderHotbar();}
    else if(inventorySlots[index]){setHeldItem(inventorySlots[index]);}
  });
  b.draggable=!!id;
  b.addEventListener("dragstart",e=>e.dataTransfer?.setData("text/plain","slot:"+index));
  b.addEventListener("dragover",e=>e.preventDefault());
  b.addEventListener("drop",e=>{
    e.preventDefault();
    const entry=e.dataTransfer?.getData("text/plain")||"";
    const [kind,val]=entry.split(":");
    if(kind==="catalog") { inventorySlots[index]=Number(val);saveInventory();renderInventory();renderHotbar(); }
    else if(kind==="slot")swapSlot(Number(val),index);
  });
  container.appendChild(b);
}
function renderInventory(){
  if(isSurvival()&&survivalUI){survivalUI.renderInventory();return;}
  $("inventory").classList.remove("survival-inventory");
  $("survivalCraft").classList.add("hidden");
  $("inventoryKicker").textContent="CREATIVE WORLD";
  $("inventoryTitle").textContent="Inventory";
  const catalog=$("creativeBlocks"),storage=$("storageSlots"),bar=$("inventoryHotbar"),off=$("inventoryOffhand");
  catalog.replaceChildren();storage.replaceChildren();bar.replaceChildren();off.replaceChildren();
  const query=$("inventorySearch").value.trim().toLowerCase();
  const groups={
    building:[3,4,9,10,11,12,15,25,26,27,28,31],
    nature:[1,2,5,6,7,8,16,29,30],
    decor:[13,14,32]
  };
  for(const id of MATERIALS){
    if(inventoryFilter!=="all" && !groups[inventoryFilter]?.includes(id))continue;
    if(query&&!BLOCKS[id].name.toLowerCase().includes(query))continue;
    catalog.appendChild(addCatalogItem(id));
  }
  for(let i=9;i<36;i++)drawSlot(storage,i);
  for(let i=0;i<9;i++)drawSlot(bar,i);
  const b=inventoryButton(offhandBlock,36,"slot");
  b.addEventListener("click",()=>{
    const prev=offhandBlock;offhandBlock=heldItem;setHeldItem(prev);
    saveInventory();renderInventory();renderHotbar();
  });
  b.addEventListener("contextmenu",e=>{
    e.preventDefault();
    if(heldItem)offhandBlock=heldItem;
    else if(offhandBlock)setHeldItem(offhandBlock);
    saveInventory();renderInventory();renderHotbar();
  });
  b.addEventListener("dragover",e=>e.preventDefault());
  b.addEventListener("drop",e=>{
    e.preventDefault();
    const [kind,val]=(e.dataTransfer?.getData("text/plain")||"").split(":");
    if(kind==="catalog")offhandBlock=Number(val);
    else if(kind==="slot"){
      const i=Number(val),previous=offhandBlock;
      offhandBlock=inventorySlots[i];inventorySlots[i]=previous;
    }
    saveInventory();renderInventory();renderHotbar();
  });
  off.appendChild(b);
}
function openInventory(){
  if(!playing||paused||menuVisible||inventoryOpen)return;
  inventoryOpen=true;suppressPointerUnlockUntil=performance.now()+650;
  held.clear();leftHeld=false;rightHeld=false;
  $("inventory").classList.remove("hidden");
  $("mobile-controls").classList.add("hidden");
  renderInventory();
  if(!isMobile&&document.pointerLockElement===canvas)document.exitPointerLock?.();
}
function closeInventory(){
  if(!inventoryOpen)return;
  if(isSurvival())survivalUI?.leaveInventory();
  inventoryOpen=false;setHeldItem(0);
  $("inventory").classList.add("hidden");
  if(isMobile)$("mobile-controls").classList.remove("hidden");
  else if(playing&&!paused)canvas.requestPointerLock?.().catch(()=>{});
  saveInventory();
}
function toggleInventory(){if(inventoryOpen)closeInventory();else openInventory();}
function renderHUD(){
  $("coordinates").textContent=player.slice(0,3).map(v=>Math.floor(v)).join(", ");
  $("fps").textContent=Math.round(fps)+" FPS";
  $("mode").firstChild.textContent=isSurvival()?"SURVIVAL ":game.flying()?"FLY MODE ":"WALK MODE ";
  $("block-count").textContent=game.edits_count().toLocaleString();
  if(isSurvival())survivalUI?.refreshHUD();
  $("block-name").textContent=target.length===7?BLOCKS[(target[6]>=17&&target[6]<=24)?8:target[6]]?.name||"BLOCK":"";
  if(debugVisible){
    $("debugOverlay").textContent=
      "MINE 0.5 / RUST + WEBASSEMBLY\n"+
      Math.round(fps)+" FPS | "+visibleChunks+" ACTIVE CHUNKS\n"+
      "XYZ "+player.slice(0,3).map(n=>n.toFixed(2)).join(" / ")+"\n"+
      "Seed "+seed+" | Time "+Math.floor(game.time())+"\n"+
      "Mode "+(isSurvival()?"Survival":game.flying()?"Creative flight":"Creative")+"\n"+
      "Water updates "+game.water_pending()+" | Edits "+game.edits_count();
  }
  const degrees=(yaw*180/Math.PI%360+360)%360;
  const dirs=["N","NE","E","SE","S","SW","W","NW"];
  $("compass").innerHTML=dirs[Math.round(degrees/45)%8]+' <span>•</span> '+String(Math.round(degrees)).padStart(3,"0")+'°';
}
function save(){
  if(!game||arenaWorldActive||minigames?.active)return;
  try {
    localStorage.setItem(saveKey(seed),game.export_save());
    if(isSurvival())localStorage.setItem(survivalKey(seed),game.export_survival());
    localStorage.setItem("mine_last_seed",String(seed));
    localStorage.setItem("mine_last_mode",worldMode);
    saveInventory();
  }catch(e){toast("Storage limit reached. Cannot save additional changes.");}
}
function clearWorldGraphics(){
  for(const mesh of meshes.values())disposeMesh(mesh);
  meshes.clear();chunkData.clear();waterDirty.clear();buildQueue.length=0;
}
function enterMinigameWorld(modeId){
  // A match is an ephemeral Rust Game instance. Never overwrite the saved sandbox.
  if(!arenaWorldActive)save();
  clearWorldGraphics();
  arenaWorldActive=true;
  const index=["spleef","tntrun","parkour","blockparty","sumo"].indexOf(modeId);
  game?.free?.();
  game=new Game(902210+Math.max(0,index)*117);
  game.set_time(325);
  game.set_flying(false);
  player=game.player();
  held.clear();leftHeld=false;rightHeld=false;
  yaw=0;pitch=-.15;crouchBlend=0;target=[];
  $("hud").classList.remove("hidden");
}
function rebuildArenaChunk(cx,cz){
  const key=cx+","+cz;
  chunkData.set(key,game.chunk(cx,cz));
  if(meshes.has(key))rebuild(cx,cz);
}
function exitMinigameWorld(){
  clearWorldGraphics();
  arenaWorldActive=false;
  game?.free?.();
  game=new Game(seed);
  if(isSurvival())game.enable_survival();
  const saveData=localStorage.getItem(saveKey(seed));
  if(saveData)game.import_save(saveData);
  if(isSurvival()){
    const survivalData=localStorage.getItem(survivalKey(seed));
    if(survivalData)game.import_survival(survivalData);
    survivalUI?.enterSurvival();
  }else survivalUI?.leaveSurvival();
  player=game.player();target=[];held.clear();crouchBlend=0;
  renderHotbar();
  playing=false;paused=false;menuVisible=true;
  leftHeld=false;rightHeld=false;
  $("menu").classList.remove("hidden");
  $("pause").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("hud").classList.remove("help-visible","minigame-active");
  $("mobile-controls").classList.add("hidden");
  $("miniBotLabels").replaceChildren();
  $("saveButton").classList.remove("hidden");
  $("pauseTitle").textContent="Game menu";
  $("pauseDescription").textContent="Your world is saved automatically.";
  document.exitPointerLock?.();
  renderHUD();
}
function switchWorld(newSeed,loadSaved,skipOldSave=false,nextMode=worldMode){
  if(!skipOldSave)save();
  if(inventoryOpen)closeInventory();
  clearWorldGraphics();
  game?.free?.();
  seed=Number(newSeed)>>>0||42042;
  worldMode=nextMode;
  game=new Game(seed);
  if(isSurvival())game.enable_survival();
  crouchBlend=0;survivalDead=false;
  if(loadSaved){
    const data=localStorage.getItem(saveKey(seed));
    if(data)game.import_save(data);
    if(isSurvival()){
      const extra=localStorage.getItem(survivalKey(seed));
      if(extra)game.import_survival(extra);
    }
  }
  $("seedInput").value=seed;
  if(isSurvival())survivalUI?.enterSurvival();
  else {survivalUI?.leaveSurvival();loadInventory(!loadSaved);}
  player=game.player();
  localStorage.setItem("mine_last_seed",String(seed));
  localStorage.setItem("mine_last_mode",worldMode);
  renderHotbar();updateControlsHint();renderHUD();
}
function start(){
  playing=true;paused=false;menuVisible=false;
  $("menu").classList.add("hidden");
  $("pause").classList.add("hidden");
  $("hud").classList.remove("hidden");
  if(isMobile)$("mobile-controls").classList.remove("hidden");
  else canvas.requestPointerLock?.().catch(()=>{});
  if(!minigames?.active){
    updateControlsHint();
    if(isSurvival())survivalUI?.enterSurvival();
    else survivalUI?.leaveSurvival();
    showHelp();showSelectedName();
  }else {
    $("hud").classList.remove("help-visible");
    $("itemToast").classList.add("hidden");
  }
}
function pause(){
  if(!playing || paused || inventoryOpen)return;
  paused=true;leftHeld=false;rightHeld=false;
  if(!minigames?.active)save();
  $("pauseTitle").textContent=minigames?.active?"Game paused":"Game menu";
  $("pauseDescription").textContent=minigames?.active?
    "Mini-game paused · bot opponents are offline AI.":"Your world is saved automatically.";
  $("saveButton").classList.toggle("hidden",!!minigames?.active);
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
  if(minigames?.active){minigames.leave(false);return;}
  if(inventoryOpen)closeInventory();
  survivalUI?.cancelMining();
  if(survivalDead){
    $("survivalDeath").classList.add("hidden");
    survivalDead=false;
  }
  save();paused=false;playing=false;menuVisible=true;
  $("menu").classList.remove("hidden");
  $("pause").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("mobile-controls").classList.add("hidden");
  document.exitPointerLock?.();
}
function connectControls(){
  $("worldModePicker").addEventListener("click",e=>{
    const btn=e.target.closest("[data-world-mode]");
    if(!btn)return;
    requestedMode=btn.dataset.worldMode;
    updateModePicker();
  });
  $("playButton").addEventListener("click",()=>{
    if(requestedMode!==worldMode)switchWorld(seed,true,false,requestedMode);
    start();
  });
  $("newButton").addEventListener("click",()=>{
    const n=Number($("seedInput").value)||42042;
    const key=saveKey(n>>>0,requestedMode);
    const old=localStorage.getItem(key);
    if(old && !confirm("Create a new "+requestedMode+" world with this seed? The saved "+requestedMode+" world for this seed will be replaced."))return;
    if(requestedMode===worldMode)save();
    localStorage.removeItem(key);
    if(requestedMode==="survival")localStorage.removeItem(survivalKey(n>>>0));
    switchWorld(n,false,true,requestedMode);
    start();
  });
  $("randomSeed").addEventListener("click",()=>{
    const n=(Math.floor(Math.random()*2147483647)||42);
    $("seedInput").value=n;
  });
  $("seedInput").addEventListener("change",()=>switchWorld(Number($("seedInput").value),true,false,requestedMode));
  $("pauseButton").addEventListener("click",pause);
  $("inventoryButton").addEventListener("click",()=>{
    if(minigames?.active)minigames.showRules();else toggleInventory();
  });
  $("offhandHud").addEventListener("click",()=>{if(playing&&!paused)toggleInventory();});
  $("touch-inventory").addEventListener("click",()=>{
    if(minigames?.active)minigames.showRules();else toggleInventory();
  });
  $("closeInventory").addEventListener("click",closeInventory);
  $("inventorySearch").addEventListener("input",renderInventory);
  $("inventoryTabs").addEventListener("click",e=>{
    const button=e.target.closest("button[data-filter]");
    if(!button)return;
    inventoryFilter=button.dataset.filter;
    for(const btn of $("inventoryTabs").querySelectorAll("button"))
      btn.classList.toggle("active",btn===button);
    renderInventory();
  });
  $("clearInventory").addEventListener("click",()=>{
    if(!confirm("Clear all 36 inventory slots?"))return;
    inventorySlots.fill(0);setHeldItem(0);saveInventory();renderInventory();renderHotbar();
  });
  document.addEventListener("pointermove",e=>{
    const el=$("cursorItem");el.style.left=e.clientX+"px";el.style.top=e.clientY+"px";
  });
  $("inventory").addEventListener("mousedown",e=>{
    if(e.target===$("inventory"))closeInventory();
  });
  $("resumeButton").addEventListener("click",resume);
  $("leaveButton").addEventListener("click",returnMenu);
  $("saveButton").addEventListener("click",()=>{save();toast("WORLD SAVED");});
  $("renderDistance").addEventListener("change",e=>{renderDistance=Number(e.target.value);localStorage.setItem("mine_distance",String(renderDistance));});
  $("sensitivity").addEventListener("input",e=>{sensitivity=Number(e.target.value);localStorage.setItem("mine_sensitivity",String(sensitivity));});
  $("fovRange").addEventListener("input",e=>{fov=Number(e.target.value);localStorage.setItem("mine_fov",String(fov));});
  $("soundToggle").addEventListener("change",e=>{soundEnabled=e.target.checked;localStorage.setItem("mine_sound",soundEnabled?"1":"0");});
  addEventListener("keydown",e=>{
    if(["Space","Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)&&playing)e.preventDefault();
    if(e.code==="Escape"){
      if(survivalDead)return;
      if(!$("miniLobby").classList.contains("hidden")){
        minigames?.closeLobby();return;
      }
      if(!$("miniResult").classList.contains("hidden")){
        minigames?.leave(true);return;
      }
      if(inventoryOpen)closeInventory();
      else if(!menuVisible){if(paused)resume();else pause();}
      return;
    }
    const inputActive=e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement;
    if(inputActive)return;
    if(!playing||paused)return;
    if(e.code==="F1"&&!e.repeat){
      e.preventDefault();
      $("hud").classList.toggle("hidden");
      return;
    }
    if(e.code==="F3"&&!e.repeat){
      e.preventDefault();debugVisible=!debugVisible;
      $("debugOverlay").classList.toggle("hidden",!debugVisible);
      renderHUD();return;
    }
    if(e.code==="KeyH"&&!e.repeat){showHelp();return;}
    if(e.code==="KeyR"&&!e.repeat&&isSurvival()&&!inventoryOpen){
      if(game.survival_eat(selected)){
        survivalUI.renderHotbar();
        survivalUI.refreshHUD();toast("ATE FOREST BERRIES");
      }else toast("SELECT BERRIES AND EAT WHEN HUNGRY");
      return;
    }
    if(e.code==="KeyE"&&!e.repeat){
      if(minigames?.active)minigames.showRules();
      else toggleInventory();
      return;
    }
    if(inventoryOpen)return;
    held.add(e.code);
    if(e.code==="KeyQ"&&!e.repeat && !minigames?.active && !isSurvival()) {
      // Creative mode: clear selected hotbar slot (no spawned dropped entity).
      inventorySlots[selected]=0;saveInventory();renderHotbar();showSelectedName();
    }
    if(/^Digit[1-9]$/.test(e.code))setSelected(Number(e.code.slice(5))-1);
    if(e.code==="Space"&&!e.repeat&&!minigames?.active&&!isSurvival()){
      const now=performance.now();
      if(now-lastSpaceTap<330){
        game.set_flying(!game.flying());
        toast(game.flying()?"FLIGHT ENABLED — SHIFT descends":"FLIGHT DISABLED");
        lastSpaceTap=-1000;
      }else lastSpaceTap=now;
    }
    if(e.code==="KeyF"&&!e.repeat&&!minigames?.active&&!isSurvival()){
      const previous=offhandBlock;
      offhandBlock=inventorySlots[selected];
      inventorySlots[selected]=previous;
      saveInventory();renderHotbar();
      toast("SWAPPED OFFHAND");
    }
  });
  addEventListener("keyup",e=>held.delete(e.code));
  addEventListener("blur",()=>{held.clear();leftHeld=false;rightHeld=false;});
  document.addEventListener("mousemove",e=>{
    if(document.pointerLockElement!==canvas||!playing||paused||inventoryOpen)return;
    yaw+=e.movementX*.0025*sensitivity;
    pitch=clamp(pitch-e.movementY*.0025*sensitivity,-1.54,1.54);
  });
  canvas.addEventListener("mousedown",e=>{
    if(isMobile||!playing||paused||menuVisible||inventoryOpen)return;
    if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.().catch(()=>{});return;}
    if(e.button===0){leftHeld=true;action(false);mouseLastAction=performance.now();}
    if(e.button===2){rightHeld=true;action(true);mouseLastAction=performance.now();}
    if(e.button===1&&!minigames?.active&&!isSurvival()){
      // Minecraft-style creative pick block.
      const hit=getTarget();
      if(hit.length===7){
        const blockId=(hit[6]>=17&&hit[6]<=24)?8:hit[6];
        if(BLOCKS[blockId]){
          const existing=inventorySlots.indexOf(blockId,0);
          if(existing>=0&&existing<9)setSelected(existing);
          else{inventorySlots[selected]=blockId;saveInventory();renderHotbar();}
        }
      }
    }
  });
  addEventListener("mouseup",e=>{if(e.button===0)leftHeld=false;if(e.button===2)rightHeld=false;});
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  canvas.addEventListener("wheel",e=>{
    if(!playing||paused||inventoryOpen)return;
    e.preventDefault();
    if(!minigames?.active)setSelected(selected+(e.deltaY>0?1:-1));
  },{passive:false});
  document.addEventListener("pointerlockchange",()=>{
    if(!isMobile&&playing&&!menuVisible&&!paused&&!inventoryOpen&&
       performance.now()>suppressPointerUnlockUntil&&document.pointerLockElement!==canvas)pause();
  });
  if(isMobile)connectTouch();
}
function connectTouch(){
  canvas.addEventListener("pointerdown",e=>{
    if(!playing||paused||menuVisible||inventoryOpen||touchLook.pointer!==null)return;
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
  const sneak=held.has("ShiftLeft")||held.has("ShiftRight");
  const down=game.flying()&&sneak?1:0;
  crouchBlend+=(Number(sneak&&!game.flying())-crouchBlend)*Math.min(1,dt*11);
  if(minigames?.active&&minigames.phase==="ready"){
    minigames.tick(dt);return;
  }
  game.step(dt,mx,mz,jump,held.has("ControlLeft")||held.has("ControlRight"),down,sneak&&!game.flying());
  player=game.player();
  if(minigames?.active){
    minigames.tick(dt);
    player=game.player();
    target=[];
  }else target=getTarget();
  if(isSurvival()){
    const sprint=held.has("ControlLeft")||held.has("ControlRight");
    game.survival_tick(dt,Math.hypot(mx,mz)>.09,sprint);
    survivalUI.refreshHUD();
    if(paused)return;
    if(leftHeld||MOBILE_ACTIONS.break){
      let hit=false;
      if(time-creatureLastAttack>490){
        const look=getLook();
        const result=game.survival_attack_creature(...look,selected);
        if(result){
          creatureLastAttack=time;
          hit=true;
          survivalUI.cancelMining();
          soundEffect(false);
          if(result===2){toast("CREATURE DEFEATED · RESOURCES COLLECTED");}
          survivalUI.renderHotbar();
        }
      }
      if(!hit)survivalUI.mine(target,dt);
    }else{
      survivalUI.cancelMining();
    }
    if((rightHeld||MOBILE_ACTIONS.place)&&time-mouseLastAction>210){
      action(true);mouseLastAction=time;
    }
  }else if((leftHeld||rightHeld||MOBILE_ACTIONS.break||MOBILE_ACTIONS.place)&&time-mouseLastAction>210){
    action(rightHeld||MOBILE_ACTIONS.place);
    mouseLastAction=time;
  }
}
function frameLoop(time){
  const dt=clamp((time-previousTime)/1000||.016,0,.05);previousTime=time;
  frame++;frameAccumulator+=dt;
  if(frameAccumulator>.42){fps=frame/frameAccumulator;frame=0;frameAccumulator=0;}
  if(playing&&!paused&&!inventoryOpen)simulation(dt,time);
  else player=game.player();
  if(playing&&!paused&&!minigames?.active)advanceWater(time);
  if(minigames?.active)minigames.flushDirty();
  rebuildWaterMeshes();
  updateVisibleChunks();
  render(time);
  if(playing&&!paused&&!inventoryOpen&&Math.floor(time/180)%2===0)renderHUD();
  if(time-lastAutosave>5000){
    if(playing&&!paused&&!minigames?.active)save();
    lastAutosave=time;
  }
  requestAnimationFrame(frameLoop);
}
// Page reload and app switching must not lose the last few seconds of survival edits.
addEventListener("pagehide",()=>{if(playing&&!arenaWorldActive)save();});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"&&playing&&!arenaWorldActive)save();
});
async function main(){
  try{
    $("loading-progress").style.width="23%";
    await init();
    $("loading-message").textContent="GENERATING A NEW WORLD";
    $("loading-progress").style.width="68%";
    const storedSeed=Number(localStorage.getItem("mine_last_seed"))||42042;
    seed=storedSeed>>>0||42042;
    const oldMode=localStorage.getItem("mine_last_mode");
    worldMode=oldMode==="survival"?"survival":"creative";
    requestedMode=worldMode;updateModePicker();
    game=new Game(seed);
    if(isSurvival())game.enable_survival();
    const data=localStorage.getItem(saveKey(seed));
    if(data)game.import_save(data);
    if(isSurvival()){
      const state=localStorage.getItem(survivalKey(seed));
      if(state)game.import_survival(state);
    }
    player=game.player();
    $("seedInput").value=seed;
    initGL();
    survivalUI=new SurvivalUI({
      game:()=>game,blocks:BLOCKS,blockIcon,
      selected:()=>selected,select:setSelected,
      sound:soundEffect,toast,
      invalidate:invalidateBlocks,debris:spawnDebris,
      openInventory,
      isDead:()=>survivalDead,
      isPlaying:()=>playing&&!menuVisible,
      die:()=>{
        survivalDead=true;paused=true;leftHeld=false;rightHeld=false;held.clear();
        document.exitPointerLock?.();
      },
      respawn:()=>{
        survivalDead=false;paused=false;player=game.player();target=[];
        if(!isMobile)canvas.requestPointerLock?.().catch(()=>{});
      },
      returnMenu
    });
    loadInventory(false);
    if(isSurvival())survivalUI.enterSurvival();
    else survivalUI.leaveSurvival();
    renderHotbar();
    minigames=new MiniGames({
      game:()=>game,player:()=>player,
      syncPlayer:()=>{player=game.player();},
      toast,sound:soundEffect,
      enterArena:enterMinigameWorld,
      exitArena:exitMinigameWorld,
      startRound:start,
      stopRound:()=>{paused=false;playing=false;leftHeld=false;rightHeld=false;},
      finishRound:()=>{
        paused=true;leftHeld=false;rightHeld=false;held.clear();
        document.exitPointerLock?.();
      },
      rebuildArenaChunk:rebuildArenaChunk,
      knockPlayer:(dx,dz)=>{
        const p=game.player();
        game.teleport(p[0]+dx,p[1]+.15,p[2]+dz);
        player=game.player();
      }
    });
    connectControls();
    updateControlsHint();
    renderDistance=Number(localStorage.getItem("mine_distance"))||3;
    renderDistance=clamp(renderDistance,2,5);
    sensitivity=Number(localStorage.getItem("mine_sensitivity"))||1;
    fov=Number(localStorage.getItem("mine_fov"))||75;
    fov=clamp(fov,55,105);
    soundEnabled=localStorage.getItem("mine_sound")!=="0";
    $("fovRange").value=String(fov);
    $("soundToggle").checked=soundEnabled;
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
