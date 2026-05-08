import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        setupFiles: [],
        include: ["test/**/*.test.js"],
        exclude: ["**/node_modules/**"],
        reporters: ["default"],
        coverage: {
            exclude: ["stoat-compat/**", "src/vm/vm2/**", "src/vm/judge0/**"]
        }
    }
});
