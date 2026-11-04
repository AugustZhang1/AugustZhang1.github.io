// The black hole, ray traced in WebGL2: every pixel follows its true light path around the
// hole. It fills the screen under the panel while the project is open, and draws nothing
// otherwise. Zoom heads for the cursor, and resolution drops by itself on GPUs that can't
// keep up. Returns null without hardware WebGL2; the site then keeps its 2D hole.
window.createBlackHole = function (canvas, onLost) {
  'use strict';
  const MAX_DISTANCE = 170;   // the hole is a small object in the star field
  const FAR_DISTANCE = 42;    // where click and Esc fly back to
  const NEAR_DISTANCE = 6.2;  // where click flies in to
  const MIN_DISTANCE = 2.2;   // just above the photon ring
  const MAX_PIXELS = 2.4e6;   // about 8 ms on an integrated Intel Arc at the heaviest zoom
  const MIN_QUALITY = .5;     // lowest resolution, as a share of full width and height
  const SLOW_MS = 22, CALM_MS = 19;   // median frame times that lower and allow raising it
  const ROCK_START = 8.5, ROCK_CYCLE = 26;   // where the rock appears, and seconds between rocks
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = prefersReduced.matches;
  const diagnostics = window.__blackhole = { ready:false, state:'far', distance:FAR_DISTANCE, goal:FAR_DISTANCE, elevation:0, azimuth:0, frames:0, frameMs:0, gpuMs:0, gpuSamples:0, gpuAvailable:false, internalResolution:'', quality:1 };

  const vertexSource = `#version 300 es
    in vec2 aPosition;
    out vec2 vUv;
    void main(){ vUv=aPosition*.5+.5; gl_Position=vec4(aPosition,0.,1.); }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    precision highp int;
    in vec2 vUv;
    out vec4 outColor;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec3 uCam;
    uniform mat3 uBasis;
    uniform float uFov;
    uniform vec3 uRock;
    uniform vec2 uShift;   // moves the hole clear of the panel

    const float PI=3.14159265, TAU=6.28318531;
    const float R_OUT=7.2;       // outer edge of the disc, Rs=1
    const float STEP=PI/22.;     // RK4 step in orbit angle
    const float ROCK_R=.1;

    float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float hash31(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+1.); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
    float rnd(uint x){ x^=x>>16u; x*=0x7feb352du; x^=x>>15u; x*=0x846ca68bu; x^=x>>16u; return float(x>>8u)*(1./16777216.); }

    // One ring of gas: periodic noise along the orbit, turning rigidly at its own
    // rate, steeper than Keplerian so the inner gas visibly races the outer gas.
    // Neighbouring rings slide past each other, so the pattern shears for ever
    // without winding up into ever thinner lines.
    float gasRing(float a, float row, float rows, float cells, uint seed){
      uint id=uint(row)*747796405u+seed;
      float x=fract(a-uTime*.136*exp(-2.2*(row+.5)/rows)+rnd(id))*cells;
      float i=floor(x), f=x-i; f=f*f*(3.-2.*f);
      uint c=uint(cells), i0=uint(i)%c;
      return mix(rnd(id+i0*2891336453u),rnd(id+((i0+1u)%c)*2891336453u),f);
    }
    float gasOctave(float a, float lnr, float rows, float cells, uint seed){
      float y=lnr*rows, j=floor(y), f=y-j; f=f*f*f*(f*(f*6.-15.)+10.);
      return mix(gasRing(a,j,rows,cells,seed),gasRing(a,j+1.,rows,cells,seed),f);
    }
    // Long streaks at every scale. Octaves are added only while the pixel footprint
    // can resolve them, so detail grows as the camera moves in instead of aliasing
    // at a distance. Fine octaves keep more strength so close views stay rich.
    float gasField(float a, float lnr, float fr, float fa){
      // Slow meanders. Their gradients stay below 1 so the field never folds over itself.
      float bend=gasOctave(a,lnr,2.5,3.,91u)-.5, curl=gasOctave(a,lnr,10.,9.,57u)-.5;
      float y=lnr+.18*bend*(1.-smoothstep(.2,1.,max(fr*2.5,fa*3.)))+.02*curl*(1.-smoothstep(.2,1.,max(fr*10.,fa*9.)));
      float v=0., amp=.5, rows=14., cells=3.; uint seed=7u;
      for(int i=0;i<10;i++){
        float blur=max(fr*rows,fa*cells);
        if(blur>1.5) break;
        v+=amp*(1.-smoothstep(.55,1.5,blur))*(gasOctave(a,y,rows,cells,seed)-.5);
        amp*=i<3?.72:.88; rows*=2.; cells=floor(cells*2.05); seed+=2654435769u;
      }
      return v;
    }

    vec3 starField(vec3 d, float footprint){
      vec3 ad=abs(d); vec2 uv;
      if(ad.x>ad.y && ad.x>ad.z) uv=d.yz/(ad.x+1e-4)*.5+.5;
      else if(ad.y>ad.z) uv=d.xz/(ad.y+1e-4)*.5+.5;
      else uv=d.xy/(ad.z+1e-4)*.5+.5;
      float bright=0., faint=0.;
      vec2 gb=uv*120.; vec2 cb=floor(gb);
      float fpb=min(1.5,footprint*60.);
      vec2 gf=uv*350.; vec2 cf=floor(gf);
      float fpf=min(1.5,footprint*175.);
      // Integrate small stellar sources over a pixel footprint, preserving flux.
      float vb=.0036+.18*fpb*fpb, vf=.0025+.18*fpf*fpf;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec2 off=vec2(float(i),float(j)), c=cb+off;
        if(hash21(c)>=.985){
          vec2 q=fract(gb)-.5-off-vec2(hash21(c+5.3)-.5,hash21(c+9.1)-.5)*.34;
          bright+=exp(-dot(q,q)/vb)*(.0036/vb)*(0.65+2.4*hash21(c+3.7));
        }
        c=cf+off;
        if(hash21(c+vec2(19.))>=.965){
          vec2 q=fract(gf)-.5-off-vec2(hash21(c+7.2)-.5,hash21(c+11.8)-.5)*.4;
          faint+=exp(-dot(q,q)/vf)*(.0025/vf)*.18;
        }
      }
      vec3 warm=vec3(1.0,.88,.71), cool=vec3(.62,.74,1.0);
      return (bright*mix(warm,cool,step(.8,hash31(d*7.1)))+faint*warm)*vec3(1.0,.93,.84);
    }

    // A thin slab. fr and fa are the pixel footprint in ln(r) and in turns.
    void discMaterial(float r, float a, float fr, float fa, out float tau, out float source){
      float rf=fr*r;
      float inner=smoothstep(1.34-rf,1.66+rf,r), outer=1.-smoothstep(2.8,7.2,r); outer*=outer;
      float gas=exp(1.6*gasField(a,log(r),fr,fa));
      float fall=1.5/max(r,1.5);
      tau=.7*fall*sqrt(fall)*inner*outer*gas;
      // Broad patches of brighter gas riding the flow, so the disc shimmers as it turns.
      source=3.6*fall*fall*fall*gas*(.7+.6*gasOctave(a,log(r),3.,5.,131u));
    }
    // Colour follows intensity: each channel rises on its own curve through gold to
    // white-hot, and green and blue never fall below amber's share of red, so dim
    // gas stays amber instead of going red or grey. Zero is true black.
    vec3 glow(float v){
      float red=(pow(v+.02,.45)-.1721)*1.2;
      return vec3(red,max(pow(v,.95),.627*red),max(pow(v,1.75),.314*red))*vec3(1.,.97,.92);
    }

    // Schwarzschild null geodesic as u(phi)=1/r in the ray's own orbit plane:
    // u''=-u+1.5u^2 with Rs=1, which is exact. z and w carry du/dpsi, the
    // variational term that gives the true lensed size of a pixel at every hit.
    vec4 orbit(vec4 s){ return vec4(s.y,s.x*(1.5*s.x-1.),s.w,s.z*(3.*s.x-1.)); }
    vec4 rk4(vec4 s, float h){
      vec4 a=orbit(s), b=orbit(s+.5*h*a), c=orbit(s+.5*h*b), d=orbit(s+h*c);
      return s+h/6.*(a+2.*(b+c)+d);
    }

    // Returns the disc's tone-mapped intensity, how much of the sky gets through,
    // and the direction that sky lies in.
    void trace(vec2 q, float pixel, out float light, out float skyTrans, out vec3 skyDir){
      vec3 rd=normalize(uBasis*vec3(q*uFov,1.));
      float D=length(uCam); vec3 e1=uCam/D;
      float cosPsi=-dot(rd,e1);
      vec3 perp=rd+cosPsi*e1;
      float sinPsi=max(length(perp),1e-4);
      vec3 e2=perp/sinPsi, nrm=cross(e1,e2);
      float u0=1./D, lapse=sqrt(1.-u0);
      // Initial slope for a static observer's local direction, so the shadow has
      // its true angular size even when the camera is deep in the well.
      vec4 s=vec4(u0,u0*lapse*cosPsi/sinPsi,0.,-u0*lapse/(sinPsi*sinPsi));

      float phi=0., next=mod(atan(-e1.y,e2.y),PI); if(next<1e-3) next+=PI;
      // The rock is only tested on rays whose plane passes through it.
      float rockGap=abs(dot(uRock,nrm)), rockFoot=pixel*length(uRock-uCam);
      float rockPhi=atan(dot(uRock,e2),dot(uRock,e1)); if(rockPhi<0.) rockPhi+=TAU;
      // It fades up as it drifts in from the dark, and shrinks away at the shadow.
      float rockDist=length(uRock), rockR=ROCK_R*smoothstep(1.3,2.2,rockDist)*(1.-smoothstep(7.5,8.5,rockDist));
      bool rockNear=rockGap<rockR*1.3+rockFoot;

      float lum=0., trans=1.;
      light=0.; skyTrans=0.; skyDir=vec3(0);
      for(int k=0;k<7;k++){
        int n=max(int(ceil((next-phi)/STEP)),1);
        float h=(next-phi)/float(n);
        for(int i=0;i<24;i++){
          if(i>=n) break;
          vec4 prev=s; s=rk4(s,h); phi+=h;
          if(s.x<=0.){
            // Reached infinity: the plane angle here is the true outgoing direction.
            float end=phi-h*s.x/(s.x-prev.x);
            skyDir=cos(end)*e1+sin(end)*e2; skyTrans=trans;
            light=1.-exp(-1.3*lum); return;
          }
          if(s.x>.8){ light=1.-exp(-1.3*lum); return; }
          if(rockNear && phi>=rockPhi){
            vec4 rs=rk4(prev,rockPhi-(phi-h));
            vec3 out1=cos(rockPhi)*e1+sin(rockPhi)*e2, side=-sin(rockPhi)*e1+cos(rockPhi)*e2;
            // The ray is straight at the rock's scale, so take its nearest point to the centre.
            vec3 dir=normalize(side-out1*rs.y/rs.x), hit=out1/rs.x;
            vec3 off=hit+dir*dot(uRock-hit,dir)-uRock;
            float size=rockR*(.82+.25*noise(off.xy/ROCK_R*1.8+off.z/ROCK_R)), gap=length(off);
            float cover=(1.-smoothstep(size-rockFoot,size+rockFoot,gap))*min(1.,size*size/(rockFoot*rockFoot+1e-9));
            vec3 normal=normalize(off-dir*sqrt(max(size*size-gap*gap,0.)));
            vec3 toDisc=normalize(-uRock+vec3(0.,.34,0.));
            // Lit by the disc, then glowing from the heat as it nears the hole.
            float lit=.08+2.2*max(dot(normal,toDisc),0.)+2.5*(1.-smoothstep(1.6,3.2,rockDist));
            lum+=.4*lit*cover*trans; trans*=1.-cover;
            rockPhi+=TAU;
          }
        }
        // Crossing the equatorial plane, exactly at this angle.
        float r=1./s.x;
        if(r<R_OUT && r>1.2){
          float cp=cos(next), sp=sin(next);
          vec3 R=cp*e1+sp*e2, T=-sp*e1+cp*e2;
          // Pixel footprint on the disc from the ray differentials.
          float slope=T.y<0.?min(T.y,-.02):max(T.y,.02);
          float dphi=-sp*nrm.y/slope;
          vec3 az=vec3(-R.z,0.,R.x);
          float tangent=pixel/sinPsi;
          float fr=(abs(s.z)*pixel+abs(s.y*dphi)*tangent)*r;
          float fa=abs(dot(dphi*T+sp*nrm,az))*tangent/TAU;
          float tau, source;
          discMaterial(r,atan(R.z,R.x)/TAU+.5,fr,fa,tau,source);
          float cosI=abs(T.y)*s.x/max(length(s.xy),1e-6);
          float depth=tau/max(cosI,.03);
          float seen=exp(-depth);
          lum+=source*(1.-seen)*trans; trans*=seen;
          if(trans<.004) break;
        }
        phi=next; next+=PI;
      }
      light=1.-exp(-1.3*lum);
    }

    void main(){
      vec2 q=(vUv-.5)*2.; q.x*=uResolution.x/uResolution.y; q+=uShift;
      float pixelQ=2./uResolution.y, pixel=pixelQ*uFov;
      float light, skyTrans; vec3 skyDir;
      trace(q,pixel,light,skyTrans,skyDir);
      float skyFoot=max(length(dFdx(skyDir)),length(dFdy(skyDir)));

      // Sub-sample the shadow edge everywhere, and the whole hole once it is small.
      vec3 rd=normalize(uBasis*vec3(q*uFov,1.));
      float D=length(uCam), cosPsi=-dot(rd,uCam)/D, lapse=sqrt(1.-1./D);
      float sinPsi=sqrt(max(1.-cosPsi*cosPsi,0.));
      float b=sinPsi*D/lapse, pixelB=pixel*D*abs(cosPsi)/lapse;
      bool hole=pixelB>.03 && b<R_OUT+4.*pixelB;
      if(cosPsi>0. && (hole || abs(b-2.66)<.1+3.*pixelB)){
        const vec2 grid[4]=vec2[4](vec2(-.125,-.375),vec2(.375,-.125),vec2(.125,.375),vec2(-.375,.125));
        float sum=light, through=skyTrans;
        for(int i=0;i<4;i++){
          float l, t; vec3 d;
          trace(q+grid[i]*pixelQ,pixel*.6,l,t,d);
          sum+=l; through+=t; if(skyTrans<=0.&&t>0.) skyDir=d;
        }
        light=sum*.2; skyTrans=through*.2;
      }

      vec3 color=glow(light);
      float clear=smoothstep(.55,1.,skyTrans);
      if(clear>0.) color+=(1.-exp(-1.3*starField(skyDir,skyFoot)))*clear;
      float vign=1.-.15*dot(q,q)/(1.6*1.6); color*=clamp(vign,.76,1.);
      float peak=max(color.r,max(color.g,color.b));
      color+=(hash21(gl_FragCoord.xy)-.5)*(1./255.)*smoothstep(0.,.03,peak);
      outColor=vec4(color,1.);
    }
  `;

  let gl, program, buffer, loc={}, gpuExt=null, gpuQuery=null;
  function compile(type, source){ const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s); return s; }
  // The shader takes seconds to build on a cold start, so it builds in the background.
  // Nothing here may ask for its status until ready() says it's done, or the page freezes.
  gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:false,failIfMajorPerformanceCaveat:true});
  if(!gl) return null;
  const parallel=gl.getExtension('KHR_parallel_shader_compile');
  program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource)); gl.linkProgram(program);
  function ready(){
    if(diagnostics.ready) return true;
    if(parallel && !gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR)) return false;
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){ onLost(); return false; }
    gl.useProgram(program); buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(program,'aPosition'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    ['uResolution','uTime','uCam','uBasis','uFov','uRock','uShift'].forEach(n=>loc[n]=gl.getUniformLocation(program,n));
    gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    diagnostics.gpuAvailable=!!gpuExt;
    return diagnostics.ready=true;
  }

  const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
  const smooth=(lo,hi,x)=>{ const t=clamp((x-lo)/(hi-lo),0,1); return t*t*(3-2*t); };
  const LOG_MIN=Math.log(MIN_DISTANCE), LOG_MAX=Math.log(MAX_DISTANCE), LOG_NEAR=Math.log(NEAR_DISTANCE);
  // 0 from the near view outwards, 1 at the closest point.
  const closeness=z=>smooth(LOG_NEAR+.5,LOG_MIN,z);
  // Half the height of the view at the hole's distance. The lens cancels out of this.
  const viewSize=z=>.53*Math.exp(z)*Math.max(1,.95*canvas.height/canvas.width);

  // Where the camera looks, as an offset from the hole in view axes. Zooming moves it
  // toward the cursor, like a map. Past the near view it must stay outside the shadow,
  // or the frame would be black, so a cursor over the centre slides to the nearest edge.
  const aim=[0,0], aimDir=[.982,-.189], cursor=[0,0], shift=[0,0];
  function pointAt(x,y){ cursor[0]=(x/innerWidth*2-1)*innerWidth/innerHeight+shift[0]; cursor[1]=1-y/innerHeight*2+shift[1]; }
  function steer(before){
    const moved=viewSize(before)-viewSize(zoom);
    aim[0]+=cursor[0]*moved; aim[1]+=cursor[1]*moved;
    const r=Math.hypot(aim[0],aim[1]);
    if(r>.001){ aimDir[0]=aim[0]/r; aimDir[1]=aim[1]/r; }
    const edge=smooth(LOG_NEAR+.1,Math.log(3.2),zoom), low=2.65*edge, high=Math.max(Math.min(4.5*smooth(Math.log(30),LOG_NEAR,zoom),.6*viewSize(zoom)),low+.8*edge), reach=clamp(r,low,high);
    aim[0]=aimDir[0]*reach; aim[1]=aimDir[1]*reach; diagnostics.aim=[aim[0],aim[1]];
  }

  // Zoom lives in log distance. zoomGoal is what input moves; zoom follows it with
  // the live site's exponential ease. A flight only drives the goal, so any input
  // can take over mid-flight with no jump.
  let running=false, azimuth=0, elevation=.045, zoom=Math.log(FAR_DISTANCE), zoomGoal=zoom, flight=null, last=performance.now(), simTime=12, drift=0;   // 12 s in, so the first rock is already on its way
  function zoomBy(delta){ flight=null; zoomGoal=clamp(zoomGoal+delta*(1-.45*closeness(zoomGoal)),LOG_MIN,LOG_MAX); if(reduced) zoom=zoomGoal; }
  function flyTo(distance,duration){ const to=Math.log(distance); if(reduced){ flight=null; zoom=zoomGoal=to; return; } flight={from:zoomGoal,to,duration,start:performance.now()}; }
  function toggle(){ const requested=flight?flight.to:zoomGoal; if(requested<Math.log(20)) flyTo(FAR_DISTANCE,5200); else flyTo(NEAR_DISTANCE,6900); }
  function stepZoom(now,dt){
    if(flight){ const u=clamp((now-flight.start)/flight.duration,0,1); const e=u<.28?.07*(u/.28)**2:.07+.93*smooth(.28,1,u); zoomGoal=flight.from+(flight.to-flight.from)*e; if(u>=1) flight=null; }
    // Rate 6 matches the live site; the hole gets heavier as you close in.
    const rate=6-4.6*closeness(zoom), before=zoom;
    zoom+=(zoomGoal-zoom)*(reduced?1:1-Math.exp(-dt*.001*rate));
    steer(before);
    const distance=Math.exp(zoom);
    diagnostics.distance=distance; diagnostics.goal=Math.exp(zoomGoal); diagnostics.state=flight?(flight.to<flight.from?'approaching':'returning'):(distance<20?'near':'far');
  }
  // Native resolution at every zoom, capped so large screens stay in budget, then
  // scaled by quality on GPUs that can't keep up.
  let quality=1;
  function resize(){ const dpr=Math.min(devicePixelRatio||1,1.5), cap=Math.sqrt(MAX_PIXELS/Math.max(1,innerWidth*innerHeight*dpr*dpr)), scale=dpr*Math.min(1,cap)*quality; canvas.width=Math.max(1,Math.floor(innerWidth*scale)); canvas.height=Math.max(1,Math.floor(innerHeight*scale)); gl.viewport(0,0,canvas.width,canvas.height); diagnostics.internalResolution=canvas.width+'x'+canvas.height; }
  addEventListener('resize',resize,{passive:true}); resize();

  // Watches frame times and trades resolution for speed. It judges the median of each
  // 0.75 s window, so a short spike changes nothing. Once frames are calm it steps back
  // up. A size that proves too much stays off limits for a minute, so a GPU on the edge
  // settles instead of flickering between two sizes.
  let frameTimes=[], windowStart=0, calmSince=0, riseAt=-1e9, ceiling=Infinity, ceilingUntil=0;
  function setQuality(q){ quality=clamp(q,MIN_QUALITY,1); diagnostics.quality=quality; resize(); }
  function govern(now,dt){
    if(dt>1000){ frameTimes=[]; windowStart=calmSince=now; return; }   // the tab was hidden
    frameTimes.push(dt);
    if(now-windowStart<750 || frameTimes.length<5) return;
    const median=frameTimes.sort((a,b)=>a-b)[frameTimes.length>>1];
    frameTimes=[]; windowStart=now;
    if(median>SLOW_MS){
      if(now-riseAt<3000){ ceiling=quality; ceilingUntil=now+60000; }
      calmSince=now;
      if(quality>MIN_QUALITY) setQuality(quality*clamp(Math.sqrt(.85*SLOW_MS/median),.7,.92));   // cost follows pixel count
    } else if(median>CALM_MS) calmSince=now;
    else if(quality<1 && now-calmSince>4000 && (now>ceilingUntil || quality*1.12<ceiling)){ setQuality(quality*1.12); riseAt=calmSince=now; }
  }

  // Zoom is one number; the camera path turns it into distance, lens and aim. Far out
  // it is a plain dolly. Around the near view it trades dolly for a longer lens, so
  // the camera stays outside the disc and the band stays thin as in the film. At
  // the close end it dollies in again, looking wherever aim points. A slow drift keeps
  // the view alive; it pauses while the hole is being dragged.
  function camera(){
    const lens=.48*smooth(Math.log(18),LOG_NEAR,zoom)-.34*smooth(LOG_NEAR,LOG_MIN,zoom);
    const az=azimuth+.06*Math.sin(drift*.06), el=elevation+.018*Math.sin(drift*.043);
    const distance=Math.exp(zoom+lens); diagnostics.cameraDistance=distance;
    const cam=[Math.sin(az)*Math.cos(el)*distance,Math.sin(el)*distance,Math.cos(az)*Math.cos(el)*distance];
    const norm=v=>{ const l=Math.hypot(v[0],v[1],v[2]); return [v[0]/l,v[1]/l,v[2]/l]; };
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    let f=norm([-cam[0],-cam[1],-cam[2]]), r=norm(cross(f,[0,1,0])), up=cross(r,f);
    f=norm([r[0]*aim[0]+up[0]*aim[1]-cam[0],r[1]*aim[0]+up[1]*aim[1]-cam[1],r[2]*aim[0]+up[2]*aim[1]-cam[2]]); r=norm(cross(f,up)); up=cross(r,f);
    const fov=.53*Math.exp(-lens)*Math.max(1,.95*canvas.height/canvas.width);
    return {cam,basis:[...r,...up,...f],fov};
  }
  function draw(now){ if(!running)return; const dt=Math.max(0,now-last); last=now; stepZoom(now,dt); if(!reduced){ simTime+=dt*.001; if(!pointers.size) drift+=dt*.001; } govern(now,dt); diagnostics.frames++; diagnostics.frameMs=diagnostics.frameMs?diagnostics.frameMs*.96+dt*.04:dt;
    if(gpuExt && gpuQuery && gl.getQueryParameter(gpuQuery,gl.QUERY_RESULT_AVAILABLE)){
      if(!gl.getParameter(gpuExt.GPU_DISJOINT_EXT)){ diagnostics.gpuMs=gl.getQueryParameter(gpuQuery,gl.QUERY_RESULT)/1000000; diagnostics.gpuSamples++; }
      gl.deleteQuery(gpuQuery); gpuQuery=null;
    }
    let gpuActive=false;
    if(gpuExt && !gpuQuery){ gpuQuery=gl.createQuery(); gl.beginQuery(gpuExt.TIME_ELAPSED_EXT,gpuQuery); gpuActive=true; }
    const view=camera();
    // The rock spirals in, faster as it falls, then the next one starts somewhere else.
    const rockRadius=Math.sqrt(Math.max(ROCK_START**2-3*(simTime%ROCK_CYCLE),1)), rockAngle=1.2+2.4*Math.floor(simTime/ROCK_CYCLE)+5.6*(Math.sqrt(ROCK_START)-Math.sqrt(rockRadius));
    gl.uniform2f(loc.uResolution,canvas.width,canvas.height); gl.uniform1f(loc.uTime,simTime); gl.uniform3fv(loc.uCam,view.cam); gl.uniformMatrix3fv(loc.uBasis,false,view.basis); gl.uniform1f(loc.uFov,view.fov); gl.uniform2fv(loc.uShift,shift); gl.uniform3f(loc.uRock,Math.cos(rockAngle)*rockRadius,.03*rockRadius*Math.sin(rockAngle),Math.sin(rockAngle)*rockRadius); gl.drawArrays(gl.TRIANGLES,0,3);
    if(gpuActive) gl.endQuery(gpuExt.TIME_ELAPSED_EXT);
    requestAnimationFrame(draw); }

  // One pointer orbits, or clicks if it barely moves. Two pointers pinch.
  const pointers=new Map(); let moved=false, dragDistance=0, pinchGap=0;
  const gap=()=>{ const [a,b]=[...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
  canvas.addEventListener('pointerdown',e=>{ if(!pointers.size){ moved=false; dragDistance=0; } pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); canvas.setPointerCapture(e.pointerId); if(pointers.size===2){ pinchGap=gap(); moved=true; } });
  canvas.addEventListener('pointermove',e=>{ const p=pointers.get(e.pointerId); if(!p)return; const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
    if(pointers.size===2){ const g=gap(), [a,b]=[...pointers.values()]; pointAt((a.x+b.x)/2,(a.y+b.y)/2); if(pinchGap>0&&g>0) zoomBy(-Math.log(g/pinchGap)); pinchGap=g; return; }
    dragDistance+=Math.abs(dx)+Math.abs(dy); if(dragDistance>4) moved=true;
    azimuth+=dx*.004; elevation=clamp(elevation+dy*.004,-1.25,1.25); diagnostics.azimuth=azimuth; diagnostics.elevation=elevation; });
  const release=e=>{ const had=pointers.delete(e.pointerId); if(had&&e.type==='pointerup'&&!pointers.size&&!moved){ pointAt(e.clientX,e.clientY); toggle(); } };
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  // Same direction and speed as the live site's wheel; trackpad pinch arrives as ctrl+wheel with small deltas.
  canvas.addEventListener('wheel',e=>{ e.preventDefault(); pointAt(e.clientX,e.clientY); const unit=e.deltaMode===1?33:e.deltaMode===2?innerHeight:1; zoomBy(e.deltaY*unit*(e.ctrlKey?.01:.0015)); },{passive:false});
  prefersReduced.addEventListener?.('change',e=>{ reduced=e.matches; if(reduced){ if(flight) zoomGoal=flight.to; flight=null; zoom=zoomGoal; } });
  canvas.addEventListener('webglcontextlost',e=>{ e.preventDefault(); diagnostics.ready=running=false; onLost(); });
  diagnostics.elevation=elevation;

  let closeFrom=null;
  return {
    ready,
    // Each visit starts from the far view.
    start(){
      if(running) return;
      azimuth=0; elevation=.045; zoom=zoomGoal=Math.log(FAR_DISTANCE); flight=null; drift=0;
      aim[0]=aim[1]=cursor[0]=cursor[1]=0; frameTimes=[]; last=windowStart=calmSince=performance.now();
      closeFrom=null; running=true; resize(); requestAnimationFrame(draw);
    },
    stop(){ running=false; },
    // The fly-in and out: e runs from 0, matching the site's hole (rs is its shadow radius
    // in CSS pixels), to 1 at the far view. Closing starts from however close you are.
    follow(rs,e,closing){
      const small=Math.log(Math.min(600,2.6*innerHeight/(1.06*Math.max(1,.95*canvas.height/canvas.width)*Math.max(rs,1))));
      if(closing && closeFrom===null) closeFrom=zoom;
      if(!closing) closeFrom=null;
      flight=null; zoom=zoomGoal=small+((closing?closeFrom:Math.log(FAR_DISTANCE))-small)*e;
    },
    // Screen point, in CSS pixels, the hole should sit on.
    centre(x,y){ shift[0]=(innerWidth-2*x)/innerHeight; shift[1]=2*y/innerHeight-1; }
  };
};
