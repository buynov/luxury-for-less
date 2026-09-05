const data = window.CRUISE_DATA || { rows: [], files: [], generated_at: "" };
const rows = data.rows || [];
const TIER_LABELS = {
  ECONOMY: "Economy",
  ALL_INCLUDED: "All included",
  ULTRA: "Ultra",
};
const TIER_ORDER = ["ECONOMY", "ALL_INCLUDED", "ULTRA"];
const SYMBOLS = { EUR: "€", USD: "$", GBP: "£" };

const state = {
  title: "",
  source: "",
  cruiseline: "",
  ship: "",
  comment: "",
  currency: "",
  nightsMin: null,
  nightsMax: null,
  priceMin: null,
  priceMax: null,
  ppdMin: null,
  ppdMax: null,
  dateFrom: "",
  dateTo: "",
  sortKey: "price_per_day",
  sortDir: "asc",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function offerUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (_error) {}
  return "";
}

function money(amount, currency) {
  if (amount == null || amount === "") return "—";
  const symbol = SYMBOLS[currency] || currency + " ";
  return symbol + Number(amount).toLocaleString("en-GB");
}

function formatDate(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return escapeHtml(iso);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCompactDate(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return escapeHtml(iso);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function unique(field) {
  return [...new Set(rows.map((row) => row[field]).filter((value) => value != null && value !== ""))].sort(
    (left, right) => {
      if (typeof left === "number" && typeof right === "number") return left - right;
      return String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" });
    },
  );
}

function uniqueSources() {
  const seen = new Map();
  rows.forEach((row) => {
    if (row.source && !seen.has(row.source)) {
      seen.set(row.source, row.source_label || row.source);
    }
  });
  return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1], "en", { sensitivity: "base" }));
}

function uniqueTiers() {
  const have = new Set(rows.map((row) => row.comment).filter(Boolean));
  return TIER_ORDER.filter((tier) => have.has(tier));
}

function fillSelect(id, values, labels) {
  const select = document.getElementById(id);
  if (!select) return;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels && labels[value] ? labels[value] : value;
    select.appendChild(option);
  });
}

