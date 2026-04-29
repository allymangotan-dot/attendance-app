window.currentUser = {
  uid: "teacher-demo-user"
};const STORAGE_KEY = "seat-attendance-v2";
const OLD_STORAGE_KEY = "seat-attendance-v1";
const SHARE_DURATION_MS = 5 * 60 * 1000;

const sampleLearners = [
  { id: "ana-cruz", name: "Ana Cruz", gender: "F" },
  { id: "ben-santos", name: "Ben Santos", gender: "M" },
  { id: "celia-reyes", name: "Celia Reyes", gender: "F" },
  { id: "daniel-garcia", name: "Daniel Garcia", gender: "M" },
  { id: "ella-ramos", name: "Ella Ramos", gender: "F" },
  { id: "francis-lim", name: "Francis Lim", gender: "M" },
  { id: "grace-dela-cruz", name: "Grace Dela Cruz", gender: "F" },
  { id: "henry-aquino", name: "Henry Aquino", gender: "M" },
  { id: "ivy-mendoza", name: "Ivy Mendoza", gender: "F" },
  { id: "joshua-flores", name: "Joshua Flores", gender: "M" },
  { id: "katrina-lopez", name: "Katrina Lopez", gender: "F" },
  { id: "luis-navarro", name: "Luis Navarro", gender: "M" }
];

const defaultSection = {
  id: "grade-6-section-a",
  name: "Grade 6 - Section A",
  learners: sampleLearners
};

const defaultState = {
  selectedSectionId: defaultSection.id,
  sections: [defaultSection],
  attendance: {},
  dayTypes: {},
  checkers: {},
  credentials: {
    username: "teacher",
    password: "class123"
  }
};

let state = loadState();
async function loadFromFirebase() {
  if (!window.currentUser) return;

  try {
    const doc = await db.collection("attendanceData")
      .doc(window.currentUser.uid)
      .get();

    if (doc.exists) {
      state = normalizeState(doc.data().state);
      render();
      console.log("Loaded from Firebase");
    }
  } catch (e) {
    console.error("Firebase load error:", e);
  }
}
let activeLearnerId = null;
let guestAccess = readGuestAccess();
let guestExpiryTimer = null;
let syncChannel = null;
let isApplyingRemoteState = false;

const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const loginUsername = document.querySelector("#loginUsername");
const loginPassword = document.querySelector("#loginPassword");
const loginError = document.querySelector("#loginError");
const logoutButton = document.querySelector("#logoutButton");
const classTitle = document.querySelector("#classTitle");
const sectionSelect = document.querySelector("#sectionSelect");
const attendanceDate = document.querySelector("#attendanceDate");
const dayTypeSelect = document.querySelector("#dayTypeSelect");
const recordMonth = document.querySelector("#recordMonth");
const checkerName = document.querySelector("#checkerName");
const seatPlan = document.querySelector("#seatPlan");
const presentCount = document.querySelector("#presentCount");
const lateCount = document.querySelector("#lateCount");
const absentCount = document.querySelector("#absentCount");
const excusedCount = document.querySelector("#excusedCount");
const femaleCount = document.querySelector("#femaleCount");
const maleCount = document.querySelector("#maleCount");
const presentList = document.querySelector("#presentList");
const absentList = document.querySelector("#absentList");
const monthlyRecords = document.querySelector("#monthlyRecords");
const dailyChart = document.querySelector("#dailyChart");
const monthlyChart = document.querySelector("#monthlyChart");
const smartInsights = document.querySelector("#smartInsights");
const qrSessionText = document.querySelector("#qrSessionText");
const qrCodeBox = document.querySelector("#qrCodeBox");
const createQrButton = document.querySelector("#createQrButton");
const printQrButton = document.querySelector("#printQrButton");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const statusDialog = document.querySelector("#statusDialog");
const statusLearnerName = document.querySelector("#statusLearnerName");
const lateTimeInput = document.querySelector("#lateTimeInput");
const reasonInput = document.querySelector("#reasonInput");
const classNameInput = document.querySelector("#classNameInput");
const teacherUsernameInput = document.querySelector("#teacherUsernameInput");
const teacherPasswordInput = document.querySelector("#teacherPasswordInput");
const learnerEditor = document.querySelector("#learnerEditor");
const saveLearners = document.querySelector("#saveLearners");
const resetSample = document.querySelector("#resetSample");
const addSection = document.querySelector("#addSection");
const deleteSection = document.querySelector("#deleteSection");
const markAllPresent = document.querySelector("#markAllPresent");
const clearAttendance = document.querySelector("#clearAttendance");
const createShareLinks = document.querySelector("#createShareLinks");
const shareLinkOne = document.querySelector("#shareLinkOne");
const shareLinkTwo = document.querySelector("#shareLinkTwo");
const shareExpiry = document.querySelector("#shareExpiry");
const homeButton = document.querySelector("#homeButton");
const bottomSaveButton = document.querySelector("#bottomSaveButton");
const saveToast = document.querySelector("#saveToast");

