"use strict";

window.JejuResults = (() => {
  const weekdays = ["토요일", "일요일"];
  const palette = ["#075d7a", "#7799a4", "#92643a", "#765985"];
  const numbers = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const svgNamespace = "http://www.w3.org/2000/svg";

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function svg(tag, attributes = {}, text) {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function monthLabel(value) {
    if (!value) return "";
    const [year, month] = value.split("-");
    return `${year}년 ${Number(month)}월`;
  }

  function periodLabel(start, end) {
    if (start && end && start !== end) return `${monthLabel(start)}~${monthLabel(end)}`;
    if (start && end) return monthLabel(start);
    if (start) return `${monthLabel(start)}부터`;
    if (end) return `${monthLabel(end)}까지`;
    return "";
  }

  function monthIndex(month) {
    const [year, index] = month.split("-").map(Number);
    return year * 12 + index - 1;
  }

  function displayNumber(value) {
    if (value === null || value === undefined) return "—";
    if (value > 0 && value < 0.01) return "0.01 미만";
    return numbers.format(value);
  }

  function withUnit(value, unit) {
    const formatted = displayNumber(value);
    if (formatted === "0.01 미만") return `0.01${unit ? ` ${unit}` : ""} 미만`;
    return formatted === "—" ? formatted : `${formatted}${unit ? ` ${unit}` : ""}`;
  }

  function safeSource(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.href;
    } catch {
      return "";
    }
    return "";
  }

  function sumRows(groups, weekday, month) {
    const seriesRows = groups.map((group) => month ? group.months?.find((entry) => entry.month === month)?.rows : group.rows);
    if (seriesRows.some((rows) => !rows)) return null;
    return seriesRows.flat().reduce((total, row) => total + (!weekday || row.weekday === weekday ? row.total : 0), 0);
  }

  function monthlyPoints(groups, months, weekday) {
    return months
      .map((month) => ({ month, value: sumRows(groups, weekday, month) }))
      .filter(({ value }) => value !== null);
  }

  function groupName(group) {
    return `${group.district} · ${group.visitor_type_label}`;
  }

  function comparisonModel(result) {
    const months = result.included_months;
    const grouped = Array.isArray(result.groups);
    const groups = grouped ? result.groups : [result];
    const districts = [...new Set(groups.map(({ district }) => district))];
    const typesByDistrict = districts.map((district) => groups
      .filter((group) => group.district === district)
      .map((group) => group.visitor_type));
    const commonTypes = typesByDistrict[0].filter((type) => typesByDistrict.every((types) => types.includes(type)));
    const commonGroups = groups.filter((group) => commonTypes.includes(group.visitor_type));
    const comparable = districts.length > 1 && commonTypes.length > 0;
    const splitGroups = districts.length > 1 && !comparable;
    const daily = !grouped && result.comparison_basis === "daily_average";
    const metric = result.metric === "amount" ? "카드 이용 금액" : "카드 이용 건수";
    const unit = result.unit || "";
    const unitLabel = unit || "원자료 단위";
    const basis = daily ? "요일별 일평균" : "관측 합계";
    const visitorLabels = [...new Set((splitGroups ? groups : commonGroups)
      .map(({ visitor_type_label }) => visitor_type_label))];
    let series;

    if (comparable || splitGroups) {
      const sets = comparable
        ? districts.map((district) => commonGroups.filter((group) => group.district === district))
        : groups.map((group) => [group]);
      series = sets.map((set) => ({
        label: comparable ? set[0].district : groupName(set[0]),
        district: set[0].district,
        visitorType: splitGroups ? set[0].visitor_type : "",
        value: sumRows(set),
        points: monthlyPoints(set, months),
      }));
    } else {
      series = weekdays.map((weekday) => ({
        label: weekday,
        district: districts[0],
        weekday,
        value: daily ? result.rows.find((row) => row.weekday === weekday).daily_average : sumRows(groups, weekday),
        points: grouped ? monthlyPoints(groups, months, weekday) : [],
      }));
    }
    return { result, groups, months, districts, series, comparable, splitGroups, grouped, daily, basis, metric, unitLabel, visitorLabels };
  }

  function conclusion(model, analysis) {
    const { result, groups, series, metric, daily, splitGroups } = model;
    const reversal = analysis === "monthly_trend" && groups.find((group) => group.monthly_reversal);
    if (reversal) {
      return { text: `${reversal.district} ${reversal.visitor_type_label}은 월별로 ${reversal.monthly_winner}이 더 자주 앞섰어요.` };
    }
    if (splitGroups) return { text: "같은 관광객 유형끼리 비교할 수 있는 두 지역이 없어요." };
    if (series.length === 2) {
      const [first, second] = [...series].sort((a, b) => b.value - a.value);
      const difference = daily ? result.difference : Math.abs(first.value - second.value);
      const subject = daily ? `하루 평균 ${metric}` : metric;
      const particle = result.metric === "amount" ? "이" : "가";
      if (!difference) return { text: `두 ${model.comparable ? "지역" : "요일"}의 ${subject}${particle} 같아요.` };
      const period = periodLabel(model.months[0], model.months.at(-1));
      const prefix = period ? `${period}에는 ` : "";
      const highlight = first.label;
      const suffix = `의 ${subject}${particle} 더 많았어요.`;
      return { text: `${prefix}${highlight}${suffix}`, prefix, highlight, suffix, difference };
    }
    return { text: `${series.length}개 지역의 주말 ${metric} 비교` };
  }

  function setSeriesData(element, series, index) {
    element.dataset.district = series.district;
    element.dataset.series = index;
    if (series.weekday) element.dataset.weekday = series.weekday;
    if (series.visitorType) element.dataset.visitorType = series.visitorType;
    element.style.setProperty("--series-color", palette[index % palette.length]);
  }

  function resultTopline(callbacks, label = "비교 결과") {
    const topline = node("div", "result-topline");
    if (callbacks.onReset) {
      const back = button("다시 비교하기", callbacks.onReset, true);
      back.classList.add("back-button");
      const arrow = node("span", "back-arrow", "←");
      arrow.setAttribute("aria-hidden", "true");
      back.prepend(arrow);
      topline.append(back);
    }
    topline.append(node("span", "result-label", label));
    return topline;
  }

  function renderHeader(model, analysis) {
    const header = node("header", "result-header");
    const summary = conclusion(model, analysis);
    const title = node("h2", "result-title");
    if (summary.highlight) {
      title.append(summary.prefix, node("strong", "", summary.highlight), summary.suffix);
    } else {
      title.textContent = summary.text;
    }
    header.append(title);
    const scope = node("ul", "result-scope");
    const values = [
      model.districts.join(" · "),
      periodLabel(model.months[0], model.months.at(-1)),
      summary.difference ? `차이 ${withUnit(summary.difference, model.unitLabel)}` : "",
      "업종 구분 없음",
    ];
    for (const value of values.filter(Boolean)) scope.append(node("li", "", value));
    header.append(scope);
    return header;
  }

  function renderCards(model) {
    const section = node("section", "result-cards");
    section.setAttribute("aria-label", "비교 수치");
    const totalScope = model.comparable || model.splitGroups ? "토·일 합계" : model.basis;
    model.series.forEach((series, index) => {
      const card = node("div", "result-card region-card");
      setSeriesData(card, series, index);
      const value = node("p", "result-value", displayNumber(series.value));
      value.dataset.value = series.value;
      value.append(node("span", "result-value-unit", ` ${model.unitLabel}`));
      const detail = node("p", "result-card-meta", `${model.metric} · ${totalScope}`);
      card.append(node("h3", "result-card-name", series.label), value, detail);
      section.append(card);
    });
    return section;
  }

  function barRow(series, index, entry, maximum, unit) {
    const row = node("div", "chart-bar-row");
    const track = node("div", "chart-bar-track");
    const bar = node("div", "chart-bar");
    setSeriesData(bar, series, index);
    if (entry.weekday) bar.dataset.weekday = entry.weekday;
    bar.dataset.value = entry.value;
    bar.style.setProperty("--bar-width", `${maximum ? entry.value / maximum * 100 : 0}%`);
    track.setAttribute("aria-hidden", "true");
    track.append(bar);
    row.append(node("span", "chart-bar-label", entry.label), track, node("span", "chart-bar-number", withUnit(entry.value, unit)));
    return row;
  }

  function renderBars(model) {
    const bars = node("div", "chart-bars");
    const maximum = Math.max(0, ...model.series.map(({ value }) => value));
    const scale = node("div", "chart-scale");
    scale.append(node("span", "", withUnit(0, model.unitLabel)), node("span", "", `최대 ${withUnit(maximum, model.unitLabel)}`));
    bars.append(scale, ...model.series.map((series, index) => barRow(series, index, {
      label: series.weekday ? `${series.district} ${series.label}` : series.label,
      weekday: series.weekday,
      value: series.value,
    }, maximum, model.unitLabel)));
    return bars;
  }

  function chartLegend(series) {
    const list = node("ul", "chart-legend");
    series.forEach((entry, index) => {
      const item = node("li", "", entry.weekday ? `${entry.district} ${entry.weekday}` : entry.label);
      setSeriesData(item, entry, index);
      list.append(item);
    });
    return list;
  }

  function plotLines(view, entry, index, position, unit) {
    const color = palette[index % palette.length];
    let last;
    const segments = [];
    for (const point of entry.points) {
      const [x, y] = position(point);
      const newSegment = last === undefined || monthIndex(point.month) > last + 1;
      segments.push(`${newSegment ? "M" : "L"}${x},${y}`);
      last = monthIndex(point.month);
    }
    view.append(svg("path", {
      class: "chart-series-line",
      d: segments.join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": 2.5,
      ...(index % 2 ? { "stroke-dasharray": "7 4" } : {}),
    }));
    for (const point of entry.points) {
      const [x, y] = position(point);
      const attributes = {
        class: "chart-point",
        "data-series": index,
        "data-district": entry.district,
        ...(entry.weekday ? { "data-weekday": entry.weekday } : {}),
        ...(entry.visitorType ? { "data-visitor-type": entry.visitorType } : {}),
        "data-month": point.month,
        "data-value": point.value,
        fill: color,
      };
      const marker = index % 2
        ? svg("rect", { ...attributes, x: x - 3, y: y - 3, width: 6, height: 6 })
        : svg("circle", { ...attributes, cx: x, cy: y, r: 3.4 });
      marker.append(svg("title", {}, `${entry.label} · ${monthLabel(point.month)} · ${withUnit(point.value, unit)}`));
      view.append(marker);
    }
  }

  function axisNumber(value) {
    if (value >= 1_000_000_000) return `${numbers.format(value / 100_000_000)}억`;
    if (value >= 100_000) return `${numbers.format(value / 10_000)}만`;
    return displayNumber(value);
  }

  function renderLines(model) {
    const view = svg("svg", { class: "chart-line-svg", viewBox: "0 0 600 220", role: "img", "aria-label": "월별 추이. 정확한 수치는 아래 월별 표에서 확인할 수 있어요." });
    const left = 74, right = 559, top = 15, bottom = 184;
    const first = monthIndex(model.months[0]);
    const interval = monthIndex(model.months.at(-1)) - first;
    const peak = Math.max(0, ...model.series.flatMap(({ points }) => points.map(({ value }) => value)));
    const quarter = peak / 4;
    const magnitude = 10 ** Math.floor(Math.log10(quarter || 1));
    const factor = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= quarter);
    const step = Math.max(1, Math.ceil(factor * magnitude));
    const maximum = step * 4;
    const position = ({ month, value }) => [
      left + (monthIndex(month) - first) / interval * (right - left),
      bottom - value / maximum * (bottom - top),
    ];
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      const y = bottom - ratio * (bottom - top);
      view.append(
        svg("line", { class: "chart-gridline", x1: left, x2: right, y1: y, y2: y, stroke: "#daded6" }),
        svg("text", { class: "chart-axis-text", x: left - 9, y: y + 4, "text-anchor": "end", fill: "#52645b", "font-size": 12 }, axisNumber(maximum * ratio)),
      );
    }
    const last = model.months.length - 1;
    const labelIndices = new Set([0, Math.round(last / 3), Math.round(last * 2 / 3), last]);
    for (const index of labelIndices) {
      const month = model.months[index];
      const [x] = position({ month, value: 0 });
      view.append(svg("text", { class: "chart-axis-text", x, y: 209, "text-anchor": "middle", fill: "#52645b", "font-size": 12 }, month.replace("-", ".")));
    }
    model.series.forEach((entry, index) => plotLines(view, entry, index, position, model.unitLabel));
    return view;
  }

  function resultTable(captionText, headings, rows) {
    const table = node("table", "result-table");
    const head = node("thead");
    const header = node("tr");
    for (const heading of headings) {
      const cell = node("th", "", heading);
      cell.scope = "col";
      header.append(cell);
    }
    head.append(header);
    const body = node("tbody");
    for (const [heading, ...values] of rows) {
      const row = node("tr");
      const cell = node("th", "", heading);
      cell.scope = "row";
      row.append(cell, ...values.map((value) => node("td", "", value)));
      body.append(row);
    }
    table.append(node("caption", "sr-only", captionText), head, body);
    return table;
  }

  function disclosure(label, content) {
    const details = node("details", "result-disclosure");
    details.append(node("summary", "", label), content);
    return details;
  }

  function renderChart(model) {
    const line = model.months.length > 1 && model.series.some((series) => series.points.length > 1);
    const figure = node("figure", "result-chart chart-panel");
    figure.dataset.chart = line ? "line" : "bar";
    const caption = node("figcaption");
    const regional = model.comparable || model.splitGroups;
    const title = line ? "월별 추이" : regional ? "지역별 주말 합계" : "토요일과 일요일 비교";
    caption.append(node("h3", "chart-title", title));
    const basis = regional ? (line ? "월별 토·일 합계" : "토·일 합계") : model.basis;
    const unitText = `${model.unitLabel} · ${basis}`;
    caption.append(node("p", "chart-unit", `단위 ${unitText}`));
    figure.append(caption, line ? renderLines(model) : renderBars(model));
    if (line) {
      figure.insertBefore(chartLegend(model.series), figure.lastChild);
      const rows = model.series.flatMap((series) => series.points.map(({ month, value }) => [monthLabel(month), series.label, withUnit(value, model.unitLabel)]));
      figure.append(disclosure("월별 수치 보기", resultTable("월별 추이의 정확한 수치", ["월", "비교 대상", "수치"], rows)));
    }
    return figure;
  }

  function conditionList(values) {
    const list = node("dl", "result-condition-list");
    for (const [label, value] of values) {
      if (!value) continue;
      const pair = node("div");
      pair.append(node("dt", "", label), node("dd", "", value));
      list.append(pair);
    }
    return list;
  }

  function source(result) {
    const href = safeSource(result.source_url);
    const label = `제주데이터허브 608 · ${result.data_name}${result.mode === "demo" ? " (합성 데모)" : ""}`;
    const element = node(href ? "a" : "span", "result-source", label);
    if (href) {
      element.href = href;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
    return element;
  }

  function reversalText(group, model) {
    const wins = group.monthly_wins[group.monthly_winner === "토요일" ? "saturday" : "sunday"];
    const basis = model.result.comparison_basis === "daily_average" ? "요일별 일평균" : "기간 합계";
    return `${groupName(group)}은 ${basis}에서 ${group.winner}이 앞섰고, 월별로는 ${group.monthly_winner}이 ${model.months.length}개월 중 ${wins}개월 앞섰어요.`;
  }

  function renderEvidence(model) {
    const { result, groups, months, districts, basis, metric, visitorLabels, daily } = model;
    const evidence = node("aside", "result-evidence meta-panel");
    evidence.setAttribute("aria-label", "분석 조건과 출처");
    evidence.append(node("h3", "", "분석 조건과 출처"));
    const filters = [
      ["지역", districts.join(" · ")],
      ["관측 기간", `${periodLabel(months[0], months.at(-1))} (${months.length}개월)`],
      ["요청 기간", result.excluded_months?.length ? periodLabel(result.start_month, result.end_month) : ""],
      ["관광객", visitorLabels.join(" · ")],
      ["업종", "업종 구분 없음"],
      ["지표", `${metric} · ${basis}`],
    ];
    evidence.append(conditionList(filters), source(result));
    const exclusions = result.excluded_months?.length
      ? ` 집계 제외 월은 ${result.excluded_months.map(monthLabel).join(", ")}입니다.`
      : "";
    const method = model.comparable
      ? "두 지역에 공통으로 관측된 달과 관광객 유형의 토·일 수치를 합산했어요."
      : daily
        ? "요일마다 관측 합계를 해당 요일의 일수로 나눴어요."
        : "토요일과 일요일 자료를 모두 관측한 달을 집계했어요.";
    evidence.append(node("p", "result-method", method + exclusions));

    const reversals = groups.filter((group) => group.monthly_reversal);
    for (const group of reversals) evidence.append(node("p", "result-method", reversalText(group, model)));

    const groupDaily = result.comparison_basis === "daily_average";
    const rows = groups.map((group) => [
      groupName(group),
      ...weekdays.map((day) => {
        const row = group.rows.find(({ weekday }) => weekday === day);
        return withUnit(groupDaily ? row.daily_average : row.total, model.unitLabel);
      }),
      group.winner ?? "같음",
    ]);
    const groupBasis = groupDaily ? "요일별 일평균" : "관측 합계";
    const data = resultTable(`관광객 유형별 토·일 수치 · ${groupBasis}`, ["범위", "토요일", "일요일", "앞선 요일"], rows);
    if (model.grouped) evidence.append(disclosure(`관광객 유형별 ${groupBasis} 보기`, data));
    return evidence;
  }

  function copyText(model, headline) {
    const { result, months, metric, unitLabel } = model;
    return [
      result.mode === "demo" ? "[제주 상권 브리핑 · 합성 데모]" : "[제주 상권 브리핑]",
      headline,
      `지역 ${model.districts.join(" · ")}`,
      `관측 기간 ${periodLabel(months[0], months.at(-1))} (${months.length}개월)`,
      `지표 ${metric} · ${model.basis}`,
      `관광객 ${model.visitorLabels.join(" · ")}`,
      "업종 구분 없음",
      ...model.series.map((series) => `${series.label} ${withUnit(series.value, unitLabel)}`),
      ...model.groups.filter((group) => group.monthly_reversal).map((group) => reversalText(group, model)),
      `자료 출처 ${result.data_name}`,
      safeSource(result.source_url),
    ].filter(Boolean).join("\n");
  }

  function button(label, listener, requestsAnalysis = false) {
    const element = node("button", "result-action", label);
    element.type = "button";
    if (requestsAnalysis) element.dataset.analysisAction = "";
    element.addEventListener("click", listener);
    return element;
  }

  function renderActions(model, response, callbacks) {
    const actions = node("div", "result-actions");
    const status = node("p", "copy-status");
    status.setAttribute("role", "status");
    const copyTextField = node("textarea", "copy-manual");
    copyTextField.readOnly = true;
    copyTextField.hidden = true;
    copyTextField.setAttribute("aria-label", "복사할 회의용 요약");
    if (callbacks.onMonthly && response.analysis !== "monthly_trend" && model.months.length > 1) {
      actions.append(button("월별 추이 보기", () => callbacks.onMonthly(response), true));
    }
    actions.append(button("회의용 요약 복사", async () => {
      const summary = conclusion(model, response.analysis);
      const detail = summary.difference ? ` (차이 ${withUnit(summary.difference, model.unitLabel)})` : "";
      const text = copyText(model, summary.text + detail);
      try {
        await navigator.clipboard.writeText(text);
        copyTextField.hidden = true;
        status.textContent = "요약을 복사했어요.";
      } catch {
        copyTextField.value = text;
        copyTextField.hidden = false;
        copyTextField.focus();
        copyTextField.select();
        status.textContent = "선택된 요약을 복사해 주세요.";
      }
    }));
    if (callbacks.onFollowUp) actions.append(button("이어서 질문하기", callbacks.onFollowUp));
    actions.append(status, copyTextField);
    return actions;
  }

  function coveragePanel(response, options, callbacks) {
    const { result } = response;
    const observed = periodLabel(result.observed_start_month, result.observed_end_month);
    const requested = periodLabel(result.requested_start_month, result.requested_end_month);
    const available = result.available_months ?? [];
    const hasGap = Boolean(requested) && !available.length;
    const panel = node("article", "analysis-result result-panel result-section coverage-result");
    panel.dataset.analysis = "inspect_coverage";
    const header = node("header", "result-header");
    header.append(node("h2", "result-title", hasGap ? "요청한 기간의 자료가 없어요" : "조회할 수 있는 자료 기간"));
    panel.append(resultTopline(callbacks, "자료 조회"), header, conditionList([
      ["요청 기간", requested],
      ["조회 가능 기간", observed],
      ["지역", result.district || options?.districts?.map(({ name }) => name).join(" · ")],
      ["관광객", result.visitor_type_label],
      ["요청 기간 내 자료", requested && available.length ? `${available.length}개월` : ""],
    ]), source(result));
    if (observed && callbacks.onUsePeriod) {
      const actions = node("div", "result-actions");
      actions.append(button("조회 가능 기간으로 비교", () => callbacks.onUsePeriod(response), true));
      if (callbacks.onFollowUp) actions.append(button("이어서 질문하기", callbacks.onFollowUp));
      panel.append(actions);
    }
    return panel;
  }

  function render(container, response, options, callbacks = {}) {
    const { analysis, result } = response;
    if (analysis === "inspect_coverage") {
      const coverage = coveragePanel(response, options, callbacks);
      container.append(coverage);
      return coverage;
    }
    const model = comparisonModel(result);
    const article = node("article", "analysis-result result-panel result-section");
    article.dataset.analysis = analysis;
    article.append(resultTopline(callbacks));
    if (result.mode === "demo") article.append(node("p", "result-demo", "합성 데모 데이터"));
    const grid = node("div", "result-grid");
    const visual = node("div", "result-visual");
    visual.append(renderCards(model), renderChart(model));
    grid.append(visual, renderEvidence(model));
    article.append(renderHeader(model, analysis), grid, renderActions(model, response, callbacks));
    container.append(article);
    return article;
  }

  return { render };
})();
