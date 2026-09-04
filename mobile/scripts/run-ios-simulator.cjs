const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const MOBILE_ROOT = path.resolve(__dirname, "..");
const WORKSPACE = path.join(MOBILE_ROOT, "ios", "WasteX.xcworkspace");
const DERIVED_DATA = path.join(MOBILE_ROOT, ".ios-build");
const APP_PATH = path.join(
  DERIVED_DATA,
  "Build",
  "Products",
  "Debug-iphonesimulator",
  "WasteX.app",
);
const BUNDLE_ID = "com.wastex.mobile";
const METRO_URL = "http://127.0.0.1:8081";
const METRO_LOG = path.join(os.tmpdir(), "waste-x-mobile-metro.log");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: MOBILE_ROOT,
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: MOBILE_ROOT,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metroIsReady() {
  return new Promise((resolve) => {
    const request = http.get(`${METRO_URL}/status`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(
          response.statusCode === 200 && body.includes("packager-status:running"),
        );
      });
    });

    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function printMetroLog() {
  console.error(`\nMetro log: ${METRO_LOG}`);
  try {
    const contents = fs.readFileSync(METRO_LOG, "utf8").trim();
    if (!contents) {
      console.error("Metro exited without writing a log.");
      return;
    }
    const lines = contents.split(/\r?\n/);
    console.error("\n--- Metro log (last 80 lines) ---");
    console.error(lines.slice(-80).join("\n"));
    console.error("--- end Metro log ---\n");
  } catch (error) {
    console.error(
      `Could not read Metro log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function ensureMetro() {
  if (await metroIsReady()) {
    console.log(`Waste X Metro is already running on ${METRO_URL}.`);
    return;
  }

  const expoBin = path.join(MOBILE_ROOT, "node_modules", ".bin", "expo");
  if (!fs.existsSync(expoBin)) {
    console.error("Waste X Mobile dependencies are not installed.");
    console.error("Run `npm run mobile:install` from the Waste X repo root.");
    process.exit(1);
  }

  console.log(`Waste X Metro is not running. Starting it automatically on ${METRO_URL}…`);
  fs.writeFileSync(METRO_LOG, "", "utf8");
  const logFd = fs.openSync(METRO_LOG, "a");

  const metro = spawn(
    expoBin,
    ["start", "--dev-client", "--localhost", "--port", "8081"],
    {
      cwd: MOBILE_ROOT,
      env: {
        ...process.env,
        CI: "1",
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );

  fs.closeSync(logFd);
  metro.unref();

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await metroIsReady()) {
      console.log(`Waste X Metro is ready on ${METRO_URL} (pid ${metro.pid}).`);
      return;
    }

    try {
      process.kill(metro.pid, 0);
    } catch {
      console.error("Waste X Metro exited before becoming ready.");
      printMetroLog();
      process.exit(1);
    }

    await sleep(500);
  }

  console.error("Waste X Metro did not become ready within 45 seconds.");
  printMetroLog();
  process.exit(1);
}

function selectSimulator() {
  const raw = capture("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  const parsed = JSON.parse(raw);
  const allDevices = Object.values(parsed.devices ?? {}).flat();
  const iphones = allDevices.filter(
    (device) => typeof device?.name === "string" && device.name.startsWith("iPhone"),
  );

  const booted = iphones.find((device) => device.state === "Booted");
  if (booted) return booted;

  const preferred =
    iphones.find((device) => device.name === "iPhone 16 Pro") ?? iphones[0];

  if (!preferred) {
    console.error("No available iPhone Simulator was found in Xcode.");
    process.exit(1);
  }

  console.log(`Booting ${preferred.name}…`);
  run("xcrun", ["simctl", "boot", preferred.udid], { allowFailure: true });
  run("open", ["-a", "Simulator"]);
  run("xcrun", ["simctl", "bootstatus", preferred.udid, "-b"]);
  return preferred;
}

async function main() {
  if (!fs.existsSync(WORKSPACE)) {
    console.error("Waste X iOS workspace is missing.");
    console.error(
      "Do not clean/rebuild the simulator state. Restore/generate the native workspace only if it is genuinely absent.",
    );
    process.exit(1);
  }

  await ensureMetro();

  const simulator = selectSimulator();
  console.log(`Using ${simulator.name} (${simulator.udid})`);
  console.log("Building Waste X with Xcode…");

  run("xcodebuild", [
    "-workspace",
    WORKSPACE,
    "-scheme",
    "WasteX",
    "-configuration",
    "Debug",
    "-destination",
    `id=${simulator.udid}`,
    "-derivedDataPath",
    DERIVED_DATA,
    "build",
  ]);

  if (!fs.existsSync(APP_PATH)) {
    console.error(`Expected built app was not found at ${APP_PATH}`);
    process.exit(1);
  }

  console.log("Installing Waste X…");
  run("xcrun", ["simctl", "install", simulator.udid, APP_PATH]);

  console.log("Launching Waste X directly…");
  run("xcrun", [
    "simctl",
    "launch",
    "--terminate-running-process",
    simulator.udid,
    BUNDLE_ID,
  ]);

  console.log(`\nWaste X launched successfully. Metro is available on ${METRO_URL}.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printMetroLog();
  process.exit(1);
});