attendanceDate.value = new Date().toISOString().slice(0, 10);
recordMonth.value = attendanceDate.value.slice(0, 7);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return structuredClone(defaultState);
    }
  }

  const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);
  if (!oldSaved) return structuredClone(defaultState);

  try {
    const old = JSON.parse(oldSaved);
    return normalizeState({
      selectedSectionId: defaultSection.id,
      sections: [
        {
          id: defaultSection.id,
          name: old.className || defaultSection.name,
          learners: old.learners || sampleLearners
        }
      ],
      attendance: { [defaultSection.id]: migrateAttendance(old.attendance || {}) },
      checkers: {}
    });
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(value) {
  const sections = Array.isArray(value.sections) && value.sections.length ? value.sections : [defaultSection];
  const selectedSectionId = sections.some((section) => section.id === value.selectedSectionId)
    ? value.selectedSectionId
    : sections[0].id;

  return {
    selectedSectionId,
    sections: sections.map((section) => ({
      id: section.id || createId(section.name || "section"),
      name: section.name || "New Section",
      learners: Array.isArray(section.learners) && section.learners.length ? section.learners : []
    })),
    attendance: value.attendance || {},
    dayTypes: value.dayTypes || {},
    checkers: value.checkers || {},
    credentials: {
      username: value.credentials?.username || defaultState.credentials.username,
      password: value.credentials?.password || defaultState.credentials.password
    }
  };
}

function migrateAttendance(attendance) {
  return Object.fromEntries(
    Object.entries(attendance).map(([date, records]) => [
      date,
      Object.fromEntries(
        Object.entries(records || {}).map(([id, isPresent]) => [
          id,
          isPresent ? { status: "present", time: "", reason: "" } : { status: "unmarked", time: "", reason: "" }
        ])
      )
    ])
  );
}

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  // 🔥 SAVE TO FIREBASE
  if (window.currentUser) {
    try {
      await db.collection("attendanceData").doc(window.currentUser.uid).set({
        state: state,
        updatedAt: new Date()
      });
    } catch (e) {
      console.error("Firebase save error:", e);
    }
  }

  if (!isApplyingRemoteState) publishState();
}
function isLoggedIn() {
  return sessionStorage.getItem("teacherLoggedIn") === "yes";
}

function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("locked");
   loadFromFirebase();

  document.body.classList.toggle("guest-mode", Boolean(guestAccess));
  logoutButton.querySelector("span").textContent = guestAccess ? "Exit" : "Lock";
  startGuestExpiryTimer();
  startLiveSync();
  render();
}

function showLogin() {
  guestAccess = null;
  stopGuestExpiryTimer();
  appShell.classList.add("locked");
  loginScreen.classList.remove("hidden");
  document.body.classList.remove("guest-mode");
  loginUsername.value = state.credentials.username;
  loginPassword.value = "";
  loginError.textContent = "";
  loginPassword.focus();
}

function readGuestAccess() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#guest=")) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(hash.slice(7)));
    if (!payload.expires || Date.now() > payload.expires || !payload.state) return { expired: true };
    state = normalizeState(payload.state);
    return {
      token: payload.token || createId("guest"),
      expires: payload.expires
    };
  } catch {
    return { expired: true };
  }
}

function startGuestExpiryTimer() {
  stopGuestExpiryTimer();
  if (!guestAccess || guestAccess.expired) return;

  const remaining = guestAccess.expires - Date.now();
  if (remaining <= 0) {
    expireGuestAccess();
    return;
  }

  guestExpiryTimer = window.setTimeout(expireGuestAccess, remaining);
}

function stopGuestExpiryTimer() {
  if (guestExpiryTimer) window.clearTimeout(guestExpiryTimer);
  guestExpiryTimer = null;
}

function expireGuestAccess() {
  sessionStorage.removeItem("teacherLoggedIn");
  window.location.hash = "";
  showLogin();
  loginError.textContent = "The guest edit link has expired. Please ask the teacher for a new link.";
}

