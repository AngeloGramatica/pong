// --- Canvas Setup ---

//#region *********************************************************** Konstanten ***************************************************************** */
// Wir holen uns das Canvas-Element aus dem DOM...
const canvas = document.getElementById("gameCanvas");

const SIZE = 480; // Seitenlänge des quadratischen Spielfelds in Pixeln
const BALL_RADIUS = 8; // Radius des Balls in Pixeln

// Canvas-Grösse setzen. Würde man das per CSS machen,
// würde das Canvas nur skaliert – die interne Auflösung bliebe falsch.
canvas.width = SIZE;
canvas.height = SIZE;

// ...und daraus den "2D Rendering Context".
// ctx ist das Objekt mit dem wir tatsächlich zeichnen.
// Alles wie Rechtecke, Kreise, Farben läuft über ctx.
const ctx = canvas.getContext("2d");

//Paddles
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = SIZE / 5; // 1/5 der Spielfeldseite
const PADDLE_OFFSET = 8; // Abstand vom Rand

// --- Score / Leben ---
const MAX_LIVES = 3;

const score = {
  left: MAX_LIVES,
  right: MAX_LIVES,
};
//#endregion ****************************************************************************************************************************************** */

//#region *********************************************************** Spielvariablen ***************************************************************** */
let gameOver = false;

let paddleLeft = { x: 0, y: 0 };
let paddleRight = { x: 0, y: 0 };
let ball = { x: 0, y: 0 };

// Basisgeschwindigkeit – wird vom Slider gesteuert
let speed = 3;

let socket; // Socket.IO-Verbindung zum Server

let gameReady = false;
//#endregion ****************************************************************************************************************************************** */

function setup() {
  // io() ohne URL verbindet automatisch zum Server, von dem die Seite geladen wurde.
  // Lokal ist das http://localhost:3000, in Production die Railway-URL –
  // Socket.IO liest den Origin der Seite aus, kein manueller Wechsel nötig.
  socket = io();

  // Role empfangen – wir wissen jetzt wer wir sind
  socket.on("role", (role) => {
    console.log("Ich bin: " + role);
    myRole = role; // globale Variable die wir später brauchen
  });

  // Spiel starten
  socket.on("startGame", () => {
    console.log("Spiel startet!");
    // Hier später den Game Loop starten
  });

  // Angebot: mitspielen?
  socket.on("offerReplace", () => {
    const join = confirm(
      "Ein Spiel läuft bereits. Möchtest du mitspielen und einen Spieler ersetzen?",
    );
    if (join) {
      socket.emit("requestJoin");
    }
  });

  // Gegner hat die Verbindung getrennt
  socket.on("playerDisconnected", () => {
    console.log("Gegner hat die Verbindung getrennt");
    // Hier später Spiel pausieren
  });

  // Den aktuellen Spielstate vom Server empfangen
  socket.on("gameState", (state) => {
    //console.log(state);
    gameReady = true; // Spiel ist bereit zum Zeichnen
    // Lokale Objekte mit Server-State überschreiben
    ball.x = state.ball.x;
    ball.y = state.ball.y;
    ball.attached = state.ball.attached;

    paddleLeft.x = state.paddleLeft.x;
    paddleLeft.y = state.paddleLeft.y;
    paddleRight.x = state.paddleRight.x; 
    paddleRight.y = state.paddleRight.y;

    score.left = state.score.left;
    score.right = state.score.right;

    gameOver = state.gameOver;
  });
}

// --- draw() ---
// KEIN Canvas-Pflichtname – wir haben das selbst so benannt.
// Canvas ist "retained mode": es merkt sich nichts.
// Was einmal gezeichnet wurde, bleibt bis wir es überschreiben.
// Deshalb: jeden Frame zuerst alles löschen, dann neu zeichnen.
function draw() {
  // Alles löschen (0, 0 = oben links; SIZE, SIZE = unten rechts)
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Hintergrund zeichnen: fillStyle setzt die Füllfarbe,
  // fillRect(x, y, breite, höhe) füllt ein Rechteck.
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Ball zeichnen.
  // Canvas hat keine circle()-Funktion – man zeichnet Kreise über arc().
  // beginPath() startet einen neuen Pfad (sonst werden alte Pfade mitgezeichnet).
  // arc(x, y, radius, startwinkel, endwinkel) – Math.PI * 2 = voller Kreis (360°).
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill(); // Pfad füllen (im Gegensatz zu ctx.stroke() = nur Kontur)

  // Paddles zeichnen – fillRect(x, y, breite, höhe)
  // Anders als arc() braucht fillRect keinen beginPath(),
  // weil es kein Pfad-basierter Befehl ist.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(paddleLeft.x, paddleLeft.y, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.fillRect(paddleRight.x, paddleRight.y, PADDLE_WIDTH, PADDLE_HEIGHT);

  // --- Score anzeigen ---
  // Canvas-Text braucht font, fillStyle und fillText – kein HTML drumherum.
  // textAlign bestimmt ob x der linke Rand, die Mitte oder der rechte Rand des Texts ist.
  ctx.font = "24px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.5)";

  ctx.textAlign = "left";
  ctx.fillText(`♥ ${score.left}`, PADDLE_OFFSET + PADDLE_WIDTH + 16, 36);

  ctx.textAlign = "right";
  ctx.fillText(
    `${score.right} ♥`,
    SIZE - PADDLE_OFFSET - PADDLE_WIDTH - 16,
    36,
  );

  // --- Game Over ---
  if (gameOver) {
    const winner = score.left > 0 ? "Links" : "Rechts";

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = "#ffffff";
    ctx.font = "32px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${winner} gewinnt!`, SIZE / 2, SIZE / 2 - 16);

    ctx.font = "16px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    // Nur ein Text – der Reset läuft jetzt per Klick via socket.emit("resetGame")
    ctx.fillText("Klicken um nochmal zu spielen", SIZE / 2, SIZE / 2 + 20);
  }
}

