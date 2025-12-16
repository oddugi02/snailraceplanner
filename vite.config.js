import { defineConfig } from 'vite';

export default defineConfig({
    // ✅ GitHub Pages 경로
    base: '/snailraceplanner/',

    // ✅ 로컬 개발 서버 설정 (기존 것 유지)
    server: {
        host: true,
        port: 5173,
        open: true,
        strictPort: true,
    },
});

