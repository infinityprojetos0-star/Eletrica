/**
 * Preços médios Espírito Santo — referência 2026
 * Fontes:
 * - Mão de obra: mercado Vitória/ES (Cronoshare, construçãoereformasbr, Achei o Profissional)
 * - Composição SINAPI ES (multiplicador ~1,01 vs nacional): tomada ~R$121, quadro 12 ~R$475
 * - Materiais: varejo online (Leroy Merlin, Magazine Luiza, lojas elétricas) — marcas populares
 * preco = valor sugerido no orçamento (média de mercado / mão de obra)
 * precoMin / precoMax = faixa real praticada
 */

/**
 * Serviços alinhados à tabela Engehall/Meu Ajudante 2026 (PDF).
 * Regra: se o nosso valor estava acima do PDF, usamos o do PDF (mín/méd/máx).
 * Itens sem equivalente no PDF foram mantidos.
 */
const PRECO_FONTE = "Tabela Engehall 2026 + varejo (materiais)";

const SEED_SERVICOS = [
  {
    id: "srv-1",
    nome: "Troca de tomada simples",
    categoria: "Tomadas",
    tipo: "residencial",
    unidade: "ponto",
    preco: 58,
    precoMin: 45,
    precoMax: 70,
    tempo: "20–40 min",
    descricao: "PDF Engehall: instalação/troca tomada simples (mão de obra)."
  },
  {
    id: "srv-2",
    nome: "Instalação de tomada nova",
    categoria: "Tomadas",
    tipo: "residencial",
    unidade: "ponto",
    preco: 58,
    precoMin: 45,
    precoMax: 70,
    tempo: "1–2 h",
    descricao: "PDF: instalação de tomada simples (circuito até 20 m)."
  },
  {
    id: "srv-3",
    nome: "Instalação de tomada 20A / 220V",
    categoria: "Tomadas",
    tipo: "residencial",
    unidade: "ponto",
    preco: 128,
    precoMin: 105,
    precoMax: 150,
    tempo: "1–2 h",
    descricao: "Alinhado ao PDF tomada industrial / carga maior."
  },
  {
    id: "srv-4",
    nome: "Troca de interruptor",
    categoria: "Interruptores",
    tipo: "residencial",
    unidade: "ponto",
    preco: 68,
    precoMin: 50,
    precoMax: 80,
    tempo: "15–30 min",
    descricao: "PDF: interruptor simples (máx. limitado ao PDF)."
  },
  {
    id: "srv-5",
    nome: "Instalação de interruptor novo",
    categoria: "Interruptores",
    tipo: "residencial",
    unidade: "ponto",
    preco: 68,
    precoMin: 55,
    precoMax: 80,
    tempo: "45–90 min",
    descricao: "PDF: instalação de interruptor simples ou pulsador."
  },
  {
    id: "srv-6",
    nome: "Instalação de interruptor com dimmer",
    categoria: "Interruptores",
    tipo: "residencial",
    unidade: "ponto",
    preco: 130,
    precoMin: 80,
    precoMax: 220,
    tempo: "40–60 min",
    descricao: "Mantido — abaixo do PDF de automação (relé dimmer)."
  },
  {
    id: "srv-7",
    nome: "Instalação de luminária / plafon",
    categoria: "Iluminação",
    tipo: "residencial",
    unidade: "ponto",
    preco: 90,
    precoMin: 60,
    precoMax: 135,
    tempo: "30–50 min",
    descricao: "Máximo alinhado ao PDF lustre/luminária simples."
  },
  {
    id: "srv-8",
    nome: "Ponto de iluminação novo",
    categoria: "Iluminação",
    tipo: "residencial",
    unidade: "ponto",
    preco: 120,
    precoMin: 90,
    precoMax: 135,
    tempo: "1–2 h",
    descricao: "Médio/máx. alinhados ao PDF lustre simples."
  },
  {
    id: "srv-9",
    nome: "Instalação de spot LED embutido",
    categoria: "Iluminação",
    tipo: "residencial",
    unidade: "un",
    preco: 75,
    precoMin: 50,
    precoMax: 110,
    tempo: "20–40 min",
    descricao: "Máximo alinhado ao PDF arandela/pendente/spot."
  },
  {
    id: "srv-10",
    nome: "Instalação de sensor de presença",
    categoria: "Iluminação",
    tipo: "residencial",
    unidade: "un",
    preco: 110,
    precoMin: 80,
    precoMax: 140,
    tempo: "40–60 min",
    descricao: "Máximo alinhado ao PDF fotocélula/sensor."
  },
  {
    id: "srv-11",
    nome: "Instalação de ventilador de teto",
    categoria: "Instalações",
    tipo: "residencial",
    unidade: "un",
    preco: 150,
    precoMin: 100,
    precoMax: 200,
    tempo: "1–2 h",
    descricao: "Máximo alinhado ao PDF ventilador de teto."
  },
  {
    id: "srv-12",
    nome: "Instalação de chuveiro elétrico",
    categoria: "Instalações",
    tipo: "residencial",
    unidade: "un",
    preco: 115,
    precoMin: 105,
    precoMax: 125,
    tempo: "1–2 h",
    descricao: "PDF: chuveiro elétrico simples."
  },
  {
    id: "srv-13",
    nome: "Circuito para ar-condicionado",
    categoria: "Instalações",
    tipo: "residencial",
    unidade: "un",
    preco: 450,
    precoMin: 250,
    precoMax: 900,
    tempo: "3–5 h",
    descricao: "Sem equivalente direto no PDF — mantido."
  },
  {
    id: "srv-14",
    nome: "Troca de disjuntor",
    categoria: "Quadro",
    tipo: "residencial",
    unidade: "un",
    preco: 90,
    precoMin: 80,
    precoMax: 100,
    tempo: "20–40 min",
    descricao: "PDF: substituição disjuntor bifásico (faixa típica)."
  },
  {
    id: "srv-15",
    nome: "Instalação de disjuntor DR",
    categoria: "Quadro",
    tipo: "residencial",
    unidade: "un",
    preco: 160,
    precoMin: 120,
    precoMax: 170,
    tempo: "45–90 min",
    descricao: "PDF: instalação de IDR (máx. alinhado)."
  },
  {
    id: "srv-16",
    nome: "Montagem de quadro (até 12 circuitos)",
    categoria: "Quadro",
    tipo: "residencial",
    unidade: "un",
    preco: 550,
    precoMin: 350,
    precoMax: 900,
    tempo: "3–5 h",
    descricao: "Mantido — já abaixo do PDF QDC 12 c/ DR+DPS (R$925)."
  },
  {
    id: "srv-17",
    nome: "Troca completa de quadro elétrico",
    categoria: "Quadro",
    tipo: "residencial",
    unidade: "un",
    preco: 925,
    precoMin: 600,
    precoMax: 1000,
    tempo: "1 dia",
    descricao: "Médio/máx. alinhados ao PDF QDC 12 circuitos + DR + DPS."
  },
  {
    id: "srv-18",
    nome: "Aterramento (haste + conexão)",
    categoria: "Segurança",
    tipo: "residencial",
    unidade: "un",
    preco: 280,
    precoMin: 180,
    precoMax: 500,
    tempo: "2–4 h",
    descricao: "Máximo alinhado ao PDF haste de aterramento."
  },
  {
    id: "srv-19",
    nome: "Passagem de fiação (por ponto)",
    categoria: "Fiação",
    tipo: "residencial",
    unidade: "ponto",
    preco: 180,
    precoMin: 120,
    precoMax: 320,
    tempo: "1–3 h",
    descricao: "Sem linha equivalente no PDF — mantido."
  },
  {
    id: "srv-20",
    nome: "Visita técnica / diagnóstico",
    categoria: "Manutenção",
    tipo: "residencial",
    unidade: "visita",
    preco: 120,
    precoMin: 80,
    precoMax: 250,
    tempo: "1 h",
    descricao: "Sem equivalente no PDF — mantido."
  },
  {
    id: "srv-21",
    nome: "Diária de eletricista",
    categoria: "Mão de obra",
    tipo: "residencial",
    unidade: "dia",
    preco: 320,
    precoMin: 250,
    precoMax: 450,
    tempo: "8 h",
    descricao: "Sem equivalente no PDF — mantido."
  },
  {
    id: "srv-22",
    nome: "Ponto elétrico comercial",
    categoria: "Comercial",
    tipo: "comercial",
    unidade: "ponto",
    preco: 58,
    precoMin: 45,
    precoMax: 70,
    tempo: "variável",
    descricao: "Alinhado ao PDF tomada simples (mão de obra)."
  },
  {
    id: "srv-23",
    nome: "Montagem de quadro comercial",
    categoria: "Comercial",
    tipo: "comercial",
    unidade: "un",
    preco: 1400,
    precoMin: 800,
    precoMax: 3000,
    tempo: "1–2 dias",
    descricao: "Máximo alinhado ao PDF QDC 24 circuitos."
  },
  {
    id: "srv-24",
    nome: "Laudo / vistoria elétrica",
    categoria: "Laudos",
    tipo: "comercial",
    unidade: "un",
    preco: 450,
    precoMin: 300,
    precoMax: 900,
    tempo: "2–4 h",
    descricao: "Sem equivalente no PDF — mantido."
  },
  {
    id: "srv-25",
    nome: "Manutenção preventiva mensal",
    categoria: "Manutenção",
    tipo: "comercial",
    unidade: "mês",
    preco: 280,
    precoMin: 200,
    precoMax: 500,
    tempo: "mensal",
    descricao: "Sem equivalente no PDF — mantido."
  },
  {
    id: "srv-26",
    nome: "Instalação de DPS (por módulo)",
    categoria: "Segurança",
    tipo: "residencial",
    unidade: "un",
    preco: 130,
    precoMin: 100,
    precoMax: 140,
    tempo: "40–60 min",
    descricao: "PDF: instalação de DPS."
  },
  {
    id: "srv-27",
    nome: "Passagem de cabo (por metro)",
    categoria: "Fiação",
    tipo: "residencial",
    unidade: "m",
    preco: 18,
    precoMin: 10,
    precoMax: 35,
    tempo: "variável",
    descricao: "Sem linha por metro no PDF — mantido."
  },
  {
    id: "srv-28",
    nome: "Instalação de chuveiro luxo / eletrônico",
    categoria: "Instalações",
    tipo: "residencial",
    unidade: "un",
    preco: 170,
    precoMin: 160,
    precoMax: 180,
    tempo: "1–2 h",
    descricao: "PDF: chuveiro luxo (eletrônico, pressurizado ou ducha)."
  },
  {
    id: "srv-29",
    nome: "Interruptor paralelo (three-way)",
    categoria: "Interruptores",
    tipo: "residencial",
    unidade: "ponto",
    preco: 80,
    precoMin: 70,
    precoMax: 90,
    tempo: "30–50 min",
    descricao: "PDF: interruptor tree-way ou four-way."
  }
];

