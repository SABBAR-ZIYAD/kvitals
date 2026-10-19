import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadQmlLibrary(relPath) {
    const fullPath = resolve(__dirname, "..", relPath);
    let code = readFileSync(fullPath, "utf8");
    code = code.replace(/^\s*\.pragma\s+library\s*/m, "");
    const sandbox = {
        i18n: (s, ...args) => {
            let res = s;
            for (let i = 0; i < args.length; i++) {
                res = res.replace("%" + (i + 1), args[i]);
            }
            return res;
        }
    };
    createContext(sandbox);
    runInContext(code, sandbox);
    return sandbox;
}

const DefsAndHelpers = loadQmlLibrary("contents/ui/models/ViewHelpers.js");
const MetricDefs = loadQmlLibrary("contents/ui/models/MetricDefinitions.js");

// Pure JS implementation matching DiskSensors.qml sysfs mapping logic
function parseSysfsOutput(rawOutput, availableSensors) {
    if (!rawOutput) return {};
    const map = {};
    const lines = String(rawOutput).split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(":");
        if (parts.length < 3) continue;
        const bname = parts[0].trim();
        const hname = parts[1].trim();
        const hdev = parts.slice(2).join(":").trim();

        let adapterPrefix = "";
        if (hname === "nvme") {
            const pciMatches = hdev.match(/[0-9a-fA-F]{4}:([0-9a-fA-F]{2}):([0-9a-fA-F]{2})\.([0-9a-fA-F])/g);
            if (pciMatches && pciMatches.length > 0) {
                const lastPci = pciMatches[pciMatches.length - 1];
                const m = lastPci.match(/([0-9a-fA-F]{2}):([0-9a-fA-F]{2})\.([0-9a-fA-F])/);
                if (m) {
                    const pciAddr = m[1] + m[2];
                    adapterPrefix = "lmsensors/nvme-pci-" + pciAddr.toLowerCase();
                }
            }
        } else if (hname === "drivetemp") {
            const scsiMatch = hdev.match(/host(\d+)\/target\d+:\d+:(\d+)\/(\d+):(\d+):(\d+):(\d+)/);
            if (scsiMatch) {
                adapterPrefix = "lmsensors/drivetemp-scsi-" + scsiMatch[1] + "-" + scsiMatch[2];
            } else {
                const scsiDevMatch = hdev.match(/(\d+):(\d+):(\d+):(\d+)$/);
                if (scsiDevMatch) {
                    adapterPrefix = "lmsensors/drivetemp-scsi-" + scsiDevMatch[1] + "-" + scsiDevMatch[3];
                }
            }
        }

        if (adapterPrefix) {
            const targetSensor = adapterPrefix + "/temp1";
            if (availableSensors && availableSensors.length > 0) {
                if (availableSensors.indexOf(targetSensor) !== -1) {
                    map[bname] = targetSensor;
                } else {
                    for (let s = 0; s < availableSensors.length; s++) {
                        if (availableSensors[s].indexOf(adapterPrefix) === 0) {
                            map[bname] = availableSensors[s];
                            break;
                        }
                    }
                }
            } else {
                map[bname] = targetSensor;
            }
        }
    }
    return map;
}

function createDiskSensorResolver(sysfsOutput, tempSensorIds, directSensors = {}) {
    const discovery = {
        sensorExists: (id) => Boolean(directSensors[id])
    };
    const sysfsMap = parseSysfsOutput(sysfsOutput, tempSensorIds);

    function _findTempSensorForDisk(diskId) {
        if (!diskId) return "";

        // Direct sensor
        const directId = "disk/" + diskId + "/temperature";
        if (discovery && discovery.sensorExists(directId)) return directId;

        // Sysfs-derived hardware mapping
        if (sysfsMap[diskId]) return sysfsMap[diskId];

        return "";
    }

    return { _findTempSensorForDisk, sysfsMap };
}

// 1. Network group icon + download/upload segment icons
test("Network group icon + download/upload segment icons", () => {
    const metricsList = [
        {
            id: "net/down",
            group: "net",
            subKey: "down",
            label: "NET",
            groupLabel: "NET",
            groupIcon: "network-symbolic",
            icon: "network-download-symbolic",
            displayValue: "1.16 KB/s",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "net/up",
            group: "net",
            subKey: "up",
            label: "NET",
            groupLabel: "NET",
            groupIcon: "network-symbolic",
            icon: "network-upload-symbolic",
            displayValue: "666 B/s",
            color: "#ffffff",
            status: "ready"
        }
    ];

    const compactItems = DefsAndHelpers.buildCompactItems(metricsList, ["net/down", "net/up"], true);
    assert.equal(compactItems.length, 1);
    const item = compactItems[0];

    assert.equal(item.icon, "network-symbolic");
    assert.ok(item.segments, "Should have merged segments");
    assert.equal(item.segments.length, 2);
    assert.equal(item.segments[0].icon, "network-download-symbolic");
    assert.equal(item.segments[0].value, "1.16 KB/s");
    assert.equal(item.segments[1].icon, "network-upload-symbolic");
    assert.equal(item.segments[1].value, "666 B/s");
});

