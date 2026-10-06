const TS = 24;
const MAZES = [
  // FASE 1
  [
    "####################",
    "#........##........#",
    "#.####..#..#..####.#",
    "#o####..#..#..####o#",
    "#..................#",
    "#.##.####.####.##..#",
    "#..................#",
    "#.####.###..###.##.#",
    "#..#.....##.....#..#",
    "###..##......##..###",
    "#.....#..#..####...#",
    "#.###.#....###.###.#",
    "#o..#....#..#...#.o#",
    "###.#.####.####.#.##",
    "#...#..............#",
    "#.#####.#####.######",
    "#........##........#",
    "####################"
  ],
  // FASE 2
  [
    "####################",
    "#o.......##.......o#",
    "#.######.##.######.#",
    "#..................#",
    "#.##.###....###.##.#",
    "#....#.######.#....#",
    "####.#........#.####",
    "#....#.######.#....#",
    "#.##.#........#.##.#",
    "#..#...##..##...#..#",
    "##.###.#....#.###.##",
    "#......#.##.#......#",
    "#.####.#....#.####.#",
    "#....#.######.#....#",
    "#.##.#........#.##.#",
    "#o...#...##...#...o#",
    "#..#..........#..#.#",
    "####################"
  ],
  // FASE 3
  [
    "####################",
    "#........##........#",
    "#.####.#.##.#.####.#",
    "#o####.#.##.#.####o#",
    "#....#..#..#..#....#",
    "####.#..#..#..#.####",
    "#....#....##....#..#",
    "#.##.###.####.###.##",
    "#..#......####....##",
    "##.####.#......#.###",
    "#......#.######.#..#",
    "#.####.#........#.##",
    "#o..#..####..####..#",
    "###.#..#........#.##",
    "#....#.#.######.#..#",
    "#.####.#........#.##",
    "#........##........#",
    "####################"
  ]
];

let currentMaze = 0;
let MAP = MAZES[currentMaze];

const COLS = 20;
const ROWS = MAP.length;

const canvas = document.getElementById('game');
canvas.width = COLS * TS;
canvas.height = ROWS * TS;
const ctx = canvas.getContext('2d');

const WALL=0, DOT=1, PELLET=2, EMPTY=3;
let grid = [];
let dotsLeft = 0;
let score = 0, lives = 3, level = 1;
let gameOver = false, win = false;
let frightTimer = 0;

const DIRS = {
  up:    {x:0, y:-1},
  down:  {x:0, y:1},
  left:  {x:-1,y:0},
  right: {x:1, y:0},
  none:  {x:0, y:0}
};
const OPP = {up:'down',down:'up',left:'right',right:'left',none:'none'};

let pac, ghosts;

// ---- SOUNDS (Web Audio API) ----
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq, duration, type='square', volume=0.1) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = volume;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + duration);
}
function soundEat() { beep(600, 0.05, 'square', 0.06); }
function soundPellet() { beep(400, 0.15, 'triangle', 0.08); }
function soundDeath() {
  [300,200,150,100].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sawtooth',0.1), i*120));
}
function soundEatGhost() { beep(800, 0.1, 'square', 0.1); beep(1200, 0.1, 'square', 0.1); }
function soundLevelUp() { [500,700,900,1200].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'triangle',0.1), i*80)); }
function soundGameOver() { [300,250,200,150].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.1), i*150)); }
function soundStart() { [400,500,600,800].forEach((f,i)=>setTimeout(()=>beep(f,0.08,'triangle',0.08), i*60)); }

// ---- HIGH SCORE ----
function loadHighScore() { return parseInt(localStorage.getItem('pacman_highscore') || '0', 10); }
function saveHighScore(s) { localStorage.setItem('pacman_highscore', String(s)); }
document.getElementById('highscore').textContent = loadHighScore();

// ---- MAZE & GRID ----
function loadMaze(index) {
  currentMaze = index;
  MAP = MAZES[currentMaze].map(r => r.padEnd(COLS, '#'));
  buildGrid();
}
function buildGrid(){
  grid = MAP.map(row => [...row].map(c => {
    if (c === '#') return WALL;
    if (c === '.') { dotsLeft++; return DOT; }
    if (c === 'o') { dotsLeft++; return PELLET; }
    return EMPTY;
  }));
}
function resetPositions(){
  pac = { tileX:1, tileY:1, x:1, y:1, dir:'none', nextDir:'none', speed:0.12, mouth:0 };
  const colors = ['#ff0000','#ffb8ff','#00ffff','#ffb852'];
  const starts = [{x:7,y:10},{x:8,y:10},{x:10,y:10},{x:11,y:10}];
  ghosts = colors.map((c,i)=>({
    tileX: starts[i].x, tileY: starts[i].y, x: starts[i].x, y: starts[i].y,
    dir: 'up', speed: 0.09 + level*0.005,
    color: c, frightened:false, eaten:false
  }));
}

