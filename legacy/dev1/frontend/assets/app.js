"use strict";

const byId = (id) => document.getElementById(id);
const question = byId("question");
const agentForm = byId("agent-form");
const manualForm = byId("manual-form");
const conversation = byId("conversation-history");
const requestState = byId("request-state");
const suggestionButtons = [...document.querySelectorAll("[data-suggestion]")];
const navLinks = [...document.querySelectorAll("a[data-view]")];
const views = {
  home: byId("search-view"),
  data: byId("data-view"),
  results: byId("conversation"),
  favorites: byId("favorites-view"),
};
const district = byId("manual-district");
const visitor = byId("manual-visitor");
const start = byId("manual-start");
const end = byId("manual-end");
const metric = byId("manual-metric");
const submit = byId("agent-submit");
const retry = byId("retry-button");

let catalog;
let busy = false;
let activeContext;
let availableMonths = [];
let retryAction;
const suggestions = new Map();
const favoritesKey = "jeju-data-agent.favorite-questions";
let favorites = readFavorites();
const monthlyQuestion = "같은 조건으로 월별 추이를 보여줘.";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function monthIndex(value) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthLabel(value) {
  const [year, month] = value.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function periodLabel(first, last) {
  return first === last ? monthLabel(first) : `${monthLabel(first)} ~ ${monthLabel(last)}`;
}

function updateControls() {
  const ready = Boolean(catalog);
  question.readOnly = busy;
  submit.disabled = busy || !ready;
  for (const button of suggestionButtons) {
    button.disabled = busy || !suggestions.has(button.dataset.suggestion);
  }
  byId("manual-fields").disabled = busy || !ready;
  byId("manual-submit").disabled = busy || !availableMonths.length;
  retry.disabled = busy;
  for (const control of conversation.querySelectorAll(".choice-button, [data-analysis-action]")) {
    control.disabled = busy;
  }
  byId("submit-label").textContent = agentForm.getAttribute("aria-busy") === "true" ? "분석 중" : "질문하기";
}

function showState(kind, title, description, next) {
  retryAction = next;
  requestState.hidden = !kind;
  requestState.dataset.kind = kind ?? "";
  byId("request-title").textContent = title ?? "";
  byId("activity-status").textContent = description ?? "";
  retry.hidden = !next;
}

async function request(url, data) {
  const init = data === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (response.ok && payload) return payload;
  if (response.status >= 500) {
    throw new Error(url === "/api/agent"
      ? "잠시 후 다시 시도하거나 데이터 둘러보기에서 조건을 직접 선택해 주세요."
      : "잠시 후 다시 시도해 주세요.");
  }
  const message = typeof payload?.detail === "string" ? payload.detail : "";
  throw new Error(message);
}

async function run(operation, { form, title, description, errorTitle, reveal = false }) {
  if (busy) return;
  busy = true;
  form?.setAttribute("aria-busy", "true");
  showState("loading", title, description);
  updateControls();
  if (reveal) requestState.scrollIntoView({ block: "nearest" });
  try {
    await operation();
    showState();
  } catch (error) {
    const message = error.message && error.message !== "Failed to fetch"
      ? error.message : "서버 연결을 확인한 뒤 다시 시도해 주세요.";
    showState("error", errorTitle, message, () => run(operation, { form, title, description, errorTitle, reveal }));
    requestState.scrollIntoView({ block: "nearest" });
  } finally {
    busy = false;
    form?.setAttribute("aria-busy", "false");
    updateControls();
  }
}

function setChoices(select, choices, value) {
  select.replaceChildren(...choices.map(({ id, label }) => new Option(label, id)));
  if (choices.some(({ id }) => id === value)) select.value = value;
}

function scopeMonths(districtName, visitorType) {
  const candidates = catalog.districts
    .filter(({ name }) => !districtName || districtName === name)
    .flatMap(({ visitor_types }) => visitor_types)
    .filter(({ id }) => !visitorType || visitorType === id);
  const [left, ...right] = candidates.map(({ months }) => new Set(months));
  return left ? [...left].filter((month) => right.every((months) => months.has(month))).sort() : [];
}

function updateMonthChoices(first, last) {
  availableMonths = scopeMonths(district.value, visitor.value);
  const choices = availableMonths.map((id) => ({ id, label: monthLabel(id) }));
  const lastAvailable = availableMonths.at(-1);
  const defaultStart = availableMonths.find((month) => monthIndex(lastAvailable) - monthIndex(month) < 120);
  setChoices(start, choices, availableMonths.includes(first) ? first : defaultStart);
  setChoices(end, choices, availableMonths.includes(last) ? last : lastAvailable);
  updateEndChoices();
  byId("manual-hint").textContent = availableMonths.length
    ? `공통 조회 기간 ${periodLabel(availableMonths[0], lastAvailable)}`
    : "이 조건에서 토요일과 일요일을 함께 비교할 수 있는 달이 없습니다.";
  updateControls();
}

function updateEndChoices() {
  if (!start.value) return;
  const firstIndex = monthIndex(start.value);
  for (const option of end.options) {
    const offset = monthIndex(option.value) - firstIndex;
    option.disabled = offset < 0 || offset >= 120;
  }
  if (end.selectedOptions[0]?.disabled) {
    const valid = [...end.options].filter((option) => !option.disabled);
    end.value = end.value < start.value ? start.value : valid.at(-1).value;
  }
}

function updateVisitorChoices(value) {
  const groups = new Map(catalog.districts
    .filter(({ name }) => !district.value || district.value === name)
    .flatMap(({ visitor_types }) => visitor_types)
    .map(({ id, label }) => [id, label]));
  setChoices(visitor, [{ id: "", label: "제공되는 관광객 전체" }, ...Array.from(groups, ([id, label]) => ({ id, label }))], value ?? "");
}

function setManual(params = {}) {
  setChoices(district, [
    { id: "", label: catalog.districts.length === 2 ? "두 지역 비교" : "전체 지역 비교" },
    ...catalog.districts.map(({ name }) => ({ id: name, label: name })),
  ], params.district ?? "");
  updateVisitorChoices(params.visitor_type);
  setChoices(metric, catalog.metrics, params.metric ?? "transactions");
  updateMonthChoices(params.start_month, params.end_month);
}

function readManual() {
  if (!availableMonths.length) return null;
  return {
    district: district.value || null,
    visitor_type: visitor.value || null,
    start_month: start.value,
    end_month: end.value,
    metric: metric.value,
  };
}

function locationView() {
  const name = location.hash.slice(1) || "home";
  if (Object.hasOwn(views, name)) return name;
}

function showView(name, { focus = true, updateLocation = true } = {}) {
  for (const [view, section] of Object.entries(views)) section.hidden = view !== name;
  const statusSlot = byId(`${name}-status`);
  if (requestState.parentElement !== statusSlot) statusSlot.append(requestState);
  for (const link of navLinks) {
    if (!link.classList.contains("nav-link")) continue;
    if (link.dataset.view === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (updateLocation && (name !== "home" || location.hash) && location.hash !== `#${name}`) {
    history.pushState(null, "", `#${name}`);
  }
  if (focus) {
    const turn = name === "results" ? conversation.lastElementChild : null;
    const target = turn?.querySelector(".turn-result") ?? views[name].querySelector("h1");
    target.focus({ preventScroll: true });
    if (turn) turn.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }
}

function fillQuestion(prompt) {
  if (busy) return;
  showState();
  question.value = prompt;
  showView("home", { focus: false });
  window.scrollTo(0, 0);
  question.focus();
}

function reopenSearch() {
  showView("home", { focus: false });
  window.scrollTo(0, 0);
  question.focus();
}

function openManual() {
  showView("data");
  if (!district.matches(":disabled")) district.focus();
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) ?? "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter((item) =>
      typeof item === "string" && item.trim() && item.length <= question.maxLength))] : [];
  } catch {
    return [];
  }
}

