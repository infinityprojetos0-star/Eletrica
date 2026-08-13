/**
 * Relatório de análise: proteção (DR/IDR + DPS), Wago, balanceamento e materiais por circuito.
 */
// @ts-nocheck
import { getPrecoByModo } from "../../data/catalog";
import {
  normalizePoint,
  labelPonto,
  modulosTomada,
  varInterruptor,
  varLampada
} from "./types";

const DR_INS = [25, 40, 63, 80, 100];
const DJ_GERAL = [40, 50, 63, 70, 80, 100, 125, 150, 175, 200];
const TENSOES_PONTO = [127, 220, 360];

function resolveSistema(projeto) {
  const s = String(projeto?.sistema || "").toLowerCase();
  if (s === "mono" || s === "monofasico" || s === "1") return "mono";
  if (s === "tri" || s === "trifasico" || s === "3") return "tri";
  return "bi"; // padrão ES 127/220
}

function labelSistema(sistema) {
  if (sistema === "mono") return "Monofásico";
  if (sistema === "tri") return "Trifásico";
  return "Bifásico";
}

function nFasesOf(sistema) {
  if (sistema === "tri") return 3;
  if (sistema === "mono") return 1;
  return 2;
}

/** Normaliza tensão do ponto: 127 | 220 | 360 */
function normalizeTensaoPonto(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 127;
  if (n >= 300) return 360;
  if (n >= 200) return 220;
  return 127;
}

/**
 * Pólos do disjuntor conforme sistema + tensão do ponto/circuito.
 * Monofásico: sempre 1P (mesmo em 220 V).
 * Bifásico/trifásico: 127→1P, 220→2P, 360→3P (só tri).
 */
function resolvePolos(sistema, tensaoV) {
  if (sistema === "mono") return 1;
  const V = normalizeTensaoPonto(tensaoV);
  if (V >= 360) return sistema === "tri" ? 3 : 2;
  if (V >= 220) return 2;
  return 1;
}

/** Condutores no cabo (aprox.): 1P F+N+PE · 2P F1+F2+PE · 3P 3F+N+PE */
function nCondutoresOf(polos) {
  const p = Number(polos) || 1;
  if (p >= 3) return 5;
  if (p >= 2) return 3;
  return 3;
}

function labelPolosDj(polos) {
  const p = Number(polos) || 1;
  if (p >= 3) return "tripolar";
  if (p >= 2) return "bipolar";
  return "monopolar";
}

function wagoPolosPorDirecoes(nDirecoes) {
  const d = Math.max(2, Number(nDirecoes) || 2);
  if (d <= 2) return 2;
  if (d === 3) return 3;
  if (d <= 5) return 5;
  return 10;
}

/** Escolhe o menor In ≥ ib na tabela. */
function pickIn(tabela, ib) {
  const need = Math.max(0, Number(ib) || 0);
  return tabela.find((x) => x >= need) || tabela[tabela.length - 1];
}

/**
 * Distribui circuitos nas fases (greedy pelo menos carregado).
 * Bifásico 220 V: corrente em L1 e L2.
 * Trifásico 220 V (2 pólos): escolhe o par de fases menos carregado.
 */
