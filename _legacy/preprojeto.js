/**
 * Pré-projeto por ambientes — estimativa auxiliar (NBR 5410 simplificada)
 *
 * Fluxo: residência/comércio → cômodos → pontos → materiais + mão de obra + guia de circuitos.
 * NÃO substitui projeto elétrico de engenheiro/eletricitário habilitado.
 */
var PreProjeto = (() => {
  const LIMITES = {
    residencial: {
      pontosIlumPorCircuito: 10,
      tug10PorCircuito: 8,
      tug20PorCircuito: 4,
      potIlumPorPontoVA: 100,
      potTug10VA: 100,
      potTug20VA: 600
    },
    comercial: {
      pontosIlumPorCircuito: 8,
      tug10PorCircuito: 6,
      tug20PorCircuito: 3,
      potIlumPorPontoVA: 150,
      potTug10VA: 200,
      potTug20VA: 600
    }
  };

  /** Metros médios de cabo por ponto (estimativa de campo) */
  const METROS = {
    tomada10: 8,
    tomada20: 10,
    interruptor: 6,
    pontoLuz: 7,
    paralelo: 10,
    sensor: 6,
    chuveiro: 14,
    ar: 16,
    fogao: 12
  };

  const CAMPOS = [
    { key: "tomadas10", label: "Tomadas 10A", hint: "TUG comum" },
    { key: "tomadas20", label: "Tomadas 20A", hint: "Carga maior / TUE leve" },
    { key: "interruptores", label: "Interruptores simples", hint: "" },
    { key: "paralelos", label: "Interruptores paralelos", hint: "Three-way" },
    { key: "pontosLuz", label: "Pontos de luz", hint: "Luminárias / spots" },
    { key: "sensores", label: "Sensores de presença", hint: "" },
    { key: "chuveiros", label: "Chuveiros", hint: "Circuito dedicado" },
    { key: "ares", label: "Ar-condicionado", hint: "Circuito dedicado" },
    { key: "fogoes", label: "Fogão / forno elétrico", hint: "Circuito dedicado" }
  ];

  const PRESETS = {
    residencial: [
      {
        id: "sala",
        label: "Sala",
        defaults: { tomadas10: 5, tomadas20: 0, interruptores: 2, paralelos: 0, pontosLuz: 2, sensores: 0, chuveiros: 0, ares: 0, fogoes: 0, area: 20 }
      },
      {
        id: "quarto",
        label: "Quarto",
        defaults: { tomadas10: 4, tomadas20: 0, interruptores: 1, paralelos: 0, pontosLuz: 1, sensores: 0, chuveiros: 0, ares: 1, fogoes: 0, area: 12 }
      },
      {
        id: "cozinha",
        label: "Cozinha",
        defaults: { tomadas10: 4, tomadas20: 3, interruptores: 1, paralelos: 0, pontosLuz: 2, sensores: 0, chuveiros: 0, ares: 0, fogoes: 1, area: 10 }
      },
      {
        id: "banheiro",
        label: "Banheiro",
        defaults: { tomadas10: 1, tomadas20: 0, interruptores: 1, paralelos: 0, pontosLuz: 1, sensores: 0, chuveiros: 1, ares: 0, fogoes: 0, area: 5 }
      },
      {
        id: "area",
        label: "Área de serviço",
        defaults: { tomadas10: 2, tomadas20: 2, interruptores: 1, paralelos: 0, pontosLuz: 1, sensores: 0, chuveiros: 0, ares: 0, fogoes: 0, area: 6 }
      },
      {
        id: "varanda",
        label: "Varanda / garagem",
        defaults: { tomadas10: 2, tomadas20: 0, interruptores: 1, paralelos: 0, pontosLuz: 1, sensores: 1, chuveiros: 0, ares: 0, fogoes: 0, area: 8 }
      },
      {
        id: "outro",
        label: "Outro cômodo",
        defaults: { tomadas10: 2, tomadas20: 0, interruptores: 1, paralelos: 0, pontosLuz: 1, sensores: 0, chuveiros: 0, ares: 0, fogoes: 0, area: 10 }
      }
    ],
    comercial: [
      {
        id: "loja",
        label: "Salão / loja",
        defaults: { tomadas10: 8, tomadas20: 2, interruptores: 2, paralelos: 0, pontosLuz: 8, sensores: 0, chuveiros: 0, ares: 2, fogoes: 0, area: 40 }
      },
      {
        id: "escritorio",
        label: "Escritório",
        defaults: { tomadas10: 6, tomadas20: 2, interruptores: 1, paralelos: 0, pontosLuz: 4, sensores: 0, chuveiros: 0, ares: 1, fogoes: 0, area: 20 }
      },
      {
        id: "banheiro_c",
        label: "Banheiro",
        defaults: { tomadas10: 1, tomadas20: 0, interruptores: 1, paralelos: 0, pontosLuz: 1, sensores: 0, chuveiros: 0, ares: 0, fogoes: 0, area: 4 }
      },
      {
        id: "deposito",
        label: "Depósito / estoque",
        defaults: { tomadas10: 2, tomadas20: 1, interruptores: 1, paralelos: 0, pontosLuz: 2, sensores: 1, chuveiros: 0, ares: 0, fogoes: 0, area: 15 }
      },
      {
        id: "copa",
        label: "Copa / refeitório",
        defaults: { tomadas10: 4, tomadas20: 2, interruptores: 1, paralelos: 0, pontosLuz: 2, sensores: 0, chuveiros: 0, ares: 0, fogoes: 0, area: 12 }
      },
      {
        id: "outro_c",
        label: "Outro ambiente",
        defaults: { tomadas10: 4, tomadas20: 1, interruptores: 1, paralelos: 0, pontosLuz: 2, sensores: 0, chuveiros: 0, ares: 0, fogoes: 0, area: 15 }
      }
    ]
  };

  function emptyPontos() {
    return {
      tomadas10: 0,
      tomadas20: 0,
      interruptores: 0,
      paralelos: 0,
      pontosLuz: 0,
      sensores: 0,
      chuveiros: 0,
      ares: 0,
      fogoes: 0
    };
  }

  function criarComodo(uso, presetId, nomeCustom) {
    const lista = PRESETS[uso] || PRESETS.residencial;
    const preset = lista.find((p) => p.id === presetId) || lista[lista.length - 1];
    return {
      id: `com-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      presetId: preset.id,
      nome: nomeCustom || preset.label,
      area: preset.defaults.area || 10,
      ...emptyPontos(),
      tomadas10: preset.defaults.tomadas10 || 0,
      tomadas20: preset.defaults.tomadas20 || 0,
      interruptores: preset.defaults.interruptores || 0,
      paralelos: preset.defaults.paralelos || 0,
      pontosLuz: preset.defaults.pontosLuz || 0,
      sensores: preset.defaults.sensores || 0,
      chuveiros: preset.defaults.chuveiros || 0,
      ares: preset.defaults.ares || 0,
      fogoes: preset.defaults.fogoes || 0
    };
  }

  function somarPontos(comodos) {
    const tot = emptyPontos();
    (comodos || []).forEach((c) => {
      CAMPOS.forEach(({ key }) => {
        tot[key] += Math.max(0, Number(c[key]) || 0);
      });
    });
    return tot;
  }

  function ceilDiv(n, d) {
    if (!d) return 0;
    return Math.ceil(Math.max(0, n) / d);
  }

  function estimarCircuitos(uso, comodos) {
    const lim = LIMITES[uso] || LIMITES.residencial;
    const p = somarPontos(comodos);

    const circuitosIluminacao = Math.max(
      p.pontosLuz || p.sensores ? 1 : 0,
      ceilDiv(p.pontosLuz + p.sensores, lim.pontosIlumPorCircuito)
    );
    const circuitosTug10 = ceilDiv(p.tomadas10, lim.tug10PorCircuito);
    const circuitosTug20 = ceilDiv(p.tomadas20, lim.tug20PorCircuito);
    const circuitosTug = circuitosTug10 + circuitosTug20;
    const circuitosDedicados = p.chuveiros + p.ares + p.fogoes;

    // Reserva: comando de iluminação compartilhado já contado; adiciona 1 circuito reserva se imóvel médio+
    const totalPontos =
      p.tomadas10 + p.tomadas20 + p.pontosLuz + p.interruptores + p.paralelos + p.sensores;
    const reserva = totalPontos >= 25 ? 1 : 0;

    const total = circuitosIluminacao + circuitosTug + circuitosDedicados + reserva;

    const potIlumVA = (p.pontosLuz + p.sensores) * lim.potIlumPorPontoVA;
    const potTugVA = p.tomadas10 * lim.potTug10VA + p.tomadas20 * lim.potTug20VA;
    // Cargas dedicadas (previsão típica)
    const potDedicadaVA = p.chuveiros * 5500 + p.ares * 2500 + p.fogoes * 6000;

    return {
      iluminacao: {
        qtd: circuitosIluminacao,
        pontos: p.pontosLuz + p.sensores,
        bitola: "1,5 mm²",
        disjuntor: "10 A (curva B/C)",
        detalhe: `Até ~${lim.pontosIlumPorCircuito} pontos/circuito (${uso})`
      },
      tug: {
        qtd: circuitosTug,
        tug10: p.tomadas10,
        tug20: p.tomadas20,
        circuitosTug10,
        circuitosTug20,
        bitola: "2,5 mm² (TUG) · 4,0 mm² se carga alta",
        disjuntor: "16–20 A (curva C)",
        detalhe: `TUG 10A: ~${lim.tug10PorCircuito}/circuito · TUG 20A: ~${lim.tug20PorCircuito}/circuito`
      },
      dedicados: {
        qtd: circuitosDedicados,
        chuveiros: p.chuveiros,
        ares: p.ares,
        fogoes: p.fogoes,
        bitola: "4–6 mm² (chuveiro) · 2,5–4 mm² (ar) · conforme carga",
        disjuntor: "Dedicado por equipamento",
        detalhe: "1 circuito exclusivo por chuveiro, ar ou fogão/forno"
      },
      reserva: {
        qtd: reserva,
        detalhe: reserva ? "1 circuito reserva sugerido para expansão" : "Sem reserva (imóvel pequeno)"
      },
      total,
      quadroSugerido: total <= 12 ? 12 : total <= 24 ? 24 : 36,
      potenciaPrevistaVA: potIlumVA + potTugVA + potDedicadaVA,
      potenciaPrevistaW: potIlumVA + potTugVA + potDedicadaVA,
      pontos: p
    };
  }

  function metrosCabo(pontos) {
    let m15 = 0;
    let m25 = 0;
    let m40 = 0;
    let m60 = 0;

    m15 += (pontos.pontosLuz + pontos.sensores) * METROS.pontoLuz;
    m15 += pontos.interruptores * METROS.interruptor;
    m15 += pontos.paralelos * METROS.paralelo;

    m25 += pontos.tomadas10 * METROS.tomada10;
    m25 += pontos.tomadas20 * METROS.tomada20;

    m40 += pontos.ares * METROS.ar;
    m40 += pontos.fogoes * METROS.fogao;
    m60 += pontos.chuveiros * METROS.chuveiro;

    // Condutores aprox. (ida/retorno + PE já embutido no fator de metros médios)
    return {
      "1.5": Math.ceil(m15),
      "2.5": Math.ceil(m25),
      "4": Math.ceil(m40),
      "6": Math.ceil(m60)
    };
  }

  function line(produtos, id, nomeFallback, qtd, unidade, modo, nota) {
    if (qtd <= 0) return null;
    const p = (produtos || []).find((x) => x.id === id);
    if (p) {
      return {
        tipo: "produto",
        refId: p.id,
        nome: p.nome,
        unidade: unidade || p.unidade || "un",
        qtd,
        preco: typeof getPrecoByModo === "function" ? getPrecoByModo(p, modo) : p.preco,
        precoMin: p.precoMin,
        precoMed: p.preco,
        precoMax: p.precoMax,
        nota
      };
    }
    return {
      tipo: "produto",
      refId: null,
      nome: nomeFallback,
      unidade: unidade || "un",
      qtd,
      preco: 0,
      nota: nota || "Preço a definir"
    };
  }

  function caboLinha(produtos, secao, metros, modo) {
    if (metros <= 0) return null;
    const map = { "1.5": "prd-13", "2.5": "prd-10", "4": "prd-11", "6": "prd-12" };
    const p = (produtos || []).find((x) => x.id === map[secao]);
    const precoM = p
      ? (typeof getPrecoByModo === "function" ? getPrecoByModo(p, modo) : p.preco) / 100
      : 0;
    return {
      tipo: "produto",
      refId: p?.id || null,
      nome: p ? `${p.nome} (≈ ${metros} m)` : `Cabo ${secao} mm²`,
      unidade: "m",
      qtd: metros,
      preco: precoM,
      precoMin: p ? (p.precoMin || p.preco) / 100 : 0,
      precoMed: p ? p.preco / 100 : 0,
      precoMax: p ? (p.precoMax || p.preco) / 100 : 0,
      nota: `Estimativa de campo · seção ${secao} mm²`
    };
  }

  function sugerirMateriais(uso, comodos, produtos, circuitos, modo = "medio") {
    const p = somarPontos(comodos);
    const itens = [];
    const push = (x) => {
      if (x) itens.push(x);
    };

    push(line(produtos, "prd-1", "Tomada 10A", p.tomadas10, "un", modo));
    push(line(produtos, "prd-2", "Tomada 20A", p.tomadas20, "un", modo));
    push(line(produtos, "prd-3", "Interruptor simples", p.interruptores, "un", modo));
    push(line(produtos, "prd-4", "Interruptor paralelo", p.paralelos, "un", modo));
    push(
      line(
        produtos,
        "prd-5",
        "Placa 4x2 + suporte",
        p.tomadas10 + p.tomadas20 + p.interruptores + p.paralelos + p.sensores,
        "un",
        modo,
        "1 placa por ponto de comando/tomada (estimado)"
      )
    );
    push(
      line(
        produtos,
        "prd-15",
        "Caixa 4x2",
        p.tomadas10 +
          p.tomadas20 +
          p.interruptores +
          p.paralelos +
          p.pontosLuz +
          p.sensores,
        "un",
        modo
      )
    );

    const metros = metrosCabo(p);
    Object.entries(metros).forEach(([secao, m]) => push(caboLinha(produtos, secao, m, modo)));

    const barrasEletro = Math.ceil(
      (metros["1.5"] + metros["2.5"] + metros["4"] + metros["6"]) / 9
    );
    push(line(produtos, "prd-14", "Eletroduto PVC 3/4\"", barrasEletro, "barra", modo, "Estimativa por metro de cabo"));

    const qDjMono = circuitos.iluminacao.qtd + circuitos.tug.circuitosTug10 + circuitos.reserva.qtd;
    const qDjBi =
      circuitos.tug.circuitosTug20 + circuitos.dedicados.qtd;
    push(line(produtos, "prd-6", "Disjuntor monopolar", qDjMono, "un", modo, "Iluminação / TUG 10A / reserva"));
    push(line(produtos, "prd-7", "Disjuntor bipolar", qDjBi, "un", modo, "TUG 20A e circuitos dedicados"));

    const drQtd = Math.max(1, Math.ceil((p.tomadas10 + p.chuveiros) > 0 ? 1 : 0) + (uso === "comercial" ? 1 : 0));
    if (p.tomadas10 + p.chuveiros + p.tomadas20 > 0) {
      push(line(produtos, "prd-8", "Disjuntor DR 30mA", Math.min(drQtd, 3), "un", modo, "Proteção diferencial (recomendado)"));
    }

    push(line(produtos, "prd-9", "DPS classe II", uso === "comercial" ? 2 : 1, "un", modo));

    const quadroId = circuitos.quadroSugerido <= 12 ? "prd-16" : "prd-17";
    push(
      line(
        produtos,
        quadroId,
        `Quadro ${circuitos.quadroSugerido} disjuntores`,
        1,
        "un",
        modo,
        `${circuitos.total} circuitos estimados`
      )
    );

    return itens;
  }

  function sugerirServicos(comodos, servicos, modo = "medio") {
    const p = somarPontos(comodos);
    const list = servicos || [];
    const find = (pred) => list.find(pred);
    const itens = [];

    const add = (sv, qtd, nomeExtra) => {
      if (!sv || qtd <= 0) return;
      itens.push({
        tipo: "servico",
        refId: sv.id,
        nome: nomeExtra || sv.nome,
        unidade: sv.unidade || "un",
        qtd,
        preco: typeof getPrecoByModo === "function" ? getPrecoByModo(sv, modo) : sv.preco,
        precoMin: sv.precoMin,
        precoMed: sv.preco,
        precoMax: sv.precoMax
      });
    };

    add(find((s) => s.id === "srv-2" || /tomada nova/i.test(s.nome)), p.tomadas10);
    add(find((s) => s.id === "srv-3" || /20A|220V/i.test(s.nome)), p.tomadas20);
    add(find((s) => s.id === "srv-5" || /interruptor novo/i.test(s.nome)), p.interruptores);
    add(find((s) => s.id === "srv-29" || /paralelo|three-way/i.test(s.nome)), p.paralelos);
    add(find((s) => s.id === "srv-8" || /ponto de ilumina/i.test(s.nome)), p.pontosLuz);
    add(find((s) => s.id === "srv-10" || /sensor/i.test(s.nome)), p.sensores);
    add(find((s) => s.id === "srv-12" || /chuveiro el/i.test(s.nome)), p.chuveiros);
    add(find((s) => s.id === "srv-13" || /ar-condicionado/i.test(s.nome)), p.ares);
    add(find((s) => s.id === "srv-16" || /quadro \(até 12/i.test(s.nome)), 1, "Montagem de quadro (estimativa)");

    return itens;
  }

  function calcular({ uso, comodos, produtos, servicos, modoPreco }) {
    const u = uso === "comercial" ? "comercial" : "residencial";
    const lista = comodos || [];
    const circuitos = estimarCircuitos(u, lista);
    const materiais = sugerirMateriais(u, lista, produtos, circuitos, modoPreco || "medio");
    const maoObra = sugerirServicos(lista, servicos, modoPreco || "medio");
    const totalMat = materiais.reduce((t, i) => t + i.qtd * i.preco, 0);
    const totalServ = maoObra.reduce((t, i) => t + i.qtd * i.preco, 0);

    return {
      uso: u,
      comodos: lista,
      pontos: circuitos.pontos,
      circuitos,
      materiais,
      maoObra,
      totais: {
        materiais: totalMat,
        maoObra: totalServ,
        geral: totalMat + totalServ
      },
      disclaimer:
        "Estimativa auxiliar com base em práticas usuais e critérios simplificados da NBR 5410. Serve só como referência para orçamento — não substitui projeto elétrico assinado por profissional habilitado."
    };
  }

  return {
    CAMPOS,
    PRESETS,
    LIMITES,
    criarComodo,
    somarPontos,
    estimarCircuitos,
    calcular
  };
})();
