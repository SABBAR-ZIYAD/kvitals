const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// KConfigXT schema validation
test("main.xml is well-formed KConfigXT schema with valid types and unique entries", () => {
    const xmlPath = path.resolve(__dirname, "../../contents/config/main.xml");
    assert.ok(fs.existsSync(xmlPath), "main.xml must exist");

    const content = fs.readFileSync(xmlPath, "utf8");

    // Root tag check
    assert.ok(/<kcfg\b/.test(content), "Must have <kcfg> root element");
    assert.ok(/<\/kcfg>/.test(content), "Must close </kcfg>");

    // Extract all entries
    const entryRegex = /<entry\s+name="([^"]+)"\s+type="([^"]+)"\s*>([\s\S]*?)<\/entry>/g;
    const names = new Set();
    const validTypes = new Set(["Bool", "Int", "UInt", "Double", "String", "StringList", "Color", "Font", "Path"]);

    let match;
    let count = 0;

    while ((match = entryRegex.exec(content)) !== null) {
        count++;
        const name = match[1];
        const type = match[2];
        const body = match[3];

        // Unique name
        assert.ok(!names.has(name), `Duplicate entry name found: ${name}`);
        names.add(name);

        // Valid type
        assert.ok(validTypes.has(type), `Invalid type '${type}' for entry '${name}'`);

        // Has default tag
        assert.ok(/<default>[\s\S]*?<\/default>/.test(body), `Entry '${name}' must have a <default> tag`);
    }

    assert.ok(count > 10, `Expected multiple configuration entries, found ${count}`);

    // Critical core settings must exist
    const requiredKeys = [
        "pinnedMetrics",
        "cpuEnabled",
        "ramEnabled",
        "gpuEnabled",
        "netEnabled",
        "diskEnabled",
        "updateInterval",
        "profileList",
        "activeProfileId"
    ];

    for (const key of requiredKeys) {
        assert.ok(names.has(key), `Required configuration key '${key}' missing from main.xml`);
    }
});
