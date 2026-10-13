const test = require("node:test");
const assert = require("node:assert/strict");
const { loadQmlLibrary } = require("../helpers.js");

const MetricDefs = loadQmlLibrary("contents/ui/models/MetricDefinitions.js");

function parseJsonSafe(str) {
    if (!str) return {};
    if (typeof str === "object") return str;
    const trimmed = String(str).trim();
    if (trimmed.startsWith("{")) {
        try {
            return JSON.parse(trimmed);
        } catch {}
    }
    const res = {};
    trimmed.split("|").forEach(pair => {
        const sep = pair.indexOf(":");
        if (sep > 0) res[pair.substring(0, sep).trim()] = pair.substring(sep + 1).trim();
    });
    return res;
}

function createConfigModel(target = {}) {
    const propertyPrefix = "";

    function parsePinnedList() {
        const raw = target.pinnedMetrics || "cpu/usage,ram/percentage,temp/system,bat/percentage,net/down,net/up";
        return raw.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }

    function isPinned(id) {
        return parsePinnedList().includes(id);
    }

    function togglePin(id) {
        const list = parsePinnedList();
        const idx = list.indexOf(id);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(id);
        target.pinnedMetrics = list.join(",");
    }

    function movePinnedMetric(fromIndex, toIndex) {
        const list = parsePinnedList();
        if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return;
        const item = list.splice(fromIndex, 1)[0];
        list.splice(toIndex, 0, item);
        target.pinnedMetrics = list.join(",");
    }

    function isGpuSelected(deviceId) {
        const raw = target.gpuSelection || "";
        if (raw === "none") return false;
        if (!raw) return true;
        return raw.split(",").map(s => s.trim()).includes(deviceId);
    }

    function setGpuSelected(deviceId, enabled, allDiscoveredGpuIds) {
        const raw = target.gpuSelection || "";
        let current;
        if (raw === "none") current = [];
        else if (!raw) current = allDiscoveredGpuIds ? allDiscoveredGpuIds.slice() : [];
        else current = raw.split(",").map(s => s.trim()).filter(s => s.length > 0);

        const idx = current.indexOf(deviceId);
        if (enabled && idx === -1) current.push(deviceId);
        else if (!enabled && idx !== -1) current.splice(idx, 1);

        target.gpuSelection = current.length === 0 ? "none" : current.join(",");
    }

    function getOrderedKeys() {
        const all = MetricDefs.ALL_GROUP_KEYS;
        const raw = target.metricOrder || "cpu,ram,temp,gpu,bat,net,disk,fan,uptime";
        const keys = raw.split(",").map(k => k.trim()).filter(k => k.length > 0 && all.includes(k));
        for (let i = 0; i < all.length; i++) {
            if (!keys.includes(all[i])) keys.push(all[i]);
        }
        return keys;
    }

    return {
        target,
        parsePinnedList,
        isPinned,
        togglePin,
        movePinnedMetric,
        isGpuSelected,
        setGpuSelected,
        getOrderedKeys
    };
}

// JSON and legacy label parsing
test("parseJsonSafe handles modern JSON and legacy pipe formats", () => {
    assert.deepEqual(parseJsonSafe(null), {});
    assert.deepEqual(parseJsonSafe(""), {});
    assert.deepEqual(parseJsonSafe({ gpu0: "Discrete" }), { gpu0: "Discrete" });

    // JSON format
    const jsonStr = JSON.stringify({ gpu0: "NVIDIA RTX", gpu1: "Intel UHD" });
    assert.deepEqual(parseJsonSafe(jsonStr), { gpu0: "NVIDIA RTX", gpu1: "Intel UHD" });

    // Legacy pipe format
    assert.deepEqual(parseJsonSafe("gpu0:NVIDIA RTX | gpu1:Intel UHD"), {
        gpu0: "NVIDIA RTX",
        gpu1: "Intel UHD"
    });
});

// Pinned metrics list manipulation
test("MetricConfig pinnedList supports toggling, ordering, and defaults", () => {
    const config = createConfigModel();
    const defaults = config.parsePinnedList();
    assert.equal(defaults.includes("cpu/usage"), true);
    assert.equal(config.isPinned("cpu/usage"), true);
    assert.equal(config.isPinned("unknown/metric"), false);

    // Toggle out
    config.togglePin("cpu/usage");
    assert.equal(config.isPinned("cpu/usage"), false);

    // Toggle in
    config.togglePin("cpu/usage");
    assert.equal(config.isPinned("cpu/usage"), true);

    // Reorder
    config.target.pinnedMetrics = "a,b,c";
    config.movePinnedMetric(0, 2);
    assert.equal(config.target.pinnedMetrics, "b,c,a");
});

// GPU selection state
test("MetricConfig gpuSelection handles default, none, and specific GPUs", () => {
    const config = createConfigModel();
    assert.equal(config.isGpuSelected("gpu0"), true);

    config.setGpuSelected("gpu0", false, ["gpu0", "gpu1"]);
    assert.equal(config.isGpuSelected("gpu0"), false);
    assert.equal(config.isGpuSelected("gpu1"), true);

    config.setGpuSelected("gpu1", false, ["gpu0", "gpu1"]);
    assert.equal(config.target.gpuSelection, "none");
    assert.equal(config.isGpuSelected("gpu1"), false);
});

// Metric category order with missing key fill
test("MetricConfig orderedKeys includes all groups even if omitted in config", () => {
    const config = createConfigModel({ metricOrder: "gpu,cpu" });
    const keys = config.getOrderedKeys();

    assert.equal(keys[0], "gpu");
    assert.equal(keys[1], "cpu");
    for (const g of MetricDefs.ALL_GROUP_KEYS) {
        assert.ok(keys.includes(g));
    }
});
