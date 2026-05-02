const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_DAYS_PER_YEAR = 73;
const GREGORIAN_DAYS_PER_NEW_DAY = 5;
const TUOTUO_EPOCH_YEAR = 2026;
const TUOTUO_GROUPS = [
  { name: "第一组", start: 1, length: 24 },
  { name: "第二组", start: 25, length: 24 },
  { name: "第三组", start: 49, length: 25 },
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
  yearTitle: document.querySelector("#yearTitle"),
  yearInput: document.querySelector("#yearInput"),
  prevYear: document.querySelector("#prevYear"),
  nextYear: document.querySelector("#nextYear"),
  yearGrid: document.querySelector("#yearGrid"),
  leapNote: document.querySelector("#leapNote"),
};

let selectedDate = startOfDay(new Date());
let viewedYear = selectedDate.getFullYear();

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
    const isActive =
      !info.leapExtra && info.year === viewedYear && info.newDay >= group.start && info.newDay <= endDay;
    const activeText = isActive ? `当前 · 第${info.newDay - group.start + 1}/${group.length}日` : `${group.length}天`;
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

function renderYearGrid(info) {
  els.yearTitle.textContent = formatTuotuoYear(viewedYear);
  els.yearInput.value = viewedYear;
  els.yearGrid.innerHTML = "";

  const todayInfo = convertDate(new Date());
  for (let day = 1; day <= NEW_DAYS_PER_YEAR; day += 1) {
    const start = dateFromDayOfYear(viewedYear, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1);
    const end = dateFromDayOfYear(viewedYear, day * GREGORIAN_DAYS_PER_NEW_DAY);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day-card is-season-${groupIndexForDay(day)}`;
    button.dataset.day = String(day);
    button.setAttribute("aria-label", `选择${formatTuotuoYear(viewedYear)}第 ${day} 日`);
    button.innerHTML = `<strong>${day}</strong><span>${formatShort(start)} - ${formatShort(end)}</span>`;

    if (!info.leapExtra && info.year === viewedYear && info.newDay === day) {
      button.classList.add("is-selected");
    }

    if (!todayInfo.leapExtra && todayInfo.year === viewedYear && todayInfo.newDay === day) {
      button.classList.add("is-today");
    }

    els.yearGrid.append(button);
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
  renderYearGrid(info);
}

function selectDate(date) {
  selectedDate = startOfDay(date);
  viewedYear = selectedDate.getFullYear();
  render();
}

function shiftNewDay(delta) {
  const info = convertDate(selectedDate);

  if (info.leapExtra) {
    const target = delta > 0 ? new Date(info.year + 1, 0, 1) : dateFromDayOfYear(info.year, 361);
    selectDate(target);
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

  selectDate(dateFromDayOfYear(targetYear, (targetDay - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1));
}

els.dateInput.addEventListener("change", (event) => {
  selectDate(parseDateInput(event.target.value));
});

els.todayButton.addEventListener("click", () => {
  selectDate(new Date());
});

els.prevDay.addEventListener("click", () => {
  shiftNewDay(-1);
});

els.nextDay.addEventListener("click", () => {
  shiftNewDay(1);
});

els.prevYear.addEventListener("click", () => {
  viewedYear -= 1;
  render();
});

els.nextYear.addEventListener("click", () => {
  viewedYear += 1;
  render();
});

els.yearInput.addEventListener("change", (event) => {
  const value = Number.parseInt(event.target.value, 10);
  if (!Number.isNaN(value) && value > 0) {
    viewedYear = value;
  }
  render();
});

els.yearGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".day-card");
  if (!button) return;

  const day = Number.parseInt(button.dataset.day, 10);
  selectDate(dateFromDayOfYear(viewedYear, (day - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1));
});

els.groupGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".group-card");
  if (!button) return;

  const group = TUOTUO_GROUPS[Number.parseInt(button.dataset.group, 10)];
  selectDate(dateFromDayOfYear(viewedYear, (group.start - 1) * GREGORIAN_DAYS_PER_NEW_DAY + 1));
});

render();
