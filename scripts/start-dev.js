// Cross-platform port fallback for `npm run dev` — bash's ${PORT:-3011}
// doesn't expand on Windows (cmd.exe runs npm scripts there), so it was
// being passed to Next.js literally and crashing the CLI.
const { spawn } = require("child_process");

// shell:true is required on Windows to resolve next.cmd from PATH/node_modules/.bin.
// `port` only ever comes from a trusted env var set by us, never user input.
const port = process.env.PORT || "3011";
const child = spawn("npx", ["next", "dev", "-p", port], {
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
