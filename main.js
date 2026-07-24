// ============================================================
// ZEUS: NEON HEIST — Full Game Engine
// ============================================================

// ----- SETTINGS -----
const SET = JSON.parse(localStorage.getItem('zh_settings')) || { music:0.5, sfx:0.7, particles:true, shake:true, weather:true };
function saveSett(){ localStorage.setItem('zh_settings', JSON.stringify(SET)) }
function updateSett(){ SET.music=+document.getElementById('s_music').value; SET.sfx=+document.getElementById('s_sfx').value; saveSett() }
function tog(k){ SET[k]=!SET[k]; const el=document.getElementById('s_'+k); if(el){el.textContent=SET[k]?'ON':'OFF';el.classList.toggle('active',SET[k])} saveSett() }
function toggleFS(){ if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{})}else{document.exitFullscreen()} const e=document.getElementById('s_fs'); if(e){e.textContent=document.fullscreenElement?'ON':'OFF';e.classList.toggle('active',!!document.fullscreenElement)} }

// ----- AUDIO -----
let AC = null;
function initA(){ if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)() }
function sfx(name){
  if(!SET.sfx) return;
  try{
    initA();
    const m = {
      hit:[200,0.07,'square',0.05], slash:[400,0.1,'sawtooth',0.06],
      magic:[600,0.2,'sine',0.05], coin:[1000,0.06,'sine',0.05],
      levelup:[500,0.3,'sine',0.07], dash:[750,0.05,'sine',0.04],
      heal:[700,0.2,'sine',0.05], click:[650,0.04,'sine',0.03],
      hack:[350,0.15,'square',0.04], alarm:[220,0.4,'sawtooth',0.03]
    }[name];
    if(!m) return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = m[2]; o.frequency.value = m[0];
    g.gain.setValueAtTime(m[3]*SET.sfx, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime+m[1]);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime+m[1]);
  } catch(e){}
}

// ----- BG PARTICLES (RAIN/NEON) -----
const BC = document.getElementById('bgCanvas'), BX = BC.getContext('2d');
let bP = [];
function resB(){ BC.width = innerWidth; BC.height = innerHeight }
window.addEventListener('resize', resB); resB();

function initBP(n=55){
  bP = [];
  for(let i=0; i<n; i++) bP.push({
    x: Math.random()*BC.width, y: Math.random()*BC.height,
    vx: (Math.random()-0.5)*0.15, vy: (Math.random()-0.5)*0.15-0.05,
    s: Math.random()*2+0.5, a: Math.random()*0.25+0.03, p: Math.random()*6.28
  });
}

function updateBP(){
  bP.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.p += 0.015;
    if(p.x<0) p.x = BC.width; if(p.x>BC.width) p.x = 0;
    if(p.y<0) p.y = BC.height; if(p.y>BC.height) p.y = 0;
  });
}

function drawBP(){
  if(!SET.particles) return;
  BX.clearRect(0,0,BC.width,BC.height);
  // Rain lines
  for(let i=0; i<25; i++){
    const x = (i*37 + GS.gameTime*120) % BC.width;
    const y = (i*73 + GS.gameTime*200) % BC.height;
    BX.strokeStyle = `rgba(0,229,255,${0.03+Math.sin(GS.gameTime+i)*0.02})`;
    BX.lineWidth = 0.5;
    BX.beginPath(); BX.moveTo(x,y); BX.lineTo(x-2,y+15); BX.stroke();
  }
  // Particles
  bP.forEach(p => {
    const a = p.a*(0.5+0.5*Math.sin(p.p));
    BX.beginPath(); BX.arc(p.x,p.y,p.s,0,6.28);
    BX.fillStyle = `rgba(0,229,255,${a})`; BX.fill();
    BX.beginPath(); BX.arc(p.x,p.y,p.s*2.5,0,6.28);
    BX.fillStyle = `rgba(255,45,149,${a*0.08})`; BX.fill();
  });
}
initBP();

// ----- GAME STATE -----
const GS = {
  state:'loading', player:null, enemies:[], projectiles:[], particles2:[], npcs:[],
  platforms:[], ladders:[], decorations:[],
  cam:{x:0,y:0}, world:{w:4000,h:650}, curMap:'cyber_city',
  keys:{}, lastTime:0, delta:0, gameTime:0, fps:0, fc:0, fpsT:0,
  loop:false, paused:false, stopped:true,
  inventory:[], equipment:{}, skills:{}, missions:[], hackLevel:1,
  stats:{kills:0,bosses:0,deaths:0,credits:0,hacks:0,stealthKills:0},
  achievements:{}, unlockedMaps:['cyber_city'], completedMissions:[],
  obj:null, boss:null, bossFight:false, stealthMode:false,
  selectedSlot:-1, shopTab:'weapons', notifyQueue:[]
};

// ----- ITEMS DATABASE -----
const ITEMS = {
  health_kit:{name:'Health Kit',icon:'❤',desc:'Restore 40 HP',type:'consumable',price:25,effect:p=>{p.hp=Math.min(p.maxHP,p.hp+40);showNotif('❤','+40 HP');updateHUD();sfx('heal')}},
  energy_drink:{name:'Energy Drink',icon:'⚡',desc:'Restore 35 Energy',type:'consumable',price:15,effect:p=>{p.energy=Math.min(p.maxEnergy,p.energy+35);showNotif('⚡','+35 Energy');updateHUD();sfx('heal')}},
  data_chip:{name:'Data Chip',icon:'💾',desc:'Sells for credits',type:'material',price:40},
  circuit_board:{name:'Circuit Board',icon:'🔧',desc:'Used for upgrades',type:'material',price:20},
  pistol:{name:'Pistol',icon:'🔫',desc:'Standard sidearm',type:'weapon',price:60,atk:5,slot:'weapon'},
  smg:{name:'SMG',icon:'🔫',desc:'Rapid fire',type:'weapon',price:150,atk:9,slot:'weapon'},
  shotgun:{name:'Shotgun',icon:'🔫',desc:'Spread damage',type:'weapon',price:280,atk:15,slot:'weapon'},
  sniper:{name:'Sniper',icon:'🎯',desc:'High precision',type:'weapon',price:400,atk:22,slot:'weapon'},
  laser_rifle:{name:'Laser Rifle',icon:'🔫',desc:'Energy weapon',type:'weapon',price:500,atk:28,slot:'weapon'},
  energy_sword:{name:'Energy Sword',icon:'⚔',desc:'Devastating melee',type:'weapon',price:650,atk:35,slot:'weapon'},
  kevlar_vest:{name:'Kevlar Vest',icon:'🛡',desc:'Light protection',type:'armor',price:80,def:4,slot:'armor'},
  combat_armor:{name:'Combat Armor',icon:'🛡',desc:'Military grade',type:'armor',price:200,def:9,slot:'armor'},
  nano_suit:{name:'Nano Suit',icon:'🛡',desc:'Advanced protection',type:'armor',price:450,def:18,slot:'armor'},
  riot_helmet:{name:'Riot Helmet',icon:'⛑',desc:'Head protection',type:'helmet',price:60,def:3,slot:'helmet'},
  tac_helmet:{name:'Tac Helmet',icon:'⛑',desc:'Tactical headgear',type:'helmet',price:140,def:7,slot:'helmet'},
  stealth_helmet:{name:'Stealth Helmet',icon:'⛑',desc:'Night vision + radar',type:'helmet',price:350,def:12,slot:'helmet'},
  emp_grenade:{name:'EMP Grenade',icon:'💣',desc:'Stuns electronics',type:'gadget',price:100,slot:'gadget'},
  drone_controller:{name:'Drone Controller',icon:'🎮',desc:'Hack enemy drones',type:'gadget',price:300,slot:'gadget'},
  smoke_bomb:{name:'Smoke Bomb',icon:'💨',desc:'Escape combat',type:'gadget',price:50,slot:'gadget'},
  hacking_tool:{name:'Hacking Tool',icon:'💻',desc:'+1 Hack Level',type:'gadget',price:200,slot:'gadget'},
};

const SHOP_ITEMS = {
  weapons:['pistol','smg','shotgun','sniper','laser_rifle','energy_sword'],
  armor:['kevlar_vest','combat_armor','nano_suit','riot_helmet','tac_helmet','stealth_helmet'],
  gadgets:['emp_grenade','smoke_bomb','drone_controller','hacking_tool'],
  supplies:['health_kit','energy_drink','circuit_board'],
};

const ACH_LIST = [
  {id:'first_mission',name:'First Heist',icon:'🎯',desc:'Complete first mission'},
  {id:'hacker',name:'Master Hacker',icon:'💻',desc:'Complete 5 hacks'},
  {id:'ghost',name:'Ghost Operative',icon:'👻',desc:'10 stealth kills'},
  {id:'elite',name:'Elite Soldier',icon:'⚔',desc:'Kill 50 enemies'},
  {id:'millionaire',name:'Millionaire',icon:'💰',desc:'Earn 1000 credits'},
  {id:'legend',name:'Cyber Legend',icon:'🏆',desc:'Reach level 10'},
];