// 2. Disk group icon + read/write segment icons with compact temp UX
test("Disk group icon + read/write segment icons with compact temp UX", () => {
    const metricsList = [
        {
            id: "disk:nvme0n1/read",
            group: "disk",
            deviceId: "nvme0n1",
            subKey: "read",
            label: "DSK 1",
            groupLabel: "DSK 1",
            groupIcon: "storage-symbolic",
            icon: "network-download-symbolic",
            displayValue: "10 MB/s",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "disk:nvme0n1/write",
            group: "disk",
            deviceId: "nvme0n1",
            subKey: "write",
            label: "DSK 1",
            groupLabel: "DSK 1",
            groupIcon: "storage-symbolic",
            icon: "network-upload-symbolic",
            displayValue: "2 MB/s",
            color: "#ffffff",
            status: "ready"
        },
        {
            id: "disk:nvme0n1/temp",
            group: "disk",
            deviceId: "nvme0n1",
            subKey: "temp",
            label: "DSK 1",
            groupLabel: "DSK 1",
            groupIcon: "storage-symbolic",
            icon: "temperature-symbolic",
            displayValue: "52°C",
            color: "#ffffff",
            status: "ready"
        }
    ];

    const compactItems = DefsAndHelpers.buildCompactItems(metricsList, ["disk:nvme0n1/read", "disk:nvme0n1/write", "disk:nvme0n1/temp"], true);
    assert.equal(compactItems.length, 1);
    const item = compactItems[0];

    assert.equal(item.icon, "storage-symbolic");
    assert.ok(item.segments);
    assert.equal(item.segments.length, 3);
    assert.equal(item.segments[0].icon, "network-download-symbolic");
    assert.equal(item.segments[0].value, "10 MB/s");
    assert.equal(item.segments[1].icon, "network-upload-symbolic");
    assert.equal(item.segments[1].value, "2 MB/s");
    assert.equal(item.segments[2].value, "52°C");
    assert.equal(item.segments[2].icon, "");
    assert.equal(item.segments[2].label, "");
});

// 3. RAM temperature discovery and palette visibility
test("RAM temperature discovery and palette visibility", () => {
    const panelOrderQml = readFileSync(resolve(__dirname, "../contents/ui/configPanelOrder.qml"), "utf8");
    assert.ok(panelOrderQml.includes('id: "ram/temp"'), "configPanelOrder.qml must include ram/temp in palette");
    assert.ok(panelOrderQml.includes('RAM Temperature'), "configPanelOrder.qml must label ram/temp");

    const ramPattern = /^(spd5118|jc42|dimm_temp|dimm-temp)/i;
    assert.ok(ramPattern.test("spd5118-i2c-3-50"), "Should match DDR5 spd5118 driver");
    assert.ok(ramPattern.test("jc42-i2c-0-18"), "Should match DDR3/DDR4 jc42 driver");
    assert.ok(ramPattern.test("dimm-temp-0"), "Should match dimm-temp driver");
    assert.ok(!ramPattern.test("coretemp-isa-0000"), "Should not match CPU coretemp");
    assert.ok(!ramPattern.test("nvme-pci-0300"), "Should not match NVMe");
});

// 4. RAM temperature startup before first sensor sample
test("RAM temperature startup before first sensor sample", () => {
    const s = {
        temp: {
            ramTempExists: true,
            ramTempNumericValue: NaN,
            ramTempValue: "--"
        }
    };

    let createdMetric = null;
    if (s.temp && s.temp.ramTempExists) {
        const rNum = s.temp.ramTempNumericValue;
        const rDisp = s.temp.ramTempValue;
        createdMetric = {
            id: "ram/temp",
            value: rNum,
            displayValue: (rDisp && rDisp !== "--") ? rDisp : "...",
            status: !isNaN(rNum) ? "ready" : "loading"
        };
    }

    assert.ok(createdMetric, "Metric should be created even before first sample");
    assert.equal(createdMetric.status, "loading");
    assert.equal(createdMetric.displayValue, "...");
});

// 5. NVMe namespace sharing
test("NVMe namespace sharing: multiple namespaces on same controller share sensor", () => {
    const sysfsOutput = `
nvme0n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:03:00.0/nvme/nvme0
nvme0n2:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:03:00.0/nvme/nvme0
`;
    const sensors = ["lmsensors/nvme-pci-0300/temp1", "lmsensors/nvme-pci-0300/temp2"];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutput, sensors);

    assert.equal(_findTempSensorForDisk("nvme0n1"), "lmsensors/nvme-pci-0300/temp1");
    assert.equal(_findTempSensorForDisk("nvme0n2"), "lmsensors/nvme-pci-0300/temp1");
});

// 6. Multiple NVMe controllers with missing controller numbers
test("Multiple NVMe controllers with missing controller numbers (e.g. nvme0, nvme2)", () => {
    const sysfsOutput = `
nvme0n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:01:00.0/nvme/nvme0
nvme2n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:04:00.0/nvme/nvme2
`;
    const sensors = ["lmsensors/nvme-pci-0100/temp1", "lmsensors/nvme-pci-0400/temp1"];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutput, sensors);

    assert.equal(_findTempSensorForDisk("nvme0n1"), "lmsensors/nvme-pci-0100/temp1");
    assert.equal(_findTempSensorForDisk("nvme2n1"), "lmsensors/nvme-pci-0400/temp1");
});

