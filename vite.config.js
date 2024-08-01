import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        instructor: resolve(__dirname, "pages/instructor.html"),
        studentNotes: resolve(__dirname, "pages/student-notes.html"),
        studentTypealong: resolve(__dirname, "pages/student-typealong.html"),
        listSessions: resolve(__dirname, "pages/analysis/sessions.html"),
        sessionDeets: resolve(__dirname, "pages/analysis/session.html"),
        reviewTypealong: resolve(__dirname, "pages/review-typealong.html"),
        reviewNotes: resolve(__dirname, "pages/review-notes.html"),
      },
    },
  },
});
