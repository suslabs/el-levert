import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        setupFiles: [],
        include: ["test/**/*.test.js"],
        exclude: ["**/node_modules/**"],
        reporters: ["default"]
    }
});