const SKILL_DB = {
  stealth_master:{name:'Stealth Master',icon:'👻',desc:'+5% stealth speed',max:5,cost:1,f:l=>1+l*0.05},
  combat_pro:{name:'Combat Pro',icon:'⚔',desc:'+5% attack',max:5,cost:1,f:l=>1+l*0.05},
  hacker_elite:{name:'Hacker Elite',icon:'💻',desc:'+5% hack power',max:5,cost:1,f:l=>1+l*0.05},
  speed_demon:{name:'Speed Demon',icon:'💨',desc:'+3% move speed',max:5,cost:1,f:l=>1+l*0.03},
  vitality:{name:'Vitality',icon:'❤',desc:'+15 max HP',max:5,cost:1,f:l=>l*15},
  energy_core:{name:'Energy Core',icon:'⚡',desc:'+10 max Energy',max:5,cost:1,f:l=>l*10},
  drone_master:{name:'Drone Master',icon:'🎮',desc:'+10% drone control',max:5,cost:2,f:l=>l*0.1},
  weapon_expert:{name:'Weapon Expert',icon:'🎯',desc:'+5% accuracy',max:5,cost:2,f:l=>1+l*0.05},
};

const MISSION_DB = [
  {id:'m1',name:'First Hack',desc:'Infiltrate the data server and steal the encryption key.',obj:'hack',targ:'server',cnt:1,map:'cyber_city',rew:{credits:100,exp:80,item:'pistol'}},
  {id:'m2',name:'Neon Market Intel',desc:'Retrieve classified files from the underground market.',obj:'hack',targ:'terminal',cnt:1,map:'neon_market',rew:{credits:200,exp:150,item:'kevlar_vest'}},
  {id:'m3',name:'Lab Infiltration',desc:'Plant a virus in the research lab mainframe.',obj:'hack',targ:'mainframe',cnt:1,map:'research_lab',rew:{credits:350,exp:250,item:'smg'}},
  {id:'m4',name:'Military Base Breach',desc:'Disable the security grid and steal weapon schematics.',obj:'boss',targ:'base_commander',cnt:1,map:'military_base',rew:{credits:500,exp:400,item:'combat_armor'}},
  {id:'m5',name:'Sky Tower Heist',desc:'Reach the CEO suite and extract evidence.',obj:'hack',targ:'ceo_terminal',cnt:1,map:'sky_tower',rew:{credits:750,exp:600,item:'sniper'}},
  {id:'m6',name:'Bunker Assault',desc:'Destroy the experimental AI core.',obj:'boss',targ:'ai_guardian',cnt:1,map:'secret_bunker',rew:{credits:1000,exp:800,item:'laser_rifle'}},
  {id:'m7',name:'Final Stand',desc:'Confront the AI Overlord in the heart of the network.',obj:'boss',targ:'ai_overlord',cnt:1,map:'final_core',rew:{credits:2000,exp:1500,item:'energy_sword'}},
];

const ENEMY_DB = {
  guard:{name:'Guard',icon:'👮',hp:25,atk:4,def:1,spd:1.8,exp:15,cred:5,c:'#4488aa',s:26},
  drone:{name:'Drone',icon:'🛸',hp:15,atk:6,def:0,spd:3,exp:12,cred:4,c:'#66aacc',s:22,flying:true},
  robo_dog:{name:'Robo Dog',icon:'🐕',hp:30,atk:8,def:3,spd:3.5,exp:18,cred:7,c:'#886644',s:24},
  sniper:{name:'Sniper',icon:'🎯',hp:20,atk:14,def:0,spd:0.8,exp:22,cred:10,c:'#446688',s:26,ranged:true},
  heavy:{name:'Heavy Soldier',icon:'💪',hp:60,atk:12,def:8,spd:1,exp:30,cred:15,c:'#666677',s:32},
  elite:{name:'Elite Hacker',icon:'🧙',hp:40,atk:10,def:4,spd:2,exp:25,cred:12,c:'#8844aa',s:28,ranged:true},
  turret:{name:'Turret',icon:'⚙',hp:50,atk:16,def:6,spd:0,exp:35,cred:20,c:'#555566',s:30,stationary:true},
  flying_bot:{name:'Flying Bot',icon:'🦇',hp:22,atk:7,def:1,spd:3.5,exp:16,cred:6,c:'#664466',s:20,flying:true},
};

const BOSS_DB = {
  base_commander:{name:'Base Commander',icon:'👑',hp:300,atk:18,def:10,exp:300,cred:200,phases:2,drops:['data_chip','circuit_board'],s:44},
  ai_guardian:{name:'AI Guardian',icon:'🤖',hp:500,atk:25,def:14,exp:500,cred:350,phases:3,drops:['circuit_board','hacking_tool'],s:52},
  ai_overlord:{name:'AI Overlord',icon:'👾',hp:800,atk:35,def:18,exp:1000,cred:600,phases:3,drops:['energy_sword','hacking_tool'],s:60},
};

const MAP_DATA = {
  cyber_city:{name:'Cyber City',icon:'🌆',bg:'#0a1220',gnd:'#162035',w:'rain',enemies:['guard','drone','robo_dog'],pos:{x:50,y:70},next:['neon_market','underground_subway']},
  neon_market:{name:'Neon Market',icon:'🏮',bg:'#1a0820',gnd:'#2a1035',w:'clear',enemies:['guard','drone','sniper'],pos:{x:35,y:55},next:['research_lab','military_base']},
  underground_subway:{name:'Subway',icon:'🚇',bg:'#050510',gnd:'#0a0a1a',w:'fog',enemies:['guard','robo_dog','elite'],pos:{x:20,y:70},next:['secret_bunker']},
  research_lab:{name:'Research Lab',icon:'🔬',bg:'#0a0a20',gnd:'#15153a',w:'clear',enemies:['guard','elite','turret'],pos:{x:45,y:40},next:['sky_tower']},
  military_base:{name:'Military Base',icon:'🏰',bg:'#0a1a0a',gnd:'#152a15',w:'fog',enemies:['heavy','turret','elite'],boss:'base_commander',pos:{x:60,y:50},next:['sky_tower','secret_bunker']},
  sky_tower:{name:'Sky Tower',icon:'🏗',bg:'#1a0a1a',gnd:'#2a153a',w:'clear',enemies:['elite','heavy','flying_bot'],pos:{x:70,y:30},next:['secret_bunker']},
  secret_bunker:{name:'Secret Bunker',icon:'🛡',bg:'#050505',gnd:'#0a0a0a',w:'fog',enemies:['heavy','turret','elite'],boss:'ai_guardian',pos:{x:25,y:40},next:['final_core']},
  final_core:{name:'Final Core',icon:'💀',bg:'#0a0015',gnd:'#150020',w:'fog',enemies:['elite','heavy','flying_bot'],boss:'ai_overlord',pos:{x:50,y:20},next:[]},
};

// ----- SAVE SYSTEM -----
function saveGame(){
  if(!GS.player) return;
  const d = {
    p:GS.player, m:GS.curMap, t:GS.gameTime, a:GS.achievements,
    i:GS.inventory, e:GS.equipment, sk:GS.skills, um:GS.unlockedMaps,
    cm:GS.completedMissions, st:GS.stats, h:GS.hackLevel, mn:GS.missions
  };
  localStorage.setItem('zh_save', JSON.stringify(d));
  showNotif('💾','Game Saved!'); sfx('click');
}

function loadSave(){
  try{ const r = localStorage.getItem('zh_save'); return r ? JSON.parse(r) : null } catch(e){return null}
}

function showSaveList(){
  const d = loadSave(); const el = document.getElementById('saveList');
  if(!d||!d.p){ el.innerHTML = '<div style="color:var(--dim);font-size:12px;text-align:center;padding:20px">No save files found.</div>'; return }
  const m = MAP_DATA[d.m];
  el.innerHTML = `<div style="background:rgba(0,229,255,0.06);border:1px solid rgba(0,229,255,0.12);border-radius:5px;padding:14px;text-align:center;cursor:pointer" onclick="loadSaveSlot()"><div style="font-size:14px;color:var(--gold);font-weight:700">⚔ Level ${d.p.lvl} Agent</div><div style="font-size:10px;color:#b8a0d0;margin:4px 0">${m?m.icon+' '+m.name:'Unknown'} · 💰 ${d.st?.credits||d.p.credits||0} cr</div><div style="font-size:8px;color:var(--dim)">Kills: ${d.st?.kills||0} · Missions: ${d.cm?.length||0}</div><button class="menu-btn menu-btn-sm" style="margin-top:6px">📂 Load</button></div>`;
}

function loadSaveSlot(){
  const d = loadSave(); if(!d){ showNotif('⚠','No save'); return }
  GS.player = d.p; GS.curMap = d.m||'cyber_city'; GS.gameTime = d.t||0;
  GS.achievements = d.a||{}; GS.inventory = d.i||[]; GS.equipment = d.e||{};
  GS.skills = d.sk||{}; GS.unlockedMaps = d.um||['cyber_city'];
  GS.completedMissions = d.cm||[]; GS.stats = d.st||{kills:0,bosses:0,deaths:0,credits:0,hacks:0,stealthKills:0};
  GS.hackLevel = d.h||1; GS.missions = d.mn||JSON.parse(JSON.stringify(MISSION_DB));
  GS.missions.forEach(m => { const done = GS.completedMissions.includes(m.id); if(done) m.done = true });
  startGameplay();
}

