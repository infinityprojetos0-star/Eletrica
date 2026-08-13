/** Dimensionamento NBR 5410 — domínio puro. */
import { getPrecoByModo } from "../data/catalog";


  const DISJUNTORES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125, 160];

  /**
   * Iz (A) — Cu PVC 70 °C, método B1 (eletroduto embutido), 2 condutores carregados.
   * Valores de referência práticos (NBR 5410 / tabelas de obra, ex. Engehall).
   */
  const CABOS = [
    { secao: 1.5, iz: 17.5 },
    { secao: 2.5, iz: 24 },
    { secao: 4, iz: 32 },
    { secao: 6, iz: 41 },
    { secao: 10, iz: 57 },
    { secao: 16, iz: 76 },
    { secao: 25, iz: 101 },
    { secao: 35, iz: 125 },
    { secao: 50, iz: 151 }
  ];

  /** Bitola máxima em bornes de tomada TUE (acima disso não entra no terminal). */
  const SECAO_MAX_TOMADA_TUE = 4;

  const TIPOS = [
    {
      id: "iluminacao",
      label: "Iluminação",
      secaoMin: 1.5,
      polos: 1,
      curva: "B",
      fp: 1,
      drRecomendado: false,
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
      descricao: "Tomadas gerais — mín. 2,5 mm² · DJ 20 A (16 A se poucas tomadas)"
    },
    {
      id: "chuveiro",
      label: "Chuveiro / aquecedor",
      secaoMin: 4,
      polos: 2,
      curva: "C",
      fp: 1,
      drRecomendado: true,
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
      potenciaPadrao: 3500,
      tensaoPadrao: 220,
      descricao: "Considere corrente de partida (curva C)"
    },
    {
      id: "motor",
      label: "Motor / bomba",
      secaoMin: 2.5,
      polos: 2,
      curva: "C",
      fp: 0.8,
      drRecomendado: false,
      potenciaPadrao: 1500,
      tensaoPadrao: 220,
      descricao: "Curva C; partida pode exigir sobredimensionar"
    },
    {
      id: "livre",
      label: "Carga livre / customizada",
      secaoMin: 1.5,
      polos: 1,
      curva: "C",
      fp: 1,
      drRecomendado: false,
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
    // monofásico ou bifásico (fase-fase / fase-neutro): P/(V·fp)
    return P / (V * cos);
  }

  function fatorK(agrupamentoId, tempId) {
    const ka = FATOR_AGRUPAMENTO.find((x) => x.id === agrupamentoId)?.k ?? 1;
    const kt = FATOR_TEMP.find((x) => x.id === tempId)?.k ?? 1;
    return { ka, kt, k: ka * kt };
  }

  function izCabo(secao, k) {
    const cabo = CABOS.find((c) => c.secao === secao);
    if (!cabo) return 0;
    return cabo.iz * (Number(k) || 1);
  }

  function escolherCabo(ib, secaoMin, k, secaoMax = null) {
    for (const cabo of CABOS) {
      if (cabo.secao + 1e-9 < secaoMin) continue;
      if (secaoMax != null && cabo.secao - 1e-9 > secaoMax) continue;
      const izCorrigida = cabo.iz * k;
      if (izCorrigida + 1e-9 >= ib) return { ...cabo, izCorrigida };
    }
    // Sem cabo ≤ secaoMax que aguente Ib
    if (secaoMax != null) {
      const capped = [...CABOS].reverse().find((c) => c.secao <= secaoMax + 1e-9) || CABOS[0];
      return {
        ...capped,
        izCorrigida: capped.iz * k,
        alerta: `Ib acima da capacidade de ${capped.secao} mm² com os fatores aplicados.`
      };
    }
    const last = CABOS[CABOS.length - 1];
    return {
      ...last,
      izCorrigida: last.iz * k,
      alerta: "Corrente acima da tabela embutida — consulte projeto."
    };
  }

  function escolherDisjuntor(ib, izCorrigida) {
    for (const In of DISJUNTORES) {
      if (In >= ib && In <= izCorrigida + 1e-9) return In;
    }
    const minOk = DISJUNTORES.find((In) => In >= ib) || DISJUNTORES[DISJUNTORES.length - 1];
    return minOk;
  }

  /**
   * TUG: prática de obra — DJ 20 A; com poucas tomadas (≤2) pode 16 A.
   * Sempre Ib ≤ In ≤ Iz.
   */
  function escolherDisjuntorTug(ib, izCorrigida, nPontos) {
    const n = Number(nPontos) || 0;
    const preferidos = n > 0 && n <= 2 ? [16, 20] : [20, 16];
    for (const In of preferidos) {
      if (In >= ib - 1e-9 && In <= izCorrigida + 1e-9) return In;
    }
    return escolherDisjuntor(ib, izCorrigida);
  }

  /**
   * Queda de tensão aproximada (cobre).
   * Monofásico/bifásico: ΔV = 2 · L · I · ρ / S
   * Trifásico: ΔV = √3 · L · I · ρ / S
   * ρ ≈ 0,0225 Ω·mm²/m (CA, estimativa prática)
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

  function dimensionar(input) {
    const tipo = tipoById(input.tipoId);
    const potenciaW = Number(input.potenciaW ?? tipo.potenciaPadrao ?? 0);
    const tensaoV = Number(input.tensaoV ?? tipo.tensaoPadrao ?? 220);
    const fases = Number(input.fases || (tipo.polos >= 2 && tensaoV >= 220 ? 2 : 1)) || 1;
    const fp = Number(input.fp ?? tipo.fp ?? 1);
    const comprimentoM = Number(input.comprimentoM) || 0;
    const nPontos = Number(input.nPontos) || 0;
    const { ka, kt, k } = fatorK(input.agrupamentoId || "1", input.tempId || "30");
    const forcarDr = input.dr === true || (input.dr !== false && tipo.drRecomendado);

    // TUE em tomada: bitola máx. 4 mm² (borne). Chuveiro/ar/motor podem subir.
    const secaoMax =
      input.secaoMax != null
        ? Number(input.secaoMax)
        : tipo.id === "tue"
          ? SECAO_MAX_TOMADA_TUE
          : null;

    const ib = correnteProjeto({ potenciaW, tensaoV, fases: fases === 3 ? 3 : 1, fp });
    const cabo = escolherCabo(ib, tipo.secaoMin, k, secaoMax);
    let secao = cabo.secao;
    let izCorrigida = cabo.izCorrigida;
    let queda = quedaTensao({
      comprimentoM,
      correnteA: ib,
      secaoMm2: secao,
      tensaoV,
      fases: fases === 3 ? 3 : 1
    });

    const avisos = [];
    if (cabo.alerta) avisos.push(cabo.alerta);

    // Aumenta seção por queda de tensão — sem passar do teto TUE (4 mm²)
    while (!queda.okTerminal && secao < CABOS[CABOS.length - 1].secao) {
      const idx = CABOS.findIndex((c) => c.secao === secao);
      const next = CABOS[idx + 1];
      if (!next) break;
      if (secaoMax != null && next.secao > secaoMax + 1e-9) {
        avisos.push(
          `Queda ${queda.pct.toFixed(2)}% com ${secao} mm² — não sobe bitola (limite ${secaoMax} mm² em borne de tomada). Considere encurtar o circuito ou dividir.`
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
      avisos.push(`Seção aumentada para ${secao} mm² por queda de tensão (limite ~4%).`);
    }

    if (secao < tipo.secaoMin) {
      secao = tipo.secaoMin;
      const c = CABOS.find((x) => x.secao === secao) || cabo;
      izCorrigida = c.iz * k;
    }

    let precisaDividirCircuito = false;
    if (secaoMax != null && ib > izCorrigida + 0.05) {
      precisaDividirCircuito = true;
      avisos.push(
        `Ib ${ib.toFixed(1)} A > Iz ${izCorrigida.toFixed(1)} A em ${secao} mm² (ka=${ka}, kt=${kt}). ` +
          `TUE não pode passar de ${secaoMax} mm² no borne — divida em 2 circuitos ou use 220 V / menos agrupamento.`
      );
    }

    let disjuntorIn =
      tipo.id === "tug"
        ? escolherDisjuntorTug(ib, izCorrigida, nPontos)
        : escolherDisjuntor(ib, izCorrigida);

    // Garante cabo compatível com Ib e In ≤ Iz (respeitando secaoMax)
    for (let guard = 0; guard < 8; guard++) {
      if (disjuntorIn <= izCorrigida + 1e-9 && izCorrigida + 1e-9 >= ib) break;
      const idx = CABOS.findIndex((c) => c.secao === secao);
      const next = CABOS[idx + 1];
      if (!next || (secaoMax != null && next.secao > secaoMax + 1e-9)) {
        if (secaoMax != null) {
          precisaDividirCircuito = true;
          // Protege o cabo: In ≤ Iz mesmo que Ib fique acima (alerta já emitido)
          disjuntorIn = escolherDisjuntor(Math.min(ib, izCorrigida), izCorrigida);
          if (tipo.id === "tug") {
            disjuntorIn = escolherDisjuntorTug(Math.min(ib, izCorrigida), izCorrigida, nPontos);
          }
        } else {
          avisos.push(
            `Disjuntor ${disjuntorIn} A / Ib ${ib.toFixed(1)} A acima da tabela de cabos embutida.`
          );
        }
        break;
      }
      secao = next.secao;
      izCorrigida = next.iz * k;
      avisos.push(`Cabo ajustado para ${secao} mm² (Ib/disjuntor).`);
      disjuntorIn =
        tipo.id === "tug"
          ? escolherDisjuntorTug(ib, izCorrigida, nPontos)
          : escolherDisjuntor(ib, izCorrigida);
    }

    // TUG: reforça preferência 20 A / 16 A após cabo final
    if (tipo.id === "tug") {
      disjuntorIn = escolherDisjuntorTug(ib, izCorrigida, nPontos);
    }

    const polos =
      input.polos != null && input.polos !== ""
        ? Math.max(1, Number(input.polos) || 1)
        : tipo.polos || (tensaoV >= 220 && Number(fases) !== 1 ? 2 : 1);
    const curva = input.curva || tipo.curva || "C";
    const nCondutores =
      input.nCondutores != null
        ? Math.max(2, Number(input.nCondutores) || 2)
        : polos >= 3
          ? 5
          : 3;
    const metrosCabo = comprimentoM > 0 ? comprimentoM * nCondutores : 0;

    const eletroduto =
      secao <= 2.5 ? '3/4"' : secao <= 6 ? '3/4" a 1"' : secao <= 16 ? '1" a 1.1/4"' : '≥ 1.1/2"';

    if (!queda.okTerminal) {
      avisos.push(`Queda estimada ${queda.pct.toFixed(2)}% acima de 4% (circuito terminal).`);
    } else if (!queda.okOrigem) {
      avisos.push(`Queda estimada ${queda.pct.toFixed(2)}% — atenção ao limite de 7% da origem.`);
    }

    if (forcarDr) {
      avisos.push("DR/IDR 30 mA recomendado (banheiros, áreas molhadas, TUG — NBR 5410).");
    }

    return {
      tipo,
      entrada: {
        potenciaW,
        tensaoV,
        fases,
        fp,
        comprimentoM,
        nPontos,
        agrupamentoId: input.agrupamentoId || "1",
        tempId: input.tempId || "30",
        ka,
        kt,
        k,
        secaoMax
      },
      ib,
      cabo: { secao, iz: CABOS.find((c) => c.secao === secao)?.iz || cabo.iz, izCorrigida },
      disjuntor: { In: disjuntorIn, polos, curva },
      queda,
      dr: forcarDr,
      metrosCabo,
      nCondutores,
      eletroduto,
      precisaDividirCircuito,
      avisos: [...new Set(avisos)],
      disclaimer:
        "Cálculo auxiliar conforme critérios simplificados da NBR 5410 (B1, agrupamento, queda). Confirme método de instalação e proteção no projeto oficial."
    };
  }

  /** Monta itens de material a partir do resultado + catálogo do app */
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
      const precoM = getPrecoByModo(caboProd, modoPreco) / 100; // rolo 100 m
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
        nota: `${secao} mm² · ${resultado.nCondutores} condutores (ida/retorno + PE approx.)`
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
          nota: "Estimativa por comprimento do circuito"
        });
      }
    }

    // Mão de obra sugerida (se existir no catálogo de serviços)
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


export {
  TIPOS,
  FATOR_AGRUPAMENTO,
  FATOR_TEMP,
  CABOS,
  DISJUNTORES,
  SECAO_MAX_TOMADA_TUE,
  tipos,
  tipoById,
  correnteProjeto,
  agrupamentoIdFromN,
  izCabo,
  dimensionar,
  sugerirMateriais,
  sugerirServicos,
  quedaTensao
};
export const NBR5410 = {
  TIPOS,
  FATOR_AGRUPAMENTO,
  FATOR_TEMP,
  CABOS,
  DISJUNTORES,
  SECAO_MAX_TOMADA_TUE,
  tipos,
  tipoById,
  correnteProjeto,
  agrupamentoIdFromN,
  izCabo,
  dimensionar,
  sugerirMateriais,
  sugerirServicos,
  quedaTensao
};
