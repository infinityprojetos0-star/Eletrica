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
  varLampada,
  teclasDoInterruptor
} from "./types";

/** Cores NBR 5410 (identificação de condutores — prática BR) */
const CORES_CABO_NBR = {
  fase: [
    { id: "preto", label: "preto", hex: "#1a1a1a" },
    { id: "vermelho", label: "vermelho", hex: "#c62828" },
    { id: "branco", label: "branco", hex: "#f5f5f5" }
  ],
  neutro: { id: "azul", label: "azul-claro", hex: "#42a5f5" },
  pe: { id: "verde_amarelo", label: "verde-amarelo", hex: "#7cb342" }
};

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

/**
 * Escolhe Wago pela qtd de pontas de cabo.
 * Não existe 4 pólos → usa 5. Acima de 5 até 10 → 10.
 */
function pickWagoSize(nPontas) {
  const n = Math.max(0, Number(nPontas) || 0);
  if (n < 2) return 0;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n <= 5) return 5; // 4 ou 5 pontas
  if (n <= 10) return 10;
  return 10;
}

/** @deprecated use pickWagoSize */
function wagoPolosPorDirecoes(nDirecoes) {
  return pickWagoSize(nDirecoes);
}

/**
 * Condutores emendados no ponto (cada um leva 1 Wago do mesmo tamanho).
 * Interruptor/sensor: só fase. Demais: F(+fases)+N+PE conforme pólos.
 */