const SEED_PRODUTOS = [
  {
    id: "prd-1",
    nome: "Tomada 2P+T 10A (módulo)",
    categoria: "Tomadas",
    unidade: "un",
    preco: 11.9,
    precoMin: 7.9,
    precoMax: 22,
    marca: "Fame / Tramontina",
    descricao: "Módulo padrão BR 10A — linha popular.",
    icon: "tomada",
    cor: "#3aa3ff"
  },
  {
    id: "prd-2",
    nome: "Tomada 2P+T 20A (módulo)",
    categoria: "Tomadas",
    unidade: "un",
    preco: 19.9,
    precoMin: 14.9,
    precoMax: 35,
    marca: "Fame / Schneider",
    descricao: "Módulo 20A para cargas maiores.",
    icon: "tomada",
    cor: "#2f9bff"
  },
  {
    id: "prd-3",
    nome: "Interruptor simples (módulo)",
    categoria: "Interruptores",
    unidade: "un",
    preco: 8.9,
    precoMin: 5.9,
    precoMax: 18,
    marca: "Fame / Tramontina",
    descricao: "Tecla simples 10A.",
    icon: "interruptor",
    cor: "#7eb6ff"
  },
  {
    id: "prd-4",
    nome: "Interruptor paralelo",
    categoria: "Interruptores",
    unidade: "un",
    preco: 16.9,
    precoMin: 11.9,
    precoMax: 28,
    marca: "Fame / Schneider",
    descricao: "Three-way para dois pontos.",
    icon: "interruptor",
    cor: "#5aa3f0"
  },
  {
    id: "prd-5",
    nome: "Placa 4x2 + suporte",
    categoria: "Interruptores",
    unidade: "un",
    preco: 7.5,
    precoMin: 4.5,
    precoMax: 18,
    marca: "Linha popular",
    descricao: "Espelho + suporte para módulos.",
    icon: "placa",
    cor: "#9bb4d0"
  },
  {
    id: "prd-6",
    nome: "Disjuntor monopolar 10–20A",
    categoria: "Proteção",
    unidade: "un",
    preco: 14.9,
    precoMin: 9,
    precoMax: 28,
    marca: "Steck / Tramontina",
    descricao: "DIN curva C — preço de entrada no varejo.",
    icon: "disjuntor",
    cor: "#ff8a4c"
  },
  {
    id: "prd-7",
    nome: "Disjuntor bipolar 20–40A",
    categoria: "Proteção",
    unidade: "un",
    preco: 34.9,
    precoMin: 22,
    precoMax: 65,
    marca: "Steck / Schneider",
    descricao: "Bipolar para circuitos 220V.",
    icon: "disjuntor",
    cor: "#ff7043"
  },
  {
    id: "prd-8",
    nome: "Disjuntor DR / IDR 40A 30mA",
    categoria: "Proteção",
    unidade: "un",
    preco: 69.9,
    precoMin: 45,
    precoMax: 120,
    marca: "Tramontina / Steck",
    descricao: "Diferencial residual bipolar.",
    icon: "disjuntor",
    cor: "#ff5d6c"
  },
  {
    id: "prd-9",
    nome: "DPS classe II (módulo)",
    categoria: "Proteção",
    unidade: "un",
    preco: 89.9,
    precoMin: 55,
    precoMax: 180,
    marca: "Clamper / Steck",
    descricao: "Proteção contra surtos — 1 módulo.",
    icon: "dps",
    cor: "#f5b942"
  },
  {
    id: "prd-10",
    nome: "Cabo flexível 2,5mm² (rolo 100m)",
    categoria: "Cabos",
    unidade: "rolo",
    preco: 229.9,
    precoMin: 189,
    precoMax: 290,
    marca: "Megatron / SIL",
    descricao: "Ref. Leroy Merlin Megatron ~R$230 (abr/2026).",
    icon: "cabo",
    cor: "#1ee0a0"
  },
  {
    id: "prd-11",
    nome: "Cabo flexível 4,0mm² (rolo 100m)",
    categoria: "Cabos",
    unidade: "rolo",
    preco: 349,
    precoMin: 290,
    precoMax: 420,
    marca: "Megatron / SIL",
    descricao: "Para chuveiro médio / ar-condicionado.",
    icon: "cabo",
    cor: "#18c98f"
  },
  {
    id: "prd-12",
    nome: "Cabo flexível 6,0mm² (rolo 100m)",
    categoria: "Cabos",
    unidade: "rolo",
    preco: 519,
    precoMin: 430,
    precoMax: 620,
    marca: "SIL / Cobrecom",
    descricao: "Chuveiros de alta potência / circuitos especiais.",
    icon: "cabo",
    cor: "#12b07c"
  },
  {
    id: "prd-13",
    nome: "Cabo flexível 1,5mm² (rolo 100m)",
    categoria: "Cabos",
    unidade: "rolo",
    preco: 129.9,
    precoMin: 100,
    precoMax: 170,
    marca: "Megatron",
    descricao: "Iluminação — ref. varejo ~R$125.",
    icon: "cabo",
    cor: "#3dd9a8"
  },
  {
    id: "prd-14",
    nome: "Eletroduto PVC 3/4\" (barra 3m)",
    categoria: "Eletrodutos",
    unidade: "barra",
    preco: 11.9,
    precoMin: 7.5,
    precoMax: 18,
    marca: "Tigre / Amanco",
    descricao: "Rígido soldável 3/4\".",
    icon: "eletroduto",
    cor: "#8b9cb3"
  },
  {
    id: "prd-15",
    nome: "Caixa 4x2 embutir",
    categoria: "Caixas",
    unidade: "un",
    preco: 2.9,
    precoMin: 1.8,
    precoMax: 5.5,
    marca: "Tigre",
    descricao: "Caixa plástica para alvenaria.",
    icon: "caixa",
    cor: "#a8b8c8"
  },
  {
    id: "prd-16",
    nome: "Quadro distribuição 12 disjuntores",
    categoria: "Quadros",
    unidade: "un",
    preco: 119,
    precoMin: 79,
    precoMax: 220,
    marca: "Tigre / Fame",
    descricao: "Embutir com barramento — só a caixa.",
    icon: "quadro",
    cor: "#2f9bff"
  },
  {
    id: "prd-17",
    nome: "Quadro distribuição 24 disjuntores",
    categoria: "Quadros",
    unidade: "un",
    preco: 219,
    precoMin: 150,
    precoMax: 380,
    marca: "Tigre / Schneider",
    descricao: "Para casas maiores / comércio.",
    icon: "quadro",
    cor: "#1d7de8"
  },
  {
    id: "prd-18",
    nome: "Lâmpada LED bulbo 9W",
    categoria: "Iluminação",
    unidade: "un",
    preco: 7.9,
    precoMin: 4.9,
    precoMax: 15,
    marca: "Ourolux / Empalux",
    descricao: "Equivalente ~60W — preço e-commerce.",
    icon: "lampada",
    cor: "#f5e06a"
  },
  {
    id: "prd-19",
    nome: "Plafon LED 18W sobrepor",
    categoria: "Iluminação",
    unidade: "un",
    preco: 39.9,
    precoMin: 28,
    precoMax: 79,
    marca: "Linha popular",
    descricao: "Sobrepor redondo/quadrado.",
    icon: "lampada",
    cor: "#ffe082"
  },
  {
    id: "prd-20",
    nome: "Spot LED embutido 5W",
    categoria: "Iluminação",
    unidade: "un",
    preco: 14.9,
    precoMin: 9.9,
    precoMax: 29,
    marca: "Linha popular",
    descricao: "Dicróica LED para forro.",
    icon: "lampada",
    cor: "#ffecb3"
  },
  {
    id: "prd-21",
    nome: "Haste aterramento 5/8\" x 2,4m",
    categoria: "Aterramento",
    unidade: "un",
    preco: 59.9,
    precoMin: 42,
    precoMax: 95,
    marca: "Copperweld",
    descricao: "Haste cobreada — material só.",
    icon: "aterramento",
    cor: "#c0a060"
  },
  {
    id: "prd-22",
    nome: "Fita isolante 19mm",
    categoria: "Consumíveis",
    unidade: "un",
    preco: 4.9,
    precoMin: 2.9,
    precoMax: 9,
    marca: "3M / Adelbras",
    descricao: "Rolo profissional.",
    icon: "consumivel",
    cor: "#5f6b7c"
  },
  {
    id: "prd-23",
    nome: "Conector Wago (pct c/ 50)",
    categoria: "Consumíveis",
    unidade: "pct",
    preco: 42,
    precoMin: 32,
    precoMax: 65,
    marca: "Wago / similar",
    descricao: "Emendas rápidas — pacote.",
    icon: "consumivel",
    cor: "#ff9800"
  },
  {
    id: "prd-24",
    nome: "Conjunto tomada + placa 10A",
    categoria: "Tomadas",
    unidade: "un",
    preco: 24.9,
    precoMin: 18,
    precoMax: 45,
    marca: "Schneider Miluz / Orion",
    descricao: "Conjunto completo pronto — ref. ~R$24–37.",
    icon: "tomada",
    cor: "#4fc3f7"
  }
];

