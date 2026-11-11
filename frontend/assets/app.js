"use strict";

const byId = (id) => document.getElementById(id);
const compareForm = byId("compare-form");
const agentForm = byId("agent-form");
const groupCompareForm = byId("group-compare-form");
const groupDistrict = byId("group-district");
const groupVisitorType = byId("group-visitor-type");
const groupStartMonth = byId("group-start-month");
const groupEndMonth = byId("group-end-month");
const groupMetric = byId("group-metric");
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
let groupPending = false;
let agentPending = false;
let activeContext;
let groupMonths = [];
const maxComparisonMonths = 120;
const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const analysisLabels = {
  compare_weekdays: "한 집단 토·일 비교",
  compare_groups: "집단별 토·일 비교",
  monthly_trend: "월별 토·일 추이",
  inspect_coverage: "조회 가능 기간 확인",
};

function isBusy() {
  return pending || groupPending || agentPending;
}

function updateAvailability() {
  const disabled = isBusy() || !options;
  byId("compare-fields").disabled = disabled;
  byId("group-compare-fields").disabled = disabled;
  byId("agent-fields").disabled = disabled || !options?.ai_available;
  for (const element of [groupStartMonth, groupEndMonth, groupMetric, byId("group-submit")]) {
    element.disabled = !groupMonths.length;
  }
}

function setPending(next) {
  pending = next;
  updateAvailability();
  results.setAttribute("aria-busy", String(next));
}

function setGroupPending(next) {
  groupPending = next;
  updateAvailability();
  byId("group-comparison").setAttribute("aria-busy", String(next));
}