function createGuestLink() {
  const payload = {
    token: createId("share"),
    expires: Date.now() + SHARE_DURATION_MS,
    state: sharedState()
  };
  const base = window.location.href.split("#")[0];
  return `${base}#guest=${encodeBase64Url(JSON.stringify(payload))}`;
}

function sharedState() {
  return {
    selectedSectionId: state.selectedSectionId,
    sections: state.sections,
    attendance: state.attendance,
    dayTypes: state.dayTypes,
    checkers: state.checkers
  };
}

function encodeBase64Url(value) {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return decodeURIComponent(escape(atob(padded)));
}

function startLiveSync() {
  if (syncChannel || !("BroadcastChannel" in window)) return;
  syncChannel = new BroadcastChannel("seat-attendance-live-sync");
  syncChannel.addEventListener("message", (event) => {
    if (!event.data || event.data.source === getSyncSource() || event.data.type !== "state-update") return;
    isApplyingRemoteState = true;
    state = normalizeState(event.data.state);
    render();
    isApplyingRemoteState = false;
  });
}

function publishState() {
  if (!syncChannel) return;
  syncChannel.postMessage({
    type: "state-update",
    source: getSyncSource(),
    state
  });
}

function getSyncSource() {
  if (!sessionStorage.getItem("syncSource")) sessionStorage.setItem("syncSource", createId("source"));
  return sessionStorage.getItem("syncSource");
}

function currentSection() {
  return state.sections.find((section) => section.id === state.selectedSectionId) || state.sections[0];
}

function currentDateKey() {
  return attendanceDate.value;
}

function currentMonthKey() {
  return recordMonth.value;
}

function weekKey() {
  return weekKeyForDate(currentSection().id, currentDateKey());
}

