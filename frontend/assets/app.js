"use strict";

const byId = (id) => document.getElementById(id);
const compareForm = byId("compare-form");
const agentForm = byId("agent-form");
const district = byId("district");
const visitorType = byId("visitor-type");
const startMonth = byId("start-month");
const endMonth = byId("end-month");
const metric = byId("metric");
const question = byId("question");
const retry = byId("retry-button");
const results = byId("results");

let options;
let pending = false;
const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

function setPending(next) {
  pending = next;
  byId("compare-fields").disabled = next || !options;
  byId("agent-fields").disabled = next || !options?.ai_available;
  results.setAttribute("aria-busy", String(next));
}

function feedback(target, message, tone = "info") {
  const element = byId(`${target}-feedback`);
  element.textContent = message;
  element.dataset.tone = tone;
}

async function request(url, body) {
  const init = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (response.ok && payload) return payload;

  const detail = payload?.detail;
  const message = typeof detail === "string" ? detail : "조건과 서버 상태를 확인한 뒤 다시 시도해 주세요.";
  throw new Error(message);
}

function setMode(mode, snapshot) {
  const badge = byId("mode-badge");
  badge.dataset.mode = mode;
  badge.textContent = mode === "real" ? "실제 데이터" : "데모 데이터";
  byId("demo-banner").hidden = mode !== "demo";
  const start = snapshot?.observed_start_month;
  const end = snapshot?.observed_end_month;
  const hasObservationPeriod = mode === "real" && start && end;
  byId("observation-banner").hidden = !hasObservationPeriod;
  if (hasObservationPeriod) {
    byId("observation-banner-period").textContent = `${monthLabel(start)} ~ ${monthLabel(end)}에 관측된 관광객 카드 이용 자료입니다.`;
  }
}

function setSource(link, url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid source URL");
    link.href = parsed.href;
  } catch {
    link.removeAttribute("href");
  }
}

function setChoices(select, choices, selected) {
  select.replaceChildren(...choices.map(({ value, label }) => new Option(label, value)));
  if (choices.some((choice) => choice.value === selected)) select.value = selected;
}

function monthLabel(value) {
  return value.replace("-", ".");
}

function periodLabel(first, last) {
  return first === last ? monthLabel(first) : `${monthLabel(first)} ~ ${monthLabel(last)}`;
}