// ----- LOADING SEQUENCE -----
function startLoading(){
  GS.state = 'loading';
  let p = 0;
  const bar = document.getElementById('loadBar');
  const txt = document.getElementById('loadText');
  const steps = ['INITIALIZING SYSTEMS...','CONNECTING TO NEON NETWORK...','LOADING CYBERPUNK ENGINE...','CALIBRATING WEAPONS...','ESTABLISHING SECURE LINK...','READY.'];
  let si = 0;
  const iv = setInterval(() => {
    p += 2 + Math.random()*5;
    if(p >= 100) p = 100;
    bar.style.width = p + '%';
    if(p > si*17) { txt.textContent = steps[Math.min(si,steps.length-1)]; si++ }
    if(p >= 100){ clearInterval(iv); setTimeout(()=>{ document.getElementById('loadingScreen').classList.remove('active'); showScreen('menuScreen'); startBG() }, 400) }
  }, 80);
}

// ----- BG Particle Loop -----
function startBG(){
  function bgLoop(){
    updateBP(); drawBP();
    requestAnimationFrame(bgLoop);
  }
  bgLoop();
}

// ----- SCREEN MGMT -----
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  if(id === 'achieveScreen') renderAch();
  if(id === 'loadScreen') showSaveList();
  if(id === 'missionsScreen') renderMissions();
  if(id === 'menuScreen'){ const d=loadSave(); const cb=document.getElementById('contBtn'); if(cb) cb.style.display=d?'block':'none' }
}

// ----- NOTIFICATION -----
let nTimer = null;
function showNotif(icon, title, desc=''){
  document.getElementById('nIcon').textContent = icon;
  document.getElementById('nTitle').textContent = title;
  document.getElementById('nDesc').textContent = desc;
  document.getElementById('notif').classList.add('active');
  clearTimeout(nTimer);
  nTimer = setTimeout(() => document.getElementById('notif').classList.remove('active'), 2000);
}

// ----- INTRO -----
function startIntro(){
  GS.state = 'intro';
  document.getElementById('introOverlay').classList.add('active');
  document.querySelectorAll('.intro-txt').forEach(t => t.classList.remove('visible'));
  introIdx = 0; showIntroN();
}
let introIdx = 0, introTimer = null;
function showIntroN(){
  if(introIdx >= 9){ doneIntro(); return }
  document.querySelectorAll('.intro-txt').forEach(t => t.classList.remove('visible'));
  const el = document.getElementById('it'+introIdx);
  if(el){ el.classList.add('visible'); introIdx++; introTimer = setTimeout(showIntroN, 2000) }
  else doneIntro();
}
function skipIntro(){ clearTimeout(introTimer); doneIntro() }
function doneIntro(){ document.getElementById('introOverlay').classList.remove('active'); startGameplay() }

// ----- GAME START -----
function startNewGame(){
  initA();
  GS.player = createPlayer();
  GS.inventory = [{id:'health_kit',count:2},{id:'energy_drink',count:1}];
  GS.equipment = {}; GS.skills = {}; GS.unlockedMaps = ['cyber_city']; GS.curMap = 'cyber_city';
  GS.missions = JSON.parse(JSON.stringify(MISSION_DB));
  GS.achievements = {}; GS.stats = {kills:0,bosses:0,deaths:0,credits:0,hacks:0,stealthKills:0};
  GS.completedMissions = []; GS.hackLevel = 1; GS.gameTime = 0;
  GS.obj = 'OBJECTIVE: Hack the data server in Cyber City';
  startIntro();
}

function continueGame(){
  const d = loadSave(); if(!d){ showNotif('⚠','No save'); return }
  loadSaveSlot();
}

function stopGame(){
  GS.loop = false; GS.state = 'menu'; GS.paused = false; GS.stopped = true;
  showScreen('menuScreen');
}

// ----- PLAYER -----
function createPlayer(){
  return {
    x:100, y:250, w:24, h:34, vx:0, vy:0,
    speed:3.5, runSpeed:6.5, jumpPow:-10,
    maxHP:100, hp:100, maxArmor:0, armor:0,
    maxEnergy:100, energy:100, engRegen:0.25,
    lvl:1, exp:0, expNext:100, credits:0,
    baseAtk:5, baseDef:2, baseMag:2,
    str:5, def:2, mag:2, spd:3, luck:1,
    critChance:0.05, critDmg:1.5,
    onGround:false, jumping:false, canDJ:false,
    dashing:false, dashT:0, dashCD:0,
    attacking:false, atkT:0, atkCombo:0,
    blocking:false, stealthMode:false,
    invincible:0, facing:1,
    animF:0, animT:0, animS:'idle',
    statPts:0, skillPts:0, stealthKills:0,
    weapon:null, ammo:30, maxAmmo:30
  };
}

// ----- MAP LOADING -----
function loadMap(id){
  const m = MAP_DATA[id]; if(!m) return;
  GS.curMap = id; GS.bossFight = false; GS.boss = null;
  GS.enemies = []; GS.projectiles = []; GS.particles2 = [];
  GS.platforms = []; GS.ladders = []; GS.decorations = [];
  document.getElementById('bossBar').style.display = 'none';
  document.getElementById('objDisplay').style.display = GS.obj ? 'block' : 'none';
  if(GS.obj) document.getElementById('objText').textContent = GS.obj;
  
  const W = 4000, H = 650;
  GS.world = {w:W, h:H}; GS.cam = {x:0, y:0};
  
  // Ground
  for(let x=0; x<W; x+=100) GS.platforms.push({x, y:H-35, w:100, h:35});
  // Platforms
  for(let i=0; i<10+Math.random()*8; i++){
    const px = 150+Math.random()*(W-300), py = 100+Math.random()*(H-180);
    GS.platforms.push({x:px, y:py, w:50+Math.random()*90, h:10});
  }
  // Ladders
  for(let i=0; i<3+Math.floor(Math.random()*3); i++){
    const lx = 200+Math.random()*(W-400);
    GS.ladders.push({x:lx, y:50, w:14, h:H-90});
  }
  
  // Enemies
  if(m.enemies && m.enemies.length>0){
    for(let i=0; i<5+Math.floor(Math.random()*4); i++){
      const t = m.enemies[Math.floor(Math.random()*m.enemies.length)];
      spawnEnemy(t, 180+Math.random()*(W-360));
    }
  }
  // Boss
  if(m.boss && !GS.completedMissions.includes('m'+(['base_commander','ai_guardian','ai_overlord'].indexOf(m.boss)+4)))
    spawnBoss(m.boss);
  
  // Decorations
  for(let i=0; i<15; i++) GS.decorations.push({x:Math.random()*W, y:Math.random()*(H-60), s:8+Math.random()*20, c:['#0a2a4a','#1a0a2a','#2a1a0a'][Math.floor(Math.random()*3)]});
  
  const P = GS.player;
  if(P){ P.x = 120; P.y = H-80; P.vx = 0; P.vy = 0; P.invincible = 0 }
}

function spawnEnemy(type, x){
  const d = ENEMY_DB[type]; if(!d) return;
  GS.enemies.push({
    ...d, type, x, y:0, w:d.s||24, h:d.s||24,
    maxHp:d.hp, hp:d.hp, speed:(d.spd||1.5)*(0.85+Math.random()*0.3),
    dir:Math.random()>0.5?1:-1, vx:0, vy:0,
    aggro:150+Math.random()*50, atkCD:0,
    state:'idle', patrolX:x, patrolR:50+Math.random()*60,
    alive:true, hitF:0, animF:0, animT:0
  });
  const e = GS.enemies[GS.enemies.length-1];
  e.y = GS.world.h-40-e.h;
  if(e.flying) e.y = 100+Math.random()*200;
}

function spawnBoss(id){
  const d = BOSS_DB[id]; if(!d) return;
  GS.boss = {...d, bossId:id, x:GS.world.w-280, y:0, w:d.s||46, h:(d.s||46)+8,
    hp:d.hp, maxHp:d.hp, phase:1, maxPhases:d.phases||2, speed:1.5,
    dir:-1, atkCD:0, state:'idle', alive:true, hitF:0, enraged:false};
  GS.boss.y = GS.world.h-85-GS.boss.h;
  GS.bossFight = true;
  document.getElementById('bossBar').style.display = 'block';
  document.getElementById('bossName').textContent = '👑 '+d.name;
  document.getElementById('bossFill').style.width = '100%';
}

// ----- CANVAS SETUP -----
const CV = document.getElementById('gameCanvas'), CX = CV.getContext('2d');
function resCV(){ CV.width = window.innerWidth; CV.height = window.innerHeight }
window.addEventListener('resize', resCV); resCV();

// ----- INPUT -----
document.addEventListener('keydown', e => {
  GS.keys[e.key.toLowerCase()] = true; GS.keys[e.key] = true;
  if(e.key===' '||e.key==='ArrowUp'||e.key==='w') e.preventDefault();
  if(GS.state==='playing' && !GS.paused){
    if(e.key==='i'||e.key==='I') openInv();
    if(e.key==='p'||e.key==='P') togglePause();
    if(e.key==='e'||e.key==='E') interact();
    if(e.key==='1') useItemType('health_kit');
    if(e.key==='2') useItemType('energy_drink');
    if(e.key==='h'||e.key==='H') enterHackMode();
    if(e.key==='c'||e.key==='C') toggleStealth();
  }
  if(e.key==='Escape'){
    ['pauseModal','invModal','shopModal','skillModal','hackModal'].forEach(id => {
      const el = document.getElementById(id);
      if(el && el.classList.contains('active')) el.classList.remove('active');
    });
    if(GS.state==='playing') GS.paused = false;
  }
});
document.addEventListener('keyup', e => { GS.keys[e.key.toLowerCase()] = false; GS.keys[e.key] = false });