function weekKeyForDate(sectionId, dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${sectionId}-${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function sectionAttendance(sectionId = currentSection().id) {
  if (!state.attendance[sectionId]) state.attendance[sectionId] = {};
  return state.attendance[sectionId];
}

function sectionDayTypes(sectionId = currentSection().id) {
  if (!state.dayTypes[sectionId]) state.dayTypes[sectionId] = {};
  return state.dayTypes[sectionId];
}

function currentDayType() {
  return sectionDayTypes()[currentDateKey()] || "regular";
}

function setCurrentDayType(value) {
  sectionDayTypes()[currentDateKey()] = value;
}

function currentAttendance() {
  const attendance = sectionAttendance();
  const key = currentDateKey();
  if (!attendance[key]) attendance[key] = {};
  return attendance[key];
}

function getRecord(learnerId) {
  return currentAttendance()[learnerId] || { status: "unmarked", time: "", reason: "" };
}

function setRecord(learnerId, record) {
  currentAttendance()[learnerId] = { status: record.status, time: record.time || "", reason: record.reason || "" };
  render();
}

function render() {
  if (guestAccess?.expired || (guestAccess && Date.now() > guestAccess.expires)) {
    expireGuestAccess();
    return;
  }
  const section = currentSection();
  classTitle.textContent = section.name;
  renderSections();
  renderDayType();
  renderChecker();
  renderSeatPlan(section);
  renderTotals(section);
  renderDashboard(section);
  renderMonthlyRecords();
  renderShareStatus();
  saveState();
}

function renderShareStatus() {
  if (!guestAccess) return;
  const seconds = Math.max(0, Math.ceil((guestAccess.expires - Date.now()) / 1000));
  shareExpiry.textContent = `Guest access expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.`;
}

function renderDayType() {
  dayTypeSelect.value = currentDayType();
  document.body.dataset.dayType = currentDayType();
}

function renderSections() {
  sectionSelect.innerHTML = "";
  state.sections.forEach((section) => {
    const option = document.createElement("option");
    option.value = section.id;
    option.textContent = section.name;
    sectionSelect.appendChild(option);
  });
  sectionSelect.value = currentSection().id;
}

function renderChecker() {
  checkerName.value = state.checkers[weekKey()] || "";
}

function renderSeatPlan(section) {
  seatPlan.innerHTML = "";
  seatPlan.className = `seat-plan day-${currentDayType()}`;
  const sectionIndex = state.sections.findIndex((item) => item.id === section.id);

  Array.from({ length: 64 }).forEach((_, index) => {
    const learner = section.learners[index];
    if (!learner) {
      const emptySeat = document.createElement("div");
      emptySeat.className = "seat empty-seat";
      emptySeat.innerHTML = `<span class="seat-number">${index + 1}</span>`;
      seatPlan.appendChild(emptySeat);
      return;
    }

    const record = getRecord(learner.id);
    const learnerCode = learnerNumber(sectionIndex, index);
    const seat = document.createElement("button");
    seat.className = `seat ${record.status}`;
    seat.type = "button";
    seat.innerHTML = `
      <span class="learner-code">${learnerCode}</span>
      <span class="seat-name">${escapeHtml(learner.name)}</span>
      <span class="seat-meta">
        <span class="gender ${learner.gender}">${learner.gender}</span>
        <span class="status">${statusLabel(record)}</span>
      </span>
      ${record.time ? `<span class="seat-note">Arrived ${escapeHtml(toClockTime(record.time))}</span>` : ""}
      ${record.reason ? `<span class="seat-note">${escapeHtml(record.reason)}</span>` : ""}
    `;
    seat.addEventListener("click", () => openStatusDialog(learner.id));
    seatPlan.appendChild(seat);
  });
}

function renderTotals(section) {
  const learners = section.learners;
  const records = learners.map((learner) => ({ learner, record: getRecord(learner.id) }));
  const isNonMeetingDay = isNonMeetingDayType(currentDayType());
  const attendees = records.filter(({ record }) => ["present", "late"].includes(record.status));
  const late = records.filter(({ record }) => record.status === "late");
  const absent = isNonMeetingDay ? [] : records.filter(({ record }) => ["absent", "unmarked"].includes(record.status));
  const excused = records.filter(({ record }) => record.status === "excused");

  presentCount.textContent = attendees.length;
  lateCount.textContent = late.length;
  absentCount.textContent = absent.length;
  excusedCount.textContent = excused.length;
  femaleCount.textContent = attendees.filter(({ learner }) => learner.gender === "F").length;
  maleCount.textContent = attendees.filter(({ learner }) => learner.gender === "M").length;

  renderList(presentList, attendees, isNonMeetingDay ? `${dayTypeLabel(currentDayType())} marked. No attendees required.` : "No learners marked present.", true);
  renderList(absentList, [...absent, ...excused], isNonMeetingDay ? `${dayTypeLabel(currentDayType())} marked. No absences counted.` : "No absent or excused learners.", false);
}

function renderList(list, rows, emptyText, showLateTime) {
  list.innerHTML = "";
  if (!rows.length) {
    const item = document.createElement("li");
    item.textContent = emptyText;
    list.appendChild(item);
    return;
  }

  rows.forEach(({ learner, record }) => {
    const item = document.createElement("li");
    const sectionIndex = state.sections.findIndex((section) => section.id === currentSection().id);
    const learnerIndex = currentSection().learners.findIndex((item) => item.id === learner.id);
    const learnerCode = learnerNumber(sectionIndex, learnerIndex);
    const details = [];
    if (showLateTime && record.status === "late" && record.time) details.push(`arrived ${toClockTime(record.time)}`);
    if (!showLateTime && record.reason) details.push(record.reason);
    item.textContent = `${learnerCode} - ${learner.name} (${learner.gender}) - ${statusLabel(record)}${details.length ? `: ${details.join(", ")}` : ""}`;
    list.appendChild(item);
  });
}

function renderMonthlyRecords() {
  const section = currentSection();
  const month = currentMonthKey();
  const attendance = sectionAttendance(section.id);
  const dates = monthRecordDates(section.id, month);

  monthlyRecords.innerHTML = "";
  if (!dates.length) {
    monthlyRecords.innerHTML = `<p class="empty-record">No attendance saved for this month yet.</p>`;
    return;
  }

  dates.forEach((date) => {
    const records = attendance[date] || {};
    const dayType = dayTypeForDate(section.id, date);
    const rows = section.learners.map((learner) => ({ learner, record: records[learner.id] || { status: "unmarked" } }));
    const present = rows.filter(({ record }) => ["present", "late"].includes(record.status)).length;
    const late = rows.filter(({ record }) => record.status === "late").length;
    const absent = isNonMeetingDayType(dayType) ? 0 : rows.filter(({ record }) => ["absent", "unmarked"].includes(record.status)).length;
    const excused = rows.filter(({ record }) => record.status === "excused").length;
    const checker = state.checkers[weekKeyForDate(section.id, date)] || "";
    const sectionIndex = state.sections.findIndex((item) => item.id === section.id);
    const absentNames = rows
      .filter(({ record }) => ["absent", "unmarked", "excused"].includes(record.status))
      .map(({ learner, record }) => {
        const learnerIndex = section.learners.findIndex((item) => item.id === learner.id);
        return `${learnerNumber(sectionIndex, learnerIndex)} ${learner.name} - ${statusLabel(record)}`;
      })
      .join("; ");

    const article = document.createElement("article");
    article.className = "record-card";
    article.innerHTML = `
      <strong>${formatDate(date)} - ${dayTypeLabel(dayType)}</strong>
      <div class="record-tallies">
        <span>Present ${present}</span>
        <span>Late ${late}</span>
        <span>Absent ${absent}</span>
        <span>Excused ${excused}</span>
      </div>
      ${checker ? `<p>Checker: ${escapeHtml(checker)}</p>` : ""}
      <p>${isNonMeetingDayType(dayType) ? `${dayTypeLabel(dayType)} marked. Absences are not counted.` : absentNames ? escapeHtml(absentNames) : "No absent or excused learners."}</p>
    `;
    monthlyRecords.appendChild(article);
  });
}

function renderDashboard(section) {
  const todayRows = isNonMeetingDayType(currentDayType()) ? [] : statusRowsForDate(section, currentDateKey());
  const todayCounts = countStatuses(todayRows);
  const monthRows = Object.keys(sectionAttendance(section.id))
    .filter((date) => date.startsWith(currentMonthKey()) && !isNonMeetingDayType(dayTypeForDate(section.id, date)))
    .flatMap((date) => statusRowsForDate(section, date));
  const monthCounts = countStatuses(monthRows);

  drawBarChart(dailyChart, [
    { label: "Present", value: todayCounts.present, color: "#14b8a6" },
    { label: "Late", value: todayCounts.late, color: "#f59e0b" },
    { label: "Absent", value: todayCounts.absent, color: "#fb7185" },
    { label: "Excused", value: todayCounts.excused, color: "#8b5cf6" }
  ]);

  drawBarChart(monthlyChart, [
    { label: "Present", value: monthCounts.present, color: "#14b8a6" },
    { label: "Late", value: monthCounts.late, color: "#f59e0b" },
    { label: "Absent", value: monthCounts.absent, color: "#fb7185" },
    { label: "Excused", value: monthCounts.excused, color: "#8b5cf6" }
  ]);

  renderSmartInsights(section);
  renderQrSession();
}

function statusRowsForDate(section, date) {
  const records = sectionAttendance(section.id)[date] || {};
  return section.learners.map((learner) => ({
    learner,
    record: records[learner.id] || { status: "unmarked", time: "", reason: "" }
  }));
}

function countStatuses(rows) {
  return rows.reduce(
    (counts, { record }) => {
      if (record.status === "present") counts.present += 1;
      else if (record.status === "late") counts.late += 1;
      else if (record.status === "excused") counts.excused += 1;
      else counts.absent += 1;
      return counts;
    },
    { present: 0, late: 0, absent: 0, excused: 0 }
  );
}

function drawBarChart(canvas, data) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 34;
  const chartHeight = height - 72;
  const max = Math.max(1, ...data.map((item) => item.value));
  const barWidth = (width - padding * 2) / data.length - 14;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#e5e7eb";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding, height - 48);
  context.lineTo(width - padding, height - 48);
  context.stroke();

  data.forEach((item, index) => {
    const x = padding + index * (barWidth + 14);
    const barHeight = (item.value / max) * chartHeight;
    const y = height - 48 - barHeight;
    context.fillStyle = item.color;
    roundRect(context, x, y, barWidth, barHeight, 8);
    context.fill();
    context.fillStyle = "#1f2937";
    context.font = "700 18px Arial";
    context.textAlign = "center";
    context.fillText(item.value, x + barWidth / 2, Math.max(22, y - 8));
    context.font = "700 11px Arial";
    context.fillText(item.label, x + barWidth / 2, height - 22);
  });
}

function roundRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function renderSmartInsights(section) {
  smartInsights.innerHTML = "";
  const attendance = sectionAttendance(section.id);
  const monthStats = monthlyDayStats(section.id, currentMonthKey());
  const statsItem = document.createElement("li");
  statsItem.textContent = `${monthName(currentMonthKey())}: ${monthStats.schoolDays} school days and ${monthStats.holidays} marked holidays.`;
  smartInsights.appendChild(statsItem);

  const riskyLearners = section.learners
    .map((learner) => {
      const absentDates = Object.entries(attendance)
        .filter(([date, records]) => {
          if (isNonMeetingDayType(dayTypeForDate(section.id, date))) return false;
          const status = records?.[learner.id]?.status || "unmarked";
          return status === "absent" || status === "unmarked";
        })
        .map(([date]) => date)
        .sort();
      return { learner, absentDates };
    })
    .filter(({ absentDates }) => absentDates.length >= 5)
    .sort((a, b) => b.absentDates.length - a.absentDates.length);

  if (!riskyLearners.length) {
    const item = document.createElement("li");
    item.textContent = "No learner has reached 5 absences yet.";
    smartInsights.appendChild(item);
    return;
  }

  riskyLearners.forEach(({ learner, absentDates }) => {
    const item = document.createElement("li");
    const sectionIndex = state.sections.findIndex((sectionItem) => sectionItem.id === section.id);
    const learnerIndex = section.learners.findIndex((sectionLearner) => sectionLearner.id === learner.id);
    const latest = absentDates.slice(-3).map(formatDate).join(", ");
    item.textContent = `${learnerNumber(sectionIndex, learnerIndex)} - ${learner.name} has ${absentDates.length} absences. Consider home visitation. Recent: ${latest}.`;
    smartInsights.appendChild(item);
  });
}

function dayTypeForDate(sectionId, date) {
  return state.dayTypes?.[sectionId]?.[date] || "regular";
}

function dayTypeLabel(value) {
  const labels = {
    regular: "Regular Class",
    holiday: "Holiday",
    suspended: "Classes Suspended",
    asynchronous: "Asynchronous",
    online: "Online Class"
  };
  return labels[value] || labels.regular;
}

function monthRecordDates(sectionId, month) {
  const attendanceDates = Object.keys(sectionAttendance(sectionId));
  const dayTypeDates = Object.keys(sectionDayTypes(sectionId));
  return [...new Set([...attendanceDates, ...dayTypeDates])].filter((date) => date.startsWith(month)).sort();
}

function monthlyDayStats(sectionId, month) {
  return monthRecordDates(sectionId, month).reduce(
    (stats, date) => {
      if (isNonMeetingDayType(dayTypeForDate(sectionId, date))) stats.holidays += 1;
      else stats.schoolDays += 1;
      return stats;
    },
    { schoolDays: 0, holidays: 0 }
  );
}

function isNonMeetingDayType(value) {
  return value === "holiday" || value === "suspended";
}

function monthName(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: "long", year: "numeric" });
}