function isWall(x,y){
  if (y<0||y>=ROWS) return true;
  if (x<0||x>=COLS) return false;
  return grid[y][x] === WALL;
}
function canGo(x,y,dir){
  const d = DIRS[dir];
  return !isWall(x+d.x, y+d.y);
}
function atCenter(e){
  return Math.abs(e.x - Math.round(e.x)) < e.speed*0.6 && Math.abs(e.y - Math.round(e.y)) < e.speed*0.6;
}
function setCenter(e){
  e.x = Math.round(e.x); e.y = Math.round(e.y);
  e.tileX = e.x; e.tileY = e.y;
}
function move(e){
  const d = DIRS[e.dir];
  e.x += d.x * e.speed;
  e.y += d.y * e.speed;
  if (e.x < -0.5) e.x = COLS-0.5;
  if (e.x > COLS-0.5) e.x = -0.5;
}

function chooseGhostDir(g){
  const options = Object.keys(DIRS).filter(d => d!=='none' && !(d===OPP[g.dir]) && canGo(g.tileX,g.tileY,d));
  if (options.length===0) { g.dir = OPP[g.dir]; return; }
  if (g.frightened){
    g.dir = options[Math.floor(Math.random()*options.length)];
    return;
  }
  if (Math.random() < 0.6){
    let best = options[0], bestDist = Infinity;
    for (const d of options){
      const nx = g.tileX + DIRS[d].x, ny = g.tileY + DIRS[d].y;
      const dist = (nx-pac.tileX)**2 + (ny-pac.tileY)**2;
      if (dist < bestDist){ bestDist = dist; best = d; }
    }
    g.dir = best;
  } else {
    g.dir = options[Math.floor(Math.random()*options.length)];
  }
}

// ---- UPDATE ----
function update(){
  if (gameOver) return;

  // PACMAN
  if (atCenter(pac)){
    setCenter(pac);
    if (pac.nextDir !== 'none' && canGo(pac.tileX,pac.tileY,pac.nextDir)) pac.dir = pac.nextDir;
    if (pac.dir !== 'none' && !canGo(pac.tileX,pac.tileY,pac.dir)) pac.dir = 'none';
  }
  if (pac.dir !== 'none') move(pac);
  pac.mouth += 0.2;

  // come moedas
  const tx = Math.round(pac.x), ty = Math.round(pac.y);
  if (tx>=0 && tx<COLS && ty>=0 && ty<ROWS){
    if (grid[ty][tx] === DOT){ grid[ty][tx] = EMPTY; score+=10; dotsLeft--; soundEat(); }
    else if (grid[ty][tx] === PELLET){
      grid[ty][tx] = EMPTY; score+=50; dotsLeft--;
      soundPellet();
      frightTimer = 360;
      ghosts.forEach(g=>{ if(!g.eaten){ g.frightened=true; } });
    }
  }

  // FANTASMAS
  if (frightTimer > 0){
    frightTimer--;
    if (frightTimer === 0) ghosts.forEach(g=> g.frightened=false);
  }
  for (const g of ghosts){
    if (atCenter(g)){
      setCenter(g);
      chooseGhostDir(g);
    }
    move(g);
    if (Math.abs(g.x-pac.x)<0.6 && Math.abs(g.y-pac.y)<0.6){
      if (g.frightened && !g.eaten){
        score += 200; soundEatGhost();
        g.frightened = false;
        g.x = 9; g.y = 6; g.tileX = 9; g.tileY = 6; g.dir = 'up';
      } else {
        soundDeath();
        lives--;
        if (lives <= 0){
          gameOver = true;
          soundGameOver();
          checkHighScore();
          document.getElementById('msg').textContent = 'GAME OVER';
          document.getElementById('restart').style.display = 'block';
        } else {
          resetPositions();
        }
        return;
      }
    }
  }

  if (dotsLeft === 0){
    level++;
    soundLevelUp();
    if (currentMaze < MAZES.length - 1) {
      loadMaze(currentMaze + 1);
      document.getElementById('msg').textContent = 'Fase ' + (currentMaze+1) + '!';
    } else {
      document.getElementById('msg').textContent = 'VOCÊ VENCEU!';
      checkHighScore();
      gameOver = true;
      document.getElementById('restart').style.display = 'block';
    }
    resetPositions();
  }
}

function checkHighScore() {
  const hs = loadHighScore();
  if (score > hs) {
    saveHighScore(score);
    document.getElementById('highscore').textContent = score;
  }
}

