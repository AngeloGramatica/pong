//#region ********************************* node setup ********************************************************************** */
// Damit das alles funktioniert, musst du zuerst node installiert haben. Das ist eine JavaScript-Laufzeitumgebung,
// die es dir ermöglicht, JavaScript-Code außerhalb eines Browsers auszuführen. Du kannst Node.js von der offiziellen
// Website herunterladen und installieren: https://nodejs.org/.
// Du musstest auch Express installieren, das ist ein Web-Framework für Node.js, das die Entwicklung von Webanwendungen erleichtert.

//Modul importieren
let express = require("express");

//Express App erstellen
let app = express();
let server = app.listen(3000, function () {
  console.log("Server läuft auf Port 3000");
});

// Wir verwalten die zwei Spieler-Slots
let players = {
  left: null, // socket.id des linken Spielers
  right: null, // socket.id des rechten Spielers
};

//Damit die Dateien im Ordner "public" für die Clients zugänglich sind, musst du den folgenden Code hinzufügen:
app.use(express.static("public"));

console.log("node server.js läuft");
//#endregion ********************************* node setup ********************************************************************** */

//#region ********************************* socket.io setup ********************************************************************** */
//wir erstellen ein socket.io server objekt. Damit können wir eine bidirektionale Kommunikation zwischen dem Server und den Clients herstellen.
let socket = require("socket.io");

//Wir übergeben dem Socket-Server unser HTTP-Server-Objekt (express), damit er auf Verbindungsanfragen von Clients hören kann.
let io = socket(server);

// io.sockets ist die Sammlung aller aktiven Socket-Verbindungen.
// .on() bedeutet: "Hör auf dieses Event."
// "connection" ist ein eingebautes socket.io-Event – es feuert automatisch
// wenn ein neuer Browser sich mit dem Server verbindet.
// newConnection ist die Funktion die dann aufgerufen wird.
io.sockets.on("connection", newConnection);

// Diese Funktion wird aufgerufen sobald ein neuer Client verbunden ist.
// stell dir vor, dass du hier eine Art EventListener erstellt hast.
// sobald jemand eine Verbindung zum Server herstellt, wird diese Funktion aufgerufen.
// socket ist das Objekt das diese eine spezifische Verbindung repräsentiert –
// jeder Browser der sich verbindet bekommt seinen eigenen socket.
// Über dieses Objekt kannst du mit genau diesem einen Client kommunizieren.
function newConnection(socket) {
  // socket.id ist eine einzigartige ID die socket.io automatisch vergibt –
  // so kannst du Spieler 1 von Spieler 2 unterscheiden.
  console.log("Neue Verbindung: " + socket.id);
  // Slot zuweisen
  if (!players.left) {
    players.left = socket.id;

    //Nachricht an linken Spieler senden, dass er Spieler 1 ist
    socket.emit("role", "left");
    gameState.gameMode = "singleplayer";
    resetGame();
    socket.emit("gameState", gameState); 

    console.log("Spieler 1 (links): " + socket.id);
  } else if (!players.right) {
    players.right = socket.id;

    //Nachricht an rechten Spieler senden, dass er Spieler 2 ist
    socket.emit("role", "right");
    gameState.gameMode = "multiplayer"; // ← neu
    io.sockets.emit("startGame");
    console.log("Spieler 2 (rechts): " + socket.id);
  } else {
    // Dritter Spieler – fragen ob er mitspielen will
    socket.emit("role", "spectator");
    socket.emit("offerReplace");
  }

  // Wenn ein Spieler die Verbindung trennt, Slot freigeben
  socket.on("disconnect", () => {
    if (players.left === socket.id) {
      players.left = null;
      gameState.gameMode = "waiting";
      console.log("Linker Spieler hat die Verbindung getrennt");
    } else if (players.right === socket.id) {
      players.right = null;
      gameState.gameMode = "singleplayer";
      console.log("Rechter Spieler hat die Verbindung getrennt");
    }
    // Verbleibenden Spieler informieren
    io.sockets.emit("playerDisconnected");
  });

  //Paddle-Bewegung vom Client empfangen
  socket.on("paddleMove", (data) => {
    if (socket.id === players.left) {
      gameState.paddleLeft.y = data.y;
    } else if (socket.id === players.right) {
      gameState.paddleRight.y = data.y;
    }
  });

  //Emit von Client empfangen, dass er den Ball abschießen will
  socket.on("launchBall", () => {
    if (gameState.ball.attached && !gameState.gameOver) {
      // Singleplayer: linker Spieler darf immer abschiessen
      if (gameState.gameMode === "singleplayer" && socket.id === players.left) {
        gameState.ball.attached = false;
        gameState.ball.vx = gameState.ball.directionX * gameState.speed;
        gameState.ball.vy = 0;
        return;
      }

      // Multiplayer: nur der Spieler der den Ball hat darf abschiessen
      if (socket.id === players.left && gameState.ball.directionX === 1) {
        gameState.ball.attached = false;
        gameState.ball.vx = gameState.speed;
        gameState.ball.vy = 0;
      } else if (
        socket.id === players.right &&
        gameState.ball.directionX === -1
      ) {
        gameState.ball.attached = false;
        gameState.ball.vx = -gameState.speed;
        gameState.ball.vy = 0;
      }
    }
  });

  //Spiel zurücksetzen
  socket.on("resetGame", () => {
    resetGame();
  });
}

