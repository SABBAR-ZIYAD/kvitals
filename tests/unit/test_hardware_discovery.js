import test from "node:test";
import assert from "node:assert/strict";
import { loadQmlLibrary } from "../helpers.js";

const MetricDefs = loadQmlLibrary("contents/ui/models/MetricDefinitions.js");

function createHardwareInventory(rawSensors) {
    const ids = [];
    const sensors = [];
    const idSet = {};
    const patternCache = {};

    const gpuMap = {};
    const diskMap = {};
    const fanSet = {};
    const coreMap = {};
    const ifaceSet = {};
    const batSet = {};
    const diskTempSet = {};

    const pGpu = MetricDefs.PATTERNS.GPU;
    const pDisk = MetricDefs.PATTERNS.DISK_READ;
    const pFan = MetricDefs.PATTERNS.FAN;
    const pCore = MetricDefs.PATTERNS.CPU_CORE;
    const pNet = MetricDefs.PATTERNS.NETWORK_IFACE;
    const pBat = MetricDefs.PATTERNS.BATTERY;
    const pDiskTemp = MetricDefs.PATTERNS.DISK_TEMP;

    for (let i = 0; i < rawSensors.length; i++) {
        const sid = rawSensors[i];
        if (!sid || /[\(\)\*\?\+]/.test(sid)) continue;

        ids.push(sid);
        sensors.push({ id: sid, name: sid });
        idSet[sid] = true;

        let m = null;
        if ((m = sid.match(pGpu))) {
            gpuMap[m[1]] = true;
        } else if ((m = sid.match(pDisk))) {
            diskMap[m[1]] = true;
        } else if (pFan.test(sid)) {
            fanSet[sid] = true;
        } else if ((m = sid.match(pCore))) {
            coreMap[m[1]] = true;
        } else if ((m = sid.match(pNet))) {
            if (m[1] !== "all" && m[1] !== "lo") ifaceSet[m[1]] = true;
        } else if ((m = sid.match(pBat))) {
            batSet[m[1]] = true;
        } else if (pDiskTemp.test(sid)) {
            diskTempSet[sid] = true;
        }
    }

    const gList = Object.keys(gpuMap).sort();
    const discoveredGpus = gList.map((id, i) => ({ id, name: "GPU " + (i + 1) }));

    const dList = Object.keys(diskMap).sort();
    const discoveredDisks = dList.map((id, i) => ({ id, name: "Disk " + (i + 1) }));

    const fList = Object.keys(fanSet).sort();
    const discoveredFans = fList.map((id, i) => ({ id, name: "Fan " + (i + 1) }));

    const cList = Object.keys(coreMap);
    const cSorted = [];
    for (let ci = 0; ci < cList.length; ci++) {
        const num = parseInt(cList[ci].replace("cpu", ""), 10);
        cSorted.push({ id: cList[ci], number: isNaN(num) ? ci : num });
    }
    cSorted.sort((a, b) => a.number - b.number);
    const discoveredCores = cSorted.map(c => ({ id: c.id, number: c.number, name: "Core " + (c.number + 1) }));

    const nList = Object.keys(ifaceSet).sort();
    const discoveredNetworkIfaces = ["auto", ...nList];

    const discoveredBatteries = Object.keys(batSet).sort();
    const discoveredDiskTemps = Object.keys(diskTempSet).sort();

    function queryIds(pattern) {
        if (!pattern) return [];
        const key = (pattern instanceof RegExp) ? pattern.source : String(pattern);
        if (patternCache[key]) return patternCache[key];
        const regex = (pattern instanceof RegExp) ? pattern : new RegExp(pattern);
        const res = ids.filter(id => regex.test(id));
        patternCache[key] = res;
        return res;
    }

    function sensorExists(sensorId) {
        return idSet[sensorId] === true;
    }

    return {
        allIds: ids,
        discoveredGpus,
        discoveredDisks,
        discoveredFans,
        discoveredCores,
        discoveredNetworkIfaces,
        discoveredBatteries,
        discoveredDiskTemps,
        queryIds,
        sensorExists
    };
}

test("Hardware inventory extracts GPUs, disks, cores, fans, and network interfaces", () => {
    const raw = [
        "cpu/all/usage",
        "cpu/cpu10/usage",
        "cpu/cpu2/usage",
        "cpu/cpu0/usage",
        "gpu/gpu1/usage",
        "gpu/gpu0/usage",
        "disk/nvme0n1/read",
        "disk/sda/read",
        "disk/all/read",
        "network/wlan0/download",
        "network/lo/download",
        "network/all/download",
        "power/BAT0/chargePercentage",
        "lmsensors/it8688-isa-0a30/fan1",
        "disk/nvme0n1/temperature"
    ];

    const inv = createHardwareInventory(raw);

    assert.equal(inv.discoveredCores.length, 3);
    assert.equal(inv.discoveredCores[0].id, "cpu0");
    assert.equal(inv.discoveredCores[0].name, "Core 1");
    assert.equal(inv.discoveredCores[1].id, "cpu2");
    assert.equal(inv.discoveredCores[1].name, "Core 3");
    assert.equal(inv.discoveredCores[2].id, "cpu10");
    assert.equal(inv.discoveredCores[2].name, "Core 11");

    assert.equal(inv.discoveredGpus.length, 2);
    assert.equal(inv.discoveredGpus[0].id, "gpu0");
    assert.equal(inv.discoveredGpus[1].id, "gpu1");

    assert.deepEqual(inv.discoveredNetworkIfaces, ["auto", "wlan0"]);

    assert.equal(inv.discoveredDisks.length, 2);
    assert.equal(inv.discoveredDisks[0].id, "nvme0n1");
    assert.equal(inv.discoveredDisks[1].id, "sda");

    assert.deepEqual(inv.discoveredBatteries, ["BAT0"]);
    assert.equal(inv.discoveredFans.length, 1);

    assert.equal(inv.sensorExists("cpu/all/usage"), true);
    assert.equal(inv.sensorExists("nonexistent"), false);

    const q1 = inv.queryIds(/^cpu\/cpu\d+\/usage$/);
    const q2 = inv.queryIds(/^cpu\/cpu\d+\/usage$/);
    assert.equal(q1, q2);
    assert.equal(q1.length, 3);
});