function renderFavorites() {
  const list = byId("favorites-list");
  list.replaceChildren();
  list.hidden = !favorites.length;
  byId("favorites-empty").hidden = favorites.length > 0;
  for (const prompt of favorites) {
    const item = element("li", "favorite-item");
    const restore = element("button", "favorite-question", prompt);
    const remove = element("button", "secondary-button favorite-remove", "삭제");
    restore.type = remove.type = "button";
    restore.addEventListener("click", () => fillQuestion(prompt));
    remove.setAttribute("aria-label", `저장한 질문 삭제: ${prompt}`);
    remove.addEventListener("click", () => {
      const index = favorites.indexOf(prompt);
      if (!changeFavorite(prompt)) return;
      const next = list.children[Math.min(index, list.children.length - 1)]?.firstElementChild;
      (next ?? byId("favorites-title")).focus();
    });
    item.append(restore, remove);
    list.append(item);
  }
}

function changeFavorite(prompt) {
  const saved = favorites.includes(prompt);
  const next = saved ? favorites.filter((value) => value !== prompt) : [prompt, ...favorites];
  try {
    localStorage.setItem(favoritesKey, JSON.stringify(next));
  } catch {
    showState("error", "즐겨찾기를 저장하지 못했어요", "브라우저에서 이 사이트의 저장 공간 사용을 허용해 주세요.");
    requestState.scrollIntoView({ block: "nearest" });
    return false;
  }
  favorites = next;
  for (const button of conversation.querySelectorAll(".favorite-toggle")) {
    if (button.dataset.favoriteQuestion === prompt) button.textContent = favoriteLabel(!saved);
  }
  renderFavorites();
  return true;
}