// ----- STEALTH TOGGLE -----
function toggleStealth(){
  GS.stealthMode = !GS.stealthMode;
  if(GS.player) GS.player.stealthMode = GS.stealthMode;
  showNotif(GS.stealthMode?'👻':'👤', GS.stealthMode?'Stealth Mode Active':'Combat Mode');
  sfx('click');
}

// ----- HUD UPDATE -----
function updateHUD(){
  const P = GS.player; if(!P) return;
  document.getElementById('hpBar').style.width = (P.hp/P.maxHP*100)+'%';
  document.getElementById('hpTxt').textContent = Math.ceil(P.hp)+'/'+P.maxHP;
  const armPct = P.maxArmor ? (P.armor/P.maxArmor*100) : 0;
  document.getElementById('armBar').style.width = armPct+'%';
  document.getElementById('armTxt').textContent = P.maxArmor ? Math.ceil(P.armor)+'/'+P.maxArmor : '0';
  document.getElementById('enerBar').style.width = (P.energy/P.maxEnergy*100)+'%';
  document.getElementById('enerTxt').textContent = Math.ceil(P.energy)+'/'+P.maxEnergy;
  document.getElementById('expBar').style.width = (P.exp/P.expNext*100)+'%';
  document.getElementById('expTxt').textContent = Math.floor(P.exp)+'/'+P.expNext;
  document.getElementById('hudStats').textContent = 'Lv.'+P.lvl+' · 💰'+(P.credits||0)+(GS.stealthMode?' · 👻 STEALTH':'');
}

