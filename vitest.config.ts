import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The extension resolves pi-coding-agent via createRequire, which bypasses vi.doMock.
    // Tests therefore pin PI_CODING_AGENT_DIR per test to keep cache/auth file I/O inside
    // temp dirs. Forks give every worker its own process environment so that per-test env
    // cannot race with another test file running in parallel.
    pool: "forks",
  },
});
