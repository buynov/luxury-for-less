const data = (typeof window !== "undefined" && window.CRUISE_DATA) || { rows: [], files: [], generated_at: "" };
const rows = data.rows || [];
const TIER_LABELS = {
  ECONOMY: "Economy",
  ALL_INCLUDED: "All included",
  ULTRA: "Ultra",
};
const TIER_ORDER = ["ECONOMY", "ALL_INCLUDED", "ULTRA"];
const TIER_SORT_RANK = { ULTRA: 0, ALL_INCLUDED: 1, ECONOMY: 2 };
const SYMBOLS = { EUR: "€", USD: "$", GBP: "£" };
const MULTI_SELECT_IDS = ["filter-line", "filter-source", "filter-ship", "filter-comment"];
const DEFAULT_DEPARTURE_DAYS = 89;

function track(name, params) {
  if (typeof gtag !== "function") return;
  gtag("event", name, params || {});
}

function trackFilter(name, value) {
  track("filter_change", {
    filter_name: name,
    value: value == null ? "" : String(value),
  });
}

function trackSort() {
  track("sort_change", {
    sort_key: state.sorts.map((spec) => spec.key).join(","),
    sort_dir: state.sorts.map((spec) => spec.dir).join(","),
  });
}

function trackOffer(href, row) {
  track("select_content", {
    content_type: "sailing",
    link_url: href,
    cruise_line: (row && row.cruiseline) || "",
    source: (row && row.source) || "",
    item_name: (row && row.title) || "",
  });
}

function defaultState() {
  return {
    title: "",
    source: [],
    cruiseline: [],
    ship: [],
    comment: [],
    nightsMin: null,
    nightsMax: null,
    priceMin: null,
    priceMax: null,
    ppdMin: null,
    ppdMax: null,
    dateFrom: "",
    dateTo: "",
    sorts: defaultSorts(),
  };
}

function defaultSorts() {
  return [
    { key: "comment", dir: "asc" },
    { key: "price_per_day", dir: "asc" },
  ];
}

const state = defaultState();
const multiSelects = {};
const sliderResets = [];
const sliders = {};
const sliderBounds = { nights: null, price: null, ppd: null, date: null };
const SORT_FIELDS = {
  title: true,
  cruiseline: true,
  source_label: true,
  ship: true,
  date: true,
  number_of_days: true,
  lowest_price: true,
  price_per_day: true,
  comment: true,
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

function fxNote(fx) {
  if (!fx || typeof fx.usd_eur !== "number" || !fx.date) return "";
  const euros = fx.usd_eur.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return "One dollar was " + euros + " euros on " + formatDate(fx.date) +
    " (European Central Bank). That rate orders a euro quote against a dollar quote of the same sailing. The prices themselves stay in the currency each site published.";
}

function formatDate(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return escapeHtml(iso);
  const date = new Date(Date.UTC(parts[0], Number(parts[1]) - 1, Number(parts[2])));
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
  const date = new Date(Date.UTC(parts[0], Number(parts[1]) - 1, Number(parts[2])));
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

function quoteList(row) {
  if (Array.isArray(row.quotes) && row.quotes.length) return row.quotes;
  return [{
    source: row.source || "",
    source_label: row.source_label || row.source || "",
    title: row.title || "",
    lowest_price: row.lowest_price,
    price_per_day: row.price_per_day,
    currency: row.currency || "",
    link: row.link || "",
  }];
}

function sailingKey(row) {
  return [row.cruiseline, row.ship, row.date, row.number_of_days, row.comment, row.currency, row.source].join("\u001f");
}

const openOverride = new Map();

function othersLabel(count) {
  return count === 1 ? "1 other" : count + " others";
}

function uniqueSources() {
  const seen = new Map();
  rows.forEach((row) => {
    quoteList(row).forEach((quote) => {
      if (quote.source && !seen.has(quote.source)) {
        seen.set(quote.source, quote.source_label || quote.source);
      }
    });
  });
  return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1], "en", { sensitivity: "base" }));
}

function uniqueTiers() {
  const have = new Set(rows.map((row) => row.comment).filter(Boolean));
  return TIER_ORDER.filter((tier) => have.has(tier));
}

