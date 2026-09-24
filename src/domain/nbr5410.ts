/** Dimensionamento NBR 5410 — domínio puro (assistente de obra). */
import { getPrecoByModo } from "../data/catalog";

  const DISJUNTORES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125, 160];

  /**
   * Iz (A) — Cu PVC 70 °C, 2 condutores carregados.
   * Valores de referência práticos por método de instalação (NBR 5410 / tabelas de obra).
   */
  const CABOS_BY_METODO = {
    A1: [
      { secao: 1.5, iz: 15.5 },
      { secao: 2.5, iz: 21 },
      { secao: 4, iz: 28 },
      { secao: 6, iz: 36 },
      { secao: 10, iz: 50 },
      { secao: 16, iz: 66 },
      { secao: 25, iz: 84 },
      { secao: 35, iz: 104 },
      { secao: 50, iz: 125 }
    ],
    B1: [
      { secao: 1.5, iz: 17.5 },
      { secao: 2.5, iz: 24 },
      { secao: 4, iz: 32 },
      { secao: 6, iz: 41 },
      { secao: 10, iz: 57 },
      { secao: 16, iz: 76 },
      { secao: 25, iz: 101 },
      { secao: 35, iz: 125 },
      { secao: 50, iz: 151 }
    ],
    B2: [
      { secao: 1.5, iz: 18.5 },
      { secao: 2.5, iz: 25 },
      { secao: 4, iz: 34 },
      { secao: 6, iz: 43 },
      { secao: 10, iz: 60 },
      { secao: 16, iz: 80 },
      { secao: 25, iz: 107 },
      { secao: 35, iz: 132 },
      { secao: 50, iz: 160 }
    ],
    C: [
      { secao: 1.5, iz: 19.5 },
      { secao: 2.5, iz: 27 },
      { secao: 4, iz: 36 },
      { secao: 6, iz: 46 },
      { secao: 10, iz: 63 },
      { secao: 16, iz: 85 },
      { secao: 25, iz: 112 },
      { secao: 35, iz: 138 },
      { secao: 50, iz: 168 }
    ]
  };

  /** Compat: tabela B1 legada */
  const CABOS = CABOS_BY_METODO.B1;

  const METODOS_INSTALACAO = [
    { id: "A1", label: "A1 — eletroduto em parede isolada", hint: "Mais restritivo (Iz menor)" },
    { id: "B1", label: "B1 — eletroduto embutido (padrão)", hint: "Obra residencial típica" },
    { id: "B2", label: "B2 — eletroduto aparente", hint: "Sobreposto / canaleta" },
    { id: "C", label: "C — fixado na parede/teto", hint: "Cabo aparente / bandeja" }
  ];

  /** Bitola máxima em bornes de tomada TUE (acima disso não entra no terminal). */
  const SECAO_MAX_TOMADA_TUE = 4;

  /** Diâmetro externo aproximado do cabo (mm) — PVC flexível comum */
  const CABO_OD_MM = {
    1.5: 3.0,
    2.5: 3.6,
    4: 4.3,
    6: 5.0,
    10: 6.3,
    16: 7.5,
    25: 9.5,
    35: 11.0,
    50: 13.0
  };

  /** Área útil interna aproximada do eletroduto (mm²) */
  const ELETRODUTO_AREA = [
    { id: '1/2"', label: '1/2"', areaMm2: 120 },
    { id: '3/4"', label: '3/4"', areaMm2: 210 },
    { id: '1"', label: '1"', areaMm2: 350 },
    { id: '1.1/4"', label: '1.1/4"', areaMm2: 580 },
    { id: '1.1/2"', label: '1.1/2"', areaMm2: 800 },
    { id: '2"', label: '2"', areaMm2: 1300 }
  ];

  const TIPOS = [
    {
      id: "iluminacao",
      label: "Iluminação",
      secaoMin: 1.5,
      polos: 1,
      curva: "B",
      fp: 1,
      drRecomendado: false,
      fatorPartida: 1,
      descricao: "Circuito de iluminação (mín. 1,5 mm² — NBR 5410)"
    },
    {
      id: "tue",
      label: "Tomada de uso específico (TUE)",
      secaoMin: 2.5,
      polos: 2,
      curva: "C",
      fp: 1,
      drRecomendado: true,
      fatorPartida: 1,
      descricao: "Carga dedicada em tomada — bitola máx. 4 mm² (borne); acima disso dividir circuito"
    },
    {
      id: "tug",
      label: "Tomadas de uso geral (TUG)",
      secaoMin: 2.5,
      polos: 1,
      curva: "C",
      fp: 1,
      drRecomendado: true,
      fatorPartida: 1,
      descricao: "Tomadas gerais — mín. 2,5 mm² · DJ mín. 20 A"
    },
    {
      id: "chuveiro",
      label: "Chuveiro / aquecedor",
      secaoMin: 4,
      polos: 2,
      curva: "C",
      fp: 1,
      drRecomendado: true,
      fatorPartida: 1,
      potenciaPadrao: 5500,
      tensaoPadrao: 220,
      descricao: "Circuito exclusivo; DR fortemente recomendado"
    },
    {
      id: "ar",
      label: "Ar-condicionado / split",
      secaoMin: 2.5,
      polos: 2,
      curva: "C",
      fp: 0.85,
      drRecomendado: false,
      fatorPartida: 5,
      potenciaPadrao: 3500,
      tensaoPadrao: 220,
      descricao: "Corrente de partida estimada (~5×Ib) — curva C/D"
    },
    {
      id: "motor",
      label: "Motor / bomba",
      secaoMin: 2.5,
      polos: 2,
      curva: "D",
      fp: 0.8,
      drRecomendado: false,
      fatorPartida: 7,
      potenciaPadrao: 1500,
      tensaoPadrao: 220,
      descricao: "Partida direta estimada (~7×Ib) — curva D sugerida"
    },
    {
      id: "livre",
      label: "Carga livre / customizada",
      secaoMin: 1.5,
      polos: 1,
      curva: "C",
      fp: 1,
      drRecomendado: false,
      fatorPartida: 1,
      descricao: "Informe potência e tensão manualmente"
    }
  ];

  /**
   * Fator de agrupamento (redução de Iz) — circuitos no mesmo eletroduto.
   * Ids legados "2-3"/"4-5"/… mantidos por compatibilidade.
   */
  const FATOR_AGRUPAMENTO = [
    { id: "1", label: "1 circuito no eletroduto", k: 1 },
    { id: "2", label: "2 circuitos", k: 0.8 },
    { id: "3", label: "3 circuitos", k: 0.7 },
    { id: "4", label: "4 circuitos", k: 0.65 },
    { id: "5", label: "5 circuitos", k: 0.6 },
    { id: "6", label: "6 circuitos", k: 0.57 },
    { id: "7+", label: "7 ou mais circuitos", k: 0.54 },
    { id: "2-3", label: "2 a 3 circuitos", k: 0.7 },
    { id: "4-5", label: "4 a 5 circuitos", k: 0.65 },
    { id: "6-7", label: "6 a 7 circuitos", k: 0.57 },
    { id: "8+", label: "8 ou mais circuitos", k: 0.54 }
  ];

  const FATOR_TEMP = [
    { id: "30", label: "Até 30 °C", k: 1 },
    { id: "35", label: "35 °C", k: 0.94 },
    { id: "40", label: "40 °C", k: 0.87 },
    { id: "45", label: "45 °C", k: 0.79 }
  ];

  function cabosDoMetodo(metodoId) {
    const id = String(metodoId || "B1").toUpperCase();
    return CABOS_BY_METODO[id] || CABOS_BY_METODO.B1;
  }

  function metodos() {
    return METODOS_INSTALACAO.slice();
  }

  function metodoById(id) {
    return METODOS_INSTALACAO.find((m) => m.id === id) || METODOS_INSTALACAO[1];
  }

  function agrupamentoIdFromN(n) {
    const q = Math.max(1, Math.round(Number(n) || 1));
    if (q <= 1) return "1";
    if (q === 2) return "2";
    if (q === 3) return "3";
    if (q === 4) return "4";
    if (q === 5) return "5";
    if (q === 6) return "6";
    return "7+";
  }

  function tipos() {
    return TIPOS.slice();
  }

  function tipoById(id) {
    return TIPOS.find((t) => t.id === id) || TIPOS[TIPOS.length - 1];
  }

  function correnteProjeto({ potenciaW, tensaoV, fases, fp }) {
    const P = Number(potenciaW) || 0;
    const V = Number(tensaoV) || 220;
    const cos = Math.max(0.5, Math.min(1, Number(fp) || 1));
    if (!V || !P) return 0;
    if (Number(fases) === 3) return P / (Math.sqrt(3) * V * cos);
    return P / (V * cos);
  }

  function fatorK(agrupamentoId, tempId) {
    const ka = FATOR_AGRUPAMENTO.find((x) => x.id === agrupamentoId)?.k ?? 1;
    const kt = FATOR_TEMP.find((x) => x.id === tempId)?.k ?? 1;
    return { ka, kt, k: ka * kt };
  }

  function izCabo(secao, k, metodoId = "B1") {
    const cabo = cabosDoMetodo(metodoId).find((c) => c.secao === secao);
    if (!cabo) return 0;
    return cabo.iz * (Number(k) || 1);
  }

  function escolherCabo(ib, secaoMin, k, secaoMax = null, metodoId = "B1") {
    const tabela = cabosDoMetodo(metodoId);
    for (const cabo of tabela) {
      if (cabo.secao + 1e-9 < secaoMin) continue;
      if (secaoMax != null && cabo.secao - 1e-9 > secaoMax) continue;
      const izCorrigida = cabo.iz * k;
      if (izCorrigida + 1e-9 >= ib) return { ...cabo, izCorrigida, metodoId };
    }
    if (secaoMax != null) {
      const capped = [...tabela].reverse().find((c) => c.secao <= secaoMax + 1e-9) || tabela[0];
      return {
        ...capped,
        izCorrigida: capped.iz * k,
        metodoId,
        alerta: `Ib acima da capacidade de ${capped.secao} mm² (${metodoId}) com os fatores aplicados.`
      };
    }
    const last = tabela[tabela.length - 1];
    return {
      ...last,
      izCorrigida: last.iz * k,
      metodoId,
      alerta: "Corrente acima da tabela embutida — consulte projeto."
    };
  }

  function escolherDisjuntor(ib, izCorrigida) {
    for (const In of DISJUNTORES) {
      if (In >= ib - 1e-9 && In <= izCorrigida + 1e-9) return In;
    }
    return null;
  }

  function escolherDisjuntorComPiso(ib, izCorrigida, inMin = 0) {
    const need = Math.max(Number(ib) || 0, Number(inMin) || 0);
    return escolherDisjuntor(need, izCorrigida);
  }

  function proximoDisjuntorAcima(ib) {
    return DISJUNTORES.find((In) => In >= ib - 1e-9) || DISJUNTORES[DISJUNTORES.length - 1];
  }

  /**
   * Queda de tensão aproximada (cobre).
   * Monofásico/bifásico: ΔV = 2 · L · I · ρ / S
   * Trifásico: ΔV = √3 · L · I · ρ / S
   */
  function quedaTensao({ comprimentoM, correnteA, secaoMm2, tensaoV, fases }) {
    const L = Number(comprimentoM) || 0;
    const I = Number(correnteA) || 0;
    const S = Number(secaoMm2) || 1;
    const V = Number(tensaoV) || 220;
    const rho = 0.0225;
    const dV =
      Number(fases) === 3
        ? (Math.sqrt(3) * L * I * rho) / S
        : (2 * L * I * rho) / S;
    const pct = V ? (dV / V) * 100 : 0;
    return { dV, pct, okTerminal: pct <= 4, okOrigem: pct <= 7 };
  }

  /**
   * Queda acumulada por trechos (ex.: QDC→caixa + caixa→ponto).
   * trechos: [{ comprimentoM, correnteA, secaoMm2, fases? }]
   */
  function quedaAcumulada(trechos, tensaoV) {
    const V = Number(tensaoV) || 220;
    const list = Array.isArray(trechos) ? trechos : [];
    let dV = 0;
    const detalhes = list.map((t) => {
      const q = quedaTensao({
        comprimentoM: t.comprimentoM,
        correnteA: t.correnteA,
        secaoMm2: t.secaoMm2,
        tensaoV: V,
        fases: t.fases || 1
      });
      dV += q.dV;
      return { ...t, ...q };
    });
    const pct = V ? (dV / V) * 100 : 0;
    return {
      dV,
      pct,
      okTerminal: pct <= 4,
      okOrigem: pct <= 7,
      trechos: detalhes
    };
  }

  /** Ocupação de eletroduto (máx. prático ~40% com 3+ condutores). */
  function eletrodutoPorOcupacao({ secaoMm2, nCondutores = 3, nCircuitos = 1 }) {
    const od = CABO_OD_MM[Number(secaoMm2)] || 5;
    const areaCabo = Math.PI * Math.pow(od / 2, 2);
    const n = Math.max(1, Number(nCondutores) || 3) * Math.max(1, Number(nCircuitos) || 1);
    const areaNec = areaCabo * n;
    const limPct = n <= 1 ? 0.53 : n === 2 ? 0.31 : 0.4;
    const escolhido =
      ELETRODUTO_AREA.find((e) => e.areaMm2 * limPct + 1e-6 >= areaNec) ||
      ELETRODUTO_AREA[ELETRODUTO_AREA.length - 1];
    const ocupPct = (areaNec / escolhido.areaMm2) * 100;
    return {
      eletroduto: escolhido.id,
      label: escolhido.label,
      areaUtilMm2: escolhido.areaMm2,
      areaCabosMm2: Math.round(areaNec),
      ocupacaoPct: Math.round(ocupPct * 10) / 10,
      limitePct: Math.round(limPct * 100),
      ok: ocupPct <= limPct * 100 + 0.5
    };
  }

  /** Sugere divisão de circuito quando Ib/bitola estouram. */
  function sugerirDivisaoCircuito({ potenciaW, tipoId, maxPorCircuitoW }) {
    const tipo = tipoById(tipoId);
    const P = Number(potenciaW) || 0;
    const teto =
      Number(maxPorCircuitoW) ||
      (tipo.id === "tue" ? 3500 : tipo.id === "tug" ? 2200 : tipo.id === "iluminacao" ? 1500 : P);
    if (P <= teto + 1 || teto <= 0) {
      return { precisaDividir: false, nCircuitos: 1, potencias: [P], teto };
    }
    const n = Math.ceil(P / teto);
    const cada = Math.ceil(P / n);
    return {
      precisaDividir: true,
      nCircuitos: n,
      potencias: Array.from({ length: n }, () => cada),
      teto,
      aviso: `Divida em ${n} circuitos de ~${cada} W (teto sugerido ${teto} W).`
    };
  }

  /** Icc aproximado vs capacidade de interrupção típica do DJ (residencial). */
  function checarCurtoCircuito({ ib, disjuntorIn, iccKA = 6, capacidadeKA = 6 }) {
    const Icc = Number(iccKA) || 6;
    const cap = Number(capacidadeKA) || 6;
    const ok = Icc <= cap + 1e-9;
    return {
      iccKA: Icc,
      capacidadeKA: cap,
      ok,
      aviso: ok
        ? null
        : `Icc estimada ${Icc} kA acima da capacidade típica ${cap} kA do DJ ${disjuntorIn || "—"} A — confira o produto.`
    };
  }

  function checklistDimensionamento(dim) {
    if (!dim) return { ok: false, items: [] };
    const items = [];
    const push = (id, label, status, detail) => items.push({ id, label, status, detail });

    push(
      "ib",
      "Corrente de projeto (Ib)",
      dim.ib > 0 ? "ok" : "fail",
      `${(dim.ib || 0).toFixed(2)} A`
    );
    push(
      "cabo",
      "Cabo Iz·k ≥ Ib",
      dim.cabo?.izCorrigida + 1e-9 >= dim.ib ? "ok" : "fail",
      `${dim.cabo?.secao} mm² · Iz ${(dim.cabo?.izCorrigida || 0).toFixed(1)} A`
    );
    push(
      "dj",
      "Disjuntor Ib ≤ In ≤ Iz",
      dim.disjuntor?.In >= dim.ib - 1e-9 && dim.disjuntor?.In <= dim.cabo?.izCorrigida + 1e-9
        ? "ok"
        : "warn",
      `${dim.disjuntor?.In} A · ${dim.disjuntor?.polos}P · ${dim.disjuntor?.curva}`
    );
    push(
      "queda",
      "Queda de tensão (≤4%)",
      dim.queda?.okTerminal ? "ok" : dim.queda?.okOrigem ? "warn" : "fail",
      `${(dim.queda?.pct || 0).toFixed(2)}%` + (dim.quedaAcumulada ? ` · acum. ${dim.quedaAcumulada.pct.toFixed(2)}%` : "")
    );
    if (dim.partida) {
      push(
        "partida",
        "Partida (motor/ar)",
        dim.partida.ok ? "ok" : "warn",
        `Ip≈${dim.partida.correnteA.toFixed(0)} A · curva ${dim.disjuntor?.curva}`
      );
    }
    if (dim.eletrodutoCalc) {
      push(
        "eletroduto",
        "Ocupação do eletroduto",
        dim.eletrodutoCalc.ok ? "ok" : "warn",
        `${dim.eletrodutoCalc.eletroduto} · ${dim.eletrodutoCalc.ocupacaoPct}%`
      );
    }
    push(
      "dr",
      "DR 30 mA",
      dim.dr ? "ok" : "warn",
      dim.dr ? "Recomendado / incluído" : "Não marcado"
    );
    if (dim.icc) {
      push("icc", "Curto-circuito (aprox.)", dim.icc.ok ? "ok" : "warn", `${dim.icc.iccKA} kA / ${dim.icc.capacidadeKA} kA`);
    }
    if (dim.precisaDividirCircuito) {
      push("dividir", "Divisão de circuito", "fail", dim.divisao?.aviso || "Divida o circuito");
    }

    const fail = items.some((i) => i.status === "fail");
    const warn = items.some((i) => i.status === "warn");
    return {
      ok: !fail,
      nivel: fail ? "fail" : warn ? "warn" : "ok",
      items
    };
  }

  /**
   * Dimensionamento completo (assistente):
   * Ib → cabo (método + ka×kt) → DJ → queda → partida → eletroduto → Icc → checklist
   */
  function dimensionar(input) {
    const tipo = tipoById(input.tipoId);
    const metodoId = String(input.metodoId || "B1").toUpperCase();
    const tabela = cabosDoMetodo(metodoId);
    const potenciaW = Number(input.potenciaW ?? tipo.potenciaPadrao ?? 0);
    const tensaoV = Number(input.tensaoV ?? tipo.tensaoPadrao ?? 220);
    const fases = Number(input.fases || (tipo.polos >= 2 && tensaoV >= 220 ? 2 : 1)) || 1;
    const fp = Number(input.fp ?? tipo.fp ?? 1);
    const comprimentoM = Number(input.comprimentoM) || 0;
    const nPontos = Number(input.nPontos) || 0;
    const { ka, kt, k } = fatorK(input.agrupamentoId || "1", input.tempId || "30");
    const forcarDr = input.dr === true || (input.dr !== false && tipo.drRecomendado);

    const secaoMax =
      input.secaoMax != null
        ? Number(input.secaoMax)
        : tipo.id === "tue"
          ? SECAO_MAX_TOMADA_TUE
          : null;

    const inMin = tipo.id === "tug" ? 20 : Number(input.inMin) || 0;
    const ib = correnteProjeto({ potenciaW, tensaoV, fases: fases === 3 ? 3 : 1, fp });
    const ibParaCabo = Math.max(ib, inMin);

    const avisos = [];
    let precisaDividirCircuito = false;

    let cabo = escolherCabo(ibParaCabo, tipo.secaoMin, k, secaoMax, metodoId);
    let secao = cabo.secao;
    let izCorrigida = cabo.izCorrigida;
    if (cabo.alerta) avisos.push(cabo.alerta);

    let disjuntorIn = escolherDisjuntorComPiso(ib, izCorrigida, inMin);

    for (let guard = 0; guard < 12; guard++) {
      if (disjuntorIn != null && disjuntorIn <= izCorrigida + 1e-9 && izCorrigida + 1e-9 >= ibParaCabo) {
        break;
      }
      const idx = tabela.findIndex((c) => c.secao === secao);
      const next = tabela[idx + 1];
      if (!next || (secaoMax != null && next.secao > secaoMax + 1e-9)) {
        precisaDividirCircuito = secaoMax != null || ib > izCorrigida;
        disjuntorIn = proximoDisjuntorAcima(Math.max(ib, inMin));
        avisos.push(
          `Não há bitola${secaoMax != null ? ` ≤ ${secaoMax} mm²` : ""} (${metodoId}) com Iz ≥ Ib ${ib.toFixed(1)} A ` +
            `e DJ ≥ ${Math.max(ib, inMin).toFixed(0)} A (Iz ${izCorrigida.toFixed(1)} A, ka=${ka}). ` +
            (secaoMax != null
              ? "Divida o circuito TUE, use 220 V ou reduza o agrupamento."
              : "Consulte projeto / aumente bitola manualmente.")
        );
        break;
      }
      secao = next.secao;
      izCorrigida = next.iz * k;
      disjuntorIn = escolherDisjuntorComPiso(ib, izCorrigida, inMin);
      avisos.push(`Cabo ${secao} mm² (Iz ${izCorrigida.toFixed(1)} A · ${metodoId}) para caber Ib/DJ.`);
    }

    let queda = quedaTensao({
      comprimentoM,
      correnteA: ib,
      secaoMm2: secao,
      tensaoV,
      fases: fases === 3 ? 3 : 1
    });
    while (!queda.okTerminal && secao < tabela[tabela.length - 1].secao) {
      const idx = tabela.findIndex((c) => c.secao === secao);
      const next = tabela[idx + 1];
      if (!next) break;
      if (secaoMax != null && next.secao > secaoMax + 1e-9) {
        avisos.push(
          `Queda ${queda.pct.toFixed(2)}% — bitola limitada a ${secaoMax} mm² (borne). Encurte o circuito ou divida.`
        );
        break;
      }
      secao = next.secao;
      izCorrigida = next.iz * k;
      queda = quedaTensao({
        comprimentoM,
        correnteA: ib,
        secaoMm2: secao,
        tensaoV,
        fases: fases === 3 ? 3 : 1
      });
      avisos.push(`Seção aumentada para ${secao} mm² por queda de tensão (~4%).`);
      const dj2 = escolherDisjuntorComPiso(ib, izCorrigida, inMin);
      if (dj2 != null) disjuntorIn = dj2;
    }

    // Queda acumulada (trechos extras opcionais)
    let quedaAcum = null;
    if (Array.isArray(input.trechosQueda) && input.trechosQueda.length) {
      quedaAcum = quedaAcumulada(
        input.trechosQueda.map((t) => ({
          ...t,
          secaoMm2: t.secaoMm2 || secao,
          correnteA: t.correnteA != null ? t.correnteA : ib,
          fases: t.fases || (fases === 3 ? 3 : 1)
        })),
        tensaoV
      );
      if (!quedaAcum.okTerminal) {
        avisos.push(`Queda acumulada ${quedaAcum.pct.toFixed(2)}% acima de 4%.`);
      }
    }

    const djFinal = escolherDisjuntorComPiso(ib, izCorrigida, inMin);
    if (djFinal != null) disjuntorIn = djFinal;
    else if (disjuntorIn == null) disjuntorIn = proximoDisjuntorAcima(Math.max(ib, inMin));

    if (disjuntorIn + 1e-9 < Math.max(ib, inMin)) {
      disjuntorIn = proximoDisjuntorAcima(Math.max(ib, inMin));
      precisaDividirCircuito = precisaDividirCircuito || secaoMax != null;
      avisos.push(
        `DJ ajustado para ${disjuntorIn} A (≥ Ib ${ib.toFixed(1)} A). Verifique se Iz ${izCorrigida.toFixed(1)} A ainda protege o cabo.`
      );
    }

    if (secaoMax != null && (ib > izCorrigida + 0.05 || disjuntorIn > izCorrigida + 1e-9)) {
      precisaDividirCircuito = true;
    }

    const polos =
      input.polos != null && input.polos !== ""
        ? Math.max(1, Number(input.polos) || 1)
        : tipo.polos || (tensaoV >= 220 && Number(fases) !== 1 ? 2 : 1);

    // Curva: tipo + partida
    const fatorPartida = Number(input.fatorPartida ?? tipo.fatorPartida ?? 1) || 1;
    const correntePartida = ib * fatorPartida;
    let curva = input.curva || tipo.curva || "C";
    if (!input.curva && fatorPartida >= 6) curva = "D";
    else if (!input.curva && fatorPartida >= 4 && curva === "B") curva = "C";
    const partida = {
      fator: fatorPartida,
      correnteA: correntePartida,
      ok: fatorPartida <= 1 || curva === "D" || (curva === "C" && fatorPartida <= 5)
    };
    if (fatorPartida > 1) {
      avisos.push(
        `Partida estimada ≈ ${correntePartida.toFixed(0)} A (${fatorPartida}×Ib) — curva ${curva} sugerida.`
      );
    }

    const nCondutores =
      input.nCondutores != null
        ? Math.max(2, Number(input.nCondutores) || 2)
        : polos >= 3
          ? 5
          : 3;
    const metrosCabo = comprimentoM > 0 ? comprimentoM * nCondutores : 0;
    const metrosNeutro = comprimentoM > 0 ? comprimentoM : 0;
    const metrosPe = comprimentoM > 0 && nCondutores >= 3 ? comprimentoM : 0;

    const eletrodutoCalc = eletrodutoPorOcupacao({
      secaoMm2: secao,
      nCondutores,
      nCircuitos: Number(input.nCircuitosEletroduto) || 1
    });
    if (!eletrodutoCalc.ok) {
      avisos.push(
        `Eletroduto ${eletrodutoCalc.eletroduto}: ocupação ${eletrodutoCalc.ocupacaoPct}% (limite ~${eletrodutoCalc.limitePct}%).`
      );
    }

    const icc = checarCurtoCircuito({
      ib,
      disjuntorIn,
      iccKA: input.iccKA != null ? Number(input.iccKA) : 6,
      capacidadeKA: input.capacidadeKA != null ? Number(input.capacidadeKA) : 6
    });
    if (icc.aviso) avisos.push(icc.aviso);

    const divisao = sugerirDivisaoCircuito({ potenciaW, tipoId: tipo.id });
    if (precisaDividirCircuito || divisao.precisaDividir) {
      precisaDividirCircuito = true;
      if (divisao.aviso) avisos.push(divisao.aviso);
    }

    if (!queda.okTerminal) {
      avisos.push(`Queda estimada ${queda.pct.toFixed(2)}% acima de 4% (circuito terminal).`);
    } else if (!queda.okOrigem) {
      avisos.push(`Queda estimada ${queda.pct.toFixed(2)}% — atenção ao limite de 7% da origem.`);
    }

    if (forcarDr) {
      avisos.push("DR/IDR 30 mA recomendado (banheiros, áreas molhadas, TUG — NBR 5410).");
    }

    const result = {
      tipo,
      entrada: {
        potenciaW,
        tensaoV,
        fases,
        fp,
        comprimentoM,
        nPontos,
        inMin,
        metodoId,
        agrupamentoId: input.agrupamentoId || "1",
        tempId: input.tempId || "30",
        ka,
        kt,
        k,
        secaoMax
      },
      ib,
      cabo: {
        secao,
        iz: tabela.find((c) => c.secao === secao)?.iz || cabo.iz,
        izCorrigida,
        metodoId
      },
      disjuntor: { In: disjuntorIn, polos, curva },
      queda,
      quedaAcumulada: quedaAcum,
      partida,
      dr: forcarDr,
      metrosCabo,
      metrosNeutro,
      metrosPe,
      nCondutores,
      eletroduto: eletrodutoCalc.eletroduto,
      eletrodutoCalc,
      icc,
      divisao,
      precisaDividirCircuito,
      avisos: [...new Set(avisos)],
      disclaimer:
        "Cálculo auxiliar NBR 5410: método de instalação, Iz·k ≥ Ib, Ib ≤ In ≤ Iz, queda, ocupação e partida aproximada. Não substitui projeto assinado."
    };
    result.checklist = checklistDimensionamento(result);
    return result;
  }

  /** Texto de memorial técnico (para PDF / copiar). */
  function memorialTexto(dim) {
    if (!dim) return "";
    const e = dim.entrada || {};
    const lines = [
      `MEMORIAL DE DIMENSIONAMENTO (assistente NBR 5410)`,
      `Tipo: ${dim.tipo?.label || "—"}`,
      `Potência: ${e.potenciaW} W · Tensão: ${e.tensaoV} V · FP: ${e.fp} · Fases: ${e.fases}`,
      `Método: ${e.metodoId || "B1"} · Agrupamento: ${e.agrupamentoId} (ka=${e.ka}) · Temp: ${e.tempId} (kt=${e.kt})`,
      `Comprimento: ${e.comprimentoM} m · Condutores: ${dim.nCondutores}`,
      `Ib = ${dim.ib?.toFixed(2)} A`,
      `Cabo: ${dim.cabo?.secao} mm² Cu PVC · Iz=${dim.cabo?.iz} A · Iz·k=${dim.cabo?.izCorrigida?.toFixed(1)} A`,
      `Disjuntor: ${dim.disjuntor?.In} A · ${dim.disjuntor?.polos}P · curva ${dim.disjuntor?.curva}`,
      `Queda: ${dim.queda?.pct?.toFixed(2)}% (ΔV=${dim.queda?.dV?.toFixed(2)} V) · terminal ${dim.queda?.okTerminal ? "OK" : "FORA"}`,
      dim.quedaAcumulada
        ? `Queda acumulada: ${dim.quedaAcumulada.pct.toFixed(2)}%`
        : null,
      dim.partida?.fator > 1
        ? `Partida ≈ ${dim.partida.correnteA.toFixed(0)} A (${dim.partida.fator}×Ib)`
        : null,
      `Eletroduto: ${dim.eletroduto} · ocupação ${dim.eletrodutoCalc?.ocupacaoPct ?? "—"}%`,
      `DR 30 mA: ${dim.dr ? "sim" : "não"}`,
      dim.icc ? `Icc ref.: ${dim.icc.iccKA} kA / cap. ${dim.icc.capacidadeKA} kA` : null,
      dim.precisaDividirCircuito ? `ATENÇÃO: ${dim.divisao?.aviso || "dividir circuito"}` : null,
      "",
      "Checklist:",
      ...(dim.checklist?.items || []).map(
        (i) => `  [${i.status.toUpperCase()}] ${i.label}: ${i.detail}`
      ),
      "",
      ...(dim.avisos || []).map((a) => `• ${a}`),
      "",
      dim.disclaimer || ""
    ];
    return lines.filter((x) => x != null).join("\n");
  }

  function sugerirMateriais(resultado, produtos, modoPreco = "medio") {
    const itens = [];
    const list = produtos || [];
    const find = (pred) => list.find(pred);

    const secao = resultado.cabo.secao;
    const caboMap = {
      1.5: "prd-13",
      2.5: "prd-10",
      4: "prd-11",
      6: "prd-12"
    };
    const caboId = caboMap[secao];
    const caboProd = caboId
      ? find((p) => p.id === caboId)
      : find((p) => (p.nome || "").toLowerCase().includes("cabo") && (p.nome || "").includes(String(secao).replace(".", ",")));

    if (caboProd) {
      const metros = Math.max(resultado.metrosCabo || resultado.entrada.comprimentoM || 0, 1);
      const precoM = getPrecoByModo(caboProd, modoPreco) / 100;
      itens.push({
        tipo: "produto",
        refId: caboProd.id,
        nome: `${caboProd.nome} (trecho ≈ ${metros.toFixed(0)} m)`,
        unidade: "m",
        qtd: Math.ceil(metros),
        preco: precoM,
        precoMin: (caboProd.precoMin || caboProd.preco) / 100,
        precoMed: caboProd.preco / 100,
        precoMax: (caboProd.precoMax || caboProd.preco) / 100,
        nota: `${secao} mm² · ${resultado.nCondutores} condutores · método ${resultado.entrada?.metodoId || "B1"}`
      });
    } else {
      itens.push({
        tipo: "produto",
        refId: null,
        nome: `Cabo flexível ${secao} mm²`,
        unidade: "m",
        qtd: Math.ceil(Math.max(resultado.metrosCabo || 0, 1)),
        preco: 0,
        nota: "Inclua preço manualmente — seção fora do catálogo padrão"
      });
    }

    const In = resultado.disjuntor.In;
    const polos = resultado.disjuntor.polos;
    let dj =
      polos >= 2
        ? find((p) => p.id === "prd-7")
        : find((p) => p.id === "prd-6");
    if (In > 40 && polos >= 2) {
      dj = find((p) => (p.nome || "").toLowerCase().includes("bipolar")) || dj;
    }
    if (dj) {
      itens.push({
        tipo: "produto",
        refId: dj.id,
        nome: `Disjuntor ${polos >= 2 ? "bipolar" : "monopolar"} ${In} A curva ${resultado.disjuntor.curva}`,
        unidade: "un",
        qtd: 1,
        preco: getPrecoByModo(dj, modoPreco),
        precoMin: dj.precoMin,
        precoMed: dj.preco,
        precoMax: dj.precoMax,
        nota: `In ${In} A · Ib ${resultado.ib.toFixed(2)} A · Iz ${resultado.cabo.izCorrigida.toFixed(1)} A`
      });
    }

    if (resultado.dr) {
      const dr = find((p) => p.id === "prd-8") || find((p) => (p.nome || "").toLowerCase().includes(" dr"));
      if (dr) {
        itens.push({
          tipo: "produto",
          refId: dr.id,
          nome: dr.nome,
          unidade: "un",
          qtd: 1,
          preco: getPrecoByModo(dr, modoPreco),
          precoMin: dr.precoMin,
          precoMed: dr.preco,
          precoMax: dr.precoMax,
          nota: "Diferencial residual 30 mA (recomendado)"
        });
      }
    }

    const L = resultado.entrada.comprimentoM || 0;
    if (L > 0) {
      const eletro = find((p) => p.id === "prd-14");
      if (eletro) {
        itens.push({
          tipo: "produto",
          refId: eletro.id,
          nome: `${eletro.nome} (sugestão ${resultado.eletroduto})`,
          unidade: "barra",
          qtd: Math.max(1, Math.ceil(L / 3)),
          preco: getPrecoByModo(eletro, modoPreco),
          precoMin: eletro.precoMin,
          precoMed: eletro.preco,
          precoMax: eletro.precoMax,
          nota: `Ocupação ~${resultado.eletrodutoCalc?.ocupacaoPct ?? "—"}%`
        });
      }
    }

    return itens;
  }

  function sugerirServicos(resultado, servicos, modoPreco = "medio") {
    const list = servicos || [];
    const itens = [];
    const pass = list.find((s) => s.id === "srv-27" || (s.nome || "").toLowerCase().includes("passagem de cabo"));
    const dj = list.find((s) => s.id === "srv-14" || (s.nome || "").toLowerCase().includes("troca de disjuntor"));
    const dr = list.find((s) => s.id === "srv-15" || (s.nome || "").toLowerCase().includes("disjuntor dr"));

    if (pass && resultado.entrada.comprimentoM > 0) {
      itens.push({
        tipo: "servico",
        refId: pass.id,
        nome: pass.nome,
        unidade: pass.unidade || "m",
        qtd: Math.max(1, Math.ceil(resultado.entrada.comprimentoM)),
        preco: getPrecoByModo(pass, modoPreco),
        precoMin: pass.precoMin,
        precoMed: pass.preco,
        precoMax: pass.precoMax
      });
    }
    if (dj) {
      itens.push({
        tipo: "servico",
        refId: dj.id,
        nome: dj.nome,
        unidade: "un",
        qtd: 1,
        preco: getPrecoByModo(dj, modoPreco),
        precoMin: dj.precoMin,
        precoMed: dj.preco,
        precoMax: dj.precoMax
      });
    }
    if (resultado.dr && dr) {
      itens.push({
        tipo: "servico",
        refId: dr.id,
        nome: dr.nome,
        unidade: "un",
        qtd: 1,
        preco: getPrecoByModo(dr, modoPreco),
        precoMin: dr.precoMin,
        precoMed: dr.preco,
        precoMax: dr.precoMax
      });
    }
    return itens;
  }

  /** Validação rápida da planta antes de orçar / analisar */
  function validarProjeto(projeto) {
    const issues = [];
    const points = projeto?.points || [];
    const conduits = projeto?.conduits || [];
    const qdc = points.find((p) => String(p.tipo || "").toLowerCase().includes("qdc"));
    if (!qdc) issues.push({ nivel: "fail", msg: "Inclua um QDC na planta." });
    if (!points.filter((p) => p.tipo && !String(p.tipo).includes("qdc")).length) {
      issues.push({ nivel: "warn", msg: "Nenhum ponto de carga na planta." });
    }
    if (!conduits.length) {
      issues.push({ nivel: "warn", msg: "Sem conduítes — caminhos e agrupamento ficam incompletos." });
    }
    const orfaos = points.filter(
      (p) =>
        p.tipo &&
        !String(p.tipo).toLowerCase().includes("qdc") &&
        !p.circuitoId &&
        p.tipo !== "guide"
    );
    if (orfaos.length) {
      issues.push({
        nivel: "warn",
        msg: `${orfaos.length} ponto(s) sem circuito atribuído.`
      });
    }
    const ok = !issues.some((i) => i.nivel === "fail");
    const itens = [
      {
        id: "qdc",
        ok: !issues.some((i) => /QDC/i.test(i.msg) && i.nivel === "fail"),
        texto: "QDC na planta"
      },
      {
        id: "pontos",
        ok: !issues.some((i) => /ponto de carga/i.test(i.msg)),
        texto: "Pontos de carga"
      },
      {
        id: "conduites",
        ok: !issues.some((i) => /conduíte/i.test(i.msg)),
        texto: "Conduítes / caminhos"
      },
      {
        id: "circuitos",
        ok: !issues.some((i) => /sem circuito/i.test(i.msg)),
        texto: "Pontos com circuito"
      }
    ];
    const faltando = issues.filter((i) => i.nivel === "fail").map((i) => i.msg);
    return { ok, issues, itens, faltando };
  }

