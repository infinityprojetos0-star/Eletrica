/**
 * Divide projeto-eletrico.js em domain (cálculos) + UI (editor canvas).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "../src");
const raw = fs.readFileSync(path.join(src, "projeto-eletrico.js"), "utf8");

const start = raw.match(/(?:var|const)\s+ProjetoEletrico\s*=\s*\(\(\)\s*=>\s*\{/);
if (!start) throw new Error("ProjetoEletrico IIFE not found");
let body = raw.slice(start.index + start[0].length);
body = body.replace(/\}\)\(\);\s*$/, "");

// Remove final return of module
const retIdx = body.search(/\r?\n  return \{\r?\n    TIPOS_PONTO/);
if (retIdx < 0) throw new Error("module return not found");
body = body.slice(0, retIdx);

// Find mount( — everything before is shared; domain gets analysis helpers
const mountIdx = body.indexOf("\n  function mount(");
if (mountIdx < 0) throw new Error("mount not found");

const beforeMount = body.slice(0, mountIdx);
const mountAndAfter = body.slice(mountIdx);

// Domain: keep pure helpers (through montarMateriais), drop draw* canvas fns from domain file
// We'll put ALL beforeMount into a shared module `model.ts`, then domain/analise imports from model
// and editor imports model + domain.

const modelOut = `/**
 * Modelo / helpers do projeto elétrico (sem montar UI).
 */
// @ts-nocheck
import { getPrecoByModo } from "../../data/catalog";
import { NBR5410 } from "../nbr5410";
import { PreProjeto } from "../preprojeto";

${beforeMount}

export {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  AMP_TOMADA,
  createEmpty,
  analisar,
  montarMateriais,
  tipoPonto,
  tipoArch,
  normalizePoint,
  syncComandos,
  syncModulosConfig,
  labelPonto,
  dist,
  buildGraph,
  dijkstra,
  packCircuits,
  drawNbrSymbol,
  SYM_M,
  HOTKEY_DEFS,
  DEFAULT_HOTKEYS,
  HOTKEY_STORAGE,
  GRID_M,
  PPM_DEFAULT,
  PPM_MIN,
  PPM_MAX
};
`;

// Fix: many constants may not all exist - check by grepping. Safer export only what return had + analyzing.

const editorOut = `/**
 * Editor de planta (UI / canvas) — chama domínio para análise.
 */
// @ts-nocheck
import { getPrecoByModo } from "../../data/catalog";
import { NBR5410 } from "../../domain/nbr5410";
import { PreProjeto } from "../../domain/preprojeto";
import * as Model from "../../domain/projeto/model";

const {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  createEmpty,
  analisar,
  montarMateriais,
  tipoPonto,
  normalizePoint
} = Model;

// Re-bind helpers used inside mount from Model / local copies of beforeMount drawing code
${beforeMount}

${mountAndAfter}

export const ProjetoEletrico = {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  createEmpty,
  analisar,
  montarMateriais,
  mount,
  tipoPonto,
  normalizePoint
};

export { createEmpty, analisar, montarMateriais, mount, tipoPonto, normalizePoint };
`;

fs.mkdirSync(path.join(src, "domain/projeto"), { recursive: true });
fs.mkdirSync(path.join(src, "ui/projeto-eletrico"), { recursive: true });

// Domain model: strip canvas drawing functions to keep "pure" — but drawNbrSymbol uses canvas.
// Plan: domain gets analysis-only extract.

const domainOnlyFns = [
  "usoTueById",
  "applyUsoTue",
  "teclasDoInterruptor",
  "syncComandos",
  "syncModulosConfig",
  "conjugadoById",
  "tipoPonto",
  "tipoArch",
  "modulosTomada",
  "varInterruptor",
  "varLampada",
  "clampEscala",
  "normalizePoint",
  "circKindOf",
  "pesoPonto",
  "cargaPonto",
  "simbPonto",
  "labelPonto",
  "applyPointPreset",
  "floatPresetsFor",
  "defaultPoint",
  "createEmpty",
  "dist",
  "projectOnSegGlobal",
  "nivelTomada",
  "polylineLength",
  "buildGraph",
  "dedupePoly",
  "dijkstra",
  "pathEdgesFromPrev",
  "pathPointsFromPrev",
  "packCircuits",
  "analisar",
  "montarMateriais"
];

// For domain file: keep constants + domainOnly functions from beforeMount
// Simplest reliable approach: put analysis-related into circuits.ts by slicing between buildGraph and end of montarMateriais

const buildGraphIdx = beforeMount.indexOf("function buildGraph");
const montarEnd = beforeMount.indexOf("\n  function mount("); // won't exist
// montarMateriais end = start of next function after montarMateriais or end of beforeMount

const analisarIdx = beforeMount.indexOf("function analisar");
const montarIdx = beforeMount.indexOf("function montarMateriais");

// Everything from start through createEmpty / constants for types
const typesAndConsts = beforeMount.slice(0, beforeMount.indexOf("function dist("));
const geometry = beforeMount.slice(
  beforeMount.indexOf("function dist("),
  beforeMount.indexOf("function nivelTomada")
);
// skip drawTriangulo and drawNbrSymbol for domain
const afterDraw = beforeMount.slice(beforeMount.indexOf("function polylineLength"));
// afterDraw includes polylineLength through montarMateriais

const circuitsTs = `/**
 * Grafo, circuitos e análise NBR — domínio puro (sem canvas).
 */
