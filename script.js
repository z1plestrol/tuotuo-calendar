const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_DAYS_PER_YEAR = 73;
const GREGORIAN_DAYS_PER_NEW_DAY = 5;
const TUOTUO_EPOCH_YEAR = 2026;
const TASK_STORAGE_KEY = "tuotuo-calendar-tasks-v1";
const MIDNIGHT_REFRESH_BUFFER_MS = 1500;
const TUOTUO_GROUPS = [
  { name: "小木", start: 1, length: 24 },
  { name: "紫叶树", start: 25, length: 24 },
  { name: "大松树", start: 49, length: 25 },
];

const els = {
  dateInput: document.querySelector("#dateInput"),
  todayButton: document.querySelector("#todayButton"),
  prevDay: document.querySelector("#prevDay"),
  nextDay: document.querySelector("#nextDay"),
  currentKicker: document.querySelector("#currentKicker"),
  currentTitle: document.querySelector("#currentTitle"),
  currentRange: document.querySelector("#currentRange"),
  groupGrid: document.querySelector("#groupGrid"),
  seasonTitle: document.querySelector("#seasonTitle"),
  seasonGrid: document.querySelector("#seasonGrid"),
  toggleYearView: document.querySelector("#toggleYearView"),
  yearToggleText: document.querySelector("#yearToggleText"),
  yearTitle: document.querySelector("#yearTitle"),
  yearInput: document.querySelector("#yearInput"),
  prevYear: document.querySelector("#prevYear"),
  nextYear: document.querySelector("#nextYear"),
  yearGrid: document.querySelector("#yearGrid"),
  leapNote: document.querySelector("#leapNote"),
  taskOverlay: document.querySelector("#taskOverlay"),
  closeTaskEditor: document.querySelector("#closeTaskEditor"),
  taskDialogTitle: document.querySelector("#taskDialogTitle"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskNote: document.querySelector("#taskNote"),
  taskDates: document.querySelector("#taskDates"),
  clearTaskDates: document.querySelector("#clearTaskDates"),
  taskList: document.querySelector("#taskList"),
  deleteTask: document.querySelector("#deleteTask"),
  cancelTask: document.querySelector("#cancelTask"),
  saveTask: document.querySelector("#saveTask"),
};

let selectedDate = startOfDay(new Date());
let viewedYear = selectedDate.getFullYear();
let viewedGroupIndex = 0;
let yearExpanded = false;
let followToday = true;
let todayRefreshTimer = null;
let lastTodayKey = toInputDate(selectedDate);
let tasks = loadTasks();
let taskEditor = createEmptyTaskEditor();

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getToday() {
  return startOfDay(new Date());
}

function isSameDate(firstDate, secondDate) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function dayOfYear(date) {
  const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const utcStart = Date.UTC(date.getFullYear(), 0, 1);
  return Math.floor((utcDate - utcStart) / DAY_MS) + 1;
}

function dateFromDayOfYear(year, ordinal) {
  return new Date(year, 0, ordinal);
}

function daysBetween(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / DAY_MS);
}