const SEED_EMPRESA = {
  nome: "VoltES Elétrica",
  cnpj: "",
  telefone: "(27) 99999-0000",
  email: "contato@voltes.com.br",
  endereco: "Vitória — ES",
  cidade: "Vitória",
  estado: "ES",
  logo: ""
};

const PAGE_META = {
  dashboard: { title: "Dashboard", subtitle: "Visão geral do seu negócio elétrico" },
  clientes: { title: "Clientes", subtitle: "Cadastre e gerencie seus clientes" },
  orcamentos: { title: "Orçamentos", subtitle: "Monte propostas profissionais em minutos" },
  servicos: { title: "Serviços", subtitle: "Mão de obra média no Espírito Santo (2026)" },
  produtos: { title: "Materiais", subtitle: "Preços médios de varejo / internet" },
  financeiro: { title: "Financeiro", subtitle: "Lançamentos, deslocamento, alimentação e extras por serviço" },
  calculadoras: { title: "Calculadoras", subtitle: "Cálculos rápidos para o dia a dia" },
  contratos: { title: "Contratos", subtitle: "Manutenção e contratos recorrentes" },
  empresa: { title: "Empresa", subtitle: "Dados que aparecem nos PDFs" }
};

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function faixaPreco(item) {
  if (item.precoMin != null && item.precoMax != null) {
    return `${money(item.precoMin)} – ${money(item.precoMax)}`;
  }
  return money(item.preco);
}

