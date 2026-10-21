import { defineConfig } from "@vscode/test-cli";
import { createMochaConfig, defaultCoverageConfig } from "../../scripts/vscode-test-config.mjs";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const mocha = createMochaConfig({
    timeout: 30_000,
});

const configDir = path.dirname(fileURLToPath(import.meta.url));

function findSingleVsix(relativeDirectory, filenamePrefix) {
    const directory = path.resolve(configDir, relativeDirectory);
    if (!fs.existsSync(directory)) {
        return undefined;
    }

    const matches = fs
        .readdirSync(directory)
        .filter((filename) => filename.startsWith(filenamePrefix) && filename.endsWith(".vsix"));

    if (matches.length !== 1) {
        return undefined;
    }

    return path.join(directory, matches[0]);
}

const discoveredPackagedDependencies = [
    findSingleVsix("../mssql", "mssql-"),
    findSingleVsix("../data-workspace", "data-workspace-vscode-"),
];
const requirePackagedDependencies =
    process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
const usePackagedDependencies = discoveredPackagedDependencies.every(
    (dependency) => dependency !== undefined,
);
const packagedDependencies = discoveredPackagedDependencies.filter(
    (dependency) => dependency !== undefined,
);

if (requirePackagedDependencies && !usePackagedDependencies) {
    throw new Error(
        "SQLProj CI requires exactly one same-run MSSQL VSIX and one Data Workspace VSIX.",
    );
}

// TODO: Remove this when https://github.com/microsoft/vscode/issues/236054 is fixed.
// Extension host can fail to start when user data is placed under the macOS temp symlink.
const tmpBaseDir = process.platform === "darwin" ? "/tmp" : os.tmpdir();
const userDataDir = fs.mkdtempSync(path.join(tmpBaseDir, "vsc-sqlproj-"));
process.on("exit", () => fs.rmSync(userDataDir, { recursive: true, force: true }));

if (usePackagedDependencies) {
    // @vscode/test-cli installs pre-launch VSIX files into its normal .vscode-test/extensions
    // directory. Clear that directory before installation so cached Marketplace builds cannot
    // shadow the exact same-run MSSQL and Data Workspace packages.
    fs.rmSync(path.join(configDir, ".vscode-test", "extensions"), {
        recursive: true,
        force: true,
    });
}

export default defineConfig({
    tests: [
        {
            files: "out/test/**/*.test.js",
            version: "insiders",
            launchArgs: ["--disable-gpu", "--user-data-dir", userDataDir],
            // Exercise the same-run API surface whenever packaged dependencies are available.
            installExtensions: usePackagedDependencies ? packagedDependencies : undefined,
            skipExtensionDependencies: usePackagedDependencies,
            env: {
                SQLPROJ_TEST_MODE: "1",
                VSCODE_LOG_LEVEL: "error",
            },
            mocha,
        },
    ],
    coverage: defaultCoverageConfig,
});