function inSelected(selected, value) {
  return !selected || !selected.length || selected.indexOf(value) !== -1;
}

function shouldAutoOpen(row, filters) {
  const others = quoteList(row).slice(1);
  if (!others.length) return false;
  if (filters.title) {
    const needle = String(filters.title).toLowerCase();
    const headline = String(row.title || "").toLowerCase().includes(needle);
    const other = others.some((quote) => String(quote.title || "").toLowerCase().includes(needle));
    if (other && !headline) return true;
  }
  if (filters.source && filters.source.length) {
    const headline = filters.source.indexOf(row.source) !== -1;
    const other = others.some((quote) => filters.source.indexOf(quote.source) !== -1);
    if (other && !headline) return true;
  }
  return false;
}

function bandOpen(row) {
  const key = sailingKey(row);
  if (openOverride.has(key)) return openOverride.get(key);
  return shouldAutoOpen(row, state);
}

function rowMatches(row, filters) {
  const quotes = quoteList(row);
  if (filters.source && filters.source.length && !quotes.some((quote) => filters.source.indexOf(quote.source) !== -1)) {
    return false;
  }
  if (!inSelected(filters.cruiseline, row.cruiseline)) return false;
  if (!inSelected(filters.ship, row.ship)) return false;
  if (!inSelected(filters.comment, row.comment)) return false;
  if (filters.title) {
    const needle = String(filters.title).toLowerCase();
    if (!quotes.some((quote) => String(quote.title || "").toLowerCase().includes(needle))) return false;
  }
  if (filters.nightsMin != null && (row.number_of_days == null || row.number_of_days < filters.nightsMin)) return false;
  if (filters.nightsMax != null && (row.number_of_days == null || row.number_of_days > filters.nightsMax)) return false;
  if (filters.priceMin != null && (row.lowest_price == null || row.lowest_price < filters.priceMin)) return false;
  if (filters.priceMax != null && (row.lowest_price == null || row.lowest_price > filters.priceMax)) return false;
  if (filters.ppdMin != null && (row.price_per_day == null || row.price_per_day < filters.ppdMin)) return false;
  if (filters.ppdMax != null && (row.price_per_day == null || row.price_per_day > filters.ppdMax)) return false;
  if (filters.dateFrom && (!row.date || row.date < filters.dateFrom)) return false;
  if (filters.dateTo && (!row.date || row.date > filters.dateTo)) return false;
  return true;
}

function matches(row) {
  return rowMatches(row, state);
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

function todayDay(now) {
  const date = now instanceof Date ? now : new Date();
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function defaultDepartureWindow(now) {
  const start = todayDay(now);
  return { min: start, max: start + DEFAULT_DEPARTURE_DAYS };
}

let departureWindow = null;

function setDepartureWindow(window) {
  departureWindow = window;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-GB");
}

function sortsEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((spec, index) => spec.key === right[index].key && spec.dir === right[index].dir);
}

function normalizeTier(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/[-\s]+/g, "_");
  if (TIER_LABELS[upper]) return upper;
  const lowered = raw.toLowerCase();
  const fromLabel = Object.keys(TIER_LABELS).find((key) => TIER_LABELS[key].toLowerCase() === lowered);
  return fromLabel || "";
}

function listingParams(search) {
  if (!search) return new URLSearchParams();
  if (typeof search !== "string") return new URLSearchParams(search);
  return new URLSearchParams(search.charAt(0) === "?" ? search.slice(1) : search);
}

function readList(params, key) {
  const parts = [];
  params.getAll(key).forEach((value) => {
    String(value).split(",").forEach((item) => {
      const trimmed = item.trim();
      if (trimmed) parts.push(trimmed);
    });
  });
  return parts;
}

function writeList(params, key, values) {
  (values || []).forEach((value) => {
    if (value) params.append(key, value);
  });
}

