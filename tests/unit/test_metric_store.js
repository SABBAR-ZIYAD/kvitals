import test from "node:test";
import assert from "node:assert/strict";
import { loadQmlLibrary } from "../helpers.js";

const MetricDefs = loadQmlLibrary("contents/ui/models/MetricDefinitions.js");

function resolveColor(val, warn, crit, warnClr, critClr, baseClr, inverted = false) {
    if (typeof val !== "number" || isNaN(val)) return baseClr;
    if (inverted) {
        if (val <= crit) return critClr;
        if (val <= warn) return warnClr;
        return baseClr;
    }
    if (val >= crit) return critClr;
    if (val >= warn) return warnClr;
    return baseClr;
}

function normalizeValue(val) {
    if (typeof val === "number" && isFinite(val) && !isNaN(val)) return val;
    return NaN;
}

function normalizeString(val, fallback = "") {
    if (typeof val === "string") return val;
    if (val !== undefined && val !== null) return String(val);
    return fallback;
}

function createMetricFactory(config, baseTextColor = "#ffffff") {
    function resolveMetricColor(numVal, thresholdType, thresholdKey) {
        if (!config || !config.enableThresholdColors || thresholdType === "none" || typeof numVal !== "number" || isNaN(numVal)) {
            return baseTextColor;
        }
        const warn = config.getWarningThreshold ? config.getWarningThreshold(thresholdKey) : 70;
        const crit = config.getCriticalThreshold ? config.getCriticalThreshold(thresholdKey) : 90;
        const inverted = thresholdType === "inverted";
        return resolveColor(numVal, warn, crit, config.warningColor || "#e5a50a", config.criticalColor || "#da4453", baseTextColor, inverted);
    }

    function createMetric(defId, overrides = {}) {
        const def = MetricDefs.DEFINITIONS[defId] || {};
        const group = normalizeString(overrides.group || def.group, "");
        const subKey = normalizeString(overrides.subKey || def.subKey, "");
        const devId = normalizeString(overrides.deviceId, "");
        const devName = normalizeString(overrides.deviceName, "");
        const instanceId = normalizeString(overrides.id, MetricDefs.buildInstanceId(group, devId, subKey));

        const rawVal = normalizeValue(overrides.value);
        const threshType = def.thresholdType || "none";
        const threshKey = def.thresholdKey || group;
        const clr = overrides.color !== undefined ? overrides.color : resolveMetricColor(rawVal, threshType, threshKey);

        const displayVal = normalizeString(overrides.displayValue, "");
        const isPinned = config && config.isPinned ? config.isPinned(instanceId) : false;

        return {
            id: instanceId,
            defId,
            group,
            subKey,
            deviceId: devId,
            deviceName: devName,
            label: normalizeString(overrides.label, def.label || group.toUpperCase()),
            groupLabel: normalizeString(overrides.groupLabel, def.label || group.toUpperCase()),
            subLabel: normalizeString(overrides.subLabel !== undefined ? overrides.subLabel : (def.label || ""), ""),
            value: rawVal,
            displayValue: displayVal,
            color: clr,
            status: normalizeString(overrides.status, "ready"),
            isPinned
        };
    }

    return { createMetric, resolveMetricColor };
}

test("normalizeValue and normalizeString handle invalid inputs safely", () => {
    assert.ok(isNaN(normalizeValue(NaN)));
    assert.ok(isNaN(normalizeValue(Infinity)));
    assert.ok(isNaN(normalizeValue("50")));
    assert.ok(isNaN(normalizeValue(null)));
    assert.equal(normalizeValue(42), 42);

    assert.equal(normalizeString("text"), "text");
    assert.equal(normalizeString(123), "123");
    assert.equal(normalizeString(null, "fallback"), "fallback");
    assert.equal(normalizeString(undefined, "default"), "default");
});

test("createMetric sets color based on normal and inverted thresholds", () => {
    const config = {
        enableThresholdColors: true,
        warningColor: "#warning",
        criticalColor: "#critical",
        getWarningThreshold: (k) => (k === "battery" ? 30 : 70),
        getCriticalThreshold: (k) => (k === "battery" ? 15 : 90),
        isPinned: (id) => id === "cpu/usage"
    };

    const factory = createMetricFactory(config, "#normal");

    const mNormal = factory.createMetric("cpu.usage", { value: 50, displayValue: "50%" });
    assert.equal(mNormal.color, "#normal");
    assert.equal(mNormal.isPinned, true);

    const mWarn = factory.createMetric("cpu.usage", { value: 75, displayValue: "75%" });
    assert.equal(mWarn.color, "#warning");

    const mCrit = factory.createMetric("cpu.usage", { value: 95, displayValue: "95%" });
    assert.equal(mCrit.color, "#critical");

    const bOk = factory.createMetric("bat.percentage", { value: 80, displayValue: "80%" });
    assert.equal(bOk.color, "#normal");

    const bWarn = factory.createMetric("bat.percentage", { value: 25, displayValue: "25%" });
    assert.equal(bWarn.color, "#warning");

    const bCrit = factory.createMetric("bat.percentage", { value: 10, displayValue: "10%" });
    assert.equal(bCrit.color, "#critical");
});

test("createMetric uses baseTextColor when threshold coloring disabled", () => {
    const config = { enableThresholdColors: false };
    const factory = createMetricFactory(config, "#base");

    const m = factory.createMetric("cpu.usage", { value: 99, displayValue: "99%" });
    assert.equal(m.color, "#base");
});