// @ts-nocheck
import { getPrecoByModo } from "../../data/catalog";
import { NBR5410 } from "../nbr5410";
import { PreProjeto } from "../preprojeto";
import {
  normalizePoint,
  circKindOf,
  pesoPonto,
  cargaPonto,
  labelPonto,
  tipoPonto,
  CORES_CIRCUITO
} from "./types";

${geometry}

${afterDraw}

export {
  buildGraph,
  dijkstra,
  pathEdgesFromPrev,
  pathPointsFromPrev,
  packCircuits,
  analisar,
  montarMateriais,
  polylineLength,
  dedupePoly,
  projectOnSegGlobal,
  dist
};
`;

const typesTs = `/**
 * Tipos, pontos e factories do projeto elétrico — domínio puro.
 */
// @ts-nocheck

${typesAndConsts.replace(/function nivelTomada[\\s\\S]*$/, "")}

// circKindOf etc. may be after normalize — ensure they're in typesAndConsts
// If missing, pull from beforeMount

export {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  AMP_TOMADA,
  HOTKEY_DEFS,
  DEFAULT_HOTKEYS,
  HOTKEY_STORAGE,
  GRID_M,
  SNAP_M,
  POINT_LINK_M,
  CONDUIT_JOIN_M,
  WALL_SNAP_M,
  SEG_SNAP_M,
  ROOM_MIN_M,
  DRAG_CLICK_M,
  ERASE_M,
  PPM_DEFAULT,
  PPM_MIN,
  PPM_MAX,
  SYM_M,
  createEmpty,
  normalizePoint,
  tipoPonto,
  tipoArch,
  syncComandos,
  syncModulosConfig,
  circKindOf,
  pesoPonto,
  cargaPonto,
  labelPonto,
  simbPonto,
  defaultPoint,
  clampEscala,
  applyPointPreset,
  floatPresetsFor,
  applyUsoTue,
  usoTueById,
  conjugadoById,
  modulosTomada,
  varInterruptor,
  varLampada,
  teclasDoInterruptor,
  nivelTomada
};
`;

// Fix typesTs - typesAndConsts might cut before circKindOf. Use fuller slice:
const typesSliceEnd = beforeMount.indexOf("function dist(");
const typesBody = beforeMount.slice(0, typesSliceEnd);

fs.writeFileSync(
  path.join(src, "domain/projeto/types.ts"),
  `/**
 * Tipos, pontos e factories do projeto elétrico — domínio puro.
 */
// @ts-nocheck

${typesBody}

