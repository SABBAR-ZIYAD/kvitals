const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadQmlLibrary(relPath) {
    const fullPath = path.resolve(__dirname, "..", relPath);
    let code = fs.readFileSync(fullPath, "utf8");
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
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

module.exports = {
    loadQmlLibrary
};