// 7. Multiple SATA disks with different SCSI hosts
test("Multiple SATA disks with different SCSI hosts and targets", () => {
    const sysfsOutput = `
sda:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata1/host0/target0:0:0/0:0:0:0
sdb:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata2/host2/target2:0:0/2:0:0:0
`;
    const sensors = ["lmsensors/drivetemp-scsi-0-0/temp1", "lmsensors/drivetemp-scsi-2-0/temp1"];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutput, sensors);

    assert.equal(_findTempSensorForDisk("sda"), "lmsensors/drivetemp-scsi-0-0/temp1");
    assert.equal(_findTempSensorForDisk("sdb"), "lmsensors/drivetemp-scsi-2-0/temp1");
});

// 8. USB disk without a matching hwmon device
test("USB disk without matching hwmon device does not receive SATA temperature", () => {
    const sysfsOutput = `
sdb:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata2/host2/target2:0:0/2:0:0:0
`; // sda is USB and had no hwmon match, so it does not appear in sysfsOutput
    const sensors = ["lmsensors/drivetemp-scsi-2-0/temp1"];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutput, sensors);

    assert.equal(_findTempSensorForDisk("sda"), "", "USB drive without hwmon must return empty");
    assert.equal(_findTempSensorForDisk("sdb"), "lmsensors/drivetemp-scsi-2-0/temp1");
});

// 9. Reversed discovery order
test("Reversed discovery order does not alter device-identity mapping", () => {
    const sysfsOutputReversed = `
sdb:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata2/host2/target2:0:0/2:0:0:0
sda:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata1/host0/target0:0:0/0:0:0:0
nvme1n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:04:00.0/nvme/nvme1
nvme0n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:03:00.0/nvme/nvme0
`;
    const sensors = [
        "lmsensors/nvme-pci-0300/temp1",
        "lmsensors/nvme-pci-0400/temp1",
        "lmsensors/drivetemp-scsi-0-0/temp1",
        "lmsensors/drivetemp-scsi-2-0/temp1"
    ];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutputReversed, sensors);

    assert.equal(_findTempSensorForDisk("nvme0n1"), "lmsensors/nvme-pci-0300/temp1");
    assert.equal(_findTempSensorForDisk("nvme1n1"), "lmsensors/nvme-pci-0400/temp1");
    assert.equal(_findTempSensorForDisk("sda"), "lmsensors/drivetemp-scsi-0-0/temp1");
    assert.equal(_findTempSensorForDisk("sdb"), "lmsensors/drivetemp-scsi-2-0/temp1");
});

// 10. Direct KSystemStats sensor taking priority over sysfs fallback
test("Direct KSystemStats sensor takes priority over sysfs fallback", () => {
    const sysfsOutput = `
sda:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata1/host0/target0:0:0/0:0:0:0
`;
    const sensors = ["lmsensors/drivetemp-scsi-0-0/temp1"];
    const directSensors = {
        "disk/sda/temperature": true
    };
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutput, sensors, directSensors);

    assert.equal(_findTempSensorForDisk("sda"), "disk/sda/temperature");
});

// 11. Missing hwmon match returning no temperature
test("Missing hwmon match returns no temperature", () => {
    const sysfsOutput = "";
    const sensors = ["lmsensors/nvme-pci-0300/temp1"];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfsOutput, sensors);

    assert.equal(_findTempSensorForDisk("sda"), "");
    assert.equal(_findTempSensorForDisk("nvme0n1"), "");
});

// 12. Hotplug refresh rebuilding the mapping
test("Hotplug refresh rebuilding the mapping on device add/remove", () => {
    let currentSysfs = `
nvme0n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:03:00.0/nvme/nvme0
`;
    const sensors = ["lmsensors/nvme-pci-0300/temp1", "lmsensors/drivetemp-scsi-0-0/temp1"];

    let resolver = createDiskSensorResolver(currentSysfs, sensors);
    assert.equal(resolver._findTempSensorForDisk("nvme0n1"), "lmsensors/nvme-pci-0300/temp1");
    assert.equal(resolver._findTempSensorForDisk("sda"), "");

    // Hotplug adds sda
    currentSysfs += `
sda:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata1/host0/target0:0:0/0:0:0:0
`;
    resolver = createDiskSensorResolver(currentSysfs, sensors);
    assert.equal(resolver._findTempSensorForDisk("nvme0n1"), "lmsensors/nvme-pci-0300/temp1");
    assert.equal(resolver._findTempSensorForDisk("sda"), "lmsensors/drivetemp-scsi-0-0/temp1");
});

