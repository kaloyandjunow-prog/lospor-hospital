/**
 * The Unusual readings page's arithmetic and its browser script (10.2.0).
 *
 * The arithmetic is plain JavaScript in one string: the server runs it for the table every browser gets, the tests
 * run it, and the browser script is that same text plus the drawing code, so the figures on screen cannot differ from
 * the ones checked. Status serves it as /status/unusual-readings.js: its content security policy allows scripts from
 * itself only, so nothing is inline.
 */

/** The percentile and impact arithmetic. A value is a whole-number reading; a histogram is { min, counts }. */
export const READINGS_MATH_SOURCE = String.raw`
function readingsIn(counts) { var n = 0; for (var i = 0; i < counts.length; i++) n += counts[i]; return n }
// The value at a percentile: the reading at that rank when all readings are sorted (Core's histogramPercentile).
function percentile(histogram, percent) {
  var n = readingsIn(histogram.counts)
  if (n === 0) return null
  var rank = Math.min(n - 1, Math.max(0, Math.floor(percent / 100 * n)))
  var seen = 0
  for (var i = 0; i < histogram.counts.length; i++) {
    seen += histogram.counts[i]
    if (seen > rank) return histogram.min + i
  }
  return histogram.min + histogram.counts.length - 1
}
function meanSd(histogram) {
  var n = readingsIn(histogram.counts)
  if (n < 2) return null
  var sum = 0, i
  for (i = 0; i < histogram.counts.length; i++) sum += histogram.counts[i] * (histogram.min + i)
  var mean = sum / n, squares = 0
  for (i = 0; i < histogram.counts.length; i++) squares += histogram.counts[i] * Math.pow(histogram.min + i - mean, 2)
  return { mean: mean, sd: Math.sqrt(squares / (n - 1)) }
}
// The share of readings (0-100) strictly below, or strictly above, a value.
function shareOf(histogram, value, side) {
  var n = readingsIn(histogram.counts)
  if (n === 0) return 0
  var count = 0
  for (var i = 0; i < histogram.counts.length; i++) {
    var v = histogram.min + i
    if (side === "below" ? v < value : v > value) count += histogram.counts[i]
  }
  return count / n * 100
}
// One sign's limits at a tail setting: flagged below low, above high.
function limitsOf(histogram, lowTail, highTail) {
  if (!histogram) return { low: null, high: null }
  return { low: percentile(histogram, lowTail), high: percentile(histogram, 100 - highTail) }
}
var COLUMN = { hrMin: 0, hrMax: 1, sbpMin: 2, dbpMin: 3, mapMin: 4 }
function pct(count, total) { return total === 0 ? null : count / total * 100 }
// How many of a band's finished cases a set of limits would ask about, and how many the fixed rules ask about.
// limits: { hr:{low,high}, sbp:{low}, dbp:{low}, map:{low} } (numbers or null); fixed: the band's fixed rules.
// A case counts when one of its readings is past a limit. Hypertension is not here: it is judged on the baseline.
function impactOf(rows, limits, fixed) {
  var n = rows.length
  var c = { hypo: 0, brady: 0, tachy: 0, any: 0, fixedHypoLow: 0, fixedHypoHigh: 0, fixedBrady: 0, fixedTachy: 0, anyWithFixed: 0 }
  var hyp = fixed && fixed.hypotension
  var column = hyp ? (hyp.sign === "map" ? COLUMN.mapMin : COLUMN.sbpMin) : -1
  for (var i = 0; i < n; i++) {
    var r = rows[i]
    var below = function (value, limit) { return value != null && limit != null && value < limit }
    var hypo = below(r[COLUMN.sbpMin], limits.sbp.low) || below(r[COLUMN.dbpMin], limits.dbp.low) || below(r[COLUMN.mapMin], limits.map.low)
    var brady = below(r[COLUMN.hrMin], limits.hr.low)
    var tachy = r[COLUMN.hrMax] != null && limits.hr.high != null && r[COLUMN.hrMax] > limits.hr.high
    var fixedHypoLow = column >= 0 && below(r[column], hyp.from)
    var fixedHypoHigh = column >= 0 && below(r[column], hyp.to)
    var fixedBrady = fixed ? below(r[COLUMN.hrMin], fixed.bradycardiaBelow) : false
    var fixedTachy = fixed ? (r[COLUMN.hrMax] != null && r[COLUMN.hrMax] > fixed.tachycardiaAbove) : false
    if (hypo) c.hypo++
    if (brady) c.brady++
    if (tachy) c.tachy++
    if (hypo || brady || tachy) c.any++
    if (fixedHypoLow) c.fixedHypoLow++
    if (fixedHypoHigh) c.fixedHypoHigh++
    if (fixedBrady) c.fixedBrady++
    if (fixedTachy) c.fixedTachy++
    if (hypo || brady || tachy || fixedHypoHigh || fixedBrady || fixedTachy) c.anyWithFixed++
  }
  return {
    cases: n,
    hypotension: pct(c.hypo, n), bradycardia: pct(c.brady, n), tachycardia: pct(c.tachy, n), any: pct(c.any, n),
    fixedHypotensionFrom: pct(c.fixedHypoLow, n), fixedHypotensionTo: pct(c.fixedHypoHigh, n),
    fixedBradycardia: pct(c.fixedBrady, n), fixedTachycardia: pct(c.fixedTachy, n), anyWithFixed: pct(c.anyWithFixed, n)
  }
}
`

