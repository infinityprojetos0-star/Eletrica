/**
 * Converte módulos JS IIFE → ES modules .ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function read(rel) {
  return fs.readFileSync(path.join(src, rel), "utf8");
}

function write(rel, content) {
  const full = path.join(src, rel);
  ensure(path.dirname(full));
  fs.writeFileSync(full, content, "utf8");
  console.log("wrote", rel, "(" + Math.round(content.length / 1024) + " KB)");
}

function unwrapIIFE(content, varName) {
  const startRe = new RegExp(
    `(?:var|const)\\s+${varName}\\s*=\\s*\\(\\(\\)\\s*=>\\s*\\{`
  );
  const m = content.match(startRe);
  if (!m) throw new Error(`IIFE start not found: ${varName}`);
  let body = content.slice(m.index + m[0].length);
  body = body.replace(/\}\)\(\);\s*$/, "");
  return body;
}

function splitReturn(body) {
  const marker = "\n  return {";
  const idx = body.lastIndexOf(marker);
  if (idx < 0) throw new Error("return { not found");
  return { code: body.slice(0, idx), retBlock: body.slice(idx) };
}

function keysFromReturn(retBlock) {
  const inner = retBlock.replace(/^\s*return\s*\{/, "").replace(/\};\s*$/, "");
  return [
    ...new Set(
      inner
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.split(":")[0].trim())
        .filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    )
  ];
}

function exportTopLevel(js) {
  return js
    .replace(/^(const|let|var|function|async function|class)\s/gm, "export $1 ")
    .replace(/^export var /gm, "export const ")
    .replace(/export export /g, "export ");
}

[
  "domain/projeto",
  "data",
  "store",
  "ui/projeto-eletrico",
  "pdf",
  "styles",
  "pwa"
].forEach((d) => ensure(path.join(src, d)));

write(
  "version.ts",
  `/** Fonte única da versão do VoltES. */
export const APP_VERSION = "2.0.0";
export const CACHE_VERSION = "voltes-v50";
export const APP_BUILD_LABEL = "v" + APP_VERSION;
`
);

{
  let data = exportTopLevel(read("data.js"));
  write("data/catalog.ts", `/** Catálogo e helpers (domínio/dados). */\n${data}\n`);
}

{
  const body = unwrapIIFE(read("nbr5410.js"), "NBR5410");
  const { code, retBlock } = splitReturn(body);
  const keys = keysFromReturn(retBlock);
  write(
    "domain/nbr5410.ts",
    `/** Dimensionamento NBR 5410 — domínio puro. */
import { getPrecoByModo } from "../data/catalog";

${code}

export { ${keys.join(", ")} };
export const NBR5410 = { ${keys.join(", ")} };
`
  );
}

{
  const body = unwrapIIFE(read("preprojeto.js"), "PreProjeto");
  const { code, retBlock } = splitReturn(body);
  const keys = keysFromReturn(retBlock);
  write(
    "domain/preprojeto.ts",
    `/** Pré-projeto por ambientes — domínio puro. */
import { getPrecoByModo, uid } from "../data/catalog";

${code}

export { ${keys.join(", ")} };
export const PreProjeto = { ${keys.join(", ")} };
`
  );
}

{
  const body = unwrapIIFE(read("cache.js"), "DataCache");
  const { code, retBlock } = splitReturn(body);
  const keys = keysFromReturn(retBlock);
  write(
    "store/cache.ts",
    `/** Cache local VoltES. */\n// @ts-nocheck\n${code}\n\nexport { ${keys.join(", ")} };\nexport const DataCache = { ${keys.join(", ")} };\n`
  );
}

write(
  "store/firebase.ts",
  `/** Firebase Realtime Database (compat API — mesma superfície do app legado). */
import firebase from "firebase/compat/app";
import "firebase/compat/database";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDzi2PKBnGiiHmoL32_lw8HCgS5WcUc5GI",
  authDomain: "eletrica-86ed1.firebaseapp.com",
  databaseURL: "https://eletrica-86ed1-default-rtdb.firebaseio.com",
  projectId: "eletrica-86ed1",
  storageBucket: "eletrica-86ed1.firebasestorage.app",
  messagingSenderId: "619376902152",
  appId: "1:619376902152:web:37ab1ef9a53e0d6d8511bd",
  measurementId: "G-WG09GHN1JP"
};

let db: firebase.database.Database | null = null;
let ready = false;
let error: string | null = null;
let visibilityBound = false;

export function init() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    ready = true;
    bindVisibility();
    return db;
  } catch (err: any) {
    error = err?.message || String(err);
    console.error("Firebase init:", err);
    return null;
  }
}

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    const database = getDb();
    if (!database) return;
    if (document.hidden) database.goOffline();
    else database.goOnline();
  });
}

export function getDb() {
  return db || init();
}

export function isReady() {
  return ready && !!getDb();
}

export function getError() {
  return error;
}

export const ROOT = "voltes";

export function ref(path: string) {
  const database = getDb();
  if (!database) return null;
  return database.ref(path);
}

export const FirebaseApp = { init, getDb, isReady, getError, ref, ROOT };
`
);