function currentQrCodeText() {
  const sectionIndex = state.sections.findIndex((section) => section.id === currentSection().id);
  const sectionCode = sectionLetter(sectionIndex);
  const dateCode = currentDateKey().replaceAll("-", "").slice(2);
  return `ATT${sectionCode}${dateCode}`;
}

function renderQrSession() {
  qrSessionText.textContent = `${currentSection().name} - ${formatDate(currentDateKey())} - Code: ${currentQrCodeText()}`;
  drawQrCode(qrCodeBox, currentQrCodeText());
}

function drawQrCode(container, text) {
  const matrix = makeQrMatrix(text.slice(0, 17));
  const scale = 8;
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  let cells = `<rect width="${size * scale}" height="${size * scale}" fill="#ffffff"/>`;

  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells += `<rect x="${(x + quiet) * scale}" y="${(y + quiet) * scale}" width="${scale}" height="${scale}" fill="#1f2937"/>`;
    });
  });

  container.innerHTML = `<svg class="qr-svg" viewBox="0 0 ${size * scale} ${size * scale}" role="img" aria-label="QR code for ${escapeHtml(text)}">${cells}</svg>`;
}

function makeQrMatrix(text) {
  const size = 21;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));

  placeFinder(modules, reserved, 0, 0);
  placeFinder(modules, reserved, size - 7, 0);
  placeFinder(modules, reserved, 0, size - 7);
  placeTiming(modules, reserved);
  modules[13][8] = true;
  reserved[13][8] = true;
  reserveFormatAreas(reserved);

  const dataBits = makeDataBits(text);
  placeDataBits(modules, reserved, dataBits);
  applyMask(modules, reserved);
  placeFormatBits(modules, reserved);
  return modules;
}