// ----- COMBAT TEXT -----
function ct(x,y,text,type='dmg'){
  const c = document.getElementById('ctContainer');
  const el = document.createElement('div');
  el.className = 'combat-text '+type;
  el.textContent = text;
  el.style.left = (x-GS.cam.x)+'px';
  el.style.top = (y-GS.cam.y)+'px';
  c.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// ----- SHAKE -----
let sI=0, sT=0;
function shake(i,t){ sI=i; sT=t }

// ----- PLAYER UPDATE -----
function updatePlayer(dt){
  const P = GS.player; if(!P) return;
  
  let mpM = 1; if(GS.skills.energy_core) mpM += GS.skills.energy_core*0.1;
  P.energy = Math.min(P.maxEnergy, P.energy + P.engRegen*dt*10*mpM);
  if(P.invincible > 0) P.invincible -= dt;
  if(P.dashT > 0) P.dashT -= dt; else P.dashing = false;
  if(P.dashCD > 0) P.dashCD -= dt;
  if(P.atkT > 0) P.atkT -= dt; else { P.attacking = false; P.atkCombo = 0 }
  
  const L=GS.keys['arrowleft']||GS.keys['a'], R=GS.keys['arrowright']||GS.keys['d'],
        U=GS.keys['arrowup']||GS.keys['w'], D=GS.keys['arrowdown']||GS.keys['s'],
        J=GS.keys[' ']||GS.keys['ArrowUp']||GS.keys['w'];
  
  let spd = P.speed;
  if(GS.stealthMode) spd *= 0.7;
  if(GS.skills.speed_demon) spd *= 1+GS.skills.speed_demon*0.03;
  if(GS.skills.stealth_master && GS.stealthMode) spd *= 1+GS.skills.stealth_master*0.05;
  if(GS.keys['shift']) spd = P.runSpeed;
  
  // Ladder
  let onL = false; GS.ladders.forEach(l => { if(rectInt(P.x,P.y,P.w,P.h,l.x,l.y,l.w,l.h)) onL=true });
  if(onL && (U||D)){ P.climbing = true; P.vy = U?-3.5:3.5; P.vx *= 0.8 }
  else {
    P.climbing = false;
    if(!P.attacking && !P.dashing){
      if(L){ P.vx = -spd; P.facing = -1 } else if(R){ P.vx = spd; P.facing = 1 } else P.vx *= 0.75
    }
    if(J && P.onGround && !P._jHeld){ P.vy = P.jumpPow; P._jHeld = true; P.canDJ = true; sfx('dash') }
    else if(J && P.canDJ && !P.onGround && P._jHeld){ P.vy = P.jumpPow*0.85; P.canDJ = false; sfx('dash') }
    if(!J) P._jHeld = false;
    P.vy += 24*dt;
  }
  
  // Dash
  if(GS.keys['v'] && P.dashCD<=0 && !P.dashing && P.energy>=8){
    P.dashing = true; P.dashT = 0.22; P.dashCD = 0.6; P.energy -= 8; P.invincible = 0.25; sfx('dash');
  }
  if(P.dashing){ P.dashT = 0.22; P.vx = P.facing*14; P.invincible = 0.25 }
  GS.keys['v'] = false;
  
  P.blocking = GS.keys['b'] && !P.attacking;
  
  // Attack
  if(GS.keys['z'] && !P.attacking && !P.blocking){
    P.attacking = true; P.atkT = 0.3; P.atkCombo = (P.atkCombo||0)%3+1;
    sfx('slash');
    let dmg = P.baseAtk;
    if(GS.equipment.weapon){ const wi = ITEMS[GS.equipment.weapon]; if(wi && wi.atk) dmg += wi.atk }
    if(GS.skills.combat_pro) dmg *= 1+GS.skills.combat_pro*0.05;
    dmg = Math.floor(dmg);
    
    const bx = {x:P.x+(P.facing>0?P.w:-14), y:P.y+2, w:22, h:P.h-4};
    // Stealth kill if sneaking behind
    GS.enemies.forEach(e => {
      if(!e.alive || e.hitF>0) return;
      if(rectInt(bx.x,bx.y,bx.w,bx.h, e.x,e.y,e.w,e.h)){
        let crit = GS.stealthMode || Math.random() < (P.critChance + (GS.skills.weapon_expert?GS.skills.weapon_expert*0.05:0));
        let d = dmg; if(crit) d = Math.floor(d*P.critDmg);
        if(GS.stealthMode){ d *= 2.5; P.stealthKills++; GS.stats.stealthKills = (GS.stats.stealthKills||0)+1 }
        dmgEnemy(e, d, crit);
      }
    });
    if(GS.boss && GS.boss.alive && rectInt(bx.x,bx.y,bx.w,bx.h, GS.boss.x,GS.boss.y,GS.boss.w,GS.boss.h)){
      const crit = Math.random()<(P.critChance+0.05); let d = dmg; if(crit) d = Math.floor(d*P.critDmg);
      dmgBoss(d, crit);
    }
  }
  GS.keys['z'] = false;
  
  // Physics
  P.x += P.vx; P.y += P.vy; P.onGround = false;
  GS.platforms.forEach(pl => {
    if(!rectInt(P.x,P.y,P.w,P.h, pl.x,pl.y,pl.w,pl.h)) return;
    if(P.vy>0 && P.y+P.h-P.vy <= pl.y+6){ P.y=pl.y-P.h; P.vy=0; P.onGround=true }
    else if(P.vy<0 && P.y-P.vy >= pl.y+pl.h-5){ P.y=pl.y+pl.h; P.vy=0 }
    else if(P.vx>0 && P.x+P.w-P.vx <= pl.x+4) P.x = pl.x-P.w;
    else if(P.vx<0 && P.x-P.vx >= pl.x+pl.w-4) P.x = pl.x+pl.w;
  });
  if(P.x < 0) P.x = 0; if(P.x > GS.world.w-P.w) P.x = GS.world.w-P.w;
  if(P.y > GS.world.h-P.h){ P.y = GS.world.h-P.h; P.vy = 0; P.onGround = true }
  
  // Enemy collision
  if(P.invincible <= 0){
    GS.enemies.forEach(e => {
      if(!e.alive) return;
      if(rectInt(P.x,P.y,P.w,P.h, e.x,e.y,e.w,e.h)){
        if(P.blocking){ sfx('block'); P.energy = Math.min(P.maxEnergy, P.energy+4) }
        else { const dm = Math.max(1, e.atk - Math.floor((P.baseDef+(GS.equipment.armor?ITEMS[GS.equipment.armor]?.def||0:0))/2)); takeDamage(dm) }
        P.invincible = 0.5;
      }
    });
    if(GS.boss && GS.boss.alive && rectInt(P.x,P.y,P.w,P.h, GS.boss.x,GS.boss.y,GS.boss.w,GS.boss.h)){
      if(P.blocking){ sfx('block'); P.energy = Math.min(P.maxEnergy, P.energy+4) }
      else { const dm = Math.max(1, GS.boss.atk - Math.floor(P.baseDef/2)); takeDamage(dm) }
      P.invincible = 0.5;
    }
  }
  
  // Death
  if(P.hp <= 0){
    P.hp = P.maxHP; P.energy = P.maxEnergy; P.x = 120; P.y = GS.world.h-80; P.vx = 0; P.vy = 0;
    GS.stats.deaths = (GS.stats.deaths||0)+1;
    showNotif('💀','System Overloaded...','Rebooting...'); sfx('death'); updateHUD();
  }
  
  P.animS = P.attacking?'attack':P.dashing?'dash':Math.abs(P.vx)>1.5?'run':!P.onGround?'jump':'idle';
  P.animT += dt;
  if(P.animT > 0.08){ P.animT = 0; P.animF = (P.animF+1)%4 }
}

function takeDamage(dmg){
  const P = GS.player; if(!P || P.invincible > 0) return;
  P.hp -= dmg; P.invincible = 0.4;
  ct(P.x+P.w/2, P.y-10, '-'+dmg, 'dmg');
  sfx('hit'); updateHUD();
  if(SET.shake) shake(4, 0.15);
}

function dmgEnemy(e, dmg, crit){
  e.hp -= dmg; e.hitF = 0.12;
  ct(e.x+e.w/2, e.y-10, (crit?'⚡':'')+'-'+dmg, crit?'crit':'dmg');
  sfx('hit');
  if(e.hp <= 0){
    e.alive = false;
    const P = GS.player;
    P.exp += e.exp; P.credits = (P.credits||0) + (e.cred||0);
    GS.stats.kills = (GS.stats.kills||0)+1;
    GS.stats.credits = (GS.stats.credits||0)+(e.cred||0);
    if(Math.random()<0.12){ const dr = ['health_kit','energy_drink','circuit_board','data_chip']; addItem(dr[Math.floor(Math.random()*dr.length)]) }
    checkLevelUp(); updateHUD(); sfx('coin');
    checkAch();
  }
}

function dmgBoss(dmg, crit){
  const b = GS.boss; if(!b||!b.alive) return;
  b.hp -= dmg; b.hitF = 0.12;
  ct(b.x+b.w/2, b.y-16, (crit?'⚡':'')+'-'+dmg, crit?'crit':'dmg');
  sfx('hit');
  const pct = b.hp/b.maxHp; const prevP = b.phase;
  b.phase = b.maxPhases - Math.floor(pct*b.maxPhases);
  if(b.phase < 1) b.phase = 1;
  if(b.phase !== prevP && b.phase >= 2){
    showNotif('⚠', b.name+' enrages!','Phase '+b.phase); b.speed*=1.15; b.atk*=1.2;
    if(SET.shake) shake(8,0.3);
  }
  document.getElementById('bossFill').style.width = Math.max(0,(b.hp/b.maxHp)*100)+'%';
  if(b.hp <= 0){
    b.alive = false;
    const P = GS.player;
    P.exp += b.exp; P.credits = (P.credits||0) + (b.cred||0);
    GS.stats.bosses = (GS.stats.bosses||0)+1; GS.stats.credits = (GS.stats.credits||0)+(b.cred||0);
    GS.stats.kills = (GS.stats.kills||0)+1;
    if(b.drops) b.drops.forEach(item => addItem(item));
    // Mark mission complete
    const bossMissionMap = { base_commander:'m4', ai_guardian:'m6', ai_overlord:'m7' };
    const mId = bossMissionMap[b.bossId];
    if(mId){ const q = GS.missions.find(m => m.id===mId); if(q){ q.done=true; if(!GS.completedMissions.includes(mId)) GS.completedMissions.push(mId); claimMission(q) } }
    const m = MAP_DATA[GS.curMap];
    if(m && m.next) m.next.forEach(mid => { if(!GS.unlockedMaps.includes(mid)) GS.unlockedMaps.push(mid) });
    checkLevelUp(); updateHUD();
    document.getElementById('bossBar').style.display = 'none'; GS.bossFight = false;
    showNotif('👑','Victory!',b.name+' eliminated!');
    sfx('levelup'); if(SET.shake) shake(12,0.4);
    checkAch();
  }
}

function checkLevelUp(){
  const P = GS.player;
  while(P.exp >= P.expNext){
    P.exp -= P.expNext; P.lvl++; P.expNext = Math.floor(100*Math.pow(1.14,P.lvl));
    P.maxHP += 12; P.hp = P.maxHP; P.maxEnergy += 8; P.energy = Math.min(P.maxEnergy, P.energy+8);
    P.baseAtk += 1; P.baseDef += 1; P.baseMag += 1;
    P.statPts = (P.statPts||0)+3; P.skillPts = (P.skillPts||0)+1;
    showNotif('⭐','LEVEL UP!','Level '+P.lvl+'!'); sfx('levelup'); updateHUD(); checkAch();
  }
}

// ----- ENEMY AI -----
function updateEnemies(dt){
  const P = GS.player; if(!P) return;
  GS.enemies.forEach(e => {
    if(!e.alive) return;
    if(e.hitF>0) e.hitF -= dt;
    if(e.stationary) return;
    const dx = P.x-e.x, dy = P.y-e.y, dist = Math.sqrt(dx*dx+dy*dy);
    if(!GS.stealthMode && dist < e.aggro && dist > 12){
      e.state = 'chase'; e.dir = dx>0?1:-1; e.vx = e.dir*e.speed;
      if(!e.flying && e.y < GS.world.h-130 && Math.random()<0.012) e.vy = -7;
    } else {
      e.state = 'patrol'; const pd = e.x-e.patrolX;
      if(Math.abs(pd) > e.patrolR) e.dir *= -1; e.vx = e.dir*e.speed*0.25;
    }
    e.atkCD -= dt;
    if(dist < 35 && e.atkCD <= 0){ e.atkCD = 1.2; if(P.invincible<=0){ const dm=Math.max(1,e.atk-Math.floor(P.baseDef/2)); takeDamage(dm) } }
    if(e.ranged && dist<260 && dist>60 && e.atkCD<=0){
      e.atkCD = 2.5;
      GS.projectiles.push({x:e.x+e.dir*14, y:e.y+5, vx:e.dir*4.5, vy:0, w:5, h:5, dmg:e.atk, type:'e_bullet', c:'#ff4400', life:2.5, fromP:false});
    }
    e.vy += 20*dt; e.x += e.vx*dt*60; e.y += e.vy*dt*60;
    if(e.y > GS.world.h-40-e.h){ e.y = GS.world.h-40-e.h; e.vy = 0 }
    GS.platforms.forEach(pl => { if(rectInt(e.x,e.y,e.w,e.h,pl.x,pl.y,pl.w,pl.h)){ if(e.vy>0&&e.y+e.h-e.vy<=pl.y+4){ e.y=pl.y-e.h; e.vy=0 }}});
    if(e.x<0) e.x=0; if(e.x>GS.world.w-e.w) e.x=GS.world.w-e.w;
    if(e.flying) e.vy = Math.sin(GS.gameTime*2+e.x)*1.2;
    if(e.animT>0.15){ e.animT=0; e.animF=(e.animF||0)%4+1 }
    e.animT += dt;
  });
  GS.enemies = GS.enemies.filter(e => e.alive||e.hitF>0);
}

// ----- BOSS AI -----
function updateBoss(dt){
  const b = GS.boss; if(!b||!b.alive) return;
  const P = GS.player; if(!P) return;
  if(b.hitF>0) b.hitF -= dt;
  const dx = P.x-b.x, dist = Math.sqrt(dx*dx+Math.pow(P.y-b.y,2));
  b.dir = dx>0?1:-1; b.atkCD -= dt;
  if(b.phase >= 2 && dist > 90) b.vx = b.dir*b.speed*1.15; else if(dist > 130) b.vx = b.dir*b.speed; else b.vx *= 0.85;
  if(b.atkCD <= 0){
    if(b.phase >= 3 && Math.random()<0.18){
      b.atkCD = 3; if(SET.shake) shake(10,0.3);
      for(let i=0;i<6;i++){ const a=6.28/6*i; GS.projectiles.push({x:b.x+b.w/2,y:b.y+b.h/2,vx:Math.cos(a)*5,vy:Math.sin(a)*5,w:7,h:7,dmg:Math.floor(b.atk*1.3),type:'b_blast',c:'#ff4400',life:2.5,fromP:false}) }
      showNotif('⚠',b.name+' unleashes fury!');
    } else if(b.phase >= 2 && Math.random()<0.3){ b.atkCD = 2; b.vx = b.dir*10 }
    else if(dist < 70 && P.invincible<=0){ b.atkCD=1.5; const dm=Math.max(1,b.atk-Math.floor(P.baseDef/2)); takeDamage(dm) }
    else b.atkCD = 1;
  }
  b.vy += 20*dt; b.x += b.vx*dt*60; b.y += b.vy*dt*60;
  if(b.y > GS.world.h-85-b.h){ b.y = GS.world.h-85-b.h; b.vy = 0 }
  if(b.x<50) b.x=50; if(b.x>GS.world.w-50-b.w) b.x=GS.world.w-50-b.w;
}

// ----- PROJECTILES -----
function updateProjectiles(dt){
  GS.projectiles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.life -= dt;
    if(!p.fromP){
      const PP = GS.player;
      if(PP && PP.invincible<=0 && rectInt(p.x,p.y,p.w,p.h, PP.x,PP.y,PP.w,PP.h)){
        takeDamage(Math.max(1,(p.dmg||5)-Math.floor(PP.baseDef/3))); p.life = -1;
      }
    }
    if(p.fromP){
      GS.enemies.forEach(e => { if(e.alive && rectInt(p.x,p.y,p.w,p.h,e.x,e.y,e.w,e.h)){ dmgEnemy(e,Math.floor(p.dmg),false); p.life=-1 }});
      if(GS.boss && GS.boss.alive && rectInt(p.x,p.y,p.w,p.h,GS.boss.x,GS.boss.y,GS.boss.w,GS.boss.h)){ dmgBoss(Math.floor(p.dmg),false); p.life=-1 }
    }
    if(p.x<-20||p.x>GS.world.w+20||p.y<-20||p.y>GS.world.h+20) p.life = -1;
  });
  GS.projectiles = GS.projectiles.filter(p => p.life > 0);
}

