"use strict";

const byId = (id) => document.getElementById(id);
const compareForm = byId("compare-form");
const agentForm = byId("agent-form");
const groupCompareForm = byId("group-compare-form");
const regionMenu = byId("region-menu");
const regionShortcuts = regionMenu.querySelectorAll("[data-region-shortcut]");
const sidebarToggle = byId("sidebar-toggle");
const newQuestion = byId("new-question");
const settingsButton = byId("settings-button");
const conversation = byId("conversation-history");
const analysisDialog = byId("analysis-dialog");
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
const monthlyQuestion = "그 차이가 매달 비슷했나요?";
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
  newQuestion.disabled = disabled;
  settingsButton.disabled = disabled;
  for (const button of [...regionShortcuts, ...conversation.querySelectorAll("[data-monthly-action]")]) {
    button.disabled = disabled;
  }
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
  if (target === "group-compare") {
    const dialogFeedback = byId("dialog-group-feedback");
    dialogFeedback.textContent = message;
    dialogFeedback.dataset.tone = tone;
  }
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
  byId("observation-banner").hidden = mode !== "real";
  if (mode === "real") {
    byId("observation-banner-period").textContent = start && end
      ? `${readablePeriod(start, end)} 제주 구도심 관광객 카드 이용 자료`
      : "관광객의 과거 카드 이용 자료예요.";
  }
}

function sourceUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.href;
  } catch {
    return "";
  }
  return "";
}

function setSource(link, url) {
  const href = sourceUrl(url);
  if (href) link.href = href;
  else link.removeAttribute("href");
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

function readablePeriod(first, last) {
  const [firstYear, firstMonth] = first.split("-").map(Number);
  const start = `${firstYear}년 ${firstMonth}월`;
  if (first === last) return start;
  const [lastYear, lastMonth] = last.split("-").map(Number);
  const end = firstYear === lastYear ? `${lastMonth}월` : `${lastYear}년 ${lastMonth}월`;
  return `${start}~${end}`;
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
    { value: "", label: "모든 관광객 유형" },
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
    feedback("group-compare", "선택한 조건에서 토요일과 일요일을 함께 비교할 자료가 없어요.");
  }
}

function setupGroupFilters(params = {}, includeBounds = false) {
  const districts = options.districts.map(({ name }) => ({ value: name, label: name }));
  setChoices(groupDistrict, [
    { value: "", label: isTwoDowntowns(districts.map(({ value }) => value)) ? "두 구도심 모두" : "모든 지역" },
    ...districts,
  ], params.district ?? "");
  for (const shortcut of regionShortcuts) {
    const region = shortcut.dataset.regionShortcut;
    shortcut.hidden = Boolean(region) && !districts.some(({ value }) => value === region);
  }
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
  return [scope.district ?? "전체 지역", scope.visitor_type_label ?? typeLabel ?? "관광객 유형별"];
}

function comparisonPresentation(result) {
  const daily = result.comparison_basis === "daily_average";
  return {
    basis: daily ? "일평균" : "기간 합계",
    indicator: options.metrics.find(({ id }) => id === result.metric)?.label ?? result.metric,
    period: periodLabel(result.start_month, result.end_month),
    unit: result.unit ?? "",
    valueFor: (row) => daily ? row.daily_average : row.total,
    snapshot: result.snapshot ?? options.snapshot,
  };
}

function calculationNote(result, grouped = false) {
  const months = grouped ? "모든 선택 집단에 토·일 자료가 있는 공통 월을 사용했습니다." : "토·일 자료가 모두 있는 달을 사용했습니다.";
  const method = result.comparison_basis === "daily_average"
    ? "각 요일의 합계를 해당 요일이 포함된 일수로 나눴습니다."
    : "각 요일의 관측 합계를 비교했습니다. 요일별 일수 차이가 반영될 수 있습니다.";
  return `${months} ${method}`;
}

function resultHeadline(result, basis, unit) {
  if (!result.winner) return `${basis} 기준으로 토요일과 일요일이 같았습니다.`;
  const other = result.winner === "토요일" ? "일요일" : "토요일";
  return `${basis} 기준으로 ${result.winner}이 ${other}보다 ${formatted(result.difference, unit)} 높았습니다.`;
}