function parseDashRange(raw) {
  const match = /^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/.exec(String(raw || "").trim());
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

function parseDateRange(raw) {
  const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(String(raw || "").trim());
  if (!match) return null;
  return match[1] <= match[2] ? { min: match[1], max: match[2] } : { min: match[2], max: match[1] };
}

function parseSorts(raw) {
  const specs = [];
  String(raw || "").split(",").forEach((part) => {
    const bits = part.split(":");
    const key = (bits[0] || "").trim();
    const dir = (bits[1] || "").trim();
    if (SORT_FIELDS[key] && (dir === "asc" || dir === "desc")) {
      specs.push({ key, dir });
    }
  });
  return specs.length ? specs : defaultSorts();
}

function parseListingQuery(search) {
  const params = listingParams(search);
  const patch = {};
  if (params.has("title")) patch.title = (params.get("title") || "").trim().toLowerCase();
  if (params.has("line")) patch.cruiseline = readList(params, "line");
  if (params.has("source")) patch.source = readList(params, "source");
  if (params.has("ship")) patch.ship = readList(params, "ship");
  if (params.has("rate")) {
    patch.comment = readList(params, "rate").map(normalizeTier).filter(Boolean);
  }
  if (params.has("nights")) {
    const range = parseDashRange(params.get("nights"));
    if (range) patch.nights = range;
  }
  if (params.has("price")) {
    const range = parseDashRange(params.get("price"));
    if (range) patch.price = range;
  }
  if (params.has("ppd")) {
    const range = parseDashRange(params.get("ppd"));
    if (range) patch.ppd = range;
  }
  if (params.has("departs")) {
    const range = parseDateRange(params.get("departs"));
    if (range) patch.departs = range;
  }
  if (params.has("sort")) patch.sorts = parseSorts(params.get("sort"));
  return patch;
}

function applyListingPatch(patch) {
  if (!patch) return;
  if (patch.title != null) state.title = patch.title;
  if (patch.cruiseline) state.cruiseline = patch.cruiseline;
  if (patch.source) state.source = patch.source;
  if (patch.ship) state.ship = patch.ship;
  if (patch.comment) state.comment = patch.comment;
  if (patch.sorts) state.sorts = patch.sorts;
  if (patch.nights) {
    state.nightsMin = patch.nights.min;
    state.nightsMax = patch.nights.max;
  }
  if (patch.price) {
    state.priceMin = patch.price.min;
    state.priceMax = patch.price.max;
  }
  if (patch.ppd) {
    state.ppdMin = patch.ppd.min;
    state.ppdMax = patch.ppd.max;
  }
  if (patch.departs) {
    state.dateFrom = patch.departs.min;
    state.dateTo = patch.departs.max;
  }
}

function isDefaultNumericRange(min, max, range) {
  if (!range) return min == null && max == null;
  return min === range.min && max === range.max;
}

function isDefaultDateRange(from, to, range) {
  if (departureWindow) {
    return from === dayToIso(departureWindow.min) && to === dayToIso(departureWindow.max);
  }
  if (!range) return !from && !to;
  return from === dayToIso(range.min) && to === dayToIso(range.max);
}

function queryFromState(filters, bounds) {
  const current = filters || state;
  const ranges = bounds || sliderBounds;
  const params = new URLSearchParams();
  if (current.title) params.set("title", current.title);
  writeList(params, "line", current.cruiseline);
  writeList(params, "source", current.source);
  writeList(params, "ship", current.ship);
  writeList(params, "rate", current.comment);
  if (!isDefaultNumericRange(current.nightsMin, current.nightsMax, ranges.nights)) {
    params.set("nights", current.nightsMin + "-" + current.nightsMax);
  }
  if (!isDefaultDateRange(current.dateFrom, current.dateTo, ranges.date)) {
    params.set("departs", current.dateFrom + ".." + current.dateTo);
  }
  if (!isDefaultNumericRange(current.priceMin, current.priceMax, ranges.price)) {
    params.set("price", current.priceMin + "-" + current.priceMax);
  }
  if (!isDefaultNumericRange(current.ppdMin, current.ppdMax, ranges.ppd)) {
    params.set("ppd", current.ppdMin + "-" + current.ppdMax);
  }
  if (!sortsEqual(current.sorts, defaultSorts())) {
    params.set("sort", current.sorts.map((spec) => spec.key + ":" + spec.dir).join(","));
  }
  return params;
}

function writeQuery() {
  if (typeof window === "undefined" || !window.location || !window.history || typeof window.history.replaceState !== "function") {
    return;
  }
  const search = queryFromState().toString();
  const hash = window.location.hash || "";
  const next = window.location.pathname + (search ? "?" + search : "") + hash;
  const current = window.location.pathname + window.location.search + hash;
  if (next === current) return;
  try {
    window.history.replaceState(null, "", next);
  } catch (_error) {}
}

function syncListingControls() {
  const title = document.getElementById("filter-title");
  if (title) title.value = state.title;
  if (multiSelects["filter-line"]) multiSelects["filter-line"].setSelected(state.cruiseline);
  if (multiSelects["filter-source"]) multiSelects["filter-source"].setSelected(state.source);
  if (multiSelects["filter-ship"]) multiSelects["filter-ship"].setSelected(state.ship);
  if (multiSelects["filter-comment"]) multiSelects["filter-comment"].setSelected(state.comment);
  if (sliders.nights) sliders.nights.setValues(state.nightsMin, state.nightsMax);
  if (sliders.price) sliders.price.setValues(state.priceMin, state.priceMax);
  if (sliders.per_night) sliders.per_night.setValues(state.ppdMin, state.ppdMax);
  if (sliders.departs && state.dateFrom && state.dateTo) {
    sliders.departs.setValues(isoToDay(state.dateFrom), isoToDay(state.dateTo));
  }
}

function closeMultiSelects(except) {
  Object.keys(multiSelects).forEach((id) => {
    if (except && id === except) return;
    multiSelects[id].setOpen(false);
  });
}

function setupMultiSelect(id, values, labels, setter, filterName) {
  const root = document.getElementById(id);
  if (!root) return;
  const emptyLabel = root.getAttribute("data-empty-label") || "All";
  const labelledBy = id + "-label";
  const menuId = id + "-menu";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "multi-select-toggle";
  toggle.setAttribute("aria-haspopup", "listbox");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", menuId);
  toggle.setAttribute("aria-labelledby", labelledBy);
  const valueSpan = document.createElement("span");
  valueSpan.className = "multi-select-value";
  valueSpan.textContent = emptyLabel;
  toggle.appendChild(valueSpan);

  const menu = document.createElement("div");
  menu.id = menuId;
  menu.className = "multi-select-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-multiselectable", "true");
  menu.hidden = true;

  values.forEach((value) => {
    const option = document.createElement("label");
    option.className = "multi-select-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    const text = labels && labels[value] ? labels[value] : String(value);
    checkbox.setAttribute("aria-label", text);
    const caption = document.createElement("span");
    caption.textContent = text;
    option.appendChild(checkbox);
    option.appendChild(caption);
    menu.appendChild(option);
  });

  root.replaceChildren(toggle, menu);

  function selectedValues() {
    return [...menu.querySelectorAll("input:checked")].map((el) => el.value);
  }

  function selectedLabels() {
    return [...menu.querySelectorAll("input:checked")].map((el) => {
      const caption = el.nextElementSibling;
      return caption ? caption.textContent : el.value;
    });
  }

  function paint() {
    const selected = selectedValues();
    const texts = selectedLabels();
    if (!selected.length) valueSpan.textContent = emptyLabel;
    else if (selected.length === 1) valueSpan.textContent = texts[0];
    else valueSpan.textContent = selected.length + " selected";
    toggle.title = selected.length ? texts.join(", ") : emptyLabel;
    root.classList.toggle("has-value", selected.length > 0);
  }

  function setSelected(next) {
    const wanted = new Set(next || []);
    menu.querySelectorAll("input[type=checkbox]").forEach((el) => {
      el.checked = wanted.has(el.value);
    });
    paint();
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    closeMultiSelects(id);
    setOpen(open);
  });
  menu.addEventListener("click", (event) => event.stopPropagation());
  menu.addEventListener("change", () => {
    const selected = selectedValues();
    setter(selected);
    paint();
    render();
    if (filterName) trackFilter(filterName, selected.join(","));
  });

  multiSelects[id] = { setSelected, setOpen, selectedValues };
  paint();
}

