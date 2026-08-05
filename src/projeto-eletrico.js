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
  const DRAG_CLICK_M = 0.15;

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

  const MODULOS_TOMADA = [
    { id: "simples", label: "Simples (1 módulo)", modulos: 1, simb: "T" },
    { id: "dupla", label: "Dupla (2 módulos)", modulos: 2, simb: "T2" },
    { id: "tripla", label: "Tripla (3 módulos)", modulos: 3, simb: "T3" }
  ];

  const AMP_TOMADA = [
    { id: 10, label: "10 A — TUG", tipoCirc: "tug", potModulo: 100, tensao: 127 },
    { id: 20, label: "20 A — uso geral/específico", tipoCirc: "tue", potModulo: 600, tensao: 220 }
  ];

  /** Usos típicos de TUE — potência média residencial (W) para pré-preencher */
  const USOS_TUE = [
    { id: "microondas", label: "Micro-ondas", pot: 1400, tensao: 220 },
    { id: "airfryer", label: "Air fryer", pot: 1500, tensao: 220 },
    { id: "forno", label: "Forno elétrico", pot: 2200, tensao: 220 },
    { id: "cooktop", label: "Cooktop elétrico", pot: 5500, tensao: 220 },
    { id: "lava_loucas", label: "Lava-louças", pot: 1800, tensao: 220 },
    { id: "maquina_lavar", label: "Máquina de lavar", pot: 1200, tensao: 220 },
    { id: "secadora", label: "Secadora de roupas", pot: 3500, tensao: 220 },
    { id: "ferro", label: "Ferro de passar", pot: 1200, tensao: 220 },
    { id: "aquecedor", label: "Aquecedor de ambiente", pot: 1800, tensao: 220 },
    { id: "torneira", label: "Torneira elétrica", pot: 5500, tensao: 220 },
    { id: "freezer", label: "Freezer", pot: 350, tensao: 220 },
    { id: "bomba", label: "Bomba d'água", pot: 750, tensao: 220 },
    { id: "outro", label: "Outro / livre", pot: 2000, tensao: 220 }
  ];

  function usoTueById(id) {
    return USOS_TUE.find((u) => u.id === id) || null;
  }

  function applyUsoTue(pt, usoId) {
    if (!pt) return;
    const uso = usoTueById(usoId);
    if (!uso) {
      pt.usoTue = "";
      return;
    }
    pt.usoTue = uso.id;
    pt.usoCircuito = "tue";
    if (Number(pt.amperagem) < 20) pt.amperagem = 20;
    pt.potenciaVA = uso.pot;
    pt.tensaoV = uso.tensao;
    pt.label = `TUE · ${uso.label}`;
  }

  const VAR_INTERRUPTOR = [
    { id: "simples", label: "Simples", simb: "S" },
    { id: "duplo", label: "Duplo", simb: "S2" },
    { id: "paralelo", label: "Paralelo (three-way)", simb: "S3" },
    { id: "intermediario", label: "Intermediário (four-way)", simb: "S4" },
    { id: "bipolar", label: "Bipolar", simb: "SB" },
    { id: "dimmer", label: "Dimmer / variador", simb: "D" },
    { id: "pulsador", label: "Pulsador", simb: "P" },
    { id: "sensor_embutido", label: "Com sensor embutido", simb: "SS" }
  ];

  const VAR_LAMPADA = [
    { id: "ponto", label: "Ponto de luz", pot: 20, simb: "L" },
    { id: "plafon", label: "Plafon", pot: 40, simb: "PL" },
    { id: "spot", label: "Spot", pot: 15, simb: "SP" },
    { id: "pendente", label: "Pendente", pot: 60, simb: "PE" },
    { id: "arandela", label: "Arandela", pot: 25, simb: "AR" },
    { id: "emergencia", label: "Luz de emergência", pot: 10, simb: "LE" },
    { id: "ventilador", label: "Ventilador de teto", pot: 80, simb: "VT" }
  ];

  /** Conjugados interruptor + tomada (estilo WOCA) */
  const PRESETS_CONJUGADO = [
    { id: "s1_t1", label: "1 int. + 1 tomada 10A", int: "simples", tomMod: "simples", amp: 10, simb: "ST" },
    { id: "s1_t2", label: "1 int. + 2 tomadas 10A", int: "simples", tomMod: "dupla", amp: 10, simb: "ST2" },
    { id: "s1_t3", label: "1 int. + 3 tomadas 10A", int: "simples", tomMod: "tripla", amp: 10, simb: "ST3" },
    { id: "s2_t1", label: "2 int. + 1 tomada 10A", int: "duplo", tomMod: "simples", amp: 10, simb: "S2T" },
    { id: "s2_t2", label: "2 int. + 2 tomadas 10A", int: "duplo", tomMod: "dupla", amp: 10, simb: "S2T2" },
    { id: "s3_t1", label: "Paralelo + 1 tomada 10A", int: "paralelo", tomMod: "simples", amp: 10, simb: "S3T" },
    { id: "s1_t1_20", label: "1 int. + 1 tomada 20A", int: "simples", tomMod: "simples", amp: 20, simb: "ST20" },
    { id: "s2_t1_20", label: "2 int. + 1 tomada 20A", int: "duplo", tomMod: "simples", amp: 20, simb: "S2T20" },
    { id: "dim_t1", label: "Dimmer + 1 tomada 10A", int: "dimmer", tomMod: "simples", amp: 10, simb: "DT" }
  ];

  function conjugadoById(id) {
    return PRESETS_CONJUGADO.find((c) => c.id === id) || PRESETS_CONJUGADO[0];
  }

  const TIPOS_PONTO = [
    { id: "tomada", label: "Tomada", simb: "T", kind: "tomada", tipoCirc: "tug" },
    { id: "interruptor", label: "Interruptor", simb: "S", kind: "interruptor", tipoCirc: null },
    { id: "conjugado", label: "Conjugado (int. + tomada)", simb: "ST", kind: "conjugado", tipoCirc: "tug" },
    { id: "lampada", label: "Iluminação", simb: "L", kind: "lampada", tipoCirc: "iluminacao", potDefault: 20, tensaoDefault: 127, unidade: "VA" },
    { id: "chuveiro", label: "Chuveiro", simb: "CH", kind: "carga", tipoCirc: "chuveiro", potDefault: 5500, tensaoDefault: 220, unidade: "W" },
    { id: "ar", label: "Ar-condicionado", simb: "AC", kind: "carga", tipoCirc: "ar", potDefault: 3500, tensaoDefault: 220, unidade: "W" },
    { id: "fogao", label: "Fogão / forno", simb: "FG", kind: "carga", tipoCirc: "tue", potDefault: 4500, tensaoDefault: 220, unidade: "W" },
    { id: "sensor", label: "Sensor de presença", simb: "SE", kind: "comando", tipoCirc: null, potDefault: 0, tensaoDefault: 127 },
    { id: "campainha", label: "Campainha", simb: "C", kind: "comando", tipoCirc: null, potDefault: 0, tensaoDefault: 127 },
    { id: "exaustor", label: "Exaustor", simb: "EX", kind: "carga", tipoCirc: "tue", potDefault: 150, tensaoDefault: 127, unidade: "W" },
    { id: "qdc", label: "QDC", simb: "QDC", kind: "quadro", tipoCirc: null, potDefault: 0, tensaoDefault: 220 }
  ];

  const TIPOS_ARCH = [
    { id: "porta", label: "Porta", larguraDefault: 0.8 },
    { id: "porta_correr", label: "Porta de correr", larguraDefault: 1.2 },
    { id: "porta_dupla", label: "Porta dupla", larguraDefault: 1.4 },
    { id: "janela", label: "Janela", larguraDefault: 1.2 },
    { id: "janela_basculante", label: "Janela basculante", larguraDefault: 0.8 },
    { id: "porta_janela", label: "Porta-janela", larguraDefault: 1.6 },
    { id: "vao", label: "Vão / passagem", larguraDefault: 1.0 },
    { id: "pilar", label: "Pilar / coluna", larguraDefault: 0.3 }
  ];

  function tipoPonto(id) {
    return TIPOS_PONTO.find((t) => t.id === id) || TIPOS_PONTO[0];
  }

  function tipoArch(id) {
    return TIPOS_ARCH.find((t) => t.id === id) || TIPOS_ARCH[0];
  }

  function modulosTomada(id) {
    return MODULOS_TOMADA.find((m) => m.id === id) || MODULOS_TOMADA[0];
  }

  function varInterruptor(id) {
    return VAR_INTERRUPTOR.find((v) => v.id === id) || VAR_INTERRUPTOR[0];
  }

  function varLampada(id) {
    return VAR_LAMPADA.find((v) => v.id === id) || VAR_LAMPADA[0];
  }

  /** Compatível com projetos antigos (tug/tue) */
  function normalizePoint(p) {
    if (!p) return p;
    const out = { ...p };
    if (out.tipo === "tug") {
      out.tipo = "tomada";
      out.amperagem = out.amperagem || 10;
      out.modulos = out.modulos || "simples";
      out.usoCircuito = out.usoCircuito || "tug";
    }
    if (out.tipo === "tue") {
      out.tipo = "tomada";
      out.amperagem = out.amperagem || 20;
      out.modulos = out.modulos || "simples";
      out.usoCircuito = out.usoCircuito || "tue";
    }
    if (out.tipo === "tomada") {
      out.modulos = out.modulos || "simples";
      out.amperagem = Number(out.amperagem) === 20 ? 20 : 10;
      out.usoCircuito =
        out.usoCircuito || (out.amperagem >= 20 ? "tue" : "tug");
      if (out.usoCircuito === "tue" || out.amperagem >= 20) {
        out.usoTue = out.usoTue || "";
      } else {
        out.usoTue = "";
      }
    }
    if (out.tipo === "interruptor") out.variante = out.variante || "simples";
    if (out.tipo === "lampada") out.variante = out.variante || "ponto";
    if (out.tipo === "conjugado") {
      const cj = conjugadoById(out.conjugadoId || "s1_t1");
      out.conjugadoId = cj.id;
      out.variante = out.variante || cj.int;
      out.modulos = out.modulos || cj.tomMod;
      out.amperagem = Number(out.amperagem) === 20 ? 20 : cj.amp === 20 ? 20 : Number(out.amperagem) || cj.amp;
      out.usoCircuito = out.usoCircuito || (out.amperagem >= 20 ? "tue" : "tug");
    }
    return out;
  }

  function circKindOf(p) {
    const n = normalizePoint(p);
    if (n.tipo === "tomada" || n.tipo === "conjugado")
      return n.usoCircuito === "tue" || Number(n.amperagem) >= 20 ? "tue" : "tug";
    return tipoPonto(n.tipo).tipoCirc;
  }

  function pesoPonto(p) {
    const n = normalizePoint(p);
    if (n.tipo === "tomada" || n.tipo === "conjugado") return modulosTomada(n.modulos).modulos;
    return 1;
  }

  function cargaPonto(p) {
    const n = normalizePoint(p);
    if (n.tipo === "tomada" || n.tipo === "conjugado") {
      if (n.usoTue) {
        const uso = usoTueById(n.usoTue);
        if (uso && !(Number(n.potenciaVA) > 0)) return uso.pot;
      }
      if (Number(n.potenciaVA) > 0) return Number(n.potenciaVA);
      const amp = AMP_TOMADA.find((a) => a.id === n.amperagem) || AMP_TOMADA[0];
      return amp.potModulo * modulosTomada(n.modulos).modulos;
    }
    if (n.tipo === "lampada") {
      if (Number(n.potenciaVA) > 0) return Number(n.potenciaVA);
      return varLampada(n.variante).pot;
    }
    return Number(n.potenciaVA || tipoPonto(n.tipo).potDefault || 0);
  }

  function simbPonto(p) {
    const n = normalizePoint(p);
    if (n.tipo === "conjugado") return conjugadoById(n.conjugadoId).simb;
    if (n.tipo === "tomada") return modulosTomada(n.modulos).simb + (n.amperagem === 20 ? "20" : "");
    if (n.tipo === "interruptor") return varInterruptor(n.variante).simb;
    if (n.tipo === "lampada") return varLampada(n.variante).simb;
    return tipoPonto(n.tipo).simb;
  }

  function labelPonto(p) {
    const n = normalizePoint(p);
    if (n.tipo === "conjugado") return conjugadoById(n.conjugadoId).label;
    if (n.tipo === "tomada") {
      if (n.usoTue) {
        const uso = usoTueById(n.usoTue);
        if (uso) return `TUE · ${uso.label}`;
      }
      return `Tomada ${modulosTomada(n.modulos).label.split(" ")[0]} ${n.amperagem}A`;
    }
    if (n.tipo === "interruptor") return `Interruptor ${varInterruptor(n.variante).label}`;
    if (n.tipo === "lampada") return varLampada(n.variante).label;
    return n.label || tipoPonto(n.tipo).label;
  }

  function applyPointPreset(pt, preset) {
    if (!pt || !preset) return;
    if (preset.group === "tomada") {
      pt.tipo = "tomada";
      pt.modulos = preset.modulos;
      pt.amperagem = preset.amp;
      pt.usoCircuito = preset.amp >= 20 ? "tue" : "tug";
      pt.tensaoV = preset.amp >= 20 ? 220 : 127;
      pt.potenciaVA =
        (AMP_TOMADA.find((a) => a.id === preset.amp) || AMP_TOMADA[0]).potModulo *
        modulosTomada(preset.modulos).modulos;
      pt.label = labelPonto(pt);
    } else if (preset.group === "interruptor") {
      pt.tipo = "interruptor";
      pt.variante = preset.variante;
      pt.potenciaVA = 0;
      pt.label = labelPonto(pt);
    } else if (preset.group === "conjugado") {
      const cj = conjugadoById(preset.conjugadoId || preset.id);
      pt.tipo = "conjugado";
      pt.conjugadoId = cj.id;
      pt.variante = cj.int;
      pt.modulos = cj.tomMod;
      pt.amperagem = cj.amp;
      pt.usoCircuito = cj.amp >= 20 ? "tue" : "tug";
      pt.tensaoV = cj.amp >= 20 ? 220 : 127;
      pt.potenciaVA =
        (AMP_TOMADA.find((a) => a.id === cj.amp) || AMP_TOMADA[0]).potModulo *
        modulosTomada(cj.tomMod).modulos;
      pt.label = cj.label;
    } else if (preset.group === "lampada") {
      pt.tipo = "lampada";
      pt.variante = preset.variante;
      pt.potenciaVA = varLampada(preset.variante).pot;
      pt.tensaoV = 127;
      pt.label = labelPonto(pt);
    }
  }

  function floatPresetsFor(pt) {
    const n = normalizePoint(pt);
    if (n.tipo === "tomada" || n.tipo === "conjugado" || n.tipo === "interruptor") {
      const list = [];
      MODULOS_TOMADA.forEach((m) => {
        [10, 20].forEach((amp) => {
          list.push({
            group: "tomada",
            id: `t_${m.id}_${amp}`,
            label: `${m.label.split(" ")[0]} ${amp}A`,
            short: `${m.simb}${amp === 20 ? "20" : ""}`,
            modulos: m.id,
            amp
          });
        });
      });
      VAR_INTERRUPTOR.forEach((v) => {
        list.push({
          group: "interruptor",
          id: `i_${v.id}`,
          label: v.label,
          short: v.simb,
          variante: v.id
        });
      });
      PRESETS_CONJUGADO.forEach((c) => {
        list.push({
          group: "conjugado",
          id: c.id,
          conjugadoId: c.id,
          label: c.label,
          short: c.simb
        });
      });
      return list;
    }
    if (n.tipo === "lampada") {
      return VAR_LAMPADA.map((v) => ({
        group: "lampada",
        id: v.id,
        variante: v.id,
        label: v.label,
        short: v.simb
      }));
    }
    return [];
  }

  function defaultPoint(tipo, x, y) {
    const meta = tipoPonto(tipo);
    const base = {
      id: typeof uid === "function" ? uid("pt") : `pt-${Date.now()}`,
      tipo,
      x,
      y,
      potenciaVA: meta.potDefault || 0,
      tensaoV: meta.tensaoDefault || 127,
      interruptor: "",
      circuitoId: null,
      circuitoManual: false,
      label: meta.label,
      variante: "simples",
      modulos: "simples",
      amperagem: 10,
      usoCircuito: "tug",
      alturaM: tipo === "lampada" ? 2.5 : 0.3
    };
    if (tipo === "tomada") {
      base.amperagem = 10;
      base.modulos = "simples";
      base.usoCircuito = "tug";
      base.potenciaVA = 100;
      base.tensaoV = 127;
      base.label = "Tomada simples 10A";
    }
    if (tipo === "interruptor") {
      base.variante = "simples";
      base.potenciaVA = 0;
      base.label = "Interruptor simples";
    }
    if (tipo === "lampada") {
      base.variante = "ponto";
      base.potenciaVA = 20;
      base.label = "Ponto de luz";
    }
    if (tipo === "conjugado") {
      applyPointPreset(base, { group: "conjugado", conjugadoId: "s1_t1", id: "s1_t1" });
    }
    if (tipo === "chuveiro" || tipo === "ar" || tipo === "fogao") {
      base.alturaM = 2.2;
    }
    return base;
  }

  function createEmpty(nome = "Novo projeto", uso = "residencial") {
    return {
      id: typeof uid === "function" ? uid("pe") : `pe-${Date.now()}`,
      nome,
      uso: uso === "comercial" ? "comercial" : "residencial",
      rooms: [],
      arch: [],
      points: [],
      conduits: [],
      lastAnalise: null,
      criadoEm: typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10),
      updatedAt: Date.now()
    };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function polylineLength(verts) {
    let L = 0;
    for (let i = 1; i < verts.length; i++) L += dist(verts[i - 1], verts[i]);
    return L;
  }

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

    (projeto.conduits || []).forEach((c) => {
      const verts = c.points || [];
      for (let i = 1; i < verts.length; i++) {
        const a = indexOf(verts[i - 1]);
        const b = indexOf(verts[i]);
        edges.push({ a, b, len: dist(verts[i - 1], verts[i]), conduitId: c.id });
      }
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
      if (best < 0) best = indexOf(pt);
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
    const fromQdc =
      qdcNode >= 0 ? dijkstra(graph, qdcNode) : { distArr: [], prev: [], prevEdge: [] };

    const conduitUse = {};
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
          pathEdgesFromPrev(fromQdc.prev, fromQdc.prevEdge, ni).forEach((e) => {
            if (!e.conduitId) return;
            if (!conduitUse[e.conduitId]) conduitUse[e.conduitId] = {};
            conduitUse[e.conduitId][circ.id] =
              (conduitUse[e.conduitId][circ.id] || 0) + e.len;
          });
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
      circ.comprimentoM = Math.max(maxLen, 1);
      circ.comprimentoTotalTrechosM = sumLen;
      circ.pontosComPath = nPath;

      const first = byId[circ.pontos[0]];
      const tensao =
        circ.tipoId === "iluminacao" || circ.tipoId === "tug"
          ? Number(first?.tensaoV || 127)
          : Number(first?.tensaoV || 220);

      const dim =
        typeof NBR5410 !== "undefined"
          ? NBR5410.dimensionar({
              tipoId: circ.tipoId || "livre",
              potenciaW: circ.potenciaVA,
              tensaoV: tensao,
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
      Object.entries(use).forEach(([cid, m]) => {
        if (m > bestM) {
          bestM = m;
          best = cid;
        }
      });
      const circ = circuits.find((x) => x.id === best);
      return { ...c, circuitoId: best, cor: circ?.cor || "#222" };
    });

    const pointsOut = (projeto.points || []).map((orig) => {
      const p = byId[orig.id];
      return p ? { ...normalizePoint(orig), circuitoId: p.circuitoId } : normalizePoint(orig);
    });

    const materiais = montarMateriais(
      { ...projeto, points: pointsOut, conduits, arch: projeto.arch || [] },
      circuits,
      produtos,
      modoPreco || "medio"
    );

    return {
      uso,
      circuits,
      conduits,
      points: pointsOut,
      materiais,
      avisos: [...new Set(avisos)],
      disclaimer:
        "Cálculos auxiliares com base em critérios simplificados da NBR 5410. Não substitui projeto elétrico oficial.",
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

    if (circuits.some((c) => c.dr)) {
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

    const dps =
      find((p) => p.id === "prd-9") || find((p) => /\bdps\b/i.test(p.nome || ""));
    if (dps || circuits.length) {
      itens.push({
        tipo: "produto",
        refId: dps?.id || null,
        nome: dps?.nome || "DPS",
        unidade: "un",
        qtd: 1,
        preco: dps ? preco(dps) : 0,
        nota: "Proteção contra surtos (recomendado)"
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
      nota: `${nCirc} circuitos`
    });

    return itens;
  }

  /* ===================== UI / Editor ===================== */

  function mount(root, ctx) {
    let projeto = JSON.parse(JSON.stringify(ctx.projeto));
    if (!Array.isArray(projeto.arch)) projeto.arch = [];
    projeto.points = (projeto.points || []).map(normalizePoint);

    let tool = "select";
    let placeTipo = "tomada";
    let placeArch = "porta";
    let placePreset = null; // variante escolhida na barra superior
    let ppm = PPM_DEFAULT;
    let pan = { x: 40, y: 40 };
    let drag = null;
    let conduitDraft = null;
    let selectedId = null;
    let selectedKind = null;
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
      return {
        x: Math.round(x / GRID_M) * GRID_M,
        y: Math.round(y / GRID_M) * GRID_M,
        rawX: x,
        rawY: y
      };
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
      refreshSelectionUI();
      ctx.toast?.(`Análise NBR 5410: ${analise.circuits.length} circuito(s)`);
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
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
              <button type="button" data-tool="select" class="pe-tool active" title="Selecionar / arrastar">Mover</button>
              <button type="button" data-tool="room" class="pe-tool" title="Desenhar cômodo">Cômodo</button>
              <button type="button" data-tool="arch" data-arch="porta" class="pe-tool" title="Porta">Porta</button>
              <button type="button" data-tool="arch" data-arch="janela" class="pe-tool" title="Janela">Janela</button>
              <button type="button" data-tool="arch" data-arch="vao" class="pe-tool" title="Vão">Vão</button>
              <button type="button" data-tool="arch" data-arch="pilar" class="pe-tool" title="Pilar">Pilar</button>
              <button type="button" data-tool="conduit" class="pe-tool" title="Conduíte">Conduíte</button>
              <button type="button" data-tool="place" data-tipo="tomada" class="pe-tool" title="Tomada">Tomada</button>
              <button type="button" data-tool="place" data-tipo="interruptor" class="pe-tool" title="Interruptor">Interr.</button>
              <button type="button" data-tool="place" data-tipo="conjugado" class="pe-tool" title="Conjugado int.+tomada">Conjug.</button>
              <button type="button" data-tool="place" data-tipo="lampada" class="pe-tool" title="Iluminação">Luz</button>
              <button type="button" data-tool="place" data-tipo="chuveiro" class="pe-tool" title="Chuveiro">CH</button>
              <button type="button" data-tool="place" data-tipo="ar" class="pe-tool" title="Ar">AC</button>
              <button type="button" data-tool="place" data-tipo="fogao" class="pe-tool" title="Fogão">Fogão</button>
              <button type="button" data-tool="place" data-tipo="sensor" class="pe-tool" title="Sensor">Sensor</button>
              <button type="button" data-tool="place" data-tipo="qdc" class="pe-tool" title="QDC">QDC</button>
              <button type="button" data-tool="delete" class="pe-tool danger" title="Apagar">Apagar</button>
              <span class="pe-tools-sep" id="peToolsSep" hidden></span>
              <span class="pe-tools-variants" id="peVariants" hidden></span>
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
              <div class="pe-hint" id="peHint">Grade ${GRID_M} m · Clique = selecionar · Arraste = mover · Edite no painel à direita</div>
            </div>
            <aside class="pe-side" id="peSide"></aside>
          </div>
        </div>
      `;
      bindChrome();
      resizeCanvas();
      paint();
      refreshSelectionUI();
    }

    function setTool(t, tipo, arch) {
      tool = t;
      if (tipo) {
        placeTipo = tipo;
        placePreset = null;
      }
      if (arch) placeArch = arch;
      conduitDraft = null;
      root.querySelectorAll(".pe-tool").forEach((btn) => {
        let active = btn.dataset.tool === tool;
        if (tool === "place") active = active && btn.dataset.tipo === placeTipo;
        if (tool === "arch") active = active && btn.dataset.arch === placeArch;
        btn.classList.toggle("active", !!active);
      });
      const labels = {
        select: "clique seleciona · arraste para mover · edição no painel à direita",
        room: "cômodo — arraste para desenhar",
        arch: `${tipoArch(placeArch).label} — clique para inserir (R = girar)`,
        conduit: "conduíte — vértices; Enter ou duplo clique termina",
        place: `${tipoPonto(placeTipo).label} — escolha a variante nos botões ao lado e clique no grid`,
        delete: "apagar — clique no elemento"
      };
      const hint = root.querySelector("#peHint");
      if (hint) hint.textContent = `Grade ${GRID_M} m · ${labels[tool] || tool}`;
      renderToolbarVariants();
    }

    function presetsForTipo(tipo) {
      if (tipo === "tomada") {
        const list = [];
        MODULOS_TOMADA.forEach((m) => {
          [10, 20].forEach((amp) => {
            list.push({
              group: "tomada",
              id: `t_${m.id}_${amp}`,
              label: `${m.label.split(" ")[0]} ${amp}A`,
              short: `${m.simb}${amp === 20 ? "20" : ""}`,
              modulos: m.id,
              amp
            });
          });
        });
        return list;
      }
      if (tipo === "interruptor") {
        return VAR_INTERRUPTOR.map((v) => ({
          group: "interruptor",
          id: `i_${v.id}`,
          label: v.label,
          short: v.simb,
          variante: v.id
        }));
      }
      if (tipo === "conjugado") {
        return PRESETS_CONJUGADO.map((c) => ({
          group: "conjugado",
          id: c.id,
          conjugadoId: c.id,
          label: c.label,
          short: c.simb
        }));
      }
      if (tipo === "lampada") {
        return VAR_LAMPADA.map((v) => ({
          group: "lampada",
          id: v.id,
          variante: v.id,
          label: v.label,
          short: v.simb
        }));
      }
      return [];
    }

    /** Variantes só na toolbar de cima, ao escolher ferramenta de inserção — não ao selecionar no grid */
    function renderToolbarVariants() {
      const bar = root.querySelector("#peVariants");
      const sep = root.querySelector("#peToolsSep");
      if (!bar) return;
      const show =
        tool === "place" &&
        ["tomada", "interruptor", "conjugado", "lampada"].includes(placeTipo);
      if (!show) {
        bar.hidden = true;
        bar.innerHTML = "";
        if (sep) sep.hidden = true;
        return;
      }
      const presets = presetsForTipo(placeTipo);
      if (!placePreset && presets[0]) placePreset = presets[0];
      if (sep) sep.hidden = false;
      bar.hidden = false;
      bar.innerHTML = presets
        .map(
          (pr) =>
            `<button type="button" class="pe-tool pe-tool-var ${placePreset && placePreset.id === pr.id ? "active" : ""}" data-preset="${escapeHtml(pr.id)}" title="${escapeHtml(pr.label)}">${escapeHtml(pr.short)}</button>`
        )
        .join("");
      bar.onclick = (e) => {
        const btn = e.target.closest("[data-preset]");
        if (!btn) return;
        e.stopPropagation();
        const preset = presets.find((p) => p.id === btn.dataset.preset);
        if (!preset) return;
        placePreset = preset;
        renderToolbarVariants();
      };
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
        setTool(btn.dataset.tool, btn.dataset.tipo, btn.dataset.arch);
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
      canvas.addEventListener("dblclick", onDbl);
      // mouseup no window: soltar fora do canvas não limpa seleção
      window.addEventListener("mouseup", onUp);
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
      window.addEventListener("keyup", (e) => {
        if (e.key === " ") spacePan = false;
      });
    }

    function onKey(e) {
      if (!document.body.contains(root)) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT")
        return;
      if (e.key === "Enter" && tool === "conduit" && conduitDraft?.points?.length >= 2) finishConduit();
      if (e.key === "Escape") {
        conduitDraft = null;
        drag = null;
        paint();
      }
      if (e.key === " ") spacePan = true;
      if ((e.key === "r" || e.key === "R") && selectedKind === "arch" && selectedId) {
        const a = projeto.arch.find((x) => x.id === selectedId);
        if (a) {
          a.angulo = ((a.angulo || 0) + 90) % 360;
          save();
          paint();
        }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) deleteSelected();
    }

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

    function roomHandle(r, w) {
      const hs = 0.25;
      const corners = [
        { id: "nw", x: r.x, y: r.y },
        { id: "ne", x: r.x + r.w, y: r.y },
        { id: "sw", x: r.x, y: r.y + r.h },
        { id: "se", x: r.x + r.w, y: r.y + r.h }
      ];
      for (const c of corners) {
        if (Math.hypot(w.rawX - c.x, w.rawY - c.y) <= hs) return c.id;
      }
      return null;
    }

    function hitTest(w) {
      for (let i = projeto.points.length - 1; i >= 0; i--) {
        const p = projeto.points[i];
        if (dist(p, { x: w.rawX, y: w.rawY }) <= 0.35) return { kind: "point", item: p };
      }
      for (let i = (projeto.arch || []).length - 1; i >= 0; i--) {
        const a = projeto.arch[i];
        if (dist(a, { x: w.rawX, y: w.rawY }) <= 0.4) return { kind: "arch", item: a };
      }
      for (let i = projeto.conduits.length - 1; i >= 0; i--) {
        const c = projeto.conduits[i];
        const pts = c.points || [];
        for (let j = 1; j < pts.length; j++) {
          if (distToSeg({ x: w.rawX, y: w.rawY }, pts[j - 1], pts[j]) < 0.2)
            return { kind: "conduit", item: c };
        }
      }
      if (selectedKind === "room" && selectedId) {
        const r = projeto.rooms.find((x) => x.id === selectedId);
        if (r) {
          const h = roomHandle(r, w);
          if (h) return { kind: "room-handle", item: r, handle: h };
        }
      }
      for (let i = projeto.rooms.length - 1; i >= 0; i--) {
        const r = projeto.rooms[i];
        if (w.rawX >= r.x && w.rawX <= r.x + r.w && w.rawY >= r.y && w.rawY <= r.y + r.h)
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
      if (tool === "arch") {
        const meta = tipoArch(placeArch);
        const item = {
          id: typeof uid === "function" ? uid("ar") : `ar-${Date.now()}`,
          tipo: placeArch,
          x: w.x,
          y: w.y,
          largura: meta.larguraDefault,
          angulo: 0
        };
        projeto.arch.push(item);
        selectedId = item.id;
        selectedKind = "arch";
        save();
        paint();
        refreshSelectionUI();
        return;
      }
      if (tool === "place") {
        if (placeTipo === "qdc" && projeto.points.some((p) => p.tipo === "qdc")) {
          ctx.toast?.("Já existe um QDC — apague o atual para reposicionar.");
          return;
        }
        const pt = defaultPoint(placeTipo, w.x, w.y);
        if (placePreset) applyPointPreset(pt, placePreset);
        Object.assign(pt, normalizePoint(pt));
        projeto.points.push(pt);
        selectedId = pt.id;
        selectedKind = "point";
        tool = "select";
        setTool("select");
        save();
        paint();
        refreshSelectionUI();
        return;
      }
      if (tool === "delete") {
        const hit = hitTest(w);
        if (hit) {
          selectedId = hit.item.id;
          selectedKind = hit.kind === "room-handle" ? "room" : hit.kind;
          deleteSelected();
        }
        return;
      }

      // select / move
      const hit = hitTest(w);
      if (!hit) {
        selectedId = null;
        selectedKind = null;
        paint();
        refreshSelectionUI();
        return;
      }

      if (hit.kind === "room-handle") {
        selectedId = hit.item.id;
        selectedKind = "room";
        drag = {
          type: "resize-room",
          id: hit.item.id,
          handle: hit.handle,
          ox: hit.item.x,
          oy: hit.item.y,
          ow: hit.item.w,
          oh: hit.item.h
        };
        paint();
        return;
      }

      selectedId = hit.item.id;
      selectedKind = hit.kind;

      if (hit.kind === "room") {
        drag = {
          type: "move-room",
          id: hit.item.id,
          dx: w.x - hit.item.x,
          dy: w.y - hit.item.y,
          startX: w.x,
          startY: w.y,
          moved: false
        };
      } else if (hit.kind === "point") {
        drag = {
          type: "move-point",
          id: hit.item.id,
          startX: w.x,
          startY: w.y,
          moved: false
        };
      } else if (hit.kind === "arch") {
        drag = {
          type: "move-arch",
          id: hit.item.id,
          startX: w.x,
          startY: w.y,
          moved: false
        };
      } else if (hit.kind === "conduit") {
        refreshSelectionUI();
      }
      paint();
      refreshSelectionUI();
    }

    function onMove(e) {
      const canvas = root.querySelector("#peCanvas");
      if (!canvas) return;
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
        return;
      }
      if (drag?.type === "move-room") {
        const r = projeto.rooms.find((x) => x.id === drag.id);
        if (r) {
          r.x = w.x - drag.dx;
          r.y = w.y - drag.dy;
          if (dist({ x: w.x, y: w.y }, { x: drag.startX, y: drag.startY }) > DRAG_CLICK_M)
            drag.moved = true;
          paint();
        }
        return;
      }
      if (drag?.type === "resize-room") {
        const r = projeto.rooms.find((x) => x.id === drag.id);
        if (!r) return;
        let x1 = drag.ox;
        let y1 = drag.oy;
        let x2 = drag.ox + drag.ow;
        let y2 = drag.oy + drag.oh;
        if (drag.handle.includes("n")) y1 = w.y;
        if (drag.handle.includes("s")) y2 = w.y;
        if (drag.handle.includes("w")) x1 = w.x;
        if (drag.handle.includes("e")) x2 = w.x;
        r.x = Math.min(x1, x2);
        r.y = Math.min(y1, y2);
        r.w = Math.max(GRID_M, Math.abs(x2 - x1));
        r.h = Math.max(GRID_M, Math.abs(y2 - y1));
        paint();
        return;
      }
      if (drag?.type === "move-point") {
        const p = projeto.points.find((x) => x.id === drag.id);
        if (p) {
          p.x = w.x;
          p.y = w.y;
          if (dist({ x: w.x, y: w.y }, { x: drag.startX, y: drag.startY }) > DRAG_CLICK_M)
            drag.moved = true;
          paint();
        }
        return;
      }
      if (drag?.type === "move-arch") {
        const a = projeto.arch.find((x) => x.id === drag.id);
        if (a) {
          a.x = w.x;
          a.y = w.y;
          if (dist({ x: w.x, y: w.y }, { x: drag.startX, y: drag.startY }) > DRAG_CLICK_M)
            drag.moved = true;
          paint();
        }
        return;
      }
      if (tool === "conduit" && conduitDraft) paint();
    }

    function onUp() {
      if (!drag) return;
      if (drag.type === "room") {
        const x = Math.min(drag.x0, drag.x1);
        const y = Math.min(drag.y0, drag.y1);
        const ww = Math.abs(drag.x1 - drag.x0);
        const hh = Math.abs(drag.y1 - drag.y0);
        if (ww >= GRID_M && hh >= GRID_M) {
          const room = {
            id: typeof uid === "function" ? uid("rm") : `rm-${Date.now()}`,
            nome: "Cômodo",
            x,
            y,
            w: ww,
            h: hh
          };
          projeto.rooms.push(room);
          selectedId = room.id;
          selectedKind = "room";
          save();
        }
      } else if (
        drag.type === "move-room" ||
        drag.type === "resize-room" ||
        drag.type === "move-point" ||
        drag.type === "move-arch" ||
        drag.type === "pan"
      ) {
        if (drag.type !== "pan") save();
      }
      drag = null;
      paint();
      refreshSelectionUI();
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
      if (selectedKind === "arch")
        projeto.arch = (projeto.arch || []).filter((a) => a.id !== selectedId);
      selectedId = null;
      selectedKind = null;
      save();
      paint();
      refreshSelectionUI();
    }

    function refreshSelectionUI() {
      renderSide();
      // Variantes ficam só na toolbar ao inserir — seleção edita no painel lateral
    }

    function inspectorHtml() {
      if (!selectedId || !selectedKind) {
        return `<div class="pe-side-block pe-inspector">
          <h3>Propriedades</h3>
          <p class="hint">Clique em um objeto no grid para selecionar. Segure e arraste para mover. A edição fica neste painel.</p>
        </div>`;
      }

      if (selectedKind === "point") {
        const pt = normalizePoint(projeto.points.find((p) => p.id === selectedId) || {});
        const meta = tipoPonto(pt.tipo);
        const circOpts = ["", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12"]
          .map(
            (c) =>
              `<option value="${c}" ${pt.circuitoId === c ? "selected" : ""}>${c || "Automático (NBR)"}</option>`
          )
          .join("");
        const showTom = pt.tipo === "tomada" || pt.tipo === "conjugado";
        const showInt = pt.tipo === "interruptor" || pt.tipo === "conjugado";
        const isTue = showTom && (pt.usoCircuito === "tue" || Number(pt.amperagem) >= 20);
        return `<div class="pe-side-block pe-inspector">
          <h3>${escapeHtml(meta.label)}</h3>
          <div class="pe-insp-form">
            <label>Rótulo<input id="pePtLabel" value="${escapeHtml(pt.label || meta.label)}" /></label>
            <label>Tipo
              <select id="pePtTipo">${TIPOS_PONTO.map(
                (t) =>
                  `<option value="${t.id}" ${t.id === pt.tipo ? "selected" : ""}>${t.label}</option>`
              ).join("")}</select>
            </label>
            ${
              showTom
                ? `<label>Módulos tomada
              <select id="pePtMod">${MODULOS_TOMADA.map(
                (m) =>
                  `<option value="${m.id}" ${pt.modulos === m.id ? "selected" : ""}>${m.label}</option>`
              ).join("")}</select></label>
              <label>Amperagem
              <select id="pePtAmp">${AMP_TOMADA.map(
                (a) =>
                  `<option value="${a.id}" ${Number(pt.amperagem) === a.id ? "selected" : ""}>${a.label}</option>`
              ).join("")}</select></label>
              <label>Uso circuito
              <select id="pePtUso">
                <option value="tug" ${pt.usoCircuito !== "tue" ? "selected" : ""}>TUG</option>
                <option value="tue" ${pt.usoCircuito === "tue" ? "selected" : ""}>TUE</option>
              </select></label>
              ${
                isTue
                  ? `<label>Uso da TUE (equipamento)
              <select id="pePtUsoTue">
                <option value="">— Selecione o uso —</option>
                ${USOS_TUE.map(
                  (u) =>
                    `<option value="${u.id}" ${pt.usoTue === u.id ? "selected" : ""}>${u.label} (~${u.pot} W)</option>`
                ).join("")}
              </select></label>
              <p class="hint">Ao escolher o uso, a potência média é preenchida automaticamente (pode ajustar depois).</p>`
                  : ""
              }`
                : ""
            }
            ${
              showInt
                ? `<label>Interruptor
              <select id="pePtVarInt">${VAR_INTERRUPTOR.map(
                (v) =>
                  `<option value="${v.id}" ${pt.variante === v.id ? "selected" : ""}>${v.label}</option>`
              ).join("")}</select></label>`
                : ""
            }
            ${
              pt.tipo === "conjugado"
                ? `<label>Modelo conjugado
              <select id="pePtConj">${PRESETS_CONJUGADO.map(
                (c) =>
                  `<option value="${c.id}" ${pt.conjugadoId === c.id ? "selected" : ""}>${c.label}</option>`
              ).join("")}</select></label>`
                : ""
            }
            ${
              pt.tipo === "lampada"
                ? `<label>Luminária
              <select id="pePtVar">${VAR_LAMPADA.map(
                (v) =>
                  `<option value="${v.id}" ${pt.variante === v.id ? "selected" : ""}>${v.label}</option>`
              ).join("")}</select></label>
              <label>Comando (letra)<input id="pePtInt" maxlength="2" value="${escapeHtml(pt.interruptor || "")}" /></label>`
                : pt.tipo === "lampada" || pt.tipo === "conjugado" || pt.tipo === "interruptor"
                  ? ""
                  : `<label>Comando (letra)<input id="pePtInt" maxlength="2" value="${escapeHtml(pt.interruptor || "")}" /></label>`
            }
            <label>Potência (VA/W)<input type="number" id="pePtPot" min="0" value="${Number(pt.potenciaVA || 0)}" /></label>
            <label>Tensão
              <select id="pePtV">
                <option value="127" ${Number(pt.tensaoV) === 127 ? "selected" : ""}>127 V</option>
                <option value="220" ${Number(pt.tensaoV) === 220 ? "selected" : ""}>220 V</option>
              </select>
            </label>
            <label>Altura (m)<input type="number" id="pePtAlt" step="0.1" value="${Number(pt.alturaM ?? 0.3)}" /></label>
            <label>Circuito<select id="pePtCirc">${circOpts}</select></label>
            <div class="pe-insp-actions">
              <button type="button" class="btn btn-danger btn-sm" id="pePtDel">Excluir</button>
              <button type="button" class="btn btn-primary btn-sm" id="pePtOk">Atualizar</button>
            </div>
            <p class="hint">Edite os campos e clique em Atualizar. TUE: escolha o equipamento para potência média automática.</p>
          </div>
        </div>`;
      }

      if (selectedKind === "room") {
        const room = projeto.rooms.find((r) => r.id === selectedId);
        if (!room) return "";
        return `<div class="pe-side-block pe-inspector">
          <h3>Compartimento</h3>
          <div class="pe-insp-form">
            <label>Nome<input id="peRmNome" value="${escapeHtml(room.nome)}" /></label>
            <label>Largura (m)<input type="number" id="peRmW" min="0.5" step="0.1" value="${room.w}" /></label>
            <label>Comprimento (m)<input type="number" id="peRmH" min="0.5" step="0.1" value="${room.h}" /></label>
            <p class="hint">Área: <strong>${(room.w * room.h).toFixed(2)}</strong> m²</p>
            <div class="pe-insp-actions">
              <button type="button" class="btn btn-danger btn-sm" id="peRmDel">Excluir</button>
              <button type="button" class="btn btn-primary btn-sm" id="peRmOk">Atualizar</button>
            </div>
          </div>
        </div>`;
      }

      if (selectedKind === "arch") {
        const item = projeto.arch.find((a) => a.id === selectedId);
        if (!item) return "";
        return `<div class="pe-side-block pe-inspector">
          <h3>${escapeHtml(tipoArch(item.tipo).label)}</h3>
          <div class="pe-insp-form">
            <label>Tipo<select id="peArTipo">${TIPOS_ARCH.map(
              (t) =>
                `<option value="${t.id}" ${t.id === item.tipo ? "selected" : ""}>${t.label}</option>`
            ).join("")}</select></label>
            <label>Largura (m)<input type="number" id="peArL" min="0.2" step="0.1" value="${Number(item.largura || 0.8)}" /></label>
            <label>Ângulo<select id="peArAng">${[0, 90, 180, 270]
              .map(
                (a) =>
                  `<option value="${a}" ${Number(item.angulo || 0) === a ? "selected" : ""}>${a}°</option>`
              )
              .join("")}</select></label>
            <div class="pe-insp-actions">
              <button type="button" class="btn btn-danger btn-sm" id="peArDel">Excluir</button>
              <button type="button" class="btn btn-primary btn-sm" id="peArOk">Atualizar</button>
            </div>
            <p class="hint">Tecla <strong>R</strong> gira 90°.</p>
          </div>
        </div>`;
      }

      if (selectedKind === "conduit") {
        return `<div class="pe-side-block pe-inspector">
          <h3>Conduíte</h3>
          <p class="hint">Selecionado. Após analisar, recebe cor/rótulo do circuito.</p>
          <button type="button" class="btn btn-danger btn-sm" id="peCdDel">Excluir conduíte</button>
        </div>`;
      }
      return "";
    }

    function bindInspector() {
      const side = root.querySelector("#peSide");
      if (!side) return;

      if (selectedKind === "point") {
        const apply = () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          if (!p) return;
          p.tipo = document.getElementById("pePtTipo")?.value || p.tipo;
          p.label = document.getElementById("pePtLabel")?.value.trim() || tipoPonto(p.tipo).label;
          p.potenciaVA = Math.max(0, Number(document.getElementById("pePtPot")?.value) || 0);
          p.tensaoV = Number(document.getElementById("pePtV")?.value) || 127;
          p.alturaM = Math.max(0, Number(document.getElementById("pePtAlt")?.value) || 0);
          const intEl = document.getElementById("pePtInt");
          if (intEl) p.interruptor = intEl.value.trim();
          if (p.tipo === "tomada" || p.tipo === "conjugado") {
            p.modulos = document.getElementById("pePtMod")?.value || "simples";
            p.amperagem = Number(document.getElementById("pePtAmp")?.value) || 10;
            p.usoCircuito = document.getElementById("pePtUso")?.value || "tug";
            const usoTue = document.getElementById("pePtUsoTue")?.value || "";
            if (p.usoCircuito === "tue" || p.amperagem >= 20) {
              if (usoTue) {
                p.usoTue = usoTue;
                const uso = usoTueById(usoTue);
                if (uso && !(document.getElementById("pePtLabel")?.value || "").trim())
                  p.label = `TUE · ${uso.label}`;
              } else p.usoTue = "";
            } else {
              p.usoTue = "";
            }
            // potência/tensão do formulário prevalecem (já preenchidas pelo uso TUE)
            p.potenciaVA = Math.max(0, Number(document.getElementById("pePtPot")?.value) || 0);
            p.tensaoV = Number(document.getElementById("pePtV")?.value) || p.tensaoV;
          }
          if (p.tipo === "interruptor" || p.tipo === "conjugado") {
            p.variante = document.getElementById("pePtVarInt")?.value || p.variante || "simples";
          }
          if (p.tipo === "conjugado") {
            const cid = document.getElementById("pePtConj")?.value;
            if (cid) applyPointPreset(p, { group: "conjugado", conjugadoId: cid, id: cid });
          }
          if (p.tipo === "lampada") {
            p.variante = document.getElementById("pePtVar")?.value || "ponto";
          }
          const circ = document.getElementById("pePtCirc")?.value;
          if (circ) {
            p.circuitoId = circ;
            p.circuitoManual = true;
          } else {
            p.circuitoManual = false;
            p.circuitoId = null;
          }
          Object.assign(p, normalizePoint(p));
          p.label = document.getElementById("pePtLabel")?.value.trim() || labelPonto(p);
          save();
          paint();
          refreshSelectionUI();
          ctx.toast?.("Ponto atualizado");
        };
        side.querySelector("#pePtOk")?.addEventListener("click", apply);
        side.querySelector("#pePtTipo")?.addEventListener("change", () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          if (!p) return;
          p.tipo = document.getElementById("pePtTipo").value;
          if (p.tipo === "conjugado") applyPointPreset(p, { group: "conjugado", conjugadoId: "s1_t1", id: "s1_t1" });
          Object.assign(p, normalizePoint(p));
          save();
          refreshSelectionUI();
        });
        const syncTueFields = () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          if (!p) return;
          p.amperagem = Number(document.getElementById("pePtAmp")?.value) || p.amperagem;
          p.usoCircuito = document.getElementById("pePtUso")?.value || p.usoCircuito;
          if (p.usoCircuito === "tue" && Number(p.amperagem) < 20) p.amperagem = 20;
          save();
          refreshSelectionUI();
        };
        side.querySelector("#pePtUso")?.addEventListener("change", syncTueFields);
        side.querySelector("#pePtAmp")?.addEventListener("change", syncTueFields);
        side.querySelector("#pePtUsoTue")?.addEventListener("change", () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          const usoId = document.getElementById("pePtUsoTue")?.value;
          if (!p) return;
          if (usoId) {
            applyUsoTue(p, usoId);
            const pot = document.getElementById("pePtPot");
            const ten = document.getElementById("pePtV");
            const lab = document.getElementById("pePtLabel");
            if (pot) pot.value = String(p.potenciaVA);
            if (ten) ten.value = String(p.tensaoV);
            if (lab) lab.value = p.label;
            save();
            paint();
            ctx.toast?.(`${usoTueById(usoId).label}: ~${p.potenciaVA} W`);
          } else {
            p.usoTue = "";
            save();
          }
        });
        side.querySelector("#pePtDel")?.addEventListener("click", () => {
          deleteSelected();
        });
      }

      if (selectedKind === "room") {
        side.querySelector("#peRmOk")?.addEventListener("click", () => {
          const r = projeto.rooms.find((x) => x.id === selectedId);
          if (!r) return;
          r.nome = document.getElementById("peRmNome").value.trim() || "Cômodo";
          r.w = Math.max(GRID_M, Number(document.getElementById("peRmW").value) || GRID_M);
          r.h = Math.max(GRID_M, Number(document.getElementById("peRmH").value) || GRID_M);
          save();
          paint();
          refreshSelectionUI();
        });
        side.querySelector("#peRmDel")?.addEventListener("click", () => deleteSelected());
      }

      if (selectedKind === "arch") {
        side.querySelector("#peArOk")?.addEventListener("click", () => {
          const a = projeto.arch.find((x) => x.id === selectedId);
          if (!a) return;
          a.tipo = document.getElementById("peArTipo").value;
          a.largura = Math.max(0.2, Number(document.getElementById("peArL").value) || 0.8);
          a.angulo = Number(document.getElementById("peArAng").value) || 0;
          save();
          paint();
          refreshSelectionUI();
        });
        side.querySelector("#peArDel")?.addEventListener("click", () => deleteSelected());
      }

      if (selectedKind === "conduit") {
        side.querySelector("#peCdDel")?.addEventListener("click", () => deleteSelected());
      }
    }

    function resizeCanvas() {
      const canvas = root.querySelector("#peCanvas");
      const wrap = root.querySelector(".pe-canvas-wrap");
      if (!canvas || !wrap) return;
      canvas.width = Math.max(640, wrap.clientWidth - 2);
      canvas.height = Math.max(420, Math.min(640, window.innerHeight - 220));
    }

    function drawArch(ctx2, a) {
      const ang = ((a.angulo || 0) * Math.PI) / 180;
      const L = (a.largura || 0.8) * ppm;
      const cx = a.x * ppm;
      const cy = a.y * ppm;
      const sel = selectedKind === "arch" && selectedId === a.id;
      ctx2.save();
      ctx2.translate(cx, cy);
      ctx2.rotate(ang);
      ctx2.strokeStyle = sel ? "#f57c00" : "#5d4037";
      ctx2.fillStyle = sel ? "rgba(245,124,0,0.15)" : "rgba(93,64,55,0.08)";
      ctx2.lineWidth = sel ? 2.5 : 1.8;

      if (a.tipo === "pilar") {
        const s = Math.max(0.25, a.largura || 0.3) * ppm;
        ctx2.fillRect(-s / 2, -s / 2, s, s);
        ctx2.strokeRect(-s / 2, -s / 2, s, s);
      } else if (String(a.tipo).startsWith("janela") || a.tipo === "porta_janela") {
        ctx2.beginPath();
        ctx2.moveTo(-L / 2, -3);
        ctx2.lineTo(L / 2, -3);
        ctx2.moveTo(-L / 2, 3);
        ctx2.lineTo(L / 2, 3);
        ctx2.stroke();
        ctx2.beginPath();
        ctx2.moveTo(0, -6);
        ctx2.lineTo(0, 6);
        ctx2.stroke();
      } else if (a.tipo === "vao") {
        ctx2.setLineDash([4, 3]);
        ctx2.beginPath();
        ctx2.moveTo(-L / 2, 0);
        ctx2.lineTo(L / 2, 0);
        ctx2.stroke();
        ctx2.setLineDash([]);
      } else {
        // porta
        ctx2.beginPath();
        ctx2.moveTo(-L / 2, 0);
        ctx2.lineTo(L / 2, 0);
        ctx2.stroke();
        ctx2.beginPath();
        ctx2.arc(-L / 2, 0, L, -Math.PI / 2, 0);
        ctx2.stroke();
      }
      ctx2.fillStyle = "#5d4037";
      ctx2.font = "10px Segoe UI, sans-serif";
      ctx2.textAlign = "center";
      ctx2.fillText(tipoArch(a.tipo).label.slice(0, 8), 0, -10);
      ctx2.restore();
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
        ctx2.fillStyle = "#888";
        ctx2.fillText(`${r.w.toFixed(2)}`, r.x * ppm + (r.w * ppm) / 2 - 12, r.y * ppm - 4);
        if (sel) {
          const hs = 5;
          [
            [r.x, r.y],
            [r.x + r.w, r.y],
            [r.x, r.y + r.h],
            [r.x + r.w, r.y + r.h]
          ].forEach(([hx, hy]) => {
            ctx2.fillStyle = "#f57c00";
            ctx2.fillRect(hx * ppm - hs, hy * ppm - hs, hs * 2, hs * 2);
          });
        }
      });

      if (drag?.type === "room") {
        const x = Math.min(drag.x0, drag.x1) * ppm;
        const y = Math.min(drag.y0, drag.y1) * ppm;
        const ww = Math.abs(drag.x1 - drag.x0) * ppm;
        const hh = Math.abs(drag.y1 - drag.y0) * ppm;
        ctx2.strokeStyle = "#f57c00";
        ctx2.setLineDash([6, 4]);
        ctx2.strokeRect(x, y, ww, hh);
        ctx2.setLineDash([]);
      }

      (projeto.arch || []).forEach((a) => drawArch(ctx2, a));

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

      projeto.points.forEach((p) => {
        const n = normalizePoint(p);
        const cx = n.x * ppm;
        const cy = n.y * ppm;
        const sel = selectedKind === "point" && selectedId === n.id;
        const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === n.circuitoId);
        const stroke = circ?.cor || (n.tipo === "qdc" ? "#0b2d5c" : "#222");
        ctx2.beginPath();
        ctx2.fillStyle = n.tipo === "qdc" ? "#0b2d5c" : "#fff";
        ctx2.strokeStyle = sel ? "#f57c00" : stroke;
        ctx2.lineWidth = sel ? 3 : 2;
        if (n.tipo === "lampada") ctx2.arc(cx, cy, 12, 0, Math.PI * 2);
        else if (n.tipo === "qdc") ctx2.rect(cx - 14, cy - 12, 28, 24);
        else ctx2.rect(cx - 12, cy - 11, 24, 22);
        ctx2.fill();
        ctx2.stroke();
        ctx2.fillStyle = n.tipo === "qdc" ? "#fff" : "#111";
        ctx2.font = "bold 8px Segoe UI, sans-serif";
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(simbPonto(n), cx, cy);
        ctx2.textAlign = "left";
        ctx2.textBaseline = "alphabetic";
        ctx2.fillStyle = "#333";
        ctx2.font = "10px Segoe UI, sans-serif";
        const tag = [
          n.circuitoId,
          n.tipo === "tomada" ? `${n.amperagem}A` : n.potenciaVA ? String(n.potenciaVA) : "",
          n.interruptor
        ]
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
            <div>${c.bitola || "—"} mm² · DJ ${c.disjuntor || "—"}A · queda ${c.quedaPct != null ? c.quedaPct.toFixed(2) + "%" : "—"}</div>
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

      const avisos = (a?.avisos || [])
        .slice(0, 6)
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("");

      side.innerHTML = `
        ${inspectorHtml()}
        <div class="pe-side-block">
          <h3>Resumo</h3>
          <p class="hint">${projeto.rooms.length} cômodo(s) · ${(projeto.arch || []).length} porta/janela · ${projeto.points.length} ponto(s) · ${projeto.conduits.length} conduíte(s)</p>
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

      bindInspector();
      const btnOrc = side.querySelector("#peOrc");
      if (btnOrc) btnOrc.onclick = () => ctx.onCreateOrcamento?.(projeto, a);
    }

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
})();