function favoriteLabel(saved) {
  return saved ? "즐겨찾기 해제" : "즐겨찾기 추가";
}

function addTurn(prompt, render, focus = true) {
  const turn = element("article", "conversation-turn");
  const user = element("div", "turn-question");
  user.append(element("span", "turn-kicker", "질문"), element("p", "", prompt));
  const result = element("div", "turn-result");
  result.tabIndex = -1;
  turn.append(user, result);
  render(result);
  conversation.append(turn);
  byId("results-empty").hidden = true;
  showState();
  showView("results", { focus: false });
  if (focus) {
    result.focus({ preventScroll: true });
    turn.scrollIntoView({ block: "start" });
  }
}

function addResult(prompt, detail, requestedMetric) {
  addTurn(prompt, (target) => {
    const panel = window.JejuResults.render(target, detail, catalog, {
      onMonthly: requestMonthly,
      onUsePeriod: (response) => useCoveragePeriod(response, requestedMetric),
      onReset: reopenSearch,
    });
    if (detail.analysis === "inspect_coverage" || prompt.length > question.maxLength) return;
    const actions = panel.querySelector(".result-actions");
    const favorite = element("button", "secondary-button favorite-toggle", favoriteLabel(favorites.includes(prompt)));
    favorite.type = "button";
    favorite.dataset.favoriteQuestion = prompt;
    favorite.addEventListener("click", () => changeFavorite(prompt));
    actions.insertBefore(favorite, actions.querySelector(".copy-status"));
  });
}

function manualQuestion(params) {
  const area = params.district ?? catalog.districts.map(({ name }) => name).join("·");
  const indicator = catalog.metrics.find(({ id }) => id === params.metric)?.label ?? "";
  return `${periodLabel(params.start_month, params.end_month)} ${area} 주말 ${indicator} 비교`;
}

function startManual(params, prompt = manualQuestion(params), analysis = "compare_groups", { reveal = false, form = manualForm } = {}) {
  return run(async () => {
    const result = await request("/api/compare-groups", params);
    activeContext = { ...params, analysis };
    setManual(params);
    addResult(prompt, { analysis, params, result });
  }, {
    form, title: analysis === "monthly_trend" ? "월별 수치를 확인하고 있어요" : "비교 수치를 집계하고 있어요",
    description: "선택한 지역과 기간의 토·일 카드 이용 자료를 불러오는 중입니다.",
    errorTitle: "비교 결과를 불러오지 못했어요",
    reveal,
  });
}

