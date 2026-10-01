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

const usePackagedDependencies = process.env.GITHUB_ACTIONS === "true";
const packagedDependencies = usePackagedDependencies
    ? [
          findSingleVsix("../mssql", "mssql-"),
          findSingleVsix("../data-workspace", "data-workspace-vscode-"),
      ]
    : [];

if (usePackagedDependencies && packagedDependencies.some((dependency) => !dependency)) {
    throw new Error(
        "SqlProj CI requires exactly one same-run MSSQL VSIX and one Data Workspace VSIX.",
    );
}

// TODO: Workaround for macOS CI EINVAL error — revert once the upstream VS Code issue is fixed.
// A recent VS Code build changed the socket filename format (e.g. "1.12-main.sock"), pushing the
// default .vscode-test/user-data/ path over macOS's hard 103-char Unix socket path limit.
// Tracked in: https://github.com/microsoft/vscode/issues/319752
// Use short, isolated temp directories for both user data and extensions. The extensions directory
// must be isolated in CI so a cached Marketplace dependency cannot shadow a same-run VSIX.
const tmpBaseDir = process.platform === "darwin" ? "/tmp" : os.tmpdir();
const userDataDir = fs.mkdtempSync(path.join(tmpBaseDir, "vsc-sqlproj-"));
const extensionsDir = fs.mkdtempSync(path.join(tmpBaseDir, "vsc-sqlproj-ext-"));
process.on("exit", () => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(extensionsDir, { recursive: true, force: true });
});

export default defineConfig({
    tests: [
        {
            files: "out/test/**/*.test.js",
            version: "insiders",
            launchArgs: [
                "--disable-gpu",
                "--user-data-dir",
                userDataDir,
                "--extensions-dir",
                extensionsDir,
            ],
            // CI must exercise the same-head API surface rather than ambient Marketplace builds.
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