{
  const body = unwrapIIFE(read("store.js"), "Store");
  const { code, retBlock } = splitReturn(body);
  const keys = keysFromReturn(retBlock);
  write(
    "store/store.ts",
    `/** Store VoltES — cache + sync. */
// @ts-nocheck
import {
  SEED_EMPRESA,
  SEED_SERVICOS,
  SEED_PRODUTOS,
  SEED_DESPESAS_SERVICO,
  SEED_DESPESAS_GLOBAIS,
  SEED_EMISSORES_NF,
  todayISO,
  uid
} from "../data/catalog";
import { DataCache } from "./cache";
import { FirebaseApp } from "./firebase";

${code}

export { ${keys.join(", ")} };
export const Store = { ${keys.join(", ")} };
`
  );
}

{
  let assets = exportTopLevel(read("pdf-assets.js"));
  write("pdf/pdf-assets.ts", `// @ts-nocheck\n${assets}\n`);
}

{
  const body = unwrapIIFE(read("pdf.js"), "PDF");
  const { code, retBlock } = splitReturn(body);
  const keys = keysFromReturn(retBlock);
  let code2 = code
    .replace(
      /function ensureJsPdf\(\)[\s\S]*?return window\.jspdf\.jsPDF;\s*\}/,
      "function ensureJsPdf() { return jsPDF; }"
    )
    .replace(
      /function ensureHtml2Canvas\(\)[\s\S]*?return h2c;\s*\}/,
      "function ensureHtml2Canvas() { return html2canvas; }"
    );
  write(
    "pdf/pdf.ts",
    `/** Geração de PDF VoltES. */
// @ts-nocheck
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import html2canvas from "html2canvas";
import {
  PDF_FONT_REGULAR,
  PDF_FONT_BOLD,
  PDF_LOGO_ORC,
  PDF_LOGO_DARK,
  PDF_ICON_CLIENTE,
  PDF_ICON_SERVICOS,
  PDF_ICON_MATERIAIS,
  PDF_ICON_PAGAMENTO,
  PDF_ICON_OBS,
  PDF_ICON_GARANTIA,
  PDF_ICON_PHONE,
  PDF_ICON_SLOGAN_BOLT,
  PDF_FOOTER_BOLT,
  PDF_FOOTER_GEAR,
  PDF_FOOTER_DOC,
  PDF_FOOTER_NBR,
  PDF_FOOTER_CHECK
} from "./pdf-assets";
import {
  money,
  formatDate,
  getPrecoByModo,
  orcamentoTotalComNf,
  orcamentoBase,
  orcamentoNfPercent,
  orcamentoNfValor,
  getEmissorNf
} from "../data/catalog";

${code2}

export { ${keys.join(", ")} };
export const PDF = { ${keys.join(", ")} };
`
  );
}

// app.js — IIFE anônima → initApp
{
  let app = read("app.js").trim();
  if (app.startsWith("(() => {") || app.startsWith("(function () {")) {
    app = app.replace(/^\(\(\)\s*=>\s*\{/, "").replace(/\}\)\(\);\s*$/, "");
  }
  write(
    "ui/app.ts",
    `/** Shell da aplicação VoltES. */
// @ts-nocheck
import Chart from "chart.js/auto";
import { Store } from "../store/store";
import { PDF } from "../pdf/pdf";
import { NBR5410 } from "../domain/nbr5410";
import { PreProjeto } from "../domain/preprojeto";
import { ProjetoEletrico } from "./projeto-eletrico/editor";
import {
  money,
  formatDate,
  todayISO,
  uid,
  getPrecoByModo,
  precoModoLabel,
  PRECO_MODOS,
  VIEW_META,
  getEmissoresNf,
  getEmissorNf,
  orcamentoBase,
  orcamentoNfPercent,
  orcamentoNfValor,
  orcamentoTotalComNf,
  despesasDoServico,
  despesasGlobaisAtivas,
  custoOcultoServico,
  precoClienteServico,
  faixaPreco
} from "../data/catalog";
import { APP_VERSION, APP_BUILD_LABEL, CACHE_VERSION } from "../version";
import { getTheme, setTheme, cycleTheme } from "./themes";

// Chart global para código legado
(window as any).Chart = Chart;

export function initApp() {
${app}
}
`
  );
}

console.log("OK — next: projeto-eletrico split");