function bounds(field) {
  const values = rows.map((row) => row[field]).filter((value) => typeof value === "number");
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function isoToDay(iso) {
  const parts = String(iso).split("-");
  if (parts.length !== 3) return null;
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000;
}

function dayToIso(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-GB");
}

fillSelect("filter-line", unique("cruiseline"));
const sourceOptions = uniqueSources();
fillSelect(
  "filter-source",
  sourceOptions.map((entry) => entry[0]),
  Object.fromEntries(sourceOptions),
);
fillSelect("filter-ship", unique("ship"));
fillSelect("filter-currency", unique("currency"));
fillSelect("filter-comment", uniqueTiers(), TIER_LABELS);

const nightsBounds = bounds("number_of_days");
const priceBounds = bounds("lowest_price");
const ppdBounds = bounds("price_per_day");
const dates = unique("date");
const dateBounds = dates.length
  ? { min: isoToDay(dates[0]), max: isoToDay(dates[dates.length - 1]) }
  : null;

const sliderResets = [];

function setupDualSlider(rootId, minId, maxId, range, step, format, apply) {
  const root = document.getElementById(rootId);
  const minEl = document.getElementById(minId);
  const maxEl = document.getElementById(maxId);
  if (!root || !minEl || !maxEl || !range || range.min == null || range.max == null) {
    if (root) root.hidden = true;
    return;
  }

  const fill = root.querySelector(".dual-slider-fill");
  const minLabel = root.querySelector('[data-mark="min"]');
  const maxLabel = root.querySelector('[data-mark="max"]');
  const span = Math.max(range.max - range.min, 1);

  [minEl, maxEl].forEach((el) => {
    el.min = range.min;
    el.max = range.max;
    el.step = step;
  });

  function current() {
    let lo = Number(minEl.value);
    let hi = Number(maxEl.value);
    if (lo > hi) {
      const swap = lo;
      lo = hi;
      hi = swap;
    }
    return { lo, hi };
  }

  function paint() {
    const { lo, hi } = current();
    const left = ((lo - range.min) / span) * 100;
    const right = ((hi - range.min) / span) * 100;
    if (fill) {
      fill.style.left = left + "%";
      fill.style.width = Math.max(right - left, 0) + "%";
    }
    if (minLabel) minLabel.textContent = format(range.min);
    if (maxLabel) maxLabel.textContent = format(range.max);
    const live = root.parentElement.querySelector("[data-live]");
    if (live) {
      live.textContent = (lo > range.min || hi < range.max) ? format(lo) + " – " + format(hi) : "";
    }
    minEl.setAttribute("aria-valuetext", format(lo));
    maxEl.setAttribute("aria-valuetext", format(hi));
    apply(lo, hi);
  }

  minEl.addEventListener("input", () => {
    if (Number(minEl.value) > Number(maxEl.value)) minEl.value = maxEl.value;
    paint();
    render();
  });
  maxEl.addEventListener("input", () => {
    if (Number(maxEl.value) < Number(minEl.value)) maxEl.value = minEl.value;
    paint();
    render();
  });
  minEl.addEventListener("pointerdown", () => {
    minEl.style.zIndex = 3;
    maxEl.style.zIndex = 2;
  });
  maxEl.addEventListener("pointerdown", () => {
    maxEl.style.zIndex = 3;
    minEl.style.zIndex = 2;
  });

  function reset() {
    minEl.value = range.min;
    maxEl.value = range.max;
    paint();
  }

  sliderResets.push(reset);
  reset();
}

setupDualSlider(
  "slider-nights",
  "filter-nights-min",
  "filter-nights-max",
  nightsBounds,
  1,
  formatNumber,
  (lo, hi) => {
    state.nightsMin = lo;
    state.nightsMax = hi;
  },
);
setupDualSlider(
  "slider-price",
  "filter-price-min",
  "filter-price-max",
  priceBounds,
  1,
  formatNumber,
  (lo, hi) => {
    state.priceMin = lo;
    state.priceMax = hi;
  },
);
setupDualSlider(
  "slider-ppd",
  "filter-ppd-min",
  "filter-ppd-max",
  ppdBounds,
  1,
  formatNumber,
  (lo, hi) => {
    state.ppdMin = lo;
    state.ppdMax = hi;
  },
);
setupDualSlider(
  "slider-date",
  "filter-date-from",
  "filter-date-to",
  dateBounds,
  1,
  (day) => formatCompactDate(dayToIso(day)),
  (lo, hi) => {
    state.dateFrom = dayToIso(lo);
    state.dateTo = dayToIso(hi);
  },
);

function matches(row) {
  if (state.source && row.source !== state.source) return false;
  if (state.cruiseline && row.cruiseline !== state.cruiseline) return false;
  if (state.ship && row.ship !== state.ship) return false;
  if (state.comment && row.comment !== state.comment) return false;
  if (state.currency && row.currency !== state.currency) return false;
  if (state.title) {
    const haystack = String(row.title || "").toLowerCase();
    if (!haystack.includes(state.title)) return false;
  }
  if (state.nightsMin != null && (row.number_of_days == null || row.number_of_days < state.nightsMin)) return false;
  if (state.nightsMax != null && (row.number_of_days == null || row.number_of_days > state.nightsMax)) return false;
  if (state.priceMin != null && (row.lowest_price == null || row.lowest_price < state.priceMin)) return false;
  if (state.priceMax != null && (row.lowest_price == null || row.lowest_price > state.priceMax)) return false;
  if (state.ppdMin != null && (row.price_per_day == null || row.price_per_day < state.ppdMin)) return false;
  if (state.ppdMax != null && (row.price_per_day == null || row.price_per_day > state.ppdMax)) return false;
  if (state.dateFrom && (!row.date || row.date < state.dateFrom)) return false;
  if (state.dateTo && (!row.date || row.date > state.dateTo)) return false;
  return true;
}

function compare(leftRow, rightRow) {
  const key = state.sortKey;
  let left = leftRow[key];
  let right = rightRow[key];
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return state.sortDir === "asc" ? left - right : right - left;
  }
  left = String(left).toLowerCase();
  right = String(right).toLowerCase();
  if (left < right) return state.sortDir === "asc" ? -1 : 1;
  if (left > right) return state.sortDir === "asc" ? 1 : -1;
  return 0;
}

function sortIndicator(key) {
  if (state.sortKey !== key) return "";
  return state.sortDir === "asc" ? " ↑" : " ↓";
}

function headerButton(key, label, extraClass) {
  const pressed = state.sortKey === key ? ' aria-pressed="true"' : ' aria-pressed="false"';
  return (
    '<th class="' + extraClass + '">' +
    '<button type="button" data-sort="' + key + '"' + pressed + ">" +
    escapeHtml(label) + sortIndicator(key) +
    "</button></th>"
  );
}

function uniqueFrom(list, field) {
  return [...new Set(list.map((row) => row[field]).filter(Boolean))].sort();
}

function cheapestByCurrency(list) {
  const best = {};
  list.forEach((row) => {
    if (row.price_per_day == null) return;
    const current = best[row.currency];
    if (!current || row.price_per_day < current.price_per_day) {
      best[row.currency] = row;
    }
  });
  return best;
}