function requestMonthly({ params, result }) {
  const selection = {
    district: result.district ?? params.district ?? null,
    visitor_type: result.visitor_type ?? params.visitor_type ?? null,
    start_month: params.start_month,
    end_month: params.end_month,
    metric: params.metric,
  };
  void startManual(selection, monthlyQuestion, "monthly_trend", { reveal: true });
}

function useCoveragePeriod({ result }, requestedMetric) {
  setManual({
    district: result.district,
    visitor_type: result.visitor_type,
    metric: requestedMetric,
    start_month: result.observed_start_month,
    end_month: result.observed_end_month,
  });
  const params = readManual();
  if (params) void startManual(params, undefined, "compare_groups", { reveal: true });
}

function choiceControls(kind, message, body, host) {
  const list = element("div", "choice-list");
  const followup = (label, supplement, selection = {}) => {
    const button = element("button", "choice-button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      const context = body.context ? { ...body.context, ...selection } : null;
      const groupContext = body.group_context ? { ...body.group_context, ...selection } : null;
      const next = {
        ...body,
        question: Array.from(supplement).slice(0, question.maxLength).join(""),
        context,
        group_context: groupContext,
      };
      const display = `${message}\n선택한 조건: ${label}`;
      void runAgent(next, display, true);
    });
    list.append(button);
  };
  const selectedDistrict = catalog.districts.find(({ name }) => body.question?.includes(name));
  const area = selectedDistrict?.name ?? body.context?.district ?? body.group_context?.district;
  const scope = catalog.districts.filter(({ name }) => !area || name === area);
  const months = area ? scope[0]?.months ?? [] : catalog.comparison_months;
  if (kind === "region") {
    for (const entry of catalog.districts) followup(entry.name, `지역은 ${entry.name}으로 선택합니다. ${body.question}`, { district: entry.name });
  } else if (kind === "period") {
    const years = [...new Set(months.map((month) => month.slice(0, 4)))].slice(-5);
    for (const year of years) {
      const included = months.filter((month) => month.startsWith(year));
      const first = included[0];
      const last = included.at(-1);
      const label = periodLabel(first, last);
      followup(label, `비교 기간은 ${first}부터 ${last}까지입니다. ${body.question}`, { start_month: first, end_month: last });
    }
  } else if (kind === "visitor") {
    const types = new Map(scope.flatMap(({ visitor_types }) => visitor_types).map(({ id, label }) => [id, label]));
    for (const [id, label] of types) followup(label, `관광객 유형은 ${label}입니다. ${body.question}`, { visitor_type: id });
  }
  if (list.childElementCount) host.append(list);
  else {
    const manual = element("button", "secondary-button", "조건 직접 선택");
    manual.type = "button";
    manual.dataset.analysisAction = "";
    manual.addEventListener("click", openManual);
    host.append(manual);
  }
}

function showClarification(prompt, body, message) {
  const kind = /어느 지구|어느 지역/.test(message) ? "region"
    : /어느 기간|시작월과 종료월/.test(message) ? "period"
    : /어느 관광객/.test(message) ? "visitor" : "unsupported";
  const titles = { region: "어느 지역을 볼까요?", period: "어느 기간이 궁금하세요?", visitor: "어느 관광객 유형을 볼까요?", unsupported: "조회할 수 있는 범위를 확인해 주세요" };
  addTurn(prompt, (target) => {
    const panel = element("div", "clarification-panel");
    panel.append(element("h2", "", titles[kind]), element("p", "", message));
    choiceControls(kind, prompt, body, panel);
    const back = element("button", "back-button", "← 질문으로 돌아가기");
    back.type = "button";
    back.dataset.analysisAction = "";
    back.addEventListener("click", reopenSearch);
    panel.append(back);
    target.append(panel);
  });
}

