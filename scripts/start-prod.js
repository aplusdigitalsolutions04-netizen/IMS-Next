// Cross-platform port fallback for `npm start` — see scripts/start-dev.js.
const { spawn, spawnSync } = require("child_process");

// `sharp` (image stamping for daily-task screenshots) ships a native binary per OS. On some servers a plain
// `npm install` leaves it missing or built for the wrong platform, and there's no SSH to fix it by hand —
// so check it on every start and, if it can't load, force-install it before the app comes up.
function ensureSharp() {
  const loads = () => spawnSync(process.execPath, ["-e", "require('sharp')"], { stdio: "ignore" }).status === 0;
  if (loads()) return;
  console.log("[start] 'sharp' could not be loaded — installing it now...");
  for (const args of [
    ["install", "sharp@0.35.0", "--no-save", "--no-audit", "--no-fund"],
    ["install", "sharp@0.35.0", "--no-save", "--no-audit", "--no-fund", "--force"],
  ]) {
    spawnSync("npm", args, { stdio: "inherit", shell: true });
    if (loads()) { console.log("[start] 'sharp' installed."); return; }
  }
  console.error("[start] Could not install 'sharp'. Daily-task screenshots will fail until it is installed.");
}
ensureSharp();

const port = process.env.PORT || "3011";
const child = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