function resetGame() {
  gameState.ball = {
    x: SIZE / 2,
    y: SIZE / 2,
    vx: 3,
    vy: 0,
    attached: true,
    directionX: 1,
  };
  gameState.paddleLeft.y = SIZE / 2 - PADDLE_HEIGHT / 2;
  gameState.paddleRight.y = SIZE / 2 - PADDLE_HEIGHT / 2;
  gameState.score = { left: 3, right: 3 };
  gameState.gameOver = false;
  resetBall("left");
}
//#endregion ********************************* socket.io setup ********************************************************************** */

//#region ********************************* game loop ********************************************************************** */

const SIZE = 480; // Seitenlänge des quadratischen Spielfelds in Pixeln
const BALL_RADIUS = 8; // Radius des Balls in Pixeln

//Paddles
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = SIZE / 5; // 1/5 der Spielfeldseite
const PADDLE_OFFSET = 8; // Abstand vom Rand

// Wie schnell das Paddle des Computers dem Ball folgt (0 = steht still, 1 = perfekt)
// Werte pro Level: Too young to die → Nightmare
const DIFFICULTY_LEVELS = {
  "Too young to die": 0.08,
  "Not too rough": 0.14,
  "Hurt me plenty": 0.22,
  "Ultra-Violence": 0.35,
  Nightmare: 0.55,
};

// --- Spielstate ---
// Der Server ist die einzige Wahrheit – alles läuft hier
let gameState = {
  // --- Ball-Objekt ---
  // Position (x/y) und Geschwindigkeit (vx/vy) in einem Objekt gebündelt.
  // vx/vy = velocity x/y: wie viele Pixel der Ball pro Frame zurücklegt.
  // Positiv = nach rechts/unten, negativ = nach links/oben.
  ball: {
    x: SIZE / 2, // Startposition: Mitte horizontal
    y: SIZE / 2, // Startposition: Mitte vertikal
    vx: 10, // Bewegung: 10px pro Frame nach rechts
    vy: 0, // Bewegung: 0px pro Frame nach unten
    attached: true, // startet angeklebt
    directionX: 1, // startet Richtung rechts
  },

  // Wir speichern nur die y-Position – x ist fix und wird beim Zeichnen berechnet.
  // anchor ist oben-links (Canvas-Standard), daher zentrieren wir mit - PADDLE_HEIGHT / 2
  paddleLeft: { x: PADDLE_OFFSET, y: SIZE / 2 - PADDLE_HEIGHT / 2 },
  paddleRight: {
    x: SIZE - PADDLE_OFFSET - PADDLE_WIDTH,
    y: SIZE / 2 - PADDLE_HEIGHT / 2,
  },
  score: { left: 3, right: 3 },
  gameOver: false,
  gameMode: "waiting",
  speed: 10,
  aiSpeed: DIFFICULTY_LEVELS["Hurt me plenty"],
};