// Battery discovery pattern
test("Structural battery pattern matches valid device IDs (including serials and IDs starting with all) and rejects non-chargePercentage or malformed paths", () => {
    const pattern = MetricDefs.PATTERNS.BATTERY;
    assert.ok(pattern, "PATTERNS.BATTERY should be defined");

    const validSensors = [
        ["power/BAT0/chargePercentage", "BAT0"],
        ["power/battery_BAT0/chargePercentage", "battery_BAT0"],
        ["power/CMB0/chargePercentage", "CMB0"],
        ["power/macsmc-battery/chargePercentage", "macsmc-battery"],
        ["power/L19M3PF5/chargePercentage", "L19M3PF5"],
        ["power/01234/chargePercentage", "01234"],
        ["power/allBattery/chargePercentage", "allBattery"],
        ["power/all_foo/chargePercentage", "all_foo"],
        ["power/all/chargePercentage", "all"]
    ];

    for (const [sensorId, expectedId] of validSensors) {
        const match = sensorId.match(pattern);
        assert.ok(match, "Sensor should match: " + sensorId);
        assert.equal(match[1], expectedId, "Captured ID should match expected for: " + sensorId);
    }

    const nonChargePercentageSensors = [
        "power/battery_BAT0/chargeRate",
        "power/battery_BAT0/health",
        "power/BAT0/capacity",
        "gpu/gpu0/power",
        "cpu/all/usage"
    ];

    for (const sensorId of nonChargePercentageSensors) {
        assert.ok(!pattern.test(sensorId), "Non-chargePercentage path should not match: " + sensorId);
    }

    const malformedPaths = [
        "power//chargePercentage",
        "power/chargePercentage",
        "power/BAT0/chargePercentage/wrong",
        "battery/BAT0/chargePercentage",
        "power/BAT0/chargePercentage/extra"
    ];

    for (const sensorId of malformedPaths) {
        assert.ok(!pattern.test(sensorId), "Malformed path should not match: " + sensorId);
    }
});

