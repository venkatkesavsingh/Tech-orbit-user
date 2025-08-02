// 🔐 LOGIN CODE
const loginBtn = document.querySelector(".start-quiz");

loginBtn.addEventListener("click", async () => {
  const enteredID = document.getElementById("Username").value.trim();
  const enteredPass = document.getElementById("Password").value.trim();

  if (!enteredID || !enteredPass) {
    alert("Please enter both username and password.");
    return;
  }
  
  const rooms = ["Room1", "Room2", "Room3", "Room4", "Room5", "Room6", "Room7", "Room8", "Room9", "Room10"];

  let loginSuccess = false;
  let loggedTeam = null;
  let loggedRoom = null;

  try {
    for (const room of rooms) {
      console.log(`Checking room: ${room}`);
      const teamsRef = db.collection("Tech-Orbit").doc(room).collection("Teams");
      const snapshot = await teamsRef.get();

      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Checking teamID: '${data.teamID}', enteredID: '${enteredID}'`);
        console.log(`Checking password: '${data.password}', enteredPass: '${enteredPass}'`);
        if (data.teamID === enteredID && data.password === enteredPass) {
          loginSuccess = true;
          loggedTeam = { name: data.teamName || doc.id, id: doc.id, points: data.points };
          loggedRoom = room;
        }
      });
    }

    if (!loginSuccess) {
      alert("❌ Invalid Username or Password");
      return;
    }

    document.getElementById("Login-page").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    // ✅ Login successful
    setUIState("locked");

    document.getElementById("team-name-display").textContent = "Team: " + loggedTeam.name;
    document.getElementById("current-points").textContent = loggedTeam.points;

    sessionStorage.setItem("teamName", loggedTeam.id);
    sessionStorage.setItem("room", loggedRoom);

    listenForTeamUpdates(loggedTeam.id, loggedRoom);
    listenForQuizEnd(loggedRoom, loggedTeam.id);
    listenForQuestion(loggedRoom, loggedTeam.id);
    listenForCurrentQuestionUser(loggedRoom);

    // ✅ Enable real-time presence tracking
    const teamRef = db.collection("Tech-Orbit").doc(loggedRoom).collection("Teams").doc(loggedTeam.id);

    // Set active = true and update lastSeen immediately
    await teamRef.update({
      active: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Keep sending presence updates every 3 seconds
    setInterval(() => {
      teamRef.update({
        active: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.error("Presence update failed:", err));
    }, 3000);

  } catch (error) {
    console.error("Login error:", error);
    alert("⚠️ Something went wrong. Try again.");
  }
});

// Global UI state variable
// Possible states: "locked", "betting", "waiting", "result"
let currentUIState = null;
let questionActive = false; // Track if a question is active
let timerRunning = false; // Track if timer is running

function setUIState(state, message = "") {
  const bettingUI = document.getElementById("betting-section");
  const waitingUI = document.getElementById("waiting-container");

  if (!bettingUI || !waitingUI) {
    console.warn("⚠️ Betting or Waiting UI not found in DOM.");
    return;
  }

  currentUIState = state;

  switch(state) {
    case "locked":
      bettingUI.style.display = "none";
      waitingUI.style.display = "block";
      setWaitingMessage("🔒 Bet Section Locked");
      break;
    case "betting":
      bettingUI.style.display = "block";
      waitingUI.style.display = "none";
      break;
    case "waiting":
      bettingUI.style.display = "none";
      waitingUI.style.display = "block";
      setWaitingMessage(message || "⏳ Waiting for results...");
      break;
    case "result":
      bettingUI.style.display = "none";
      waitingUI.style.display = "block";
      setWaitingMessage(message);
      break;
    default:
      console.warn("⚠️ Unknown UI state:", state);
  }
}

function listenForTeamUpdates(teamDocID, room) {
  db.collection("Tech-Orbit").doc(room).collection("Teams").doc(teamDocID)
    .onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data();

      // Update points on the UI
      document.getElementById("current-points").textContent = data.points;

      // Check if team is eliminated
      if (data.points <= 0) {
        showEliminationPopup();
      }

      // Only update UI if not currently betting or waiting for results
      if (currentUIState !== "betting" && currentUIState !== "waiting") {
        if (data.betLocked === true) {
          setUIState("locked");
        } else {
          // Only set to betting if timer is active
          if (timerRunning) {
            setUIState("betting");
          } else {
            setUIState("locked", "🔒 Bet Section Locked");
          }
        }
      }

      // Show result when admin marks correct or wrong
      if (data.lastResult) {
        const resultMsg = data.lastResult === "correct" ? "✅ Correct Answer!" : "❌ Wrong Answer!";
        // Only show result if question is not active and timer not running
        if (!questionActive && !timerRunning) {
          setUIState("result", resultMsg);
        }
      }
  });
}

let currentQuestionId = null;
let timerStartedForCurrentQ = false;

function listenForQuestion(room, teamName) {
  db.collection("Tech-Orbit").doc(room).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    const question = data.currentQuestion;
    if (!question) return;

    // ✅ Always update question number
    if (question.questionNumber) {
      document.getElementById("user-question-display").textContent =
        `📌 Current Question: ${question.questionNumber}`;
    }

    // ✅ Detect NEW QUESTION
    if (question.questionNumber !== currentQuestionId) {
      currentQuestionId = question.questionNumber;

      // Reset flags
      timerStartedForCurrentQ = false;
      questionActive = true;
      timerRunning = false;

      // ✅ Clear any old result and show locked message
      setUIState("locked", "🔒 Bet Section Locked");

      // ✅ Remove old result from Firestore (optional but prevents old result showing)
      const roomRef = db.collection("Tech-Orbit").doc(room).collection("Teams").doc(teamName);
      roomRef.update({ lastResult: firebase.firestore.FieldValue.delete() }).catch(()=>{});
    }

    // ✅ When TIMER starts → switch to betting UI only once
    if (question.timerActive && question.timerStart && !timerStartedForCurrentQ) {
      timerStartedForCurrentQ = true;
      timerRunning = true;

      setUIState("betting"); // hide locked message & show bet area
      startUserCountdown(question.timerStart.toDate(), teamName, room);
    }

    // ✅ If timerActive is false and question was active → back to locked
    if (!question.timerActive && questionActive && !timerRunning) {
      setUIState("locked", "🔒 Bet Section Locked");
      questionActive = false;
    }

    // Additional check: if timer is inactive and questionActive is false, ensure betting UI is hidden
    if (!question.timerActive && !questionActive) {
      setUIState("locked", "🔒 Bet Section Locked");
    }
  });
}

async function autoSubmitMinimumBet(teamName, room) {
  const teamRef = db.collection("Tech-Orbit").doc(room).collection("Teams").doc(teamName);
  const teamDoc = await teamRef.get();
  const data = teamDoc.data();

  // If user already placed a bet, do nothing
  if (data.currentBet && data.currentBet > 0) {
    console.log(`Bet already placed (${data.currentBet} pts), not overriding.`);
    return;
  }

  setUIState("waiting", "⏳ Waiting for results...");

  // Otherwise, set minimum bet
  await teamRef.update({
    currentBet: 10,
    betLocked: true
  });

  console.log(`Auto-minimum bet (10 pts) placed for ${teamName}`);
}

function showEliminationPopup() {
  alert("❌ You have been eliminated from the quiz!");
}

// Betting control (with max bet = current points)
let betAmount = 10;
const minBet = 10;
const betAmountDisplay = document.getElementById("bet-amount");
const warning = document.getElementById("bet-warning");

function updateBetDisplay() {
  if (betAmountDisplay) {
    betAmountDisplay.textContent = betAmount;
  }
}

function getCurrentPoints() {
  const pointsEl = document.getElementById("current-points");
  if (pointsEl) {
    return parseInt(pointsEl.textContent) || 0;
  }
  return 0;
}

const increaseBetBtn = document.getElementById("increase-bet");
if (increaseBetBtn) {
  increaseBetBtn.addEventListener("click", () => {
    const maxBet = getCurrentPoints();
    if (betAmount + 10 <= maxBet) {
      betAmount += 10;
      updateBetDisplay();
      if (warning) warning.style.display = "none";
    } else {
      alert("⚠️ You cannot bet more than your total points!");
    }
  });
}

const decreaseBetBtn = document.getElementById("decrease-bet");
if (decreaseBetBtn) {
  decreaseBetBtn.addEventListener("click", () => {
    if (betAmount > minBet) {
      betAmount -= 10;
      updateBetDisplay();
      if (warning) warning.style.display = "none";
    } else {
      if (warning) warning.style.display = "block";
    }
  });
};

function listenForQuizEnd(room, teamName) {
  db.collection("Tech-Orbit").doc(room)
    .onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data();

      if (data.quizEnded) {
        loadFinalScoreboard(room);
        if (data.winner === teamName) {
          showWinMessage();
        } else {
          showLoseMessage();
        }
      }
    });
}

function showWinMessage() {
  alert("🏆 Congratulations! You are the winner!");
  // TODO: add confetti animation here later
}

function showLoseMessage() {
  alert("😔 Sorry, better luck next time!");
}

function loadFinalScoreboard(room) {
  const container = document.getElementById("scoreboard-container");
  container.innerHTML = "";

  db.collection("Tech-Orbit").doc(room).collection("Teams")
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.style.margin = "5px";
        div.style.padding = "5px";
        div.style.borderBottom = "1px solid rgba(255,255,255,0.3)";
        div.innerHTML = `<strong>${doc.id}</strong>: ${data.points} pts`;
        container.appendChild(div);
      });
    });

  document.getElementById("final-scoreboard").style.display = "block";
}

let userTimer;

function startUserCountdown(startTime, teamName, room) {
  clearInterval(userTimer);

  const countdownEl = document.getElementById("question-timer");

  setUIState("betting");
  timerRunning = true;

  userTimer = setInterval(() => {
    const elapsed = Date.now() - startTime.getTime();
    let remaining = Math.ceil((30 * 1000 - elapsed) / 1000);
    remaining = Math.min(remaining, 30);
    remaining = Math.max(0, remaining);

    countdownEl.textContent = `⏳ Time Left: ${remaining}s`;

    if (remaining <= 0) {
      clearInterval(userTimer);
      timerRunning = false;

      setUIState("waiting", "⏳ Waiting for results...");

      autoSubmitMinimumBet(teamName, room);
    }
  }, 1000);
}

document.getElementById("submit-bet").addEventListener("click", async () => {
  const room = sessionStorage.getItem("room");
  const teamName = sessionStorage.getItem("teamName");
  if (!room || !teamName) {
    alert("❌ Session expired. Please log in again.");
    return;
  }

  const teamRef = db.collection("Tech-Orbit").doc(room).collection("Teams").doc(teamName);

  await teamRef.update({
    currentBet: betAmount,
    betLocked: true
  });

  console.log(`Bet of ${betAmount} pts submitted by ${teamName}`);
  alert(`Your bet of ${betAmount} pts has been placed!`);

  setUIState("waiting", "⏳ Waiting for Results...");
});

function listenForCurrentQuestionUser(room) {
  db.collection("Tech-Orbit").doc(room).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();

    if (data.currentQuestion?.questionNumber) {
      document.getElementById("user-question-display").textContent =
        `Current Question: ${data.currentQuestion.questionNumber}`;
    } else {
      document.getElementById("user-question-display").textContent =
        `Current Question: 0`;
    }
  });
}

function setWaitingMessage(message) {
  const waitingUI = document.getElementById("waiting-container");
  if (waitingUI) {
    const h3 = waitingUI.querySelector("h3");
    if (h3) {
      h3.textContent = message;
    } else {
      waitingUI.innerHTML = `<h3>${message}</h3>`;
    }
  }
}

