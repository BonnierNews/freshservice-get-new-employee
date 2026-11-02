import { defineConfig } from 'vitest/config';

// The app runs for agents in Sweden; fix the time zone so date tests are stable
process.env.TZ = 'Europe/Stockholm';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['app/scripts/**/*.js'],
      reportsDirectory: 'coverage/unit',
      reporter: ['json', 'text']
    }
  }
});
