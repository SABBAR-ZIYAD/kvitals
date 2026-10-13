#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WIDGET_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMEOUT=10
LOG=$(mktemp)
XVFB_PID=""

cleanup() {
    if [ -n "$XVFB_PID" ]; then
        kill "$XVFB_PID" 2>/dev/null || true
    fi
    rm -f "$LOG"
}
trap cleanup EXIT

# Headless display setup
USE_XVFB_RUN=0
if [ -z "${DISPLAY:-}" ]; then
    if command -v Xvfb >/dev/null 2>&1; then
        Xvfb :99 -screen 0 1280x800x24 &
        XVFB_PID=$!
        export DISPLAY=:99
        sleep 1
    elif command -v xvfb-run >/dev/null 2>&1; then
        USE_XVFB_RUN=1
    else
        echo "Error: DISPLAY is not set and neither Xvfb nor xvfb-run is available." >&2
        exit 1
    fi
fi

echo "Running plasmoidviewer smoke test on $WIDGET_PATH (timeout: ${TIMEOUT}s)..."

RUN_CMD=(plasmoidviewer -a "$WIDGET_PATH")
if [ "$USE_XVFB_RUN" -eq 1 ]; then
    RUN_CMD=(xvfb-run -a plasmoidviewer -a "$WIDGET_PATH")
fi

set +e
timeout "$TIMEOUT" "${RUN_CMD[@]}" >"$LOG" 2>&1
EXIT_CODE=$?
set -e

# Exit code 124 is expected from timeout command
if [ "$EXIT_CODE" -ne 0 ] && [ "$EXIT_CODE" -ne 124 ]; then
    echo "SMOKE TEST FAILED: plasmoidviewer exited with code $EXIT_CODE"
    cat "$LOG"
    exit 1
fi

# Check for fatal applet loading errors
if grep -qiE "error when loading applet|Error loading Applet|package .* does not exist|Could not find requested component|Segmentation fault|SIGSEGV|Aborted" "$LOG"; then
    echo "SMOKE TEST FAILED: Fatal applet loading errors detected:"
    cat "$LOG"
    exit 1
fi

# Check for widget-specific runtime exceptions
if grep -E "${WIDGET_PATH}/.*(SyntaxError|TypeError|ReferenceError)" "$LOG"; then
    echo "SMOKE TEST FAILED: QML runtime error in widget files detected:"
    cat "$LOG"
    exit 1
fi

echo "Smoke test passed: widget loaded cleanly with plasmoidviewer."
