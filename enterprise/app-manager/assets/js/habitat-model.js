import * as THREE from '../vendor/three/three.module.js';

function inscription(block,w,h,scene) {
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=112;const ctx=canvas.getContext('2d');
 ctx.fillStyle='rgba(10,16,19,.94)';ctx.fillRect(0,0,1024,112);ctx.fillStyle=block.occupied?'#efae58':'#819099';ctx.fillRect(0,0,8,112);
 ctx.fillStyle='#f4f4ee';ctx.font='500 39px system-ui';ctx.textBaseline='middle';let title=String(block.animal||block.name||'Ubikace');while(ctx.measureText(title).width>960&&title.length>2)title=title.slice(0,-2)+'…';ctx.fillText(title,24,36);
 ctx.fillStyle='#afb9bf';ctx.font='27px system-ui';ctx.fillText(String(block.name||'')+' · '+(block.occupied?'obsazená':'volná'),24,82);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;const width=w*.82,height=Math.min(h*.12,width*112/1024);
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));mesh.userData.ownedTexture=true;mesh.renderOrder=45;return mesh;
}

export function buildHabitat(block,depth,scene) {
  const g=new THREE.Group,w=+block.w||40,h=+block.h||40,d=+block.d||depth||40,lit=!!block.occupied;
  const frame=scene.mat('habitat-frame',{color:0x182023,roughness:.35,metalness:.6});
  const kind=scene.kind(block.type),r=Math.max(1,Math.min(w,h)*.026),isBox=kind==='box',isWater=kind==='paludarium',isVertical=kind==='vertical',isIncubation=kind==='incubation',isQuarantine=kind==='quarantine',isTechnicalBox=isBox||isIncubation||isQuarantine;
  const interior=scene.mat(lit?'habitat-lit':'habitat-unlit',{color:lit?0x293b2a:0x101719,emissive:lit?0x132219:0,emissiveIntensity:.72,roughness:.95});
  const soil=scene.mat('habitat-earth',{color:0x32271f,roughness:1});
  const glass=scene.pmat('habitat-clear-v20',{color:0xecf3f2,transparent:true,opacity:.12,roughness:.08,metalness:.05,transmission:.25,thickness:.8,ior:1.47,clearcoat:1,clearcoatRoughness:.025,side:THREE.DoubleSide,depthWrite:false});
  scene.box(g,w/2,h/2,1,w,h,2,interior);
  scene.box(g,w/2,h*.045,d/2,w-r,h*.09,d,soil);
  // rear naturalistic background with subtle relief strips
  const bg=scene.mat(lit?'habitat-bg-v20':'habitat-bg-off-v20',{color:lit?0xc5b99d:0x635e52,map:scene.imageTexture('cork-bark-46.png'),bumpMap:scene.imageTexture('cork-bark-46.png'),bumpScale:.8,roughness:.97});
  scene.box(g,w/2,h*.5,.7,w-r*2,h-r*2,1.1,bg);

  for(const x of [r/2,w-r/2])for(const z of [r/2,d-r/2])scene.box(g,x,h/2,z,r,h,r,frame);
  for(const y of [r/2,h-r/2]){scene.box(g,w/2,y,d-r/2,w,r,r,frame);scene.box(g,w/2,y,r/2,w,r,r,frame);}
  // Complete top construction: perimeter frame, removable mesh/glass lid and rear cable/service strip.
  scene.box(g,w/2,h-r*.45,d/2,w-r*2,r*.55,d-r*2,scene.pmat('habitat-top-glass-v22',{color:0xb9d5d6,transparent:true,opacity:.12,roughness:.1,transmission:.5,thickness:.25,depthWrite:false}),false);
  scene.box(g,w/2,h-r*.12,d*.16,w-r*2,r*.32,d*.22,frame,false);
  scene.box(g,w/2,h-r*.12,d*.84,w-r*2,r*.32,d*.22,frame,false);
  for(let n=0;n<18;n++)scene.box(g,w*(.08+n*.048),h-r*.02,d*.52,w*.018,r*.14,d*.54,scene.mat('habitat-top-mesh-v22',{color:0x222a2c,roughness:.42,metalness:.78}),false);
  for(const x of [r/2,w-r/2])scene.box(g,x,h/2,d/2,.5,h-r*2,d-r*2,glass,false);
  scene.box(g,w/2,h/2,d-.2,w-r*2,h-r*2,.3,isTechnicalBox?scene.mat('habitat-box-front',{color:0x8f9b9d,roughness:.45,transparent:true,opacity:.4}):glass,false);
  scene.box(g,w/2,h*.82,d+.2,w*.14,r*.65,r*.8,frame);
  // front door split, handles and ventilation rails
  if(!isTechnicalBox){
    scene.box(g,w/2,h/2,d+.05,r*.45,h-r*3,.35,frame,false);
    for(const x of [w*.28,w*.72])scene.box(g,x,h*.53,d+.55,r*.55,h*.12,r*.6,scene.mat('habitat-handle-v22',{color:0xaeb8ba,roughness:.16,metalness:.92}),false);
  }else{
    scene.box(g,w/2,h*.5,d+.48,w*.22,Math.max(1.4,h*.055),r*.7,scene.mat('rack-drawer-handle-v36',{color:0x9ca8aa,roughness:.2,metalness:.82}),false);
  }
  scene.box(g,w/2,h-r*.85,d+.2,w-r*2,r*.75,r*.55,frame,false);
  scene.box(g,w/2,r*.9,d+.2,w-r*2,r*.72,r*.55,frame,false);
  for(const x of [w*.05,w*.95])for(const y of [h*.28,h*.72])scene.box(g,x,y,d+.42,r*.7,h*.07,r*.55,scene.mat('habitat-hinge-v22',{color:0x111719,roughness:.28,metalness:.9}),false);
  for(let n=0;n<9;n++)scene.box(g,w*(.18+n*.08),h*.09,d+.35,w*.045,r*.22,r*.35,frame,false);
  // Premium construction details: lower service channel, corner caps and door track.
  scene.box(g,w/2,r*.42,d+.62,w-r*1.5,r*.32,r*.75,scene.mat('habitat-track-p39',{color:0x879194,roughness:.18,metalness:.92}),false);
  for(const x of [r*.65,w-r*.65])for(const y of [r*.65,h-r*.65])scene.box(g,x,y,d+.58,r*.72,r*.72,r*.72,scene.mat('habitat-cap-p39',{color:0x111719,roughness:.24,metalness:.8}),false);
  if(lit){
    const led=scene.mat('habitat-warm-led',{color:0xffefd1,emissive:0xffc777,emissiveIntensity:5.2});
    scene.box(g,w/2,h-r*2,d*.55,w*.8,r*.5,d*.08,led,false);
    const lamp=new THREE.PointLight(0xffd79c,Math.max(14,w*h*.016),Math.max(w,d)*1.6,2);lamp.position.set(w/2,h*.82,d*.52);g.add(lamp);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,0,0,64,25,130);
    gradient.addColorStop(0,'rgba(255,225,148,.38)');gradient.addColorStop(1,'rgba(255,225,148,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);
    const texture=new THREE.CanvasTexture(canvas);const glow=new THREE.Mesh(new THREE.PlaneGeometry(w*.94,h*.83),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));glow.position.set(w/2,h*.53,2.3);glow.userData.ownedTexture=true;g.add(glow);
  }
  if(!isTechnicalBox){
    // Desktop HQ hardscape: stones, moss mounds and layered branches.
    const stone=scene.mat('habitat-stone-hq',{color:lit?0x55544c:0x2d302d,roughness:.98});
    const moss=scene.mat('habitat-moss-hq',{color:lit?0x35583a:0x1b3022,roughness:1});
    for(let n=0;n<8;n++){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(Math.max(1.6,w*(.025+(n%3)*.008)),1),stone);rock.position.set(w*(.12+(n*.117)% .76),h*.09,d*(.2+(n%4)*.16));rock.scale.set(1.5,.65,1.05);rock.rotation.set(n*.31,n*.67,n*.17);rock.castShadow=rock.receiveShadow=true;g.add(rock);}
    for(let n=0;n<6;n++){const mound=new THREE.Mesh(new THREE.SphereGeometry(Math.max(2,w*.035),12,7),moss);mound.scale.set(1.7,.35,1.25);mound.position.set(w*(.16+n*.13),h*.085,d*(.28+(n%3)*.2));mound.castShadow=true;g.add(mound);}
    const bark=scene.mat('habitat-bark',{color:lit?0x796044:0x342f29,roughness:1});
    for(let n=0;n<5;n++){
      const branch=new THREE.Mesh(new THREE.CylinderGeometry(w*.009,w*.022,h*(.38+(n%3)*.08),9),bark);
      branch.position.set(w*(.2+(n%4)*.19),h*(.3+n*.07),d*(.22+(n%4)*.16));branch.rotation.z=(n%2?-.65:.55);branch.castShadow=true;g.add(branch);
    }
    const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.bezierCurveTo(-.45,.25,-.38,.8,0,1);leafShape.bezierCurveTo(.4,.75,.42,.22,0,0);
    const leafGeometry=new THREE.ShapeGeometry(leafShape,14);const positions=leafGeometry.attributes.position;for(let v=0;v<positions.count;v++){const x=positions.getX(v),y=positions.getY(v);positions.setZ(v,.20*Math.sin(y*Math.PI)-.28*Math.abs(x));}leafGeometry.computeVertexNormals();
    for(let n=0;n<28;n++){
      const leaf=new THREE.Mesh(leafGeometry,scene.mat(lit?'habitat-leaf-'+n%3:'habitat-leaf-off',{color:lit?[0x386749,0x55764a,0x698450][n%3]:0x1a3028,roughness:.75,side:THREE.DoubleSide}));
      const side=n%2;leaf.position.set(w*(side?.76:.22)+Math.sin(n*2)*w*.06,h*(.15+(n%10)*.065),d*(.18+(n%5)*.12));leaf.scale.set(w*(.15+(n%3)*.035),h*(.13+(n%4)*.025),1);leaf.rotation.set(.1+(n%3)*.2,side?-.65:.65,side?-.9:.9);leaf.castShadow=true;g.add(leaf);
    }
    if(isWater)scene.box(g,w/2,h*.11,d*.54,w-r*3,h*.1,d*.83,scene.mat('habitat-water',{color:0x4c929f,transparent:true,opacity:.55,roughness:.08,metalness:.25}),false);
  }

  // Premium edge definition: visible front construction even in dark rooms.
  const edge=scene.mat('habitat-edge-v36',{color:lit?0x8b9593:0x4b5557,roughness:.32,metalness:.72});
  for(const x of [r*.55,w-r*.55]) scene.box(g,x,h/2,d+.62,r*.24,h-r*1.4,r*.24,edge,false);
  for(const y of [r*.7,h-r*.7]) scene.box(g,w/2,y,d+.62,w-r*1.4,r*.24,r*.24,edge,false);

  // Type-specific construction so glass, arboreal, paludarium and rack boxes are visually distinct.
  if(isVertical){
    const cork=scene.mat('arboreal-cork-v24',{color:lit?0x694a31:0x30271f,roughness:1});
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(w*.035,w*.055,h*.72,12),cork);trunk.position.set(w*.22,h*.43,d*.38);trunk.rotation.z=-.12;trunk.castShadow=true;g.add(trunk);
    for(let n=0;n<3;n++){const perch=new THREE.Mesh(new THREE.CylinderGeometry(w*.014,w*.022,w*.68,10),cork);perch.position.set(w*.5,h*(.32+n*.2),d*(.32+n*.12));perch.rotation.z=Math.PI/2+(n-1)*.12;perch.rotation.y=.22;perch.castShadow=true;g.add(perch);}
    scene.box(g,w*.83,h*.48,d+.42,r*.55,h*.58,r*.5,frame,false);
  }
  if(isWater){
    const water=scene.pmat('paludarium-water-v24',{color:0x3f94a8,transparent:true,opacity:.48,roughness:.05,metalness:.12,transmission:.35,depthWrite:false});
    scene.box(g,w/2,h*.17,d*.55,w-r*3,h*.22,d*.82,water,false);
    const bank=scene.mat('paludarium-bank-v24',{color:0x4a3928,roughness:1});scene.box(g,w*.72,h*.22,d*.48,w*.38,h*.22,d*.68,bank,false);
  }
  if(isBox){
    const tub=scene.pmat('rack-tub-v24',{color:0x798589,transparent:true,opacity:.5,roughness:.34,metalness:.05,depthWrite:true});
    scene.box(g,w/2,h*.48,d*.5,w-r*2,h*.86,d-r*2,tub,false);
    const lip=scene.mat('rack-lip-v24',{color:0x252c2f,roughness:.42,metalness:.45});scene.box(g,w/2,h*.93,d*.5,w,r*.9,d,lip,false);
    for(let n=0;n<8;n++)scene.box(g,w*(.15+n*.1),h*.93,d*.12,w*.025,r*.35,d*.1,frame,false);
  }
  if(isIncubation||isQuarantine){
    // Clean technical interior: neutral tub instead of soil/live planting, no aggressive colour.
    const tub=scene.pmat('technical-tub-v56',{color:0xdfe3e2,transparent:true,opacity:.42,roughness:.3,metalness:.04});
    scene.box(g,w/2,h*.46,d*.5,w-r*2,h*.8,d-r*2,tub,false);
  }
  if(isIncubation){
    // Digital display (reuses the same emissive-plate language as room sensors/thermostats) + a small egg tray.
    const screen=scene.mat('incubator-screen-v56',{color:0x102524,emissive:0x1f6a63,emissiveIntensity:1.4,roughness:.2});
    scene.box(g,w*.78,h*.66,d+.4,w*.24,h*.14,1.4,screen,false);
    const tray=scene.mat('incubator-tray-v56',{color:0x2c3336,roughness:.6}),egg=scene.mat('incubator-egg-v56',{color:0xf1ecdd,roughness:.55});
    scene.box(g,w*.32,h*.1,d*.52,w*.42,r*.28,d*.5,tray,false);
    for(let n=0;n<3;n++){const e=new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.6,w*.028),12,10),egg);e.scale.set(1,1.28,1);e.position.set(w*(.18+n*.13),h*.16,d*.5+(n%2?3:-3));e.castShadow=true;g.add(e);}
  }
  if(isQuarantine){
    // Subtle isolation cue: a thin cool band near the top edge - deliberately not red/alarm-styled.
    const band=scene.mat('quarantine-band-v56',{color:0x6f8fa6,emissive:0x213b47,emissiveIntensity:.55,roughness:.4});
    scene.box(g,w/2,h*.94,d+.35,w-r*1.5,Math.max(1.2,r*.3),r*.4,band,false);
  }
  // Premium Engine: stronger physical identity for each enclosure family.
  if(kind==='glass'||isVertical){
    const rail=scene.mat('premium-aluminium',{color:0x596469,roughness:.18,metalness:.92});
    scene.box(g,w/2,h*.985,d*.52,w*.94,Math.max(.8,r*.32),d*.04,rail,false);
    scene.box(g,w/2,h*.015,d*.52,w*.94,Math.max(.8,r*.28),d*.04,rail,false);
  }
  if(isTechnicalBox){
    const pvc=scene.mat('premium-pvc',{color:0x30373a,roughness:.62,metalness:.05});
    scene.box(g,r*.65,h/2,d*.5,r*1.25,h*.96,d*.96,pvc);scene.box(g,w-r*.65,h/2,d*.5,r*1.25,h*.96,d*.96,pvc);
    const runner=scene.mat('premium-runner',{color:0x111719,roughness:.3,metalness:.65});
    for(const y of [h*.08,h*.92])scene.box(g,w/2,y,d*.92,w*.9,r*.45,d*.08,runner,false);
  }
  if(isWater){
    const edge=scene.mat('premium-paludarium-edge',{color:0x1b2528,roughness:.25,metalness:.72});
    scene.box(g,w/2,h*.285,d+.42,w*.94,r*.42,r*.42,edge,false);
    const drain=scene.cyl(g,w*.86,h*.12,d*.78,Math.max(1.1,r*.7),Math.max(2,r*1.2),scene.mat('premium-drain',{color:0x839096,roughness:.2,metalness:.9}),24);drain.rotation.x=Math.PI/2;
  }
  // Fine ventilation mesh and lower drainage detail.
  const meshMat=scene.mat('habitat-vent-mesh-hq',{color:0x30383a,roughness:.48,metalness:.72});
  for(let n=0;n<14;n++)scene.box(g,w*(.12+n*.058),h*.965,d*.5,w*.025,r*.16,d*.56,meshMat,false);
  scene.box(g,w/2,h*.035,d*.5,w*.88,r*.18,d*.84,scene.mat('habitat-drain-hq',{color:0x171d1f,roughness:.5,metalness:.5}),false);
  // Premium visual pass: recessed plinth, warm occupancy line and dimensional front sill.
  const plinth=scene.mat('premium-plinth-v35',{color:0x111719,roughness:.48,metalness:.62});
  scene.box(g,w/2,Math.max(.7,r*.28),d*.5,w*.98,Math.max(1.2,r*.42),d*.98,plinth,true);
  const sill=scene.mat('premium-front-sill-v35',{color:0x465156,roughness:.2,metalness:.88});
  scene.box(g,w/2,Math.max(1.2,r*.48),d+.62,w*.94,Math.max(.8,r*.25),Math.max(.8,r*.34),sill,false);
  if(lit){
    const accent=scene.mat('premium-occupied-accent-v35',{color:0xffa24c,emissive:0xff6f18,emissiveIntensity:1.35,roughness:.28});
    scene.box(g,w/2,Math.max(1.8,r*.72),d+.92,w*.72,Math.max(.55,r*.16),Math.max(.45,r*.14),accent,false);
  }
  // P38 asset pass: crisp silhouette, glass reflections and a visible occupied-light volume.
  const outlineMat=new THREE.LineBasicMaterial({color:lit?0xb9c8c8:0x657174,transparent:true,opacity:lit?.18:.12,depthWrite:false,toneMapped:false});
  const outlineGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.2,w),Math.max(.2,h),Math.max(.2,d)),28);
  const outline=new THREE.LineSegments(outlineGeo,outlineMat);outline.position.set(w/2,h/2,d/2);outline.renderOrder=30;g.add(outline);
  if(!isTechnicalBox){
    const reflection=scene.pmat('p38-glass-reflection',{color:0xeaf2f1,transparent:true,opacity:.035,roughness:.09,metalness:.08,transmission:0,thickness:.9,clearcoat:1,clearcoatRoughness:.02,depthWrite:false,side:THREE.DoubleSide});
    const pane=scene.box(g,w/2,h/2,d+.72,w-r*2,h-r*2,.22,reflection,false);pane.renderOrder=34;
    const rail=scene.mat('p38-front-rail',{color:0x5d696d,roughness:.16,metalness:.94});
    scene.premiumBox(g,w/2,h*.5,d+1.05,w*.96,Math.max(.45,r*.16),Math.max(.5,r*.2),rail,0xd2dcde,.86);
  }
  if(lit){
    const warm=scene.mat('p38-occupied-line',{color:0xffb263,emissive:0xff7b20,emissiveIntensity:3.1,roughness:.18});
    scene.box(g,w/2,h*.965,d+.98,w*.74,Math.max(.7,r*.2),Math.max(.6,r*.18),warm,false);
    const fill=new THREE.PointLight(0xffc47c,Math.max(16,w*h*.018),Math.max(85,Math.max(w,d)*2.1),1.65);fill.position.set(w/2,h*.62,d*.68);g.add(fill);
  }
  const label=inscription(block,w,h,scene);label.position.set(w/2,Math.max(h*.07,3),d+1.25);g.add(label);
  return g;
}