function syncRateCards() {
  document.querySelectorAll(".rate-card").forEach((card) => {
    const on = Boolean(state.comment) && card.dataset.tier === state.comment;
    card.classList.toggle("is-active", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function syncSortControls() {
  const key = document.getElementById("sort-key");
  const dir = document.getElementById("sort-dir");
  if (key) key.value = state.sortKey;
  if (dir) {
    dir.textContent = state.sortDir === "asc" ? "↑" : "↓";
    dir.title = state.sortDir === "asc" ? "Ascending" : "Descending";
  }
}

function render() {
  const visible = rows.filter(matches).sort(compare);
  const currencies = uniqueFrom(visible, "currency");
  const cheapest = cheapestByCurrency(visible);
  const cheapestBits = currencies.map((code) => {
    const row = cheapest[code];
    return row ? money(row.price_per_day, code) + "/night" : null;
  }).filter(Boolean);
  const stats = document.getElementById("stats");
  if (stats) {
    stats.textContent =
      visible.length + " shown" +
      (cheapestBits.length ? " · from " + cheapestBits.join(", ") : "");
  }

  syncRateCards();
  syncSortControls();

  const wrap = document.getElementById("table-wrap");
  if (!wrap) return;
  if (!visible.length) {
    wrap.innerHTML = '<p class="empty">No matching sailings.</p>';
    return;
  }

  const body = visible.map((row) => {
    const href = offerUrl(row.link);
    const tierClass = "tier-" + String(row.comment || "").toLowerCase();
    const tierLabel = TIER_LABELS[row.comment] || row.comment || "";
    const linkCell = href
      ? '<a class="offer" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">Open</a>'
      : "";
    return (
      "<tr>" +
      '<td data-label="Title">' + escapeHtml(row.title) + "</td>" +
      '<td data-label="Line">' + escapeHtml(row.cruiseline) + "</td>" +
      '<td data-label="Source">' + escapeHtml(row.source_label || row.source) + "</td>" +
      '<td data-label="Ship">' + escapeHtml(row.ship) + "</td>" +
      '<td data-label="Departs">' + formatDate(row.date) + "</td>" +
      '<td class="num" data-label="Nights">' + (row.number_of_days ?? "") + "</td>" +
      '<td class="num" data-label="Price">' + money(row.lowest_price, row.currency) + "</td>" +
      '<td class="num" data-label="Per night">' + money(row.price_per_day, row.currency) + "</td>" +
      '<td class="center" data-label="Rate"><span class="tier ' + escapeHtml(tierClass) + '">' +
        escapeHtml(tierLabel) + "</span></td>" +
      '<td class="center" data-label="Offer">' + linkCell + "</td>" +
      "</tr>"
    );
  }).join("");

  wrap.innerHTML =
    "<table><thead><tr>" +
    headerButton("title", "Title", "") +
    headerButton("cruiseline", "Line", "") +
    headerButton("source_label", "Source", "") +
    headerButton("ship", "Ship", "") +
    headerButton("date", "Departs", "") +
    headerButton("number_of_days", "Nights", "num") +
    headerButton("lowest_price", "Price", "num") +
    headerButton("price_per_day", "Per night", "num") +
    headerButton("comment", "Rate", "center") +
    '<th class="center"></th>' +
    "</tr></thead><tbody>" + body + "</tbody></table>";
}

function bindText(id, setter) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    setter(el.value);
    render();
  });
}

function bindSelect(id, setter) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => {
    setter(el.value);
    render();
  });
}

bindText("filter-title", (value) => {
  state.title = value.trim().toLowerCase();
});
bindSelect("filter-line", (value) => { state.cruiseline = value; });
bindSelect("filter-source", (value) => { state.source = value; });
bindSelect("filter-ship", (value) => { state.ship = value; });
bindSelect("filter-currency", (value) => { state.currency = value; });
bindSelect("filter-comment", (value) => { state.comment = value; });

const sortKey = document.getElementById("sort-key");
if (sortKey) {
  sortKey.addEventListener("change", () => {
    state.sortKey = sortKey.value;
    render();
  });
}
const sortDir = document.getElementById("sort-dir");
if (sortDir) {
  sortDir.addEventListener("click", () => {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    render();
  });
}

const clear = document.getElementById("clear");
if (clear) {
  clear.addEventListener("click", () => {
    state.title = "";
    state.source = "";
    state.cruiseline = "";
    state.ship = "";
    state.comment = "";
    state.currency = "";
    state.sortKey = "price_per_day";
    state.sortDir = "asc";
    ["filter-title", "filter-line", "filter-source", "filter-ship", "filter-currency", "filter-comment"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    sliderResets.forEach((reset) => reset());
    render();
  });
}

document.querySelectorAll(".rate-card").forEach((card) => {
  const apply = () => {
    state.comment = state.comment === card.dataset.tier ? "" : card.dataset.tier;
    const select = document.getElementById("filter-comment");
    if (select) select.value = state.comment;
    render();
  };
  card.addEventListener("click", apply);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      apply();
    }
  });
});

const tableWrap = document.getElementById("table-wrap");
if (tableWrap) {
  tableWrap.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    const key = button.getAttribute("data-sort");
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDir = "asc";
    }
    render();
  });
}

render();
