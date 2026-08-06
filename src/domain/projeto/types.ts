/**
 * Tipos, pontos e factories do projeto elétrico — domínio puro.
 */
// @ts-nocheck
import { todayISO, uid } from "../../data/catalog";

  const PPM_DEFAULT = 48;
  const PPM_MIN = 8;
  const PPM_MAX = 480;
  const SNAP_M = 0.35;
  /** Distância máx. para “pingar” um ponto/QDC no conduíte mais próximo (eixo do trecho). */
  const POINT_LINK_M = 1.8;
  /** Une extremidades de conduítes quase tocantes (rede contínua). */
  const CONDUIT_JOIN_M = 0.25;
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
  teclasDoInterruptor
};