function placeFinder(modules, reserved, x, y) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const row = y + dy;
      const col = x + dx;
      if (row < 0 || row >= modules.length || col < 0 || col >= modules.length) continue;
      reserved[row][col] = true;
      const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      modules[row][col] = inFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
    }
  }
}

function placeTiming(modules, reserved) {
  for (let i = 8; i < 13; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
    reserved[6][i] = true;
    reserved[i][6] = true;
  }
}

function reserveFormatAreas(reserved) {
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][20 - i] = true;
    reserved[20 - i][8] = true;
  }
}

function makeDataBits(text) {
  const bytes = [...text].map((char) => char.charCodeAt(0) & 0xff);
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, 152 - bits.length));
  while (bits.length % 8) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bitsToByte(bits.slice(i, i + 8)));
  for (let pad = 0xec; data.length < 19; pad = pad === 0xec ? 0x11 : 0xec) data.push(pad);
  const ecc = reedSolomon(data, 7);
  return [...data, ...ecc].flatMap((byte) => byteToBits(byte));
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function bitsToByte(bits) {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}

function byteToBits(byte) {
  return Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1);
}

function reedSolomon(data, degree) {
  const generator = rsGenerator(degree);
  const result = Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    generator.forEach((coefficient, index) => {
      result[index] ^= gfMul(coefficient, factor);
    });
  });
  return result;
}

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = Array(poly.length + 1).fill(0);
    poly.forEach((coefficient, index) => {
      next[index] ^= gfMul(coefficient, 1);
      next[index + 1] ^= gfMul(coefficient, gfPow(2, i));
    });
    poly = next;
  }
  return poly.slice(1);
}

