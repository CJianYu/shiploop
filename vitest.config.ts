import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration suites spawn Git and npm subprocesses. Running those files concurrently makes
    // timing depend on host load and can produce false timeout failures on contributor machines.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