// ----- CAMERA -----
function updateCamera(){
  const P = GS.player; if(!P) return;
  const tx = P.x - CV.width*0.35, ty = P.y - CV.height*0.45;
  GS.cam.x += (tx-GS.cam.x)*0.08; GS.cam.y += (ty-GS.cam.y)*0.08;
  GS.cam.x = Math.max(0, Math.min(GS.cam.x, GS.world.w-CV.width));
  GS.cam.y = Math.max(0, Math.min(GS.cam.y, GS.world.h-CV.height));
}

// ----- RENDER -----
function drawGame(){
  const P = GS.player; if(!P) return;
  if(sT>0){ sT -= GS.delta; if(SET.shake){ const i=sI; CX.translate((Math.random()-0.5)*i, (Math.random()-0.5)*i) } sI *= 0.9 }
  
  CX.clearRect(0,0,CV.width,CV.height);
  CX.save(); CX.translate(-GS.cam.x, -GS.cam.y);
  
  const m = MAP_DATA[GS.curMap];
  CX.fillStyle = m?m.bg:'#0a0015'; CX.fillRect(GS.cam.x-100,0,CV.width+200,GS.world.h);
  const gr = CX.createLinearGradient(0,0,0,GS.world.h);
  gr.addColorStop(0,'rgba(0,0,0,0.4)'); gr.addColorStop(0.5,'rgba(0,20,40,0.15)'); gr.addColorStop(1,'rgba(0,0,0,0.3)');
  CX.fillStyle = gr; CX.fillRect(GS.cam.x-100,0,CV.width+200,GS.world.h);
  
  // Grid lines (cyber feel)
  CX.strokeStyle = 'rgba(0,229,255,0.03)'; CX.lineWidth = 0.5;
  for(let x=0; x<GS.world.w; x+=60){ CX.beginPath(); CX.moveTo(x,0); CX.lineTo(x,GS.world.h); CX.stroke() }
  for(let y=0; y<GS.world.h; y+=60){ CX.beginPath(); CX.moveTo(0,y); CX.lineTo(GS.world.w,y); CX.stroke() }
  
  // Decorations (neon signs, holograms)
  GS.decorations.forEach(d => {
    if(d.x<GS.cam.x-120||d.x>GS.cam.x+CV.width+120) return;
    const pulse = 0.2 + 0.15*Math.sin(GS.gameTime*2+d.x);
    CX.shadowColor = `rgba(0,229,255,${pulse*0.5})`; CX.shadowBlur = 10;
    CX.fillStyle = d.c||'#0a2a4a'; CX.fillRect(d.x,d.y-d.s,4,d.s);
    CX.fillRect(d.x-10,d.y-d.s,24,2); CX.shadowBlur = 0;
  });
  
  // Platforms
  const neonGrad = CX.createLinearGradient(0,0,0,GS.world.h);
  neonGrad.addColorStop(0,'#1a2040'); neonGrad.addColorStop(1,'#0a1020');
  GS.platforms.forEach(p => {
    CX.fillStyle = neonGrad; CX.fillRect(p.x,p.y,p.w,p.h);
    CX.fillStyle = 'rgba(0,229,255,0.08)'; CX.fillRect(p.x,p.y,p.w,1.5);
    // Neon edge
    CX.shadowColor = 'rgba(0,229,255,0.05)'; CX.shadowBlur = 4;
    CX.fillStyle = 'rgba(0,229,255,0.06)'; CX.fillRect(p.x,p.y-1,p.w,1); CX.shadowBlur = 0;
  });
  
  // Ladders
  GS.ladders.forEach(l => {
    CX.fillStyle = 'rgba(0,229,255,0.05)'; CX.fillRect(l.x,l.y,l.w,l.h);
    for(let y=l.y; y<l.y+l.h; y+=14){ CX.fillStyle='rgba(0,229,255,0.06)'; CX.fillRect(l.x,y,l.w,1) }
  });
  
  // Enemies
  GS.enemies.forEach(e => {
    if(!e.alive) return;
    CX.shadowColor = 'rgba(255,0,0,0.08)'; CX.shadowBlur = 4;
    CX.fillStyle = e.hitF>0?'#fff':(e.c||'#4488aa');
    CX.fillRect(e.x,e.y,e.w,e.h);
    CX.shadowBlur = 0;
    if(e.hp < e.maxHp){
      CX.fillStyle='rgba(0,0,0,0.4)'; CX.fillRect(e.x,e.y-5,e.w,2.5);
      CX.fillStyle=e.hp/e.maxHp>0.5?'#44aa44':'#aaaa44'; CX.fillRect(e.x,e.y-5,e.w*(e.hp/e.maxHp),2.5)
    }
    CX.font='10px sans-serif'; CX.textAlign='center';
    CX.fillText(e.icon||'?', e.x+e.w/2, e.y+e.h/2+3);
  });
  
  // Boss
  if(GS.boss && GS.boss.alive){
    const b = GS.boss;
    CX.shadowColor = 'rgba(255,0,0,0.15)'; CX.shadowBlur = 15;
    CX.fillStyle = b.hitF>0?'#fff':'#3a0a1a';
    CX.fillRect(b.x,b.y,b.w,b.h); CX.shadowBlur = 0;
    CX.fillStyle = '#ff4400'; CX.shadowColor='rgba(255,68,0,0.3)'; CX.shadowBlur=6;
    CX.fillRect(b.x+b.w*0.15,b.y+b.h*0.12,5,5); CX.fillRect(b.x+b.w*0.65,b.y+b.h*0.12,5,5); CX.shadowBlur=0;
    CX.font='14px sans-serif'; CX.textAlign='center';
    CX.fillText(b.icon||'👑', b.x+b.w/2, b.y+b.h/2+4);
  }
  
  // Player
  if(P){
    // Shadow
    CX.fillStyle = 'rgba(0,0,0,0.2)';
    CX.beginPath(); CX.ellipse(P.x+P.w/2, P.y+P.h+3, P.w/2, 3, 0, 0, 6.28); CX.fill();
    
    // Stealth glow
    if(GS.stealthMode){
      CX.shadowColor = 'rgba(0,229,255,0.15)'; CX.shadowBlur = 8;
    }
    const fl = P.invincible>0 && Math.floor(P.invincible*10)%2===0;
    CX.fillStyle = fl?'#fff':(GS.stealthMode?'#004466':'#1a2b5a');
    CX.fillRect(P.x,P.y,P.w,P.h);
    CX.shadowBlur = 0;
    if(GS.equipment.weapon){ CX.fillStyle='#00e5ff'; CX.fillRect(P.x+P.facing*4,P.y+2,2,14) }
    // Eyes (neon)
    CX.fillStyle = GS.stealthMode?'#00e5ff':'#c9a84c';
    if(P.facing>0){ CX.fillRect(P.x+P.w*0.58,P.y+P.h*0.2,2,2); CX.fillRect(P.x+P.w*0.32,P.y+P.h*0.2,2,2) }
    else{ CX.fillRect(P.x+P.w*0.45,P.y+P.h*0.2,2,2); CX.fillRect(P.x+P.w*0.12,P.y+P.h*0.2,2,2) }
    if(P.attacking){
      CX.fillStyle='rgba(0,229,255,0.15)'; const aw=12+((P.atkCombo||1)*4);
      CX.shadowColor='rgba(0,229,255,0.2)'; CX.shadowBlur=6;
      CX.fillRect(P.x+P.facing*P.w,P.y+3,P.facing*aw,8); CX.shadowBlur=0;
    }
  }
  
  // Projectiles
  GS.projectiles.forEach(p => {
    CX.shadowColor = p.c==='#ff4400'?'rgba(255,68,0,0.4)':'rgba(0,229,255,0.4)';
    CX.shadowBlur = 8;
    CX.fillStyle = p.c||'#fff'; CX.fillRect(p.x,p.y,p.w,p.h);
    CX.shadowBlur = 0;
  });
  
  CX.restore();
  
  // HUD overlay
  CX.fillStyle = 'rgba(0,229,255,0.06)';
  CX.font = '7px monospace'; CX.textAlign = 'left';
  CX.fillText('FPS:'+GS.fps+' '+(MAP_DATA[GS.curMap]?.name||''), 5, 10);
}