function gfMul(a, b) {
  let result = 0;
  for (; b; b >>>= 1) {
    if (b & 1) result ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return result;
}

function gfPow(value, power) {
  let result = 1;
  for (let i = 0; i < power; i++) result = gfMul(result, value);
  return result;
}

function placeDataBits(modules, reserved, bits) {
  let bitIndex = 0;
  let upward = true;
  for (let right = 20; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < 21; vertical++) {
      const row = upward ? 20 - vertical : vertical;
      for (let col = right; col >= right - 1; col--) {
        if (reserved[row][col]) continue;
        modules[row][col] = Boolean(bits[bitIndex++] || 0);
      }
    }
    upward = !upward;
  }
}

function applyMask(modules, reserved) {
  for (let row = 0; row < modules.length; row++) {
    for (let col = 0; col < modules.length; col++) {
      if (!reserved[row][col] && (row + col) % 2 === 0) modules[row][col] = !modules[row][col];
    }
  }
}

function placeFormatBits(modules, reserved) {
  const bits = "111011111000100".split("").map((bit) => bit === "1");
  const first = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  const second = [
    [20, 8], [19, 8], [18, 8], [17, 8], [16, 8], [15, 8], [14, 8],
    [8, 13], [8, 14], [8, 15], [8, 16], [8, 17], [8, 18], [8, 19], [8, 20]
  ];
  first.forEach(([row, col], index) => {
    modules[row][col] = bits[index];
    reserved[row][col] = true;
  });
  second.forEach(([row, col], index) => {
    modules[row][col] = bits[index];
    reserved[row][col] = true;
  });
}

function openStatusDialog(learnerId) {
  activeLearnerId = learnerId;
  const learner = currentSection().learners.find((item) => item.id === learnerId);
  const record = getRecord(learnerId);
  statusLearnerName.textContent = learner?.name || "Learner";
  lateTimeInput.value = record.time || "";
  reasonInput.value = record.reason || "";
  statusDialog.showModal();
}

function statusLabel(record) {
  const labels = {
    present: "Present",
    late: "Late",
    absent: "Absent",
    excused: "Excused",
    unmarked: "Absent"
  };
  return labels[record.status] || "Absent";
}

function applyStatus(status) {
  if (!activeLearnerId) return;
  setRecord(activeLearnerId, {
    status,
    time: status === "late" ? lateTimeInput.value : "",
    reason: ["absent", "excused"].includes(status) ? reasonInput.value.trim() : ""
  });
  statusDialog.close();
}

function parseLearners(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",");
      const gender = (parts.pop() || "").trim().toUpperCase();
      const name = parts.join(",").trim();
      if (!name || !["F", "M"].includes(gender)) return null;
      const existing = currentSection().learners.find((learner) => learner.name.toLowerCase() === name.toLowerCase());
      return {
        id: existing?.id || createId(name),
        name,
        gender
      };
    })
    .filter(Boolean);
}

function learnersToText(learners) {
  return learners.map((learner) => `${learner.name}, ${learner.gender}`).join("\n");
}

function learnerNumber(sectionIndex, learnerIndex) {
  const letter = sectionLetter(sectionIndex);
  return `${letter}${String(Math.max(0, learnerIndex) + 1).padStart(2, "0")}`;
}

