import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dts from "vite-plugin-dts";
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), dts({ include: ["src"] })],
    build: {
        sourcemap: true,
        lib: {
            entry: resolve(__dirname, "src/main.ts"),
            formats: ["es"],
            fileName: "main",
        },
        rollupOptions: {
            external: ["react", "react/jsx-runtime"],
        },
    },
});