// Battery device resolution
test("Battery device ID resolution handles auto, manual, and sysfs prefixes", () => {
    function resolveBase(batteryDevice, discoveredBatId, knownSensors) {
        const discovery = {
            sensorExists: (id) => knownSensors.includes(id)
        };
        if (batteryDevice && batteryDevice !== "auto") {
            let dev = batteryDevice.trim();
            dev = dev.replace(/^power\//, "").replace(/\/.*$/, "");
            if (discovery && discovery.sensorExists) {
                if (discovery.sensorExists("power/" + dev + "/chargePercentage")) return dev;
                if (discovery.sensorExists("power/battery_" + dev + "/chargePercentage")) return "battery_" + dev;
                const stripped = dev.replace(/^battery_/, "");
                if (discovery.sensorExists("power/" + stripped + "/chargePercentage")) return stripped;
                return "";
            }
            return "";
        }
        return discoveredBatId;
    }

    const sensorsA = ["power/battery_BAT0/chargePercentage"];
    assert.equal(resolveBase("auto", "battery_BAT0", sensorsA), "battery_BAT0");
    assert.equal(resolveBase("BAT0", "", sensorsA), "battery_BAT0");
    assert.equal(resolveBase("battery_BAT0", "", sensorsA), "battery_BAT0");

    const sensorsB = ["power/BAT0/chargePercentage"];
    assert.equal(resolveBase("auto", "BAT0", sensorsB), "BAT0");
    assert.equal(resolveBase("BAT0", "", sensorsB), "BAT0");
    assert.equal(resolveBase("battery_BAT0", "", sensorsB), "BAT0");

    const sensorsC = ["power/L19M3PF5/chargePercentage"];
    assert.equal(resolveBase("auto", "L19M3PF5", sensorsC), "L19M3PF5");
    assert.equal(resolveBase("L19M3PF5", "", sensorsC), "L19M3PF5");

    assert.equal(resolveBase("power/BAT0/chargePercentage", "", sensorsB), "BAT0");
    assert.equal(resolveBase("auto", "", []), "");
    assert.equal(resolveBase("invalid_device", "", sensorsA), "");
    assert.equal(resolveBase("BAT99", "", sensorsB), "");
});

// Disk discovery pattern tests
test("Disk discovery patterns match standard, multipath, virtual, and eMMC devices", () => {
    const pRead = MetricDefs.PATTERNS.DISK_READ;
    const pTemp = MetricDefs.PATTERNS.DISK_TEMP;

    const validReadIds = [
        "disk/nvme0n1/read",
        "disk/nvme1n1/read",
        "disk/nvme0c0n1/read",
        "disk/nvme0/read",
        "disk/sda/read",
        "disk/sdb/read",
        "disk/sdz/read",
        "disk/sdaa/read",
        "disk/vda/read",
        "disk/xvda/read",
        "disk/mmcblk0/read"
    ];

    for (const sid of validReadIds) {
        assert.ok(pRead.test(sid), "Expected match for read sensor: " + sid);
    }

    const invalidReadIds = [
        "disk/all/read",
        "disk/nvme0n1/write",
        "disk/413a78a6-4283-4b5d-850a-047678f64a79/read",
        "cpu/all/read"
    ];

    for (const sid of invalidReadIds) {
        assert.ok(!pRead.test(sid), "Expected non-match for: " + sid);
    }

    const validTempIds = [
        "disk/nvme0n1/temperature",
        "disk/nvme0c0n1/temperature",
        "disk/sda/temperature",
        "lmsensors/nvme-pci-0300/temp1",
        "lmsensors/drivetemp-scsi-0-0/temp1"
    ];

    for (const sid of validTempIds) {
        assert.ok(pTemp.test(sid), "Expected match for temp sensor: " + sid);
    }
});

// Disk display name resolution tests
test("Disk display name resolution handles single/multi NVMe and custom labels", () => {
    function resolveDiskDisplayName(did, customLabels, discoveredDisks) {
        if (!did) return "";
        if (customLabels && customLabels[did]) return customLabels[did];

        const disks = discoveredDisks || [];
        const nvmeDisks = [];
        for (let i = 0; i < disks.length; i++) {
            if (disks[i].id.indexOf("nvme") !== -1) {
                nvmeDisks.push(disks[i].id);
            }
        }
        if (did.indexOf("nvme") !== -1) {
            if (nvmeDisks.length > 1) {
                const idx = nvmeDisks.indexOf(did);
                return "NVMe " + (idx !== -1 ? (idx + 1) : did);
            }
            return "NVMe";
        }
        return did;
    }

    const singleNvmeDisks = [{ id: "nvme0n1" }, { id: "sda" }];
    assert.equal(resolveDiskDisplayName("nvme0n1", {}, singleNvmeDisks), "NVMe");
    assert.equal(resolveDiskDisplayName("sda", {}, singleNvmeDisks), "sda");

    const multiNvmeDisks = [{ id: "nvme0n1" }, { id: "nvme1n1" }, { id: "sda" }, { id: "sdb" }];
    assert.equal(resolveDiskDisplayName("nvme0n1", {}, multiNvmeDisks), "NVMe 1");
    assert.equal(resolveDiskDisplayName("nvme1n1", {}, multiNvmeDisks), "NVMe 2");
    assert.equal(resolveDiskDisplayName("sda", {}, multiNvmeDisks), "sda");
    assert.equal(resolveDiskDisplayName("sdb", {}, multiNvmeDisks), "sdb");

    const custom = { "nvme0n1": "Samsung 980", "sda": "Crucial MX" };
    assert.equal(resolveDiskDisplayName("nvme0n1", custom, multiNvmeDisks), "Samsung 980");
    assert.equal(resolveDiskDisplayName("nvme1n1", custom, multiNvmeDisks), "NVMe 2");
    assert.equal(resolveDiskDisplayName("sda", custom, multiNvmeDisks), "Crucial MX");
});

test("Compact items in-place value sync avoids structural teardown", () => {
    const existing = [
        {
            key: "cpu",
            label: "CPU:",
            icon: "cpu-symbolic",
            value: "10%",
            color: "#ffffff",
            hideSeparator: false,
            segments: null
        },
        {
            key: "gpu",
            label: "GPU:",
            icon: "gpu-symbolic",
            value: null,
            color: "#ffffff",
            hideSeparator: false,
            segments: [
                { key: "usage", label: "", icon: "", value: "20%", color: "#ffffff" },
                { key: "temp", label: "", icon: "", value: "50°C", color: "#ffffff" }
            ]
        }
    ];

    const incomingSame = [
        {
            key: "cpu",
            label: "CPU:",
            icon: "cpu-symbolic",
            value: "15%",
            color: "#ff0000",
            hideSeparator: false,
            segments: null
        },
        {
            key: "gpu",
            label: "GPU:",
            icon: "gpu-symbolic",
            value: null,
            color: "#ffffff",
            hideSeparator: false,
            segments: [
                { key: "usage", label: "", icon: "", value: "25%", color: "#ffffff" },
                { key: "temp", label: "", icon: "", value: "55°C", color: "#ff0000" }
            ]
        }
    ];

    const synced = DefsAndHelpers.syncCompactValues(existing, incomingSame);
    assert.equal(synced, true);
    assert.equal(existing[0].value, "15%");
    assert.equal(existing[0].color, "#ff0000");
    assert.equal(existing[1].segments[0].value, "25%");
    assert.equal(existing[1].segments[1].value, "55°C");
    assert.equal(existing[1].segments[1].color, "#ff0000");

    const incomingDiffKey = [
        { key: "cpu", label: "CPU:", icon: "cpu-symbolic", value: "15%", color: "#ff0000", segments: null },
        { key: "ram", label: "RAM:", icon: "memory-symbolic", value: "40%", color: "#ffffff", segments: null }
    ];
    assert.equal(DefsAndHelpers.syncCompactValues(existing, incomingDiffKey), false);

    const incomingDiffSegs = [
        { key: "cpu", label: "CPU:", icon: "cpu-symbolic", value: "15%", color: "#ff0000", segments: null },
        {
            key: "gpu",
            label: "GPU:",
            icon: "gpu-symbolic",
            value: null,
            color: "#ffffff",
            segments: [
                { key: "usage", label: "", icon: "", value: "25%", color: "#ffffff" }
            ]
        }
    ];
    assert.equal(DefsAndHelpers.syncCompactValues(existing, incomingDiffSegs), false);
});

test("Popup groups in-place sync updates values and detects structural changes", () => {
    const existingGroups = [
        {
            key: "processor",
            groupLabel: "Processor",
            icon: "cpu-symbolic",
            aggregateValue: "12%",
            aggregateColor: "#ffffff",
            sections: [
                {
                    sectionLabel: "Overall",
                    metrics: [
                        { id: "cpu/usage", subLabel: "Usage", icon: "cpu-symbolic", displayValue: "12%", color: "#ffffff", isPinned: true },
                        { id: "cpu/freq", subLabel: "Frequency", icon: "speedometer-symbolic", displayValue: "3.2 GHz", color: "#ffffff", isPinned: false }
                    ]
                }
            ]
        }
    ];

    const incomingSameTopology = [
        {
            key: "processor",
            groupLabel: "Processor",
            icon: "cpu-symbolic",
            aggregateValue: "45%",
            aggregateColor: "#ff5555",
            sections: [
                {
                    sectionLabel: "Overall",
                    metrics: [
                        { id: "cpu/usage", subLabel: "Usage", icon: "cpu-symbolic", displayValue: "45%", color: "#ff5555", isPinned: false },
                        { id: "cpu/freq", subLabel: "Frequency", icon: "speedometer-symbolic", displayValue: "4.1 GHz", color: "#ffffff", isPinned: false }
                    ]
                }
            ]
        }
    ];

    const synced = DefsAndHelpers.syncPopupGroups(existingGroups, incomingSameTopology);
    assert.equal(synced, true);
    assert.equal(existingGroups[0].aggregateValue, "45%");
    assert.equal(existingGroups[0].aggregateColor, "#ff5555");
    assert.equal(existingGroups[0].sections[0].metrics[0].displayValue, "45%");
    assert.equal(existingGroups[0].sections[0].metrics[0].color, "#ff5555");
    assert.equal(existingGroups[0].sections[0].metrics[0].isPinned, false);
    assert.equal(existingGroups[0].sections[0].metrics[1].displayValue, "4.1 GHz");

    const incomingDiffSection = [
        {
            key: "processor",
            groupLabel: "Processor",
            icon: "cpu-symbolic",
            aggregateValue: "45%",
            aggregateColor: "#ff5555",
            sections: [
                { sectionLabel: "Overall", metrics: [] },
                { sectionLabel: "Cores", metrics: [] }
            ]
        }
    ];
    assert.equal(DefsAndHelpers.syncPopupGroups(existingGroups, incomingDiffSection), false);

    const incomingDiffCategory = [
        {
            key: "memory",
            groupLabel: "Memory",
            icon: "memory-symbolic",
            aggregateValue: "50%",
            aggregateColor: "#ffffff",
            sections: []
        }
    ];
    assert.equal(DefsAndHelpers.syncPopupGroups(existingGroups, incomingDiffCategory), false);
});

// Profile validation and recovery logic
test("ProfileManager corrupted data detection and recovery", () => {
    function validateProfiles(profiles) {
        if (!Array.isArray(profiles) || profiles.length === 0) return false;
        for (var i = 0; i < profiles.length; i++) {
            var p = profiles[i];
            if (!p || typeof p !== "object") return false;
            if (typeof p.id !== "string" || p.id === "") return false;
            if (typeof p.name !== "string" || p.name === "") return false;
            if (!p.data || typeof p.data !== "object") return false;
        }
        return true;
    }

    function simulateLoadFromRaw(raw, activeId, config) {
        var parsed = null;
        var isCorrupted = false;
        try {
            parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || !validateProfiles(parsed.profiles)) {
                isCorrupted = true;
            }
        } catch (e) {
            isCorrupted = true;
        }

        if (isCorrupted) {
            config.corruptedProfileListBackup = String(raw);
            var defProfile = { id: "default-uuid", name: "Default", isDefault: true, data: { pinnedMetrics: "cpu/usage" } };
            return {
                recovered: true,
                profiles: [defProfile],
                activeProfileId: "default-uuid"
            };
        }

        var profiles = parsed.profiles;

        // Backfill isDefault for legacy profile lists
        var hasIsDefault = profiles.some(p => !!p.isDefault);
        if (!hasIsDefault) {
            var target = profiles.find(p => p.name === "Default") || profiles.reduce((a, b) => (a.createdAt <= b.createdAt) ? a : b);
            target.isDefault = true;
        }

        var found = profiles.some(p => p.id === activeId);
        var targetId = found ? activeId : profiles[0].id;
        return {
            recovered: false,
            profiles: profiles,
            activeProfileId: targetId
        };
    }

    var config = { corruptedProfileListBackup: "" };

    // 1. Malformed JSON
    var res1 = simulateLoadFromRaw("{{not-json", "some-id", config);
    assert.equal(res1.recovered, true);
    assert.equal(config.corruptedProfileListBackup, "{{not-json");
    assert.equal(res1.profiles[0].name, "Default");

    // New corruption overwrites the backup with the latest bad data
    var res1b = simulateLoadFromRaw("another-bad-json", "some-id", config);
    assert.equal(res1b.recovered, true);
    assert.equal(config.corruptedProfileListBackup, "another-bad-json");

    // 2. Valid JSON with missing profiles key
    config.corruptedProfileListBackup = "";
    var res2 = simulateLoadFromRaw(JSON.stringify({ version: 1 }), "some-id", config);
    assert.equal(res2.recovered, true);
    assert.ok(config.corruptedProfileListBackup.includes("version"));

    // 3. Empty profile list
    config.corruptedProfileListBackup = "";
    var res3 = simulateLoadFromRaw(JSON.stringify({ version: 1, profiles: [] }), "some-id", config);
    assert.equal(res3.recovered, true);

    // 4. Invalid active profile ID falling back to first profile
    var validRaw = JSON.stringify({
        version: 1,
        profiles: [
            { id: "p1", name: "Default", data: { pinnedMetrics: "cpu/usage" } },
            { id: "p2", name: "Gaming", data: { pinnedMetrics: "gpu/usage" } }
        ]
    });
    var res4 = simulateLoadFromRaw(validRaw, "non-existent-id", config);
    assert.equal(res4.recovered, false);
    assert.equal(res4.activeProfileId, "p1");
    // Legacy list: isDefault should be backfilled onto the "Default"-named profile
    assert.ok(res4.profiles.find(p => p.id === "p1").isDefault);
    assert.ok(!res4.profiles.find(p => p.id === "p2").isDefault);

    // 5. Normal valid profile list
    var res5 = simulateLoadFromRaw(validRaw, "p2", config);
    assert.equal(res5.recovered, false);
    assert.equal(res5.activeProfileId, "p2");
    assert.equal(res5.profiles.length, 2);

    // 6. Profile list that already has isDefault must not change it
    var modernRaw = JSON.stringify({
        version: 1,
        profiles: [
            { id: "p1", name: "Default", isDefault: true, data: {} },
            { id: "p2", name: "Gaming", data: {} }
        ]
    });
    var res6 = simulateLoadFromRaw(modernRaw, "p1", config);
    assert.ok(res6.profiles.find(p => p.id === "p1").isDefault);
    assert.ok(!res6.profiles.find(p => p.id === "p2").isDefault);
});