function groupLabel(group) {
  return `${group.district} ${group.visitor_type_label}`;
}

function monthlyWinsLabel({ saturday, sunday, ties }) {
  return `월별 우세 · 토요일 ${saturday}개월 · 일요일 ${sunday}개월 · 동률 ${ties}개월`;
}

function monthlyReversal(group, basis, monthCount) {
  const wins = group.monthly_wins[group.monthly_winner === "토요일" ? "saturday" : "sunday"];
  return `${basis}는 ${group.winner}이 앞섰고, 월별로는 ${group.monthly_winner}이 ${monthCount}개월 중 ${wins}개월 앞섰습니다.`;
}

function groupWinnerSummary(result) {
  const { saturday, sunday, ties } = result.group_wins;
  const counts = [
    saturday ? `토요일 우세 ${saturday}개` : "",
    sunday ? `일요일 우세 ${sunday}개` : "",
    ties ? `동률 ${ties}개` : "",
  ].filter(Boolean);
  return result.has_reversal
    ? `집단마다 앞선 요일이 달랐습니다. ${counts.join(" · ")}`
    : counts.join(" · ");
}

function readableGroupResult(result) {
  const { groups, group_wins: wins } = result;
  const districts = [...new Set(groups.map(({ district }) => district))];
  const domestic = groups.filter(({ visitor_type }) => visitor_type === "domestic");
  const chinese = groups.filter(({ visitor_type }) => visitor_type === "chinese");
  const sameWinner = (segments) => {
    const winner = segments[0]?.winner;
    if (segments.length === districts.length && winner && segments.every((segment) => segment.winner === winner)) return winner;
    return null;
  };
  const domesticWinner = sameWinner(domestic);
  const chineseWinner = sameWinner(chinese);
  const metric = result.metric === "transactions" ? "카드 이용 횟수가" : "카드 이용 금액이";
  const measure = result.comparison_basis === "daily_average" ? `하루 평균 ${metric}` : metric;

  if (domesticWinner && chineseWinner && domesticWinner !== chineseWinner && domestic.length + chinese.length === groups.length) {
    return `내국인 관광객은 ${domesticWinner}에, 중국인 관광객은 ${chineseWinner}에 ${measure} 더 많았어요.`;
  }
  if (wins.ties === groups.length) return `토요일과 일요일의 ${measure} 같았어요.`;
  if (result.has_reversal) return `지역이나 관광객 유형에 따라 ${measure} 더 많은 요일이 달랐어요.`;
  const winner = wins.saturday ? "토요일" : "일요일";
  if (wins.ties) return `일부에서 ${winner}에 ${measure} 더 많았고, 나머지는 두 요일이 같았어요.`;
  return `${winner}에 ${measure} 더 많았어요.`;
}

function isTwoDowntowns(districts) {
  return districts.length === 2 && districts.includes("제주시 구도심") && districts.includes("서귀포시 구도심");
}

function readableGroupScope(result) {
  const districts = [...new Set(result.groups.map(({ district }) => district))];
  const area = isTwoDowntowns(districts) ? "제주시·서귀포시 구도심" : districts.join(", ");
  const visitor = result.visitor_type_label;
  const first = result.included_months[0];
  const last = result.included_months.at(-1);
  const period = readablePeriod(first, last);
  const months = result.excluded_months.length ? ` (${result.included_months.length}개월 비교)` : "";
  return [area, visitor, `${period}${months}`].filter(Boolean).join(" · ");
}

function monthlyAnswer(result, basis, defaultAnswer) {
  const reversal = result.groups.find(({ monthly_reversal }) => monthly_reversal);
  if (reversal) {
    return `${groupLabel(reversal)}의 ${monthlyReversal(reversal, basis, result.included_months.length)}`;
  }
  const changed = result.groups.filter(({ monthly_wins }) => monthly_wins.saturday && monthly_wins.sunday);
  if (changed.length) return `${changed.length}개 비교 대상은 달에 따라 앞선 요일이 바뀌었어요.`;
  if (result.included_months.length === 1) return `비교할 수 있는 달이 1개월이에요. ${defaultAnswer}`;
  return defaultAnswer;
}

