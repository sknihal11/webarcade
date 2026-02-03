const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const gameOver = document.getElementById("gameOver");
const winnerText = document.getElementById("winnerText");

const btnSingle = document.getElementById("btnSingle");
const btnMulti = document.getElementById("btnMulti");

let playerY = canvas.height / 2 - 40;
let aiY = playerY;
let ball = { x: 450, y: 250, vx: 5, vy: 5 };

let running = false;

btnSingle.onclick = () => startGame(false);
btnMulti.onclick = () => {
  alert("Multiplayer Firebase sync can be added here");
  startGame(false);
};

function startGame(multiplayer) {
  menu.style.display = "none";
  canvas.style.display = "block";
  running = true;
  requestAnimationFrame(loop);
}

function loop() {
  if (!running) return;

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // player
  ctx.fillRect(20, playerY, 10, 80);

  // AI
  aiY += (ball.y - aiY - 40) * 0.05;
  ctx.fillRect(canvas.width - 30, aiY, 10, 80);

  // ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.y < 0 || ball.y > canvas.height) ball.vy *= -1;

  ctx.fillRect(ball.x, ball.y, 10, 10);

  if (ball.x < 0 || ball.x > canvas.width) endGame();

  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  canvas.style.display = "none";
  gameOver.classList.remove("hidden");
  winnerText.textContent = "GAME OVER";
}

window.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  playerY = e.clientY - rect.top - 40;
});
