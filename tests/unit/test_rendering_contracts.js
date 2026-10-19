import test from "node:test";
import assert from "node:assert/strict";
import { loadQmlLibrary } from "../helpers.js";

const ViewHelpers = loadQmlLibrary("contents/ui/models/ViewHelpers.js");

test("buildCompactItems produces exact data structure consumed by CompactView.qml", () => {
    const rawMetrics = [
        {
            id: "cpu/usage",
            group: "cpu",
            subKey: "usage",
            label: "CPU",
            groupLabel: "CPU",
            icon: "cpu-symbolic",
            groupIcon: "cpu-symbolic",
            displayValue: "35%",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "net/down",
            group: "net",
            subKey: "down",
            label: "NET",
            groupLabel: "NET",
            icon: "network-download-symbolic",
            groupIcon: "network-symbolic",
            displayValue: "12 KB/s",
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
            displayValue: "2 KB/s",
            color: "#ffffff",
            status: "ready"
        }
    ];

    const pinnedList = ["cpu/usage", "net/down", "net/up"];
    const compactItems = ViewHelpers.buildCompactItems(rawMetrics, pinnedList, true);

    assert.equal(compactItems.length, 2);

    const cpuItem = compactItems[0];
    assert.equal(typeof cpuItem.key, "string");
    assert.equal(typeof cpuItem.label, "string");
    assert.equal(typeof cpuItem.icon, "string");
    assert.equal(typeof cpuItem.value, "string");
    assert.equal(typeof cpuItem.color, "string");
    assert.equal(cpuItem.segments, null);

    const netItem = compactItems[1];
    assert.equal(typeof netItem.key, "string");
    assert.equal(typeof netItem.label, "string");
    assert.equal(typeof netItem.icon, "string");
    assert.equal(netItem.value, null);
    assert.ok(Array.isArray(netItem.segments));
    assert.equal(netItem.segments.length, 2);

    for (const seg of netItem.segments) {
        assert.equal(typeof seg.value, "string");
        assert.equal(typeof seg.color, "string");
        assert.equal(typeof seg.label, "string");
        assert.equal(typeof seg.icon, "string");
        assert.equal(typeof seg.key, "string");
    }
});

test("buildPopupGroups produces exact data structure consumed by FullView.qml", () => {
    const rawMetrics = [
        {
            id: "cpu/usage",
            group: "cpu",
            subKey: "usage",
            label: "CPU",
            subLabel: "Usage",
            icon: "cpu-symbolic",
            displayValue: "40%",
            color: "#ffffff",
            status: "ready",
            isPinned: true
        },
        {
            id: "cpu/temp",
            group: "cpu",
            subKey: "temp",
            label: "CPU",
            subLabel: "Temperature",
            icon: "temperature-symbolic",
            displayValue: "52°C",
            color: "#ffffff",
            status: "ready",
            isPinned: false
        }
    ];

    const groups = ViewHelpers.buildPopupGroups(rawMetrics, ["cpu", "temp"]);
    assert.ok(groups.length > 0);

    for (const group of groups) {
        assert.equal(typeof group.key, "string");
        assert.equal(typeof group.groupLabel, "string");
        assert.equal(typeof group.icon, "string");
        assert.equal(typeof group.aggregateValue, "string");
        assert.equal(typeof group.aggregateColor, "string");
        assert.ok(Array.isArray(group.sections));

        for (const section of group.sections) {
            assert.equal(typeof section.sectionLabel, "string");
            assert.ok(Array.isArray(section.metrics));

            for (const metric of section.metrics) {
                assert.equal(typeof metric.id, "string");
                assert.equal(typeof metric.icon, "string");
                assert.equal(typeof (metric.subLabel || metric.label), "string");
                assert.equal(typeof metric.displayValue, "string");
                assert.equal(typeof metric.color, "string");
            }
        }
    }
});
