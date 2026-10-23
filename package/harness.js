// GuardianLink surface harness launcher.
// The harness itself is prebuilt into harness.cjs (a single
// self-contained bundle of the real pipeline + SurfaceApp) so it runs
// with plain Node — no node_modules, no build step at runtime.
require("./harness.cjs");
