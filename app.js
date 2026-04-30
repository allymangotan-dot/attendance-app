// Firebase references (already initialized in HTML)
const db = window.db;
const auth = window.auth;

window.currentUser = null;

// ----------------------
// BASIC STATE
// ----------------------
let state = {
  sections: [],
  attendance: {}
};

// ----------------------
// UI ELEMENTS
// ----------------------
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const studentPage = document.getElementById("studentPage");

const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");
const studentLogout = document.getElementById("studentLogout");

// ----------------------
// AUTH STATE LISTENER
// ----------------------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  window.currentUser = user;

  const doc = await db.collection("users").doc(user.uid).get();
  const role = doc.data()?.role;

  if (role === "teacher") {
    showApp();
  } else {
    showStudentPage();
  }

  loadState();
});

// ----------------------
// LOGIN
// ----------------------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    await auth.signInWithEmailAndPassword(
      loginUsername.value.trim(),
      loginPassword.value
    );
  } catch (err) {
    loginError.textContent = err.message;
  }
});

// ----------------------
// REGISTER (DEFAULT: STUDENT)
// ----------------------
document.getElementById("registerBtn").addEventListener("click", async () => {
  const email = loginUsername.value.trim();
  const password = loginPassword.value;

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection("users").doc(userCred.user.uid).set({
      email,
      role: "student"
    });

    alert("Account created!");
  } catch (err) {
    alert(err.message);
  }
});

// ----------------------
// LOGOUT
// ----------------------
logoutButton.addEventListener("click", () => auth.signOut());
studentLogout.addEventListener("click", () => auth.signOut());

// ----------------------
// SHOW SCREENS
// ----------------------
function showLogin() {
  loginScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
  studentPage.classList.add("hidden");
}

function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  studentPage.classList.add("hidden");
}

function showStudentPage() {
  loginScreen.classList.add("hidden");
  appShell.classList.add("hidden");
  studentPage.classList.remove("hidden");

  renderStudentCalendar();
}

// ----------------------
// LOAD + SAVE STATE
// ----------------------
async function loadState() {
  if (!window.currentUser) return;

  const doc = await db.collection("attendanceData")
    .doc(window.currentUser.uid)
    .get();

  if (doc.exists) {
    state = doc.data().state;
  }
}

async function saveState() {
  if (!window.currentUser) return;

  await db.collection("attendanceData")
    .doc(window.currentUser.uid)
    .set({ state });
}

// ----------------------
// STUDENT CALENDAR
// ----------------------
function renderStudentCalendar() {
  const calendar = document.getElementById("calendar");
  const percentBox = document.getElementById("attendancePercent");

  calendar.innerHTML = "";

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const days = new Date(year, month + 1, 0).getDate();

  let present = 0;
  let total = 0;

  for (let d = 1; d <= days; d++) {
    const div = document.createElement("div");
    div.textContent = d;

    const status = state.attendance?.[d];

    if (status === "present") {
      div.style.background = "green";
      present++;
      total++;
    } else if (status === "late") {
      div.style.background = "yellow";
      present++;
      total++;
    } else if (status === "absent") {
      div.style.background = "red";
      total++;
    }

    calendar.appendChild(div);
  }

  const percent = total ? (present / total) * 100 : 0;

  percentBox.textContent = `Financial Assistance: ${percent.toFixed(2)}%`;
}