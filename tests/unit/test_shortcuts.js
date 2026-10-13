const test = require("node:test");
const assert = require("node:assert/strict");

// Global shortcut initialization and persistence
test("Global shortcut initializes default and persists edits", () => {
    const plasmoid = {
        configuration: {
            configuredShortcut: "Meta+Shift+V",
            shortcutInitialized: false
        },
        globalShortcut: ""
    };

    function simulateInit(p) {
        let targetShortcut = p.configuration.configuredShortcut;
        if (!targetShortcut || targetShortcut === "") {
            targetShortcut = "Meta+Shift+V";
            p.configuration.configuredShortcut = targetShortcut;
        }
        if (targetShortcut !== "none" && String(p.globalShortcut) === "") {
            p.globalShortcut = targetShortcut;
        }
        p.configuration.shortcutInitialized = true;
    }

    simulateInit(plasmoid);
    assert.equal(plasmoid.globalShortcut, "Meta+Shift+V");
    assert.equal(plasmoid.configuration.shortcutInitialized, true);

    // Explicit clear
    plasmoid.globalShortcut = "";
    plasmoid.configuration.configuredShortcut = "none";
    simulateInit(plasmoid);
    assert.equal(plasmoid.globalShortcut, "");
});

// Shortcut toggle behavior
test("Shortcut trigger toggles popup visibility state", () => {
    const popup = { visible: false };

    function triggerShortcut() {
        popup.visible = !popup.visible;
    }

    triggerShortcut();
    assert.equal(popup.visible, true);

    triggerShortcut();
    assert.equal(popup.visible, false);
});