function rowValues(rows, valueFor, unit) {
  return rows.map((row) => `${row.weekday} ${formatted(valueFor(row), unit)}`).join(" · ");
}

function meetingSummary(result, presentation, scope, findings, note) {
  const { period, indicator, basis, snapshot } = presentation;
  const observed = describePeriod(snapshot?.observed_start_month, snapshot?.observed_end_month);
  const included = result.included_months.map(monthLabel).join(", ");
  const href = sourceUrl(result.source_url);
  const dataName = result.mode === "demo" ? `${result.data_name} (참고 자료)` : result.data_name;
  return [
    result.mode === "demo" ? "[합성 데모 · 회의 자료에는 실제 데이터를 사용해 주세요]" : "[제주 상권 주말 카드 이용 비교]",
    `비교 대상 · ${scope.join(" / ")}`,
    `선택 기간 · ${period}`,
    `비교 지표 · ${indicator} ${basis}`,
    "",
    ...findings,
    "",
    `집계에 포함 · ${result.included_months.length}개월 (${included})`,
    ...(result.excluded_months.length ? [`집계에서 제외 · ${result.excluded_months.map(monthLabel).join(", ")}`] : []),
    ...(observed ? [`원자료 관측 기간 · ${observed}`] : []),
    `계산 방식 · ${note}`,
    `데이터 출처 · ${dataName}${href ? `\n${href}` : ""}`,
  ].join("\n");
}

function setCopySummary(prefix, text) {
  const button = byId(`${prefix}-copy-summary`);
  const manual = byId(`${prefix}-copy-manual`);
  const wrapper = manual.closest(".copy-manual");
  manual.value = text;
  wrapper.hidden = true;
  feedback(`${prefix}-copy`, "");

  button.onclick = async function copySummary() {
    try {
      await navigator.clipboard.writeText(text);
      if (button.onclick !== copySummary) return;
      wrapper.hidden = true;
      feedback(`${prefix}-copy`, "회의용 요약을 복사했습니다.");
    } catch {
      if (button.onclick !== copySummary) return;
      wrapper.hidden = false;
      manual.focus();
      manual.select();
      feedback(`${prefix}-copy`, "선택된 요약을 직접 복사해 주세요.");
    }
  };
}

function weekendCells(rows, valueFor, unit) {
  return ["토요일", "일요일"].map((weekday) => {
    const row = rows.find((entry) => entry.weekday === weekday);
    return makeElement("td", "", formatted(valueFor(row), unit));
  });
}

function renderGroupOverview(groups, valueFor, unit) {
  byId("group-overview-rows").replaceChildren(...groups.map((group) => {
    const row = makeElement("tr");
    const label = makeElement("th", "", groupLabel(group));
    label.scope = "row";
    row.append(label, ...weekendCells(group.rows, valueFor, unit), makeElement("td", "", group.winner ?? "같음"));
    return row;
  }));
}

function groupMonthlyTable(group, valueFor, unit, basis, open) {
  const details = makeElement("details", "group-monthly-details");
  details.open = open;
  const toggle = makeElement("summary", "disclosure", groupLabel(group));
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
    tr.append(label, ...weekendCells(month.rows, valueFor, unit), makeElement("td", "", month.winner ?? "같음"));
    body.append(tr);
  }
  table.append(caption, head, body);
  details.append(toggle, makeElement("p", "group-win-counts", monthlyWinsLabel(group.monthly_wins)));
  if (basis === "일평균") {
    const inputs = group.rows.map(({ weekday, total, days }) => `${weekday} ${formatted(total, unit)} ÷ ${formatted(days, "일")}`);
    details.append(makeElement("p", "group-average-inputs", inputs.join(" · ")));
  }
  details.append(table);
  return details;
}

