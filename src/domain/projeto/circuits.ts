/**
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
import {
  resolveSistema,
  labelSistema,
  balancearCargas,
  dimensionarProtecao,
  contarWagos,
  montarMateriaisPorCircuito
} from "./relatorio";

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function projectOnSegGlobal(p, a, b) {
    const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (l2 < 1e-12) return { x: a.x, y: a.y, t: 0, d: dist(p, a) };
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + t * (b.x - a.x);
    const y = a.y + t * (b.y - a.y);
    return { x, y, t, d: dist(p, { x, y }) };
  }

  /**
   * Simbologia NBR 5444 — tamanhos FIXOS em metros na planta
   * (escalam com o zoom junto com o cômodo, não “pulam” de tamanho na tela).
   */
  const SYM_M = {
    luzR: 0.22,
    arandelaR: 0.16,
    intR: 0.11,
    tomada: 0.28,
    conjTom: 0.24,
    conjIntR: 0.1,
    qdcW: 0.48,
    qdcH: 0.38,
    carga: 0.26,
    hit: 0.28
  };

  function nivelTomada(alturaM) {
    const h = Number(alturaM);
    if (!Number.isFinite(h)) return "baixa";
    if (h >= 1.8) return "alta";
    if (h >= 1.0) return "media";
    return "baixa";
  }

  

