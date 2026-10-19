import test from "node:test";
import assert from "node:assert/strict";

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
        const directId = "disk/" + diskId + "/temperature";
        if (discovery && discovery.sensorExists(directId)) return directId;
        if (sysfsMap[diskId]) return sysfsMap[diskId];
        return "";
    }

    return { _findTempSensorForDisk, sysfsMap };
}

test("Disk temperature resolves correctly across NVMe and SATA", () => {
    const sysfs = `
nvme0n1:nvme:/sys/devices/pci0000:00/0000:00:1d.0/0000:01:00.0/nvme/nvme0
sda:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata1/host0/target0:0:0/0:0:0:0
`;
    const sensors = ["lmsensors/nvme-pci-0100/temp1", "lmsensors/drivetemp-scsi-0-0/temp1"];
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfs, sensors);

    assert.equal(_findTempSensorForDisk("nvme0n1"), "lmsensors/nvme-pci-0100/temp1");
    assert.equal(_findTempSensorForDisk("sda"), "lmsensors/drivetemp-scsi-0-0/temp1");
    assert.equal(_findTempSensorForDisk("sdb"), "");
});

test("Direct sensor takes priority over sysfs mapping", () => {
    const sysfs = "sda:drivetemp:/sys/devices/pci0000:00/0000:00:17.0/ata1/host0/target0:0:0/0:0:0:0";
    const sensors = ["lmsensors/drivetemp-scsi-0-0/temp1"];
    const direct = { "disk/sda/temperature": true };
    const { _findTempSensorForDisk } = createDiskSensorResolver(sysfs, sensors, direct);

    assert.equal(_findTempSensorForDisk("sda"), "disk/sda/temperature");
});