const PRECO_MODOS = [
  { id: "minimo", label: "Mínimo", short: "Mín" },
  { id: "medio", label: "Médio", short: "Méd" },
  { id: "maximo", label: "Máximo", short: "Máx" }
];

function getPrecoByModo(item, modo = "medio") {
  const min = Number(item.precoMin ?? item.preco ?? 0);
  const med = Number(item.preco ?? min);
  const max = Number(item.precoMax ?? item.preco ?? med);
  if (modo === "minimo") return min;
  if (modo === "maximo") return max;
  return med;
}

function precoModoLabel(modo) {
  return PRECO_MODOS.find((m) => m.id === modo)?.label || "Médio";
}

/** Despesas globais — valem para QUALQUER serviço */
function despesasGlobaisAtivas(state) {
  return (state?.despesasGlobais || []).filter((d) => d && d.ativo !== false && !d._deleted);
}

/** Específicas de um serviço + globais (deslocamento, alimentação…) */
function despesasDoServico(servicoId, state) {
  const especificas = servicoId
    ? (state?.despesasServico || []).filter((d) => d.servicoId === servicoId && !d._deleted)
    : [];
  const globais = despesasGlobaisAtivas(state).map((d) => ({
    ...d,
    global: true
  }));
  return [...globais, ...especificas];
}