function setAgentPending(next) {
  agentPending = next;
  updateAvailability();
  agentForm.setAttribute("aria-busy", String(next));
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

function updateGroupEndMonths() {
  if (!groupStartMonth.value) return;
  const first = monthIndex(groupStartMonth.value);
  const allowed = Array.from(groupEndMonth.options).filter((option) => {
    const offset = monthIndex(option.value) - first;
    option.disabled = offset < 0 || offset >= maxComparisonMonths;
    return !option.disabled;
  });
  if (!allowed.some((option) => option.value === groupEndMonth.value)) {
    groupEndMonth.value = groupEndMonth.value < groupStartMonth.value ? groupStartMonth.value : allowed.at(-1)?.value ?? "";
  }
}

function groupScopeCandidates() {
  return options.districts
    .filter(({ name }) => !groupDistrict.value || name === groupDistrict.value)
    .flatMap(districtGroups);
}

function updateGroupVisitorTypes(preferred) {
  const groups = new Map(groupScopeCandidates().map(({ id, label }) => [id, label]));
  setChoices(groupVisitorType, [
    { value: "", label: "전체 관광객" },
    ...Array.from(groups, ([value, label]) => ({ value, label })),
  ], preferred ?? "");
}

function updateGroupPeriods(preferredStart, preferredEnd, includeBounds = false) {
  const candidates = groupScopeCandidates().filter(({ id }) => !groupVisitorType.value || id === groupVisitorType.value);
  const [firstGroup, ...others] = candidates.map(({ months }) => new Set(months));
  groupMonths = firstGroup ? [...firstGroup].filter((month) => others.every((months) => months.has(month))).sort() : [];

  const requestedBounds = includeBounds ? [preferredStart, preferredEnd].filter(Boolean) : [];
  const months = [...new Set([...groupMonths, ...requestedBounds])].sort();
  const choices = months.map((value) => ({ value, label: monthLabel(value) }));
  const last = months.at(-1);
  const first = months.find((month) => monthIndex(last) - monthIndex(month) < maxComparisonMonths);
  setChoices(groupStartMonth, choices, months.includes(preferredStart) ? preferredStart : first);
  setChoices(groupEndMonth, choices, months.includes(preferredEnd) ? preferredEnd : last);
  updateGroupEndMonths();
  updateAvailability();
  if (groupMonths.length) {
    feedback("group-compare", "");
  } else {
    byId("group-compare-result").hidden = true;
    feedback("group-compare", "선택한 집단이 토요일과 일요일을 함께 비교할 수 있는 달이 없습니다.");
  }
}

function setupGroupFilters(params = {}, includeBounds = false) {
  setChoices(groupDistrict, [
    { value: "", label: "전체 지역" },
    ...options.districts.map(({ name }) => ({ value: name, label: name })),
  ], params.district ?? "");
  updateGroupVisitorTypes(params.visitor_type);
  setChoices(groupMetric, options.metrics.map(({ id, label }) => ({ value: id, label })), params.metric ?? "transactions");
  updateGroupPeriods(params.start_month, params.end_month, includeBounds);
  return groupMonths.length > 0;
}

function readGroupConditions() {
  return {
    district: groupDistrict.value || null,
    visitor_type: groupVisitorType.value || null,
    start_month: groupStartMonth.value,
    end_month: groupEndMonth.value,
    metric: groupMetric.value,
  };
}

function scopeLabels(scope) {
  const typeLabel = options.districts.flatMap(districtGroups).find(({ id }) => id === scope.visitor_type)?.label;
  return [scope.district ?? "전체 지역", scope.visitor_type_label ?? typeLabel ?? "전체 관광객"];
}

function groupMonthlyTable(group, valueFor, unit, basis) {
  const details = makeElement("details", "group-monthly-details");
  const toggle = makeElement("summary", "", "월별 토·일 이용 보기");
  const table = makeElement("table", "group-monthly-table");
  const caption = makeElement("caption", "sr-only", `${group.district} ${group.visitor_type_label} 월별 ${basis}`);
  const head = makeElement("thead");
  const heading = makeElement("tr");
  for (const label of ["월", "토요일", "일요일", "앞선 요일"]) {
    const cell = makeElement("th", "", label);
    cell.scope = "col";
    heading.append(cell);
  }
  head.append(heading);

  const body = makeElement("tbody");
  for (const month of group.months) {
    const tr = makeElement("tr");
    const label = makeElement("th", "", monthLabel(month.month));
    label.scope = "row";
    tr.append(label);
    for (const weekday of ["토요일", "일요일"]) {
      const row = month.rows.find((entry) => entry.weekday === weekday);
      tr.append(makeElement("td", "", formatted(valueFor(row), unit)));
    }
    tr.append(makeElement("td", "", month.winner ?? "같음"));
    body.append(tr);
  }
  table.append(caption, head, body);
  details.append(toggle, table);
  return details;
}

function renderGroupCard(group, valueFor, unit, basis) {
  const card = makeElement("article", "group-card");
  const label = makeElement("h3", "", group.district);
  const segment = makeElement("p", "group-segment", group.visitor_type_label);
  const totals = makeElement("dl", "group-totals");
  for (const row of group.rows) {
    const pair = makeElement("div", "group-total");
    if (row.weekday === group.winner) pair.classList.add("group-total-leading");
    pair.append(makeElement("dt", "", row.weekday), makeElement("dd", "", formatted(valueFor(row), unit)));
    totals.append(pair);
  }

  const leader = group.winner
    ? `${group.winner}이 ${formatted(group.difference, unit)} 더 높아요.`
    : "두 요일의 값이 같아요.";
  const outcome = makeElement("p", "group-outcome", leader);
  const { saturday, sunday, ties } = group.monthly_wins;
  const winCounts = `앞선 달 · 토요일 ${saturday}개월 · 일요일 ${sunday}개월${ties ? ` · 같음 ${ties}개월` : ""}`;
  card.append(label, segment, totals, outcome, makeElement("p", "group-win-counts", winCounts));

  const moreFrequent = saturday > sunday ? "토요일" : sunday > saturday ? "일요일" : null;
  if (group.winner && moreFrequent && group.winner !== moreFrequent) {
    const message = `${basis}에서 앞선 요일은 ${group.winner}입니다. 앞선 달이 더 많은 요일은 ${moreFrequent}입니다.`;
    card.append(makeElement("p", "group-monthly-reversal", message));
  }
  card.append(groupMonthlyTable(group, valueFor, unit, basis));
  return card;
}

function renderGroupComparison(result, openMonths = false) {
  const daily = result.comparison_basis === "daily_average";
  const basis = daily ? "일평균" : "기간 합계";
  const metricLabel = options.metrics.find(({ id }) => id === result.metric)?.label ?? result.metric;
  const period = periodLabel(result.start_month, result.end_month);
  const valueFor = (row) => daily ? row.daily_average : row.total;
  const unit = result.unit ?? "";
  byId("group-compare-scope").textContent = [...scopeLabels(result), period, metricLabel, basis].join(" · ");
  byId("group-compare-summary").textContent = result.has_reversal
    ? "집단에 따라 앞선 요일이 달라요."
    : "집단별로 앞선 요일을 확인하세요.";
  byId("group-compare-note").textContent = daily
    ? "모든 집단에 공통으로 있는 달을 사용했습니다. 각 요일의 합계를 해당 요일의 일수로 나눴습니다."
    : "모든 집단에 공통으로 있는 달의 관측 합계입니다. 두 요일의 일수 차이가 반영될 수 있습니다.";
  const cards = byId("group-compare-cards");
  cards.replaceChildren(...result.groups.map((group) => renderGroupCard(group, valueFor, unit, basis)));
  if (openMonths) {
    for (const details of cards.querySelectorAll(".group-monthly-details")) details.open = true;
  }
  byId("group-included-months").textContent = `${result.included_months.length}개월 · ${result.included_months.map(monthLabel).join(", ")}`;
  byId("group-excluded-row").hidden = result.excluded_months.length === 0;
  byId("group-excluded-months").textContent = result.excluded_months.map(monthLabel).join(", ");

  const snapshot = result.snapshot ?? options.snapshot;
  const hasObservedPeriod = snapshot?.observed_start_month && snapshot?.observed_end_month;
  byId("group-observed-row").hidden = !hasObservedPeriod;
  byId("group-observed-period").textContent = hasObservedPeriod
    ? periodLabel(snapshot.observed_start_month, snapshot.observed_end_month)
    : "";
  const source = byId("group-compare-source");
  source.textContent = result.mode === "demo" ? `${result.data_name} (데모 참고 자료)` : result.data_name;
  setSource(source, result.source_url);
  byId("group-compare-result").hidden = false;
}

function rememberManualAnalysis(analysis, params) {
  activeContext = { ...params, analysis };
  byId("agent-analysis").hidden = true;
  feedback("agent", "");
}

async function compareGroups(remember = false) {
  const params = readGroupConditions();
  setGroupPending(true);
  feedback("group-compare", "공통 관측 기간의 집단별 결과를 불러오는 중입니다.");
  try {
    const result = await request("/api/compare-groups", params);
    renderGroupComparison(result);
    if (remember) rememberManualAnalysis("compare_groups", params);
    feedback("group-compare", "집단별 비교를 완료했습니다.");
  } catch (error) {
    byId("group-compare-result").hidden = true;
    feedback("group-compare", error.message, "error");
  } finally {
    setGroupPending(false);
  }
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

async function compare(remember = false) {
  const params = readConditions();
  setPending(true);
  feedback("agent", "");
  feedback("compare", "카드 이용을 비교하는 중입니다.");
  try {
    const result = await request("/api/compare", params);
    renderResult(result);
    if (remember) rememberManualAnalysis("compare_weekdays", { ...params, visitor_type: result.visitor_type ?? params.visitor_type });
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

function describePeriod(first, last) {
  if (first && last) return periodLabel(first, last);
  if (first) return `${monthLabel(first)} 이후`;
  if (last) return `${monthLabel(last)} 이전`;
  return "";
}

function showAgentAnalysis(analysis, params, result) {
  const coverage = analysis === "inspect_coverage";
  const conditions = scopeLabels({ ...params, visitor_type_label: result.visitor_type_label });
  if (!coverage) {
    conditions.push(periodLabel(params.start_month, params.end_month));
    conditions.push(options.metrics.find(({ id }) => id === params.metric)?.label ?? params.metric);
  }
  byId("agent-analysis-type").textContent = analysisLabels[analysis];
  byId("agent-analysis-scope").textContent = conditions.join(" · ");

  const requestedPeriod = coverage ? describePeriod(result.requested_start_month, result.requested_end_month) : "";
  byId("agent-requested-row").hidden = !requestedPeriod;
  byId("agent-requested-period").textContent = requestedPeriod;
  const observedPeriod = coverage ? describePeriod(result.observed_start_month, result.observed_end_month) : "";
  byId("agent-observed-row").hidden = !observedPeriod;
  byId("agent-observed-period").textContent = observedPeriod;

  const source = byId("agent-source");
  byId("agent-source-row").hidden = !coverage || !result.source_url;
  source.textContent = result.data_name ?? "";
  setSource(source, result.source_url);

  const link = byId("agent-result-link");
  link.hidden = coverage;
  if (!coverage) link.href = analysis === "compare_weekdays" ? "#results-heading" : "#groups-heading";
  byId("agent-analysis").hidden = false;
}

async function loadOptions() {
  setPending(true);
  setGroupPending(true);
  retry.hidden = true;
  feedback("compare", "");
  feedback("group-compare", "공통 관측 기간을 불러오는 중입니다.");
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
      ? "지역, 관광객 구분, 기간, 지표를 문장으로 알려주세요. 생략한 조건은 직전 분석이나 화면의 선택을 참고합니다."
      : "NVIDIA 연결 설정이 필요합니다. 지금은 비교 조건을 직접 골라 실행할 수 있습니다.";
    const updates = [compare()];
    if (setupGroupFilters()) updates.push(compareGroups());
    await Promise.all(updates);
  } catch (error) {
    options = undefined;
    byId("mode-badge").textContent = "연결 확인 필요";
    feedback("compare", error.message === "Failed to fetch" ? "백엔드 서버에 연결할 수 없습니다." : error.message, "error");
    feedback("group-compare", "분석 조건을 불러오지 못했습니다.", "error");
    byId("empty-message").textContent = "백엔드 연결을 확인한 뒤 다시 시도해 주세요.";
    retry.hidden = false;
  } finally {
    setPending(false);
    setGroupPending(false);
  }
}

district.addEventListener("change", () => {
  updateVisitorTypes(visitorType.value);
  updatePeriods(startMonth.value, endMonth.value);
});
visitorType.addEventListener("change", () => updatePeriods(startMonth.value, endMonth.value));
startMonth.addEventListener("change", updateEndMonths);
groupStartMonth.addEventListener("change", updateGroupEndMonths);
groupDistrict.addEventListener("change", () => {
  updateGroupVisitorTypes(groupVisitorType.value);
  updateGroupPeriods(groupStartMonth.value, groupEndMonth.value);
});
groupVisitorType.addEventListener("change", () => updateGroupPeriods(groupStartMonth.value, groupEndMonth.value));
retry.addEventListener("click", loadOptions);
compareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isBusy()) void compare(true);
});

groupCompareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isBusy() && groupMonths.length) void compareGroups(true);
});

for (const example of agentForm.querySelectorAll("[data-agent-question]")) {
  example.addEventListener("click", () => {
    question.value = example.dataset.agentQuestion;
    agentForm.requestSubmit();
  });
}

agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isBusy() || !options?.ai_available) return;
  if (!question.value.trim()) {
    feedback("agent", "비교하고 싶은 내용을 입력해 주세요.", "error");
    return;
  }

  const body = {
    question: question.value.trim(),
    context: activeContext ?? readConditions(),
    ...(groupMonths.length ? { group_context: readGroupConditions() } : {}),
  };
  setAgentPending(true);
  feedback("compare", "");
  feedback("agent", "질문에 맞는 분석을 찾는 중입니다.");
  try {
    const response = await request("/api/agent", body);
    if (response.status === "clarify") {
      feedback("agent", response.message);
      return;
    }

    const { params, result } = response;
    const analysis = response.analysis ?? "compare_weekdays";
    showAgentAnalysis(analysis, params, result);
    if (response.status === "coverage") {
      feedback("agent", response.message);
      return;
    }

    if (analysis === "compare_weekdays") {
      district.value = params.district;
      metric.value = params.metric;
      updateVisitorTypes(params.visitor_type ?? result.visitor_type);
      updatePeriods(params.start_month, params.end_month, [params.start_month, params.end_month]);
      renderResult(result);
    } else {
      setupGroupFilters(params, true);
      renderGroupComparison(result, analysis === "monthly_trend");
    }
    activeContext = { ...params, analysis };
    feedback("agent", "분석을 완료했습니다.");
  } catch (error) {
    feedback("agent", `${error.message} 아래 비교 조건으로 직접 실행할 수 있습니다.`, "error");
  } finally {
    setAgentPending(false);
  }
});

void loadOptions();
