import test from "node:test";
import assert from "node:assert/strict";
import { loadQmlLibrary } from "../helpers.js";

const ViewHelpers = loadQmlLibrary("contents/ui/models/ViewHelpers.js");

test("buildCompactItems handles empty and invalid inputs", () => {
    assert.equal(ViewHelpers.buildCompactItems(null, ["cpu/usage"]).length, 0);
    assert.equal(ViewHelpers.buildCompactItems([], ["cpu/usage"]).length, 0);
    assert.equal(ViewHelpers.buildCompactItems([{ id: "cpu/usage", status: "ready" }], null).length, 0);
    assert.equal(ViewHelpers.buildCompactItems([{ id: "cpu/usage", status: "ready" }], []).length, 0);
    assert.equal(ViewHelpers.buildCompactItems([{ id: "cpu/usage", status: "loading" }], ["cpu/usage"]).length, 0);
});

test("buildCompactItems groups same family metrics when mergeSameFamily is true", () => {
    const metrics = [
        {
            id: "net/down",
            group: "net",
            subKey: "down",
            label: "NET",
            groupLabel: "NET",
            icon: "network-download-symbolic",
            groupIcon: "network-symbolic",
            displayValue: "10 KB/s",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "net/up",
            group: "net",
            subKey: "up",
            label: "NET",
            groupLabel: "NET",
            icon: "network-upload-symbolic",
            groupIcon: "network-symbolic",
            displayValue: "5 KB/s",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "cpu/usage",
            group: "cpu",
            subKey: "usage",
            label: "CPU",
            groupLabel: "CPU",
            icon: "cpu-symbolic",
            groupIcon: "cpu-symbolic",
            displayValue: "25%",
            color: "#ffffff",
            status: "ready"
        }
    ];

    const merged = ViewHelpers.buildCompactItems(metrics, ["net/down", "net/up", "cpu/usage"], true);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].key, "net");
    assert.equal(merged[0].segments.length, 2);
    assert.equal(merged[1].key, "cpu");
    assert.equal(merged[1].segments, null);

    const unmerged = ViewHelpers.buildCompactItems(metrics, ["net/down", "net/up", "cpu/usage"], false);
    assert.equal(unmerged.length, 3);
    assert.equal(unmerged[0].segments, null);
    assert.equal(unmerged[1].segments, null);
});

test("buildPopupGroups filters unavailable metrics and aggregates categories", () => {
    assert.equal(ViewHelpers.buildPopupGroups([], []).length, 0);
    assert.equal(ViewHelpers.buildPopupGroups(null, []).length, 0);

    const metrics = [
        {
            id: "cpu/usage",
            group: "cpu",
            subKey: "usage",
            label: "CPU",
            displayValue: "30%",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "cpu/temp",
            group: "cpu",
            subKey: "temp",
            label: "CPU Temp",
            displayValue: "55°C",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "ram/percentage",
            group: "ram",
            subKey: "percentage",
            label: "RAM",
            displayValue: "60%",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "gpu/usage",
            group: "gpu",
            subKey: "usage",
            deviceId: "gpu0",
            label: "GPU",
            displayValue: "15%",
            color: "#ffffff",
            status: "unavailable"
        }
    ];

    const groups = ViewHelpers.buildPopupGroups(metrics, ["cpu", "ram", "temp", "gpu"]);
    const keys = groups.map(g => g.key);

    assert.ok(keys.includes("processor"));
    assert.ok(keys.includes("temperature"));
    assert.ok(keys.includes("memory"));
    assert.ok(!keys.includes("gpu"));

    const proc = groups.find(g => g.key === "processor");
    assert.equal(proc.aggregateValue, "30%");
});

test("syncCompactValues detects structural differences and syncs in-place", () => {
    assert.equal(ViewHelpers.syncCompactValues(null, []), false);
    assert.equal(ViewHelpers.syncCompactValues([], null), false);
    assert.equal(ViewHelpers.syncCompactValues([{ key: "cpu" }], []), false);

    const itemA = {
        key: "cpu",
        label: "CPU:",
        icon: "cpu-symbolic",
        value: "10%",
        color: "#ffffff",
        hideSeparator: false,
        segments: null
    };
    const incomingA = {
        key: "cpu",
        label: "CPU:",
        icon: "cpu-symbolic",
        value: "20%",
        color: "#ff0000",
        hideSeparator: false,
        segments: null
    };

    const targetList = [itemA];
    assert.equal(ViewHelpers.syncCompactValues(targetList, [incomingA]), true);
    assert.equal(targetList[0].value, "20%");
    assert.equal(targetList[0].color, "#ff0000");

    const mismatchSep = { ...incomingA, hideSeparator: true };
    assert.equal(ViewHelpers.syncCompactValues(targetList, [mismatchSep]), false);
});