function balancearCargas(circuits, sistema) {
  const nFases = nFasesOf(sistema);
  const fases = Array.from({ length: nFases }, (_, i) => ({
    id: `L${i + 1}`,
    label: `Fase L${i + 1}`,
    correnteA: 0,
    potenciaW: 0,
    circuitos: []
  }));

  const sorted = [...(circuits || [])].sort(
    (a, b) => (Number(b.ib) || 0) - (Number(a.ib) || 0)
  );

  const pushCirc = (fi, circ, ibShare, potShare) => {
    fases[fi].correnteA += ibShare;
    fases[fi].potenciaW += potShare;
    if (!fases[fi].circuitos.includes(circ.id)) fases[fi].circuitos.push(circ.id);
  };

  sorted.forEach((circ) => {
    const ib = Number(circ.ib) || 0;
    const pot = Number(circ.potenciaVA) || 0;
    const polos = Number(circ.polos) || 1;

    if (nFases === 1 || polos <= 1) {
      let best = 0;
      for (let i = 1; i < nFases; i++) {
        if (fases[i].correnteA < fases[best].correnteA) best = i;
      }
      pushCirc(best, circ, ib, pot);
      circ.fase = fases[best].id;
      circ.fasesUsadas = [fases[best].id];
      return;
    }

    if (nFases === 2) {
      pushCirc(0, circ, ib, pot / 2);
      pushCirc(1, circ, ib, pot / 2);
      circ.fase = "L1-L2";
      circ.fasesUsadas = ["L1", "L2"];
      return;
    }

    // trifásico — carga bipolar: par de fases
    if (polos === 2) {
      const pairs = [
        [0, 1],
        [1, 2],
        [0, 2]
      ];
      let bestPair = pairs[0];
      let bestScore = Infinity;
      pairs.forEach(([a, b]) => {
        const score = Math.max(fases[a].correnteA + ib, fases[b].correnteA + ib);
        if (score < bestScore) {
          bestScore = score;
          bestPair = [a, b];
        }
      });
      const [a, b] = bestPair;
      pushCirc(a, circ, ib, pot / 2);
      pushCirc(b, circ, ib, pot / 2);
      circ.fase = `${fases[a].id}-${fases[b].id}`;
      circ.fasesUsadas = [fases[a].id, fases[b].id];
      return;
    }

    // carga trifásica (3 pólos)
    for (let i = 0; i < 3; i++) pushCirc(i, circ, ib, pot / 3);
    circ.fase = "L1-L2-L3";
    circ.fasesUsadas = ["L1", "L2", "L3"];
  });

  const currents = fases.map((f) => f.correnteA);
  const imax = Math.max(0, ...currents);
  const imin = currents.length ? Math.min(...currents) : 0;
  const imed = currents.length ? currents.reduce((s, x) => s + x, 0) / currents.length : 0;
  const desequilibrioPct = imed > 1e-6 ? ((imax - imin) / imed) * 100 : 0;
  const avisos = [];
  if (nFases > 1 && desequilibrioPct > 20) {
    avisos.push(
      `Desequilíbrio entre fases ≈ ${desequilibrioPct.toFixed(1)}% — redistribua circuitos manuais se possível.`
    );
  }

  return {
    sistema,
    label: labelSistema(sistema),
    nFases,
    fases: fases.map((f) => ({
      ...f,
      correnteA: Math.round(f.correnteA * 100) / 100,
      potenciaW: Math.round(f.potenciaW)
    })),
    correnteMaxA: Math.round(imax * 100) / 100,
    correnteMinA: Math.round(imin * 100) / 100,
    desequilibrioPct: Math.round(desequilibrioPct * 10) / 10,
    ok: desequilibrioPct <= 20 || nFases === 1,
    avisos
  };
}

/**
 * IDR: um por quadro (QDC), não por circuito.
 * Dimensiona In pelo DJ geral / fase mais carregada.
 */
function dimensionarProtecao(circuits, sistema, balanceamento) {
  const nFases = nFasesOf(sistema);
  const precisaIdr =
    (circuits || []).some((c) => c.dr) ||
    (circuits || []).some((c) => ["tug", "tue", "chuveiro"].includes(c.tipoId));

  const ibGeral = Number(balanceamento?.correnteMaxA) || 0;
  const InGeral = pickIn(DJ_GERAL, ibGeral * 1.1);
  const polosGeral = nFases === 3 ? 3 : nFases === 2 ? 2 : 1;

  // IDR: mono/bi → 2P (fases+N); tri → 4P
  const polosIdr = nFases >= 3 ? 4 : 2;
  const InIdr = pickIn(DR_INS, InGeral);
  const idr = precisaIdr
    ? {
        circuitoId: null,
        quadro: "QDC",
        tipo: "IDR",
        nome: `IDR ${polosIdr}P ${InIdr}A 30mA`,
        In: InIdr,
        IDeltaN: 30,
        polos: polosIdr,
        qtd: 1,
        nota: `Um por quadro (QDC) · sistema ${labelSistema(sistema).toLowerCase()} · NBR 5410`
      }
    : null;

  (circuits || []).forEach((circ) => {
    circ.protecao = {
      ...(circ.protecao || {}),
      dr: circ.dr && idr ? { ...idr, compartilhado: true } : null
    };
  });

  const dpsModulos = Math.max(1, nFases);
  const dps = {
    tipo: "DPS",
    classe: "II",
    modulos: dpsModulos,
    polosLabel: nFases === 3 ? "3P+N" : nFases === 2 ? "2P+N" : "1P+N",
    nome: `DPS classe II (${dpsModulos} módulo${dpsModulos > 1 ? "s" : ""} · ${
      nFases === 3 ? "3P+N" : nFases === 2 ? "2P+N" : "1P+N"
    })`,
    nota: `No QDC · sistema ${labelSistema(sistema).toLowerCase()}`
  };

  const disjuntorGeral = {
    tipo: "DJ_GERAL",
    nome: `Disjuntor geral ${labelPolosDj(polosGeral)} ${InGeral}A`,
    In: InGeral,
    polos: polosGeral,
    ibRefA: Math.round(ibGeral * 100) / 100,
    nota: `Com base na fase mais carregada (Ib≈${ibGeral.toFixed?.(1) || ibGeral} A) +10%`
  };

  return {
    sistema,
    label: labelSistema(sistema),
    drs: idr ? [idr] : [],
    idr,
    dps,
    disjuntorGeral,
    resumo: {
      qtdIdr: idr ? 1 : 0,
      qtdDpsModulos: dpsModulos,
      circuitosComDr: (circuits || []).filter((c) => c.dr).map((c) => c.id)
    }
  };
}

