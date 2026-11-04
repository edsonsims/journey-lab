import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'/workspace-assets/',server:{proxy:{'/api':'http://127.0.0.1:4319','/runs':'http://127.0.0.1:4319','/improvements':'http://127.0.0.1:4319'}}});