function setupDualSlider(rootId, minId, maxId, range, step, format, apply, filterName, initial) {
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
  if (filterName) {
    const commit = () => {
      const { lo, hi } = current();
      trackFilter(filterName, format(lo) + " – " + format(hi));
    };
    minEl.addEventListener("change", commit);
    maxEl.addEventListener("change", commit);
  }

  const start = initial || { min: range.min, max: range.max };

  function reset() {
    minEl.value = start.min;
    maxEl.value = start.max;
    paint();
  }

  function setValues(lo, hi) {
    let nextLo = lo == null ? range.min : Number(lo);
    let nextHi = hi == null ? range.max : Number(hi);
    if (!Number.isFinite(nextLo)) nextLo = range.min;
    if (!Number.isFinite(nextHi)) nextHi = range.max;
    nextLo = Math.min(Math.max(nextLo, range.min), range.max);
    nextHi = Math.min(Math.max(nextHi, range.min), range.max);
    if (nextLo > nextHi) {
      const swap = nextLo;
      nextLo = nextHi;
      nextHi = swap;
    }
    minEl.value = nextLo;
    maxEl.value = nextHi;
    paint();
  }

  if (filterName === "nights") sliderBounds.nights = range;
  if (filterName === "price") sliderBounds.price = range;
  if (filterName === "per_night") sliderBounds.ppd = range;
  if (filterName === "departs") sliderBounds.date = range;
  if (filterName) sliders[filterName] = { reset, setValues };

  sliderResets.push(reset);
  reset();
}