function parseDateInput(value) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return startOfDay(new Date());
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShort(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTuotuoYear(gregorianYear) {
  const yearNumber = gregorianYear - TUOTUO_EPOCH_YEAR + 1;
  if (yearNumber > 0) return `拖拖历${yearNumber}年`;
  return `拖拖历前${TUOTUO_EPOCH_YEAR - gregorianYear}年`;
}

function formatCurrentRange(info) {
  if (info.leapExtra) return `${formatShort(info.date)} · 闰余日`;
  return `${formatShort(info.start)}-${formatShort(info.end)} · 第${info.phase}/5个公历日`;
}

function groupIndexForDay(day) {
  return TUOTUO_GROUPS.findIndex((group) => day >= group.start && day < group.start + group.length) + 1;
}

function groupIndexForInfo(info) {
  if (info.leapExtra || !info.newDay) return 0;
  return groupIndexForDay(info.newDay) - 1;
}

function getViewedGroup() {
  return TUOTUO_GROUPS[viewedGroupIndex] || TUOTUO_GROUPS[0];
}

function createEmptyTaskEditor() {
  return {
    open: false,
    editingId: null,
    selectedKeys: new Set(),
    draftKeys: new Set(),
    lastPickedKey: null,
    title: "",
    note: "",
  };
}

function loadTasks() {
  try {
    const rawTasks = localStorage.getItem(TASK_STORAGE_KEY);
    if (!rawTasks) return [];

    const parsedTasks = JSON.parse(rawTasks);
    if (!Array.isArray(parsedTasks)) return [];

    return parsedTasks
      .map((task) => ({
        id: typeof task.id === "string" ? task.id : makeTaskId(),
        title: typeof task.title === "string" ? task.title : "",
        note: typeof task.note === "string" ? task.note : "",
        dayKeys: Array.isArray(task.dayKeys) ? task.dayKeys.filter(isValidDayKey) : [],
        createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
        updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : new Date().toISOString(),
      }))
      .filter((task) => task.title.trim() && task.dayKeys.length);
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Browser storage can be disabled; the page still works for the current session.
  }
}

function makeTaskId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dayKey(year, day) {
  return `${year}-${String(day).padStart(2, "0")}`;
}

function parseDayKey(key) {
  const [yearText, dayText] = key.split("-");
  return {
    year: Number.parseInt(yearText, 10),
    day: Number.parseInt(dayText, 10),
  };
}

function isValidDayKey(key) {
  const { year, day } = parseDayKey(key);
  return Number.isInteger(year) && year > 0 && Number.isInteger(day) && day >= 1 && day <= NEW_DAYS_PER_YEAR;
}

function compareDayKeys(a, b) {
  const first = parseDayKey(a);
  const second = parseDayKey(b);
  if (first.year !== second.year) return first.year - second.year;
  return first.day - second.day;
}

function cloneDayKeys(keys) {
  return new Set([...keys].filter(isValidDayKey));
}

function firstSortedKey(keys) {
  return [...keys].sort(compareDayKeys)[0] || null;
}

function formatTaskKey(key) {
  const { year, day } = parseDayKey(key);
  const start = dateFromDayOfYear(year, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
  const end = dateFromDayOfYear(year, day * GREGORIAN_DAYS_PER_NEW_DAY);
  return `${formatTuotuoYear(year)} 第${day}日 · ${formatShort(start)}-${formatShort(end)}`;
}

function summarizeTaskDates(task) {
  const keys = [...task.dayKeys].sort(compareDayKeys);
  if (keys.length === 1) return formatTaskKey(keys[0]);
  if (keys.length === 2) return keys.map(formatTaskKey).join(" / ");
  return `${formatTaskKey(keys[0])} 等 ${keys.length} 个拖拖日`;
}

function tasksForDayKey(key) {
  return tasks.filter((task) => task.dayKeys.includes(key));
}

function tasksForSelectedDates() {
  return tasks.filter((task) => task.dayKeys.some((key) => taskEditor.selectedKeys.has(key)));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function convertDate(date) {
  const safeDate = startOfDay(date);
  const year = safeDate.getFullYear();
  const ordinal = dayOfYear(safeDate);
  const leapExtra = ordinal > NEW_DAYS_PER_YEAR * GREGORIAN_DAYS_PER_NEW_DAY;

  if (leapExtra) {
    const nextStart = new Date(year + 1, 0, 1);
    return {
      date: safeDate,
      year,
      ordinal,
      leapExtra: true,
      newDay: null,
      phase: null,
      start: safeDate,
      end: safeDate,
      nextStart,
      daysToNext: daysBetween(safeDate, nextStart),
      progress: 100,
    };
  }

  const newDay = Math.floor((ordinal - 1) / GREGORIAN_DAYS_PER_NEW_DAY) + 1;
  const phase = ((ordinal - 1) % GREGORIAN_DAYS_PER_NEW_DAY) + 1;
  const startOrdinal = (newDay - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1;
  const endOrdinal = newDay * GREGORIAN_DAYS_PER_NEW_DAY;
  const start = dateFromDayOfYear(year, startOrdinal);
  const end = dateFromDayOfYear(year, endOrdinal);
  const nextStart =
    newDay < NEW_DAYS_PER_YEAR
      ? dateFromDayOfYear(year, endOrdinal + 1)
      : new Date(year + 1, 0, 1);

  return {
    date: safeDate,
    year,
    ordinal,
    leapExtra: false,
    newDay,
    phase,
    start,
    end,
    nextStart,
    daysToNext: daysBetween(safeDate, nextStart),
    progress: ((newDay - 1 + phase / GREGORIAN_DAYS_PER_NEW_DAY) / NEW_DAYS_PER_YEAR) * 100,
  };
}

function renderCurrent(info) {
  els.currentKicker.textContent = info.leapExtra ? `${formatTuotuoYear(info.year)}闰余` : formatTuotuoYear(info.year);
  els.currentTitle.textContent = info.leapExtra ? "闰余日" : `第${info.newDay}日`;
  els.currentRange.textContent = formatCurrentRange(info);
}

function renderGroups(info) {
  els.groupGrid.innerHTML = "";

  TUOTUO_GROUPS.forEach((group, index) => {
    const endDay = group.start + group.length - 1;
    const startDate = dateFromDayOfYear(viewedYear, (group.start - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
    const endDate = dateFromDayOfYear(viewedYear, endDay * GREGORIAN_DAYS_PER_NEW_DAY);
    const selectedInGroup =
      !info.leapExtra && info.year === viewedYear && info.newDay >= group.start && info.newDay <= endDay;
    const isActive = selectedInGroup || (!selectedInGroup && index === viewedGroupIndex);
    const activeText = selectedInGroup ? `当前 · 第${info.newDay - group.start + 1}/${group.length}日` : `${group.length}天`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `group-card is-group-${index + 1}${isActive ? " is-active" : ""}`;
    button.dataset.group = String(index);
    button.setAttribute("aria-label", `选择${formatTuotuoYear(viewedYear)}${group.name}`);
    button.innerHTML = `
      <span class="group-name">${group.name}</span>
      <strong>第${group.start}-${endDay}日</strong>
      <span class="group-range">${formatShort(startDate)}-${formatShort(endDate)}</span>
      <span class="group-status">${activeText}</span>
    `;
    els.groupGrid.append(button);
  });
}

function createDayCard(day, info, todayInfo) {
  const start = dateFromDayOfYear(viewedYear, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
  const end = dateFromDayOfYear(viewedYear, day * GREGORIAN_DAYS_PER_NEW_DAY);
  const key = dayKey(viewedYear, day);
  const taskCount = tasksForDayKey(key).length;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `day-card is-season-${groupIndexForDay(day)}`;
  button.dataset.day = String(day);
  button.setAttribute("aria-label", `选择${formatTuotuoYear(viewedYear)}第 ${day} 日`);
  button.setAttribute("aria-pressed", taskEditor.open && taskEditor.selectedKeys.has(key) ? "true" : "false");
  button.innerHTML = `
    <strong>${day}</strong>
    <span class="day-range">${formatShort(start)} - ${formatShort(end)}</span>
    ${taskCount ? `<span class="task-mark" aria-label="${taskCount} 个日程">${taskCount}</span>` : ""}
  `;

  if (!info.leapExtra && info.year === viewedYear && info.newDay === day) {
    button.classList.add("is-selected");
  }

  if (!todayInfo.leapExtra && todayInfo.year === viewedYear && todayInfo.newDay === day) {
    button.classList.add("is-today");
  }

  if (taskEditor.open && taskEditor.selectedKeys.has(key)) {
    button.classList.add("is-editor-picked");
  }

  if (taskCount) {
    button.classList.add("has-tasks");
  }

  return button;
}

function renderSeasonGrid(info) {
  const group = getViewedGroup();
  const endDay = group.start + group.length - 1;
  const todayInfo = convertDate(new Date());
  els.seasonTitle.textContent = `${formatTuotuoYear(viewedYear)} · ${group.name}`;
  els.seasonGrid.setAttribute("aria-label", `${formatTuotuoYear(viewedYear)}${group.name}拖拖日网格`);
  els.seasonGrid.innerHTML = "";

  for (let day = group.start; day <= endDay; day += 1) {
    els.seasonGrid.append(createDayCard(day, info, todayInfo));
  }
}

function renderYearGrid(info) {
  els.yearTitle.textContent = formatTuotuoYear(viewedYear);
  els.yearInput.value = viewedYear;
  els.toggleYearView.setAttribute("aria-expanded", yearExpanded ? "true" : "false");
  els.toggleYearView.classList.toggle("is-expanded", yearExpanded);
  els.yearToggleText.textContent = yearExpanded ? "collapse" : "expand";

  if (!yearExpanded) {
    els.yearGrid.hidden = true;
    els.leapNote.hidden = true;
    els.yearGrid.innerHTML = "";
    return;
  }

  els.yearGrid.hidden = false;
  els.leapNote.hidden = false;
  els.yearGrid.innerHTML = "";

  const todayInfo = convertDate(new Date());
  for (let day = 1; day <= NEW_DAYS_PER_YEAR; day += 1) {
    els.yearGrid.append(createDayCard(day, info, todayInfo));
  }

  els.leapNote.textContent = isLeapYear(viewedYear)
    ? `闰年处理：${viewedYear} 年是闰年；12 月 31 日显示为闰余日，不占用 73 个拖拖日编号。`
    : `闰年处理：${viewedYear} 年有 365 天，刚好换算为 73 个拖拖日。`;
}

function render() {
  const info = convertDate(selectedDate);
  els.dateInput.value = toInputDate(selectedDate);
  renderCurrent(info);
  renderGroups(info);
  renderSeasonGrid(info);
  renderYearGrid(info);
  if (taskEditor.open) renderTaskEditor();
}

function selectDate(date, options = {}) {
  selectedDate = startOfDay(date);
  if (typeof options.followToday === "boolean") {
    followToday = options.followToday;
  }
  viewedYear = selectedDate.getFullYear();
  const info = convertDate(selectedDate);
  viewedGroupIndex = info.leapExtra ? TUOTUO_GROUPS.length - 1 : groupIndexForInfo(info);
  render();
}

function msUntilNextLocalDay() {
  const now = new Date();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, MIDNIGHT_REFRESH_BUFFER_MS);
  return Math.max(1000, nextDay.getTime() - now.getTime());
}

function scheduleTodayRefresh() {
  window.clearTimeout(todayRefreshTimer);
  todayRefreshTimer = window.setTimeout(() => {
    syncTodayIfNeeded();
    scheduleTodayRefresh();
  }, msUntilNextLocalDay());
}

function syncTodayIfNeeded(options = {}) {
  const today = getToday();
  const todayKey = toInputDate(today);
  const dateRolledOver = todayKey !== lastTodayKey;
  lastTodayKey = todayKey;

  if (taskEditor.open && !options.force) {
    return;
  }

  if (!followToday && !options.force) {
    if (dateRolledOver) render();
    return;
  }

  followToday = true;
  if (!isSameDate(selectedDate, today) || viewedYear !== today.getFullYear() || dateRolledOver || options.force) {
    selectedDate = today;
    viewedYear = today.getFullYear();
    const info = convertDate(selectedDate);
    viewedGroupIndex = info.leapExtra ? TUOTUO_GROUPS.length - 1 : groupIndexForInfo(info);
    render();
  }
}

function shiftNewDay(delta) {
  const info = convertDate(selectedDate);

  if (info.leapExtra) {
    const target = delta > 0 ? new Date(info.year + 1, 0, 1) : dateFromDayOfYear(info.year, 361);
    selectDate(target, { followToday: false });
    return;
  }

  let targetYear = info.year;
  let targetDay = info.newDay + delta;

  while (targetDay < 1) {
    targetYear -= 1;
    targetDay += NEW_DAYS_PER_YEAR;
  }

  while (targetDay > NEW_DAYS_PER_YEAR) {
    targetYear += 1;
    targetDay -= NEW_DAYS_PER_YEAR;
  }

  selectDate(dateFromDayOfYear(targetYear, (targetDay - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1), {
    followToday: false,
  });
}

function syncTaskFields() {
  if (!taskEditor.open) return;
  taskEditor.title = els.taskTitle.value;
  taskEditor.note = els.taskNote.value;
}

function openTaskEditor(year, day) {
  const key = dayKey(year, day);
  taskEditor = createEmptyTaskEditor();
  taskEditor.open = true;
  taskEditor.selectedKeys = new Set([key]);
  taskEditor.draftKeys = new Set([key]);
  taskEditor.lastPickedKey = key;
  els.taskOverlay.hidden = false;
  render();
  requestAnimationFrame(() => els.taskTitle.focus());
}

function closeTaskEditor() {
  taskEditor = createEmptyTaskEditor();
  els.taskOverlay.hidden = true;
  if (followToday) {
    syncTodayIfNeeded();
    return;
  }
  render();
}

function pickTaskDay(year, day, extendRange) {
  syncTaskFields();

  const key = dayKey(year, day);
  const anchor = taskEditor.lastPickedKey ? parseDayKey(taskEditor.lastPickedKey) : null;

  if (extendRange && anchor && anchor.year === year) {
    const startDay = Math.min(anchor.day, day);
    const endDay = Math.max(anchor.day, day);
    for (let currentDay = startDay; currentDay <= endDay; currentDay += 1) {
      taskEditor.selectedKeys.add(dayKey(year, currentDay));
    }
  } else if (taskEditor.selectedKeys.has(key) && taskEditor.selectedKeys.size > 1) {
    taskEditor.selectedKeys.delete(key);
  } else {
    taskEditor.selectedKeys.add(key);
  }

  taskEditor.lastPickedKey = key;
  selectedDate = dateFromDayOfYear(year, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
  viewedYear = year;
  viewedGroupIndex = groupIndexForDay(day) - 1;
  followToday = isSameDate(selectedDate, getToday());
  if (!taskEditor.editingId) {
    taskEditor.draftKeys = cloneDayKeys(taskEditor.selectedKeys);
  }
  render();
}

function renderTaskEditor() {
  els.taskDialogTitle.textContent = taskEditor.editingId ? "日程详情" : "新建日程";
  els.taskTitle.value = taskEditor.title;
  els.taskNote.value = taskEditor.note;
  els.deleteTask.hidden = !taskEditor.editingId;
  renderTaskDates();
  renderTaskList();
  updateTaskSaveState();
}

function renderTaskDates() {
  const keys = [...taskEditor.selectedKeys].sort(compareDayKeys);
  els.taskDates.innerHTML = "";

  if (!keys.length) {
    const empty = document.createElement("div");
    empty.className = "task-list-empty";
    empty.textContent = "未选择日期";
    els.taskDates.append(empty);
    return;
  }

  keys.forEach((key) => {
    const chip = document.createElement("span");
    chip.className = "date-chip";

    const label = document.createElement("span");
    label.textContent = formatTaskKey(key);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.removeDay = key;
    button.setAttribute("aria-label", `移除${formatTaskKey(key)}`);
    button.textContent = "×";

    chip.append(label, button);
    els.taskDates.append(chip);
  });
}

function renderTaskList() {
  const relatedTasks = tasksForSelectedDates().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  els.taskList.innerHTML = "";

  if (!relatedTasks.length) {
    const empty = document.createElement("div");
    empty.className = "task-list-empty";
    empty.textContent = "暂无日程";
    els.taskList.append(empty);
    return;
  }

  relatedTasks.forEach((task) => {
    const isEditing = taskEditor.editingId === task.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `task-row${isEditing ? " is-active" : ""}`;
    button.dataset.taskId = task.id;
    button.setAttribute("aria-pressed", isEditing ? "true" : "false");
    button.innerHTML = `
      <strong>${escapeHtml(task.title)}</strong>
      <span>${escapeHtml(summarizeTaskDates(task))}</span>
      ${task.note ? `<span>${escapeHtml(task.note)}</span>` : ""}
    `;
    els.taskList.append(button);
  });
}

function updateTaskSaveState() {
  els.saveTask.disabled = !els.taskTitle.value.trim() || taskEditor.selectedKeys.size === 0;
}

function switchToNewTaskMode(keys = taskEditor.draftKeys) {
  const nextKeys = cloneDayKeys(keys);
  if (!nextKeys.size) {
    const info = convertDate(selectedDate);
    if (!info.leapExtra) {
      nextKeys.add(dayKey(info.year, info.newDay));
    }
  }

  taskEditor.editingId = null;
  taskEditor.selectedKeys = nextKeys;
  taskEditor.draftKeys = cloneDayKeys(nextKeys);
  taskEditor.lastPickedKey = firstSortedKey(nextKeys);
  taskEditor.title = "";
  taskEditor.note = "";
  render();
  requestAnimationFrame(() => els.taskTitle.focus());
}

function startEditingTask(taskId) {
  if (taskEditor.editingId === taskId) {
    switchToNewTaskMode();
    return;
  }

  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;

  if (!taskEditor.editingId) {
    taskEditor.draftKeys = cloneDayKeys(taskEditor.selectedKeys);
  }

  const keys = [...task.dayKeys].filter(isValidDayKey).sort(compareDayKeys);
  const firstKey = keys[0];
  if (firstKey) {
    const { year, day } = parseDayKey(firstKey);
    selectedDate = dateFromDayOfYear(year, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
    viewedYear = year;
    viewedGroupIndex = groupIndexForDay(day) - 1;
    followToday = isSameDate(selectedDate, getToday());
  }

  taskEditor.open = true;
  taskEditor.editingId = task.id;
  taskEditor.selectedKeys = new Set(keys);
  taskEditor.lastPickedKey = firstKey || null;
  taskEditor.title = task.title;
  taskEditor.note = task.note;
  render();
}

function saveTaskFromForm() {
  syncTaskFields();

  const title = taskEditor.title.trim();
  const note = taskEditor.note.trim();
  const dayKeys = [...taskEditor.selectedKeys].filter(isValidDayKey).sort(compareDayKeys);
  if (!title || !dayKeys.length) return;

  const now = new Date().toISOString();
  const wasEditing = Boolean(taskEditor.editingId);
  if (taskEditor.editingId) {
    const task = tasks.find((candidate) => candidate.id === taskEditor.editingId);
    if (task) {
      task.title = title;
      task.note = note;
      task.dayKeys = dayKeys;
      task.updatedAt = now;
    }
  } else {
    tasks.push({
      id: makeTaskId(),
      title,
      note,
      dayKeys,
      createdAt: now,
      updatedAt: now,
    });
  }

  saveTasks();

  if (wasEditing) {
    taskEditor.title = title;
    taskEditor.note = note;
    taskEditor.selectedKeys = new Set(dayKeys);
    taskEditor.lastPickedKey = firstSortedKey(dayKeys);
    render();
    return;
  }

  switchToNewTaskMode(new Set(dayKeys));
}

function deleteEditingTask() {
  if (!taskEditor.editingId) return;
  tasks = tasks.filter((task) => task.id !== taskEditor.editingId);
  saveTasks();
  closeTaskEditor();
}

els.dateInput.addEventListener("change", (event) => {
  const nextDate = parseDateInput(event.target.value);
  selectDate(nextDate, { followToday: isSameDate(nextDate, getToday()) });
});

els.todayButton.addEventListener("click", () => {
  syncTodayIfNeeded({ force: true });
});

els.prevDay.addEventListener("click", () => {
  shiftNewDay(-1);
});

els.nextDay.addEventListener("click", () => {
  shiftNewDay(1);
});

els.prevYear.addEventListener("click", () => {
  followToday = false;
  viewedYear -= 1;
  render();
});

els.nextYear.addEventListener("click", () => {
  followToday = false;
  viewedYear += 1;
  render();
});

els.yearInput.addEventListener("change", (event) => {
  const value = Number.parseInt(event.target.value, 10);
  if (!Number.isNaN(value) && value > 0) {
    followToday = false;
    viewedYear = value;
  }
  render();
});

function handleDayGridClick(event) {
  const button = event.target.closest(".day-card");
  if (!button) return;

  const day = Number.parseInt(button.dataset.day, 10);
  if (taskEditor.open) {
    pickTaskDay(viewedYear, day, event.shiftKey);
    return;
  }

  const targetDate = dateFromDayOfYear(viewedYear, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
  selectDate(targetDate, { followToday: isSameDate(targetDate, getToday()) });
  openTaskEditor(viewedYear, day);
}

els.seasonGrid.addEventListener("click", handleDayGridClick);
els.yearGrid.addEventListener("click", handleDayGridClick);

els.toggleYearView.addEventListener("click", () => {
  yearExpanded = !yearExpanded;
  render();
});

els.groupGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".group-card");
  if (!button) return;

  const group = TUOTUO_GROUPS[Number.parseInt(button.dataset.group, 10)];
  selectDate(dateFromDayOfYear(viewedYear, (group.start - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1), {
    followToday: false,
  });
});

els.taskTitle.addEventListener("input", () => {
  taskEditor.title = els.taskTitle.value;
  updateTaskSaveState();
});

els.taskNote.addEventListener("input", () => {
  taskEditor.note = els.taskNote.value;
});

els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTaskFromForm();
});

els.closeTaskEditor.addEventListener("click", closeTaskEditor);
els.cancelTask.addEventListener("click", closeTaskEditor);
els.deleteTask.addEventListener("click", deleteEditingTask);

els.clearTaskDates.addEventListener("click", () => {
  syncTaskFields();
  taskEditor.selectedKeys.clear();
  if (!taskEditor.editingId) {
    taskEditor.draftKeys.clear();
  }
  render();
});

els.taskDates.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-day]");
  if (!button) return;

  syncTaskFields();
  taskEditor.selectedKeys.delete(button.dataset.removeDay);
  if (!taskEditor.editingId) {
    taskEditor.draftKeys = cloneDayKeys(taskEditor.selectedKeys);
  }
  render();
});

els.taskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-id]");
  if (!button) return;

  startEditingTask(button.dataset.taskId);
});

els.taskOverlay.addEventListener("click", (event) => {
  if (event.target === els.taskOverlay) closeTaskEditor();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && taskEditor.open) closeTaskEditor();
});

window.addEventListener("pageshow", () => {
  syncTodayIfNeeded();
  scheduleTodayRefresh();
});

window.addEventListener("focus", () => {
  syncTodayIfNeeded();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncTodayIfNeeded();
});

const initialInfo = convertDate(selectedDate);
viewedGroupIndex = initialInfo.leapExtra ? TUOTUO_GROUPS.length - 1 : groupIndexForInfo(initialInfo);
render();
scheduleTodayRefresh();
syncTodayIfNeeded({ force: true });
