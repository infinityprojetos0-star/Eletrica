/**
 * Projeto Elétrico (planta + conduítes manuais) — auxiliar NBR 5410
 *
 * Fluxo: planta baixa → pontos → conduítes → análise (circuitos, bitolas, caminhos) → materiais.
 * NÃO substitui projeto assinado por profissional habilitado (CREA/CFT).
 */
var ProjetoEletrico = (() => {
  const PPM_DEFAULT = 48;
  const SNAP_M = 0.35;
  const GRID_M = 0.5;

  const CORES_CIRCUITO = [
    "#e53935",
    "#1e88e5",
    "#43a047",
    "#fb8c00",
    "#8e24aa",
    "#00acc1",
    "#6d4c41",
    "#f4511e",
    "#3949ab",
    "#00897b",
    "#c0ca33",
    "#5e35b1"
  ];

  const TIPOS_PONTO = [
    {
      id: "lampada",
      label: "Lâmpada",
      simb: "L",
      tipoCirc: "iluminacao",
      potDefault: 20,
      tensaoDefault: 127,
      unidade: "VA"
    },
    {
      id: "interruptor",
      label: "Interruptor",
      simb: "S",
      tipoCirc: null,
      potDefault: 0,
      tensaoDefault: 127
    },
    {
      id: "tug",
      label: "Tomada TUG",
      simb: "T",
      tipoCirc: "tug",
      potDefault: 100,
      tensaoDefault: 127,
      unidade: "VA"
    },
    {
      id: "tue",
      label: "Tomada TUE",
      simb: "E",
      tipoCirc: "tue",
      potDefault: 2000,
      tensaoDefault: 220,
      unidade: "W"
    },
    {
      id: "chuveiro",
      label: "Chuveiro",
      simb: "CH",
      tipoCirc: "chuveiro",
      potDefault: 5500,
      tensaoDefault: 220,
      unidade: "W"
    },
    {
      id: "ar",
      label: "Ar-condicionado",
      simb: "AC",
      tipoCirc: "ar",
      potDefault: 3500,
      tensaoDefault: 220,
      unidade: "W"
    },
    { id: "qdc", label: "QDC", simb: "QDC", tipoCirc: null, potDefault: 0, tensaoDefault: 220 }
  ];

  function tipoPonto(id) {
    return TIPOS_PONTO.find((t) => t.id === id) || TIPOS_PONTO[0];
  }

  function createEmpty(nome = "Novo projeto", uso = "residencial") {
    return {
      id: typeof uid === "function" ? uid("pe") : `pe-${Date.now()}`,
      nome,
      uso: uso === "comercial" ? "comercial" : "residencial",
      rooms: [],
      points: [],
      conduits: [],
      lastAnalise: null,
      criadoEm: typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10),
      updatedAt: Date.now()
    };
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function polylineLength(verts) {
    let L = 0;
    for (let i = 1; i < verts.length; i++) L += dist(verts[i - 1], verts[i]);
    return L;
  }

  /** Grafo a partir dos conduítes (vértices + pontos elétricos encaixados) */
  function buildGraph(projeto) {
    const nodes = [];
    const edges = [];
    const key = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    const indexOf = (p) => {
      const k = key(p);
      let i = nodes.findIndex((n) => key(n) === k);
      if (i < 0) {
        i = nodes.length;
        nodes.push({ x: p.x, y: p.y });
      }
      return i;
    };

    (projeto.conduits || []).forEach((c, ci) => {
      const verts = c.points || [];
      for (let i = 0; i < verts.length; i++) {
        const a = indexOf(verts[i]);
        if (i > 0) {
          const b = indexOf(verts[i - 1]);
          const len = dist(verts[i - 1], verts[i]);
          edges.push({ a: b, b: a, len, conduitId: c.id, seg: i - 1 });
        }
      }
      c._nodeIdx = verts.map(indexOf);
    });

    const snap = {};
    (projeto.points || []).forEach((pt) => {
      let best = -1;
      let bestD = SNAP_M;
      nodes.forEach((n, i) => {
        const d = dist(pt, n);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) {
        best = indexOf(pt);
      }
      snap[pt.id] = best;
    });

    return { nodes, edges, snap };
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

  function packCircuits(items, maxPontos, maxPotVA, tipoId, startNum) {
    const circuits = [];
    let cur = null;
    let num = startNum;
    items.forEach((pt) => {
      const pot = Number(pt.potenciaVA || pt.potenciaW || 0);
      const needNew =
        !cur ||
        cur.pontos.length >= maxPontos ||
        (maxPotVA > 0 && cur.potenciaVA + pot > maxPotVA);
      if (needNew) {
        cur = {
          id: `C${num}`,
          numero: num,
          tipoId,
          pontos: [],
          potenciaVA: 0,
          cor: CORES_CIRCUITO[(num - 1) % CORES_CIRCUITO.length]
        };
        circuits.push(cur);
        num++;
      }
      cur.pontos.push(pt.id);
      cur.potenciaVA += pot;
      pt.circuitoId = cur.id;
    });
    return { circuits, nextNum: num };
  }

  /**
   * Analisa planta + conduítes → circuitos, dimensionamento NBR 5410, materiais.
   */
  function analisar(projeto, { produtos, modoPreco } = {}) {
    const uso = projeto.uso === "comercial" ? "comercial" : "residencial";
    const lim =
      (typeof PreProjeto !== "undefined" && PreProjeto.LIMITES?.[uso]) || {
        pontosIlumPorCircuito: 10,
        tug10PorCircuito: 8,
        potIlumPorPontoVA: 100,
        potTug10VA: 100
      };

    const points = (projeto.points || []).map((p) => ({ ...p }));
    const byId = Object.fromEntries(points.map((p) => [p.id, p]));
    const avisos = [];
    const qdc = points.find((p) => p.tipo === "qdc");
    if (!qdc) avisos.push("Inclua um QDC na planta para dimensionar os caminhos dos circuitos.");

    // Respeita circuito manual; limpa auto em pontos sem override
    points.forEach((p) => {
      if (!p.circuitoManual) p.circuitoId = null;
    });

    let nextNum = 1;
    const circuits = [];

    // Manuais primeiro — agrupa
    const manuais = {};
    points.forEach((p) => {
      if (!p.circuitoManual || !p.circuitoId) return;
      if (!manuais[p.circuitoId]) {
        const num = parseInt(String(p.circuitoId).replace(/\D/g, ""), 10) || nextNum;
        manuais[p.circuitoId] = {
          id: p.circuitoId,
          numero: num,
          tipoId: tipoPonto(p.tipo).tipoCirc || "livre",
          pontos: [],
          potenciaVA: 0,
          cor: CORES_CIRCUITO[(num - 1) % CORES_CIRCUITO.length],
          manual: true
        };
        nextNum = Math.max(nextNum, num + 1);
      }
      manuais[p.circuitoId].pontos.push(p.id);
      manuais[p.circuitoId].potenciaVA += Number(p.potenciaVA || 0);
    });
    Object.values(manuais).forEach((c) => circuits.push(c));

    const livre = (tipo) =>
      points.filter((p) => p.tipo === tipo && !p.circuitoId && tipoPonto(tipo).tipoCirc);

    let r = packCircuits(
      livre("lampada"),
      lim.pontosIlumPorCircuito,
      uso === "comercial" ? 1500 : 1200,
      "iluminacao",
      nextNum
    );
    circuits.push(...r.circuits);
    nextNum = r.nextNum;

    r = packCircuits(livre("tug"), lim.tug10PorCircuito, 1270, "tug", nextNum);
    circuits.push(...r.circuits);
    nextNum = r.nextNum;

    ["tue", "chuveiro", "ar"].forEach((tipo) => {
      livre(tipo).forEach((pt) => {
        const c = {
          id: `C${nextNum}`,
          numero: nextNum,
          tipoId: tipoPonto(tipo).tipoCirc,
          pontos: [pt.id],
          potenciaVA: Number(pt.potenciaVA || 0),
          cor: CORES_CIRCUITO[(nextNum - 1) % CORES_CIRCUITO.length]
        };
        pt.circuitoId = c.id;
        circuits.push(c);
        nextNum++;
      });
    });

    const graph = buildGraph({ ...projeto, points });
    const qdcNode = qdc ? graph.snap[qdc.id] : -1;
    const fromQdc =
      qdcNode >= 0 ? dijkstra(graph, qdcNode) : { distArr: [], prev: [], prevEdge: [] };

    const conduitUse = {}; // conduitId -> { circuitId: meters }
    circuits.forEach((circ) => {
      let maxLen = 0;
      let sumLen = 0;
      let nPath = 0;
      circ.pontos.forEach((pid) => {
        const pt = byId[pid];
        if (!pt) return;
        const ni = graph.snap[pid];
        let len = 0;
        if (qdcNode >= 0 && ni >= 0 && fromQdc.distArr[ni] < Infinity) {
          len = fromQdc.distArr[ni];
          const edges = pathEdgesFromPrev(fromQdc.prev, fromQdc.prevEdge, ni);
          edges.forEach((e) => {
            if (!e.conduitId) return;
            if (!conduitUse[e.conduitId]) conduitUse[e.conduitId] = {};
            conduitUse[e.conduitId][circ.id] =
              (conduitUse[e.conduitId][circ.id] || 0) + e.len;
          });
          nPath++;
        } else {
          if (qdc) {
            len = dist(pt, qdc) * 1.35;
            avisos.push(
              `Ponto "${pt.label || tipoPonto(pt.tipo).label}" sem caminho de conduíte até o QDC — comprimento estimado em linha reta ×1,35.`
            );
          } else {
            len = 12;
          }
        }
        maxLen = Math.max(maxLen, len);
        sumLen += len;
      });
      circ.comprimentoM = Math.max(maxLen, 1);
      circ.comprimentoTotalTrechosM = sumLen;
      circ.pontosComPath = nPath;

      const potW =
        circ.tipoId === "iluminacao" || circ.tipoId === "tug"
          ? circ.potenciaVA
          : circ.potenciaVA;
      const tensao =
        circ.tipoId === "iluminacao" || circ.tipoId === "tug"
          ? Number(byId[circ.pontos[0]]?.tensaoV || 127)
          : Number(byId[circ.pontos[0]]?.tensaoV || 220);

      const dim =
        typeof NBR5410 !== "undefined"
          ? NBR5410.dimensionar({
              tipoId: circ.tipoId || "livre",
              potenciaW: potW,
              tensaoV: tensao,
              comprimentoM: circ.comprimentoM,
              agrupamentoId: circuits.length >= 8 ? "8+" : circuits.length >= 4 ? "4-5" : circuits.length >= 2 ? "2-3" : "1",
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

    // Marca conduítes com circuito dominante
    const conduits = (projeto.conduits || []).map((c) => {
      const use = conduitUse[c.id] || {};
      let best = c.circuitoId || null;
      let bestM = 0;
      Object.entries(use).forEach(([cid, m]) => {
        if (m > bestM) {
          bestM = m;
          best = cid;
        }
      });
      const circ = circuits.find((x) => x.id === best);
      return {
        ...c,
        circuitoId: best,
        cor: circ?.cor || "#222"
      };
    });

    // Sync circuit ids back onto original-shaped points
    const pointsOut = (projeto.points || []).map((orig) => {
      const p = byId[orig.id];
      return p ? { ...orig, circuitoId: p.circuitoId } : orig;
    });

    const materiais = montarMateriais(
      { ...projeto, points: pointsOut, conduits },
      circuits,
      produtos,
      modoPreco || "medio"
    );

    const disclaimer =
      "Cálculos auxiliares com base em critérios simplificados da NBR 5410 (capacidade de condução PVC 70 °C método B1, seções mínimas, disjuntor, queda ≈4%/7%, DR em áreas molhadas/TUG). Não substitui projeto elétrico oficial.";

    return {
      uso,
      circuits,
      conduits,
      points: pointsOut,
      materiais,
      avisos: [...new Set(avisos)],
      disclaimer,
      geradoEm: new Date().toISOString()
    };
  }

  function montarMateriais(projeto, circuits, produtos, modo) {
    const itens = [];
    const list = produtos || [];
    const find = (pred) => list.find(pred);
    const preco = (p) =>
      typeof getPrecoByModo === "function" ? getPrecoByModo(p, modo) : Number(p?.preco || 0);

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
      metrosPorSecao[s] = (metrosPorSecao[s] || 0) + (dim.metrosCabo || circ.comprimentoM * dim.nCondutores);
    });

    Object.entries(metrosPorSecao).forEach(([secao, metros]) => {
      const id = caboMap[Number(secao)];
      const prod = id ? find((p) => p.id === id) : null;
      const m = Math.ceil(metros * 1.1); // 10% folga
      if (prod) {
        itens.push({
          tipo: "produto",
          refId: prod.id,
          nome: `${prod.nome}`,
          unidade: "m",
          qtd: m,
          preco: preco(prod) / 100,
          nota: `${secao} mm² · NBR 5410 · +10% folga`
        });
      } else {
        itens.push({
          tipo: "produto",
          refId: null,
          nome: `Cabo flexível ${secao} mm²`,
          unidade: "m",
          qtd: m,
          preco: 0,
          nota: "Fora do catálogo — informe preço"
        });
      }
    });

    if (metrosEletroduto > 0) {
      const eletro =
        find((p) => /eletroduto|corflex|conduit/i.test(p.nome || "")) ||
        find((p) => p.id === "prd-15");
      const q = Math.ceil(metrosEletroduto * 1.15);
      itens.push({
        tipo: "produto",
        refId: eletro?.id || null,
        nome: eletro?.nome || 'Eletroduto / Corflex 3/4"',
        unidade: "m",
        qtd: q,
        preco: eletro ? preco(eletro) : 0,
        nota: "Comprimento dos conduítes traçados +15%"
      });
    }

    const contagem = { lampada: 0, interruptor: 0, tug: 0, tue: 0, chuveiro: 0, ar: 0, qdc: 0 };
    (projeto.points || []).forEach((p) => {
      if (contagem[p.tipo] != null) contagem[p.tipo]++;
    });

    const addUn = (nomeFallback, pred, qtd, nota) => {
      if (!qtd) return;
      const prod = find(pred);
      itens.push({
        tipo: "produto",
        refId: prod?.id || null,
        nome: prod?.nome || nomeFallback,
        unidade: "un",
        qtd,
        preco: prod ? preco(prod) : 0,
        nota
      });
    };

    addUn("Tomada 10A", (p) => p.id === "prd-1" || /tomada.*10/i.test(p.nome || ""), contagem.tug, "TUG");
    addUn("Tomada 20A", (p) => p.id === "prd-2" || /tomada.*20/i.test(p.nome || ""), contagem.tue, "TUE");
    addUn(
      "Interruptor simples",
      (p) => p.id === "prd-3" || /interruptor/i.test(p.nome || ""),
      contagem.interruptor,
      ""
    );
    addUn(
      "Caixa 4x2",
      (p) => /caixa.*4/i.test(p.nome || "") || p.id === "prd-16",
      contagem.tug + contagem.tue + contagem.interruptor + contagem.lampada,
      "Pontos de caixa"
    );

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

    const precisaDr = circuits.some((c) => c.dr);
    if (precisaDr) {
      addUn("DR 30 mA", (p) => p.id === "prd-8" || /\bdr\b|diferencial/i.test(p.nome || ""), 1, "NBR 5410 — áreas molhadas / TUG");
    }
    addUn("DPS", (p) => p.id === "prd-9" || /\bdps\b/i.test(p.nome || ""), 1, "Proteção contra surtos (recomendado)");

    const nCirc = circuits.length;
    const quadroId = nCirc <= 12 ? "prd-quadro-12" : nCirc <= 24 ? "prd-quadro-24" : null;
    const quadro =
      (quadroId && find((p) => p.id === quadroId)) ||
      find((p) => /quadro/i.test(p.nome || ""));
    if (contagem.qdc || nCirc) {
      itens.push({
        tipo: "produto",
        refId: quadro?.id || null,
        nome: quadro?.nome || `Quadro de distribuição (~${nCirc} circuitos)`,
        unidade: "un",
        qtd: 1,
        preco: quadro ? preco(quadro) : 0,
        nota: `${nCirc} circuitos dimensionados`
      });
    }

    return itens;
  }

  /* ===================== UI / Editor ===================== */

  function mount(root, ctx) {
    let projeto = JSON.parse(JSON.stringify(ctx.projeto));
    let tool = "select";
    let placeTipo = "lampada";
    let ppm = PPM_DEFAULT;
    let pan = { x: 40, y: 40 };
    let drag = null;
    let conduitDraft = null;
    let selectedId = null;
    let selectedKind = null; // room | point | conduit
    let hover = null;
    let spacePan = false;

    const save = () => {
      projeto.updatedAt = Date.now();
      ctx.onSave?.(projeto);
    };

    const worldFromEvent = (e, canvas) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left - pan.x) / ppm;
      const y = (e.clientY - r.top - pan.y) / ppm;
      const gx = Math.round(x / GRID_M) * GRID_M;
      const gy = Math.round(y / GRID_M) * GRID_M;
      return { x: gx, y: gy, rawX: x, rawY: y };
    };

    function runAnalise() {
      const analise = analisar(projeto, {
        produtos: ctx.produtos,
        modoPreco: ctx.precoModo
      });
      projeto.points = analise.points;
      projeto.conduits = analise.conduits;
      projeto.lastAnalise = analise;
      save();
      paint();
      renderSide();
      ctx.toast?.(`Análise NBR 5410: ${analise.circuits.length} circuito(s)`);
    }

    function renderShell() {
      root.innerHTML = `
        <div class="pe-app">
          <div class="pe-toolbar">
            <button type="button" class="btn btn-ghost btn-sm" id="peBack">← Projetos</button>
            <input class="pe-title" id="peNome" value="${escapeHtml(projeto.nome)}" />
            <select id="peUso" class="pe-select">
              <option value="residencial" ${projeto.uso === "residencial" ? "selected" : ""}>Residencial</option>
              <option value="comercial" ${projeto.uso === "comercial" ? "selected" : ""}>Comercial</option>
            </select>
            <div class="pe-tools" id="peTools">
              <button type="button" data-tool="select" class="pe-tool active" title="Selecionar">Selecionar</button>
              <button type="button" data-tool="room" class="pe-tool" title="Cômodo">Cômodo</button>
              <button type="button" data-tool="conduit" class="pe-tool" title="Conduíte">Conduíte</button>
              <button type="button" data-tool="place" data-tipo="lampada" class="pe-tool" title="Lâmpada">💡</button>
              <button type="button" data-tool="place" data-tipo="interruptor" class="pe-tool" title="Interruptor">⏻</button>
              <button type="button" data-tool="place" data-tipo="tug" class="pe-tool" title="TUG">TUG</button>
              <button type="button" data-tool="place" data-tipo="tue" class="pe-tool" title="TUE">TUE</button>
              <button type="button" data-tool="place" data-tipo="chuveiro" class="pe-tool" title="Chuveiro">CH</button>
              <button type="button" data-tool="place" data-tipo="ar" class="pe-tool" title="Ar">AC</button>
              <button type="button" data-tool="place" data-tipo="qdc" class="pe-tool" title="QDC">QDC</button>
              <button type="button" data-tool="delete" class="pe-tool danger" title="Apagar">Apagar</button>
            </div>
            <div class="pe-actions">
              <button type="button" class="btn btn-secondary btn-sm" id="peZoomOut">−</button>
              <button type="button" class="btn btn-secondary btn-sm" id="peZoomIn">+</button>
              <button type="button" class="btn btn-primary btn-sm" id="peAnalisar">Analisar NBR 5410</button>
            </div>
          </div>
          <div class="pe-body">
            <div class="pe-canvas-wrap">
              <canvas id="peCanvas" width="900" height="560"></canvas>
              <div class="pe-hint" id="peHint">Grade ${GRID_M} m · Ferramenta: selecionar · Espaço+arrastar = pan</div>
            </div>
            <aside class="pe-side" id="peSide"></aside>
          </div>
        </div>
      `;
      bindChrome();
      resizeCanvas();
      paint();
      renderSide();
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    }

    function setTool(t, tipo) {
      tool = t;
      if (tipo) placeTipo = tipo;
      conduitDraft = null;
      root.querySelectorAll(".pe-tool").forEach((btn) => {
        const active =
          btn.dataset.tool === tool &&
          (tool !== "place" || btn.dataset.tipo === placeTipo);
        btn.classList.toggle("active", active);
      });
      const labels = {
        select: "selecionar (clique para editar)",
        room: "cômodo — arraste no grid",
        conduit: "conduíte — clique nos vértices, duplo clique ou Enter para terminar",
        place: `inserir ${tipoPonto(placeTipo).label}`,
        delete: "apagar — clique no elemento"
      };
      const hint = root.querySelector("#peHint");
      if (hint) hint.textContent = `Grade ${GRID_M} m · ${labels[tool] || tool}`;
    }

    function bindChrome() {
      root.querySelector("#peBack").onclick = () => {
        save();
        ctx.onBack?.();
      };
      root.querySelector("#peNome").onchange = (e) => {
        projeto.nome = e.target.value.trim() || projeto.nome;
        save();
      };
      root.querySelector("#peUso").onchange = (e) => {
        projeto.uso = e.target.value;
        save();
      };
      root.querySelector("#peTools").onclick = (e) => {
        const btn = e.target.closest("[data-tool]");
        if (!btn) return;
        setTool(btn.dataset.tool, btn.dataset.tipo);
      };
      root.querySelector("#peZoomIn").onclick = () => {
        ppm = Math.min(120, ppm * 1.15);
        paint();
      };
      root.querySelector("#peZoomOut").onclick = () => {
        ppm = Math.max(16, ppm / 1.15);
        paint();
      };
      root.querySelector("#peAnalisar").onclick = runAnalise;

      const canvas = root.querySelector("#peCanvas");
      canvas.addEventListener("mousedown", onDown);
      canvas.addEventListener("mousemove", onMove);
      canvas.addEventListener("mouseup", onUp);
      canvas.addEventListener("dblclick", onDbl);
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          ppm = Math.max(16, Math.min(120, ppm * (e.deltaY > 0 ? 0.9 : 1.1)));
          paint();
        },
        { passive: false }
      );
      window.addEventListener("keydown", onKey);
    }

    function onKey(e) {
      if (root.closest("body") && !document.body.contains(root)) return;
      if (!document.body.contains(root)) return;
      if (e.key === "Enter" && tool === "conduit" && conduitDraft?.points?.length >= 2) {
        finishConduit();
      }
      if (e.key === "Escape") {
        conduitDraft = null;
        drag = null;
        paint();
      }
      if (e.key === " " ) spacePan = true;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA")
          return;
        deleteSelected();
      }
    }
    window.addEventListener("keyup", (e) => {
      if (e.key === " ") spacePan = false;
    });

    function finishConduit() {
      if (!conduitDraft || conduitDraft.points.length < 2) {
        conduitDraft = null;
        paint();
        return;
      }
      projeto.conduits.push({
        id: typeof uid === "function" ? uid("cd") : `cd-${Date.now()}`,
        points: conduitDraft.points,
        circuitoId: null,
        cor: "#222"
      });
      conduitDraft = null;
      save();
      paint();
      renderSide();
    }

    function hitTest(w) {
      for (let i = projeto.points.length - 1; i >= 0; i--) {
        const p = projeto.points[i];
        if (dist(p, w) <= 0.35) return { kind: "point", item: p };
      }
      for (let i = projeto.conduits.length - 1; i >= 0; i--) {
        const c = projeto.conduits[i];
        const pts = c.points || [];
        for (let j = 1; j < pts.length; j++) {
          if (distToSeg(w, pts[j - 1], pts[j]) < 0.2) return { kind: "conduit", item: c };
        }
      }
      for (let i = projeto.rooms.length - 1; i >= 0; i--) {
        const r = projeto.rooms[i];
        if (w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h)
          return { kind: "room", item: r };
      }
      return null;
    }

    function distToSeg(p, a, b) {
      const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (l2 < 1e-9) return dist(p, a);
      let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }

    function onDown(e) {
      const canvas = e.currentTarget;
      const w = worldFromEvent(e, canvas);
      if (spacePan || e.button === 1) {
        drag = { type: "pan", x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        return;
      }
      if (tool === "room") {
        drag = { type: "room", x0: w.x, y0: w.y, x1: w.x, y1: w.y };
        return;
      }
      if (tool === "conduit") {
        if (!conduitDraft) conduitDraft = { points: [{ x: w.x, y: w.y }] };
        else {
          const last = conduitDraft.points[conduitDraft.points.length - 1];
          if (dist(last, w) > 0.05) conduitDraft.points.push({ x: w.x, y: w.y });
        }
        paint();
        return;
      }
      if (tool === "place") {
        if (placeTipo === "qdc" && projeto.points.some((p) => p.tipo === "qdc")) {
          ctx.toast?.("Já existe um QDC — apague o atual para reposicionar.");
          return;
        }
        const meta = tipoPonto(placeTipo);
        const pt = {
          id: typeof uid === "function" ? uid("pt") : `pt-${Date.now()}`,
          tipo: placeTipo,
          x: w.x,
          y: w.y,
          potenciaVA: meta.potDefault,
          tensaoV: meta.tensaoDefault,
          interruptor: "",
          circuitoId: null,
          circuitoManual: false,
          label: meta.label
        };
        projeto.points.push(pt);
        save();
        selectedId = pt.id;
        selectedKind = "point";
        paint();
        openPointModal(pt);
        return;
      }
      if (tool === "delete") {
        const hit = hitTest(w);
        if (hit) {
          selectedId = hit.item.id;
          selectedKind = hit.kind;
          deleteSelected();
        }
        return;
      }
      // select
      const hit = hitTest(w);
      if (hit) {
        selectedId = hit.item.id;
        selectedKind = hit.kind;
        if (hit.kind === "point") openPointModal(hit.item);
        else if (hit.kind === "room") openRoomModal(hit.item);
        else paint();
      } else {
        selectedId = null;
        selectedKind = null;
        paint();
      }
      renderSide();
    }

    function onMove(e) {
      const canvas = root.querySelector("#peCanvas");
      const w = worldFromEvent(e, canvas);
      hover = w;
      if (drag?.type === "pan") {
        pan.x = drag.panX + (e.clientX - drag.x);
        pan.y = drag.panY + (e.clientY - drag.y);
        paint();
        return;
      }
      if (drag?.type === "room") {
        drag.x1 = w.x;
        drag.y1 = w.y;
        paint();
      }
      if (tool === "conduit" && conduitDraft) paint();
    }

    function onUp() {
      if (drag?.type === "room") {
        const x = Math.min(drag.x0, drag.x1);
        const y = Math.min(drag.y0, drag.y1);
        const w = Math.abs(drag.x1 - drag.x0);
        const h = Math.abs(drag.y1 - drag.y0);
        if (w >= GRID_M && h >= GRID_M) {
          const room = {
            id: typeof uid === "function" ? uid("rm") : `rm-${Date.now()}`,
            nome: "Cômodo",
            x,
            y,
            w,
            h
          };
          projeto.rooms.push(room);
          selectedId = room.id;
          selectedKind = "room";
          save();
          openRoomModal(room);
        }
      }
      drag = null;
      paint();
      renderSide();
    }

    function onDbl(e) {
      if (tool === "conduit") {
        e.preventDefault();
        finishConduit();
      }
    }

    function deleteSelected() {
      if (!selectedId) return;
      if (selectedKind === "point")
        projeto.points = projeto.points.filter((p) => p.id !== selectedId);
      if (selectedKind === "room")
        projeto.rooms = projeto.rooms.filter((r) => r.id !== selectedId);
      if (selectedKind === "conduit")
        projeto.conduits = projeto.conduits.filter((c) => c.id !== selectedId);
      selectedId = null;
      selectedKind = null;
      save();
      paint();
      renderSide();
    }

    function openPointModal(pt) {
      const meta = tipoPonto(pt.tipo);
      const circOpts = ["", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12"]
        .map(
          (c) =>
            `<option value="${c}" ${pt.circuitoId === c ? "selected" : ""}>${c || "Automático (NBR)"}</option>`
        )
        .join("");
      ctx.openModal?.(
        meta.label,
        `
        <div class="form-grid">
          <div class="field"><label>Rótulo</label><input id="pePtLabel" value="${escapeHtml(pt.label || meta.label)}" /></div>
          <div class="field"><label>Tipo</label>
            <select id="pePtTipo">${TIPOS_PONTO.map(
              (t) =>
                `<option value="${t.id}" ${t.id === pt.tipo ? "selected" : ""}>${t.label}</option>`
            ).join("")}</select>
          </div>
          <div class="field"><label>Potência (${meta.unidade || "VA/W"})</label>
            <input type="number" id="pePtPot" min="0" step="1" value="${Number(pt.potenciaVA || 0)}" />
          </div>
          <div class="field"><label>Tensão (V)</label>
            <select id="pePtV">
              <option value="127" ${Number(pt.tensaoV) === 127 ? "selected" : ""}>127</option>
              <option value="220" ${Number(pt.tensaoV) === 220 ? "selected" : ""}>220</option>
            </select>
          </div>
          <div class="field"><label>Interruptor (letra)</label>
            <input id="pePtInt" maxlength="2" value="${escapeHtml(pt.interruptor || "")}" placeholder="ex: a" />
          </div>
          <div class="field"><label>Circuito</label>
            <select id="pePtCirc">${circOpts}</select>
          </div>
          <p class="hint" style="grid-column:1/-1">Norma de referência: <strong>NBR 5410</strong> (instalações de baixa tensão). Use “Analisar” após traçar os conduítes até o QDC.</p>
        </div>
        `,
        `<button class="btn btn-secondary" id="pePtCancel">Cancelar</button>
         <button class="btn btn-danger" id="pePtDel">Excluir</button>
         <button class="btn btn-primary" id="pePtOk">Atualizar</button>`
      );
      document.getElementById("pePtCancel").onclick = () => ctx.closeModal?.();
      document.getElementById("pePtDel").onclick = () => {
        projeto.points = projeto.points.filter((p) => p.id !== pt.id);
        ctx.closeModal?.();
        save();
        paint();
        renderSide();
      };
      document.getElementById("pePtOk").onclick = () => {
        const p = projeto.points.find((x) => x.id === pt.id);
        if (!p) return;
        p.label = document.getElementById("pePtLabel").value.trim() || meta.label;
        p.tipo = document.getElementById("pePtTipo").value;
        p.potenciaVA = Math.max(0, Number(document.getElementById("pePtPot").value) || 0);
        p.tensaoV = Number(document.getElementById("pePtV").value) || 127;
        p.interruptor = document.getElementById("pePtInt").value.trim();
        const circ = document.getElementById("pePtCirc").value;
        if (circ) {
          p.circuitoId = circ;
          p.circuitoManual = true;
        } else {
          p.circuitoManual = false;
          p.circuitoId = null;
        }
        ctx.closeModal?.();
        save();
        paint();
        renderSide();
      };
    }

    function openRoomModal(room) {
      ctx.openModal?.(
        "Cômodo",
        `
        <div class="form-grid">
          <div class="field full"><label>Nome</label><input id="peRmNome" value="${escapeHtml(room.nome)}" /></div>
          <div class="field"><label>Largura (m)</label><input type="number" id="peRmW" min="0.5" step="0.1" value="${room.w}" /></div>
          <div class="field"><label>Comprimento (m)</label><input type="number" id="peRmH" min="0.5" step="0.1" value="${room.h}" /></div>
          <p class="hint" style="grid-column:1/-1">Área: <strong id="peRmArea">${(room.w * room.h).toFixed(2)}</strong> m²</p>
        </div>
        `,
        `<button class="btn btn-secondary" id="peRmCancel">Cancelar</button>
         <button class="btn btn-danger" id="peRmDel">Excluir</button>
         <button class="btn btn-primary" id="peRmOk">Atualizar</button>`
      );
      const syncArea = () => {
        const w = Number(document.getElementById("peRmW").value) || 0;
        const h = Number(document.getElementById("peRmH").value) || 0;
        document.getElementById("peRmArea").textContent = (w * h).toFixed(2);
      };
      document.getElementById("peRmW").oninput = syncArea;
      document.getElementById("peRmH").oninput = syncArea;
      document.getElementById("peRmCancel").onclick = () => ctx.closeModal?.();
      document.getElementById("peRmDel").onclick = () => {
        projeto.rooms = projeto.rooms.filter((r) => r.id !== room.id);
        ctx.closeModal?.();
        save();
        paint();
        renderSide();
      };
      document.getElementById("peRmOk").onclick = () => {
        const r = projeto.rooms.find((x) => x.id === room.id);
        if (!r) return;
        r.nome = document.getElementById("peRmNome").value.trim() || "Cômodo";
        r.w = Math.max(GRID_M, Number(document.getElementById("peRmW").value) || GRID_M);
        r.h = Math.max(GRID_M, Number(document.getElementById("peRmH").value) || GRID_M);
        ctx.closeModal?.();
        save();
        paint();
        renderSide();
      };
    }

    function resizeCanvas() {
      const canvas = root.querySelector("#peCanvas");
      const wrap = root.querySelector(".pe-canvas-wrap");
      if (!canvas || !wrap) return;
      const w = Math.max(640, wrap.clientWidth - 2);
      const h = Math.max(420, Math.min(640, window.innerHeight - 220));
      canvas.width = w;
      canvas.height = h;
    }

    function paint() {
      const canvas = root.querySelector("#peCanvas");
      if (!canvas) return;
      const ctx2 = canvas.getContext("2d");
      const W = canvas.width;
      const H = canvas.height;
      ctx2.clearRect(0, 0, W, H);
      ctx2.fillStyle = "#f7f8fa";
      ctx2.fillRect(0, 0, W, H);

      // grid
      ctx2.save();
      ctx2.translate(pan.x, pan.y);
      ctx2.strokeStyle = "#e2e5ea";
      ctx2.lineWidth = 1;
      const g = GRID_M * ppm;
      const x0 = -pan.x;
      const y0 = -pan.y;
      for (let x = Math.floor(x0 / g) * g; x < x0 + W; x += g) {
        ctx2.beginPath();
        ctx2.moveTo(x, y0);
        ctx2.lineTo(x, y0 + H);
        ctx2.stroke();
      }
      for (let y = Math.floor(y0 / g) * g; y < y0 + H; y += g) {
        ctx2.beginPath();
        ctx2.moveTo(x0, y);
        ctx2.lineTo(x0 + W, y);
        ctx2.stroke();
      }

      // rooms
      projeto.rooms.forEach((r) => {
        const sel = selectedKind === "room" && selectedId === r.id;
        ctx2.fillStyle = sel ? "rgba(11,45,92,0.08)" : "rgba(255,255,255,0.85)";
        ctx2.strokeStyle = sel ? "#0b2d5c" : "#3d4a5c";
        ctx2.lineWidth = sel ? 2.5 : 2;
        ctx2.fillRect(r.x * ppm, r.y * ppm, r.w * ppm, r.h * ppm);
        ctx2.strokeRect(r.x * ppm, r.y * ppm, r.w * ppm, r.h * ppm);
        ctx2.fillStyle = "#0b2d5c";
        ctx2.font = "600 12px Segoe UI, sans-serif";
        ctx2.fillText(r.nome, r.x * ppm + 6, r.y * ppm + 16);
        ctx2.font = "11px Segoe UI, sans-serif";
        ctx2.fillStyle = "#667";
        ctx2.fillText(
          `${r.w.toFixed(2)} × ${r.h.toFixed(2)} m (${(r.w * r.h).toFixed(1)} m²)`,
          r.x * ppm + 6,
          r.y * ppm + 32
        );
        // dimension ticks
        ctx2.fillStyle = "#888";
        ctx2.fillText(`${r.w.toFixed(2)}`, r.x * ppm + (r.w * ppm) / 2 - 12, r.y * ppm - 4);
      });

      // room draft
      if (drag?.type === "room") {
        const x = Math.min(drag.x0, drag.x1) * ppm;
        const y = Math.min(drag.y0, drag.y1) * ppm;
        const w = Math.abs(drag.x1 - drag.x0) * ppm;
        const h = Math.abs(drag.y1 - drag.y0) * ppm;
        ctx2.strokeStyle = "#f57c00";
        ctx2.setLineDash([6, 4]);
        ctx2.strokeRect(x, y, w, h);
        ctx2.setLineDash([]);
      }

      // conduits
      const drawPoly = (pts, color, width, dash) => {
        if (!pts?.length) return;
        ctx2.beginPath();
        ctx2.strokeStyle = color;
        ctx2.lineWidth = width;
        ctx2.setLineDash(dash || []);
        ctx2.lineJoin = "round";
        ctx2.moveTo(pts[0].x * ppm, pts[0].y * ppm);
        for (let i = 1; i < pts.length; i++) ctx2.lineTo(pts[i].x * ppm, pts[i].y * ppm);
        ctx2.stroke();
        ctx2.setLineDash([]);
      };

      projeto.conduits.forEach((c) => {
        const sel = selectedKind === "conduit" && selectedId === c.id;
        const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === c.circuitoId);
        const color = circ?.cor || c.cor || "#222";
        drawPoly(c.points, color, sel ? 4 : 2.4);
        // ticks + label mid
        const pts = c.points || [];
        if (pts.length >= 2 && c.circuitoId) {
          const mid = pts[Math.floor(pts.length / 2)];
          ctx2.fillStyle = color;
          ctx2.font = "bold 11px Segoe UI, sans-serif";
          const bit = circ?.bitola ? ` ${circ.bitola}` : "";
          ctx2.fillText(`${c.circuitoId}${bit}`, mid.x * ppm + 4, mid.y * ppm - 4);
        }
      });
      if (conduitDraft) {
        drawPoly(conduitDraft.points, "#f57c00", 2, [5, 4]);
        if (hover && conduitDraft.points.length) {
          const last = conduitDraft.points[conduitDraft.points.length - 1];
          drawPoly([last, hover], "#f57c00", 1.5, [3, 3]);
        }
      }

      // points
      projeto.points.forEach((p) => {
        const meta = tipoPonto(p.tipo);
        const cx = p.x * ppm;
        const cy = p.y * ppm;
        const sel = selectedKind === "point" && selectedId === p.id;
        const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === p.circuitoId);
        const stroke = circ?.cor || (p.tipo === "qdc" ? "#0b2d5c" : "#222");
        ctx2.beginPath();
        ctx2.fillStyle = p.tipo === "qdc" ? "#0b2d5c" : "#fff";
        ctx2.strokeStyle = sel ? "#f57c00" : stroke;
        ctx2.lineWidth = sel ? 3 : 2;
        if (p.tipo === "lampada") {
          ctx2.arc(cx, cy, 12, 0, Math.PI * 2);
        } else if (p.tipo === "qdc") {
          ctx2.rect(cx - 14, cy - 12, 28, 24);
        } else {
          ctx2.rect(cx - 11, cy - 11, 22, 22);
        }
        ctx2.fill();
        ctx2.stroke();
        ctx2.fillStyle = p.tipo === "qdc" ? "#fff" : "#111";
        ctx2.font = "bold 9px Segoe UI, sans-serif";
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(meta.simb, cx, cy);
        ctx2.textAlign = "left";
        ctx2.textBaseline = "alphabetic";
        ctx2.fillStyle = "#333";
        ctx2.font = "10px Segoe UI, sans-serif";
        const tag = [p.circuitoId, p.potenciaVA ? String(p.potenciaVA) : "", p.interruptor]
          .filter(Boolean)
          .join(" · ");
        if (tag) ctx2.fillText(tag, cx + 14, cy - 8);
      });

      ctx2.restore();
    }

    function renderSide() {
      const side = root.querySelector("#peSide");
      if (!side) return;
      const a = projeto.lastAnalise;
      const circHtml = a?.circuits?.length
        ? a.circuits
            .map(
              (c) => `
          <div class="pe-circ" style="border-left:4px solid ${c.cor}">
            <strong>${c.id}</strong> · ${c.dimensionamento?.tipo?.label || c.tipoId}
            <div class="hint">${c.pontos.length} ponto(s) · ${c.potenciaVA} VA/W · L≈${c.comprimentoM?.toFixed?.(1) || "—"} m</div>
            <div>${c.bitola || "—"} mm² · DJ ${c.disjuntor || "—"}A ${c.polos || ""}P · queda ${c.quedaPct != null ? c.quedaPct.toFixed(2) + "%" : "—"}</div>
          </div>`
            )
            .join("")
        : `<div class="empty"><strong>Sem análise</strong>Trace conduítes até o QDC e clique em Analisar NBR 5410.</div>`;

      const matHtml = a?.materiais?.length
        ? `<table class="pe-mat"><thead><tr><th>Item</th><th>Qtd</th></tr></thead><tbody>
          ${a.materiais
            .map(
              (m) =>
                `<tr><td>${escapeHtml(m.nome)}<div class="hint">${escapeHtml(m.nota || "")}</div></td><td>${m.qtd} ${m.unidade}</td></tr>`
            )
            .join("")}
          </tbody></table>
          <button type="button" class="btn btn-primary btn-sm" id="peOrc" style="margin-top:10px;width:100%">Gerar orçamento</button>`
        : "";

      const avisos = (a?.avisos || []).slice(0, 6)
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("");

      side.innerHTML = `
        <div class="pe-side-block">
          <h3>Resumo</h3>
          <p class="hint">${projeto.rooms.length} cômodo(s) · ${projeto.points.length} ponto(s) · ${projeto.conduits.length} conduíte(s)</p>
          <p class="source-pill">Base: NBR 5410 (baixa tensão)</p>
        </div>
        <div class="pe-side-block">
          <h3>Circuitos</h3>
          ${circHtml}
        </div>
        <div class="pe-side-block">
          <h3>Materiais</h3>
          ${matHtml || `<p class="hint">Rode a análise para gerar a lista.</p>`}
        </div>
        ${
          avisos
            ? `<div class="pe-side-block"><h3>Avisos</h3><ul class="pe-avisos">${avisos}</ul></div>`
            : ""
        }
        <p class="hint" style="margin-top:8px">${escapeHtml(a?.disclaimer || "Auxiliar de projeto — confirme no projeto oficial.")}</p>
      `;

      const btnOrc = side.querySelector("#peOrc");
      if (btnOrc) {
        btnOrc.onclick = () => ctx.onCreateOrcamento?.(projeto, a);
      }
    }

    // boot
    renderShell();
    window.addEventListener("resize", () => {
      if (!document.body.contains(root)) return;
      resizeCanvas();
      paint();
    });

    return {
      getProjeto: () => projeto,
      destroy: () => {}
    };
  }

  return {
    TIPOS_PONTO,
    CORES_CIRCUITO,
    createEmpty,
    analisar,
    montarMateriais,
    mount,
    tipoPonto
  };
})();