// --- Hilfsfunktionen ---
function resetBall(side) {
  const ball = gameState.ball;
  ball.attached = true;
  ball.directionX = side === "left" ? 1 : -1;
  // Werden x und y hier auch gesetzt?
  const paddle = side === "left" ? gameState.paddleLeft : gameState.paddleRight;
  ball.x =
    ball.directionX === 1
      ? paddle.x + PADDLE_WIDTH + BALL_RADIUS
      : paddle.x - BALL_RADIUS;
  ball.y = paddle.y + PADDLE_HEIGHT / 2;
}

function updateBallPosition() {
  const ball = gameState.ball;
  const paddle =
    ball.directionX === 1 ? gameState.paddleLeft : gameState.paddleRight;

  //Ohne ein Cap kann es zu einer race condition kommen.
  const MAX_VY = gameState.speed * 1.5;
  ball.vy = Math.max(-MAX_VY, Math.min(MAX_VY, ball.vy)); // vy einschränken

  if (ball.attached) {
    ball.y = paddle.y + PADDLE_HEIGHT / 2;
    ball.x =
      ball.directionX === 1
        ? paddle.x + PADDLE_WIDTH + BALL_RADIUS
        : paddle.x - BALL_RADIUS;
    return;
  }

  ball.x += ball.vx;
  ball.y += ball.vy;

  // AI paddleRight im Singleplayer
  if (gameState.gameMode === "singleplayer") {
    // aiSpeed relativ zur Ballgeschwindigkeit skalieren
    // Je schneller der Ball, desto träger der Computer
    const scaledAiSpeed = gameState.aiSpeed / (gameState.speed / 3);
    const targetY = ball.y - PADDLE_HEIGHT / 2;
    gameState.paddleRight.y +=
      (targetY - gameState.paddleRight.y) * scaledAiSpeed;
    gameState.paddleRight.y = Math.max(
      0,
      Math.min(SIZE - PADDLE_HEIGHT, gameState.paddleRight.y),
    );
  }

  // Paddle-Kollisionen
  const pl = gameState.paddleLeft;
  const pr = gameState.paddleRight;

  if (
    ball.vx < 0 &&
    ball.x - BALL_RADIUS <= pl.x + PADDLE_WIDTH &&
    ball.y >= pl.y &&
    ball.y <= pl.y + PADDLE_HEIGHT
  ) {
    ball.x = pl.x + PADDLE_WIDTH + BALL_RADIUS;
    const impact = (ball.y - (pl.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
    ball.vx = gameState.speed;
    ball.vy = impact * (gameState.speed * 1.5);
  }

  if (
    ball.vx > 0 &&
    ball.x + BALL_RADIUS >= pr.x &&
    ball.y >= pr.y &&
    ball.y <= pr.y + PADDLE_HEIGHT
  ) {
    ball.x = pr.x - BALL_RADIUS;
    const impact = (ball.y - (pr.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
    ball.vx = -gameState.speed;
    ball.vy = impact * (gameState.speed * 1.5);
  }

  // Wände oben/unten
  if (ball.y - BALL_RADIUS <= 0) {
    ball.y = BALL_RADIUS;
    ball.vy *= -1;
  }
  if (ball.y + BALL_RADIUS >= SIZE) {
    ball.y = SIZE - BALL_RADIUS;
    ball.vy *= -1;
  }

  // Wände links/rechts → Punkt verloren
  if (ball.x - BALL_RADIUS <= 0) {
    gameState.score.left -= 1;
    gameState.score.left <= 0 ? (gameState.gameOver = true) : resetBall("left");
  }
  if (ball.x + BALL_RADIUS >= SIZE) {
    gameState.score.right -= 1;
    gameState.score.right <= 0
      ? (gameState.gameOver = true)
      : resetBall("right");
  }
}

// --- Server Game Loop ---
// setInterval statt requestAnimationFrame – wir sind hier nicht im Browser.
// 1000/60 = ~16ms = 60fps
setInterval(() => {
  if (gameState.gameMode === "waiting" || gameState.gameOver) return;

  updateBallPosition();

  // State an alle Clients schicken
  io.sockets.emit("gameState", gameState);
}, 1000 / 60);

//#endregion ********************************* game loop ********************************************************************** */