function renderGroupComparison(result, openMonths = false) {
  const presentation = comparisonPresentation(result);
  const { basis, indicator, valueFor, unit, snapshot } = presentation;
  const scope = scopeLabels(result);
  const note = calculationNote(result, true);
  const monthCount = result.included_months.length;
  const reversals = result.groups.filter(({ monthly_reversal }) => monthly_reversal);
  byId("group-compare-scope").textContent = readableGroupScope(result);
  byId("group-compare-summary").textContent = readableGroupResult(result);
  const findings = byId("group-compare-highlights");
  findings.replaceChildren(...reversals.map((group) => {
    const item = makeElement("li");
    item.append(makeElement("strong", "", groupLabel(group)), document.createTextNode(` · ${monthlyReversal(group, basis, monthCount)}`));
    return item;
  }));
  findings.hidden = !reversals.length;
  const caption = `${indicator} ${basis}`;
  byId("group-overview-basis").textContent = caption;
  renderGroupOverview(result.groups, valueFor, unit);
  renderGroupChart(result.groups, valueFor, unit, caption);
  byId("group-chart-panel").open = false;
  byId("group-method-panel").open = false;
  byId("group-compare-note").textContent = note;
  const openedGroup = openMonths ? reversals[0] ?? result.groups[0] : null;
  byId("group-compare-cards").replaceChildren(...result.groups.map((group) => {
    const card = makeElement("div", "group-card");
    card.append(groupMonthlyTable(group, valueFor, unit, basis, group === openedGroup));
    return card;
  }));
  byId("group-included-months").textContent = `${result.included_months.length}개월 · ${result.included_months.map(monthLabel).join(", ")}`;
  byId("group-excluded-row").hidden = result.excluded_months.length === 0;
  byId("group-excluded-months").textContent = result.excluded_months.map(monthLabel).join(", ");

  const hasObservedPeriod = snapshot?.observed_start_month && snapshot?.observed_end_month;
  byId("group-observed-row").hidden = !hasObservedPeriod;
  byId("group-observed-period").textContent = hasObservedPeriod
    ? periodLabel(snapshot.observed_start_month, snapshot.observed_end_month)
    : "";
  const source = byId("group-compare-source");
  source.textContent = result.mode === "demo" ? `${result.data_name} (데모 참고 자료)` : result.data_name;
  setSource(source, result.source_url);
  const summaryFindings = [
    groupWinnerSummary(result),
    ...result.groups.map((group) => {
      const values = rowValues(group.rows, valueFor, unit);
      const outcome = resultHeadline(group, basis, unit);
      const wins = monthlyWinsLabel(group.monthly_wins);
      const reversal = group.monthly_reversal ? `\n  ${monthlyReversal(group, basis, result.included_months.length)}` : "";
      return `- ${groupLabel(group)} · ${values}\n  ${outcome} ${wins}${reversal}`;
    }),
  ];
  setCopySummary("group", meetingSummary(result, presentation, scope, summaryFindings, note));
  byId("group-compare-result").hidden = false;
}

function markCurrentRegion(districtValue) {
  for (const shortcut of regionShortcuts) {
    if (districtValue !== undefined && shortcut.dataset.regionShortcut === (districtValue ?? "")) {
      shortcut.setAttribute("aria-current", "true");
    } else {
      shortcut.removeAttribute("aria-current");
    }
  }
}

function regionQuestion(region) {
  if (region) return `${region}은 토요일과 일요일 중 언제 카드 이용이 더 많았나요?`;
  return isTwoDowntowns(options.districts.map(({ name }) => name))
    ? "두 구도심 모두 토요일에 카드 이용이 더 많았나요?"
    : "모든 지역에서 토요일에 카드 이용이 더 많았나요?";
}

function comparisonQuestion(params) {
  const period = readablePeriod(params.start_month, params.end_month);
  const indicator = options.metrics.find(({ id }) => id === params.metric)?.label ?? params.metric;
  return `${[...scopeLabels(params), period, indicator].join(" · ")} 비교`;
}