export {
  TIPOS,
  FATOR_AGRUPAMENTO,
  FATOR_TEMP,
  CABOS,
  CABOS_BY_METODO,
  METODOS_INSTALACAO,
  DISJUNTORES,
  SECAO_MAX_TOMADA_TUE,
  ELETRODUTO_AREA,
  tipos,
  tipoById,
  metodos,
  metodoById,
  correnteProjeto,
  agrupamentoIdFromN,
  izCabo,
  dimensionar,
  sugerirMateriais,
  sugerirServicos,
  quedaTensao,
  quedaAcumulada,
  eletrodutoPorOcupacao,
  sugerirDivisaoCircuito,
  checarCurtoCircuito,
  checklistDimensionamento,
  memorialTexto,
  validarProjeto,
  cabosDoMetodo
};
export const NBR5410 = {
  TIPOS,
  FATOR_AGRUPAMENTO,
  FATOR_TEMP,
  CABOS,
  CABOS_BY_METODO,
  METODOS_INSTALACAO,
  DISJUNTORES,
  SECAO_MAX_TOMADA_TUE,
  ELETRODUTO_AREA,
  tipos,
  tipoById,
  metodos,
  metodoById,
  correnteProjeto,
  agrupamentoIdFromN,
  izCabo,
  dimensionar,
  sugerirMateriais,
  sugerirServicos,
  quedaTensao,
  quedaAcumulada,
  eletrodutoPorOcupacao,
  sugerirDivisaoCircuito,
  checarCurtoCircuito,
  checklistDimensionamento,
  memorialTexto,
  validarProjeto,
  cabosDoMetodo
};
