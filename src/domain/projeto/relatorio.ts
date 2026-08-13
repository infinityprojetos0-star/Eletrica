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
 * Dimensiona IDR/DR por circuito que exige, DPS no QDC e disjuntor geral.
 */
function dimensionarProtecao(circuits, sistema, balanceamento) {
  const nFases = nFasesOf(sistema);
  const drs = [];

  (circuits || []).forEach((circ) => {
    if (!circ.dr) {
      circ.protecao = { ...(circ.protecao || {}), dr: null };
      return;
    }
    const need = Number(circ.disjuntor) || 16;
    const In = pickIn(DR_INS, need);
    const polosCirc = Number(circ.polos) || 1;
    const polos = polosCirc >= 3 || (nFases === 3 && polosCirc >= 3) ? 4 : 2;
    const item = {
      circuitoId: circ.id,
      tipo: "IDR",
      nome: `IDR ${polos}P ${In}A 30mA`,
      In,
      IDeltaN: 30,
      polos,
      nota: `Diferencial do ${circ.id} (${circ.dimensionamento?.tipo?.label || circ.tipoId}) — NBR 5410`
    };
    circ.protecao = { ...(circ.protecao || {}), dr: item };
    drs.push(item);
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

  const ibGeral = Number(balanceamento?.correnteMaxA) || 0;
  const InGeral = pickIn(DJ_GERAL, ibGeral * 1.1);
  const polosGeral = nFases === 3 ? 3 : nFases === 2 ? 2 : 1;
  const disjuntorGeral = {
    tipo: "DJ_GERAL",
    nome: `Disjuntor geral ${polosGeral >= 3 ? "tripolar" : polosGeral >= 2 ? "bipolar" : "monopolar"} ${InGeral}A`,
    In: InGeral,
    polos: polosGeral,
    ibRefA: Math.round(ibGeral * 100) / 100,
    nota: `Com base na fase mais carregada (Ib≈${ibGeral.toFixed?.(1) || ibGeral} A) +10%`
  };

  return {
    sistema,
    label: labelSistema(sistema),
    drs,
    dps,
    disjuntorGeral,
    resumo: {
      qtdIdr: drs.length,
      qtdDpsModulos: dpsModulos,
      circuitosComDr: drs.map((d) => d.circuitoId)
    }
  };
}

/**
 * Conta conectores Wago nas caixas e junções (derivações) da rede.
 * Heurística: 3 conectores (F+N+PE) por caixa e por nó com grau ≥ 3.
 */
function contarWagos(projeto, graph) {
  const caixas = (projeto.points || []).filter((p) => {
    const t = normalizePoint(p).tipo;
    return t && t !== "qdc";
  }).length;

  const degree = {};
  (graph?.edges || []).forEach((e) => {
    degree[e.a] = (degree[e.a] || 0) + 1;
    degree[e.b] = (degree[e.b] || 0) + 1;
  });
  const juncoes = Object.values(degree).filter((d) => d >= 3).length;

  const unidades = (caixas + juncoes) * 3;
  const pacotes = unidades > 0 ? Math.ceil(unidades / 50) : 0;

  return {
    unidades,
    pacotes,
    caixas,
    juncoes,
    porCaixa: 3,
    nota: `${caixas} caixa(s) + ${juncoes} junção(ões) × 3 (F+N+PE) = ${unidades} un · pct c/ 50`
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
  const djId = polos >= 2 ? "prd-7" : "prd-6";
  itens.push(
    lineProd(
      produtos,
      modo,
      djId,
      `Disjuntor ${polos >= 2 ? "bipolar" : "monopolar"} ${circ.disjuntor}A curva ${circ.curva || "C"}`,
      1,
      "un",
      `Ib ${circ.ib?.toFixed?.(2) || "—"} A · fase ${circ.fase || "—"}`
    )
  );

  if (circ.protecao?.dr) {
    const dr = circ.protecao.dr;
    itens.push(
      lineProd(
        produtos,
        modo,
        "prd-8",
        dr.nome,
        1,
        "un",
        dr.nota
      )
    );
  }

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

  if (wagoShareUn > 0) {
    itens.push({
      tipo: "produto",
      refId: "prd-23",
      nome: "Conector Wago (estimativa)",
      unidade: "un",
      qtd: wagoShareUn,
      preco: 0,
      nota: "Parte proporcional das derivações (F+N+PE)"
    });
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

function montarMateriaisPorCircuito(projeto, circuits, produtos, modo, wago) {
  const nCirc = Math.max(1, (circuits || []).length);
  const share = wago?.unidades ? Math.ceil(wago.unidades / nCirc) : 0;
  return (circuits || []).map((circ) => {
    const itens = materiaisDoCircuito(circ, projeto, produtos, modo, share);
    circ.materiais = itens;
    return {
      circuitoId: circ.id,
      tipo: circ.dimensionamento?.tipo?.label || circ.tipoId,
      fase: circ.fase || "—",
      potenciaVA: circ.potenciaVA,
      ib: circ.ib,
      bitola: circ.bitola,
      disjuntor: circ.disjuntor,
      dr: circ.protecao?.dr || null,
      itens
    };
  });
}

export {
  resolveSistema,
  labelSistema,
  nFasesOf,
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