/**
 * Wago por caminhos: separa 2, 3, 5 e 10 pólos.
 * - Caixa/ponto: cabo + dispositivo → 2 direções → Wago 2 × nCondutores
 * - Junção na rede (grau ≥ 3): Wago 3/5/10 × nCondutores conforme nº de saídas
 */
function contarWagos(projeto, graph, circuits = []) {
  const porPolos = { 2: 0, 3: 0, 5: 0, 10: 0 };
  const circById = Object.fromEntries((circuits || []).map((c) => [c.id, c]));

  const points = (projeto.points || []).map((p) => normalizePoint(p));
  const caixas = points.filter((p) => p.tipo && p.tipo !== "qdc");

  caixas.forEach((p) => {
    const circ = circById[p.circuitoId];
    const nCond = circ ? nCondutoresOf(circ.polos) : 3;
    // Emenda cabo↔dispositivo: 2 vias por condutor
    porPolos[2] += nCond;
  });

  const degree = {};
  (graph?.edges || []).forEach((e) => {
    degree[e.a] = (degree[e.a] || 0) + 1;
    degree[e.b] = (degree[e.b] || 0) + 1;
  });

  // Condutores médios dos circuitos (para junções da rede)
  const nCondMed =
    circuits.length > 0
      ? Math.round(
          circuits.reduce((s, c) => s + nCondutoresOf(c.polos), 0) / circuits.length
        )
      : 3;

  let juncoes = 0;
  Object.values(degree).forEach((d) => {
    if (d < 3) return;
    juncoes += 1;
    const wPolos = wagoPolosPorDirecoes(d);
    porPolos[wPolos] += nCondMed;
  });

  const unidades = Object.values(porPolos).reduce((s, n) => s + n, 0);
  const detalhe = [2, 3, 5, 10]
    .filter((p) => porPolos[p] > 0)
    .map((p) => `${porPolos[p]}× Wago ${p}P`)
    .join(" · ");

  return {
    porPolos,
    unidades,
    pacotes: 0, // itens separados por pólos no BOM
    caixas: caixas.length,
    juncoes,
    nota:
      detalhe ||
      `${caixas.length} caixa(s) · ${juncoes} junção(ões) — sem conectores estimados`
  };
}

function lineProd(produtos, modo, refId, nome, qtd, unidade, nota, pred) {
  const list = produtos || [];
  const find = (fn) => list.find(fn);
  const prod = refId
    ? find((p) => p.id === refId)
    : pred
      ? find(pred)
      : null;
  const preco = prod
    ? typeof getPrecoByModo === "function"
      ? getPrecoByModo(prod, modo)
      : Number(prod.preco || 0)
    : 0;
  return {
    tipo: "produto",
    refId: prod?.id || refId || null,
    nome: nome || prod?.nome || "Item",
    unidade,
    qtd,
    preco: prod && unidade === "m" && /cabo/i.test(prod.nome || "") ? preco / 100 : preco,
    nota: nota || ""
  };
}