function monthIndex(value) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthFromIndex(value) {
  const year = String(Math.floor(value / 12)).padStart(4, "0");
  const month = String(value % 12 + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function districtGroups(entry) {
  if (Array.isArray(entry?.visitor_types)) {
    return entry.visitor_types.filter((group) => group.months.length);
  }
  return entry?.months?.length ? [{ id: "unspecified", label: "구분 정보 없음", months: entry.months }] : [];
}

function selectedDistrict() {
  return options.districts.find(({ name }) => name === district.value);
}

function updateVisitorTypes(preferred) {
  const groups = districtGroups(selectedDistrict());
  const selected = groups.some(({ id }) => id === preferred) ? preferred : "domestic";
  setChoices(visitorType, groups.map(({ id, label }) => ({ value: id, label })), selected);
}

function updatePeriods(preferredStart, preferredEnd, requestedBounds = []) {
  const group = districtGroups(selectedDistrict()).find(({ id }) => id === visitorType.value);
  const available = [...group.months].sort();
  const first = monthIndex(available[0]);
  const last = monthIndex(available.at(-1));
  const months = [];

  for (let current = first; current <= last; current += 1) {
    months.push(monthFromIndex(current));
  }

  const choices = [...new Set([...months, ...requestedBounds])].sort()
    .map((value) => ({ value, label: monthLabel(value) }));
  const defaultStart = monthFromIndex(Math.max(first, last - 2));
  const isAvailable = (value) => choices.some((choice) => choice.value === value);
  setChoices(startMonth, choices, isAvailable(preferredStart) ? preferredStart : defaultStart);
  setChoices(endMonth, choices, isAvailable(preferredEnd) ? preferredEnd : available.at(-1));
  updateEndMonths();
}

function updateEndMonths() {
  for (const option of endMonth.options) option.disabled = option.value < startMonth.value;
  if (endMonth.value < startMonth.value) endMonth.value = startMonth.value;
}

function readConditions() {
  return {
    district: district.value,
    ...(selectedDistrict().visitor_types ? { visitor_type: visitorType.value } : {}),
    start_month: startMonth.value,
    end_month: endMonth.value,
    metric: metric.value,
  };
}

function formatted(value, unit) {
  if (value === null || value === undefined) return "—";
  const magnitude = Math.abs(value);
  if (magnitude > 0 && magnitude < 0.01) return `${value < 0 ? "−" : ""}<0.01${unit}`;
  return `${numberFormat.format(value)}${unit}`;
}

function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function renderChart(rows, valueFor, unit) {
  const max = Math.max(0, ...rows.map(valueFor));
  const bars = rows.map((row) => {
    const value = valueFor(row);
    const bar = makeElement("div", "chart-row");
    const label = makeElement("span", "chart-label", row.weekday);
    const number = makeElement("span", "chart-number", formatted(value, unit));
    const track = makeElement("div", "chart-track");
    const fill = makeElement("div", "chart-fill");
    fill.style.width = `${max > 0 ? Math.max(0, value / max) * 100 : 0}%`;
    track.append(fill);
    bar.append(label, number, track);
    return bar;
  });
  byId("chart-rows").replaceChildren(...bars);
}

function renderEvidence(rows, unit) {
  byId("evidence-rows").replaceChildren(...rows.map((row) => {
    const tr = makeElement("tr");
    const heading = makeElement("th", "", row.weekday);
    heading.scope = "row";
    tr.append(
      heading,
      makeElement("td", "", formatted(row.total, unit)),
      makeElement("td", "", formatted(row.days, "일")),
      makeElement("td", "", formatted(row.daily_average, unit)),
    );
    return tr;
  }));
}

function renderSnapshot(snapshot) {
  const first = snapshot?.observed_start_month;
  const last = snapshot?.observed_end_month;
  const hasPeriod = /^\d{4}-\d{2}$/.test(first ?? "") && /^\d{4}-\d{2}$/.test(last ?? "");
  byId("observation-row").hidden = !hasPeriod;
  byId("observation-period").textContent = hasPeriod ? periodLabel(first, last) : "";

  const collected = snapshot?.captured_at ? new Date(snapshot.captured_at) : null;
  const hasDate = collected !== null && !Number.isNaN(collected.getTime());
  byId("collection-row").hidden = !hasDate;
  byId("collection-date").textContent = hasDate ? collected.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

function renderResult(result) {
  const daily = result.comparison_basis === "daily_average";
  const basis = daily ? "일평균" : "기간 합계";
  const indicator = options.metrics.find(({ id }) => id === result.metric)?.label ?? result.metric;
  const period = periodLabel(result.start_month, result.end_month);
  const group = result.visitor_type_label ?? visitorType.selectedOptions[0]?.text;

  setMode(result.mode, result.snapshot ?? options.snapshot);
  byId("result-scope").textContent = [result.district, group, period, indicator].filter(Boolean).join(" · ");
  byId("basis-badge").textContent = basis;
  byId("basis-badge").hidden = false;
  byId("result-headline").textContent = result.winner
    ? `${result.winner}의 ${basis}가 ${formatted(Math.abs(result.difference), result.unit)} 더 높아요.`
    : `토요일과 일요일의 ${basis}가 같아요.`;
  byId("result-note").textContent = daily
    ? "각 요일의 합계를 해당 요일이 포함된 일수로 나눴습니다."
    : "각 요일의 관측 합계입니다. 두 요일이 포함된 일수 차이가 반영될 수 있습니다.";
  byId("chart-caption").textContent = `${basis} ${indicator}`;
  renderChart(result.rows, (row) => daily ? row.daily_average : row.total, result.unit);
  renderEvidence(result.rows, result.unit);

  byId("included-months").textContent = result.included_months.map(monthLabel).join(", ");
  byId("excluded-row").hidden = result.excluded_months.length === 0;
  byId("excluded-months").textContent = `${result.excluded_months.map(monthLabel).join(", ")} (비교 가능한 값 부족)`;
  renderSnapshot(result.snapshot ?? options.snapshot);
  const source = byId("result-source");
  source.textContent = result.mode === "demo" ? `${result.data_name} (참고한 데이터)` : result.data_name;
  setSource(source, result.source_url);
  byId("empty-result").hidden = true;
  byId("result-content").hidden = false;
}

async function compare() {
  setPending(true);
  feedback("agent", "");
  feedback("compare", "카드 이용을 비교하는 중입니다.");
  try {
    renderResult(await request("/api/compare", readConditions()));
    feedback("compare", "비교 결과를 갱신했습니다.");
  } catch (error) {
    feedback("compare", error.message, "error");
    byId("empty-message").textContent = "비교할 수치를 가져오지 못했습니다.";
    byId("empty-result").hidden = false;
    byId("result-content").hidden = true;
    byId("basis-badge").hidden = true;
  } finally {
    setPending(false);
  }
}

async function loadOptions() {
  setPending(true);
  retry.hidden = true;
  feedback("compare", "");
  byId("empty-message").textContent = "분석 가능한 조건을 불러오는 중입니다.";
  try {
    const loaded = await request("/api/options");
    const districts = loaded.districts.filter((entry) => districtGroups(entry).length);
    if (!districts.length || !loaded.metrics.length) throw new Error("분석 가능한 지역이나 지표가 없습니다.");
    options = { ...loaded, districts };
    setMode(options.mode, options.snapshot);
    setSource(byId("hero-source-link"), options.source_url);
    setChoices(district, options.districts.map(({ name }) => ({ value: name, label: name })), "제주시 구도심");
    setChoices(metric, options.metrics.map(({ id, label }) => ({ value: id, label })), "transactions");
    updateVisitorTypes();
    updatePeriods();
    byId("assistant-hint").textContent = options.ai_available
      ? "지역, 관광객 구분, 기간, 지표를 문장으로 알려주세요. 입력하지 않은 조건은 현재 선택을 참고합니다."
      : "NVIDIA 연결 설정이 필요합니다. 지금은 비교 조건을 직접 골라 실행할 수 있습니다.";
    await compare();
  } catch (error) {
    options = undefined;
    byId("mode-badge").textContent = "연결 확인 필요";
    feedback("compare", error.message === "Failed to fetch" ? "백엔드 서버에 연결할 수 없습니다." : error.message, "error");
    byId("empty-message").textContent = "백엔드 연결을 확인한 뒤 다시 시도해 주세요.";
    retry.hidden = false;
  } finally {
    setPending(false);
  }
}

district.addEventListener("change", () => {
  updateVisitorTypes(visitorType.value);
  updatePeriods(startMonth.value, endMonth.value);
});
visitorType.addEventListener("change", () => updatePeriods(startMonth.value, endMonth.value));
startMonth.addEventListener("change", updateEndMonths);
retry.addEventListener("click", loadOptions);
compareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pending) void compare();
});

agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending || !options?.ai_available) return;
  if (!question.value.trim()) {
    feedback("agent", "비교하고 싶은 내용을 입력해 주세요.", "error");
    return;
  }

  const body = { question: question.value.trim(), context: readConditions() };
  setPending(true);
  feedback("compare", "");
  feedback("agent", "질문에 맞는 비교 조건을 찾는 중입니다.");
  try {
    const response = await request("/api/agent", body);
    if (response.status === "clarify") {
      feedback("agent", response.message);
      return;
    }

    const params = response.params;
    district.value = params.district;
    metric.value = params.metric;
    updateVisitorTypes(params.visitor_type ?? response.result.visitor_type);
    updatePeriods(params.start_month, params.end_month, [params.start_month, params.end_month]);
    renderResult(response.result);
    feedback("agent", "질문에 맞춰 비교 조건과 결과를 갱신했습니다.");
    if (window.matchMedia("(max-width: 760px)").matches) byId("results-heading").focus();
  } catch (error) {
    feedback("agent", `${error.message} 위의 비교 조건으로 직접 실행할 수 있습니다.`, "error");
  } finally {
    setPending(false);
  }
});

void loadOptions();