function sectionLetter(index) {
  let value = Math.max(0, index);
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function createId(value) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function toClockTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

settingsButton.addEventListener("click", () => {
  classNameInput.value = currentSection().name;
  teacherUsernameInput.value = state.credentials.username;
  teacherPasswordInput.value = state.credentials.password;
  learnerEditor.value = learnersToText(currentSection().learners);
  settingsDialog.showModal();
});

saveLearners.addEventListener("click", (event) => {
  event.preventDefault();
  const learners = parseLearners(learnerEditor.value);
  if (!learners.length) {
    learnerEditor.setCustomValidity("Please enter at least one learner using Name, F or Name, M.");
    learnerEditor.reportValidity();
    return;
  }
  learnerEditor.setCustomValidity("");
  currentSection().name = classNameInput.value.trim() || "New Section";
  currentSection().learners = learners;
  state.credentials.username = teacherUsernameInput.value.trim() || defaultState.credentials.username;
  state.credentials.password = teacherPasswordInput.value || defaultState.credentials.password;
  settingsDialog.close();
  render();
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const usernameMatches = loginUsername.value.trim() === state.credentials.username;
  const passwordMatches = loginPassword.value === state.credentials.password;

  if (!usernameMatches || !passwordMatches) {
    loginError.textContent = "Username or password is incorrect.";
    loginPassword.value = "";
    loginPassword.focus();
    return;
  }

  sessionStorage.setItem("teacherLoggedIn", "yes");
  showApp();
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem("teacherLoggedIn");
  window.location.hash = "";
  showLogin();
});

addSection.addEventListener("click", () => {
  const sectionNumber = state.sections.length + 1;
  const section = {
    id: createId(`grade-section-${sectionNumber}`),
    name: `Grade ${sectionNumber} - Section`,
    learners: []
  };
  state.sections.push(section);
  state.selectedSectionId = section.id;
  classNameInput.value = section.name;
  learnerEditor.value = "";
  render();
});

deleteSection.addEventListener("click", () => {
  if (state.sections.length === 1) return;
  const id = currentSection().id;
  state.sections = state.sections.filter((section) => section.id !== id);
  delete state.attendance[id];
  state.selectedSectionId = state.sections[0].id;
  settingsDialog.close();
  render();
});

resetSample.addEventListener("click", () => {
  learnerEditor.value = learnersToText(sampleLearners);
});

sectionSelect.addEventListener("change", () => {
  state.selectedSectionId = sectionSelect.value;
  render();
});

attendanceDate.addEventListener("change", () => {
  recordMonth.value = attendanceDate.value.slice(0, 7);
  render();
});

recordMonth.addEventListener("change", render);

dayTypeSelect.addEventListener("change", () => {
  setCurrentDayType(dayTypeSelect.value);
  render();
});

checkerName.addEventListener("input", () => {
  state.checkers[weekKey()] = checkerName.value.trim();
  saveState();
});

createShareLinks.addEventListener("click", async () => {
  const firstLink = createGuestLink();
  const secondLink = createGuestLink();
  shareLinkOne.value = firstLink;
  shareLinkTwo.value = secondLink;
  shareExpiry.textContent = "The two guest links will expire 5 minutes from now.";
  await copyText(`${firstLink}\n\n${secondLink}`);
  showToast("Two guest links created and copied.");
});

createQrButton.addEventListener("click", () => {
  renderQrSession();
  showToast("QR attendance code created.");
});

printQrButton.addEventListener("click", () => {
  renderQrSession();
  window.print();
});

homeButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

bottomSaveButton.addEventListener("click", () => {
  saveState();
  showToast("Attendance data saved.");
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.closeDialog}`)?.close();
  });
});

function showToast(message) {
  saveToast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    saveToast.textContent = "";
  }, 2500);
}

async function copyText(value) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Some file browsers block clipboard access. The links remain visible for manual copying.
  }
}

markAllPresent.addEventListener("click", () => {
  currentSection().learners.forEach((learner) => {
    currentAttendance()[learner.id] = { status: "present", time: "", reason: "" };
  });
  render();
});

clearAttendance.addEventListener("click", () => {
  sectionAttendance()[currentDateKey()] = {};
  render();
});

document.querySelector("#setPresent").addEventListener("click", () => applyStatus("present"));
document.querySelector("#setLate").addEventListener("click", () => applyStatus("late"));
document.querySelector("#setAbsent").addEventListener("click", () => applyStatus("absent"));
document.querySelector("#setExcused").addEventListener("click", () => applyStatus("excused"));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

if (guestAccess && !guestAccess.expired) {
  showApp();
} else if (guestAccess?.expired) {
  showLogin();
  loginError.textContent = "The guest edit link has expired. Please ask the teacher for a new link.";
} else if (isLoggedIn()) {
  showApp();
} else {
  showLogin();
}
db.collection("test").add({
  message: "Hello Firebase",
  time: new Date()
});