function tierRank(value) {
  return Object.prototype.hasOwnProperty.call(TIER_SORT_RANK, value) ? TIER_SORT_RANK[value] : 99;
}

function compareValues(left, right, key, dir) {
  if (key === "comment") {
    const diff = tierRank(left) - tierRank(right);
    return dir === "asc" ? diff : -diff;
  }
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return dir === "asc" ? left - right : right - left;
  }
  left = String(left).toLowerCase();
  right = String(right).toLowerCase();
  if (left < right) return dir === "asc" ? -1 : 1;
  if (left > right) return dir === "asc" ? 1 : -1;
  return 0;
}

function compareRows(leftRow, rightRow, sorts) {
  const specs = sorts || state.sorts;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const result = compareValues(leftRow[spec.key], rightRow[spec.key], spec.key, spec.dir);
    if (result) return result;
  }
  return 0;
}

function compare(leftRow, rightRow) {
  return compareRows(leftRow, rightRow, state.sorts);
}

function sortSpec(key) {
  return state.sorts.find((spec) => spec.key === key);
}

function sortIndicator(key) {
  const spec = sortSpec(key);
  if (!spec) return "";
  return spec.dir === "asc" ? " ↑" : " ↓";
}

function headerButton(key, label, extraClass) {
  const pressed = sortSpec(key) ? ' aria-pressed="true"' : ' aria-pressed="false"';
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
    const on = state.comment.indexOf(card.dataset.tier) !== -1;
    card.classList.toggle("is-active", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function offerLink(href, line, source, title) {
  if (!href) return "";
  return '<a class="offer" href="' + escapeHtml(href) + '" target="_blank" rel="noopener"' +
    ' data-line="' + escapeHtml(line || "") + '"' +
    ' data-source="' + escapeHtml(source || "") + '"' +
    ' data-title="' + escapeHtml(title || "") + '">Open</a>';
}

function sailingHtml(row, open) {
  const others = quoteList(row).slice(1);
  const tierClass = "tier-" + String(row.comment || "").toLowerCase();
  const tierLabel = TIER_LABELS[row.comment] || row.comment || "";
  let sourceCell = escapeHtml(row.source_label || row.source);
  if (others.length) {
    sourceCell +=
      '<button type="button" class="others" data-others="' + escapeHtml(sailingKey(row)) + '"' +
      ' aria-expanded="' + (open ? "true" : "false") + '">' +
      othersLabel(others.length) + "</button>";
  }
  let html =
    "<tr>" +
    '<td data-label="Title">' + escapeHtml(row.title) + "</td>" +
    '<td data-label="Line">' + escapeHtml(row.cruiseline) + "</td>" +
    '<td data-label="Source">' + sourceCell + "</td>" +
    '<td data-label="Ship">' + escapeHtml(row.ship) + "</td>" +
    '<td data-label="Departs">' + formatDate(row.date) + "</td>" +
    '<td class="num" data-label="Nights">' + (row.number_of_days ?? "") + "</td>" +
    '<td class="num" data-label="Price">' + money(row.lowest_price, row.currency) + "</td>" +
    '<td class="num" data-label="Per night">' + money(row.price_per_day, row.currency) + "</td>" +
    '<td class="center" data-label="Rate"><span class="tier ' + escapeHtml(tierClass) + '">' +
      escapeHtml(tierLabel) + "</span></td>" +
    '<td class="center" data-label="Offer">' + offerLink(offerUrl(row.link), row.cruiseline, row.source, row.title) + "</td>" +
    "</tr>";
  if (open) {
    others.forEach((quote) => {
      const bits = [escapeHtml(quote.source_label || quote.source)];
      if (quote.title && quote.title !== row.title) bits.push(escapeHtml(quote.title));
      const currency = quote.currency || row.currency;
      bits.push(escapeHtml(money(quote.lowest_price, currency)));
      bits.push(escapeHtml(money(quote.price_per_day, currency)) + "/night");
      const link = offerLink(offerUrl(quote.link), row.cruiseline, quote.source, quote.title);
      html +=
        '<tr class="quote-band"><td colspan="10" data-label="Also">' +
        bits.join(" · ") + (link ? " · " + link : "") + "</td></tr>";
    });
  }
  return html;
}

function render(options) {
  if (!options || !options.keepOpen) openOverride.clear();
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

  const wrap = document.getElementById("table-wrap");
  if (!wrap) {
    writeQuery();
    return;
  }
  if (!visible.length) {
    wrap.innerHTML = '<p class="empty">No matching sailings.</p>';
    writeQuery();
    return;
  }

  const body = visible.map((row) => '<tbody>' + sailingHtml(row, bandOpen(row)) + "</tbody>").join("");

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
    "</tr></thead>" + body + "</table>";
  writeQuery();
}

function bindText(id, setter, filterName) {
  const el = document.getElementById(id);
  if (!el) return;
  let timer = null;
  el.addEventListener("input", () => {
    setter(el.value);
    render();
    if (!filterName) return;
    clearTimeout(timer);
    timer = setTimeout(() => trackFilter(filterName, el.value.trim()), 500);
  });
}

function toggleComment(tier) {
  const index = state.comment.indexOf(tier);
  if (index >= 0) {
    state.comment = state.comment.filter((value) => value !== tier);
  } else {
    state.comment = state.comment.concat(tier);
  }
  if (multiSelects["filter-comment"]) multiSelects["filter-comment"].setSelected(state.comment);
}

function markCrawlDateFreshness() {
  const root = document.querySelector(".crawl-date");
  const time = root && root.querySelector("time");
  if (!root || !time) return;
  const iso = time.getAttribute("datetime") || data.crawled_at || "";
  const parts = String(iso).split("-").map(Number);
  const titles = {
    fresh: "Up to date",
    aging: "Probably relevant",
    stale: "Probably outdated",
  };
  let kind = "stale";
  if (parts.length === 3 && !parts.some((n) => Number.isNaN(n))) {
    const crawled = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    crawled.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const days = Math.round((today - crawled) / 86400000);
    kind = days <= 3 ? "fresh" : days <= 10 ? "aging" : "stale";
  }
  root.classList.add("crawl-date-" + kind);
  root.dataset.tip = titles[kind];
  root.setAttribute("aria-label", "Last update: " + titles[kind]);
}

function setupControlTabs() {
  const tabs = Array.from(document.querySelectorAll('.tablist [role="tab"]'));
  if (!tabs.length) return;

  function select(tab) {
    tabs.forEach((item) => {
      const on = item === tab;
      item.setAttribute("aria-selected", on ? "true" : "false");
      item.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(item.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      select(next);
      next.focus();
    });
  });
}

function initListing() {
  setupControlTabs();
  const sourceOptions = uniqueSources();
  setupMultiSelect(
    "filter-line",
    unique("cruiseline"),
    null,
    (values) => { state.cruiseline = values; },
    "line",
  );
  setupMultiSelect(
    "filter-source",
    sourceOptions.map((entry) => entry[0]),
    Object.fromEntries(sourceOptions),
    (values) => { state.source = values; },
    "source",
  );
  setupMultiSelect(
    "filter-ship",
    unique("ship"),
    null,
    (values) => { state.ship = values; },
    "ship",
  );
  setupMultiSelect(
    "filter-comment",
    uniqueTiers(),
    TIER_LABELS,
    (values) => { state.comment = values; },
    "rate",
  );

  const nightsBounds = bounds("number_of_days");
  const priceBounds = bounds("lowest_price");
  const ppdBounds = bounds("price_per_day");
  const dates = unique("date");
  const departure = defaultDepartureWindow();
  setDepartureWindow(departure);
  const dateBounds = dates.length
    ? {
        min: Math.min(isoToDay(dates[0]), departure.min),
        max: Math.max(isoToDay(dates[dates.length - 1]), departure.max),
      }
    : null;

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
    "nights",
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
    "price",
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
    "per_night",
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
    "departs",
    departure,
  );

  bindText("filter-title", (value) => {
    state.title = value.trim().toLowerCase();
  }, "title");

  if (typeof window !== "undefined" && window.location) {
    applyListingPatch(parseListingQuery(window.location.search));
    syncListingControls();
  }

  const clear = document.getElementById("clear");
  if (clear) {
    clear.addEventListener("click", () => {
      Object.assign(state, defaultState());
      const title = document.getElementById("filter-title");
      if (title) title.value = "";
      MULTI_SELECT_IDS.forEach((id) => {
        if (multiSelects[id]) multiSelects[id].setSelected([]);
      });
      closeMultiSelects();
      sliderResets.forEach((reset) => reset());
      render();
      track("clear_filters");
    });
  }

  document.querySelectorAll(".rate-card").forEach((card) => {
    const apply = () => {
      toggleComment(card.dataset.tier);
      render();
      trackFilter("rate", state.comment.join(","));
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
      const others = event.target.closest("[data-others]");
      if (others) {
        const key = others.getAttribute("data-others");
        const row = rows.find((item) => sailingKey(item) === key);
        if (row) {
          const open = openOverride.has(key) ? openOverride.get(key) : shouldAutoOpen(row, state);
          openOverride.set(key, !open);
          render({ keepOpen: true });
        }
        return;
      }
      const offer = event.target.closest("a.offer");
      if (offer) {
        trackOffer(offer.href, {
          cruiseline: offer.dataset.line,
          source: offer.dataset.source,
          title: offer.dataset.title,
        });
        return;
      }
      const button = event.target.closest("[data-sort]");
      if (!button) return;
      const key = button.getAttribute("data-sort");
      const primary = state.sorts[0];
      if (primary && primary.key === key) {
        primary.dir = primary.dir === "asc" ? "desc" : "asc";
      } else {
        state.sorts = [{ key: key, dir: "asc" }];
      }
      render();
      trackSort();
    });
  }

  document.addEventListener("click", () => closeMultiSelects());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMultiSelects();
  });

  markCrawlDateFreshness();
  const footnotes = document.querySelector(".footnotes");
  const note = fxNote(data.fx);
  if (footnotes && note) {
    const item = document.createElement("li");
    item.textContent = note;
    footnotes.appendChild(item);
  }
  render();
}

if (typeof document !== "undefined") {
  initListing();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    inSelected,
    rowMatches,
    shouldAutoOpen,
    sailingHtml,
    fxNote,
    defaultState,
    defaultSorts,
    defaultDepartureWindow,
    setDepartureWindow,
    dayToIso,
    tierRank,
    compareRows,
    parseListingQuery,
    queryFromState,
    applyListingPatch,
    sortsEqual,
    normalizeTier,
    toggleComment,
    setupMultiSelect,
    closeMultiSelects,
    multiSelects,
    state,
    TIER_LABELS,
  };
}