// ---- DRAW ----
function draw(){
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    const c = grid[y][x];
    if (c === WALL){
      ctx.fillStyle = '#2222ff';
      ctx.fillRect(x*TS+1, y*TS+1, TS-2, TS-2);
    } else if (c === DOT){
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x*TS+TS/2, y*TS+2, 3, 0, Math.PI*2); ctx.fill();
    } else if (c === PELLET){
      ctx.fillStyle = '#ffb8ae';
      ctx.beginPath(); ctx.arc(x*TS+TS/2, y*TS+TS/2, 7, 0, Math.PI*2); ctx.fill();
    }
  }

  // pacman
  const px = pac.x*TS+TS/2, py = pac.y*TS+TS/2;
  const m = (Math.sin(pac.mouth)*0.5+0.5)*0.25*Math.PI;
  let rot = 0;
  if (pac.dir==='left') rot = Math.PI;
  if (pac.dir==='up') rot = -Math.PI/2;
  if (pac.dir==='down') rot = Math.PI/2;
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.moveTo(px,py);
  ctx.arc(px,py,TS/2-2, rot+m, rot-m+Math.PI*2);
  ctx.fill();

  // fantasmas
  for (const g of ghosts){
    const gx = g.x*TS+TS/2, gy = g.y*TS+TS/2;
    ctx.fillStyle = g.frightened ? (frightTimer<120 && Math.floor(frightTimer/10)%2 ? '#fff' : '#2121de') : g.color;
    ctx.beginPath();
    ctx.arc(gx, gy, TS/2-2, Math.PI, 0);
    ctx.lineTo(gx+TS/2-2, gy+TS/2-2);
    ctx.lineTo(gx-TS/2+2, gy+TS/2-2);
    ctx.closePath(); ctx.fill();
    if (!g.frightened){
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(gx-5, gy-2, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx+5, gy-2, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(gx-5, gy-2, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx+5, gy-2, 2, 0, Math.PI*2); ctx.fill();
    }
  }

  document.getElementById('score').textContent = score;
  document.getElementById('lives').textContent = lives;

  if (gameOver){
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    const msg = win ? 'VOCÊ VENCEU!' : 'GAME OVER';
    ctx.fillText(msg, canvas.width/2, canvas.height/2 - 10);
    ctx.font = '16px Arial';
    ctx.fillText('Pontuação: ' + score, canvas.width/2, canvas.height/2 + 20);
  }
}

function loop(){
  update();
  draw();
  requestAnimationFrame(loop);
}

// ---- INPUT: KEYBOARD ----
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k==='arrowup'||k==='w') pac.nextDir='up';
  else if (k==='arrowdown'||k==='s') pac.nextDir='down';
  else if (k==='arrowleft'||k==='a') pac.nextDir='left';
  else if (k==='arrowright'||k==='d') pac.nextDir='right';
  if (k.startsWith('arrow')) e.preventDefault();
});

// ---- INPUT: JOYSTICK (TOUCH) ----
const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');
let joyActive = false, joyStartX = 0, joyStartY = 0, joyID = null;
const JOY_RADIUS = 50;
const STICK_RADIUS = 20;

function getDirection(dx, dy) {
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if (absX < 15 && absY < 15) return 'none';
  if (absX > absY) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

joystick.addEventListener('touchstart', e => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const touch = e.changedTouches[0];
  joyID = touch.identifier;
  const rect = joystick.getBoundingClientRect();
  joyStartX = rect.left + JOY_RADIUS;
  joyStartY = rect.top + JOY_RADIUS;
  joyActive = true;
  e.preventDefault();
}, {passive:false});

joystick.addEventListener('touchmove', e => {
  if (!joyActive) return;
  const touch = Array.from(e.changedTouches).find(t => t.identifier === joyID);
  if (!touch) return;
  let dx = touch.clientX - joyStartX;
  let dy = touch.clientY - joyStartY;
  const dist = Math.hypot(dx, dy);
  if (dist > JOY_RADIUS) {
    dx = dx / dist * JOY_RADIUS;
    dy = dy / dist * JOY_RADIUS;
  }
  stick.style.transform = `translate(${dx}px, ${dy}px)`;
  pac.nextDir = getDirection(dx, dy);
  e.preventDefault();
}, {passive:false});

function endJoy() {
  joyActive = false;
  joyID = null;
  stick.style.transform = 'translate(0,0)';
  pac.nextDir = 'none';
}
joystick.addEventListener('touchend', endJoy, {passive:false});
joystick.addEventListener('touchcancel', endJoy, {passive:false});

// ---- RESTART BUTTON ----
document.getElementById('restart').addEventListener('click', () => {
  score = 0; lives = 3; level = 1; gameOver = false; win = false;
  loadMaze(0);
  resetPositions();
  document.getElementById('msg').textContent = '';
  document.getElementById('restart').style.display = 'none';
  soundStart();
});

// ---- START ----
loadMaze(0);
resetPositions();
soundStart();
loop();