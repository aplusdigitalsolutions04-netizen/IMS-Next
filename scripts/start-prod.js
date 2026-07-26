// Cross-platform port fallback for `npm start` — see scripts/start-dev.js.
const { spawn } = require("child_process");

const port = process.env.PORT || "3011";
const child = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
