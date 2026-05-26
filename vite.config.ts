export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "process.env": {},
      process: { env: {} },
    },
  },
});