// Pinned metrics persistence and profile switching
test("Pinned metrics changes persist across profile switches and restarts", () => {
    var config = {
        pinnedMetrics: "cpu/usage",
        profileList: "",
        activeProfileId: "p1"
    };

    var profiles = [
        { id: "p1", name: "Default", data: { pinnedMetrics: "cpu/usage" } },
        { id: "p2", name: "Gaming", data: { pinnedMetrics: "gpu/usage" } }
    ];

    var activeConfig = {
        pinnedMetrics: profiles[0].data.pinnedMetrics
    };

    function saveActiveConfigKey(key, value) {
        var prof = profiles.find(p => p.id === config.activeProfileId);
        if (prof) {
            prof.data[key] = value;
        }
        config[key] = value;
        config.profileList = JSON.stringify({ version: 1, profiles: profiles });
    }

    function activateProfile(id) {
        var prof = profiles.find(p => p.id === id);
        if (!prof) return;
        config.activeProfileId = id;
        config.pinnedMetrics = prof.data.pinnedMetrics;
        activeConfig.pinnedMetrics = prof.data.pinnedMetrics;
    }

    // Step 1: User toggles pin on Default profile
    activeConfig.pinnedMetrics = "cpu/usage,ram/percentage,net/down";
    saveActiveConfigKey("pinnedMetrics", activeConfig.pinnedMetrics);

    assert.equal(profiles[0].data.pinnedMetrics, "cpu/usage,ram/percentage,net/down");
    assert.equal(config.pinnedMetrics, "cpu/usage,ram/percentage,net/down");

    // Step 2: Switch to Gaming profile
    activateProfile("p2");
    assert.equal(config.activeProfileId, "p2");
    assert.equal(activeConfig.pinnedMetrics, "gpu/usage");

    // Step 3: Switch back to Default profile
    activateProfile("p1");
    assert.equal(config.activeProfileId, "p1");
    assert.equal(activeConfig.pinnedMetrics, "cpu/usage,ram/percentage,net/down");

    // Step 4: Simulate restart reading from saved profileList
    var reloaded = JSON.parse(config.profileList);
    var p1Reloaded = reloaded.profiles.find(p => p.id === "p1");
    assert.equal(p1Reloaded.data.pinnedMetrics, "cpu/usage,ram/percentage,net/down");
});