export {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  AMP_TOMADA,
  HOTKEY_DEFS,
  DEFAULT_HOTKEYS,
  HOTKEY_STORAGE,
  GRID_M,
  SNAP_M,
  POINT_LINK_M,
  CONDUIT_JOIN_M,
  WALL_SNAP_M,
  SEG_SNAP_M,
  ROOM_MIN_M,
  DRAG_CLICK_M,
  ERASE_M,
  PPM_DEFAULT,
  PPM_MIN,
  PPM_MAX,
  SYM_M,
  createEmpty,
  normalizePoint,
  tipoPonto,
  tipoArch,
  syncComandos,
  syncModulosConfig,
  circKindOf,
  pesoPonto,
  cargaPonto,
  labelPonto,
  simbPonto,
  defaultPoint,
  clampEscala,
  applyPointPreset,
  floatPresetsFor,
  applyUsoTue,
  usoTueById,
  conjugadoById,
  modulosTomada,
  varInterruptor,
  varLampada,
  teclasDoInterruptor,
  nivelTomada
};
`
);
console.log("wrote domain/projeto/types.ts");

const geoStart = beforeMount.indexOf("function dist(");
const drawStart = beforeMount.indexOf("function drawTrianguloTomada");
const polyStart = beforeMount.indexOf("function polylineLength");
const geoBody = beforeMount.slice(geoStart, drawStart);
const analysisBody = beforeMount.slice(polyStart);

fs.writeFileSync(
  path.join(src, "domain/projeto/circuits.ts"),
  `/**
 * Grafo, circuitos e análise NBR — domínio puro (sem canvas).
 */
// @ts-nocheck
import { getPrecoByModo } from "../../data/catalog";
import { NBR5410 } from "../nbr5410";
import { PreProjeto } from "../preprojeto";
import {
  normalizePoint,
  circKindOf,
  pesoPonto,
  cargaPonto,
  labelPonto,
  tipoPonto,
  CORES_CIRCUITO,
  SNAP_M,
  POINT_LINK_M,
  CONDUIT_JOIN_M
} from "./types";

${geoBody}

${analysisBody}

export {
  dist,
  projectOnSegGlobal,
  polylineLength,
  buildGraph,
  dedupePoly,
  dijkstra,
  pathEdgesFromPrev,
  pathPointsFromPrev,
  packCircuits,
  analisar,
  montarMateriais
};
`
);
console.log("wrote domain/projeto/circuits.ts");

fs.writeFileSync(
  path.join(src, "domain/projeto/index.ts"),
  `export * from "./types";
export * from "./circuits";
`
);

// Editor: full body as module using domain analisar when possible
// To avoid double-definition, editor keeps drawing + mount, imports domain for analysis

const drawAndUiHelpers = beforeMount.slice(drawStart, polyStart);
// Editor needs ALL helpers for mount — import domain pieces and keep local draw + re-export mount

fs.writeFileSync(
  path.join(src, "ui/projeto-eletrico/editor.ts"),
  `/**
 * Editor de planta (UI / canvas).
 * Cálculos/regras: domain/projeto.
 */
// @ts-nocheck
import { getPrecoByModo } from "../../data/catalog";
import {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  AMP_TOMADA,
  HOTKEY_DEFS,
  DEFAULT_HOTKEYS,
  HOTKEY_STORAGE,
  GRID_M,
  SNAP_M,
  POINT_LINK_M,
  CONDUIT_JOIN_M,
  WALL_SNAP_M,
  SEG_SNAP_M,
  ROOM_MIN_M,
  DRAG_CLICK_M,
  ERASE_M,
  PPM_DEFAULT,
  PPM_MIN,
  PPM_MAX,
  SYM_M,
  createEmpty,
  normalizePoint,
  tipoPonto,
  tipoArch,
  syncComandos,
  syncModulosConfig,
  circKindOf,
  pesoPonto,
  cargaPonto,
  labelPonto,
  simbPonto,
  defaultPoint,
  clampEscala,
  applyPointPreset,
  floatPresetsFor,
  applyUsoTue,
  usoTueById,
  conjugadoById,
  modulosTomada,
  varInterruptor,
  varLampada,
  teclasDoInterruptor,
  nivelTomada,
  dist,
  projectOnSegGlobal,
  polylineLength,
  buildGraph,
  dedupePoly,
  dijkstra,
  pathEdgesFromPrev,
  pathPointsFromPrev,
  packCircuits,
  analisar,
  montarMateriais
} from "../../domain/projeto";

${drawAndUiHelpers}

${mountAndAfter}

export const ProjetoEletrico = {
  TIPOS_PONTO,
  TIPOS_ARCH,
  MODULOS_TOMADA,
  VAR_INTERRUPTOR,
  VAR_LAMPADA,
  PRESETS_CONJUGADO,
  USOS_TUE,
  CORES_CIRCUITO,
  createEmpty,
  analisar,
  montarMateriais,
  mount,
  tipoPonto,
  normalizePoint
};

export { createEmpty, analisar, montarMateriais, mount, tipoPonto, normalizePoint };
`
);

console.log("wrote ui/projeto-eletrico/editor.ts");
console.log("split done");