// Ball wird auf dem Paddle "geparkt" – bereit zum Abschiessen.
// paddle = paddleLeft oder paddleRight
// directionX = 1 (nach rechts) oder -1 (nach links)
function resetBall(paddle, directionX) {
  ball.directionX = directionX;
  ball.attached = true; // Ball klebt am Paddle

  // x: knapp vor der Vorderkante des Paddles
  ball.x =
    directionX === 1
      ? paddle.x + PADDLE_WIDTH + BALL_RADIUS
      : paddle.x - BALL_RADIUS;

  // y: zentriert auf dem Paddle
  ball.y = paddle.y + PADDLE_HEIGHT / 2;
}

// --- Game Loop ---
// requestAnimationFrame ist eine Browser-API, die die Callback-Funktion
// aufruft, wenn der Browser bereit ist, den nächsten Frame zu rendern –
// typischerweise 60x pro Sekunde (synchron mit dem Display-Refresh).
// Besser als setInterval(), weil es pausiert wenn der Tab inaktiv ist,
// und nicht mehr Frames erzeugt als der Bildschirm darstellen kann.
function loop() {
  // if (!gameOver) update(); // 1. Logik: Positionen berechnen
  if (gameReady) draw(); // 2. Grafik: neuen Zustand zeichnen
  requestAnimationFrame(loop); // 3. nächsten Frame anfordern (rekursiv)
}

//#region *********************************************************** Event Listener **************************************************************************** */
// --- Maus-Steuerung (linkes Paddle) ---
// Wir lauschen auf mousemove-Events auf dem Canvas-Element.
// Das Event gibt uns die Mausposition relativ zum Viewport –
// wir müssen sie erst in Canvas-Koordinaten umrechnen.
canvas.addEventListener("mousemove", (e) => {
  // getBoundingClientRect() gibt uns Position und Grösse des Canvas im Viewport.
  // Falls das Canvas per CSS skaliert wird, weicht die visuelle Grösse
  // von der internen Auflösung ab – rect hilft uns, das zu kompensieren.
  const rect = canvas.getBoundingClientRect();

  // Mausposition relativ zur Canvas-Oberkante
  const mouseY = e.clientY - rect.top;

  // Paddle zentriert zur Maus setzen:
  // Ohne - PADDLE_HEIGHT / 2 würde die Oberkante des Paddles der Maus folgen.
  const paddleY = Math.max(
    0,
    Math.min(SIZE - PADDLE_HEIGHT, mouseY - PADDLE_HEIGHT / 2),
  );

  socket.emit("paddleMove", { y: paddleY });
});

canvas.addEventListener("click", () => {
  if (!ball.attached || gameOver) return;

  ball.attached = false;
  ball.vx = speed * ball.directionX;
  ball.vy = 0;
});

const difficultySelect = document.getElementById("difficultySelect");

// Schwierigkeit ändern – wir senden die neue Schwierigkeit an den Server
difficultySelect.addEventListener("change", (e) => {
  socket.emit("difficultyChange", e.target.value);
});

const slider = document.getElementById("speedSlider");
const speedValue = document.getElementById("speedValue");

slider.addEventListener("input", (e) => {
  const newSpeed = parseInt(e.target.value);
  speedValue.textContent = newSpeed;
  // Neue Geschwindigkeit an den Server schicken, damit gameState.speed aktualisiert wird.
  // Würden wir nur die lokale Variable ändern, hätte das keinen Effekt:
  // der Server überschreibt jeden Frame den Client-State mit seinem eigenen gameState.
  socket.emit("speedChange", newSpeed);
});

canvas.addEventListener("click", () => {
  if (gameOver) {
    socket.emit("resetGame");
    return;
  }
  socket.emit("launchBall");
});
//#endregion ****************************************************************************************************************************************** */

//socket-Verbindung aufbauen und Event-Listener registrieren
//Muss aufgerufen werden bevor die Socket-Events registriert werden, damit socket nicht undefined ist.
setup();

// Ball initial auf dem linken Paddle parken
resetBall(paddleLeft, 1);

// Loop starten
loop();