function addTurn(questionText, answerText, details, initial = false) {
  const turn = makeElement("article", "conversation-turn");
  const userMessage = makeElement("p", "message-question");
  userMessage.append(makeElement("span", "sr-only", "질문. "), document.createTextNode(questionText));
  const answer = makeElement("p", "message-answer");
  answer.tabIndex = -1;
  answer.append(makeElement("span", "sr-only", "답변. "), document.createTextNode(answerText));
  turn.append(userMessage, answer);

  if (details) {
    const actions = makeElement("div", "turn-actions");
    if (details.analysis === "compare_groups" || details.analysis === "compare_weekdays") {
      const monthly = makeElement("button", "text-action", monthlyQuestion);
      monthly.type = "button";
      monthly.dataset.monthlyAction = "";
      monthly.addEventListener("click", () => {
        if (!isBusy()) void compareGroups({ params: details.params, prompt: monthlyQuestion, monthly: true });
      });
      actions.append(monthly);
    }
    const label = details.analysis === "inspect_coverage" ? "조회 기간과 출처 보기" : "월별 수치와 출처 보기";
    const evidence = makeElement("button", "text-action", label);
    evidence.type = "button";
    evidence.addEventListener("click", () => openEvidence(details));
    actions.append(evidence);
    turn.append(actions);
  }

  byId("conversation-empty").hidden = true;
  conversation.append(turn);
  if (!initial) {
    answer.focus({ preventScroll: true });
    turn.scrollIntoView({ block: "nearest" });
  }
}

function commitComparison(prompt, analysis, params, result, initial = false) {
  const single = analysis === "compare_weekdays";
  const applied = { ...params, visitor_type: result.visitor_type ?? params.visitor_type ?? null };
  let answer;
  if (single) {
    const { basis, unit } = comparisonPresentation(result);
    answer = resultHeadline(result, basis, unit);
    setSingleFilters(applied);
  } else {
    setupGroupFilters(applied, true);
    answer = readableGroupResult(result);
    if (analysis === "monthly_trend") {
      answer = monthlyAnswer(result, comparisonPresentation(result).basis, answer);
    }
  }
  activeContext = { ...applied, analysis };
  markCurrentRegion(applied.district ?? null);
  if (analysisDialog.open) analysisDialog.close();
  addTurn(prompt, answer, { analysis, params: applied, result }, initial);
}

async function compareGroups({ params = readGroupConditions(), prompt = comparisonQuestion(params), monthly = false, initial = false } = {}) {
  setGroupPending(true);
  feedback("agent", "");
  feedback("group-compare", "비교 결과를 불러오는 중이에요.");
  try {
    const result = await request("/api/compare-groups", params);
    commitComparison(prompt, monthly ? "monthly_trend" : "compare_groups", params, result, initial);
    feedback("group-compare", "");
    return true;
  } catch (error) {
    feedback("group-compare", error.message, "error");
    return false;
  } finally {
    setGroupPending(false);
  }
}

function chartBars(rows, valueFor, unit, max = Math.max(0, ...rows.map(valueFor))) {
  return rows.map((row) => {
    const value = valueFor(row);
    const bar = makeElement("div", "chart-row");
    const label = makeElement("span", "chart-label", row.weekday);
    const number = makeElement("span", "chart-number", formatted(value, unit));
    const track = makeElement("div", "chart-track");
    track.setAttribute("aria-hidden", "true");
    const fill = makeElement("div", "chart-fill");
    fill.dataset.weekday = row.weekday === "토요일" ? "saturday" : "sunday";
    fill.style.width = `${max > 0 ? Math.max(0, value / max) * 100 : 0}%`;
    track.append(fill);
    bar.append(label, number, track);
    return bar;
  });
}