function polylineLength(verts) {
    let L = 0;
    for (let i = 1; i < verts.length; i++) L += dist(verts[i - 1], verts[i]);
    return L;
  }

  /**
   * Grafo só da rede de conduítes (Dijkstra = caminho mais curto).
   * Pontos/QDC NÃO entram como nós — só “pingam” num ponto de ancoragem no eixo.
   */
  function buildGraph(projeto) {
    const nodes = [];
    const edges = [];
    const key = (p) => `${Number(p.x).toFixed(3)},${Number(p.y).toFixed(3)}`;
    const indexOf = (p) => {
      const k = key(p);
      let i = nodes.findIndex((n) => key(n) === k);
      if (i < 0) {
        i = nodes.length;
        nodes.push({ x: p.x, y: p.y });
      }
      return i;
    };

    // 1) Trechos dos conduítes
    (projeto.conduits || []).forEach((c) => {
      const verts = c.points || [];
      for (let i = 1; i < verts.length; i++) {
        const a = indexOf(verts[i - 1]);
        const b = indexOf(verts[i]);
        if (a === b) continue;
        edges.push({
          a,
          b,
          len: dist(nodes[a], nodes[b]),
          conduitId: c.id
        });
      }
    });

    // 2) Junta extremidades quase tocantes
    const nBase = nodes.length;
    for (let i = 0; i < nBase; i++) {
      for (let j = i + 1; j < nBase; j++) {
        const d = dist(nodes[i], nodes[j]);
        if (d > 0 && d <= CONDUIT_JOIN_M) {
          const already = edges.some(
            (e) => (e.a === i && e.b === j) || (e.a === j && e.b === i)
          );
          if (!already) {
            edges.push({ a: i, b: j, len: Math.max(d, 0.01), conduitId: null, bridge: true });
          }
        }
      }
    }

    const snap = {};
    const stub = {}; // ptId → comprimento do ramal até o conduíte

    // 3) Ancora cada ponto no eixo do conduíte (sem criar nó do ponto no grafo)
    (projeto.points || []).forEach((pt) => {
      let best = null;
      const edgeCount = edges.length;
      for (let ei = 0; ei < edgeCount; ei++) {
        const e = edges[ei];
        if (e.bridge) continue;
        const proj = projectOnSegGlobal(pt, nodes[e.a], nodes[e.b]);
        if (!best || proj.d < best.d) best = { ...proj, ei, e };
      }

      if (!best || best.d > POINT_LINK_M) {
        let bestNode = -1;
        let bestD = POINT_LINK_M;
        for (let i = 0; i < nodes.length; i++) {
          const d = dist(pt, nodes[i]);
          if (d < bestD) {
            bestD = d;
            bestNode = i;
          }
        }
        if (bestNode >= 0) {
          snap[pt.id] = bestNode;
          stub[pt.id] = bestD;
        } else {
          snap[pt.id] = -1;
          stub[pt.id] = 0;
        }
        return;
      }

      let attachIdx;
      if (best.t <= 0.02) attachIdx = best.e.a;
      else if (best.t >= 0.98) attachIdx = best.e.b;
      else {
        attachIdx = indexOf({ x: best.x, y: best.y });
        const old = edges[best.ei];
        if (attachIdx !== old.a && attachIdx !== old.b) {
          edges[best.ei] = {
            a: old.a,
            b: attachIdx,
            len: dist(nodes[old.a], nodes[attachIdx]),
            conduitId: old.conduitId
          };
          edges.push({
            a: attachIdx,
            b: old.b,
            len: dist(nodes[attachIdx], nodes[old.b]),
            conduitId: old.conduitId
          });
        }
      }

      snap[pt.id] = attachIdx;
      stub[pt.id] = best.d;
    });

    return { nodes, edges, snap, stub };
  }

  /** Remove vértices consecutivos quase iguais. */
  function dedupePoly(pts) {
    const out = [];
    (pts || []).forEach((p) => {
      const prev = out[out.length - 1];
      if (!prev || dist(prev, p) > 0.02) out.push({ x: p.x, y: p.y });
    });
    return out;
  }

  function dijkstra(graph, startIdx) {
    const n = graph.nodes.length;
    const distArr = Array(n).fill(Infinity);
    const prev = Array(n).fill(-1);
    const prevEdge = Array(n).fill(null);
    if (startIdx < 0 || startIdx >= n) return { distArr, prev, prevEdge };
    distArr[startIdx] = 0;
    const used = Array(n).fill(false);
    for (let iter = 0; iter < n; iter++) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!used[i] && distArr[i] < best) {
          best = distArr[i];
          u = i;
        }
      }
      if (u < 0) break;
      used[u] = true;
      graph.edges.forEach((e) => {
        const v = e.a === u ? e.b : e.b === u ? e.a : -1;
        if (v < 0) return;
        const alt = distArr[u] + e.len;
        if (alt < distArr[v]) {
          distArr[v] = alt;
          prev[v] = u;
          prevEdge[v] = e;
        }
      });
    }
    return { distArr, prev, prevEdge };
  }

  function pathEdgesFromPrev(prev, prevEdge, targetIdx) {
    const list = [];
    let cur = targetIdx;
    let g = 0;
    while (prev[cur] >= 0 && g++ < 5000) {
      if (prevEdge[cur]) list.push(prevEdge[cur]);
      cur = prev[cur];
    }
    return list;
  }

  /** Reconstrói a polilinha QDC → ponto (nós do grafo). */
  function pathPointsFromPrev(graph, prev, targetIdx) {
    const nodes = [];
    let cur = targetIdx;
    let g = 0;
    while (cur >= 0 && g++ < 5000) {
      nodes.push({ x: graph.nodes[cur].x, y: graph.nodes[cur].y });
      if (prev[cur] < 0) break;
      cur = prev[cur];
    }
    return nodes.reverse();
  }

  function packCircuits(items, maxPeso, maxPotVA, tipoId, startNum) {
    const circuits = [];
    let cur = null;
    let num = startNum;
    items.forEach((pt) => {
      const pot = cargaPonto(pt);
      const peso = pesoPonto(pt);
      const needNew =
        !cur ||
        cur.peso + peso > maxPeso ||
        (maxPotVA > 0 && cur.potenciaVA + pot > maxPotVA);
      if (needNew) {
        cur = {
          id: `C${num}`,
          numero: num,
          tipoId,
          pontos: [],
          potenciaVA: 0,
          peso: 0,
          cor: CORES_CIRCUITO[(num - 1) % CORES_CIRCUITO.length]
        };
        circuits.push(cur);
        num++;
      }
      cur.pontos.push(pt.id);
      cur.potenciaVA += pot;
      cur.peso += peso;
      pt.circuitoId = cur.id;
    });
    return { circuits, nextNum: num };
  }

  function analisar(projeto, { produtos, modoPreco } = {}) {
    const uso = projeto.uso === "comercial" ? "comercial" : "residencial";
    const sistema = resolveSistema(projeto);
    const lim =
      (typeof PreProjeto !== "undefined" && PreProjeto.LIMITES?.[uso]) || {
        pontosIlumPorCircuito: 10,
        tug10PorCircuito: 8,
        potIlumPorPontoVA: 100,
        potTug10VA: 100
      };

    const points = (projeto.points || []).map((p) => normalizePoint(p));
    const byId = Object.fromEntries(points.map((p) => [p.id, p]));
    const avisos = [];
    const qdc = points.find((p) => p.tipo === "qdc");
    if (!qdc) avisos.push("Inclua um QDC na planta para dimensionar os caminhos dos circuitos.");
    avisos.push(`Sistema elétrico: ${labelSistema(sistema)}.`);

    points.forEach((p) => {
      if (!p.circuitoManual) p.circuitoId = null;
    });

    let nextNum = 1;
    const circuits = [];

    const manuais = {};
    points.forEach((p) => {
      if (!p.circuitoManual || !p.circuitoId) return;
      if (!manuais[p.circuitoId]) {
        const num = parseInt(String(p.circuitoId).replace(/\D/g, ""), 10) || nextNum;
        manuais[p.circuitoId] = {
          id: p.circuitoId,
          numero: num,
          tipoId: circKindOf(p) || "livre",
          pontos: [],
          potenciaVA: 0,
          cor: CORES_CIRCUITO[(num - 1) % CORES_CIRCUITO.length],
          manual: true
        };
        nextNum = Math.max(nextNum, num + 1);
      }
      manuais[p.circuitoId].pontos.push(p.id);
      manuais[p.circuitoId].potenciaVA += cargaPonto(p);
    });
    Object.values(manuais).forEach((c) => circuits.push(c));

    const livreKind = (kind) =>
      points.filter((p) => circKindOf(p) === kind && !p.circuitoId && circKindOf(p));

    let r = packCircuits(
      points.filter((p) => p.tipo === "lampada" && !p.circuitoId),
      lim.pontosIlumPorCircuito,
      uso === "comercial" ? 1500 : 1200,
      "iluminacao",
      nextNum
    );
    circuits.push(...r.circuits);
    nextNum = r.nextNum;

    r = packCircuits(livreKind("tug"), lim.tug10PorCircuito, 1270, "tug", nextNum);
    circuits.push(...r.circuits);
    nextNum = r.nextNum;

    ["tue", "chuveiro", "ar"].forEach((kind) => {
      const lista =
        kind === "tue"
          ? livreKind("tue").concat(
              points.filter(
                (p) =>
                  !p.circuitoId &&
                  (p.tipo === "fogao" || p.tipo === "exaustor") &&
                  circKindOf(p) === "tue"
              )
            )
          : points.filter((p) => !p.circuitoId && circKindOf(p) === kind);
      // dedupe
      const seen = new Set();
      lista.forEach((pt) => {
        if (seen.has(pt.id)) return;
        seen.add(pt.id);
        const c = {
          id: `C${nextNum}`,
          numero: nextNum,
          tipoId: kind === "tue" ? "tue" : kind,
          pontos: [pt.id],
          potenciaVA: cargaPonto(pt),
          cor: CORES_CIRCUITO[(nextNum - 1) % CORES_CIRCUITO.length]
        };
        pt.circuitoId = c.id;
        circuits.push(c);
        nextNum++;
      });
    });

    const graph = buildGraph({ ...projeto, points });
    const qdcNode = qdc ? graph.snap[qdc.id] : -1;
    const qdcStub = qdc ? graph.stub[qdc.id] || 0 : 0;
    const fromQdc =
      qdcNode >= 0 ? dijkstra(graph, qdcNode) : { distArr: [], prev: [], prevEdge: [] };

    const conduitUse = {};
    circuits.forEach((circ) => {
      let maxLen = 0;
      let sumLen = 0;
      let nPath = 0;
      circ.caminhos = []; // polilinhas QDC→ponto (caminho mais curto na rede)
      const conduitesDoCirc = new Set();
      circ.pontos.forEach((pid) => {
        const pt = byId[pid];
        if (!pt) return;
        const ni = graph.snap[pid];
        const ptStub = graph.stub[pid] || 0;
        let len = 0;
        if (qdcNode >= 0 && ni >= 0 && fromQdc.distArr[ni] < Infinity) {
          // só arestas da rede (mais curto); ramais QDC/ponto somados à parte
          len = fromQdc.distArr[ni] + qdcStub + ptStub;
          pathEdgesFromPrev(fromQdc.prev, fromQdc.prevEdge, ni).forEach((e) => {
            if (!e.conduitId) return;
            if (!conduitUse[e.conduitId]) conduitUse[e.conduitId] = {};
            conduitUse[e.conduitId][circ.id] =
              (conduitUse[e.conduitId][circ.id] || 0) + e.len;
            conduitesDoCirc.add(e.conduitId);
          });
          let pathPts = pathPointsFromPrev(graph, fromQdc.prev, ni);
          if (qdc) pathPts = [{ x: qdc.x, y: qdc.y }, ...pathPts];
          pathPts = [...pathPts, { x: pt.x, y: pt.y }];
          pathPts = dedupePoly(pathPts);
          if (pathPts.length >= 2) {
            circ.caminhos.push({
              pontoId: pid,
              pontos: pathPts,
              label: labelPonto(pt)
            });
          }
          nPath++;
        } else if (qdc) {
          len = dist(pt, qdc) * 1.35;
          avisos.push(
            `Ponto "${labelPonto(pt)}" sem caminho de conduíte até o QDC — comprimento estimado ×1,35.`
          );
        } else {
          len = 12;
        }
        maxLen = Math.max(maxLen, len);
        sumLen += len;
      });
      circ.conduitesIds = [...conduitesDoCirc];
      circ.comprimentoM = Math.max(maxLen, 1);
      circ.comprimentoTotalTrechosM = sumLen;
      circ.pontosComPath = nPath;

      const first = byId[circ.pontos[0]];
      const tensao =
        circ.tipoId === "iluminacao" || circ.tipoId === "tug"
          ? Number(first?.tensaoV || 127)
          : Number(first?.tensaoV || 220);

      const fasesCirc = tensao >= 220 ? 2 : 1;
      const dim =
        typeof NBR5410 !== "undefined"
          ? NBR5410.dimensionar({
              tipoId: circ.tipoId || "livre",
              potenciaW: circ.potenciaVA,
              tensaoV: tensao,
              fases: fasesCirc,
              comprimentoM: circ.comprimentoM,
              agrupamentoId:
                circuits.length >= 8 ? "8+" : circuits.length >= 4 ? "4-5" : circuits.length >= 2 ? "2-3" : "1",
              tempId: "30",
              dr: circ.tipoId === "tug" || circ.tipoId === "chuveiro" || circ.tipoId === "tue"
            })
          : null;

      circ.dimensionamento = dim;
      if (dim) {
        circ.bitola = dim.cabo.secao;
        circ.disjuntor = dim.disjuntor.In;
        circ.polos = dim.disjuntor.polos;
        circ.curva = dim.disjuntor.curva;
        circ.ib = dim.ib;
        circ.quedaPct = dim.queda.pct;
        circ.eletroduto = dim.eletroduto;
        circ.dr = dim.dr;
        circ.avisos = dim.avisos || [];
      }
    });

    const conduits = (projeto.conduits || []).map((c) => {
      const use = conduitUse[c.id] || {};
      let best = c.circuitoId || null;
      let bestM = 0;
      const fios = Object.entries(use)
        .map(([cid, m]) => {
          const circ = circuits.find((x) => x.id === cid);
          if (m > bestM) {
            bestM = m;
            best = cid;
          }
          return {
            id: cid,
            cor: circ?.cor || "#222",
            metros: Math.round(m * 100) / 100,
            bitola: circ?.bitola || null,
            tipo: circ?.dimensionamento?.tipo?.label || circ?.tipoId || ""
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
      const circ = circuits.find((x) => x.id === best);
      return {
        ...c,
        circuitoId: best,
        cor: circ?.cor || "#222",
        fios // todos os circuitos/fios que passam neste conduíte
      };
    });

    const pointsOut = (projeto.points || []).map((orig) => {
      const p = byId[orig.id];
      return p ? { ...normalizePoint(orig), circuitoId: p.circuitoId } : normalizePoint(orig);
    });

    const balanceamento = balancearCargas(circuits, sistema);
    avisos.push(...(balanceamento.avisos || []));

    const protecao = dimensionarProtecao(circuits, sistema, balanceamento);
    const wago = contarWagos({ ...projeto, points: pointsOut }, graph);

    const projetoMat = { ...projeto, points: pointsOut, conduits, arch: projeto.arch || [], sistema };
    const materiaisPorCircuito = montarMateriaisPorCircuito(
      projetoMat,
      circuits,
      produtos,
      modoPreco || "medio",
      wago
    );

    const materiais = montarMateriais(projetoMat, circuits, produtos, modoPreco || "medio", {
      protecao,
      wago,
      balanceamento
    });

    return {
      uso,
      sistema,
      sistemaLabel: labelSistema(sistema),
      circuits,
      conduits,
      points: pointsOut,
      materiais,
      materiaisPorCircuito,
      protecao,
      balanceamento,
      wago,
      avisos: [...new Set(avisos)],
      disclaimer:
        "Cálculos auxiliares com base em critérios simplificados da NBR 5410. Não substitui projeto elétrico oficial.",
      geradoEm: new Date().toISOString()
    };
  }

  function montarMateriais(projeto, circuits, produtos, modo, extras = {}) {
    const itens = [];
    const list = produtos || [];
    const find = (pred) => list.find(pred);
    const preco = (p) =>
      typeof getPrecoByModo === "function" ? getPrecoByModo(p, modo) : Number(p?.preco || 0);
    const protecao = extras.protecao || null;
    const wago = extras.wago || null;

    const caboMap = { 1.5: "prd-13", 2.5: "prd-10", 4: "prd-11", 6: "prd-12" };
    const metrosPorSecao = {};
    let metrosEletroduto = 0;

    (projeto.conduits || []).forEach((c) => {
      metrosEletroduto += polylineLength(c.points || []);
    });

    circuits.forEach((circ) => {
      const dim = circ.dimensionamento;
      if (!dim) return;
      const s = dim.cabo.secao;
      metrosPorSecao[s] =
        (metrosPorSecao[s] || 0) + (dim.metrosCabo || circ.comprimentoM * dim.nCondutores);
    });

    Object.entries(metrosPorSecao).forEach(([secao, metros]) => {
      const id = caboMap[Number(secao)];
      const prod = id ? find((p) => p.id === id) : null;
      const m = Math.ceil(metros * 1.1);
      itens.push({
        tipo: "produto",
        refId: prod?.id || null,
        nome: prod?.nome || `Cabo flexível ${secao} mm²`,
        unidade: "m",
        qtd: m,
        preco: prod ? preco(prod) / 100 : 0,
        nota: `${secao} mm² · NBR 5410 · +10% folga`
      });
    });

    if (metrosEletroduto > 0) {
      const eletro =
        find((p) => /eletroduto|corflex/i.test(p.nome || "")) || find((p) => p.id === "prd-15");
      itens.push({
        tipo: "produto",
        refId: eletro?.id || null,
        nome: eletro?.nome || 'Eletroduto / Corflex 3/4"',
        unidade: "m",
        qtd: Math.ceil(metrosEletroduto * 1.15),
        preco: eletro ? preco(eletro) : 0,
        nota: "Conduítes traçados +15%"
      });
    }

    const bag = {};
    const bump = (nome, qtd, nota, pred) => {
      if (!qtd) return;
      const k = nome;
      if (!bag[k]) bag[k] = { nome, qtd: 0, nota, pred };
      bag[k].qtd += qtd;
    };

    let caixas = 0;
    (projeto.points || []).forEach((raw) => {
      const p = normalizePoint(raw);
      if (p.tipo === "tomada" || p.tipo === "conjugado") {
        const mod = modulosTomada(p.modulos);
        bump(
          `Tomada ${mod.label.split("(")[0].trim()} ${p.amperagem}A`,
          1,
          p.usoCircuito === "tue" ? "TUE / 20A" : "TUG",
          p.amperagem >= 20
            ? (x) => x.id === "prd-2" || /tomada.*20/i.test(x.nome || "")
            : (x) => x.id === "prd-1" || /tomada.*10/i.test(x.nome || "")
        );
        caixas += 1;
        if (p.tipo === "conjugado") {
          const v = varInterruptor(p.variante);
          bump(`Interruptor ${v.label}`, 1, "Conjugado", (x) => /interruptor/i.test(x.nome || "") || x.id === "prd-3");
        }
      } else if (p.tipo === "interruptor") {
        const v = varInterruptor(p.variante);
        bump(`Interruptor ${v.label}`, 1, "", (x) => /interruptor/i.test(x.nome || "") || x.id === "prd-3");
        caixas += 1;
      } else if (p.tipo === "lampada") {
        bump(varLampada(p.variante).label, 1, "Ponto de iluminação", () => null);
        caixas += 1;
      } else if (p.tipo === "chuveiro") bump("Ponto chuveiro / caixa", 1, "Dedicado", () => null);
      else if (p.tipo === "ar") bump("Ponto ar-condicionado", 1, "Dedicado", () => null);
      else if (p.tipo === "sensor") bump("Sensor de presença", 1, "", (x) => /sensor/i.test(x.nome || ""));
      else if (p.tipo === "campainha") bump("Campainha", 1, "", () => null);
      else if (p.tipo === "exaustor") bump("Exaustor (ponto)", 1, "", () => null);
      else if (p.tipo === "fogao") bump("Ponto fogão/forno", 1, "TUE", () => null);
    });

    Object.values(bag).forEach((b) => {
      const prod = b.pred ? find(b.pred) : null;
      itens.push({
        tipo: "produto",
        refId: prod?.id || null,
        nome: prod?.nome && b.nome.startsWith("Tomada") ? b.nome : b.nome,
        unidade: "un",
        qtd: b.qtd,
        preco: prod ? preco(prod) : 0,
        nota: b.nota
      });
    });

    if (caixas) {
      const cx = find((p) => /caixa.*4/i.test(p.nome || "") || p.id === "prd-16");
      itens.push({
        tipo: "produto",
        refId: cx?.id || null,
        nome: cx?.nome || "Caixa 4x2",
        unidade: "un",
        qtd: caixas,
        preco: cx ? preco(cx) : 0,
        nota: "Pontos de caixa"
      });
    }

    circuits.forEach((circ) => {
      if (!circ.dimensionamento) return;
      const In = circ.disjuntor;
      const polos = circ.polos || 1;
      const dj =
        polos >= 2
          ? find((p) => p.id === "prd-7") || find((p) => /bipolar/i.test(p.nome || ""))
          : find((p) => p.id === "prd-6") || find((p) => /monopolar/i.test(p.nome || ""));
      itens.push({
        tipo: "produto",
        refId: dj?.id || null,
        nome: `Disjuntor ${polos >= 2 ? "bipolar" : "monopolar"} ${In}A curva ${circ.curva || "C"} (${circ.id})`,
        unidade: "un",
        qtd: 1,
        preco: dj ? preco(dj) : 0,
        nota: `Ib ${circ.ib?.toFixed?.(2) || "—"} A · ${circ.bitola} mm²`
      });
    });

    // Proteção: IDR por circuito + DPS no QDC + disjuntor geral
    if (protecao?.disjuntorGeral) {
      const g = protecao.disjuntorGeral;
      const djG =
        g.polos >= 3
          ? find((p) => /tripolar|geral/i.test(p.nome || ""))
          : g.polos >= 2
            ? find((p) => p.id === "prd-7") || find((p) => /bipolar/i.test(p.nome || ""))
            : find((p) => p.id === "prd-6");
      itens.push({
        tipo: "produto",
        refId: djG?.id || null,
        nome: g.nome,
        unidade: "un",
        qtd: 1,
        preco: djG ? preco(djG) : 0,
        nota: g.nota
      });
    }

    if (protecao?.drs?.length) {
      const drProd =
        find((p) => p.id === "prd-8") ||
        find((p) => /\bdr\b|idr|diferencial/i.test(p.nome || ""));
      // Agrupa por nome (In/pólos) para a lista consolidada
      const bagDr = {};
      protecao.drs.forEach((d) => {
        const k = d.nome;
        if (!bagDr[k]) bagDr[k] = { ...d, qtd: 0, circs: [] };
        bagDr[k].qtd += 1;
        bagDr[k].circs.push(d.circuitoId);
      });
      Object.values(bagDr).forEach((d) => {
        itens.push({
          tipo: "produto",
          refId: drProd?.id || null,
          nome: d.nome,
          unidade: "un",
          qtd: d.qtd,
          preco: drProd ? preco(drProd) : 0,
          nota: `${d.circs.join(", ")} · 30 mA · NBR 5410`
        });
      });
    } else if (circuits.some((c) => c.dr)) {
      const dr =
        find((p) => p.id === "prd-8") ||
        find((p) => /\bdr\b|diferencial/i.test(p.nome || ""));
      itens.push({
        tipo: "produto",
        refId: dr?.id || null,
        nome: dr?.nome || "DR 30 mA",
        unidade: "un",
        qtd: 1,
        preco: dr ? preco(dr) : 0,
        nota: "NBR 5410 — TUG / áreas molhadas"
      });
    }

    const dpsQtd = protecao?.dps?.modulos || (circuits.length ? 1 : 0);
    if (dpsQtd > 0) {
      const dps =
        find((p) => p.id === "prd-9") || find((p) => /\bdps\b/i.test(p.nome || ""));
      itens.push({
        tipo: "produto",
        refId: dps?.id || null,
        nome: protecao?.dps?.nome || dps?.nome || "DPS classe II",
        unidade: "un",
        qtd: dpsQtd,
        preco: dps ? preco(dps) : 0,
        nota: protecao?.dps?.nota || "Proteção contra surtos no QDC"
      });
    }

    if (wago?.pacotes > 0) {
      const wag =
        find((p) => p.id === "prd-23") || find((p) => /wago/i.test(p.nome || ""));
      itens.push({
        tipo: "produto",
        refId: wag?.id || null,
        nome: wag?.nome || "Conector Wago (pct c/ 50)",
        unidade: "pct",
        qtd: wago.pacotes,
        preco: wag ? preco(wag) : 0,
        nota: wago.nota
      });
    }

    const nCirc = circuits.length;
    const quadro =
      find((p) => (nCirc <= 12 ? p.id === "prd-quadro-12" : p.id === "prd-quadro-24")) ||
      find((p) => /quadro/i.test(p.nome || ""));
    itens.push({
      tipo: "produto",
      refId: quadro?.id || null,
      nome: quadro?.nome || `Quadro (~${nCirc} circuitos)`,
      unidade: "un",
      qtd: 1,
      preco: quadro ? preco(quadro) : 0,
      nota: `${nCirc} circuitos · ${labelSistema(resolveSistema(projeto))}`
    });

    return itens;
  }

  /* ===================== UI / Editor ===================== */


export {
  dist,
  projectOnSegGlobal,
  SYM_M,
  nivelTomada,
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