/** Lista de materiais detalhada de um único circuito. */
function materiaisDoCircuito(circ, projeto, produtos, modo, wagoShareUn) {
  const itens = [];
  const dim = circ.dimensionamento;
  if (!dim) return itens;

  const metros = Math.ceil((dim.metrosCabo || circ.comprimentoM * (dim.nCondutores || 2)) * 1.1);
  const caboMap = { 1.5: "prd-13", 2.5: "prd-10", 4: "prd-11", 6: "prd-12" };
  const caboId = caboMap[Number(circ.bitola)] || null;
  itens.push(
    lineProd(
      produtos,
      modo,
      caboId,
      `Cabo ${circ.bitola} mm² (${circ.id})`,
      metros,
      "m",
      `L≈${(circ.comprimentoM || 0).toFixed(1)} m · ${dim.nCondutores || "—"} cond. +10%`
    )
  );

  const polos = circ.polos || 1;
  const djId = polos >= 3 ? null : polos >= 2 ? "prd-7" : "prd-6";
  itens.push(
    lineProd(
      produtos,
      modo,
      djId,
      `Disjuntor ${labelPolosDj(polos)} ${circ.disjuntor}A curva ${circ.curva || "C"}`,
      1,
      "un",
      `Ib ${circ.ib?.toFixed?.(2) || "—"} A · ${circ.tensaoV || "—"} V · fase ${circ.fase || "—"}`
    )
  );

  // IDR fica no QDC (lista total), não por circuito

  const pts = (projeto.points || []).filter((p) => p.circuitoId === circ.id);
  pts.forEach((raw) => {
    const p = normalizePoint(raw);
    if (p.tipo === "tomada" || p.tipo === "conjugado") {
      const mod = modulosTomada(p.modulos);
      itens.push(
        lineProd(
          produtos,
          modo,
          p.amperagem >= 20 ? "prd-2" : "prd-1",
          `Tomada ${mod.label.split("(")[0].trim()} ${p.amperagem}A`,
          1,
          "un",
          labelPonto(p)
        )
      );
      if (p.tipo === "conjugado") {
        const v = varInterruptor(p.variante);
        itens.push(
          lineProd(produtos, modo, "prd-3", `Interruptor ${v.label}`, 1, "un", "Conjugado")
        );
      }
    } else if (p.tipo === "interruptor") {
      const v = varInterruptor(p.variante);
      itens.push(lineProd(produtos, modo, "prd-3", `Interruptor ${v.label}`, 1, "un", ""));
    } else if (p.tipo === "lampada") {
      itens.push(
        lineProd(produtos, modo, null, varLampada(p.variante).label, 1, "un", "Ponto de luz")
      );
    } else if (p.tipo === "chuveiro") {
      itens.push(lineProd(produtos, modo, null, "Ponto chuveiro", 1, "un", "Dedicado"));
    } else if (p.tipo === "ar") {
      itens.push(lineProd(produtos, modo, null, "Ponto ar-condicionado", 1, "un", "Dedicado"));
    }
  });

  if (pts.length) {
    itens.push(
      lineProd(produtos, modo, "prd-16", "Caixa 4x2", pts.length, "un", `Pontos do ${circ.id}`)
    );
  }

  // Consolida iguais (ex.: 4 tomadas iguais → qtd 4)
  const bag = {};
  itens.forEach((it) => {
    const k = `${it.refId || ""}|${it.nome}|${it.unidade}`;
    if (!bag[k]) bag[k] = { ...it, qtd: 0, notas: [] };
    bag[k].qtd += Number(it.qtd) || 0;
    if (it.nota) bag[k].notas.push(it.nota);
  });
  return Object.values(bag).map((b) => ({
    tipo: b.tipo,
    refId: b.refId,
    nome: b.nome,
    unidade: b.unidade,
    qtd: Math.round(b.qtd * 100) / 100,
    preco: b.preco,
    nota: [...new Set(b.notas)].join(" · ")
  }));
}

function montarMateriaisPorCircuito(projeto, circuits, produtos, modo, _wago) {
  return (circuits || []).map((circ) => {
    const itens = materiaisDoCircuito(circ, projeto, produtos, modo, 0);
    circ.materiais = itens;
    return {
      circuitoId: circ.id,
      tipo: circ.dimensionamento?.tipo?.label || circ.tipoId,
      fase: circ.fase || "—",
      tensaoV: circ.tensaoV,
      potenciaVA: circ.potenciaVA,
      ib: circ.ib,
      bitola: circ.bitola,
      disjuntor: circ.disjuntor,
      polos: circ.polos,
      dr: null,
      itens
    };
  });
}

export {
  resolveSistema,
  labelSistema,
  nFasesOf,
  normalizeTensaoPonto,
  resolvePolos,
  nCondutoresOf,
  labelPolosDj,
  TENSOES_PONTO,
  balancearCargas,
  dimensionarProtecao,
  contarWagos,
  materiaisDoCircuito,
  montarMateriaisPorCircuito,
  lineProd,
  pickIn,
  DR_INS,
  DJ_GERAL
};