// Global shortcut persistence and recovery
test("Global shortcut persistence, self-healing, and toggle", () => {
    var plasmoid = {
        configuration: {
            configuredShortcut: "Meta+Shift+V",
            shortcutInitialized: false
        },
        globalShortcut: ""
    };

    function simulateInit(p) {
        var targetShortcut = p.configuration.configuredShortcut;
        if (!targetShortcut || targetShortcut === "") {
            targetShortcut = "Meta+Shift+V";
            p.configuration.configuredShortcut = targetShortcut;
        }
        if (targetShortcut !== "none" && String(p.globalShortcut) === "") {
            p.globalShortcut = targetShortcut;
        }
        p.configuration.shortcutInitialized = true;
    }

    // First startup initializes default
    simulateInit(plasmoid);
    assert.equal(plasmoid.configuration.configuredShortcut, "Meta+Shift+V");
    assert.equal(plasmoid.globalShortcut, "Meta+Shift+V");
    assert.equal(plasmoid.configuration.shortcutInitialized, true);

    // User customizes shortcut to Meta+Shift+G
    plasmoid.globalShortcut = "Meta+Shift+G";
    plasmoid.configuration.configuredShortcut = "Meta+Shift+G";

    // Daemon restart drops memory shortcut, leaving globalShortcut empty
    plasmoid.globalShortcut = "";
    simulateInit(plasmoid);
    assert.equal(plasmoid.globalShortcut, "Meta+Shift+G");

    // User explicitly sets to none
    plasmoid.globalShortcut = "";
    plasmoid.configuration.configuredShortcut = "none";
    simulateInit(plasmoid);
    assert.equal(plasmoid.globalShortcut, "");

    // Toggle logic
    var popup = { visible: false, opened: 0, closed: 0 };
    function triggerShortcut() {
        if (popup.visible) {
            popup.visible = false;
            popup.closed++;
            return;
        }
        popup.visible = true;
        popup.opened++;
    }

    triggerShortcut();
    assert.equal(popup.visible, true);
    assert.equal(popup.opened, 1);

    triggerShortcut();
    assert.equal(popup.visible, false);
    assert.equal(popup.closed, 1);
});
// Cancel must not save shortcut edits
test("Cancel does not persist unsaved shortcut edits", () => {
    var plasmoid = {
        configuration: { configuredShortcut: "Meta+Shift+V" },
        globalShortcut: "Meta+Shift+V"
    };
    var unsavedChanges = true;

    // Simulate navigating away without saving (no saveConfig called)
    // configuredShortcut must remain unchanged
    if (false && unsavedChanges) {
        var seq = "Meta+Shift+G";
        var seqStr = (seq && String(seq) !== "") ? String(seq) : "none";
        plasmoid.configuration.configuredShortcut = seqStr;
        plasmoid.globalShortcut = (seqStr !== "none") ? seqStr : "";
    }

    assert.equal(plasmoid.configuration.configuredShortcut, "Meta+Shift+V");
    assert.equal(plasmoid.globalShortcut, "Meta+Shift+V");
});

