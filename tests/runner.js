const { run } = require("node:test");
const { spec } = require("node:test/reporters");
const path = require("node:path");
const fs = require("node:fs");

const unitDir = path.resolve(__dirname, "unit");
const unitFiles = fs.existsSync(unitDir)
    ? fs.readdirSync(unitDir)
        .filter(f => f.startsWith("test_") && f.endsWith(".js"))
        .sort()
        .map(f => path.join(unitDir, f))
    : [];

const regressionFile = path.resolve(__dirname, "test_regressions.js");
const files = [];
if (fs.existsSync(regressionFile)) {
    files.push(regressionFile);
}
files.push(...unitFiles);

run({ files })
    .on("test:fail", () => {
        process.exitCode = 1;
    })
    .compose(new spec())
    .pipe(process.stdout);
