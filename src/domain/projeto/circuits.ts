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
  correntePontoA,
  tensaoEfetivaPonto,
  labelPonto,
  tipoPonto,
  modulosTomada,
  varInterruptor,
  varLampada,
  syncComandos,
  CORES_CIRCUITO,
  SNAP_M,
  POINT_LINK_M,
  CONDUIT_JOIN_M,
  interruptorUsaNeutro
} from "./types";
import {
  resolveSistema,
  labelSistema,
  normalizeTensaoPonto,
  resolvePolos,
  nCondutoresOf,
  labelPolosDj,
  condutoresColoridos,
  comprimentoCircuito3D,
  comprimentoPath3D,
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

  /** Atualiza circuitoId nos pontos (e módulos) conforme mapa antigo→novo. */
  function remapCircuitoRefs(points, map) {
    (points || []).forEach((p) => {
      if (p.circuitoId && map[p.circuitoId]) p.circuitoId = map[p.circuitoId];
      if (Array.isArray(p.modulosConfig)) {
        p.modulosConfig.forEach((m) => {
          if (m.circuitoId && map[m.circuitoId]) m.circuitoId = map[m.circuitoId];
        });
      }
    });
  }

  /**
   * Liga interruptores (e parte int. do conjugado) ao circuito de iluminação
   * das lâmpadas com a mesma letra de comando (a/b/c…).
   * Assim a fase QDC→interruptor→retorno→lâmpada entra na metragem e na marcação.
   */
  function vincularInterruptoresIluminacao(points, circuits, byId) {
    const lampCircs = (circuits || []).filter((c) => c.tipoId === "iluminacao");
    lampCircs.forEach((c) => {
      c.interruptores = Array.isArray(c.interruptores) ? c.interruptores : [];
    });

    const letrasDe = (lamp) =>
      String(lamp?.interruptor || "")
        .toLowerCase()
        .split(/[\/,;\s]+/)
        .map((c) => c.replace(/[^a-z0-9]/g, "").slice(0, 2))
        .filter(Boolean);

    (points || []).forEach((sw) => {
      if (!sw || (sw.tipo !== "interruptor" && sw.tipo !== "conjugado")) return;
      const cmds = syncComandos(sw);
      if (!cmds.length) return;

      for (const circ of lampCircs) {
        const lamps = (circ.pontos || [])
          .map((pid) => byId[pid])
          .filter((p) => p && p.tipo === "lampada");
        const hit = lamps.some((L) =>
          letrasDe(L).some((ltr) => cmds.includes(ltr))
        );
        if (!hit) continue;

        if (!circ.interruptores.includes(sw.id)) circ.interruptores.push(sw.id);
        if (!circ.pontos.includes(sw.id)) circ.pontos.push(sw.id);

        // Interruptor puro passa a pertencer ao circuito de iluminação
        if (sw.tipo === "interruptor" && !sw.circuitoManual) {
          sw.circuitoId = circ.id;
        }
        break;
      }
    });
  }

  /**
   * Renumeração sequencial C1…Cn (iluminação → TUG → TUE → cargas).
   * Evita C7/C11 “pulados” de análises antigas.
   */
  function renumerarCircuitos(circuits, points) {
    const order = { iluminacao: 1, tug: 2, tue: 3, chuveiro: 4, ar: 5, livre: 8 };
    const sorted = [...circuits].sort((a, b) => {
      const d = (order[a.tipoId] || 8) - (order[b.tipoId] || 8);
      if (d) return d;
      return (a.numero || 0) - (b.numero || 0);
    });
    circuits.length = 0;
    circuits.push(...sorted);
    const map = {};
    circuits.forEach((c, i) => {
      const novo = `C${i + 1}`;
      map[c.id] = novo;
      c.id = novo;
      c.numero = i + 1;
      c.cor = CORES_CIRCUITO[i % CORES_CIRCUITO.length];
    });
    remapCircuitoRefs(points, map);
    return map;
  }

  /** Consolida itens iguais somando quantidades. */
  function consolidarItens(itens) {
    const bag = {};
    (itens || []).forEach((it) => {
      const q = Number(it.qtd);
      if (!Number.isFinite(q) || q <= 0) return;
      const k = `${it.refId || ""}|${it.nome}|${it.unidade || "un"}`;
      if (!bag[k]) {
        bag[k] = {
          tipo: it.tipo || "produto",
          refId: it.refId || null,
          nome: it.nome,
          unidade: it.unidade || "un",
          qtd: 0,
          preco: Number(it.preco) || 0,
          notas: []
        };
      }
      bag[k].qtd += q;
      if (it.nota) bag[k].notas.push(it.nota);
      if (!bag[k].preco && it.preco) bag[k].preco = Number(it.preco) || 0;
    });
    return Object.values(bag).map((b) => ({
      tipo: b.tipo,
      refId: b.refId,
      nome: b.nome,
      unidade: b.unidade,
      qtd: b.unidade === "m" || b.unidade === "pct" ? Math.ceil(b.qtd) : Math.round(b.qtd),
      preco: b.preco,
      nota: [...new Set(b.notas)].join(" · ")
    }));
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
      if (!p.circuitoManual) {
        p.circuitoId = null;
        if (Array.isArray(p.modulosConfig)) {
          p.modulosConfig.forEach((m) => {
            if (!p.circuitoManual) m.circuitoId = "";
          });
        }
      }
    });

    let nextNum = 1;
    const circuits = [];

    // Manuais: preserva agrupamento, mas já renomeia para C1… sem herdar C11 antigo
    const manuais = {};
    const oldManualToNew = {};
    points.forEach((p) => {
      if (!p.circuitoManual || !p.circuitoId) return;
      const oldId = p.circuitoId;
      if (!oldManualToNew[oldId]) {
        const nid = `C${nextNum}`;
        oldManualToNew[oldId] = nid;
        manuais[nid] = {
          id: nid,
          numero: nextNum,
          tipoId: circKindOf(p) || "livre",
          pontos: [],
          potenciaVA: 0,
          cor: CORES_CIRCUITO[(nextNum - 1) % CORES_CIRCUITO.length],
          manual: true
        };
        nextNum++;
      }
      const nid = oldManualToNew[oldId];
      p.circuitoId = nid;
      manuais[nid].pontos.push(p.id);
      manuais[nid].potenciaVA += cargaPonto(p);
    });
    // Remapeia módulos (tomada dupla/tripla) que apontavam para IDs antigos
    points.forEach((p) => {
      if (!Array.isArray(p.modulosConfig)) return;
      p.modulosConfig.forEach((m) => {
        if (m.circuitoId && oldManualToNew[m.circuitoId]) {
          m.circuitoId = oldManualToNew[m.circuitoId];
        }
      });
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

    // Sempre C1…Cn na ordem tipológica (não herda números altos de análises antigas)
    renumerarCircuitos(circuits, points);

    // Interruptores entram no circuito de iluminação das lâmpadas que comandam (letras a/b/c…)
    vincularInterruptoresIluminacao(points, circuits, byId);

    const graph = buildGraph({ ...projeto, points });

    const conduitUse = {};
    /** Arestas únicas por circuito (para contar pontas/Wago nos nós) */
    const circEdgeMap = {}; // circId -> Map(edgeKey -> {a,b})

    function registerEdges(circId, edges) {
      if (!circEdgeMap[circId]) circEdgeMap[circId] = new Map();
      (edges || []).forEach((e) => {
        const a = Math.min(e.a, e.b);
        const b = Math.max(e.a, e.b);
        const ekey = e.conduitId ? `${e.conduitId}:${a}-${b}` : `x:${a}-${b}`;
        circEdgeMap[circId].set(ekey, { a: e.a, b: e.b });
        if (!e.conduitId) return;
        if (!conduitUse[e.conduitId]) conduitUse[e.conduitId] = {};
        conduitUse[e.conduitId][circId] = (conduitUse[e.conduitId][circId] || 0) + e.len;
      });
    }

    /** Caminho na rede entre dois pontos elétricos (snap + stubs). */
    function pathEntrePontos(idA, idB) {
      const na = graph.snap[idA];
      const nb = graph.snap[idB];
      if (na == null || nb == null || na < 0 || nb < 0) return null;
      const fromA = dijkstra(graph, na);
      if (!(fromA.distArr[nb] < Infinity)) return null;
      const edges = pathEdgesFromPrev(fromA.prev, fromA.prevEdge, nb);
      let pts = pathPointsFromPrev(graph, fromA.prev, nb);
      const pa = byId[idA];
      const pb = byId[idB];
      if (pa) pts = [{ x: pa.x, y: pa.y }, ...pts];
      if (pb) pts = [...pts, { x: pb.x, y: pb.y }];
      pts = dedupePoly(pts);
      const len =
        fromA.distArr[nb] + (graph.stub[idA] || 0) + (graph.stub[idB] || 0);
      return { len, edges, pontos: pts };
    }

    /**
     * Tomada/TUE/carga: F+N(+PE) saem do QDC pela laje entre pontos de iluminação;
     * no cômodo descem pela parede até a caixa (e seguem entre caixas na parede).
     * Escolhe a lâmpada-hub que minimiza QDC→lâmpada(laje) + lâmpada→ponto(descida).
     */
    function pathViaLajeIluminacao(destinoId) {
      if (!qdc) return null;
      const hubs = points.filter((p) => p.tipo === "lampada");
      if (!hubs.length) return pathEntrePontos(qdc.id, destinoId);

      let best = null;
      hubs.forEach((L) => {
        const laje = pathEntrePontos(qdc.id, L.id);
        const descida = pathEntrePontos(L.id, destinoId);
        if (!laje || !descida) return;
        const len = laje.len + descida.len;
        if (best && len >= best.len) return;
        best = {
          len,
          edges: [...(laje.edges || []), ...(descida.edges || [])],
          pontos: dedupePoly([...(laje.pontos || []), ...(descida.pontos || []).slice(1)]),
          lampId: L.id,
          lenLaje: laje.len,
          lenDescida: descida.len,
          pontosLaje: laje.pontos,
          pontosDescida: descida.pontos
        };
      });
      return best || pathEntrePontos(qdc.id, destinoId);
    }

    // Todas as lâmpadas do projeto (hubs de laje para tomadas)
    const lampsProjeto = points.filter((p) => p.tipo === "lampada");

    circuits.forEach((circ) => {
      let maxLen = 0;
      let sumLen = 0;
      let nPath = 0;
      let maxLaje = 0;
      let maxDescida = 0;
      circ.caminhos = [];
      const conduitesDoCirc = new Set();
      if (!circEdgeMap[circ.id]) circEdgeMap[circ.id] = new Map();

      /*
       * ILUMINAÇÃO (prática BR):
       * - Neutro (+PE): QDC → lâmpada pela laje
       * - Fase: QDC → lâmpada pela laje, desce até o interruptor
       * - Retorno: sobe do interruptor até a lâmpada
       * - Interruptor inteligente: neutro do mesmo circuito também desce até o interruptor
       */
      if (circ.tipoId === "iluminacao" && qdc) {
        const lamps = circ.pontos
          .map((pid) => byId[pid])
          .filter((p) => p && p.tipo === "lampada");
        const switches = (circ.interruptores || [])
          .map((pid) => byId[pid])
          .filter(Boolean);
        let temInteligente = false;

        lamps.forEach((lamp) => {
          const laje = pathEntrePontos(qdc.id, lamp.id);
          if (!laje) {
            if (qdc) {
              const len = dist(lamp, qdc) * 1.35;
              avisos.push(
                `Lâmpada "${labelPonto(lamp)}" sem conduíte até o QDC — comprimento estimado ×1,35.`
              );
              maxLen = Math.max(maxLen, len);
              sumLen += len;
            }
            return;
          }

          registerEdges(circ.id, laje.edges);
          laje.edges.forEach((e) => e.conduitId && conduitesDoCirc.add(e.conduitId));
          maxLaje = Math.max(maxLaje, laje.len);

          // Neutro / PE na laje (sempre)
          circ.caminhos.push({
            pontoId: lamp.id,
            pontos: laje.pontos,
            label: `${labelPonto(lamp)} · neutro (laje)`,
            via: "neutro-laje",
            papel: "neutro"
          });

          const letters = String(lamp.interruptor || "")
            .toLowerCase()
            .split(/[\/,;\s]+/)
            .map((c) => c.replace(/[^a-z0-9]/g, "").slice(0, 2))
            .filter(Boolean);
          const sws = switches.filter((sw) => {
            const cmds = syncComandos(sw);
            return letters.some((ltr) => cmds.includes(ltr));
          });

          if (!sws.length) {
            // Sem interruptor: fase segue com o neutro até a lâmpada
            circ.caminhos.push({
              pontoId: lamp.id,
              pontos: laje.pontos,
              label: `${labelPonto(lamp)} · fase (laje)`,
              via: "fase-laje",
              papel: "fase"
            });
            maxLen = Math.max(maxLen, laje.len);
            sumLen += laje.len;
            nPath++;
            return;
          }

          sws.forEach((sw) => {
            const drop = pathEntrePontos(lamp.id, sw.id);
            if (!drop) {
              avisos.push(
                `Iluminação "${labelPonto(lamp)}": sem conduíte lâmpada → ${labelPonto(sw)} (fase/retorno).`
              );
              maxLen = Math.max(maxLen, laje.len);
              return;
            }
            registerEdges(circ.id, drop.edges);
            drop.edges.forEach((e) => e.conduitId && conduitesDoCirc.add(e.conduitId));
            maxDescida = Math.max(maxDescida, drop.len);

            // Fase: QDC → lâmpada (laje) → desce ao interruptor
            const fasePts = dedupePoly([...(laje.pontos || []), ...(drop.pontos || []).slice(1)]);
            circ.caminhos.push({
              pontoId: lamp.id,
              interruptorId: sw.id,
              pontos: fasePts,
              label: `${labelPonto(lamp)} · fase via ${labelPonto(sw)}`,
              via: "fase-laje-descida",
              papel: "fase"
            });

            // Retorno: interruptor → lâmpada (mesmo trecho, sentido inverso)
            const retPts = [...(drop.pontos || [])].reverse();
            circ.caminhos.push({
              pontoId: lamp.id,
              interruptorId: sw.id,
              pontos: retPts,
              label: `${labelPonto(lamp)} · retorno de ${labelPonto(sw)}`,
              via: "retorno",
              papel: "retorno"
            });

            // Inteligente: neutro do circuito desce até o interruptor (mais metragem + ponta Wago)
            if (interruptorUsaNeutro(sw.variante)) {
              temInteligente = true;
              circ.caminhos.push({
                pontoId: lamp.id,
                interruptorId: sw.id,
                pontos: fasePts,
                label: `${labelPonto(lamp)} · neutro até ${labelPonto(sw)} (inteligente)`,
                via: "neutro-laje-descida",
                papel: "neutro"
              });
            }

            const lenFase = laje.len + drop.len;
            maxLen = Math.max(maxLen, lenFase);
            sumLen += lenFase;
            nPath++;
          });
        });

        circ.roteamento = {
          modelo: temInteligente
            ? "iluminacao-inteligente-neutro"
            : "iluminacao-laje-retorno",
          comprimentoLajeM: maxLaje,
          comprimentoDescidaM: maxDescida,
          neutroNoInterruptor: temInteligente
        };
      } else if (qdc) {
        /*
         * TOMADA / TUE / CHUVEIRO / AR:
         * F+N(+PE) pela laje entre pontos de luz; no cômodo descem à caixa;
         * entre caixas interligadas seguem na parede.
         */
        const cargaIds = circ.pontos.filter((pid) => {
          const p = byId[pid];
          return p && p.tipo !== "interruptor";
        });

        cargaIds.forEach((pid) => {
          const pt = byId[pid];
          if (!pt) return;

          let route = null;
          if (lampsProjeto.length && pt.tipo !== "lampada") {
            route = pathViaLajeIluminacao(pid);
          }
          if (!route) {
            const direto = pathEntrePontos(qdc.id, pid);
            if (direto) {
              route = {
                ...direto,
                lampId: null,
                lenLaje: direto.len,
                lenDescida: 0
              };
            }
          }

          if (route) {
            registerEdges(circ.id, route.edges);
            (route.edges || []).forEach((e) => e.conduitId && conduitesDoCirc.add(e.conduitId));
            maxLaje = Math.max(maxLaje, route.lenLaje || route.len || 0);
            maxDescida = Math.max(maxDescida, route.lenDescida || 0);
            maxLen = Math.max(maxLen, route.len);
            sumLen += route.len;
            nPath++;
            if (route.pontos && route.pontos.length >= 2) {
              circ.caminhos.push({
                pontoId: pid,
                lampHubId: route.lampId || null,
                pontos: route.pontos,
                label: route.lampId
                  ? `${labelPonto(pt)} · laje via luz → descida`
                  : labelPonto(pt),
                via: route.lampId ? "laje-descida" : "direto",
                papel: "fase-neutro-pe"
              });
            }
          } else {
            const len = dist(pt, qdc) * 1.35;
            avisos.push(
              `Ponto "${labelPonto(pt)}" sem caminho de conduíte até o QDC — comprimento estimado ×1,35.`
            );
            maxLen = Math.max(maxLen, len);
            sumLen += len;
          }
        });

        circ.roteamento = {
          modelo: "laje-descida",
          comprimentoLajeM: maxLaje,
          comprimentoDescidaM: maxDescida
        };
      } else {
        circ.pontos.forEach(() => {
          maxLen = Math.max(maxLen, 12);
          sumLen += 12;
        });
      }

      circ.conduitesIds = [...conduitesDoCirc];
      circ.comprimentoPlantaM = Math.max(maxLen, 1);
      circ.comprimentoTotalTrechosM = sumLen;
      circ.pontosComPath = nPath;

      // Potência/corrente: só pontos de carga do circuito
      // (interruptores/conjugados ligados à iluminação entram na rota, não na carga)
      const pontosCarga = circ.pontos
        .map((pid) => byId[pid])
        .filter((p) => {
          if (!p) return false;
          if (p.tipo === "interruptor") return false;
          if (circ.tipoId === "iluminacao") return p.tipo === "lampada";
          return true;
        });
      circ.potenciaVA = pontosCarga.reduce((s, p) => s + cargaPonto(p), 0);
      circ.correnteSomaA = pontosCarga.reduce((s, p) => s + correntePontoA(p), 0);

      // Tensão: UI do ponto (127/220/360) prevalece — sem forçar 220 em TUE
      const tensoesPts = pontosCarga.map((p) => tensaoEfetivaPonto(p)).filter(Boolean);
      const tensaoDefault =
        circ.tipoId === "iluminacao" || circ.tipoId === "tug" ? 127 : 220;
      let tensao = tensoesPts.length ? Math.max(...tensoesPts) : tensaoDefault;

      const polos = resolvePolos(sistema, tensao);
      const fasesCirc = polos >= 3 ? 3 : 1;
      const incluiPe = true;
      const nCond = condutoresColoridos(polos, incluiPe).length;

      // Comprimento 3D pelos caminhos (planta + sobe/desce PD ↔ altura caixa)
      const len3d = comprimentoCircuito3D(
        { ...circ, comprimentoM: circ.comprimentoPlantaM },
        { ...projeto, points, peDireitoM: projeto.peDireitoM },
        byId
      );
      circ.comprimentoM = len3d;

      const nPontosCarga = pontosCarga.length;
      const nAgr = (() => {
        const set = new Set([circ.id]);
        (circ.conduitesIds || []).forEach((eid) => {
          Object.keys(conduitUse[eid] || {}).forEach((cid) => set.add(cid));
        });
        return Math.max(1, set.size);
      })();
      const agrupamentoId =
        typeof NBR5410.agrupamentoIdFromN === "function"
          ? NBR5410.agrupamentoIdFromN(nAgr)
          : nAgr >= 8
            ? "8+"
            : nAgr >= 4
              ? "4-5"
              : nAgr >= 2
                ? "2-3"
                : "1";

      const dimOpts = {
        tipoId: circ.tipoId || "livre",
        potenciaW: circ.potenciaVA,
        tensaoV: tensao,
        fases: fasesCirc,
        polos,
        nCondutores: nCond,
        comprimentoM: circ.comprimentoM,
        nPontos: nPontosCarga,
        agrupamentoId,
        tempId: "30",
        dr: circ.tipoId === "tug" || circ.tipoId === "chuveiro" || circ.tipoId === "tue",
        // TUE: máx. 4 mm² no borne; chuveiro/ar sem teto
        secaoMax: circ.tipoId === "tue" ? 4 : null
      };

      const dim =
        typeof NBR5410 !== "undefined" ? NBR5410.dimensionar(dimOpts) : null;

      circ.tensaoV = tensao;
      circ.dimensionamento = dim;
      circ.agrupamentoId = agrupamentoId;
      circ.nAgrupados = nAgr;

      // Metragem 3D por papel (a partir dos caminhos reais)
      const pd = Math.max(2.2, Number(projeto.peDireitoM) || 2.8);
      const proj3d = { ...projeto, points, peDireitoM: pd };
      let mLaje = 0;
      let mNeutro = 0;
      let mFase = 0;
      let mRetorno = 0;
      (circ.caminhos || []).forEach((cam) => {
        const L = comprimentoPath3D(cam.pontos || [], proj3d, pd);
        if (!L) return;
        if (cam.via === "neutro-laje") mLaje = Math.max(mLaje, L);
        if (cam.papel === "neutro") mNeutro = Math.max(mNeutro, L);
        if (cam.papel === "fase" || cam.via === "fase-laje" || cam.via === "fase-laje-descida") {
          mFase = Math.max(mFase, L);
        }
        if (cam.papel === "retorno" || cam.via === "retorno") mRetorno = Math.max(mRetorno, L);
        if (cam.via === "laje-descida" || cam.via === "direto") mFase = Math.max(mFase, L);
      });
      if (!mNeutro) mNeutro = mLaje;
      if (circ.roteamento) {
        circ.roteamento.comprimentoLajeM = mLaje || circ.roteamento.comprimentoLajeM;
        circ.roteamento.comprimentoDescidaM = mRetorno || circ.roteamento.comprimentoDescidaM;
        circ.roteamento.comprimentoNeutroM = mNeutro;
      }

      const baseConds = condutoresColoridos(polos, incluiPe);
      const mPadrao = Math.ceil((circ.comprimentoM || 0) * 1.1);
      if (circ.tipoId === "iluminacao" && mRetorno > 0.05) {
        circ.condutores = baseConds.map((c) => {
          const papel = String(c.papel || "").toLowerCase();
          if (papel.includes("fase")) {
            return { ...c, metros: Math.ceil((mFase || circ.comprimentoM) * 1.1) };
          }
          if (papel.includes("neutro")) {
            // Inteligente: neutro desce ao interruptor → metragem maior
            return { ...c, metros: Math.ceil((mNeutro || mLaje || circ.comprimentoM) * 1.1) };
          }
          // PE permanece na laje até a lâmpada
          return { ...c, metros: Math.ceil((mLaje || circ.comprimentoM) * 1.1) };
        });
        circ.condutores.push({
          papel: "Retorno",
          cor: "branco",
          corLabel: "branco",
          metros: Math.ceil(mRetorno * 1.1)
        });
      } else {
        circ.condutores = baseConds.map((c) => ({ ...c, metros: mPadrao }));
      }
      if (dim) {
        circ.bitola = dim.cabo.secao;
        circ.disjuntor = dim.disjuntor.In;
        circ.polos = polos;
        if (dim.disjuntor) dim.disjuntor.polos = polos;
        circ.curva = dim.disjuntor.curva;
        // Ib: usa soma das correntes dos pontos se maior que Ib da potência total
        const ibPot = dim.ib;
        const ibSoma = circ.correnteSomaA || 0;
        circ.ib = Math.max(ibPot, ibSoma);
        // Se soma de correntes exige DJ/cabo maior, redimensiona
        if (ibSoma > ibPot + 0.05) {
          const dim2 = NBR5410.dimensionar({
            ...dimOpts,
            potenciaW: Math.max(circ.potenciaVA, ibSoma * tensao)
          });
          if (dim2) {
            circ.dimensionamento = dim2;
            circ.bitola = dim2.cabo.secao;
            circ.disjuntor = dim2.disjuntor.In;
            circ.curva = dim2.disjuntor.curva;
            circ.ib = Math.max(dim2.ib, ibSoma);
            circ.quedaPct = dim2.queda.pct;
            circ.eletroduto = dim2.eletroduto;
            circ.dr = dim2.dr;
            circ.avisos = dim2.avisos || [];
            circ.precisaDividirCircuito = !!dim2.precisaDividirCircuito;
            if (dim2.disjuntor) dim2.disjuntor.polos = polos;
          }
        } else {
          circ.quedaPct = dim.queda.pct;
          circ.eletroduto = dim.eletroduto;
          circ.dr = dim.dr;
          circ.avisos = dim.avisos || [];
          circ.precisaDividirCircuito = !!dim.precisaDividirCircuito;
        }
        if (circ.precisaDividirCircuito) {
          avisos.push(
            `${circ.id} (TUE): corrente acima da capacidade de 4 mm² com agrupamento — divida o circuito ou reduza fatores (tensão/agrupamento).`
          );
        }
        circ.metrosPorCondutor = Math.ceil(circ.comprimentoM * 1.1);
      } else {
        circ.polos = polos;
        circ.ib = circ.correnteSomaA || 0;
        circ.metrosPorCondutor = Math.ceil(circ.comprimentoM * 1.1);
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

    // Pontas de cabo por nó/circuito (arestas incidentes únicas do caminho)
    const nodeEdgeEnds = {};
    Object.entries(circEdgeMap).forEach(([cid, map]) => {
      nodeEdgeEnds[cid] = {};
      map.forEach((e) => {
        nodeEdgeEnds[cid][e.a] = (nodeEdgeEnds[cid][e.a] || 0) + 1;
        nodeEdgeEnds[cid][e.b] = (nodeEdgeEnds[cid][e.b] || 0) + 1;
      });
    });

    const balanceamento = balancearCargas(circuits, sistema);
    avisos.push(...(balanceamento.avisos || []));

    const protecao = dimensionarProtecao(circuits, sistema, balanceamento);
    const wago = contarWagos({ ...projeto, points: pointsOut }, graph, circuits, nodeEdgeEnds);

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
      peDireitoM: Math.max(2.2, Number(projeto.peDireitoM) || 2.8),
      aterramento: projeto.aterramento !== false,
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
    /** Agrega: secao|cor|papel → metros */
    const metrosCaboDet = {};
    let metrosEletroduto = 0;
    const peDireito = Math.max(2.2, Number(projeto.peDireitoM) || 2.8);
    const temAterramento = projeto.aterramento !== false;

    (projeto.conduits || []).forEach((c) => {
      metrosEletroduto += polylineLength(c.points || []);
    });

    circuits.forEach((circ) => {
      const dim = circ.dimensionamento;
      if (!dim && !circ.bitola) return;
      const secao = dim?.cabo?.secao || circ.bitola;
      const metros1 = Number(circ.metrosPorCondutor) || Math.ceil((circ.comprimentoM || 0) * 1.1);
      const conds = circ.condutores || condutoresColoridos(circ.polos || 1, true);
      conds.forEach((c) => {
        const k = `${secao}|${c.cor}|${c.papel}`;
        if (!metrosCaboDet[k]) {
          metrosCaboDet[k] = {
            secao,
            cor: c.cor,
            corLabel: c.corLabel,
            papel: c.papel,
            metros: 0,
            circs: []
          };
        }
        const m = Number(c.metros) > 0 ? Math.ceil(c.metros) : metros1;
        metrosCaboDet[k].metros += m;
        if (!metrosCaboDet[k].circs.includes(circ.id)) metrosCaboDet[k].circs.push(circ.id);
      });
    });

    Object.values(metrosCaboDet)
      .sort((a, b) => Number(a.secao) - Number(b.secao) || a.papel.localeCompare(b.papel))
      .forEach((row) => {
        const id = caboMap[Number(row.secao)];
        const prod = id ? find((p) => p.id === id) : null;
        const m = Math.ceil(row.metros);
        itens.push({
          tipo: "produto",
          refId: prod?.id || null,
          nome: `Cabo ${row.secao} mm² ${row.corLabel} — ${row.papel}`,
          unidade: "m",
          qtd: m,
          preco: prod ? preco(prod) / 100 : 0,
          bitola: row.secao,
          cor: row.corLabel,
          papel: row.papel,
          nota: `${row.circs.join(", ")} · PD ${peDireito.toFixed(2)} m · +10% · NBR 5410`
        });
      });

    // Cabo PE de aterramento do local (haste → QDC) quando não há aterramento
    if (!temAterramento && circuits.length) {
      const peExtra = Math.ceil(peDireito * 2 + 5); // descida + margem até haste
      const prodPe = find((p) => p.id === "prd-12") || find((p) => p.id === "prd-11");
      itens.push({
        tipo: "produto",
        refId: prodPe?.id || null,
        nome: "Cabo 6 mm² verde-amarelo — aterramento (haste → QDC)",
        unidade: "m",
        qtd: peExtra,
        preco: prodPe ? preco(prodPe) / 100 : 0,
        bitola: 6,
        cor: "verde-amarelo",
        papel: "PE aterramento",
        nota: "Local sem aterramento — passar cabo PE até o QDC"
      });
    }

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

    // Disjuntores de circuito — agregados por tipo/In com quantidade real
    const bagDj = {};
    circuits.forEach((circ) => {
      if (!circ.dimensionamento) return;
      const In = circ.disjuntor;
      const polos = circ.polos || 1;
      const curva = circ.curva || "C";
      const k = `${polos}|${In}|${curva}`;
      if (!bagDj[k]) {
        const dj =
          polos >= 3
            ? find((p) => /tripolar/i.test(p.nome || ""))
            : polos >= 2
              ? find((p) => p.id === "prd-7") || find((p) => /bipolar/i.test(p.nome || ""))
              : find((p) => p.id === "prd-6") || find((p) => /monopolar/i.test(p.nome || ""));
        bagDj[k] = {
          polos,
          In,
          curva,
          qtd: 0,
          circs: [],
          bitolas: [],
          refId: dj?.id || null,
          preco: dj ? preco(dj) : 0
        };
      }
      bagDj[k].qtd += 1;
      bagDj[k].circs.push(circ.id);
      if (circ.bitola) {
        bagDj[k].bitolas.push(
          `${circ.id}: ${circ.bitola} mm² · ${circ.tensaoV || "—"} V`
        );
      }
    });
    Object.values(bagDj).forEach((d) => {
      itens.push({
        tipo: "produto",
        refId: d.refId,
        nome: `Disjuntor ${labelPolosDj(d.polos)} ${d.In}A curva ${d.curva}`,
        unidade: "un",
        qtd: d.qtd,
        preco: d.preco,
        nota: `${d.circs.join(", ")} · ${d.bitolas.join("; ")}`
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

    // IDR: um por quadro
    if (protecao?.idr || protecao?.drs?.length) {
      const idr = protecao.idr || protecao.drs[0];
      const drProd =
        find((p) => p.id === "prd-8") ||
        find((p) => /\bdr\b|idr|diferencial/i.test(p.nome || ""));
      itens.push({
        tipo: "produto",
        refId: drProd?.id || null,
        nome: idr.nome,
        unidade: "un",
        qtd: 1,
        preco: drProd ? preco(drProd) : 0,
        nota: idr.nota || "Um por QDC · 30 mA · NBR 5410"
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

    // Wago separados por pólos (2 / 3 / 5 / 10)
    const wagoMap = {
      2: "prd-wago-2",
      3: "prd-wago-3",
      5: "prd-wago-5",
      10: "prd-wago-10"
    };
    if (wago?.porPolos) {
      [2, 3, 5, 10].forEach((pol) => {
        const qtd = Number(wago.porPolos[pol]) || 0;
        if (qtd <= 0) return;
        const refId = wagoMap[pol];
        const prod =
          find((p) => p.id === refId) ||
          find((p) => new RegExp(`wago.*${pol}\\s*p`, "i").test(p.nome || ""));
        itens.push({
          tipo: "produto",
          refId: prod?.id || refId,
          nome: prod?.nome || `Conector Wago ${pol} pólos`,
          unidade: "un",
          qtd,
          preco: prod ? preco(prod) : 0,
          nota: `${wago.caixas || 0} caixa(s) · ${wago.juncoes || 0} junção(ões) · caminhos da rede`
        });
      });
    }

    const nCirc = circuits.length;
    const quadro =
      find((p) => (nCirc <= 12 ? p.id === "prd-quadro-12" : p.id === "prd-quadro-24")) ||
      find((p) => /quadro/i.test(p.nome || ""));
    itens.push({
      tipo: "produto",
      refId: quadro?.id || null,
      nome: quadro?.nome || `Quadro de distribuição`,
      unidade: "un",
      qtd: 1,
      preco: quadro ? preco(quadro) : 0,
      nota: `${nCirc} circuito(s) · ${labelSistema(resolveSistema(projeto))}`
    });

    return consolidarItens(itens);
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
  renumerarCircuitos,
  consolidarItens,
  analisar,
  montarMateriais
};