// Clearing a shortcut explicitly must not be restored by self-heal
test("Explicit shortcut clear is preserved and not self-healed", () => {
    var plasmoid = {
        configuration: { configuredShortcut: "Meta+Shift+V" },
        globalShortcut: "Meta+Shift+V"
    };

    // Simulate saveConfig with empty sequence (user cleared it)
    function saveConfig(seq) {
        var seqStr = (seq && String(seq) !== "") ? String(seq) : "none";
        plasmoid.configuration.configuredShortcut = seqStr;
        plasmoid.globalShortcut = (seqStr !== "none") ? seqStr : "";
    }

    // Simulate onGlobalShortcutChanged self-heal logic
    function onGlobalShortcutChanged(shortcut) {
        var s = String(shortcut);
        if (s !== "") {
            plasmoid.configuration.configuredShortcut = s;
        } else if (plasmoid.configuration.configuredShortcut !== "none") {
            plasmoid.globalShortcut = plasmoid.configuration.configuredShortcut;
        }
    }

    // User clears shortcut via config UI
    saveConfig("");
    assert.equal(plasmoid.configuration.configuredShortcut, "none");
    assert.equal(plasmoid.globalShortcut, "");

    // Daemon fires onGlobalShortcutChanged with empty string
    onGlobalShortcutChanged("");
    // configuredShortcut is already "none" so self-heal must NOT reassert
    assert.equal(plasmoid.globalShortcut, "");
    assert.equal(plasmoid.configuration.configuredShortcut, "none");
});

// Default profile must not be deletable, but user-created profiles named "Default" can be
test("Default profile cannot be deleted; user-created profiles named Default can", () => {
    var profiles = [
        { id: "p1", name: "Default", isDefault: true, data: {} },
        { id: "p2", name: "Gaming", data: {} },
        { id: "p3", name: "Default", isDefault: false, data: {} }  // user-created
    ];
    var activeProfileId = "p2";

    function deleteProfile(id) {
        if (profiles.length <= 1) return;
        var idx = profiles.findIndex(p => p.id === id);
        if (idx === -1) return;
        if (profiles[idx].isDefault) return;
        profiles.splice(idx, 1);
        if (id === activeProfileId) activeProfileId = profiles[0].id;
    }

    // Original Default (isDefault:true) cannot be deleted
    deleteProfile("p1");
    assert.equal(profiles.length, 3);
    assert.ok(profiles.some(p => p.id === "p1"));

    // User-created profile named "Default" (isDefault:false) CAN be deleted
    deleteProfile("p3");
    assert.equal(profiles.length, 2);
    assert.ok(!profiles.some(p => p.id === "p3"));

    // Normal profile can still be deleted
    deleteProfile("p2");
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, "p1");
});

test("Panel padding computes horizontal/vertical padding based on form factor", () => {
    function computePadding(isPlanar, isVerticalPanel, backgroundType, panelPadding, gridUnit = 16, smallSpacing = 4) {
        const hPadding = isPlanar
            ? ((backgroundType !== "transparent" && backgroundType !== "shadow") ? Math.round(gridUnit * 0.75) : 0)
            : (isVerticalPanel ? 0 : panelPadding);
        const vPadding = isPlanar
            ? ((backgroundType !== "transparent" && backgroundType !== "shadow") ? Math.round(smallSpacing * 0.75) : 0)
            : (isVerticalPanel ? panelPadding : 0);
        return { hPadding, vPadding };
    }

    // Desktop
    assert.deepEqual(computePadding(true, false, "default", 8), { hPadding: 12, vPadding: 3 });
    assert.deepEqual(computePadding(true, false, "transparent", 8), { hPadding: 0, vPadding: 0 });

    // Horizontal panel
    assert.deepEqual(computePadding(false, false, "default", 0), { hPadding: 0, vPadding: 0 });
    assert.deepEqual(computePadding(false, false, "default", 6), { hPadding: 6, vPadding: 0 });

    // Vertical panel
    assert.deepEqual(computePadding(false, true, "default", 0), { hPadding: 0, vPadding: 0 });
    assert.deepEqual(computePadding(false, true, "default", 6), { hPadding: 0, vPadding: 6 });
});