// ----- MINI MAP -----
const MM = document.getElementById('miniMap'), MX = MM.getContext('2d');
setInterval(() => {
  if(!MM || !GS.player || GS.state!=='playing') return;
  const W=MM.width, H=MM.height;
  MX.clearRect(0,0,W,H);
  MX.fillStyle='rgba(0,0,0,0.5)'; MX.fillRect(0,0,W,H);
  const px=(GS.player.x/GS.world.w)*W, py=(GS.player.y/GS.world.h)*H;
  MX.fillStyle='#00e5ff'; MX.beginPath(); MX.arc(px,py,2.5,0,6.28); MX.fill();
  MX.fillStyle='rgba(0,229,255,0.08)'; MX.beginPath(); MX.arc(px,py,5,0,6.28); MX.fill();
  GS.enemies.forEach(e => { if(e.alive){ MX.fillStyle='#ff4444'; MX.fillRect((e.x/GS.world.w)*W-1,(e.y/GS.world.h)*H-1,2,2) }});
  if(GS.boss&&GS.boss.alive){ MX.fillStyle='#ff4400'; MX.beginPath(); MX.arc((GS.boss.x/GS.world.w)*W,(GS.boss.y/GS.world.h)*H,3,0,6.28); MX.fill() }
}, 300);

// ----- GAME LOOP -----
function gameLoop(time){
  if(!GS.loop || GS.state==='menu') return;
  const dt = Math.min((time-GS.lastTime)/1000, 0.05);
  GS.lastTime = time; GS.delta = dt; GS.gameTime += dt; GS.fc++;
  if(time-GS.fpsT>1000){ GS.fps=GS.fc; GS.fc=0; GS.fpsT=time }
  
  if(!GS.paused && GS.state==='playing'){
    updatePlayer(dt); updateEnemies(dt); updateBoss(dt);
    updateProjectiles(dt); updateCamera();
  }
  drawGame();
  if(GS.state==='playing') requestAnimationFrame(gameLoop);
}

