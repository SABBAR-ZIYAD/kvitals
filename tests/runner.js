import { run } from "node:test";
import { spec } from "node:test/reporters";
import { resolve, dirname } from "node:path";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const unitDir = resolve(__dirname, "unit");
const unitFiles = existsSync(unitDir)
    ? readdirSync(unitDir)
        .filter(f => f.startsWith("test_") && f.endsWith(".js"))
        .sort()
        .map(f => resolve(unitDir, f))
    : [];

const regressionFile = resolve(__dirname, "test_regressions.js");
const files = [];
if (existsSync(regressionFile)) {
    files.push(regressionFile);
}
files.push(...unitFiles);

run({ files })
    .on("test:fail", () => {
        process.exitCode = 1;
    })
    .compose(new spec())
    .pipe(process.stdout);