function custoOcultoServico(servicoId, state) {
  return despesasDoServico(servicoId, state).reduce((t, d) => t + Number(d.valor || 0), 0);
}

function custoOcultoGlobal(state) {
  return despesasGlobaisAtivas(state).reduce((t, d) => t + Number(d.valor || 0), 0);
}

/** Preço base (mão de obra) + despesas embutidas = valor cobrado do cliente */
function precoClienteServico(servico, modo, state) {
  return getPrecoByModo(servico, modo) + custoOcultoServico(servico?.id, state);
}

/** Globais padrão: deslocamento e alimentação (qualquer serviço) */
const SEED_DESPESAS_GLOBAIS = [
  {
    id: "dg-deslocamento",
    nome: "Deslocamento",
    valor: 35,
    ativo: true,
    escopo: "todos"
  },
  {
    id: "dg-alimentacao",
    nome: "Alimentação",
    valor: 25,
    ativo: true,
    escopo: "todos"
  }
];

/** Seed de despesas extras por serviço (além das globais) */
const SEED_DESPESAS_SERVICO = [
  { id: "ds-1", servicoId: "srv-1", nome: "Consumíveis", valor: 4 },
  { id: "ds-3", servicoId: "srv-2", nome: "Consumíveis", valor: 5 },
  { id: "ds-5", servicoId: "srv-4", nome: "Consumíveis", valor: 3 },
  { id: "ds-7", servicoId: "srv-13", nome: "EPI / desgaste", valor: 15 }
];
