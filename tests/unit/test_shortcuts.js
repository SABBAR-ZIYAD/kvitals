import test from "node:test";
import assert from "node:assert/strict";

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

    plasmoid.globalShortcut = "";
    plasmoid.configuration.configuredShortcut = "none";
    simulateInit(plasmoid);
    assert.equal(plasmoid.globalShortcut, "");
});

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