/** The arithmetic as functions, for the server and the tests. */
export type ReadingsMath = {
  percentile(histogram: { min: number; counts: number[] }, percent: number): number | null
  meanSd(histogram: { min: number; counts: number[] }): { mean: number; sd: number } | null
  shareOf(histogram: { min: number; counts: number[] }, value: number, side: "below" | "above"): number
  limitsOf(histogram: { min: number; counts: number[] } | undefined, lowTail: number, highTail: number): { low: number | null; high: number | null }
  impactOf(
    rows: Array<Array<number | null>>,
    limits: Record<string, { low?: number | null; high?: number | null }>,
    fixed: { tachycardiaAbove: number; bradycardiaBelow: number; hypotension: { sign: string; from: number; to: number } | null } | null,
  ): {
    cases: number
    hypotension: number | null; bradycardia: number | null; tachycardia: number | null; any: number | null
    fixedHypotensionFrom: number | null; fixedHypotensionTo: number | null
    fixedBradycardia: number | null; fixedTachycardia: number | null; anyWithFixed: number | null
  }
}

export const readingsMath: ReadingsMath = new Function(`${READINGS_MATH_SOURCE}\nreturn { percentile: percentile, meanSd: meanSd, shareOf: shareOf, limitsOf: limitsOf, impactOf: impactOf }`)() as ReadingsMath