async function respectBothRegions(response, body) {
  const names = catalog.districts.map(({ name }) => name);
  const explicitBoth = names.length === 2 && (/두\s*(?:구도심|지역)|양쪽 지역/.test(body.question)
    || names.every((name) => body.question.includes(name)));
  const narrowed = /(?:제주시|서귀포시?|구도심)\s*(?:만|에 한해)/.test(body.question);
  if (!explicitBoth || narrowed || !["ok", "coverage"].includes(response.status)) return response;
  const domestic = /내국인/.test(body.question);
  const chinese = /중국인/.test(body.question);
  const priorVisitor = body.context ? body.context.visitor_type : body.group_context?.visitor_type;
  const visitorType = /전체 관광객|모든 관광객/.test(body.question) || (domestic && chinese) ? null
    : domestic ? "domestic"
    : chinese ? "chinese"
    : priorVisitor ?? null;
  const params = { ...response.params, district: null, visitor_type: visitorType };
  if (response.params.district == null && (response.params.visitor_type ?? null) === visitorType) return response;
  if (response.status === "ok") {
    const result = await request("/api/compare-groups", params);
    return { status: "ok", analysis: response.analysis === "monthly_trend" ? "monthly_trend" : "compare_groups", params, result };
  }
  const months = scopeMonths(null, visitorType);
  if (!months.length) return response;
  const result = response.result;
  const available = months.filter((month) =>
    (!result.requested_start_month || month >= result.requested_start_month)
    && (!result.requested_end_month || month <= result.requested_end_month));
  const visitorLabel = catalog.districts.flatMap(({ visitor_types }) => visitor_types).find(({ id }) => id === visitorType)?.label;
  return {
    ...response,
    params,
    result: {
      ...result,
      district: null,
      visitor_type: visitorType,
      visitor_type_label: visitorLabel ?? null,
      months,
      observed_start_month: months[0],
      observed_end_month: months.at(-1),
      available_months: available,
    },
  };
}

function runAgent(body, display = body.question, reveal = false) {
  return run(async () => {
    const response = await respectBothRegions(await request("/api/agent", body), body);
    if (response.status === "clarify") {
      showClarification(display, body, response.message);
    } else if (response.status === "coverage") {
      const requestedMetric = /건수|횟수/.test(body.question) ? "transactions"
        : /금액|이용액|소비액/.test(body.question) ? "amount"
        : body.context?.metric ?? body.group_context?.metric ?? "transactions";
      addResult(display, response, requestedMetric);
    } else if (response.status === "ok") {
      activeContext = { ...response.params, analysis: response.analysis };
      setManual(response.params);
      addResult(display, response);
    } else {
      throw new Error("분석 상태를 확인하지 못했어요. 질문을 다시 보내 주세요.");
    }
    question.value = "";
  }, {
    form: agentForm, title: "질문에 맞는 자료를 찾고 있어요",
    description: "질문의 지역과 기간을 해석하고 카드 이용 자료를 확인하는 중입니다.",
    errorTitle: "질문을 처리하지 못했어요",
    reveal,
  });
}

function guardUnsupported(prompt) {
  const industry = /(?:음식점|외식|식당|카페)\s*(?:업종|만|의|카드|매출|소비|이용|결제|비교)|업종별|업종만/;
  const message = industry.test(prompt)
    ? "현재 자료에는 업종 구분이 없어 음식점이나 카페의 카드 이용만 따로 조회할 수 없습니다."
    : /애월|구좌|한림|조천|성산|표선|남원|중문|대정|한경|우도|추자/.test(prompt)
      ? `현재 자료에서 지역별로 비교할 수 있는 곳은 ${catalog.districts.map(({ name }) => name).join(", ")}입니다.`
      : "";
  if (!message) return false;
  showState();
  showClarification(prompt, {}, message);
  return true;
}

