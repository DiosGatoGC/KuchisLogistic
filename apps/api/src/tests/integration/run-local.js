"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var node_child_process_1 = require("node:child_process");
var node_path_1 = require("node:path");
var projectRoot = (0, node_path_1.resolve)(__dirname, "../../../../..");
var apiRoot = (0, node_path_1.resolve)(projectRoot, "apps/api");
var supabaseCli = (0, node_path_1.resolve)(projectRoot, "node_modules/.bin/supabase");
var suites = {
    e2e: (0, node_path_1.resolve)(__dirname, "e2e.test.ts"),
};
function isLoopback(value) {
    var hostname = new URL(value).hostname.replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function runCli(args, capture) {
    var _a;
    if (capture === void 0) { capture = false; }
    var result = (0, node_child_process_1.spawnSync)(supabaseCli, args, {
        cwd: projectRoot,
        encoding: "utf8",
        env: process.env,
        stdio: capture ? "pipe" : "inherit",
    });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        var detail = capture ? "".concat(result.stderr, "\n").concat(result.stdout).trim() : "";
        throw new Error("Supabase CLI failed (".concat(args.join(" "), ")").concat(detail ? ": ".concat(detail) : ""));
    }
    return (_a = result.stdout) !== null && _a !== void 0 ? _a : "";
}
function localStatus() {
    var _a, _b;
    var raw = runCli(["status", "--output", "json"], true);
    var status;
    try {
        status = JSON.parse(raw);
    }
    catch (_c) {
        throw new Error("Supabase local status did not return valid JSON.");
    }
    var publicKey = (_a = status.PUBLISHABLE_KEY) !== null && _a !== void 0 ? _a : status.ANON_KEY;
    var secretKey = (_b = status.SECRET_KEY) !== null && _b !== void 0 ? _b : status.SERVICE_ROLE_KEY;
    if (!status.API_URL || !status.DB_URL || !publicKey || !secretKey) {
        throw new Error("Supabase local status is missing required API, DB, or key values.");
    }
    if (!isLoopback(status.API_URL) || !isLoopback(status.DB_URL)) {
        throw new Error("Refusing integration tests: Supabase API and DB must both be loopback URLs.");
    }
    if (new URL(status.API_URL).protocol !== "http:") {
        throw new Error("Refusing integration tests: local Supabase API must use explicit HTTP loopback.");
    }
    return {
        API_URL: status.API_URL,
        DB_URL: status.DB_URL,
        PUBLISHABLE_KEY: publicKey,
        ANON_KEY: publicKey,
        SECRET_KEY: secretKey,
        SERVICE_ROLE_KEY: secretKey,
    };
}
function resetLocal() {
    runCli(["db", "reset", "--local", "--yes"]);
}
function requestedSuites() {
    var _a;
    var requested = (_a = process.argv[2]) !== null && _a !== void 0 ? _a : "e2e";
    if (requested === "all")
        return Object.keys(suites);
    if (requested in suites)
        return [requested];
    throw new Error("Unknown local integration suite: ".concat(requested));
}
var status = localStatus();
var childEnv = __assign(__assign({}, process.env), { NODE_ENV: "test", PORT: "3001", CORS_ALLOWED_ORIGINS: "http://127.0.0.1", SUPABASE_URL: status.API_URL, SUPABASE_SECRET_KEY: status.SECRET_KEY, KUCHIS_INTEGRATION_LOCAL: "confirmed", KUCHIS_E2E_SUPABASE_PUBLIC_KEY: status.PUBLISHABLE_KEY, KUCHIS_LOCAL_DB_URL: status.DB_URL, KUCHIS_PROJECT_ROOT: projectRoot });
var exitCode = 0;
try {
    for (var _i = 0, _b = requestedSuites(); _i < _b.length; _i++) {
        var suite = _b[_i];
        console.log("[integration:local] resetting before ".concat(suite));
        resetLocal();
        var result = (0, node_child_process_1.spawnSync)(process.execPath, ["--test", "--test-concurrency=1", "--import", "tsx", suites[suite]], { cwd: apiRoot, env: childEnv, stdio: "inherit" });
        if (result.error)
            throw result.error;
        if (result.status !== 0) {
            exitCode = (_a = result.status) !== null && _a !== void 0 ? _a : 1;
            break;
        }
    }
}
finally {
    console.log("[integration:local] final local reset");
    resetLocal();
}
process.exitCode = exitCode;