function renderGroupChart(groups, valueFor, unit, caption) {
  const max = Math.max(0, ...groups.flatMap(({ rows }) => rows.map(valueFor)));
  byId("group-chart-caption").textContent = caption;
  byId("group-chart-rows").replaceChildren(...groups.map((group) => {
    const item = makeElement("article", "group-chart-item");
    item.append(
      makeElement("h4", "group-chart-title", groupLabel(group)),
      ...chartBars(group.rows, valueFor, unit, max),
    );
    return item;
  }));
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
  const presentation = comparisonPresentation(result);
  const { basis, indicator, period, valueFor, unit, snapshot } = presentation;
  const group = result.visitor_type_label ?? visitorType.selectedOptions[0]?.text;
  const scope = [result.district, group].filter(Boolean);
  const headline = resultHeadline(result, basis, unit);
  const note = calculationNote(result);

  byId("result-scope").textContent = [...scope, period, indicator].join(" · ");
  byId("basis-badge").textContent = basis;
  byId("basis-badge").hidden = false;
  byId("result-headline").textContent = headline;
  byId("result-note").textContent = note;
  byId("chart-caption").textContent = `${indicator} ${basis}`;
  byId("single-chart-panel").open = false;
  byId("single-method-panel").open = false;
  byId("chart-rows").replaceChildren(...chartBars(result.rows, valueFor, unit));
  renderEvidence(result.rows, unit);

  byId("included-months").textContent = result.included_months.map(monthLabel).join(", ");
  byId("excluded-row").hidden = result.excluded_months.length === 0;
  byId("excluded-months").textContent = `${result.excluded_months.map(monthLabel).join(", ")} (비교 가능한 값 부족)`;
  renderSnapshot(snapshot);
  const source = byId("result-source");
  source.textContent = result.mode === "demo" ? `${result.data_name} (참고한 데이터)` : result.data_name;
  setSource(source, result.source_url);
  setCopySummary("result", meetingSummary(result, presentation, scope, [headline, rowValues(result.rows, valueFor, unit)], note));
  byId("empty-result").hidden = true;
  byId("result-content").hidden = false;
}

async function compare() {
  const params = readConditions();
  setPending(true);
  feedback("agent", "");
  feedback("compare", "카드 이용을 비교하는 중입니다.");
  try {
    const result = await request("/api/compare", params);
    commitComparison(comparisonQuestion(params), "compare_weekdays", params, result);
    feedback("compare", "");
  } catch (error) {
    feedback("compare", error.message, "error");
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

  byId("agent-conditions").open = coverage;
  byId("agent-analysis").hidden = false;
}

function showDialog(title, view) {
  byId("analysis-dialog-title").textContent = title;
  analysisDialog.dataset.view = view;
  if (!analysisDialog.open) analysisDialog.showModal();
  analysisDialog.scrollTop = 0;
  analysisDialog.querySelector(".dialog-body").scrollTop = 0;
}

function openEvidence({ analysis, params, result }) {
  if (isBusy()) return;
  const single = analysis === "compare_weekdays";
  const coverage = analysis === "inspect_coverage";
  byId("group-comparison").hidden = single || coverage;
  groupCompareForm.hidden = true;
  byId("single-panel").hidden = !single;
  byId("single-panel").open = single;
  byId("single-settings").hidden = true;
  if (single) renderResult(result);
  else if (!coverage) renderGroupComparison(result, analysis === "monthly_trend");
  showAgentAnalysis(analysis, params, result);
  if (coverage) showDialog("자료 기간과 출처", "coverage");
  else showDialog("비교 수치와 출처", single ? "single" : "group");
}

function openSettings() {
  byId("agent-analysis").hidden = true;
  byId("group-comparison").hidden = false;
  groupCompareForm.hidden = false;
  byId("group-compare-result").hidden = true;
  byId("single-panel").hidden = false;
  byId("single-panel").open = false;
  byId("single-settings").hidden = false;
  byId("result-content").hidden = true;
  byId("empty-result").hidden = true;
  byId("basis-badge").hidden = true;
  showDialog("비교 조건", "settings");
}

function coverageAnswer(result) {
  const period = readablePeriod(result.observed_start_month, result.observed_end_month);
  const available = `이 조건에서 비교할 수 있는 자료는 ${period}에 있어요.`;
  if ((result.requested_start_month || result.requested_end_month) && result.available_months.length === 0) {
    return `요청하신 기간에는 비교할 자료가 없어요. ${available}`;
  }
  return available;
}

function setSingleFilters(params = {}) {
  setChoices(district, options.districts.map(({ name }) => ({ value: name, label: name })), params.district ?? "제주시 구도심");
  setChoices(metric, options.metrics.map(({ id, label }) => ({ value: id, label })), params.metric ?? "transactions");
  updateVisitorTypes(params.visitor_type);
  const bounds = [params.start_month, params.end_month].filter(Boolean);
  updatePeriods(params.start_month, params.end_month, bounds);
}

function setSidebar(open) {
  regionMenu.dataset.expanded = String(open);
  sidebarToggle.setAttribute("aria-expanded", String(open));
}

function resetConversation() {
  activeContext = undefined;
  conversation.replaceChildren();
  byId("conversation-empty").hidden = false;
  question.value = "";
  feedback("agent", "");
  feedback("group-compare", "");
  feedback("compare", "");
  setSingleFilters();
  setupGroupFilters();
  markCurrentRegion(undefined);
  setSidebar(false);
  if (options.ai_available) question.focus();
  else byId("conversation-empty").focus();
}

async function loadOptions() {
  setPending(true);
  setGroupPending(true);
  retry.hidden = true;
  feedback("compare", "");
  feedback("group-compare", "비교할 자료를 불러오는 중이에요.");
  try {
    const loaded = await request("/api/options");
    const districts = loaded.districts.filter((entry) => districtGroups(entry).length);
    if (!districts.length || !loaded.metrics.length) throw new Error("분석 가능한 지역이나 지표가 없습니다.");
    options = { ...loaded, districts };
    setMode(options.mode, options.snapshot);
    setSource(byId("hero-source-link"), options.source_url);
    setSingleFilters();
    byId("assistant-hint").textContent = options.ai_available
      ? "Enter로 질문을 보내고 Shift+Enter로 줄을 바꿀 수 있어요."
      : "지금은 자유 질문을 보낼 수 없어요. 메뉴에서 지역을 골라 비교해 주세요.";
    byId("assistant-hint").classList.toggle("sr-only", options.ai_available);
    if (setupGroupFilters()) {
      retry.hidden = await compareGroups({ prompt: regionQuestion(null), initial: true });
    }
  } catch {
    options = undefined;
    byId("mode-badge").textContent = "연결 확인 필요";
    feedback("group-compare", "자료를 불러오지 못했어요. 다시 연결해 주세요.", "error");
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
for (const shortcut of regionShortcuts) {
  shortcut.addEventListener("click", () => {
    if (isBusy() || !options) return;
    const region = shortcut.dataset.regionShortcut || null;
    setSidebar(false);
    if (setupGroupFilters({ district: region })) void compareGroups({ prompt: regionQuestion(region) });
  });
}
retry.addEventListener("click", loadOptions);
sidebarToggle.addEventListener("click", () => setSidebar(sidebarToggle.getAttribute("aria-expanded") !== "true"));
regionMenu.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || sidebarToggle.getAttribute("aria-expanded") !== "true") return;
  setSidebar(false);
  sidebarToggle.focus();
});
newQuestion.addEventListener("click", resetConversation);
settingsButton.addEventListener("click", () => {
  setSidebar(false);
  if (sidebarToggle.getClientRects().length) sidebarToggle.focus();
  openSettings();
});
for (const closeButton of analysisDialog.querySelectorAll("[data-close-analysis]")) {
  closeButton.addEventListener("click", () => analysisDialog.close());
}
compareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isBusy()) void compare();
});

groupCompareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isBusy() && groupMonths.length) void compareGroups();
});

question.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!isBusy()) agentForm.requestSubmit();
});

agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isBusy() || !options?.ai_available) return;
  const prompt = question.value.trim();
  if (!prompt) {
    feedback("agent", "비교하고 싶은 내용을 입력해 주세요.", "error");
    return;
  }

  const body = {
    question: prompt,
    context: activeContext ?? readConditions(),
    ...(groupMonths.length ? { group_context: readGroupConditions() } : {}),
  };
  setAgentPending(true);
  feedback("group-compare", "");
  feedback("agent", "질문에 맞는 결과를 찾고 있어요.");
  try {
    const response = await request("/api/agent", body);
    question.value = "";
    feedback("agent", "");
    if (response.status === "clarify") {
      addTurn(prompt, response.message);
      return;
    }

    const { params, result } = response;
    const analysis = response.analysis ?? "compare_weekdays";
    if (response.status === "coverage") {
      addTurn(prompt, coverageAnswer(result), { analysis, params, result });
      return;
    }

    commitComparison(prompt, analysis, params, result);
  } catch {
    feedback("agent", "지금은 자유 질문에 답할 수 없어요. 잠시 후 다시 보내거나 지역별 비교를 이용해 주세요.", "error");
  } finally {
    setAgentPending(false);
  }
});

void loadOptions();