function configureSuggestions() {
  suggestions.clear();
  const months = catalog.comparison_months;
  const last = months.at(-1);
  if (!last) return;
  const areas = catalog.districts.length === 2 ? "두 구도심" : "조회 가능한 지역";
  const metricIds = new Set(catalog.metrics.map(({ id }) => id));
  const add = (id, metric, prompt, first = last, analysis = "compare_groups") => {
    if (!metricIds.has(metric)) return;
    suggestions.set(id, {
      analysis,
      prompt,
      params: { district: null, visitor_type: null, start_month: first, end_month: last, metric },
    });
  };
  add("transactions", "transactions", `${monthLabel(last)} ${areas}의 주말 카드 이용 건수를 비교해 주세요.`);
  add("amount", "amount", `${monthLabel(last)} ${areas}의 주말 카드 이용 금액을 비교해 주세요.`);
  const first = months.slice(-3).find((month) => monthIndex(last) - monthIndex(month) < 120);
  if (first && first !== last) {
    add("trend", "transactions", `${periodLabel(first, last)} ${areas}의 월별 주말 카드 이용 건수 추이를 보여주세요.`, first, "monthly_trend");
  }
}

function loadCatalog() {
  return run(async () => {
    const result = await request("/api/options");
    const districts = result.districts.filter(({ visitor_types }) => visitor_types?.some(({ months }) => months.length))
      .map(({ visitor_types, ...entry }) => ({ ...entry, visitor_types: visitor_types.filter(({ months }) => months.length) }));
    if (!districts.length || !result.metrics.length) throw new Error("조회할 수 있는 지역이나 지표가 없습니다.");
    catalog = { ...result, districts };
    const months = [...new Set(districts.flatMap(({ months }) => months))].sort();
    const period = periodLabel(months[0], months.at(-1));
    byId("data-name").textContent = catalog.data_name;
    const regions = districts.map(({ name }) => name).join(" · ");
    byId("data-coverage").textContent = `${catalog.mode === "demo" ? "합성 데모 · " : ""}${regions} · ${period} · 업종 구분 없음`;
    byId("data-scope").hidden = false;
    byId("availability-note").textContent = catalog.ai_available
      ? "" : "지금은 예시 질문이나 데이터 둘러보기에서 비교할 수 있어요.";
    byId("availability-note").hidden = catalog.ai_available;
    setManual();
    configureSuggestions();
  }, {
    title: "조회할 수 있는 자료를 확인하고 있어요", description: "지역과 조회 기간을 불러오는 중입니다.",
    errorTitle: "조회 조건을 불러오지 못했어요",
  });
}

manualForm.addEventListener("change", () => {
  if (retryAction) showState();
});
district.addEventListener("change", () => {
  updateVisitorChoices(visitor.value);
  updateMonthChoices(start.value, end.value);
});
visitor.addEventListener("change", () => updateMonthChoices(start.value, end.value));
start.addEventListener("change", updateEndChoices);
manualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const params = readManual();
  if (params && !busy) void startManual(params);
});
question.addEventListener("input", () => {
  if (!busy) showState();
});
agentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = question.value.trim();
  if (busy || !catalog) return;
  if (!prompt) {
    showState("info", "질문을 입력해 주세요", "기간이나 지역을 포함하면 더 정확하게 비교할 수 있어요.");
    question.focus();
    return;
  }
  const selected = [...suggestions.values()].find((suggestion) => suggestion.prompt === prompt);
  if (selected) {
    void startManual(selected.params, selected.prompt, selected.analysis, { form: agentForm });
    return;
  }
  if (!catalog.ai_available) {
    showState("info", "자유 질문을 사용할 수 없어요", "아래 예시 질문을 선택하거나 데이터 둘러보기에서 조건을 직접 선택해 주세요.");
    return;
  }
  if (guardUnsupported(prompt)) return;
  const groupContext = readManual();
  const context = activeContext ?? groupContext;
  const payload = { question: prompt, context, group_context: groupContext };
  void runAgent(payload);
});
question.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  agentForm.requestSubmit();
});
retry.addEventListener("click", () => retryAction?.());
for (const button of suggestionButtons) {
  button.addEventListener("click", () => {
    const selected = suggestions.get(button.dataset.suggestion);
    if (selected) fillQuestion(selected.prompt);
  });
}
for (const link of navLinks) {
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showView(link.dataset.view);
  });
}
window.addEventListener("hashchange", () => {
  const view = locationView();
  if (view) showView(view, { updateLocation: false });
});

renderFavorites();
showView(locationView() ?? "home", { focus: false, updateLocation: false });
void loadCatalog();