/** The drawing and the controls. Runs in the browser, on the data and the strings the page embeds. */
export const READINGS_CLIENT_SOURCE = String.raw`
(function () {
  var root = document.getElementById("ur")
  var dataNode = document.getElementById("ur-data")
  if (!root || !dataNode) return
  var D = JSON.parse(dataNode.textContent)
  var T = D.strings
  var bg = D.locale === "bg"
  var STEPS = D.tailSteps
  var BANDS = D.bands
  var SIGNS = D.signs
  var form = document.getElementById("ur-form")
  var NS = "http://www.w3.org/2000/svg"
  var state = { band: 0, sign: "hr" }
  for (var b = 0; b < BANDS.length; b++) if (D.stats[BANDS[b].key] && b >= 0 && BANDS[b].key === "ADULT") state.band = b

  function el(id) { return document.getElementById(id) }
  function field(band, sign, end) { return form.elements["tail_" + band + "_" + sign + "_" + end] }
  function stepOf(band, sign, end) { var v = Number(String(field(band, sign, end).value).replace(",", ".")); var i = STEPS.indexOf(v); return i < 0 ? 0 : i }
  function setStep(band, sign, end, index) { field(band, sign, end).value = String(STEPS[index]) }
  function esc(text) { return String(text).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] }) }
  function label(entry) { return bg ? entry.labelBg : entry.labelEn }
  function short(sign) { return bg ? sign.shortBg : sign.shortEn }
  function fmt(value, digits) { return value == null ? "—" : value.toFixed(digits == null ? 1 : digits) }
  function percentText(value) { return value >= 99.95 ? "99.9" : value.toFixed(1) }
  function signOf(key) { for (var i = 0; i < SIGNS.length; i++) if (SIGNS[i].key === key) return SIGNS[i]; return SIGNS[0] }
  function minCases() { var v = Number(form.elements.minCases.value); return v >= D.minCasesRange.min ? v : D.config.minCases }

  function limitsFor(bandKey) {
    var out = {}
    for (var i = 0; i < SIGNS.length; i++) {
      var key = SIGNS[i].key
      out[key] = limitsOf(D.stats[bandKey] && D.stats[bandKey][key], STEPS[stepOf(bandKey, key, "low")], STEPS[stepOf(bandKey, key, "high")])
    }
    return out
  }
  function casesIn(bandKey) { var h = D.stats[bandKey] && D.stats[bandKey].hr; return h ? h.cases : 0 }

  function renderBands() {
    var html = ""
    for (var i = 0; i < BANDS.length; i++) {
      var collecting = casesIn(BANDS[i].key) < minCases()
      html += '<button type="button" class="ur-chip" aria-pressed="' + (i === state.band) + '" data-i="' + i + '"><span class="ur-dot' + (collecting ? " collect" : "") + '"></span>' + esc(label(BANDS[i])) + "</button>"
    }
    el("ur-bands").innerHTML = html
    var buttons = el("ur-bands").querySelectorAll("button")
    for (var k = 0; k < buttons.length; k++) buttons[k].onclick = function () { state.band = Number(this.getAttribute("data-i")); render() }
  }
  function renderTabs() {
    var html = ""
    for (var i = 0; i < SIGNS.length; i++) html += '<button type="button" class="ur-tab" role="tab" aria-selected="' + (SIGNS[i].key === state.sign) + '" data-k="' + SIGNS[i].key + '">' + esc(label(SIGNS[i])) + "</button>"
    el("ur-tabs").innerHTML = html
    var buttons = el("ur-tabs").querySelectorAll("button")
    for (var k = 0; k < buttons.length; k++) buttons[k].onclick = function () { state.sign = this.getAttribute("data-k"); render() }
  }

  function fixedLines(band, sign) {
    var out = []
    if (sign === "hr") {
      out.push({ at: band.fixed.tachycardiaAbove, text: T.tachycardiaAbove + " " + band.fixed.tachycardiaAbove })
      out.push({ at: band.fixed.bradycardiaBelow, text: T.bradycardiaBelow + " " + band.fixed.bradycardiaBelow })
    }
    var h = band.fixed.hypotension
    if (h && h.sign === sign) out.push({ at: h.to, from: h.from, text: T.hypotensionBelow.replace("{sign}", short(signOf(sign))) + " " + (h.from === h.to ? h.to : h.from + "–" + h.to) })
    return out
  }

  function renderChart() {
    var band = BANDS[state.band], sign = signOf(state.sign), hist = D.stats[band.key] && D.stats[band.key][sign.key]
    var svg = el("ur-chart")
    var asks = !(sign.key !== "hr" && !D.hypertensionUsesStatistics)
    if (!hist || readingsIn(hist.counts) === 0) {
      svg.innerHTML = '<text x="20" y="40">' + esc(T.noReadings) + "</text>"
      el("ur-lo-text").textContent = ""; el("ur-hi-text").textContent = ""
      el("ur-state").innerHTML = '<span class="ur-pill collect">' + esc(T.collecting) + "</span><span>" + esc(T.noReadingsBand) + "</span>"
      return
    }
    var lim = limitsOf(hist, STEPS[stepOf(band.key, sign.key, "low")], STEPS[stepOf(band.key, sign.key, "high")])
    var stat = meanSd(hist), fixed = fixedLines(band, sign.key)
    var W = 760, H = 300, L = 40, R = 16, T0 = 34, B = 74
    var vmin = hist.min, vmax = hist.min + hist.counts.length - 1
    if (stat) { vmin = Math.min(vmin, Math.floor(stat.mean - 3.3 * stat.sd)); vmax = Math.max(vmax, Math.ceil(stat.mean + 3.3 * stat.sd)) }
    for (var f = 0; f < fixed.length; f++) { vmin = Math.min(vmin, fixed[f].from == null ? fixed[f].at : fixed[f].from); vmax = Math.max(vmax, fixed[f].at) }
    vmin = Math.floor(vmin / 5) * 5; vmax = Math.ceil(vmax / 5) * 5
    var span = vmax - vmin, bw = span > 120 ? 2 : 1
    var maxC = 0, bins = {}, i
    for (i = 0; i < hist.counts.length; i++) {
      var value = hist.min + i, key = Math.floor(value / bw) * bw
      bins[key] = (bins[key] || 0) + hist.counts[i]
      if (bins[key] > maxC) maxC = bins[key]
    }
    function X(v) { return L + (v - vmin) / span * (W - L - R) }
    var plotB = H - B
    function Y(c) { return plotB - c / maxC * (plotB - T0) }
    var g = ""
    for (f = 0; f < fixed.length; f++) if (fixed[f].from != null && fixed[f].from !== fixed[f].at) g += '<rect class="ur-fixedband" x="' + X(fixed[f].from) + '" y="' + T0 + '" width="' + (X(fixed[f].at) - X(fixed[f].from)) + '" height="' + (plotB - T0) + '"/>'
    var keys = Object.keys(bins)
    for (i = 0; i < keys.length; i++) {
      var k0 = Number(keys[i]), tail = asks ? (k0 < lim.low || k0 + bw - 1 > lim.high) : (k0 < lim.low)
      var muted = !asks && k0 + bw - 1 > lim.high
      g += '<rect class="ur-bar' + (tail ? " tail" : "") + (muted ? " muted" : "") + '" x="' + (X(k0) + 0.5) + '" y="' + Y(bins[keys[i]]) + '" width="' + Math.max(1, X(k0 + bw) - X(k0) - 1) + '" height="' + (plotB - Y(bins[keys[i]])) + '"/>'
    }
    g += '<line class="ur-axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + plotB + '" y2="' + plotB + '"/>'
    var step = span > 120 ? 20 : 10
    for (var t = Math.ceil(vmin / step) * step; t <= vmax; t += step) g += '<line class="ur-axis" x1="' + X(t) + '" x2="' + X(t) + '" y1="' + plotB + '" y2="' + (plotB + 4) + '"/><text x="' + X(t) + '" y="' + (plotB + 16) + '" text-anchor="middle">' + t + "</text>"
    for (f = 0; f < fixed.length; f++) {
      var fx = X(fixed[f].at)
      g += '<line class="ur-fixed" x1="' + fx + '" x2="' + fx + '" y1="' + (T0 - 6) + '" y2="' + plotB + '"/><text class="ur-labfixed" x="' + (fx + 4) + '" y="' + (T0 - 8 + f * 13) + '">' + esc(fixed[f].text) + "</text>"
    }
    if (lim.low != null) g += '<line class="ur-limit" x1="' + X(lim.low) + '" x2="' + X(lim.low) + '" y1="' + (T0 + 18) + '" y2="' + plotB + '"/><text class="ur-lablimit" x="' + (X(lim.low) - 4) + '" y="' + (T0 + 30) + '" text-anchor="end">&lt; ' + lim.low + "</text>"
    if (lim.high != null && asks) g += '<line class="ur-limit" x1="' + X(lim.high + 1) + '" x2="' + X(lim.high + 1) + '" y1="' + (T0 + 18) + '" y2="' + plotB + '"/><text class="ur-lablimit" x="' + (X(lim.high + 1) + 4) + '" y="' + (T0 + 30) + '">&gt; ' + lim.high + "</text>"
    if (stat) {
      var ry = plotB + 38
      g += '<text x="' + L + '" y="' + (ry - 8) + '">' + esc(T.sdScale) + '</text><line class="ur-sd" x1="' + X(stat.mean - 3 * stat.sd) + '" x2="' + X(stat.mean + 3 * stat.sd) + '" y1="' + ry + '" y2="' + ry + '"/>'
      for (var s = -3; s <= 3; s++) {
        var sx = X(stat.mean + s * stat.sd)
        g += '<line class="' + (s === 0 ? "ur-mean" : "ur-sd") + '" x1="' + sx + '" x2="' + sx + '" y1="' + (ry - 5) + '" y2="' + (ry + 5) + '"/><text x="' + sx + '" y="' + (ry + 18) + '" text-anchor="middle">' + (s === 0 ? T.mean + " " + stat.mean.toFixed(0) : (s > 0 ? "+" : "−") + Math.abs(s)) + "</text>"
      }
    }
    svg.innerHTML = g
    svg.setAttribute("aria-label", label(sign) + ", " + label(band) + ": " + (lim.low == null ? "" : "< " + lim.low) + (asks && lim.high != null ? " / > " + lim.high : "") + " " + sign.unit)
    function z(x) { return stat && stat.sd ? (x - stat.mean) / stat.sd : null }
    function zText(x) { var v = z(x); return v == null ? "" : " (" + (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " SD)" }
    el("ur-lo-text").textContent = T.lowestShare.replace("{n}", String(STEPS[stepOf(band.key, sign.key, "low")])) + " · " + short(sign) + " < " + lim.low + zText(lim.low)
    el("ur-hi-text").textContent = asks
      ? T.highestShare.replace("{n}", String(STEPS[stepOf(band.key, sign.key, "high")])) + " · " + short(sign) + " > " + lim.high + zText(lim.high)
      : T.noHighQuestion
    var hiSlider = el("ur-hi"); hiSlider.disabled = !asks
    el("ur-hi-card").className = "ur-slider" + (asks ? "" : " off")
    var cases = hist.cases, need = minCases()
    el("ur-state").innerHTML = cases < need
      ? '<span class="ur-pill collect">' + esc(T.collecting) + "</span><span>" + esc(T.collectingDetail.replace("{n}", cases).replace("{m}", need)) + "</span>"
      : '<span class="ur-pill on">' + esc(T.active) + "</span><span>" + esc(T.activeDetail.replace("{cases}", cases).replace("{readings}", readingsIn(hist.counts)).replace("{mean}", stat ? stat.mean.toFixed(0) : "—").replace("{sd}", stat ? stat.sd.toFixed(1) : "—").replace("{unit}", sign.unit)) + "</span>"
  }

  function renderImpact() {
    var band = BANDS[state.band], rows = D.cases[band.key] || []
    var lim = limitsFor(band.key)
    var r = impactOf(rows, lim, band.fixed)
    var need = minCases(), inactive = casesIn(band.key) < need
    function cell(v) { return v == null ? "—" : v.toFixed(1) + "%" }
    function range(a, b) { return a == null ? "—" : (Math.abs(a - b) < 0.05 ? a.toFixed(1) + "%" : a.toFixed(1) + "–" + b.toFixed(1) + "%") }
    var html = "<tr><th>" + esc(T.question) + '</th><th class="n">' + esc(T.statistics) + '</th><th class="n">' + esc(T.fixedRules) + "</th></tr>"
    var hyp = band.fixed.hypotension
    html += "<tr><td>" + esc(T.hypotension) + '</td><td class="n">' + cell(r.hypotension) + '</td><td class="n">' + (hyp ? range(r.fixedHypotensionFrom, r.fixedHypotensionTo) : "—") + "</td></tr>"
    html += "<tr><td>" + esc(T.bradycardia) + '</td><td class="n">' + cell(r.bradycardia) + '</td><td class="n">' + cell(r.fixedBradycardia) + "</td></tr>"
    html += "<tr><td>" + esc(T.tachycardia) + '</td><td class="n">' + cell(r.tachycardia) + '</td><td class="n">' + cell(r.fixedTachycardia) + "</td></tr>"
    html += "<tr><td>" + esc(T.hypertension) + '</td><td class="n" colspan="2">' + esc(T.hypertensionBaseline.replace("{p}", D.config.hypertensionBaselinePercent == null ? "20" : String(D.config.hypertensionBaselinePercent))) + "</td></tr>"
    el("ur-impact").innerHTML = html
    el("ur-any").textContent = r.any == null ? "—" : r.any.toFixed(0) + "%"
    el("ur-any-all").textContent = r.anyWithFixed == null ? "—" : r.anyWithFixed.toFixed(0) + "%"
    el("ur-impact-note").textContent = (inactive ? T.wouldBe + " " : "") + T.impactNote.replace("{n}", String(r.cases))

    // What the clinician sees: the first tachycardia or bradycardia question these limits would raise, in Core's own words.
    var hist = D.stats[band.key] && D.stats[band.key].hr
    var pv = el("ur-preview")
    if (!hist || readingsIn(hist.counts) === 0 || lim.hr.high == null) { pv.hidden = true; return }
    pv.hidden = false
    var value = lim.hr.high + 6, hrName = short(signOf("hr")), stat = meanSd(hist)
    var share = percentText(shareOf(hist, value, "below"))
    var sdText = stat && stat.sd ? " (+" + ((value - stat.mean) / stat.sd).toFixed(1) + " SD)" : ""
    var stopAt = Math.min(lim.hr.high, band.fixed.tachycardiaAbove)
    el("ur-pv-title").textContent = bg ? hrName + " " + value + ": " + T.tachycardia + "?" : hrName + " " + value + ": log " + T.tachycardia.toLowerCase() + "?"
    el("ur-pv-detail").textContent = bg
      ? hrName + " " + value + " е по-високо от " + share + "% от отчитанията тук" + sdText + " · " + label(band)
      : hrName + " " + value + " is higher than " + share + "% of readings here" + sdText + " · " + label(band)
    el("ur-pv-stop").textContent = bg
      ? "Автоматичното записване спира, когато " + hrName + " е " + stopAt + " или по-малко."
      : "Automatic logging stops when " + hrName + " is " + stopAt + " or lower."
  }

  function renderHistory() {
    var band = BANDS[state.band], sign = signOf(state.sign), svg = el("ur-hist")
    var lowIdx = stepOf(band.key, sign.key, "low"), highIdx = stepOf(band.key, sign.key, "high")
    var asks = !(sign.key !== "hr" && !D.hypertensionUsesStatistics)
    var points = []
    for (var i = 0; i < D.history.length; i++) {
      var entry = D.history[i].limits[band.key] && D.history[i].limits[band.key][sign.key]
      points.push(entry ? { m: i + 1, month: D.history[i].month, cases: entry.cases, lo: entry.low[lowIdx], hi: entry.high[highIdx] } : null)
    }
    var real = points.filter(function (p) { return p && p.lo != null })
    if (real.length < 2) { svg.innerHTML = '<text x="20" y="40">' + esc(T.noHistory) + "</text>"; el("ur-hist-now").textContent = ""; return }
    var W = 760, H = 240, L = 44, R = 16, T0 = 20, B = 34, n = D.history.length
    var fixed = fixedLines(band, sign.key)
    var vals = []
    for (i = 0; i < real.length; i++) { vals.push(real[i].lo); if (asks) vals.push(real[i].hi) }
    for (i = 0; i < fixed.length; i++) { vals.push(fixed[i].at); if (fixed[i].from != null) vals.push(fixed[i].from) }
    var vmin = Math.floor(Math.min.apply(null, vals) / 10) * 10 - 5, vmax = Math.ceil(Math.max.apply(null, vals) / 10) * 10 + 5
    function X(m) { return L + (m - 1) / Math.max(1, n - 1) * (W - L - R) }
    function Y(v) { return T0 + (vmax - v) / (vmax - vmin) * (H - T0 - B) }
    var g = "", yStep = (vmax - vmin) > 120 ? 20 : 10
    for (var t = Math.ceil(vmin / yStep) * yStep; t <= vmax; t += yStep) g += '<line class="ur-axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" opacity=".6"/><text x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + t + "</text>"
    for (i = 0; i < n; i += 3) g += '<text x="' + X(i + 1) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(D.history[i].month) + "</text>"
    for (i = 0; i < fixed.length; i++) g += '<line class="ur-fixed" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(fixed[i].at) + '" y2="' + Y(fixed[i].at) + '"/><text class="ur-labfixed" x="' + (L + 6) + '" y="' + (Y(fixed[i].at) - 5) + '">' + esc(fixed[i].text) + "</text>"
    var need = minCases(), onAt = null
    for (i = 0; i < real.length; i++) if (real[i].cases >= need) { onAt = real[i]; break }
    if (onAt) g += '<line class="ur-sd" x1="' + X(onAt.m) + '" x2="' + X(onAt.m) + '" y1="' + T0 + '" y2="' + (H - B) + '" stroke-dasharray="2 3"/><text class="ur-lab" x="' + (X(onAt.m) + 5) + '" y="' + (T0 + 10) + '">' + esc(T.statisticsOn.replace("{n}", need)) + "</text>"
    var ends = asks ? ["lo", "hi"] : ["lo"]
    for (var e = 0; e < ends.length; e++) {
      var end = ends[e]
      var seg = function (filter, dash) {
        var ps = real.filter(filter)
        if (ps.length < 2) return ""
        return '<polyline fill="none" class="ur-line' + (dash ? " dotted" : "") + '" points="' + ps.map(function (p) { return X(p.m) + "," + Y(p[end]) }).join(" ") + '"/>'
      }
      g += seg(function (p) { return !onAt || p.cases <= onAt.cases }, true) + seg(function (p) { return onAt && p.cases >= onAt.cases }, false)
      var last = real[real.length - 1]
      g += '<circle cx="' + X(last.m) + '" cy="' + Y(last[end]) + '" r="4" class="ur-dotpoint"/><text class="ur-lablimit" x="' + (X(last.m) - 8) + '" y="' + (Y(last[end]) + (end === "hi" ? -9 : 17)) + '" text-anchor="end">' + (end === "hi" ? "&gt; " : "&lt; ") + last[end] + "</text>"
    }
    svg.innerHTML = g
    var first = onAt || real[real.length - 1], lastP = real[real.length - 1]
    el("ur-hist-sub").textContent = label(sign) + ", " + label(band) + " · " + T.lastMonths.replace("{n}", String(n))
    el("ur-hist-now").textContent = onAt
      ? T.sinceOn.replace("{lo0}", first.lo).replace("{lo1}", lastP.lo) + (asks ? " · " + T.sinceHigh.replace("{hi0}", first.hi).replace("{hi1}", lastP.hi) : "") + " " + sign.unit
      : T.notActiveYet.replace("{n}", lastP.cases).replace("{m}", need)
  }

  function refresh() { renderChart(); renderImpact(); renderHistory(); renderBands() }
  function render() {
    renderBands(); renderTabs()
    var band = BANDS[state.band]
    el("ur-lo").value = String(stepOf(band.key, state.sign, "low"))
    el("ur-hi").value = String(stepOf(band.key, state.sign, "high"))
    refresh()
  }
  el("ur-lo").oninput = function () { setStep(BANDS[state.band].key, state.sign, "low", Number(this.value)); refresh() }
  el("ur-hi").oninput = function () { setStep(BANDS[state.band].key, state.sign, "high", Number(this.value)); refresh() }
  form.elements.minCases.addEventListener("input", function () { refresh() })
  el("ur-reset").onclick = function () {
    var band = BANDS[state.band]
    for (var i = 0; i < SIGNS.length; i++) { setStep(band.key, SIGNS[i].key, "low", STEPS.indexOf(D.defaultTail)); setStep(band.key, SIGNS[i].key, "high", STEPS.indexOf(D.defaultTail)) }
    render()
  }
  root.className += " ur-js"
  render()
})()
`

/** What Status serves at /status/unusual-readings.js. */
export const UNUSUAL_READINGS_SCRIPT = READINGS_MATH_SOURCE + READINGS_CLIENT_SOURCE