function startGameplay(){
  showScreen('gameScreen');
  GS.state = 'playing'; GS.paused = false; GS.stopped = false;
  GS.keys = {}; loadMap(GS.curMap); updateHUD();
  GS.loop = true; GS.lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ----- INTERACT -----
function interact(){
  const P = GS.player; if(!P) return;
  // NPCs
  GS.npcs.forEach(n => {
    if(Math.abs(P.x-n.x)<45 && Math.abs(P.y-n.y)<35) showDialogue(n.name, n.dia);
  });
  // Objects for hacking
  if(GS.obj && GS.obj.includes('Hack')){ showNotif('💻','Press H to hack terminal'); sfx('click') }
}

// ----- DIALOGUE -----
function showDialogue(speaker, text){
  const db = document.getElementById('dialogueBox');
  document.getElementById('diaSpeaker').textContent = speaker;
  document.getElementById('diaText').textContent = text;
  db.style.display = 'block';
}

// ============================================================
// HACKING MINI-GAME
// ============================================================
function enterHackMode(){
  if(GS.paused || !GS.player) return;
  GS.paused = true;
  document.getElementById('hackModal').classList.add('active');
  startHackGame();
}

function closeHack(){
  document.getElementById('hackModal').classList.remove('active');
  GS.paused = false;
}

function startHackGame(){
  const hpHack = 3 + Math.floor(GS.hackLevel/2);
  document.getElementById('hackHP').textContent = hpHack;
  document.getElementById('hackLvl').textContent = GS.hackLevel;
  const grid = document.getElementById('hackGrid');
  grid.innerHTML = '';
  const size = 4;
  const target = Math.floor(Math.random()*(size*size));
  for(let i=0; i<size*size; i++){
    const c = document.createElement('div');
    c.style.cssText = `background:rgba(0,229,255,${i===target?0.12:0.04});border:1px solid ${i===target?'rgba(0,229,255,0.3)':'rgba(0,229,255,0.06)'};border-radius:3px;padding:10px;cursor:pointer;text-align:center;transition:all 0.2s;font-size:14px`;
    c.textContent = i===target ? '🎯' : i%2===0 ? '💠' : '🔒';
    c.onclick = () => {
      if(i === target){
        sfx('hack'); GS.stats.hacks = (GS.stats.hacks||0)+1;
        showNotif('✅','Hack Successful!','Terminal compromised.');
        GS.hackLevel += 0.5;
        // Check missions
        GS.missions.forEach(m => {
          if(!m.done && m.obj==='hack'){ m.prog = (m.prog||0)+1; if(m.prog >= m.cnt){ m.done=true; if(!GS.completedMissions.includes(m.id)) GS.completedMissions.push(m.id); claimMission(m) }}
        });
        checkAch(); closeHack();
      } else {
        const hp = Math.max(0, parseInt(document.getElementById('hackHP').textContent)-1);
        document.getElementById('hackHP').textContent = hp;
        sfx('hit');
        if(hp <= 0){ showNotif('⚠','Hack Failed!','Try again.'); closeHack() }
      }
    };
    grid.appendChild(c);
  }
  document.getElementById('hackPrompt').textContent = '🎯 Find and click the target!';
  sfx('click');
}

// ----- MISSIONS -----
function claimMission(m){
  const P = GS.player; if(!P) return;
  if(m.rew.credits){ P.credits = (P.credits||0)+m.rew.credits; GS.stats.credits = (GS.stats.credits||0)+m.rew.credits }
  if(m.rew.exp){ P.exp += m.rew.exp; checkLevelUp() }
  if(m.rew.item) addItem(m.rew.item);
  showNotif('✅','Mission Complete!',m.name); sfx('levelup');
  updateHUD(); checkAch();
}

function renderMissions(){
  const el = document.getElementById('missionList'); el.innerHTML = '';
  if(!GS.missions){ el.innerHTML = '<div style="color:var(--dim);padding:20px;text-align:center">Start a game to view missions.</div>'; return }
  GS.missions.forEach(m => {
    const done = GS.completedMissions && GS.completedMissions.includes(m.id);
    const div = document.createElement('div');
    div.style.cssText = `background:rgba(0,229,255,${done?0.04:0.02});border:1px solid ${done?'rgba(68,255,68,0.15)':'rgba(0,229,255,0.06)'};border-radius:5px;padding:10px;margin-bottom:5px;text-align:left`;
    div.innerHTML = `<div style="font-size:11px;color:${done?'#44aa44':'var(--gold)'};font-weight:700">${done?'✅ ':''}${m.icon||'🎯'} ${m.name}</div>
      <div style="font-size:9px;color:var(--dim);margin:2px 0">${m.desc}</div>
      <div style="font-size:8px;color:rgba(255,255,255,0.3)">${done?'Complete!':(m.rew?.credits?'💰 '+m.rew.credits+'cr ':'')+(m.rew?.exp?m.rew.exp+'EXP ':'')+(m.rew?.item?'🏅 '+ITEMS[m.rew.item]?.name:'')}</div>`;
    el.appendChild(div);
  });
}

// ----- ACHIEVEMENTS -----
function checkAch(){
  const P = GS.player; const s = GS.stats;
  ACH_LIST.forEach(a => {
    if(GS.achievements[a.id]) return;
    let earned = false;
    switch(a.id){
      case 'first_mission': earned = (GS.completedMissions?.length||0) >= 1; break;
      case 'hacker': earned = (s.hacks||0) >= 5; break;
      case 'ghost': earned = (s.stealthKills||0) >= 10; break;
      case 'elite': earned = (s.kills||0) >= 50; break;
      case 'millionaire': earned = (s.credits||0) >= 1000; break;
      case 'legend': earned = P && P.lvl >= 10; break;
    }
    if(earned){
      GS.achievements[a.id] = true;
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;top:50px;right:15px;z-index:400;background:linear-gradient(135deg,rgba(0,229,255,0.12),rgba(155,89,182,0.12));border:1px solid var(--gold);border-radius:6px;padding:10px 16px;max-width:260px;backdrop-filter:blur(10px);animation:modalIn 0.4s';
      t.innerHTML = `<div style="font-size:14px;color:var(--gold);font-weight:700">🏆 ${a.name}</div><div style="font-size:9px;color:var(--dim)">${a.desc}</div>`;
      document.body.appendChild(t);
      setTimeout(() => { t.style.transition = 'all 0.4s'; t.style.opacity='0'; t.style.transform='translateX(30px)'; setTimeout(()=>t.remove(),400) }, 3000);
      sfx('levelup');
    }
  });
}

function renderAch(){
  const el = document.getElementById('achGrid');
  const cnt = document.getElementById('achCount');
  if(!el) return;
  let n = 0;
  el.innerHTML = '';
  ACH_LIST.forEach(a => {
    const e = !!GS.achievements[a.id];
    if(e) n++;
    const c = document.createElement('div');
    c.className = 'ach-card'+(e?' unlocked':' locked');
    c.innerHTML = `<div class="ac-icon">${a.icon||'🏆'}</div><div class="ac-name">${e?'✅ ':''}${a.name}</div><div class="ac-desc">${a.desc}</div>`;
    el.appendChild(c);
  });
  cnt.textContent = n+' / '+ACH_LIST.length+' Unlocked';
}

// ----- INVENTORY -----
function openInv(){
  document.getElementById('invModal').classList.add('active'); GS.paused = true;
  renderInv();
}
function closeInv(){ document.getElementById('invModal').classList.remove('active'); GS.paused = false }
let selInv = -1;

function renderInv(){
  const grid = document.getElementById('invGrid');
  const cnt = document.getElementById('invCount');
  cnt.textContent = GS.inventory.length;
  grid.innerHTML = '';
  if(GS.inventory.length === 0){ grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--dim);font-size:10px;padding:15px">Empty</div>'; return }
  GS.inventory.forEach((item,i) => {
    const d = ITEMS[item.id]; if(!d) return;
    const s = document.createElement('div');
    s.className = 'inv-slot'+(selInv===i?' selected':'');
    s.innerHTML = `<div class="si-icon">${d.icon||'?'}</div><div class="si-name">${d.name}</div>${item.count>1?`<div class="si-count">x${item.count}</div>`:''}`;
    s.onclick = () => { selInv=i; renderInv(); showInvDetail(i) };
    grid.appendChild(s);
  });
  ['weapon','armor','helmet','gadget'].forEach(s => {
    const el = document.getElementById('eq'+s.charAt(0).toUpperCase()+s.slice(1));
    if(GS.equipment[s]){ const di=ITEMS[GS.equipment[s]]; el.textContent=di?di.icon+' '+di.name:'Equipped' }
    else el.textContent = 'Empty';
  });
}

function showInvDetail(idx){
  const item = GS.inventory[idx]; if(!item) return;
  const d = ITEMS[item.id]; if(!d) return;
  const det = document.getElementById('invDetail');
  det.style.display = 'block';
  document.getElementById('idName').textContent = (d.icon||'?')+' '+d.name+(item.count>1?' x'+item.count:'');
  document.getElementById('idDesc').textContent = d.desc||'';
  let st = '';
  if(d.atk) st += '⚔ +'+d.atk+' '; if(d.def) st += '🛡 +'+d.def+' ';
  document.getElementById('idStats').textContent = st || 'Type: '+(d.type||'item');
  document.getElementById('idUse').style.display = d.type==='consumable'?'block':'none';
  document.getElementById('idEquip').style.display = d.slot?'block':'none';
}

function useSel(){
  const item = GS.inventory[selInv]; if(!item) return;
  const d = ITEMS[item.id]; if(!d||d.type!=='consumable') return;
  if(d.effect) d.effect(GS.player);
  item.count = (item.count||1)-1;
  if(item.count <= 0) GS.inventory.splice(selInv,1);
  selInv = -1; renderInv(); updateHUD();
}

function equipSel(){
  const item = GS.inventory[selInv]; if(!item) return;
  const d = ITEMS[item.id]; if(!d||!d.slot){ showNotif('⚠','Cannot equip'); return }
  const cur = GS.equipment[d.slot];
  if(cur) GS.inventory.push({id:cur, count:1});
  GS.equipment[d.slot] = item.id;
  item.count = (item.count||1)-1;
  if(item.count <= 0) GS.inventory.splice(selInv,1);
  selInv = -1; showNotif('✅','Equipped '+d.name); sfx('click');
  renderInv(); updateHUD();
}

function unequip(slot){
  if(!GS.equipment[slot]) return;
  addItem(GS.equipment[slot]); delete GS.equipment[slot];
  showNotif('↩','Unequipped'); sfx('click');
  renderInv(); updateHUD();
}

function dropSel(){
  const item = GS.inventory[selInv]; if(!item) return;
  if(!confirm('Drop '+ITEMS[item.id]?.name+'?')) return;
  item.count = (item.count||1)-1;
  if(item.count <= 0) GS.inventory.splice(selInv,1);
  selInv = -1; renderInv();
}

function sortInv(){
  GS.inventory.sort((a,b) => { const da=ITEMS[a.id], db=ITEMS[b.id]; if(!da||!db) return 0; return da.name.localeCompare(db.name) });
  renderInv();
}

function addItem(id, count=1){
  const ex = GS.inventory.find(i => i.id===id);
  if(ex) ex.count = (ex.count||1)+count;
  else GS.inventory.push({id, count});
}

function useItemType(id){
  const idx = GS.inventory.findIndex(i => i.id===id);
  if(idx<0){ showNotif('⚠','None available'); return }
  const item = GS.inventory[idx]; const d = ITEMS[id];
  if(d && d.effect) d.effect(GS.player);
  item.count = (item.count||1)-1;
  if(item.count <= 0) GS.inventory.splice(idx,1);
  updateHUD();
}

// ----- SHOP -----
function openShop(){
  document.getElementById('shopModal').classList.add('active'); GS.paused = true;
  GS.shopTab = 'weapons'; renderShop();
}
function closeShop(){ document.getElementById('shopModal').classList.remove('active'); GS.paused = false }

function renderShop(){
  const tabs = document.getElementById('shopTabs');
  const items = document.getElementById('shopItems');
  document.getElementById('shopCred').textContent = GS.player?.credits||0;
  tabs.innerHTML = '';
  Object.keys(SHOP_ITEMS).forEach(k => {
    const b = document.createElement('button');
    b.className = 'shop-tab'+(GS.shopTab===k?' active':'');
    b.textContent = {weapons:'🗡 Weapons',armor:'🛡 Armor',gadgets:'🔧 Gadgets',supplies:'📦 Supplies'}[k]||k;
    b.onclick = () => { GS.shopTab=k; renderShop() };
    tabs.appendChild(b);
  });
  items.innerHTML = '';
  const cat = SHOP_ITEMS[GS.shopTab];
  if(!cat){ items.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--dim);padding:15px">Empty</div>'; return }
  cat.forEach(id => {
    const d = ITEMS[id]; if(!d) return;
    const owned = GS.inventory.find(i => i.id===id);
    const s = document.createElement('div');
    s.className = 'shop-item';
    s.innerHTML = `<div class="sp-icon">${d.icon||'?'}</div><div class="sp-name">${d.name}</div><div class="sp-price">💰 ${d.price} cr</div>${owned?`<div style="font-size:7px;color:var(--dim)">Owned</div>`:''}`;
    s.onclick = () => buyItem(id);
    items.appendChild(s);
  });
}

function buyItem(id){
  const d = ITEMS[id]; if(!d) return;
  const P = GS.player; if(!P) return;
  if((P.credits||0) < d.price){ showNotif('⚠','Not enough credits!'); return }
  P.credits -= d.price; addItem(id);
  sfx('coin');
  document.getElementById('shopCred').textContent = P.credits;
  renderShop(); updateHUD();
}

// ----- SKILL TREE -----
function openSkillTree(){
  document.getElementById('skillModal').classList.add('active'); GS.paused = true;
  renderSkills();
}
function closeSkillTree(){ document.getElementById('skillModal').classList.remove('active'); GS.paused = false }

function renderSkills(){
  document.getElementById('skillPts').textContent = GS.player?.skillPts||0;
  const grid = document.getElementById('skillGrid');
  grid.innerHTML = '';
  Object.entries(SKILL_DB).forEach(([id,sk]) => {
    const lvl = GS.skills[id]||0;
    const maxed = lvl >= sk.max;
    const c = document.createElement('div');
    c.className = 'skill-card'+(lvl>0?' owned':'')+(maxed?' maxed':'');
    c.innerHTML = `<div class="sk-icon">${sk.icon||'⭐'}</div><div class="sk-name">${sk.name}</div><div class="sk-lvl">${'■'.repeat(lvl)}${'□'.repeat(sk.max-lvl)}</div><div class="sk-desc">${sk.desc}</div>${!maxed?`<div style="font-size:7px;color:var(--dim)">Cost: ${sk.cost} SP</div>`:'<div style="font-size:7px;color:#44aa44">MAXED</div>'}`;
    c.onclick = () => learnSkill(id);
    grid.appendChild(c);
  });
}

function learnSkill(id){
  const sk = SKILL_DB[id]; if(!sk) return;
  const P = GS.player;
  const lvl = GS.skills[id]||0;
  if(lvl >= sk.max){ showNotif('⚠','Already maxed!'); return }
  if((P.skillPts||0) < sk.cost){ showNotif('⚠','Not enough skill points!'); return }
  P.skillPts -= sk.cost; GS.skills[id] = (lvl||0)+1;
  sfx('levelup'); showNotif('⭐','Skill Up!',sk.name+' Lv.'+GS.skills[id]);
  if(id === 'vitality'){ P.maxHP += 15; P.hp = Math.min(P.maxHP, P.hp+15) }
  if(id === 'energy_core'){ P.maxEnergy += 10; P.energy = Math.min(P.maxEnergy, P.energy+10) }
  renderSkills(); updateHUD();
}

// ----- PAUSE -----
function togglePause(){
  GS.paused = !GS.paused;
  document.getElementById('pauseModal').classList.toggle('active', GS.paused);
}

// ----- TOGGLE SHOP FROM INV BUTTON -----
function openInvShop(){
  closeInv(); openShop();
}
// Override the inv shop button
document.querySelector('#invModal .modal h2+div button:last-child')?.addEventListener('click', openInvShop);

// ----- RECT COLLISION -----
function rectInt(x1,y1,w1,h1,x2,y2,w2,h2){ return x1<x2+w2 && x1+w1>x2 && y1<y2+h2 && y1+h1>y2 }

// ----- LOAD SETTINGS -----
function loadSettings(){
  document.getElementById('s_music').value = SET.music;
  document.getElementById('s_sfx').value = SET.sfx;
  ['particles','shake','weather'].forEach(k => {
    const el = document.getElementById('s_'+k);
    if(el){ el.textContent = SET[k]?'ON':'OFF'; el.classList.toggle('active',SET[k]) }
  });
}
loadSettings();

// ----- START -----
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(startLoading, 300);
});

// Ensure menu background particles run even when not in game
window.addEventListener('load', () => {
  // Check for save on menu
  const d = loadSave();
  const cb = document.getElementById('contBtn');
  if(cb) cb.style.display = d ? 'block' : 'none';
});
