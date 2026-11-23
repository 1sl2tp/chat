import {defineConfig, devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';

// An isolated local-only preview: never use a production origin or login.
const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
export default defineConfig({
 testDir:'./tests',
 timeout:25_000,
 expect:{timeout:6_000},
 fullyParallel:false,
 workers:1,
 retries:0,
 reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]],
 outputDir:'test-results',
 use:{
   baseURL:'http://127.0.0.1:8765',
   serviceWorkers:'block',
   trace:'retain-on-failure',
   screenshot:'only-on-failure'
 },
 projects:[
  {name:'chromium-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:800}}},
  {name:'chromium-mobile',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
 ],
 webServer:{
  command:'python3 -m http.server 8765 --bind 127.0.0.1',
  cwd:repositoryRoot,
  url:'http://127.0.0.1:8765/',
  reuseExistingServer:!process.env.CI,
  timeout:15_000
 }
});
