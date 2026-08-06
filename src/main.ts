import "./styles/index.css";
import { initTheme } from "./ui/themes";
import { initApp } from "./ui/app";
import { registerPwa } from "./pwa/register";
import { APP_VERSION } from "./version";

initTheme();
registerPwa();
initApp();

console.info(`VoltES ${APP_VERSION}`);