function condutoresEmendaNoPonto(tiposPonto, polos) {
  const tipos = tiposPonto || [];
  if (
    tipos.length > 0 &&
    tipos.every((t) => t === "interruptor" || t === "sensor" || t === "campainha")
  ) {
    return 1;
  }
  return nCondutoresOf(polos);
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
 * Wago pela lógica de pontas de cabo (ex. do usuário):
 * - Neutro no ponto de luz (passa + luminária + segue) → 3 pontas → Wago 3P
 * - Fase no ponto de luz (passa + interruptor + segue) → 3 pontas → Wago 3P
 * - 4 pontas (chega + 2 derivações + segue) → Wago 5P (não existe 4P)
 *
 * Em cada nó da rede, por circuito:
 *   pontas = arestas do caminho nesse nó + pontos desse circuito ancorados no nó
 * Cada condutor (F/N/PE…) leva 1 Wago do tamanho escolhido.
 *
 * @param nodeEdgeEnds { [circId]: { [nodeIdx]: number } }
 */
function contarWagos(projeto, graph, circuits = [], nodeEdgeEnds = {}) {
  const porPolos = { 2: 0, 3: 0, 5: 0, 10: 0 };
  const circById = Object.fromEntries((circuits || []).map((c) => [c.id, c]));
  const points = (projeto.points || []).map((p) => normalizePoint(p));
  const caixas = points.filter((p) => p.tipo && p.tipo !== "qdc");

  const qdc = points.find((p) => p.tipo === "qdc");
  const qdcNode = qdc && graph?.snap ? graph.snap[qdc.id] : -1;

  /** pontos do circuito ancorados em cada nó (exceto QDC) */
  const nodeCircPoints = {};
  caixas.forEach((p) => {
    if (!p.circuitoId) return;
    const ni = graph?.snap?.[p.id];
    if (ni == null || ni < 0) return;
    if (ni === qdcNode) return;
    const k = `${p.circuitoId}@${ni}`;
    if (!nodeCircPoints[k]) nodeCircPoints[k] = [];
    nodeCircPoints[k].push(p);
  });

  const keys = new Set(Object.keys(nodeCircPoints));
  Object.entries(nodeEdgeEnds || {}).forEach(([cid, nodes]) => {
    Object.keys(nodes || {}).forEach((ni) => keys.add(`${cid}@${ni}`));
  });

  let juncoes = 0;
  const detalhes = [];

  keys.forEach((k) => {
    const at = k.lastIndexOf("@");
    const cid = k.slice(0, at);
    const ni = Number(k.slice(at + 1));
    if (!Number.isFinite(ni) || ni === qdcNode) return;

    const edgeEnds = Number(nodeEdgeEnds?.[cid]?.[ni]) || 0;
    const pts = nodeCircPoints[k] || [];
    // Ignora vértices “de passagem” (2 arestas sem caixa) — não são emenda real
    if (pts.length === 0 && edgeEnds < 3) return;

    const nPontas = edgeEnds + pts.length;
    if (nPontas < 2) return;

    if (edgeEnds >= 3 || pts.length >= 2) juncoes += 1;

    const circ = circById[cid];
    const nCond = condutoresEmendaNoPonto(
      pts.map((p) => p.tipo),
      circ?.polos || 1
    );
    const size = pickWagoSize(nPontas);
    if (!size || nCond < 1) return;

    const qtdPorCond = nPontas > 10 ? Math.ceil(nPontas / 10) : 1;
    const useSize = nPontas > 10 ? 10 : size;
    porPolos[useSize] += nCond * qtdPorCond;

    if (detalhes.length < 8) {
      const onde =
        pts.map((p) => p.tipo).filter(Boolean).join("/") || `nó ${ni}`;
      detalhes.push(
        `${cid}@${onde}: ${nPontas} pontas → ${nCond}× Wago ${useSize}P`
      );
    }
  });

  // Derivações DENTRO da caixa (tomada dupla/tripla, interruptor multi-tecla)
  const bumpWago = (size, qtd, label, pontas) => {
    if (!size || !qtd) return;
    porPolos[size] = (porPolos[size] || 0) + qtd;
    if (detalhes.length < 14) {
      detalhes.push(`${label}: ${pontas} pontas → ${qtd}× Wago ${size}P`);
    }
  };
  caixas.forEach((p) => {
    const interno = wagoInternoCaixa(p);
    if (!interno) return;
    bumpWago(interno.size, interno.qtd, interno.label, interno.pontas);
    if (interno.extra) {
      bumpWago(interno.extra.size, interno.extra.qtd, `${interno.label}+`, interno.extra.pontas || interno.pontas);
    }
  });

  const unidades = Object.values(porPolos).reduce((s, n) => s + n, 0);
  const resumoPolos = [2, 3, 5, 10]
    .filter((p) => porPolos[p] > 0)
    .map((p) => `${porPolos[p]}× ${p}P`)
    .join(" · ");

  return {
    porPolos,
    unidades,
    pacotes: 0,
    caixas: caixas.length,
    juncoes,
    detalhes,
    nota:
      resumoPolos ||
      "Sem emendas com 2+ pontas — nada a estimar de Wago"
  };
}

/**
 * Wago na caixinha: interruptor duplo/triplo (fase) e tomada multi (F+N+PE).
 * Ex.: 2 módulos → 1 chega + 2 sai = 3 pontas → Wago 3P; 3 módulos → 4 pontas → Wago 5P.
 */
function wagoInternoCaixa(raw) {
  const p = normalizePoint(raw);
  if (!p || p.tipo === "qdc") return null;

  if (p.tipo === "interruptor") {
    const teclas = teclasDoInterruptor(p.variante || "simples");
    if (teclas < 2) return null;
    const pontas = teclas + 1; // chega fase + 1 por tecla
    const size = pickWagoSize(pontas);
    return {
      size,
      qtd: 1, // só fase
      pontas,
      label: `int.${teclas}teclas`
    };
  }

  if (p.tipo === "tomada") {
    const mods = modulosTomada(p.modulos).modulos;
    if (mods < 2) return null;
    const pontas = mods + 1; // chega + 1 por módulo
    const size = pickWagoSize(pontas);
    return {
      size,
      qtd: 3, // F + N + PE
      pontas,
      label: `tomada ${mods}mod`
    };
  }

  if (p.tipo === "conjugado") {
    const teclas = teclasDoInterruptor(p.variante || "simples");
    const mods = modulosTomada(p.modulos).modulos;
    const parts = [];
    let main = null;
    let extra = null;
    if (teclas >= 2) {
      const pontas = teclas + 1;
      main = {
        size: pickWagoSize(pontas),
        qtd: 1,
        pontas,
        label: `conjugado int${teclas}`
      };
      parts.push(`int${teclas}`);
    }
    if (mods >= 2) {
      const pontas = mods + 1;
      const tom = {
        size: pickWagoSize(pontas),
        qtd: 3,
        pontas,
        label: `conjugado tom${mods}`
      };
      parts.push(`tom${mods}`);
      if (!main) main = tom;
      else if (main.size === tom.size) {
        main.qtd += tom.qtd;
        main.pontas = Math.max(main.pontas, tom.pontas);
        main.label = `conjugado ${parts.join("+")}`;
      } else {
        extra = tom;
        main.label = `conjugado ${parts.join("+")}`;
      }
    }
    if (!main) return null;
    if (extra) main.extra = extra;
    return main;
  }

  return null;
}

/**
 * Condutores coloridos do circuito (NBR — identificação).
 * Retorna lista { papel, cor, corLabel, metrosFator } metrosFator = fração do comprimento de um condutor.
 */
function condutoresColoridos(polos, incluiPe = true) {
  const p = Number(polos) || 1;
  const list = [];
  if (p >= 3) {
    list.push({ papel: "Fase L1", cor: "preto", corLabel: "preto" });
    list.push({ papel: "Fase L2", cor: "vermelho", corLabel: "vermelho" });
    list.push({ papel: "Fase L3", cor: "branco", corLabel: "branco" });
    list.push({ papel: "Neutro", cor: "azul", corLabel: "azul-claro" });
  } else if (p >= 2) {
    list.push({ papel: "Fase L1", cor: "preto", corLabel: "preto" });
    list.push({ papel: "Fase L2", cor: "vermelho", corLabel: "vermelho" });
  } else {
    list.push({ papel: "Fase", cor: "preto", corLabel: "preto" });
    list.push({ papel: "Neutro", cor: "azul", corLabel: "azul-claro" });
  }
  if (incluiPe) {
    list.push({ papel: "PE (aterramento)", cor: "verde_amarelo", corLabel: "verde-amarelo" });
  }
  return list;
}

/**
 * Comprimento 3D do circuito: planta + descidas (pé direito − altura do ponto).
 * peDireitoM padrão 2,80 m.
 */
function comprimentoCircuito3D(circ, projeto, byId) {
  const pd = Math.max(2.2, Number(projeto?.peDireitoM) || 2.8);
  const plan = Number(circ.comprimentoM) || 0;
  const qdc = (projeto.points || []).find((p) => normalizePoint(p).tipo === "qdc");
  const hQdc = qdc ? Number(normalizePoint(qdc).alturaM) || 1.4 : 1.4;
  const dropQdc = Math.max(0, pd - hQdc);

  let dropMax = 0;
  (circ.pontos || []).forEach((pid) => {
    const pt = byId?.[pid] || (projeto.points || []).find((x) => x.id === pid);
    if (!pt) return;
    const n = normalizePoint(pt);
    const h = Number(n.alturaM);
    const altura = Number.isFinite(h) ? h : n.tipo === "lampada" ? pd : 0.3;
    // Lâmpada no teto: quase sem descida; parede: PD − altura
    const drop = n.tipo === "lampada" ? Math.max(0, pd - Math.min(altura, pd)) : Math.max(0, pd - altura);
    dropMax = Math.max(dropMax, drop);
  });

  // Pior ramo: planta + descida QDC + descida no ponto mais desfavorável
  return Math.max(plan + dropQdc + dropMax, plan, 1);
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

  const metros1 =
    Number(circ.metrosPorCondutor) ||
    Math.ceil((circ.comprimentoM || 0) * 1.1);
  const caboMap = { 1.5: "prd-13", 2.5: "prd-10", 4: "prd-11", 6: "prd-12" };
  const caboId = caboMap[Number(circ.bitola)] || null;
  const conds = circ.condutores || condutoresColoridos(circ.polos || 1, true);
  conds.forEach((c) => {
    itens.push(
      lineProd(
        produtos,
        modo,
        caboId,
        `Cabo ${circ.bitola} mm² ${c.corLabel} — ${c.papel}`,
        metros1,
        "m",
        `L≈${(circ.comprimentoM || 0).toFixed(1)} m (planta+PD) · ${circ.id}`
      )
    );
  });

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
  pickWagoSize,
  condutoresColoridos,
  comprimentoCircuito3D,
  CORES_CABO_NBR,
  TENSOES_PONTO,
  balancearCargas,
  dimensionarProtecao,
  contarWagos,
  wagoInternoCaixa,
  materiaisDoCircuito,
  montarMateriaisPorCircuito,
  lineProd,
  pickIn,
  DR_INS,
  DJ_GERAL
};
