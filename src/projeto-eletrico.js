/**
 * Projeto Elétrico (planta + conduítes manuais) — auxiliar NBR 5410
 *
 * Fluxo: planta baixa → pontos → conduítes → análise (circuitos, bitolas, caminhos) → materiais.
 * NÃO substitui projeto assinado por profissional habilitado (CREA/CFT).
 */
var ProjetoEletrico = (() => {
  const PPM_DEFAULT = 48;
  const PPM_MIN = 8;
  const PPM_MAX = 480;
  const SNAP_M = 0.35;
  const WALL_SNAP_M = 0.08;
  const SEG_SNAP_M = 0.12;
  const GRID_M = 0.01; // snap / grade lógica: 1 cm
  const ROOM_MIN_M = 0.5;
  const DRAG_CLICK_M = 0.05;
  const ERASE_M = 0.12;
  const HOTKEY_STORAGE = "voltes-pe-hotkeys";
  const DEFAULT_HOTKEYS = {
    select: "v",
    room: "c",
    line: "l",
    measure: "t",
    erase: "b",
    conduit: "u",
    porta: "p",
    janela: "j",
    delete: "x"
  };
  const HOTKEY_DEFS = [
    { id: "select", label: "Mover", tool: "select" },
    { id: "room", label: "Cômodo", tool: "room" },
    { id: "line", label: "Linha", tool: "line" },
    { id: "measure", label: "Trena", tool: "measure" },
    { id: "erase", label: "Borracha", tool: "erase" },
    { id: "conduit", label: "Conduíte", tool: "conduit" },
    { id: "porta", label: "Porta", tool: "arch", arch: "porta" },
    { id: "janela", label: "Janela", tool: "arch", arch: "janela" },
    { id: "delete", label: "Apagar", tool: "delete" }
  ];

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
    { id: "simples", label: "Simples (1 tecla)", simb: "S", teclas: 1 },
    { id: "duplo", label: "Duplo (2 teclas)", simb: "S2", teclas: 2 },
    { id: "triplo", label: "Triplo (3 teclas)", simb: "S3", teclas: 3 },
    { id: "paralelo", label: "Paralelo (three-way)", simb: "S3w", teclas: 1 },
    { id: "intermediario", label: "Intermediário (four-way)", simb: "S4", teclas: 1 },
    { id: "bipolar", label: "Bipolar", simb: "SB", teclas: 2 },
    { id: "dimmer", label: "Dimmer / variador", simb: "D", teclas: 1 },
    { id: "pulsador", label: "Pulsador", simb: "P", teclas: 1 },
    { id: "sensor_embutido", label: "Com sensor embutido", simb: "SS", teclas: 1 }
  ];

  function teclasDoInterruptor(variante) {
    const v = varInterruptor(variante);
    return Math.max(1, Number(v.teclas) || 1);
  }

  /** Letras de comando por tecla (a, b, c…) — ligam à lâmpada com a mesma letra. */
  function syncComandos(pt) {
    if (!pt) return [];
    const n = teclasDoInterruptor(pt.variante || "simples");
    let cmds = Array.isArray(pt.comandos)
      ? pt.comandos.map((c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 2))
      : [];
    if (!cmds.length && pt.interruptor) {
      cmds = String(pt.interruptor)
        .toLowerCase()
        .split(/[\/,;\s]+/)
        .map((c) => c.replace(/[^a-z0-9]/g, "").slice(0, 2))
        .filter(Boolean);
    }
    while (cmds.length < n) {
      cmds.push(String.fromCharCode(97 + (cmds.length % 26)));
    }
    pt.comandos = cmds.slice(0, n);
    pt.interruptor = pt.comandos.join("/");
    return pt.comandos;
  }

  /** Config individual de cada módulo de tomada (dupla/tripla). */
  function syncModulosConfig(pt) {
    if (!pt || (pt.tipo !== "tomada" && pt.tipo !== "conjugado")) return [];
    const n = modulosTomada(pt.modulos).modulos;
    let cfg = Array.isArray(pt.modulosConfig) ? pt.modulosConfig.map((m) => ({ ...m })) : [];
    while (cfg.length < n) {
      cfg.push({
        amperagem: Number(pt.amperagem) === 20 ? 20 : 10,
        usoCircuito: pt.usoCircuito === "tue" ? "tue" : "tug",
        circuitoId: pt.circuitoId || "",
        usoTue: pt.usoTue || ""
      });
    }
    cfg = cfg.slice(0, n).map((m) => ({
      amperagem: Number(m.amperagem) === 20 ? 20 : 10,
      usoCircuito: m.usoCircuito === "tue" || Number(m.amperagem) >= 20 ? "tue" : "tug",
      circuitoId: m.circuitoId || "",
      usoTue: m.usoTue || ""
    }));
    pt.modulosConfig = cfg;
    pt.interruptor = ""; // tomada não comanda iluminação
    // agregados do ponto (análise / resumo)
    pt.amperagem = cfg.some((m) => m.amperagem >= 20) ? 20 : 10;
    pt.usoCircuito = cfg.some((m) => m.usoCircuito === "tue") ? "tue" : "tug";
    const firstCirc = cfg.find((m) => m.circuitoId)?.circuitoId || "";
    if (firstCirc) {
      pt.circuitoId = firstCirc;
      pt.circuitoManual = true;
    }
    return cfg;
  }

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
  /** Escala visual do símbolo na planta (0,4× … 2,5×). Independente do zoom. */
  function clampEscala(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 1;
    return Math.round(Math.max(0.4, Math.min(2.5, n)) * 10) / 10;
  }

  function normalizePoint(p) {
    if (!p) return p;
    const out = { ...p };
    out.escala = clampEscala(out.escala == null ? 1 : out.escala);
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
      out.interruptor = "";
      syncModulosConfig(out);
    }
    if (out.tipo === "interruptor") {
      out.variante = out.variante || "simples";
      syncComandos(out);
    }
    if (out.tipo === "lampada") out.variante = out.variante || "ponto";
    if (out.tipo === "conjugado") {
      const cj = conjugadoById(out.conjugadoId || "s1_t1");
      out.conjugadoId = cj.id;
      out.variante = out.variante || cj.int;
      out.modulos = out.modulos || cj.tomMod;
      out.amperagem = Number(out.amperagem) === 20 ? 20 : cj.amp === 20 ? 20 : Number(out.amperagem) || cj.amp;
      out.usoCircuito = out.usoCircuito || (out.amperagem >= 20 ? "tue" : "tug");
      syncComandos(out);
      syncModulosConfig(out);
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
      if (Array.isArray(n.modulosConfig) && n.modulosConfig.length) {
        return n.modulosConfig.reduce((sum, m) => {
          if (m.usoTue) {
            const uso = usoTueById(m.usoTue);
            if (uso) return sum + uso.pot;
          }
          const amp = AMP_TOMADA.find((a) => a.id === Number(m.amperagem)) || AMP_TOMADA[0];
          return sum + amp.potModulo;
        }, 0);
      }
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
      alturaM: tipo === "lampada" ? 2.5 : 0.3,
      escala: 1
    };
    if (tipo === "tomada") {
      base.amperagem = 10;
      base.modulos = "simples";
      base.usoCircuito = "tug";
      base.potenciaVA = 100;
      base.tensaoV = 127;
      base.alturaM = 0.3; // NBR: tomada baixa ≈ 300 mm
      base.label = "Tomada simples 10A";
    }
    if (tipo === "interruptor") {
      base.variante = "simples";
      base.potenciaVA = 0;
      base.alturaM = 1.2;
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
      walls: [],
      dims: [],
      guides: [],
      symbolScale: 1,
      lastAnalise: null,
      criadoEm: typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10),
      updatedAt: Date.now()
    };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
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

  function drawTrianguloTomada(ctx, cx, cy, sizePx, fillMode, stroke, lw) {
    const h = (sizePx * Math.sqrt(3)) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + h * 0.55);
    ctx.lineTo(cx - sizePx / 2, cy - h * 0.45);
    ctx.lineTo(cx + sizePx / 2, cy - h * 0.45);
    ctx.closePath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.fillStyle = "#111";
    if (fillMode === "alta") {
      ctx.fill();
      ctx.stroke();
    } else if (fillMode === "media") {
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + h * 0.55);
      ctx.lineTo(cx - sizePx / 2, cy - h * 0.45);
      ctx.lineTo(cx, cy - h * 0.45);
      ctx.closePath();
      ctx.fillStyle = "#111";
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawNbrSymbol(ctx, pt, ppm, selected, strokeColor, globalScale = 1) {
    const n = normalizePoint(pt);
    const esc = clampEscala(n.escala) * clampEscala(globalScale);
    const cx = n.x * ppm;
    const cy = n.y * ppm;
    const stroke = selected ? "#f57c00" : strokeColor || "#111";
    const lw = Math.max(1.1, Math.min(2.8, ppm * 0.028 * Math.sqrt(esc))) * (selected ? 1.35 : 1);
    const px = (m) => m * esc * ppm;
    const fontPx = (m) => Math.max(7, Math.min(22, Math.round(px(m) * 0.9)));
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (n.tipo === "lampada") {
      const r = px(n.variante === "arandela" ? SYM_M.arandelaR : SYM_M.luzR);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      const pot = Math.round(Number(n.potenciaVA) || 20);
      const circNum = n.circuitoId ? String(n.circuitoId).replace(/^C/i, "") : "";
      const cmd = String(n.interruptor || "").toLowerCase();
      const bot = [circNum, cmd].filter(Boolean).join(" ");
      ctx.fillStyle = stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${fontPx(n.variante === "arandela" ? SYM_M.arandelaR : SYM_M.luzR)}px Segoe UI, sans-serif`;
      ctx.fillText(String(pot), cx, cy - r * 0.38);
      ctx.font = `${Math.max(7, fontPx(SYM_M.luzR) - 1)}px Segoe UI, sans-serif`;
      ctx.fillText(bot || "·", cx, cy + r * 0.4);
    } else if (n.tipo === "interruptor") {
      const r = px(SYM_M.intR);
      const tick = r * 0.45;
      const cmds = syncComandos(n);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fill();
      ctx.stroke();
      const v = n.variante || "simples";
      ctx.beginPath();
      if (v === "duplo" || v === "bipolar") {
        ctx.moveTo(cx - tick, cy - tick * 0.45);
        ctx.lineTo(cx + tick, cy - tick * 0.45);
        ctx.moveTo(cx - tick, cy + tick * 0.45);
        ctx.lineTo(cx + tick, cy + tick * 0.45);
      } else if (v === "triplo") {
        ctx.moveTo(cx - tick, cy - tick * 0.55);
        ctx.lineTo(cx + tick, cy - tick * 0.55);
        ctx.moveTo(cx - tick, cy);
        ctx.lineTo(cx + tick, cy);
        ctx.moveTo(cx - tick, cy + tick * 0.55);
        ctx.lineTo(cx + tick, cy + tick * 0.55);
      } else if (v === "paralelo" || v === "intermediario") {
        ctx.moveTo(cx - tick, cy);
        ctx.lineTo(cx + tick, cy);
        ctx.moveTo(cx, cy - tick);
        ctx.lineTo(cx, cy + tick);
      } else if (v === "dimmer") {
        ctx.moveTo(cx - tick, cy + tick * 0.5);
        ctx.lineTo(cx + tick, cy - tick * 0.5);
      } else {
        ctx.moveTo(cx - tick, cy);
        ctx.lineTo(cx + tick, cy);
      }
      ctx.stroke();
      // letras de comando ao lado (a / a·b / a·b·c)
      ctx.fillStyle = selected ? "#c45c00" : "#222";
      ctx.font = `bold ${fontPx(0.13)}px Segoe UI, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(cmds.join("·"), cx + r + 3, cy);
    } else if (n.tipo === "tomada") {
      const size = px(SYM_M.tomada);
      const cfg = syncModulosConfig(n);
      drawTrianguloTomada(ctx, cx, cy, size, nivelTomada(n.alturaM), stroke, lw);
      const nMod = cfg.length || 1;
      ctx.fillStyle = stroke;
      ctx.font = `bold ${fontPx(0.11)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const ampTag = cfg.some((m) => m.amperagem >= 20) ? "20" : "";
      ctx.fillText(nMod > 1 ? `T${nMod}${ampTag}` : ampTag || "", cx, cy + size * 0.55);
    } else if (n.tipo === "conjugado") {
      const size = px(SYM_M.conjTom);
      const ri = px(SYM_M.conjIntR);
      drawTrianguloTomada(ctx, cx + ri * 0.55, cy + ri * 0.25, size, nivelTomada(n.alturaM), stroke, lw);
      ctx.beginPath();
      ctx.arc(cx - ri * 0.7, cy - ri * 0.5, ri, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - ri * 1.2, cy - ri * 0.5);
      ctx.lineTo(cx - ri * 0.2, cy - ri * 0.5);
      ctx.stroke();
    } else if (n.tipo === "qdc") {
      const w = px(SYM_M.qdcW);
      const h = px(SYM_M.qdcH);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, cy - h / 2);
      ctx.lineTo(cx + w / 2, cy + h / 2);
      ctx.stroke();
      ctx.fillStyle = stroke;
      ctx.font = `bold ${fontPx(0.14)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("QD", cx, cy - h / 2 - 2);
    } else if (n.tipo === "chuveiro" || n.tipo === "torneira") {
      const size = px(SYM_M.carga);
      drawTrianguloTomada(ctx, cx, cy, size, "alta", stroke, lw);
      ctx.fillStyle = stroke;
      ctx.font = `bold ${fontPx(0.12)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("CH", cx, cy + size * 0.55);
    } else if (n.tipo === "ar" || n.tipo === "fogao" || n.tipo === "exaustor") {
      const size = px(SYM_M.carga);
      drawTrianguloTomada(ctx, cx, cy, size, "alta", stroke, lw);
      ctx.fillStyle = stroke;
      ctx.font = `bold ${fontPx(0.12)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(n.tipo === "ar" ? "AC" : n.tipo === "fogao" ? "FG" : "EX", cx, cy + size * 0.55);
    } else if (n.tipo === "sensor" || n.tipo === "campainha") {
      const r = px(SYM_M.intR);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = stroke;
      ctx.font = `bold ${fontPx(0.12)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.tipo === "sensor" ? "S" : "C", cx, cy);
    } else {
      const r = px(SYM_M.intR);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.fill();
      ctx.stroke();
    }

    if (n.tipo !== "lampada" && n.tipo !== "interruptor") {
      ctx.fillStyle = selected ? "#c45c00" : "#222";
      ctx.font = `${fontPx(0.14)}px Segoe UI, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const parts = [];
      if (n.tipo === "tomada") {
        const cfg = n.modulosConfig || [];
        const circs = cfg.map((m) => (m.circuitoId || "").replace(/^C/i, "")).filter(Boolean);
        if (circs.length) parts.push(circs.join("/"));
        else if (n.circuitoId) parts.push(String(n.circuitoId).replace(/^C/i, ""));
        // sem letra de comando — tomada não comanda iluminação
      } else if (n.tipo === "conjugado") {
        const cmds = syncComandos(n);
        if (cmds.length) parts.push(cmds.join("·"));
        if (n.circuitoId) parts.push(String(n.circuitoId).replace(/^C/i, ""));
      } else {
        const circNum = n.circuitoId ? String(n.circuitoId).replace(/^C/i, "") : "";
        if (n.tipo === "chuveiro" || n.tipo === "ar") {
          if (n.potenciaVA) parts.push(String(Math.round(n.potenciaVA)));
        }
        if (circNum) parts.push(circNum);
        if (n.usoTue) {
          const u = usoTueById(n.usoTue);
          if (u) parts.push(u.label.split(" ")[0]);
        }
      }
      const tag = parts.join(" ");
      const ox = px(SYM_M.tomada) * 0.55;
      if (tag) ctx.fillText(tag, cx + ox, cy - 2);
    }
    ctx.restore();
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
      circ.caminhos = []; // polilinhas QDC→ponto (para desenhar cada fio)
      const conduitesDoCirc = new Set();
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
            conduitesDoCirc.add(e.conduitId);
          });
          const pathPts = pathPointsFromPrev(graph, fromQdc.prev, ni);
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
    if (!Array.isArray(projeto.walls)) projeto.walls = [];
    if (!Array.isArray(projeto.dims)) projeto.dims = [];
    if (!Array.isArray(projeto.guides)) projeto.guides = [];
    projeto.symbolScale = clampEscala(projeto.symbolScale == null ? 1 : projeto.symbolScale);
    projeto.points = (projeto.points || []).map(normalizePoint);

    let tool = "select";
    let placeTipo = "tomada";
    let placeArch = "porta";
    let placePreset = null; // variante escolhida na barra superior
    let ppm = PPM_DEFAULT;
    let pan = { x: 40, y: 40 };
    let drag = null;
    let conduitDraft = null;
    let lineDraft = null;
    let measureDraft = null;
    let snapGuides = null;
    let inferSnap = null; // {x,y,kind,seg} — travinha SketchUp
    let selectedId = null;
    let selectedKind = null;
    let selectedCircuitId = null; // highlight de caminho do circuito
    let hover = null;
    let lengthBuffer = "";
    let hotkeys = loadHotkeys();
    let capturingHotkeyId = null;

    const save = () => {
      projeto.updatedAt = Date.now();
      ctx.onSave?.(projeto);
    };

    function loadHotkeys() {
      try {
        const raw = localStorage.getItem(HOTKEY_STORAGE);
        if (!raw) return { ...DEFAULT_HOTKEYS };
        return { ...DEFAULT_HOTKEYS, ...JSON.parse(raw) };
      } catch {
        return { ...DEFAULT_HOTKEYS };
      }
    }

    function persistHotkeys() {
      try {
        localStorage.setItem(HOTKEY_STORAGE, JSON.stringify(hotkeys));
      } catch {
        /* ignore */
      }
    }

    function roundCm(v) {
      return Math.round(Number(v) / GRID_M) * GRID_M;
    }

    function visualGridStep() {
      const minPx = 9;
      const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
      for (const s of steps) if (s * ppm >= minPx) return s;
      return 5;
    }

    const worldFromEvent = (e, canvas) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left - pan.x) / ppm;
      const y = (e.clientY - r.top - pan.y) / ppm;
      return {
        x: roundCm(x),
        y: roundCm(y),
        rawX: x,
        rawY: y
      };
    };

    /** Zoom apontando para o cursor (mundo sob o mouse permanece fixo na tela) */
    function zoomAt(clientX, clientY, factor) {
      const canvas = root.querySelector("#peCanvas");
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const mx = clientX - r.left;
      const my = clientY - r.top;
      const worldX = (mx - pan.x) / ppm;
      const worldY = (my - pan.y) / ppm;
      const next = Math.max(PPM_MIN, Math.min(PPM_MAX, ppm * factor));
      if (Math.abs(next - ppm) < 1e-6) return;
      ppm = next;
      pan.x = mx - worldX * ppm;
      pan.y = my - worldY * ppm;
      paint();
    }

    function updateSymbolScaleLabel() {
      const el = root.querySelector("#peSymVal");
      if (el) el.textContent = `${Math.round(clampEscala(projeto.symbolScale) * 100)}%`;
    }

    function bumpSymbolScale(delta) {
      projeto.symbolScale = clampEscala(clampEscala(projeto.symbolScale) + delta);
      updateSymbolScaleLabel();
      save();
      paint();
      if (!selectedId || !selectedKind) refreshSelectionUI();
    }

    function bumpPointScale(delta) {
      if (selectedKind !== "point" || !selectedId) return;
      const p = projeto.points.find((x) => x.id === selectedId);
      if (!p) return;
      p.escala = clampEscala(clampEscala(p.escala) + delta);
      save();
      paint();
      refreshSelectionUI();
    }

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
              <button type="button" data-tool="line" class="pe-tool" title="Linha / parede">Linha</button>
              <button type="button" data-tool="measure" class="pe-tool" title="Trena (medir e guias)">Trena</button>
              <button type="button" data-tool="conduit" class="pe-tool" title="Conduíte">Conduíte</button>
              <button type="button" data-tool="erase" class="pe-tool danger" title="Borracha — apaga trecho de linha">Borracha</button>
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
              <span class="pe-sym-scale" title="Tamanho dos símbolos na planta (não altera o zoom)">
                <button type="button" class="btn btn-secondary btn-sm" id="peSymOut" aria-label="Diminuir símbolos">Símb −</button>
                <span class="pe-sym-scale-val" id="peSymVal">100%</span>
                <button type="button" class="btn btn-secondary btn-sm" id="peSymIn" aria-label="Aumentar símbolos">Símb +</button>
              </span>
              <button type="button" class="btn btn-secondary btn-sm" id="peZoomOut" title="Zoom out">−</button>
              <button type="button" class="btn btn-secondary btn-sm" id="peZoomIn" title="Zoom in">+</button>
              <button type="button" class="btn btn-primary btn-sm" id="peAnalisar">Analisar NBR 5410</button>
            </div>
          </div>
          <div class="pe-body">
            <div class="pe-canvas-wrap">
              <canvas id="peCanvas" width="900" height="560"></canvas>
              <div class="pe-hint" id="peHint">Grade 1 cm · Clique = selecionar · Arraste = mover · Edite no painel à direita</div>
              <div class="pe-vcb" id="peVcb" hidden title="Digite a distância e Enter (ex: 1.2 ou 80cm)"></div>
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
      lineDraft = null;
      if (tool !== "measure") measureDraft = null;
      snapGuides = null;
      inferSnap = null;
      root.querySelectorAll(".pe-tool").forEach((btn) => {
        let active = btn.dataset.tool === tool;
        if (tool === "place") active = active && btn.dataset.tipo === placeTipo;
        if (tool === "arch") active = active && btn.dataset.arch === placeArch;
        btn.classList.toggle("active", !!active);
      });
      const labels = {
        select: "clique seleciona · arraste para mover · paredes magnetizam · edição no painel",
        room: "cômodo — arraste para desenhar (bordas se encaixam nas vizinhas)",
        arch: `${tipoArch(placeArch).label} — clique na parede (cola) · pontas laranja · R = girar`,
        line: "linha — vértices; digite distância + Enter; Enter/duplo clique termina",
        measure: "trena — clique na ponta/aresta (travinha) · perpendicular · .1=10cm · pode partir de outra trena",
        conduit: "conduíte — vértices; digite distância + Enter; Enter/duplo clique termina",
        erase: "borracha — clique/arraste sobre linha, guia ou cota",
        place: `${tipoPonto(placeTipo).label} — escolha a variante nos botões ao lado e clique no grid`,
        delete: "apagar — clique no elemento inteiro"
      };
      const hint = root.querySelector("#peHint");
      if (hint) {
        const hk = HOTKEY_DEFS.find(
          (d) =>
            d.tool === tool &&
            (tool !== "arch" || d.arch === placeArch)
        );
        const key = hk && hotkeys[hk.id] ? ` [${String(hotkeys[hk.id]).toUpperCase()}]` : "";
        hint.textContent = `Grade 1 cm · ${labels[tool] || tool}${key}`;
      }
      const wrap = root.querySelector(".pe-canvas-wrap");
      if (wrap) wrap.classList.toggle("pe-erase-cursor", tool === "erase");
      clearLengthBuffer();
      renderToolbarVariants();
      paint();
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
        const canvas = root.querySelector("#peCanvas");
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
      };
      root.querySelector("#peZoomOut").onclick = () => {
        const canvas = root.querySelector("#peCanvas");
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2);
      };
      root.querySelector("#peSymIn").onclick = () => bumpSymbolScale(0.1);
      root.querySelector("#peSymOut").onclick = () => bumpSymbolScale(-0.1);
      updateSymbolScaleLabel();
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
          const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
          zoomAt(e.clientX, e.clientY, factor);
        },
        { passive: false }
      );
      window.addEventListener("keydown", onKey);
    }

    function onKey(e) {
      if (!document.body.contains(root)) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Captura de atalho no painel
      if (capturingHotkeyId) {
        e.preventDefault();
        if (e.key === "Escape") {
          capturingHotkeyId = null;
          refreshSelectionUI();
          return;
        }
        if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
          const k = e.key.toLowerCase();
          Object.keys(hotkeys).forEach((id) => {
            if (hotkeys[id] === k && id !== capturingHotkeyId) hotkeys[id] = "";
          });
          hotkeys[capturingHotkeyId] = k;
          persistHotkeys();
          capturingHotkeyId = null;
          refreshSelectionUI();
          ctx.toast?.("Atalho salvo");
        }
        return;
      }

      // Digitação de distância (SketchUp): 1.5 / 80cm / 1200mm
      const typingLen =
        (tool === "measure" && measureDraft?.a) ||
        (tool === "line" && lineDraft?.points?.length) ||
        (tool === "conduit" && conduitDraft?.points?.length);
      if (typingLen) {
        if (/^[0-9]$/.test(e.key) || e.key === "." || e.key === ",") {
          e.preventDefault();
          lengthBuffer += e.key === "," ? "." : e.key;
          updateVcb();
          // preview na trena (perpendicular à parede)
          if (tool === "measure" && measureDraft?.a) {
            const len = parseLengthInput(lengthBuffer);
            if (len != null) {
              const toward = hover
                ? { x: hover.rawX ?? hover.x, y: hover.rawY ?? hover.y }
                : measureDraft.b;
              measureDraft.b = measureEndPoint(measureDraft, toward, len);
              paint();
            }
          }
          return;
        }
        if (e.key === "Backspace" && lengthBuffer) {
          e.preventDefault();
          lengthBuffer = lengthBuffer.slice(0, -1);
          updateVcb();
          paint();
          return;
        }
        if (e.key === "Enter" && lengthBuffer) {
          e.preventDefault();
          if (applyTypedLength()) return;
        }
      }

      if (e.key === "Enter" && !lengthBuffer && tool === "conduit" && conduitDraft?.points?.length >= 2)
        finishConduit();
      if (e.key === "Enter" && !lengthBuffer && tool === "line" && lineDraft?.points?.length >= 2)
        finishLine();
      if (e.key === "Escape") {
        conduitDraft = null;
        lineDraft = null;
        measureDraft = null;
        snapGuides = null;
        inferSnap = null;
        drag = null;
        clearLengthBuffer();
        paint();
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        // Espaço = só cursor (ferramenta Mover), sem pan
        conduitDraft = null;
        lineDraft = null;
        measureDraft = null;
        snapGuides = null;
        inferSnap = null;
        drag = null;
        clearLengthBuffer();
        selectedId = null;
        selectedKind = null;
        setTool("select");
        refreshSelectionUI();
        paint();
        ctx.toast?.("Cursor (Mover)");
        return;
      }
      if ((e.key === "r" || e.key === "R") && selectedKind === "arch" && selectedId) {
        const a = projeto.arch.find((x) => x.id === selectedId);
        if (a) {
          a.angulo = ((Number(a.angulo) || 0) + 90) % 360;
          save();
          paint();
          refreshSelectionUI();
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !lengthBuffer) {
        deleteSelected();
        return;
      }

      // Atalhos de ferramenta
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        const def = HOTKEY_DEFS.find((d) => (hotkeys[d.id] || "").toLowerCase() === k);
        if (def) {
          e.preventDefault();
          clearLengthBuffer();
          activateHotkey(def);
        }
      }
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

    function finishLine() {
      if (!lineDraft || lineDraft.points.length < 2) {
        lineDraft = null;
        paint();
        return;
      }
      projeto.walls.push({
        id: typeof uid === "function" ? uid("wl") : `wl-${Date.now()}`,
        points: lineDraft.points
      });
      lineDraft = null;
      save();
      paint();
      renderSide();
    }

    function newId(prefix) {
      return typeof uid === "function" ? uid(prefix) : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }

    function collectSnapEdges(excludeRoomId) {
      const vertical = [];
      const horizontal = [];
      const pushPt = (p) => {
        if (!p) return;
        vertical.push(p.x);
        horizontal.push(p.y);
      };
      (projeto.rooms || []).forEach((o) => {
        if (o.id === excludeRoomId) return;
        vertical.push(o.x, o.x + o.w);
        horizontal.push(o.y, o.y + o.h);
      });
      (projeto.walls || []).forEach((wall) => {
        const pts = wall.points || [];
        for (let i = 0; i < pts.length; i++) {
          pushPt(pts[i]);
          if (i > 0) {
            if (Math.abs(pts[i].x - pts[i - 1].x) < 1e-6) vertical.push(pts[i].x);
            if (Math.abs(pts[i].y - pts[i - 1].y) < 1e-6) horizontal.push(pts[i].y);
          }
        }
      });
      // Portas/janelas — mesmas referências de aresta que paredes
      (projeto.arch || []).forEach((a) => {
        archSnapGeometry(a).points.forEach(pushPt);
      });
      // Cotas da trena
      (projeto.dims || []).forEach((d) => {
        pushPt(d.a);
        pushPt(d.b);
        if (Math.abs(d.a.x - d.b.x) < 1e-6) vertical.push(d.a.x);
        if (Math.abs(d.a.y - d.b.y) < 1e-6) horizontal.push(d.a.y);
      });
      (projeto.guides || []).forEach((g) => {
        if (g.axis === "v") vertical.push(g.value);
        if (g.axis === "h") horizontal.push(g.value);
      });
      return { vertical, horizontal };
    }

    function nearestSnap(value, targets, thr) {
      let best = null;
      for (const t of targets) {
        const d = t - value;
        if (Math.abs(d) <= thr && (best == null || Math.abs(d) < Math.abs(best.d))) {
          best = { d, t };
        }
      }
      return best;
    }

    /** Magnetiza paredes de cômodos (e linhas/guias) para juntar uma na outra. */
    function applyRoomEdgeSnap(r, mode) {
      const { vertical, horizontal } = collectSnapEdges(r.id);
      const thr = WALL_SNAP_M;
      const guides = { v: [], h: [] };
      if (mode === "move" || mode === "resize") {
        const sL = nearestSnap(r.x, vertical, thr);
        const sR = nearestSnap(r.x + r.w, vertical, thr);
        if (sL && sR) {
          if (Math.abs(sL.d) <= Math.abs(sR.d)) {
            r.x = sL.t;
            guides.v.push(sL.t);
          } else {
            r.x = sR.t - r.w;
            guides.v.push(sR.t);
          }
        } else if (sL) {
          r.x = sL.t;
          guides.v.push(sL.t);
        } else if (sR) {
          r.x = sR.t - r.w;
          guides.v.push(sR.t);
        }
        const sT = nearestSnap(r.y, horizontal, thr);
        const sB = nearestSnap(r.y + r.h, horizontal, thr);
        if (sT && sB) {
          if (Math.abs(sT.d) <= Math.abs(sB.d)) {
            r.y = sT.t;
            guides.h.push(sT.t);
          } else {
            r.y = sB.t - r.h;
            guides.h.push(sB.t);
          }
        } else if (sT) {
          r.y = sT.t;
          guides.h.push(sT.t);
        } else if (sB) {
          r.y = sB.t - r.h;
          guides.h.push(sB.t);
        }
      }
      snapGuides = guides.v.length || guides.h.length ? guides : null;
      return r;
    }

    function archEndpoints(a) {
      const ang = ((Number(a.angulo) || 0) * Math.PI) / 180;
      const half = Math.max(0.1, Number(a.largura) || 0.8) / 2;
      const dx = Math.cos(ang) * half;
      const dy = Math.sin(ang) * half;
      return [
        { id: "a", x: a.x - dx, y: a.y - dy },
        { id: "b", x: a.x + dx, y: a.y + dy }
      ];
    }

    /** Pontos e segmentos de porta/janela (soleira + ponta do arco) — referência CAD. */
    function archSnapGeometry(a) {
      const ends = archEndpoints(a);
      const ang = ((Number(a.angulo) || 0) * Math.PI) / 180;
      const L = Math.max(0.1, Number(a.largura) || 0.8);
      const hinge = ends[0];
      const latch = ends[1];
      const mid = { x: a.x, y: a.y };
      // ponta do arco de abertura (local −Y a partir do batente)
      const tip = {
        x: hinge.x + Math.cos(ang - Math.PI / 2) * L,
        y: hinge.y + Math.sin(ang - Math.PI / 2) * L
      };
      const points = [
        { ...hinge, kind: "end", label: "batente" },
        { ...latch, kind: "end", label: "fecho" },
        { ...mid, kind: "mid", label: "meio" },
        { ...tip, kind: "end", label: "arco" }
      ];
      const segs = [
        { a: hinge, b: latch, source: "arch" },
        { a: hinge, b: tip, source: "arch-swing" }
      ];
      return { points, segs };
    }

    function collectSegments(excludeRoomId) {
      const segs = [];
      (projeto.rooms || []).forEach((r) => {
        if (r.id === excludeRoomId) return;
        const x2 = r.x + r.w;
        const y2 = r.y + r.h;
        segs.push(
          { a: { x: r.x, y: r.y }, b: { x: x2, y: r.y }, source: "room" },
          { a: { x: x2, y: r.y }, b: { x: x2, y: y2 }, source: "room" },
          { a: { x: x2, y: y2 }, b: { x: r.x, y: y2 }, source: "room" },
          { a: { x: r.x, y: y2 }, b: { x: r.x, y: r.y }, source: "room" }
        );
      });
      (projeto.walls || []).forEach((wall) => {
        const pts = wall.points || [];
        for (let i = 1; i < pts.length; i++)
          segs.push({ a: pts[i - 1], b: pts[i], source: "wall" });
      });
      (projeto.arch || []).forEach((a) => {
        archSnapGeometry(a).segs.forEach((s) => segs.push(s));
      });
      // Trena existente: pode puxar outra trena a partir dela
      (projeto.dims || []).forEach((d) => {
        if (d?.a && d?.b) segs.push({ a: d.a, b: d.b, source: "dim" });
      });
      // Guias infinitas (trecho longo para snap/normal)
      (projeto.guides || []).forEach((g) => {
        if (g.axis === "v")
          segs.push({
            a: { x: g.value, y: -200 },
            b: { x: g.value, y: 200 },
            source: "guide"
          });
        if (g.axis === "h")
          segs.push({
            a: { x: -200, y: g.value },
            b: { x: 200, y: g.value },
            source: "guide"
          });
      });
      return segs;
    }

    function collectInferencePoints(excludeRoomId) {
      const pts = [];
      collectSegments(excludeRoomId).forEach((s) => {
        pts.push({ x: s.a.x, y: s.a.y, kind: "end", seg: s });
        pts.push({ x: s.b.x, y: s.b.y, kind: "end", seg: s });
        pts.push({
          x: (s.a.x + s.b.x) / 2,
          y: (s.a.y + s.b.y) / 2,
          kind: "mid",
          seg: s
        });
      });
      (projeto.arch || []).forEach((a) => {
        archSnapGeometry(a).points.forEach((p) => {
          pts.push({ x: p.x, y: p.y, kind: p.kind, seg: archSnapGeometry(a).segs[0], label: p.label });
        });
      });
      return pts;
    }

    function projectOnSeg(p, a, b) {
      const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (l2 < 1e-12) return { x: a.x, y: a.y, t: 0 };
      let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), t };
    }

    function segAngleDeg(a, b) {
      let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      ang = ((ang % 360) + 360) % 360;
      const snapped = Math.round(ang / 90) * 90;
      return snapped % 360;
    }

    /** Snap em grade 1 cm + arestas/pontas (porta, trena, guia, parede). */
    function snapToGeometry(pt, opts = {}) {
      const thr = opts.thr ?? SEG_SNAP_M;
      const endThr = opts.endThr ?? Math.max(thr, 0.16);
      const segs = collectSegments(opts.excludeRoomId || null);
      const inferPts = collectInferencePoints(opts.excludeRoomId || null);
      let best = null;

      // 1) Pontos de inferência (extremidade / meio) — prioridade máxima
      inferPts.forEach((ip) => {
        const d = dist(pt, ip);
        const lim = ip.kind === "end" ? endThr : thr;
        const prio = ip.kind === "end" ? 0 : 1;
        if (d > lim) return;
        if (
          !best ||
          prio < best.prio ||
          (prio === best.prio && d < best.d - 1e-9)
        ) {
          best = {
            d,
            prio,
            x: ip.x,
            y: ip.y,
            kind: ip.kind,
            segAngle: ip.seg ? segAngleDeg(ip.seg.a, ip.seg.b) : null,
            seg: ip.seg || null,
            label: ip.label || null
          };
        }
      });

      // 2) Sobre a aresta
      segs.forEach((s) => {
        const proj = projectOnSeg(pt, s.a, s.b);
        const d = dist(pt, proj);
        if (d <= thr && (!best || best.prio > 2 || (best.prio === 2 && d < best.d - 1e-9))) {
          if (!best || best.prio >= 2) {
            best = {
              d,
              prio: 2,
              x: proj.x,
              y: proj.y,
              kind: "seg",
              segAngle: segAngleDeg(s.a, s.b),
              seg: s
            };
          }
        }
      });

      const { vertical, horizontal } = collectSnapEdges(opts.excludeRoomId || null);
      const sx = nearestSnap(pt.x, vertical, WALL_SNAP_M);
      const sy = nearestSnap(pt.y, horizontal, WALL_SNAP_M);
      const guides = { v: [], h: [] };
      let out = { x: roundCm(pt.x), y: roundCm(pt.y), segAngle: null, kind: "grid", seg: null };

      if (best) {
        out = {
          x: roundCm(best.x),
          y: roundCm(best.y),
          segAngle: best.segAngle,
          kind: best.kind,
          seg: best.seg,
          label: best.label || null
        };
        if (best.seg) {
          if (Math.abs(best.seg.a.x - best.seg.b.x) < 1e-6) guides.v.push(best.seg.a.x);
          if (Math.abs(best.seg.a.y - best.seg.b.y) < 1e-6) guides.h.push(best.seg.a.y);
        }
      } else {
        if (sx) {
          out.x = sx.t;
          guides.v.push(sx.t);
          out.kind = "guide";
          out.seg = {
            a: { x: sx.t, y: pt.y - 1 },
            b: { x: sx.t, y: pt.y + 1 },
            source: "guide"
          };
        }
        if (sy) {
          out.y = sy.t;
          guides.h.push(sy.t);
          out.kind = "guide";
          out.seg = {
            a: { x: pt.x - 1, y: sy.t },
            b: { x: pt.x + 1, y: sy.t },
            source: "guide"
          };
        }
      }

      snapGuides = guides.v.length || guides.h.length ? guides : null;
      if (out.kind && out.kind !== "grid") {
        inferSnap = { x: out.x, y: out.y, kind: out.kind, seg: out.seg, label: out.label };
      } else {
        inferSnap = null;
      }
      return out;
    }

    function snapPointToEdges(pt) {
      return snapToGeometry(pt);
    }

    function axisAlignPoint(from, to) {
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      const thr = Math.max(WALL_SNAP_M, GRID_M * 2);
      if (dx < thr && dy >= dx) return { x: from.x, y: to.y };
      if (dy < thr && dx > dy) return { x: to.x, y: from.y };
      return { x: to.x, y: to.y };
    }

    function parseLengthInput(s) {
      let t = String(s || "")
        .trim()
        .toLowerCase()
        .replace(",", ".");
      if (!t || t === ".") return null;
      // ",1" / ".1" → 0.1 m (10 cm)
      if (t.startsWith(".")) t = "0" + t;
      const m = t.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i);
      if (!m) return null;
      let v = Number(m[1]);
      if (!Number.isFinite(v) || v <= 0) return null;
      const u = (m[2] || "m").toLowerCase();
      if (u === "mm") v /= 1000;
      else if (u === "cm") v /= 100;
      return v;
    }

    function normalFromSeg(seg) {
      if (!seg?.a || !seg?.b) return null;
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const L = Math.hypot(dx, dy);
      if (L < 1e-9) return null;
      // perpendicular unitário à parede de origem
      return { x: -dy / L, y: dx / L };
    }

    /** Direção da trena: sempre perpendicular à parede de origem (lado do cursor). */
    function measureDir(draft, toward) {
      if (draft?.normal) {
        let n = { x: draft.normal.x, y: draft.normal.y };
        if (toward) {
          const vx = toward.x - draft.a.x;
          const vy = toward.y - draft.a.y;
          if (n.x * vx + n.y * vy < 0) n = { x: -n.x, y: -n.y };
        }
        return n;
      }
      return directionFrom(draft.a, toward);
    }

    function measureEndPoint(draft, toward, fixedLen) {
      const dir = measureDir(draft, toward);
      if (fixedLen != null && Number.isFinite(fixedLen)) {
        return {
          x: roundCm(draft.a.x + dir.x * fixedLen),
          y: roundCm(draft.a.y + dir.y * fixedLen)
        };
      }
      if (!toward) return { x: draft.a.x + dir.x, y: draft.a.y + dir.y };
      const vx = toward.x - draft.a.x;
      const vy = toward.y - draft.a.y;
      const t = Math.max(0, vx * dir.x + vy * dir.y);
      return {
        x: roundCm(draft.a.x + dir.x * t),
        y: roundCm(draft.a.y + dir.y * t)
      };
    }

    function updateVcb() {
      const el = root.querySelector("#peVcb");
      if (!el) return;
      if (!lengthBuffer) {
        el.hidden = true;
        el.textContent = "";
        return;
      }
      el.hidden = false;
      el.textContent = lengthBuffer;
    }

    function clearLengthBuffer() {
      lengthBuffer = "";
      updateVcb();
    }

    function directionFrom(from, toward) {
      if (!toward) return { x: 1, y: 0 };
      const aligned = axisAlignPoint(from, toward);
      let dx = aligned.x - from.x;
      let dy = aligned.y - from.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) return { x: 1, y: 0 };
      return { x: dx / d, y: dy / d };
    }

    /** Digitar distância (estilo SketchUp VCB) na trena ou linha. */
    function applyTypedLength() {
      const len = parseLengthInput(lengthBuffer);
      if (len == null) return false;
      if (tool === "measure" && measureDraft?.a) {
        const toward = hover ? { x: hover.rawX ?? hover.x, y: hover.rawY ?? hover.y } : measureDraft.b;
        const b = measureEndPoint(measureDraft, toward, len);
        clearLengthBuffer();
        finishMeasure(b, len);
        return true;
      }
      if (tool === "line" && lineDraft?.points?.length) {
        const last = lineDraft.points[lineDraft.points.length - 1];
        const dir = directionFrom(last, hover ? { x: hover.x, y: hover.y } : null);
        const next = { x: roundCm(last.x + dir.x * len), y: roundCm(last.y + dir.y * len) };
        if (dist(last, next) > 0.005) lineDraft.points.push(next);
        clearLengthBuffer();
        paint();
        ctx.toast?.(`Linha: ${len.toFixed(2)} m`);
        return true;
      }
      if (tool === "conduit" && conduitDraft?.points?.length) {
        const last = conduitDraft.points[conduitDraft.points.length - 1];
        const dir = directionFrom(last, hover ? { x: hover.x, y: hover.y } : null);
        const next = { x: roundCm(last.x + dir.x * len), y: roundCm(last.y + dir.y * len) };
        if (dist(last, next) > 0.005) conduitDraft.points.push(next);
        clearLengthBuffer();
        paint();
        return true;
      }
      return false;
    }

    function activateHotkey(def) {
      if (!def) return;
      if (def.tool === "arch") setTool("arch", null, def.arch);
      else setTool(def.tool);
      ctx.toast?.(`${def.label} (${(hotkeys[def.id] || "").toUpperCase()})`);
    }

    function removePolylineSegment(list, makeItem, w, thr, seen) {
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        const pts = item.points || [];
        for (let j = 1; j < pts.length; j++) {
          const segKey = `${item.id}:${j}`;
          if (seen?.has(segKey)) continue;
          if (distToSeg({ x: w.rawX, y: w.rawY }, pts[j - 1], pts[j]) > thr) continue;
          seen?.add(segKey);
          const partA = pts.slice(0, j);
          const partB = pts.slice(j);
          list.splice(i, 1);
          if (partA.length >= 2) list.push(makeItem(partA, item));
          if (partB.length >= 2) list.push(makeItem(partB, item));
          return true;
        }
      }
      return false;
    }

    function eraseAt(w, seen) {
      let changed = false;
      if (
        removePolylineSegment(
          projeto.walls,
          (points) => ({ id: newId("wl"), points }),
          w,
          ERASE_M,
          seen
        )
      )
        changed = true;
      else if (
        removePolylineSegment(
          projeto.conduits,
          (points, src) => ({
            id: newId("cd"),
            points,
            circuitoId: src.circuitoId || null,
            cor: src.cor || "#222"
          }),
          w,
          ERASE_M,
          seen
        )
      )
        changed = true;
      else {
        for (let i = (projeto.dims || []).length - 1; i >= 0; i--) {
          const d = projeto.dims[i];
          if (distToSeg({ x: w.rawX, y: w.rawY }, d.a, d.b) <= ERASE_M) {
            projeto.dims.splice(i, 1);
            changed = true;
            break;
          }
        }
        if (!changed) {
          for (let i = (projeto.guides || []).length - 1; i >= 0; i--) {
            const g = projeto.guides[i];
            const hit =
              g.axis === "v"
                ? Math.abs(w.rawX - g.value) <= ERASE_M
                : Math.abs(w.rawY - g.value) <= ERASE_M;
            if (hit) {
              projeto.guides.splice(i, 1);
              changed = true;
              break;
            }
          }
        }
      }
      if (changed) {
        save();
        paint();
        renderSide();
      }
      return changed;
    }

    function addGuide(axis, value) {
      const v = Math.round(value * 1000) / 1000;
      if ((projeto.guides || []).some((g) => g.axis === axis && Math.abs(g.value - v) < 1e-6)) return;
      projeto.guides.push({ id: newId("gd"), axis, value: v });
    }

    function finishMeasure(b, fixedLen) {
      if (!measureDraft?.a) return;
      const a = measureDraft.a;
      const toward =
        b ||
        (hover
          ? { x: hover.rawX ?? hover.x, y: hover.rawY ?? hover.y }
          : {
              x: a.x + (measureDraft.normal?.x || 1),
              y: a.y + (measureDraft.normal?.y || 0)
            });
      const resolved = measureEndPoint(
        measureDraft,
        toward,
        fixedLen != null && fixedLen > 0 ? fixedLen : null
      );
      const len = dist(a, resolved);
      if (len < 0.01) {
        measureDraft = null;
        paint();
        return;
      }
      projeto.dims.push({
        id: newId("dm"),
        a: { x: a.x, y: a.y },
        b: { x: resolved.x, y: resolved.y }
      });
      if (Math.abs(resolved.x - a.x) < 1e-6) addGuide("v", a.x);
      if (Math.abs(resolved.y - a.y) < 1e-6) addGuide("h", a.y);
      if (measureDraft.normal) {
        if (Math.abs(measureDraft.normal.x) > 0.7) addGuide("v", resolved.x);
        if (Math.abs(measureDraft.normal.y) > 0.7) addGuide("h", resolved.y);
      }
      measureDraft = null;
      clearLengthBuffer();
      save();
      paint();
      renderSide();
      ctx.toast?.(`Medida: ${len.toFixed(2)} m`);
    }

    function roomHandle(r, w) {
      const hs = 0.12;
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
        const hitR = SYM_M.hit * clampEscala(p.escala) * clampEscala(projeto.symbolScale);
        if (dist(p, { x: w.rawX, y: w.rawY }) <= hitR) return { kind: "point", item: p };
      }
      if (selectedKind === "arch" && selectedId) {
        const selA = (projeto.arch || []).find((x) => x.id === selectedId);
        if (selA) {
          for (const ep of archEndpoints(selA)) {
            if (dist(ep, { x: w.rawX, y: w.rawY }) <= 0.12)
              return { kind: "arch-end", item: selA, handle: ep.id };
          }
        }
      }
      for (let i = (projeto.arch || []).length - 1; i >= 0; i--) {
        const a = projeto.arch[i];
        const hitR = Math.max(0.25, (Number(a.largura) || 0.8) / 2);
        if (dist(a, { x: w.rawX, y: w.rawY }) <= hitR) return { kind: "arch", item: a };
        for (const ep of archEndpoints(a)) {
          if (dist(ep, { x: w.rawX, y: w.rawY }) <= 0.1)
            return { kind: "arch-end", item: a, handle: ep.id };
        }
      }
      for (let i = (projeto.walls || []).length - 1; i >= 0; i--) {
        const wall = projeto.walls[i];
        const pts = wall.points || [];
        for (let j = 1; j < pts.length; j++) {
          if (distToSeg({ x: w.rawX, y: w.rawY }, pts[j - 1], pts[j]) < 0.2)
            return { kind: "wall", item: wall };
        }
      }
      for (let i = projeto.conduits.length - 1; i >= 0; i--) {
        const c = projeto.conduits[i];
        const pts = c.points || [];
        for (let j = 1; j < pts.length; j++) {
          if (distToSeg({ x: w.rawX, y: w.rawY }, pts[j - 1], pts[j]) < 0.2)
            return { kind: "conduit", item: c };
        }
      }
      for (let i = (projeto.dims || []).length - 1; i >= 0; i--) {
        const d = projeto.dims[i];
        if (distToSeg({ x: w.rawX, y: w.rawY }, d.a, d.b) < 0.25) return { kind: "dim", item: d };
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
      if (e.button === 1) {
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
      if (tool === "line") {
        const snapped = snapToGeometry({ x: w.rawX, y: w.rawY });
        if (!lineDraft) lineDraft = { points: [{ x: snapped.x, y: snapped.y }] };
        else {
          const last = lineDraft.points[lineDraft.points.length - 1];
          const next = axisAlignPoint(last, { x: snapped.x, y: snapped.y });
          if (dist(last, next) > GRID_M) lineDraft.points.push({ x: next.x, y: next.y });
        }
        clearLengthBuffer();
        paint();
        return;
      }
      if (tool === "measure") {
        const snapped = snapToGeometry({ x: w.rawX, y: w.rawY });
        if (!measureDraft?.a) {
          measureDraft = {
            a: { x: snapped.x, y: snapped.y },
            b: null,
            // perpendicular à aresta de origem (parede, porta, trena ou guia)
            normal: normalFromSeg(snapped.seg)
          };
          clearLengthBuffer();
          paint();
          if (snapped.kind === "end" || snapped.kind === "mid")
            ctx.toast?.(
              snapped.label
                ? `Ancorado: ${snapped.label}`
                : snapped.seg?.source === "dim"
                  ? "Ancorado na trena"
                  : "Ancorado na ponta"
            );
        } else {
          finishMeasure({ x: snapped.x, y: snapped.y });
        }
        return;
      }
      if (tool === "erase") {
        drag = { type: "erase", seen: new Set() };
        eraseAt(w, drag.seen);
        return;
      }
      if (tool === "arch") {
        const meta = tipoArch(placeArch);
        const snapped = snapToGeometry({ x: w.rawX, y: w.rawY });
        const item = {
          id: typeof uid === "function" ? uid("ar") : `ar-${Date.now()}`,
          tipo: placeArch,
          x: snapped.x,
          y: snapped.y,
          largura: meta.larguraDefault,
          angulo: snapped.segAngle != null ? snapped.segAngle : 0
        };
        projeto.arch.push(item);
        selectedId = item.id;
        selectedKind = "arch";
        save();
        paint();
        refreshSelectionUI();
        ctx.toast?.(
          snapped.kind === "seg" || snapped.kind === "end"
            ? "Encaixado na parede"
            : "Aproxime da parede para colar a ponta"
        );
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

      if (hit.kind === "arch-end") {
        selectedId = hit.item.id;
        selectedKind = "arch";
        drag = {
          type: "move-arch-end",
          id: hit.item.id,
          handle: hit.handle,
          startX: w.x,
          startY: w.y,
          moved: false
        };
        paint();
        refreshSelectionUI();
        return;
      }

      selectedId = hit.item.id;
      selectedKind = hit.kind === "arch-end" ? "arch" : hit.kind;

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
      } else if (hit.kind === "conduit" || hit.kind === "wall" || hit.kind === "dim") {
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
      if (drag?.type === "erase") {
        eraseAt(w, drag.seen);
        return;
      }
      if (drag?.type === "move-room") {
        const r = projeto.rooms.find((x) => x.id === drag.id);
        if (r) {
          r.x = w.x - drag.dx;
          r.y = w.y - drag.dy;
          applyRoomEdgeSnap(r, "move");
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
        r.w = Math.max(ROOM_MIN_M, Math.abs(x2 - x1));
        r.h = Math.max(ROOM_MIN_M, Math.abs(y2 - y1));
        // Snap das arestas movidas
        const { vertical, horizontal } = collectSnapEdges(r.id);
        if (drag.handle.includes("w")) {
          const s = nearestSnap(r.x, vertical, WALL_SNAP_M);
          if (s) {
            const right = r.x + r.w;
            r.x = s.t;
            r.w = Math.max(ROOM_MIN_M, right - r.x);
            snapGuides = { v: [s.t], h: [] };
          }
        }
        if (drag.handle.includes("e")) {
          const s = nearestSnap(r.x + r.w, vertical, WALL_SNAP_M);
          if (s) {
            r.w = Math.max(ROOM_MIN_M, s.t - r.x);
            snapGuides = { v: [s.t], h: snapGuides?.h || [] };
          }
        }
        if (drag.handle.includes("n")) {
          const s = nearestSnap(r.y, horizontal, WALL_SNAP_M);
          if (s) {
            const bottom = r.y + r.h;
            r.y = s.t;
            r.h = Math.max(ROOM_MIN_M, bottom - r.y);
            snapGuides = { v: snapGuides?.v || [], h: [s.t] };
          }
        }
        if (drag.handle.includes("s")) {
          const s = nearestSnap(r.y + r.h, horizontal, WALL_SNAP_M);
          if (s) {
            r.h = Math.max(ROOM_MIN_M, s.t - r.y);
            snapGuides = { v: snapGuides?.v || [], h: [s.t] };
          }
        }
        paint();
        return;
      }
      if (drag?.type === "move-point") {
        const p = projeto.points.find((x) => x.id === drag.id);
        if (p) {
          const sn = snapPointToEdges({ x: w.x, y: w.y });
          p.x = sn.x;
          p.y = sn.y;
          if (dist({ x: w.x, y: w.y }, { x: drag.startX, y: drag.startY }) > DRAG_CLICK_M)
            drag.moved = true;
          paint();
        }
        return;
      }
      if (drag?.type === "move-arch") {
        const a = projeto.arch.find((x) => x.id === drag.id);
        if (a) {
          const sn = snapToGeometry({ x: w.rawX, y: w.rawY });
          // NÃO altera ângulo — mantém a rotação escolhida pelo usuário
          a.x = sn.x;
          a.y = sn.y;
          if (dist({ x: w.x, y: w.y }, { x: drag.startX, y: drag.startY }) > DRAG_CLICK_M)
            drag.moved = true;
          paint();
        }
        return;
      }
      if (drag?.type === "move-arch-end") {
        const a = projeto.arch.find((x) => x.id === drag.id);
        if (a) {
          const sn = snapToGeometry({ x: w.rawX, y: w.rawY });
          // Só cola a ponta; preserva ângulo atual
          const tip = archEndpoints(a).find((ep) => ep.id === drag.handle) || archEndpoints(a)[0];
          a.x = roundCm(a.x + (sn.x - tip.x));
          a.y = roundCm(a.y + (sn.y - tip.y));
          if (dist({ x: w.x, y: w.y }, { x: drag.startX, y: drag.startY }) > DRAG_CLICK_M)
            drag.moved = true;
          paint();
        }
        return;
      }
      if (tool === "conduit" && conduitDraft) paint();
      if (tool === "line") {
        snapToGeometry({ x: w.rawX, y: w.rawY });
        paint();
      }
      if (tool === "measure") {
        const sn = snapToGeometry({ x: w.rawX, y: w.rawY });
        if (measureDraft?.a) {
          const toward = { x: sn.x, y: sn.y };
          const typed = parseLengthInput(lengthBuffer);
          // 2º ponto também magnetiza em pontas/arestas (porta, trena, guia…)
          if (!typed && (sn.kind === "end" || sn.kind === "mid")) {
            measureDraft.b = { x: sn.x, y: sn.y };
          } else {
            measureDraft.b = measureEndPoint(measureDraft, toward, typed);
          }
        }
        paint();
      }
    }

    function onUp() {
      if (!drag) return;
      if (drag.type === "room") {
        const x = Math.min(drag.x0, drag.x1);
        const y = Math.min(drag.y0, drag.y1);
        const ww = Math.abs(drag.x1 - drag.x0);
        const hh = Math.abs(drag.y1 - drag.y0);
        if (ww >= ROOM_MIN_M && hh >= ROOM_MIN_M) {
          const room = {
            id: typeof uid === "function" ? uid("rm") : `rm-${Date.now()}`,
            nome: "Cômodo",
            x,
            y,
            w: ww,
            h: hh
          };
          applyRoomEdgeSnap(room, "move");
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
        drag.type === "move-arch-end" ||
        drag.type === "erase" ||
        drag.type === "pan"
      ) {
        if (drag.type !== "pan" && drag.type !== "erase") save();
      }
      drag = null;
      snapGuides = null;
      paint();
      refreshSelectionUI();
    }

    function onDbl(e) {
      if (tool === "conduit") {
        e.preventDefault();
        finishConduit();
      }
      if (tool === "line") {
        e.preventDefault();
        finishLine();
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
      if (selectedKind === "wall")
        projeto.walls = (projeto.walls || []).filter((w) => w.id !== selectedId);
      if (selectedKind === "dim")
        projeto.dims = (projeto.dims || []).filter((d) => d.id !== selectedId);
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
        const g = clampEscala(projeto.symbolScale);
        const hkRows = HOTKEY_DEFS.map((d) => {
          const k = (hotkeys[d.id] || "—").toUpperCase();
          const cap = capturingHotkeyId === d.id;
          return `<div class="pe-hotkey-row">
            <span>${escapeHtml(d.label)}</span>
            <button type="button" class="btn btn-secondary btn-sm pe-hotkey-btn ${cap ? "active" : ""}" data-hotkey="${d.id}">${cap ? "…" : k}</button>
          </div>`;
        }).join("");
        return `<div class="pe-side-block pe-inspector">
          <h3>Propriedades</h3>
          <p class="hint">Clique em um objeto no grid para selecionar. Porta/janela: arraste as <strong>pontas laranja</strong> para colar na parede.</p>
          <div class="pe-size-row">
            <span>Tamanho dos símbolos</span>
            <button type="button" class="btn btn-secondary btn-sm" id="peGlobalScaleDown">−</button>
            <strong id="peGlobalScaleVal">${Math.round(g * 100)}%</strong>
            <button type="button" class="btn btn-secondary btn-sm" id="peGlobalScaleUp">+</button>
          </div>
          <h3 style="margin-top:14px">Atalhos do teclado</h3>
          <div class="pe-hotkeys">${hkRows}</div>
          <p class="hint">Clique na tecla e pressione a letra desejada. Trena/Linha: digite a distância (ex. <strong>1.2</strong> ou <strong>80cm</strong>) + Enter.</p>
          <button type="button" class="btn btn-ghost btn-sm" id="peHotkeysReset">Restaurar atalhos</button>
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
        const cmds = showInt ? syncComandos(pt) : [];
        const modCfg = showTom && pt.tipo === "tomada" ? syncModulosConfig(pt) : [];
        const cmdFields = cmds
          .map(
            (c, i) =>
              `<label>Tecla ${i + 1} → iluminação (letra)
                <input class="pe-cmd-letter" data-cmd="${i}" maxlength="2" value="${escapeHtml(c)}" placeholder="a" />
              </label>`
          )
          .join("");
        const modFields =
          pt.tipo === "tomada"
            ? modCfg
                .map((m, i) => {
                  const isTueM = m.usoCircuito === "tue" || m.amperagem >= 20;
                  return `<div class="pe-mod-block">
              <strong>Módulo ${i + 1}</strong>
              <label>Amperagem
                <select class="pe-mod-amp" data-mod="${i}">
                  ${AMP_TOMADA.map(
                    (a) =>
                      `<option value="${a.id}" ${Number(m.amperagem) === a.id ? "selected" : ""}>${a.label}</option>`
                  ).join("")}
                </select>
              </label>
              <label>Uso
                <select class="pe-mod-uso" data-mod="${i}">
                  <option value="tug" ${!isTueM ? "selected" : ""}>TUG</option>
                  <option value="tue" ${isTueM ? "selected" : ""}>TUE</option>
                </select>
              </label>
              <label>Circuito
                <select class="pe-mod-circ" data-mod="${i}">
                  ${["", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12"]
                    .map(
                      (c) =>
                        `<option value="${c}" ${m.circuitoId === c ? "selected" : ""}>${c || "Automático"}</option>`
                    )
                    .join("")}
                </select>
              </label>
              ${
                isTueM
                  ? `<label>Equipamento TUE
                <select class="pe-mod-tue" data-mod="${i}">
                  <option value="">—</option>
                  ${USOS_TUE.map(
                    (u) =>
                      `<option value="${u.id}" ${m.usoTue === u.id ? "selected" : ""}>${u.label}</option>`
                  ).join("")}
                </select>
              </label>`
                  : ""
              }
            </div>`;
                })
                .join("")
            : "";
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
              pt.tipo === "tomada"
                ? `<label>Módulos tomada
              <select id="pePtMod">${MODULOS_TOMADA.map(
                (m) =>
                  `<option value="${m.id}" ${pt.modulos === m.id ? "selected" : ""}>${m.label}</option>`
              ).join("")}</select></label>
              <p class="hint">Cada módulo se configura abaixo. Tomada <strong>não</strong> tem letra de comando (não comanda luz).</p>
              ${modFields}`
                : ""
            }
            ${
              pt.tipo === "conjugado"
                ? `<label>Modelo conjugado
              <select id="pePtConj">${PRESETS_CONJUGADO.map(
                (c) =>
                  `<option value="${c.id}" ${pt.conjugadoId === c.id ? "selected" : ""}>${c.label}</option>`
              ).join("")}</select></label>
              <label>Módulos tomada
              <select id="pePtMod">${MODULOS_TOMADA.map(
                (m) =>
                  `<option value="${m.id}" ${pt.modulos === m.id ? "selected" : ""}>${m.label}</option>`
              ).join("")}</select></label>`
                : ""
            }
            ${
              showInt
                ? `<label>Tipo interruptor
              <select id="pePtVarInt">${VAR_INTERRUPTOR.map(
                (v) =>
                  `<option value="${v.id}" ${pt.variante === v.id ? "selected" : ""}>${v.label}</option>`
              ).join("")}</select></label>
              <p class="hint">Cada tecla tem uma letra — a mesma letra no ponto de luz liga o comando.</p>
              ${cmdFields}`
                : ""
            }
            ${
              pt.tipo === "lampada"
                ? `<label>Luminária
              <select id="pePtVar">${VAR_LAMPADA.map(
                (v) =>
                  `<option value="${v.id}" ${pt.variante === v.id ? "selected" : ""}>${v.label}</option>`
              ).join("")}</select></label>
              <label>Comando (letra)<input id="pePtInt" maxlength="2" value="${escapeHtml(pt.interruptor || "")}" /></label>
              <p class="hint">Use a mesma letra do interruptor (ex.: tecla <strong>a</strong> → luz <strong>a</strong>).</p>`
                : ""
            }
            ${
              pt.tipo !== "tomada"
                ? `<label>Potência (VA/W)<input type="number" id="pePtPot" min="0" value="${Number(pt.potenciaVA || 0)}" /></label>
            <label>Tensão
              <select id="pePtV">
                <option value="127" ${Number(pt.tensaoV) === 127 ? "selected" : ""}>127 V</option>
                <option value="220" ${Number(pt.tensaoV) === 220 ? "selected" : ""}>220 V</option>
              </select>
            </label>`
                : `<p class="hint">Potência total ≈ <strong>${Math.round(cargaPonto(pt))}</strong> W (soma dos módulos).</p>`
            }
            <label>Altura (m)<input type="number" id="pePtAlt" step="0.1" value="${Number(pt.alturaM ?? 0.3)}" /></label>
            <div class="pe-size-row">
              <span>Tamanho no grid</span>
              <button type="button" class="btn btn-secondary btn-sm" id="pePtScaleDown" title="Diminuir">−</button>
              <strong id="pePtScaleVal">${Math.round(clampEscala(pt.escala) * 100)}%</strong>
              <button type="button" class="btn btn-secondary btn-sm" id="pePtScaleUp" title="Aumentar">+</button>
            </div>
            ${
              showTom
                ? `<p class="hint">NBR 5444 — tomada: triângulo vazio ≈ baixa, meio ≈ média, cheio ≈ alta (pela altura).</p>`
                : ""
            }
            ${
              pt.tipo !== "tomada"
                ? `<label>Circuito<select id="pePtCirc">${circOpts}</select></label>`
                : ""
            }
            <div class="pe-insp-actions">
              <button type="button" class="btn btn-danger btn-sm" id="pePtDel">Excluir</button>
              <button type="button" class="btn btn-primary btn-sm" id="pePtOk">Atualizar</button>
            </div>
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
            <p class="hint">Altere o ângulo — gira na hora. Tecla <strong>R</strong> também gira 90°.</p>
          </div>
        </div>`;
      }

      if (selectedKind === "conduit") {
        const cd = (projeto.conduits || []).find((c) => c.id === selectedId);
        const fios = cd?.fios?.length
          ? cd.fios
          : cd?.circuitoId
            ? [{ id: cd.circuitoId, cor: cd.cor, metros: null, bitola: null, tipo: "" }]
            : [];
        const fiosHtml = fios.length
          ? `<ul class="pe-fios-list">${fios
              .map(
                (f) =>
                  `<li style="border-left:4px solid ${escapeHtml(f.cor || "#555")}">
                    <strong>${escapeHtml(f.id)}</strong>
                    ${f.tipo ? ` · ${escapeHtml(f.tipo)}` : ""}
                    ${f.bitola != null ? ` · ${escapeHtml(String(f.bitola))} mm²` : ""}
                    ${f.metros != null ? `<div class="hint">~${f.metros} m neste trecho</div>` : ""}
                  </li>`
              )
              .join("")}</ul>`
          : `<p class="hint">Rode <strong>Analisar NBR 5410</strong> para ver quais fios passam neste conduíte.</p>`;
        return `<div class="pe-side-block pe-inspector">
          <h3>Conduíte</h3>
          <p class="hint">Fios / circuitos neste trecho (caminho após a análise):</p>
          ${fiosHtml}
          <button type="button" class="btn btn-danger btn-sm" id="peCdDel" style="margin-top:10px">Excluir conduíte</button>
        </div>`;
      }
      if (selectedKind === "wall") {
        const wall = (projeto.walls || []).find((w) => w.id === selectedId);
        const len = wall?.points?.length
          ? polylineLength(wall.points).toFixed(2)
          : "—";
        return `<div class="pe-side-block pe-inspector">
          <h3>Linha / parede</h3>
          <p class="hint">Comprimento ≈ <strong>${len}</strong> m. Use a borracha para apagar um trecho.</p>
          <button type="button" class="btn btn-danger btn-sm" id="peWlDel">Excluir linha</button>
        </div>`;
      }
      if (selectedKind === "dim") {
        const d = (projeto.dims || []).find((x) => x.id === selectedId);
        const len = d ? dist(d.a, d.b).toFixed(2) : "—";
        return `<div class="pe-side-block pe-inspector">
          <h3>Cota (trena)</h3>
          <p class="hint">Medida: <strong>${len}</strong> m</p>
          <button type="button" class="btn btn-danger btn-sm" id="peDmDel">Excluir cota</button>
        </div>`;
      }
      return "";
    }

    function bindInspector() {
      const side = root.querySelector("#peSide");
      if (!side) return;

      side.querySelector("#peGlobalScaleDown")?.addEventListener("click", () => bumpSymbolScale(-0.1));
      side.querySelector("#peGlobalScaleUp")?.addEventListener("click", () => bumpSymbolScale(0.1));
      side.querySelectorAll("[data-hotkey]").forEach((btn) => {
        btn.addEventListener("click", () => {
          capturingHotkeyId = btn.dataset.hotkey;
          refreshSelectionUI();
          ctx.toast?.("Pressione a tecla do atalho…");
        });
      });
      side.querySelector("#peHotkeysReset")?.addEventListener("click", () => {
        hotkeys = { ...DEFAULT_HOTKEYS };
        persistHotkeys();
        capturingHotkeyId = null;
        refreshSelectionUI();
        ctx.toast?.("Atalhos restaurados");
      });

      if (selectedKind === "point") {
        side.querySelector("#pePtScaleDown")?.addEventListener("click", () => bumpPointScale(-0.1));
        side.querySelector("#pePtScaleUp")?.addEventListener("click", () => bumpPointScale(0.1));
        const apply = () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          if (!p) return;
          p.tipo = document.getElementById("pePtTipo")?.value || p.tipo;
          p.label = document.getElementById("pePtLabel")?.value.trim() || tipoPonto(p.tipo).label;
          p.alturaM = Math.max(0, Number(document.getElementById("pePtAlt")?.value) || 0);
          const potEl = document.getElementById("pePtPot");
          const tenEl = document.getElementById("pePtV");
          if (potEl) p.potenciaVA = Math.max(0, Number(potEl.value) || 0);
          if (tenEl) p.tensaoV = Number(tenEl.value) || 127;

          if (p.tipo === "interruptor" || p.tipo === "conjugado") {
            p.variante = document.getElementById("pePtVarInt")?.value || p.variante || "simples";
            const letters = [...side.querySelectorAll(".pe-cmd-letter")].map((el) =>
              el.value.trim().toLowerCase().slice(0, 2)
            );
            p.comandos = letters;
            syncComandos(p);
          }
          if (p.tipo === "tomada") {
            p.modulos = document.getElementById("pePtMod")?.value || "simples";
            const n = modulosTomada(p.modulos).modulos;
            const cfg = [];
            for (let i = 0; i < n; i++) {
              const amp = Number(side.querySelector(`.pe-mod-amp[data-mod="${i}"]`)?.value) || 10;
              let uso = side.querySelector(`.pe-mod-uso[data-mod="${i}"]`)?.value || "tug";
              if (amp >= 20) uso = "tue";
              cfg.push({
                amperagem: amp,
                usoCircuito: uso,
                circuitoId: side.querySelector(`.pe-mod-circ[data-mod="${i}"]`)?.value || "",
                usoTue: side.querySelector(`.pe-mod-tue[data-mod="${i}"]`)?.value || ""
              });
            }
            p.modulosConfig = cfg;
            p.interruptor = "";
            syncModulosConfig(p);
            p.potenciaVA = cargaPonto(p);
            p.tensaoV = p.amperagem >= 20 ? 220 : 127;
          }
          if (p.tipo === "conjugado") {
            const cid = document.getElementById("pePtConj")?.value;
            if (cid) applyPointPreset(p, { group: "conjugado", conjugadoId: cid, id: cid });
            p.modulos = document.getElementById("pePtMod")?.value || p.modulos;
            syncComandos(p);
            syncModulosConfig(p);
          }
          if (p.tipo === "lampada") {
            p.variante = document.getElementById("pePtVar")?.value || "ponto";
            const intEl = document.getElementById("pePtInt");
            if (intEl) p.interruptor = intEl.value.trim().toLowerCase();
          }
          const circ = document.getElementById("pePtCirc")?.value;
          if (p.tipo !== "tomada") {
            if (circ) {
              p.circuitoId = circ;
              p.circuitoManual = true;
            } else {
              p.circuitoManual = false;
              p.circuitoId = null;
            }
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
          if (p.tipo === "interruptor") syncComandos(p);
          if (p.tipo === "tomada") {
            p.interruptor = "";
            syncModulosConfig(p);
          }
          Object.assign(p, normalizePoint(p));
          save();
          refreshSelectionUI();
        });
        side.querySelector("#pePtVarInt")?.addEventListener("change", () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          if (!p) return;
          p.variante = document.getElementById("pePtVarInt").value;
          syncComandos(p);
          save();
          refreshSelectionUI();
        });
        side.querySelector("#pePtMod")?.addEventListener("change", () => {
          const p = projeto.points.find((x) => x.id === selectedId);
          if (!p) return;
          p.modulos = document.getElementById("pePtMod").value;
          syncModulosConfig(p);
          save();
          refreshSelectionUI();
        });
        side.querySelectorAll(".pe-mod-uso, .pe-mod-amp").forEach((el) => {
          el.addEventListener("change", () => {
            apply();
          });
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
          r.w = Math.max(ROOM_MIN_M, Number(document.getElementById("peRmW").value) || ROOM_MIN_M);
          r.h = Math.max(ROOM_MIN_M, Number(document.getElementById("peRmH").value) || ROOM_MIN_M);
          save();
          paint();
          refreshSelectionUI();
        });
        side.querySelector("#peRmDel")?.addEventListener("click", () => deleteSelected());
      }

      if (selectedKind === "arch") {
        const applyArch = (toast) => {
          const a = projeto.arch.find((x) => x.id === selectedId);
          if (!a) return;
          a.tipo = document.getElementById("peArTipo")?.value || a.tipo;
          a.largura = Math.max(0.2, Number(document.getElementById("peArL")?.value) || 0.8);
          a.angulo = Number(document.getElementById("peArAng")?.value) || 0;
          save();
          paint();
          if (toast) {
            refreshSelectionUI();
            ctx.toast?.("Atualizado");
          }
        };
        side.querySelector("#peArOk")?.addEventListener("click", () => applyArch(true));
        side.querySelector("#peArAng")?.addEventListener("change", () => applyArch(false));
        side.querySelector("#peArTipo")?.addEventListener("change", () => applyArch(false));
        side.querySelector("#peArL")?.addEventListener("change", () => applyArch(false));
        side.querySelector("#peArDel")?.addEventListener("click", () => deleteSelected());
      }

      if (selectedKind === "conduit") {
        side.querySelector("#peCdDel")?.addEventListener("click", () => deleteSelected());
      }
      if (selectedKind === "wall") {
        side.querySelector("#peWlDel")?.addEventListener("click", () => deleteSelected());
      }
      if (selectedKind === "dim") {
        side.querySelector("#peDmDel")?.addEventListener("click", () => deleteSelected());
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
      const stepM = visualGridStep();
      const g = stepM * ppm;
      const majorEvery = stepM <= 0.01 ? 10 : stepM <= 0.05 ? 10 : stepM <= 0.1 ? 5 : 2;
      const x0 = -pan.x;
      const y0 = -pan.y;
      const xStart = Math.floor(x0 / g) * g;
      const yStart = Math.floor(y0 / g) * g;
      for (let x = xStart, i = Math.round(xStart / g); x < x0 + W; x += g, i++) {
        const major = i % majorEvery === 0;
        ctx2.strokeStyle = major ? "#d0d5dd" : "#e8ebf0";
        ctx2.lineWidth = major ? 1.1 : 1;
        ctx2.beginPath();
        ctx2.moveTo(x, y0);
        ctx2.lineTo(x, y0 + H);
        ctx2.stroke();
      }
      for (let y = yStart, i = Math.round(yStart / g); y < y0 + H; y += g, i++) {
        const major = i % majorEvery === 0;
        ctx2.strokeStyle = major ? "#d0d5dd" : "#e8ebf0";
        ctx2.lineWidth = major ? 1.1 : 1;
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

      // Guias da trena (estilo SketchUp)
      (projeto.guides || []).forEach((g) => {
        ctx2.strokeStyle = "rgba(0, 180, 216, 0.55)";
        ctx2.lineWidth = 1;
        ctx2.setLineDash([4, 4]);
        ctx2.beginPath();
        if (g.axis === "v") {
          ctx2.moveTo(g.value * ppm, y0 - 2000);
          ctx2.lineTo(g.value * ppm, y0 + H + 2000);
        } else {
          ctx2.moveTo(x0 - 2000, g.value * ppm);
          ctx2.lineTo(x0 + W + 2000, g.value * ppm);
        }
        ctx2.stroke();
        ctx2.setLineDash([]);
      });

      if (snapGuides) {
        ctx2.strokeStyle = "rgba(245, 124, 0, 0.85)";
        ctx2.lineWidth = 1.2;
        ctx2.setLineDash([3, 3]);
        (snapGuides.v || []).forEach((vx) => {
          ctx2.beginPath();
          ctx2.moveTo(vx * ppm, y0 - 500);
          ctx2.lineTo(vx * ppm, y0 + H + 500);
          ctx2.stroke();
        });
        (snapGuides.h || []).forEach((hy) => {
          ctx2.beginPath();
          ctx2.moveTo(x0 - 500, hy * ppm);
          ctx2.lineTo(x0 + W + 500, hy * ppm);
          ctx2.stroke();
        });
        ctx2.setLineDash([]);
      }

      const drawPoly = (pts, color, width, dash, alpha) => {
        if (!pts?.length) return;
        ctx2.save();
        if (alpha != null) ctx2.globalAlpha = alpha;
        ctx2.beginPath();
        ctx2.strokeStyle = color;
        ctx2.lineWidth = width;
        ctx2.setLineDash(dash || []);
        ctx2.lineJoin = "round";
        ctx2.lineCap = "round";
        ctx2.moveTo(pts[0].x * ppm, pts[0].y * ppm);
        for (let i = 1; i < pts.length; i++) ctx2.lineTo(pts[i].x * ppm, pts[i].y * ppm);
        ctx2.stroke();
        ctx2.setLineDash([]);
        ctx2.restore();
      };

      const offsetPolyline = (pts, offsetM) => {
        if (!pts?.length) return [];
        if (pts.length < 2 || Math.abs(offsetM) < 1e-9) {
          return pts.map((p) => ({ x: p.x, y: p.y }));
        }
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          let nx;
          let ny;
          if (i === 0) {
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const L = Math.hypot(dx, dy) || 1;
            nx = -dy / L;
            ny = dx / L;
          } else if (i === pts.length - 1) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            const L = Math.hypot(dx, dy) || 1;
            nx = -dy / L;
            ny = dx / L;
          } else {
            const dx1 = pts[i].x - pts[i - 1].x;
            const dy1 = pts[i].y - pts[i - 1].y;
            const L1 = Math.hypot(dx1, dy1) || 1;
            const dx2 = pts[i + 1].x - pts[i].x;
            const dy2 = pts[i + 1].y - pts[i].y;
            const L2 = Math.hypot(dx2, dy2) || 1;
            nx = -dy1 / L1 - dy2 / L2;
            ny = dx1 / L1 + dx2 / L2;
            const nL = Math.hypot(nx, ny) || 1;
            nx /= nL;
            ny /= nL;
          }
          out.push({ x: pts[i].x + nx * offsetM, y: pts[i].y + ny * offsetM });
        }
        return out;
      };

      const drawConduitPath = (pts, color, hi, dimmed, opts = {}) => {
        if (!pts?.length) return;
        const w = hi ? 5.5 : dimmed ? 1.6 : opts.thin ? 2.2 : 3.2;
        const alpha = dimmed ? 0.22 : 1;
        if (!dimmed) drawPoly(pts, "#fff", w + 3.5, null, 0.55);
        drawPoly(pts, color, w, null, alpha);
        if (!dimmed && !opts.noNodes) {
          pts.forEach((p, i) => {
            ctx2.beginPath();
            ctx2.fillStyle = color;
            ctx2.strokeStyle = "#fff";
            ctx2.lineWidth = 1.2;
            ctx2.arc(
              p.x * ppm,
              p.y * ppm,
              hi ? 4.5 : i === 0 || i === pts.length - 1 ? 3.5 : 2.5,
              0,
              Math.PI * 2
            );
            ctx2.fill();
            ctx2.stroke();
          });
        }
        if (!dimmed && !opts.noArrow && pts.length >= 2) {
          const a = pts[pts.length - 2];
          const b = pts[pts.length - 1];
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const s = 8;
          ctx2.save();
          ctx2.translate(b.x * ppm, b.y * ppm);
          ctx2.rotate(ang);
          ctx2.fillStyle = color;
          ctx2.beginPath();
          ctx2.moveTo(0, 0);
          ctx2.lineTo(-s, -s * 0.45);
          ctx2.lineTo(-s, s * 0.45);
          ctx2.closePath();
          ctx2.fill();
          ctx2.restore();
        }
      };

      const drawFiosLabel = (mid, fios, hi) => {
        if (!mid || !fios?.length) return;
        let x = mid.x * ppm + 6;
        const y = mid.y * ppm - 8;
        ctx2.font = `bold ${hi ? 12 : 10}px Segoe UI, sans-serif`;
        ctx2.textAlign = "left";
        ctx2.textBaseline = "alphabetic";
        fios.forEach((fio, i) => {
          const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === fio.id);
          const bit = circ?.bitola ? `·${circ.bitola}` : "";
          const text = `${fio.id}${bit}`;
          if (i > 0) {
            const sep = " · ";
            ctx2.fillStyle = "#546e7a";
            ctx2.fillText(sep, x, y);
            x += ctx2.measureText(sep).width;
          }
          ctx2.strokeStyle = "#fff";
          ctx2.lineWidth = 3.2;
          ctx2.strokeText(text, x, y);
          ctx2.fillStyle = fio.cor || "#222";
          ctx2.fillText(text, x, y);
          x += ctx2.measureText(text).width;
        });
      };

      const fiosDoConduite = (c) => {
        if (c.fios?.length) return c.fios;
        if (c.circuitoId) {
          const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === c.circuitoId);
          return [{ id: c.circuitoId, cor: circ?.cor || c.cor || "#555" }];
        }
        return [];
      };

      (projeto.walls || []).forEach((wall) => {
        const sel = selectedKind === "wall" && selectedId === wall.id;
        drawPoly(wall.points, sel ? "#f57c00" : "#2c3e50", sel ? 3.2 : 2.4);
      });
      if (lineDraft) {
        drawPoly(lineDraft.points, "#f57c00", 2.2, [5, 4]);
        if (hover && lineDraft.points.length) {
          const last = lineDraft.points[lineDraft.points.length - 1];
          const sn = axisAlignPoint(last, snapPointToEdges({ x: hover.x, y: hover.y }));
          drawPoly([last, sn], "#f57c00", 1.5, [3, 3]);
        }
      }

      (projeto.arch || []).forEach((a) => {
        drawArch(ctx2, a);
        if (selectedKind === "arch" && selectedId === a.id) {
          archEndpoints(a).forEach((ep) => {
            ctx2.fillStyle = "#f57c00";
            ctx2.strokeStyle = "#fff";
            ctx2.lineWidth = 1.5;
            ctx2.beginPath();
            ctx2.arc(ep.x * ppm, ep.y * ppm, 5, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
          });
        }
      });

      // Conduítes: tubo + fios paralelos (cada circuito); filtro mostra caminho QDC→pontos
      const hasCircFilter = !!selectedCircuitId;
      const WIRE_GAP_M = 0.045; // afastamento visual entre fios no mesmo conduíte

      projeto.conduits.forEach((c) => {
        const pts = c.points || [];
        if (pts.length < 2) return;
        const fios = fiosDoConduite(c);
        const carriesSelected =
          hasCircFilter &&
          (fios.some((f) => f.id === selectedCircuitId) || c.circuitoId === selectedCircuitId);
        const dimmed = hasCircFilter && !carriesSelected;
        const selObj = selectedKind === "conduit" && selectedId === c.id;

        // eletroduto (tubo)
        drawPoly(pts, selObj ? "#ffb74d" : "#90a4ae", dimmed ? 2 : 5, null, dimmed ? 0.12 : 0.4);

        if (!hasCircFilter) {
          // fios lado a lado — cada cor = um circuito no trecho
          if (!fios.length) {
            drawConduitPath(pts, selObj ? "#f57c00" : "#78909c", selObj, false, {
              thin: true,
              noNodes: fios.length > 1
            });
          } else {
            fios.forEach((fio, i) => {
              const off = (i - (fios.length - 1) / 2) * WIRE_GAP_M;
              const wirePts = offsetPolyline(pts, off);
              drawConduitPath(wirePts, selObj ? "#f57c00" : fio.cor, selObj, false, {
                thin: fios.length > 1,
                noNodes: fios.length > 1,
                noArrow: fios.length > 1
              });
            });
            if (fios.length === 1) {
              // seta/nós já no path único
            } else {
              // vértices só no eixo do tubo
              pts.forEach((p, i) => {
                if (i !== 0 && i !== pts.length - 1) return;
                ctx2.beginPath();
                ctx2.fillStyle = "#546e7a";
                ctx2.strokeStyle = "#fff";
                ctx2.lineWidth = 1.2;
                ctx2.arc(p.x * ppm, p.y * ppm, 3.2, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.stroke();
              });
            }
          }
          const mid = pts[Math.floor(pts.length / 2)];
          if (fios.length) drawFiosLabel(mid, fios, selObj);
        } else if (carriesSelected) {
          const fio = fios.find((f) => f.id === selectedCircuitId);
          const cor =
            fio?.cor ||
            (projeto.lastAnalise?.circuits || []).find((x) => x.id === selectedCircuitId)?.cor ||
            c.cor ||
            "#555";
          drawConduitPath(pts, selObj ? "#f57c00" : cor, true, false, { thin: true, noArrow: true });
          const mid = pts[Math.floor(pts.length / 2)];
          drawFiosLabel(mid, [{ id: selectedCircuitId, cor }], true);
        }
      });

      // Caminho contínuo do fio: QDC → cada ponto do circuito selecionado
      if (hasCircFilter) {
        const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === selectedCircuitId);
        (circ?.caminhos || []).forEach((cam) => {
          if (cam.pontos?.length >= 2) {
            drawConduitPath(cam.pontos, circ.cor || "#1565c0", true, false);
          }
        });
      }

      if (conduitDraft) {
        drawConduitPath(conduitDraft.points, "#f57c00", true, false);
        if (hover && conduitDraft.points.length) {
          const last = conduitDraft.points[conduitDraft.points.length - 1];
          drawPoly([last, hover], "#f57c00", 2, [4, 4]);
        }
      }

      projeto.points.forEach((p) => {
        const n = normalizePoint(p);
        const sel = selectedKind === "point" && selectedId === n.id;
        const circ = (projeto.lastAnalise?.circuits || []).find((x) => x.id === n.circuitoId);
        let stroke = circ?.cor || "#111";
        let highlight = sel;
        if (hasCircFilter) {
          if (n.tipo === "interruptor") {
            const cmds = syncComandos(n);
            const linked = (projeto.points || []).some(
              (lp) =>
                lp.tipo === "lampada" &&
                lp.circuitoId === selectedCircuitId &&
                cmds.includes(String(lp.interruptor || "").toLowerCase())
            );
            if (!linked) {
              ctx2.save();
              ctx2.globalAlpha = 0.22;
              drawNbrSymbol(ctx2, n, ppm, false, "#888", projeto.symbolScale);
              ctx2.restore();
              return;
            }
            stroke =
              (projeto.lastAnalise?.circuits || []).find((x) => x.id === selectedCircuitId)?.cor ||
              stroke;
            highlight = true;
          } else if (n.circuitoId !== selectedCircuitId) {
            ctx2.save();
            ctx2.globalAlpha = 0.22;
            drawNbrSymbol(ctx2, n, ppm, false, "#888", projeto.symbolScale);
            ctx2.restore();
            return;
          } else {
            highlight = true;
          }
        }
        drawNbrSymbol(ctx2, n, ppm, highlight, stroke, projeto.symbolScale);
      });

      const drawDim = (a, b, color) => {
        const len = dist(a, b);
        if (len < 0.01) return;
        const mx = ((a.x + b.x) / 2) * ppm;
        const my = ((a.y + b.y) / 2) * ppm;
        ctx2.strokeStyle = color;
        ctx2.fillStyle = color;
        ctx2.lineWidth = 1.4;
        ctx2.beginPath();
        ctx2.moveTo(a.x * ppm, a.y * ppm);
        ctx2.lineTo(b.x * ppm, b.y * ppm);
        ctx2.stroke();
        // marcas nas pontas
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const tick = 6;
        [a, b].forEach((p) => {
          ctx2.beginPath();
          ctx2.moveTo(p.x * ppm + Math.cos(ang + Math.PI / 2) * tick, p.y * ppm + Math.sin(ang + Math.PI / 2) * tick);
          ctx2.lineTo(p.x * ppm - Math.cos(ang + Math.PI / 2) * tick, p.y * ppm - Math.sin(ang + Math.PI / 2) * tick);
          ctx2.stroke();
        });
        ctx2.font = "bold 11px Segoe UI, sans-serif";
        ctx2.textAlign = "center";
        ctx2.textBaseline = "bottom";
        ctx2.fillText(`${len.toFixed(2)} m`, mx, my - 4);
      };

      (projeto.dims || []).forEach((d) => {
        const sel = selectedKind === "dim" && selectedId === d.id;
        drawDim(d.a, d.b, sel ? "#f57c00" : "#00838f");
      });

      if (measureDraft?.a) {
        const b =
          measureDraft.b ||
          (hover
            ? measureEndPoint(
                measureDraft,
                { x: hover.rawX ?? hover.x, y: hover.rawY ?? hover.y },
                parseLengthInput(lengthBuffer)
              )
            : null);
        if (b) drawDim(measureDraft.a, b, "#00bcd4");
        else {
          ctx2.fillStyle = "#00bcd4";
          ctx2.beginPath();
          ctx2.arc(measureDraft.a.x * ppm, measureDraft.a.y * ppm, 4, 0, Math.PI * 2);
          ctx2.fill();
        }
      }

      // Referências de aresta (travinhas) — estilo SketchUp/CAD
      if (tool === "measure" || tool === "line") {
        collectInferencePoints().forEach((p) => {
          if (p.kind !== "end" && p.kind !== "mid") return;
          // evita poluir: só extremidades e meios de porta/trena/parede
          if (p.seg?.source === "guide") return;
          const px = p.x * ppm;
          const py = p.y * ppm;
          ctx2.save();
          if (p.kind === "mid") {
            ctx2.strokeStyle = "rgba(0, 188, 212, 0.55)";
            ctx2.lineWidth = 1.5;
            ctx2.beginPath();
            ctx2.moveTo(px, py - 4);
            ctx2.lineTo(px + 4, py);
            ctx2.lineTo(px, py + 4);
            ctx2.lineTo(px - 4, py);
            ctx2.closePath();
            ctx2.stroke();
          } else {
            ctx2.fillStyle = "rgba(0, 200, 83, 0.35)";
            ctx2.strokeStyle = "rgba(0, 160, 70, 0.9)";
            ctx2.lineWidth = 1.2;
            ctx2.fillRect(px - 3, py - 3, 6, 6);
            ctx2.strokeRect(px - 3, py - 3, 6, 6);
          }
          ctx2.restore();
        });
      }

      if (inferSnap && inferSnap.kind !== "grid") {
        const px = inferSnap.x * ppm;
        const py = inferSnap.y * ppm;
        ctx2.save();
        if (inferSnap.kind === "end") {
          // quadrado verde — extremidade (SketchUp)
          ctx2.fillStyle = "rgba(0, 230, 118, 0.35)";
          ctx2.strokeStyle = "#00c853";
          ctx2.lineWidth = 2.2;
          ctx2.fillRect(px - 6, py - 6, 12, 12);
          ctx2.strokeRect(px - 6, py - 6, 12, 12);
        } else if (inferSnap.kind === "mid") {
          // losango ciano — meio
          ctx2.fillStyle = "rgba(0, 229, 255, 0.35)";
          ctx2.strokeStyle = "#00e5ff";
          ctx2.lineWidth = 2.2;
          ctx2.beginPath();
          ctx2.moveTo(px, py - 8);
          ctx2.lineTo(px + 8, py);
          ctx2.lineTo(px, py + 8);
          ctx2.lineTo(px - 8, py);
          ctx2.closePath();
          ctx2.fill();
          ctx2.stroke();
        } else {
          // travinha vermelha — sobre a aresta
          ctx2.strokeStyle = "#ff1744";
          ctx2.lineWidth = 2;
          let tx = 7;
          let ty = 0;
          if (inferSnap.seg) {
            const dx = inferSnap.seg.b.x - inferSnap.seg.a.x;
            const dy = inferSnap.seg.b.y - inferSnap.seg.a.y;
            const L = Math.hypot(dx, dy) || 1;
            tx = (-dy / L) * 7;
            ty = (dx / L) * 7;
          }
          ctx2.beginPath();
          ctx2.moveTo(px - tx, py - ty);
          ctx2.lineTo(px + tx, py + ty);
          ctx2.stroke();
          ctx2.beginPath();
          ctx2.arc(px, py, 3, 0, Math.PI * 2);
          ctx2.fillStyle = "#ff1744";
          ctx2.fill();
        }
        if (inferSnap.label) {
          ctx2.fillStyle = "#00695c";
          ctx2.font = "bold 10px Segoe UI, sans-serif";
          ctx2.textAlign = "left";
          ctx2.fillText(inferSnap.label, px + 10, py - 8);
        }
        ctx2.restore();
      }

      ctx2.restore();
    }

    function renderSide() {
      const side = root.querySelector("#peSide");
      if (!side) return;
      const a = projeto.lastAnalise;
      const circHtml = a?.circuits?.length
        ? `<p class="hint" style="margin-bottom:8px">${
            selectedCircuitId
              ? `Caminho do fio <strong>${escapeHtml(selectedCircuitId)}</strong> (QDC → pontos). Clique de novo para ver todos os fios nos conduítes.`
              : "Sem filtro: cada conduíte mostra os fios que passam nele. Clique num circuito para seguir só aquele caminho."
          }</p>
          ${a.circuits
            .map((c) => {
              const active = selectedCircuitId === c.id;
              const nCam = c.caminhos?.length || 0;
              const nCd = c.conduitesIds?.length || 0;
              return `<button type="button" class="pe-circ ${active ? "active" : ""}" data-circ="${escapeHtml(c.id)}" style="border-left:4px solid ${c.cor}">
            <strong>${escapeHtml(c.id)}</strong> · ${escapeHtml(c.dimensionamento?.tipo?.label || c.tipoId || "")}
            <div class="hint">${c.pontos.length} ponto(s) · ${nCam} caminho(s) · ${nCd} conduíte(s) · L≈${c.comprimentoM?.toFixed?.(1) || "—"} m</div>
            <div>${c.bitola || "—"} mm² · DJ ${c.disjuntor || "—"}A · queda ${c.quedaPct != null ? c.quedaPct.toFixed(2) + "%" : "—"} · ${c.potenciaVA} VA/W</div>
          </button>`;
            })
            .join("")}`
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
          <p class="hint">${projeto.rooms.length} cômodo(s) · ${(projeto.arch || []).length} porta/janela · ${(projeto.walls || []).length} linha(s) · ${projeto.points.length} ponto(s) · ${projeto.conduits.length} conduíte(s)</p>
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
      side.querySelectorAll(".pe-circ[data-circ]").forEach((el) => {
        el.onclick = () => {
          const id = el.dataset.circ;
          selectedCircuitId = selectedCircuitId === id ? null : id;
          paint();
          renderSide();
          ctx.toast?.(
            selectedCircuitId
              ? `Caminho do ${selectedCircuitId}`
              : "Todos os caminhos"
          );
        };
      });
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
