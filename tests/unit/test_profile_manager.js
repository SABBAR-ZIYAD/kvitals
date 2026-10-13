const test = require("node:test");
const assert = require("node:assert/strict");

function validateProfiles(profiles) {
    if (!Array.isArray(profiles) || profiles.length === 0) return false;
    for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        if (!p || typeof p !== "object") return false;
        if (typeof p.id !== "string" || p.id === "") return false;
        if (typeof p.name !== "string" || p.name === "") return false;
        if (!p.data || typeof p.data !== "object") return false;
    }
    return true;
}

function simulateLoadFromRaw(raw, activeId, config) {
    let parsed = null;
    let isCorrupted = false;
    try {
        parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !validateProfiles(parsed.profiles)) {
            isCorrupted = true;
        }
    } catch {
        isCorrupted = true;
    }

    if (isCorrupted) {
        config.corruptedProfileListBackup = String(raw);
        const defProfile = { id: "default-uuid", name: "Default", isDefault: true, data: { pinnedMetrics: "cpu/usage" } };
        return {
            recovered: true,
            profiles: [defProfile],
            activeProfileId: "default-uuid"
        };
    }

    const profiles = parsed.profiles;
    const hasIsDefault = profiles.some(p => Boolean(p.isDefault));
    if (!hasIsDefault) {
        const target = profiles.find(p => p.name === "Default") || profiles[0];
        target.isDefault = true;
    }

    const found = profiles.some(p => p.id === activeId);
    const targetId = found ? activeId : profiles[0].id;
    return {
        recovered: false,
        profiles,
        activeProfileId: targetId
    };
}

// Profile corruption recovery
test("ProfileManager recovers gracefully from corrupted JSON", () => {
    const config = { corruptedProfileListBackup: "" };
    const res = simulateLoadFromRaw("invalid{json", "some-id", config);

    assert.equal(res.recovered, true);
    assert.equal(res.profiles.length, 1);
    assert.equal(res.profiles[0].isDefault, true);
    assert.equal(config.corruptedProfileListBackup, "invalid{json");
});

// Default profile deletion rules
test("Default profile cannot be deleted but duplicate-named custom profile can", () => {
    const profiles = [
        { id: "p1", name: "Default", isDefault: true, data: {} },
        { id: "p2", name: "Default", isDefault: false, data: {} }
    ];

    function deleteProfile(id) {
        if (profiles.length <= 1) return;
        const idx = profiles.findIndex(p => p.id === id);
        if (idx === -1 || profiles[idx].isDefault) return;
        profiles.splice(idx, 1);
    }

    deleteProfile("p1");
    assert.equal(profiles.length, 2);

    deleteProfile("p2");
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, "p1");
});
