/** Shell da aplicação VoltES. */
// @ts-nocheck
import Chart from "chart.js/auto";
import { createIcons, icons } from "lucide";
import { Store } from "../store/store";
import { PDF } from "../pdf/pdf";
import { NBR5410 } from "../domain/nbr5410";
import { PreProjeto } from "../domain/preprojeto";
import { ProjetoEletrico } from "./projeto-eletrico/editor";
import { sugerirServicosProjeto } from "../domain/projeto/circuits";
import {
  money,
  formatDate,
  todayISO,
  uid,
  getPrecoByModo,
  precoModoLabel,
  PRECO_MODOS,
  PAGE_META,
  getEmissoresNf,
  getEmissorNf,
  orcamentoBase,
  orcamentoNfPercent,
  orcamentoNfValor,
  orcamentoTotalComNf,
  orcamentoTotalPdf,
  orcamentoTotalMateriais,
  despesasDoServico,
  custoOcultoServico,
  custoOcultoGlobal,
  sanitizarItemOculto,
  despesasObraDoOrcamento,
  precoClienteServico,
  faixaPreco
} from "../data/catalog";
import { APP_VERSION, CACHE_VERSION } from "../version";
import { getTheme, cycleTheme } from "./themes";

// Chart / lucide para código legado
(window as any).Chart = Chart;
(window as any).lucide = { createIcons: () => createIcons({ icons }) };

export function initApp() {

  const content = document.getElementById("content");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalFooter = document.getElementById("modalFooter");
  const toastStack = document.getElementById("toastStack");
  const sidebar = document.getElementById("sidebar");

  let currentView = "dashboard";
  let chartInstance = null;
  let chartPeriod = 7;
  let searchQuery = "";
  let produtoCategoria = "Todas";
  let servicoFiltro = "todos";
  let calcTab = "ambientes";
  let lastDimensionamento = null;
  let lastPreProjeto = null;
  let preProjetoState = {
    uso: "residencial",
    comodos: []
  };
  let peEditingId = null;
  let peOpening = false;

  const icons = {
    tomada: (c = "#3db4ff") => `<svg viewBox="0 0 80 80" fill="none"><rect x="18" y="10" width="44" height="60" rx="10" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><circle cx="32" cy="34" r="5" fill="${c}"/><circle cx="48" cy="34" r="5" fill="${c}"/><path d="M40 46v14" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M34 60h12" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
    interruptor: (c = "#7eb6ff") => `<svg viewBox="0 0 80 80" fill="none"><rect x="26" y="8" width="28" height="64" rx="8" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><rect x="33" y="26" width="14" height="28" rx="4" fill="${c}"/></svg>`,
    placa: (c = "#9bb4d0") => `<svg viewBox="0 0 80 80" fill="none"><rect x="14" y="18" width="52" height="44" rx="8" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><rect x="28" y="30" width="10" height="20" rx="2" fill="${c}"/><rect x="42" y="30" width="10" height="20" rx="2" fill="${c}" opacity=".55"/></svg>`,
    disjuntor: (c = "#ff8a4c") => `<svg viewBox="0 0 80 80" fill="none"><rect x="20" y="12" width="40" height="56" rx="6" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><path d="M30 26h20M30 38h20M30 50h14" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="54" cy="26" r="3" fill="${c}"/></svg>`,
    dps: (c = "#f5b942") => `<svg viewBox="0 0 80 80" fill="none"><rect x="22" y="14" width="36" height="52" rx="6" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><path d="M40 24l-8 16h8l-4 16 14-22h-8l6-10z" fill="${c}"/></svg>`,
    cabo: (c = "#2ef0b0") => `<svg viewBox="0 0 80 80" fill="none"><path d="M12 48c10-22 20-22 28 0s18 22 28 0" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M12 34c10-22 20-22 28 0s18 22 28 0" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity=".45"/></svg>`,
    eletroduto: (c = "#8b9cb3") => `<svg viewBox="0 0 80 80" fill="none"><rect x="8" y="32" width="64" height="16" rx="8" fill="${c}" opacity=".2" stroke="${c}" stroke-width="2.5"/><circle cx="18" cy="40" r="4" fill="${c}"/><circle cx="62" cy="40" r="4" fill="${c}"/></svg>`,
    caixa: (c = "#a8b8c8") => `<svg viewBox="0 0 80 80" fill="none"><rect x="16" y="18" width="48" height="44" rx="6" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><path d="M28 34h24M28 44h16" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
    quadro: (c = "#3db4ff") => `<svg viewBox="0 0 80 80" fill="none"><rect x="14" y="10" width="52" height="60" rx="6" fill="${c}" opacity=".12" stroke="${c}" stroke-width="2.5"/><rect x="22" y="20" width="10" height="10" rx="2" fill="${c}"/><rect x="35" y="20" width="10" height="10" rx="2" fill="${c}"/><rect x="48" y="20" width="10" height="10" rx="2" fill="${c}"/><path d="M22 40h36M22 50h36" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    lampada: (c = "#f5e06a") => `<svg viewBox="0 0 80 80" fill="none"><path d="M40 10a18 18 0 0 1 10 33v8H30v-8A18 18 0 0 1 40 10z" fill="${c}" opacity=".2" stroke="${c}" stroke-width="2.5"/><path d="M32 58h16M34 66h12" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="28" r="6" fill="${c}" opacity=".7"/></svg>`,
    aterramento: (c = "#c0a060") => `<svg viewBox="0 0 80 80" fill="none"><path d="M40 12v40M24 52h32M28 60h24M32 68h16" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/><circle cx="40" cy="18" r="5" fill="${c}"/></svg>`,
    consumivel: (c = "#ff9800") => `<svg viewBox="0 0 80 80" fill="none"><rect x="18" y="20" width="44" height="40" rx="8" fill="${c}" opacity=".15" stroke="${c}" stroke-width="2.5"/><path d="M28 36h24M28 46h16" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`
  };

  function produtoMedia(produto) {
    const fn = icons[produto.icon] || icons.consumivel;
    return `<div class="art">${fn(produto.cor || "#3db4ff")}</div>`;
  }

  function getPrecoModo() {
    return getState().precoModo || "medio";
  }

  function setPrecoModo(modo) {
    if (!["minimo", "medio", "maximo"].includes(modo)) return;
    Store.update({ precoModo: modo });
    syncPrecoModoUI();
    toast(`Preço ativo: ${precoModoLabel(modo)}`);
    render();
  }

  function syncPrecoModoUI() {
    const modo = getPrecoModo();
    document.querySelectorAll("#precoModoSeg button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.modo === modo);
    });
  }

  function tierPicksHtml(item, selectedModo, attrs = "") {
    const modo = selectedModo || getPrecoModo();
    return `
      <div class="tier-picks" ${attrs}>
        ${PRECO_MODOS.map((m) => `
          <button type="button" class="tier-pick ${modo === m.id ? "active" : ""}" data-tier="${m.id}">
            <span class="tier-name">${m.short}</span>
            <span class="tier-val">${money(getPrecoByModo(item, m.id))}</span>
          </button>
        `).join("")}
      </div>`;
  }

  function priceRangeHtml(item) {
    const modo = getPrecoModo();
    const ativo = getPrecoByModo(item, modo);
    return `
      <div class="price-range">
        <div class="main">${money(ativo)} <span style="font-size:.7rem;color:var(--text-dim);font-family:var(--font);font-weight:500">${precoModoLabel(modo)}</span></div>
        ${tierPicksHtml(item, modo)}
      </div>`;
  }

  function refreshIcons() {
    if (window.lucide) lucide.createIcons();
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function openModal(title, bodyHtml, footerHtml, wide = false) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = footerHtml || "";
    modal.classList.toggle("wide", !!wide);
    modalBackdrop.hidden = false;
    refreshIcons();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    modalBody.innerHTML = "";
    modalFooter.innerHTML = "";
  }

  function getState() {
    return Store.get();
  }

  /** Total exibido na lista = o mesmo valor do PDF (respeita materiais no total). */
  function orcamentoTotal(orc) {
    return orcamentoTotalPdf(orc, getState());
  }

  function nfLabel(nf) {
    if (nf === "sim") return "Com NF";
    if (nf === "nao") return "Sem NF";
    return "A definir";
  }

  function syncNfEmissorUI() {
    const sel = document.getElementById("oNotaFiscal");
    const wrap = document.getElementById("oNfEmissorWrap");
    if (!sel || !wrap) return;
    wrap.hidden = sel.value !== "sim";
  }

  function nextCodigo(prefix, list) {
    const n = list.length + 1;
    return `${prefix}-${String(n).padStart(3, "0")}`;
  }

  // ─── VIEWS ───────────────────────────────────────────────

  function renderDashboard() {
    const s = getState();
    const agora = new Date();
    const corte = new Date(agora);
    corte.setDate(corte.getDate() - chartPeriod);

    const noPeriodo = s.orcamentos.filter((o) => new Date(o.data) >= corte);
    const aprovados = noPeriodo.filter((o) => o.status === "aprovado");
    const pendentes = noPeriodo.filter((o) => o.status === "pendente");
    const rejeitados = noPeriodo.filter((o) => o.status === "rejeitado");
    const soma = (arr) => arr.reduce((t, o) => t + orcamentoTotal(o), 0);

    content.innerHTML = `
      <div class="view-enter">
      <div class="hero-note">
        <div>
          <h3>Pronto para orçar no ES</h3>
          <p>Serviços e materiais com preços médios reais do Espírito Santo (mercado 2026 + SINAPI). Monte o PDF e envie ao cliente.</p>
          <div class="source-pill">Fonte: Vitória/ES · varejo online · SINAPI ×1,01</div>
        </div>
        <button class="btn btn-primary" id="dashNovoOrc">Novo orçamento</button>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div>
            <h3>Evolução dos orçamentos</h3>
            <p>Acompanhamento por status no período selecionado</p>
          </div>
          <div class="segmented" id="periodSeg">
            <button data-p="7" class="${chartPeriod === 7 ? "active" : ""}">7 dias</button>
            <button data-p="14" class="${chartPeriod === 14 ? "active" : ""}">14 dias</button>
            <button data-p="30" class="${chartPeriod === 30 ? "active" : ""}">30 dias</button>
          </div>
        </div>
        <div class="grid grid-3" style="margin-bottom:16px">
          <div class="stat-card card success"><div class="stat-label">Aprovados</div><div class="stat-value">${money(soma(aprovados))}</div></div>
          <div class="stat-card card warn"><div class="stat-label">Pendentes</div><div class="stat-value">${money(soma(pendentes))}</div></div>
          <div class="stat-card card danger"><div class="stat-label">Rejeitados</div><div class="stat-value">${money(soma(rejeitados))}</div></div>
        </div>
        <div class="chart-wrap"><canvas id="dashChart"></canvas></div>
      </div>

      <div class="grid grid-5">
        <div class="card stat-card accent"><div class="stat-label">Clientes</div><div class="stat-value">${s.clientes.length}</div></div>
        <div class="card stat-card"><div class="stat-label">Orçamentos</div><div class="stat-value">${s.orcamentos.length}</div></div>
        <div class="card stat-card"><div class="stat-label">Serviços</div><div class="stat-value">${s.servicos.length}</div></div>
        <div class="card stat-card"><div class="stat-label">Contratos</div><div class="stat-value">${s.contratos.length}</div></div>
        <div class="card stat-card"><div class="stat-label">Materiais</div><div class="stat-value">${s.produtos.length}</div></div>
      </div>
      </div>
    `;

    document.getElementById("dashNovoOrc").onclick = () => openOrcamentoForm();
    document.getElementById("periodSeg").onclick = (e) => {
      const btn = e.target.closest("button[data-p]");
      if (!btn) return;
      chartPeriod = Number(btn.dataset.p);
      render();
    };

    drawChart(noPeriodo);
  }

  function drawChart(orcamentos) {
    const canvas = document.getElementById("dashChart");
    if (!canvas || !window.Chart) return;
    if (chartInstance) chartInstance.destroy();

    const labels = [];
    const aprov = [];
    const pend = [];
    const rej = [];
    for (let i = chartPeriod - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
      const doDia = orcamentos.filter((o) => o.data === iso);
      aprov.push(doDia.filter((o) => o.status === "aprovado").reduce((t, o) => t + orcamentoTotal(o), 0));
      pend.push(doDia.filter((o) => o.status === "pendente").reduce((t, o) => t + orcamentoTotal(o), 0));
      rej.push(doDia.filter((o) => o.status === "rejeitado").reduce((t, o) => t + orcamentoTotal(o), 0));
    }

    chartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Aprovados", data: aprov, borderColor: "#1ee0a0", backgroundColor: "rgba(30,224,160,.12)", tension: 0.35, fill: true },
          { label: "Pendentes", data: pend, borderColor: "#f5b942", backgroundColor: "transparent", tension: 0.35 },
          { label: "Rejeitados", data: rej, borderColor: "#ff5d6c", backgroundColor: "transparent", tension: 0.35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#8b97a8" } } },
        scales: {
          x: { ticks: { color: "#5f6b7c" }, grid: { color: "rgba(255,255,255,.04)" } },
          y: { ticks: { color: "#5f6b7c" }, grid: { color: "rgba(255,255,255,.04)" } }
        }
      }
    });
  }

  function renderClientes() {
    const s = getState();
    const q = searchQuery.toLowerCase();
    const list = s.clientes.filter((c) =>
      !q || c.nome.toLowerCase().includes(q) || (c.telefone || "").includes(q) || (c.documento || "").includes(q)
    );
    const ativos = s.clientes.filter((c) => c.status === "ativo").length;
    const mes = todayISO().slice(0, 7);
    const novos = s.clientes.filter((c) => (c.criadoEm || "").startsWith(mes)).length;

    content.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat-card"><div class="stat-label">Total</div><div class="stat-value">${s.clientes.length}</div></div>
        <div class="card stat-card success"><div class="stat-label">Ativos</div><div class="stat-value">${ativos}</div></div>
        <div class="card stat-card"><div class="stat-label">Inativos</div><div class="stat-value">${s.clientes.length - ativos}</div></div>
        <div class="card stat-card accent"><div class="stat-label">Novos no mês</div><div class="stat-value">${novos}</div></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="btnNovoCliente">+ Novo cliente</button>
        <div class="spacer"></div>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Tipo</th><th>Documento</th><th>Telefone</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.length ? list.map((c) => `
                <tr>
                  <td><strong>${c.nome}</strong><div style="color:var(--text-dim);font-size:.8rem">${c.email || ""}</div></td>
                  <td>${c.tipo === "pj" ? "PJ" : "PF"}</td>
                  <td>${c.documento || "—"}</td>
                  <td>${c.telefone || "—"}</td>
                  <td><span class="badge badge-${c.status}">${c.status}</span></td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" data-edit="${c.id}">Editar</button>
                    <button class="btn btn-sm btn-danger" data-del="${c.id}">Excluir</button>
                  </td>
                </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><strong>Nenhum cliente</strong>Cadastre o primeiro cliente para começar.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("btnNovoCliente").onclick = () => openClienteForm();
    content.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openClienteForm(s.clientes.find((c) => c.id === btn.dataset.edit));
    });
    content.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        if (!confirm("Excluir este cliente?")) return;
        Store.update({ clientes: getState().clientes.filter((c) => c.id !== btn.dataset.del) });
        toast("Cliente removido");
        render();
      };
    });
  }

  function openClienteForm(cliente = null) {
    const c = cliente || { tipo: "pf", status: "ativo" };
    openModal(cliente ? "Editar cliente" : "Novo cliente", `
      <div class="form-grid">
        <div class="field"><label>Tipo</label>
          <select id="cTipo"><option value="pf" ${c.tipo === "pf" ? "selected" : ""}>Pessoa física</option><option value="pj" ${c.tipo === "pj" ? "selected" : ""}>Pessoa jurídica</option></select>
        </div>
        <div class="field"><label>Status</label>
          <select id="cStatus"><option value="ativo" ${c.status === "ativo" ? "selected" : ""}>Ativo</option><option value="inativo" ${c.status === "inativo" ? "selected" : ""}>Inativo</option></select>
        </div>
        <div class="field full"><label>Nome</label><input id="cNome" value="${c.nome || ""}" required /></div>
        <div class="field"><label>CPF/CNPJ</label><input id="cDoc" value="${c.documento || ""}" /></div>
        <div class="field"><label>Telefone</label><input id="cTel" value="${c.telefone || ""}" /></div>
        <div class="field"><label>E-mail</label><input id="cEmail" type="email" value="${c.email || ""}" /></div>
        <div class="field full"><label>Endereço</label><input id="cEnd" value="${c.endereco || ""}" /></div>
      </div>
    `, `
      <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
      <button class="btn btn-primary" id="saveCliente">Salvar</button>
    `);

    document.getElementById("cancelModal").onclick = closeModal;
    document.getElementById("saveCliente").onclick = () => {
      const nome = document.getElementById("cNome").value.trim();
      if (!nome) return toast("Informe o nome");
      const data = {
        id: c.id || uid("cli"),
        tipo: document.getElementById("cTipo").value,
        status: document.getElementById("cStatus").value,
        nome,
        documento: document.getElementById("cDoc").value.trim(),
        telefone: document.getElementById("cTel").value.trim(),
        email: document.getElementById("cEmail").value.trim(),
        endereco: document.getElementById("cEnd").value.trim(),
        criadoEm: c.criadoEm || todayISO()
      };
      const list = [...getState().clientes];
      const idx = list.findIndex((x) => x.id === data.id);
      if (idx >= 0) list[idx] = data; else list.push(data);
      Store.update({ clientes: list });
      closeModal();
      toast("Cliente salvo");
      render();
    };
  }

  function renderOrcamentos() {
    const s = getState();
    const q = searchQuery.toLowerCase();
    const list = [...s.orcamentos]
      .sort((a, b) => b.data.localeCompare(a.data))
      .filter((o) => !q || o.titulo.toLowerCase().includes(q) || o.codigo.toLowerCase().includes(q));

    content.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-primary" id="btnNovoOrc">+ Novo orçamento</button>
        <div class="spacer"></div>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Título</th><th>Cliente</th><th>Data</th><th>Total</th><th>NF</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.length ? list.map((o) => {
                const cli = s.clientes.find((c) => c.id === o.clienteId);
                const nf = o.notaFiscal || "a_definir";
                const nfBadge = nf === "sim" ? "aprovado" : nf === "nao" ? "rejeitado" : "pendente";
                const emNome =
                  nf === "sim"
                    ? o.nfEmissorNome || getEmissorNf(o.nfEmissorId, s)?.nome || ""
                    : "";
                const totalPdf = orcamentoTotal(o);
                const matFora = o.incluirMateriaisNoPdf === false;
                const matValor = matFora ? orcamentoTotalMateriais(o, s) : 0;
                return `<tr>
                  <td>${o.codigo}</td>
                  <td><strong>${o.titulo}</strong></td>
                  <td>${cli?.nome || "—"}</td>
                  <td>${formatDate(o.data)}</td>
                  <td>
                    <strong>${money(totalPdf)}</strong>
                    ${matFora && matValor > 0 ? `<div style="font-size:.72rem;color:var(--text-dim);margin-top:2px">PDF · só mão de obra<br/>materiais ${money(matValor)} (ref.)</div>` : ""}
                  </td>
                  <td><span class="badge badge-${nfBadge}" title="${emNome || "Nota fiscal"}">${nfLabel(nf)}${emNome ? ` · ${emNome}` : ""}</span></td>
                  <td><span class="badge badge-${o.status}">${o.status}</span></td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" data-pdf="${o.id}">PDF</button>
                    <button class="btn btn-sm btn-secondary" data-edit="${o.id}">Editar</button>
                    <select class="status-select" data-status="${o.id}" style="background:var(--bg-soft);border:1px solid var(--border);border-radius:8px;padding:6px 8px">
                      <option value="pendente" ${o.status === "pendente" ? "selected" : ""}>Pendente</option>
                      <option value="aprovado" ${o.status === "aprovado" ? "selected" : ""}>Aprovado</option>
                      <option value="rejeitado" ${o.status === "rejeitado" ? "selected" : ""}>Rejeitado</option>
                    </select>
                    <button class="btn btn-sm btn-danger" data-del="${o.id}">Excluir</button>
                  </td>
                </tr>`;
              }).join("") : `<tr><td colspan="8"><div class="empty"><strong>Nenhum orçamento</strong>Crie o primeiro orçamento profissional.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("btnNovoOrc").onclick = () => openOrcamentoForm();
    content.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openOrcamentoForm(s.orcamentos.find((o) => o.id === btn.dataset.edit));
    });
    content.querySelectorAll("[data-pdf]").forEach((btn) => {
      btn.onclick = async () => {
        const orc = s.orcamentos.find((o) => o.id === btn.dataset.pdf);
        if (!orc) return toast("Orçamento não encontrado");
        const cli = s.clientes.find((c) => c.id === orc.clienteId) || null;
        try {
          toast("Gerando PDF…");
          await PDF.preloadBrand();
          await PDF.orcamento(orc, cli, s.empresa);
          toast("PDF gerado");
        } catch (e) {
          toast(e.message || "Falha ao gerar PDF");
        }
      };
    });
    content.querySelectorAll("[data-status]").forEach((sel) => {
      sel.onchange = () => {
        const list = getState().orcamentos.map((o) =>
          o.id === sel.dataset.status ? { ...o, status: sel.value } : o
        );
        const orc = list.find((o) => o.id === sel.dataset.status);
        Store.update({ orcamentos: list });

        if (sel.value === "aprovado" && orc) {
          const lancamentos = [...getState().lancamentos];
          const exists = lancamentos.some((l) => l.origemId === orc.id);
          if (!exists) {
            lancamentos.push({
              id: uid("lan"),
              tipo: "entrada",
              descricao: `Orçamento ${orc.codigo} — ${orc.titulo}`,
              categoria: "Serviço",
              valor: orcamentoTotal(orc),
              data: todayISO(),
              origemId: orc.id
            });
            Store.update({ lancamentos });
          }
        }
        toast(`Status: ${sel.value}`);
        render();
      };
    });
    content.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        if (!confirm("Excluir orçamento?")) return;
        Store.update({ orcamentos: getState().orcamentos.filter((o) => o.id !== btn.dataset.del) });
        toast("Orçamento removido");
        render();
      };
    });
  }

  function openOrcamentoForm(orcamento = null) {
    const s = getState();
    let modoLocal = getPrecoModo();
    const o = orcamento || {
      clienteId: s.clientes[0]?.id || "",
      titulo: "",
      data: todayISO(),
      validade: 15,
      prazo: "7 dias",
      desconto: 0,
      observacoes: "",
      notaFiscal: "a_definir",
      nfEmissorId: "nf-propria",
      formasPagamento: ["pix"],
      formaPagamentoObs: "",
      garantiaMeses: 3,
      incluirMateriaisNoPdf: true,
      itens: []
    };
    let itens = (o.itens || []).map((i) => ({
      ...sanitizarItemOculto(i, s),
      precoModo: i.precoModo || modoLocal,
      precoMin: i.precoMin,
      precoMed: i.precoMed ?? i.preco,
      precoMax: i.precoMax
    }));

    const enrichFromCatalog = (ref) => {
      if (!ref) return null;
      return {
        precoMin: ref.precoMin ?? ref.preco,
        precoMed: ref.preco,
        precoMax: ref.precoMax ?? ref.preco,
        unidade: ref.unidade
      };
    };

    const renderItens = () => {
      const box = document.getElementById("itensBox");
      if (!box) return;
      itens = itens.map((i) => sanitizarItemOculto(i, getState()));
      const subItens = itens.reduce((t, i) => t + i.qtd * i.preco, 0);
      const ocultoItens = itens.reduce((t, i) => t + i.qtd * Number(i.custoOculto || 0), 0);
      const temServ = itens.some((i) => i.tipo === "servico");
      const obraGlobal = temServ ? custoOcultoGlobal(getState()) : 0;
      const ocultoTotal = ocultoItens + obraGlobal;
      const desconto = Number(document.getElementById("oDesc")?.value || o.desconto || 0);
      const base = Math.max(0, subItens + obraGlobal - desconto);
      const notaFiscal = document.getElementById("oNotaFiscal")?.value || o.notaFiscal || "a_definir";
      const emissorId =
        document.getElementById("oNfEmissor")?.value || o.nfEmissorId || "nf-propria";
      const draft = {
        itens,
        desconto,
        despesasObra: obraGlobal,
        notaFiscal,
        nfEmissorId: emissorId,
        nfAliquota:
          notaFiscal === "sim"
            ? Number(getEmissorNf(emissorId, getState())?.aliquota) || 0
            : 0
      };
      const nfPct = orcamentoNfPercent(draft, getState());
      const nfValor = orcamentoNfValor(draft, getState());
      const totalCliente = base + nfValor;
      const incluiMatPdf = document.getElementById("oIncluiMat")?.checked !== false;
      const subServ = itens
        .filter((i) => i.tipo === "servico")
        .reduce((t, i) => t + i.qtd * i.preco, 0);
      const basePdf = incluiMatPdf
        ? base
        : Math.max(0, subServ + (temServ ? obraGlobal : 0) - desconto);
      const nfPdf = incluiMatPdf ? nfValor : basePdf * (nfPct / 100);
      const totalPdf = basePdf + nfPdf;
      box.innerHTML = `
        <div class="line-items">
          ${itens.map((item, idx) => {
            const baseItem = Number(item.precoBase ?? (item.preco - (item.custoOculto || 0)));
            const fake = {
              precoMin: item.precoMin ?? baseItem,
              preco: item.precoMed ?? baseItem,
              precoMax: item.precoMax ?? baseItem
            };
            const oculto = Number(item.custoOculto || 0);
            return `
            <div class="line-item">
              <div class="line-item-top">
                <div class="line-item-info">
                  <strong>${item.nome}</strong>
                  <div class="meta"><span class="badge badge-${item.tipo === "servico" ? "servico" : "produto"}">${item.tipo}</span> · ${precoModoLabel(item.precoModo || modoLocal)} · ${item.unidade || "un"}${oculto > 0 ? ` · <span title="Extra do serviço — não aparece no PDF">embutido ${money(oculto)}/un</span>` : ""}</div>
                </div>
                <input class="line-item-qty" type="number" min="1" step="1" value="${item.qtd}" data-qtd="${idx}" aria-label="Quantidade" />
                <div class="line-item-total">${money(item.qtd * item.preco)}</div>
                <button class="icon-btn" data-rm="${idx}" title="Remover">✕</button>
              </div>
              ${tierPicksHtml(fake, item.precoModo || modoLocal, `data-item-tiers="${idx}"`)}
            </div>`;
          }).join("") || `<div class="empty"><strong>Sem itens</strong>Adicione serviços ou materiais.</div>`}
        </div>
        <div class="totals-box">
          <div class="row"><span>Subtotal itens</span><span>${money(subItens)}</span></div>
          ${
            obraGlobal > 0
              ? `<div class="row" style="color:var(--text-dim)"><span>Deslocamento/alimentação (1× obra)</span><span>${money(obraGlobal)}</span></div>`
              : ""
          }
          ${
            ocultoItens > 0
              ? `<div class="row" style="color:var(--text-dim)"><span>Extras por serviço (só você)</span><span>${money(ocultoItens)}</span></div>`
              : ""
          }
          <div class="row"><span>Desconto</span><span>${money(desconto)}</span></div>
          <div class="row"><span>Base (serviços/materiais)</span><span>${money(base)}</span></div>
          ${
            notaFiscal === "sim"
              ? `<div class="row" style="color:var(--warn)"><span>NF ${nfPct}% embutida — ${getEmissorNf(emissorId, getState())?.nome || "emissor"} (só você)</span><span>${money(nfValor)}</span></div>`
              : ""
          }
          <div class="row total"><span>Total no PDF (cliente)${!incluiMatPdf ? " · só mão de obra" : ""}</span><span>${money(totalPdf)}</span></div>
          ${
            !incluiMatPdf && totalCliente !== totalPdf
              ? `<div class="row" style="color:var(--text-dim)"><span>Materiais (lista no PDF, fora do total)</span><span>${money(totalCliente - totalPdf)}</span></div>`
              : ""
          }
        </div>
      `;
      box.querySelectorAll("[data-qtd]").forEach((inp) => {
        inp.onchange = () => {
          itens[Number(inp.dataset.qtd)].qtd = Math.max(1, Number(inp.value) || 1);
          renderItens();
        };
      });
      box.querySelectorAll("[data-rm]").forEach((btn) => {
        btn.onclick = () => {
          itens.splice(Number(btn.dataset.rm), 1);
          renderItens();
        };
      });
      box.querySelectorAll("[data-item-tiers]").forEach((wrap) => {
        const idx = Number(wrap.dataset.itemTiers);
        wrap.querySelectorAll("[data-tier]").forEach((btn) => {
          btn.onclick = () => {
            const tier = btn.dataset.tier;
            const item = itens[idx];
            const oculto = Number(item.custoOculto || 0);
            const fake = {
              precoMin: item.precoMin ?? item.precoBase ?? item.preco,
              preco: item.precoMed ?? item.precoBase ?? item.preco,
              precoMax: item.precoMax ?? item.precoBase ?? item.preco
            };
            item.precoModo = tier;
            item.precoBase = getPrecoByModo(fake, tier);
            item.preco = item.precoBase + oculto;
            renderItens();
          };
        });
      });
    };

    const optionsServico = () => s.servicos.map((sv) => {
      const oculto = custoOcultoServico(sv.id, s);
      const base = getPrecoByModo(sv, modoLocal);
      const label = oculto > 0
        ? `${sv.nome} — ${money(base + oculto)} (base ${money(base)} + embutido)`
        : `${sv.nome} — ${money(base)}`;
      return `<option value="${sv.id}">${label}</option>`;
    }).join("");
    const optionsProduto = () => s.produtos.map((p) =>
      `<option value="${p.id}">${p.nome} — ${money(getPrecoByModo(p, modoLocal))}</option>`
    ).join("");

    openModal(orcamento ? "Editar orçamento" : "Novo orçamento", `
      <div class="form-grid">
        <div class="field full"><label>Cliente</label>
          <select id="oCliente">
            ${s.clientes.map((c) => `<option value="${c.id}" ${c.id === o.clienteId ? "selected" : ""}>${c.nome}</option>`).join("") || `<option value="">Cadastre um cliente primeiro</option>`}
          </select>
        </div>
        <div class="field full"><label>Título</label><input id="oTitulo" value="${o.titulo || ""}" placeholder="Ex: Orçamento de quadro elétrico" /></div>
        <div class="field"><label>Data</label><input id="oData" type="date" value="${o.data || todayISO()}" /></div>
        <div class="field"><label>Validade (dias)</label><input id="oVal" type="number" value="${o.validade || 15}" /></div>
        <div class="field"><label>Prazo de entrega</label><input id="oPrazo" value="${o.prazo || "7 dias"}" /></div>
        <div class="field"><label>Desconto (R$)</label><input id="oDesc" type="number" step="0.01" value="${o.desconto || 0}" /></div>
        <div class="field"><label>Garantia (meses)</label><input id="oGarantia" type="number" min="1" value="${o.garantiaMeses || 3}" /></div>
        <div class="field"><label>Nota fiscal</label>
          <select id="oNotaFiscal">
            <option value="a_definir" ${(o.notaFiscal || "a_definir") === "a_definir" ? "selected" : ""}>A definir</option>
            <option value="sim" ${o.notaFiscal === "sim" ? "selected" : ""}>Precisa de NF</option>
            <option value="nao" ${o.notaFiscal === "nao" ? "selected" : ""}>Sem NF</option>
          </select>
        </div>
        <div class="field" id="oNfEmissorWrap" ${(o.notaFiscal || "a_definir") === "sim" ? "" : "hidden"}>
          <label>Emissor da NF</label>
          <select id="oNfEmissor">
            ${getEmissoresNf(s)
              .filter((e) => e.ativo !== false)
              .map(
                (e) =>
                  `<option value="${e.id}" ${
                    (o.nfEmissorId || "nf-propria") === e.id ? "selected" : ""
                  }>${e.nome}${e.contato ? ` (${e.contato})` : ""} — ${Number(e.aliquota) || 0}%</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field full">
          <label>Formas de pagamento (aparecem no PDF)</label>
          <div style="display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:6px">
            ${[
              ["pix", "PIX"],
              ["dinheiro", "Dinheiro"],
              ["transferencia", "Transferência"],
              ["boleto", "Boleto"],
              ["cartao", "Cartão"]
            ]
              .map(
                ([id, label]) =>
                  `<label style="display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--text-muted)"><input type="checkbox" class="oPag" value="${id}" ${(o.formasPagamento || ["pix"]).includes(id) ? "checked" : ""} /> ${label}</label>`
              )
              .join("")}
          </div>
        </div>
        <div class="field full"><label>Detalhe da forma de pagamento</label><input id="oPagObs" value="${o.formaPagamentoObs || ""}" placeholder="Ex: 50% entrada + 50% na conclusão" /></div>
        <div class="field full">
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:.9rem;color:var(--text)">
            <input type="checkbox" id="oIncluiMat" style="margin-top:3px" ${o.incluirMateriaisNoPdf !== false ? "checked" : ""} />
            <span><strong>Somar valor dos materiais no total do PDF</strong><br/><span class="hint">Marcado: total do sistema = total do PDF (mão de obra + materiais). Desmarcado: materiais só na pág. 2 como referência — o total da lista e do PDF ficam só com a mão de obra.</span></span>
          </label>
        </div>
        <div class="field full"><label>Observações</label><textarea id="oObs">${o.observacoes || ""}</textarea></div>
      </div>

      <div style="margin:16px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px">Preço ao adicionar itens</div>
          <div class="segmented" id="orcModoSeg">
            ${PRECO_MODOS.map((m) => `<button type="button" data-modo="${m.id}" class="${modoLocal === m.id ? "active" : ""}">${m.label}</button>`).join("")}
          </div>
        </div>
        <p style="color:var(--text-dim);font-size:.8rem;max-width:280px">Deslocamento/alimentação (1× visita) + extras do serviço entram no valor e <strong>não aparecem</strong> detalhados no PDF.</p>
      </div>

      <div style="margin:0 0 16px;display:flex;gap:8px;flex-wrap:wrap">
        <select id="addServico" style="flex:1;min-width:180px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:11px;padding:10px">
          <option value="">+ Adicionar serviço...</option>
          ${optionsServico()}
        </select>
        <select id="addProduto" style="flex:1;min-width:180px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:11px;padding:10px">
          <option value="">+ Adicionar material...</option>
          ${optionsProduto()}
        </select>
      </div>
      <div id="itensBox"></div>
    `, `
      <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
      <button class="btn btn-primary" id="saveOrc">Salvar orçamento</button>
    `, true);

    const refreshAddOptions = () => {
      const selS = document.getElementById("addServico");
      const selP = document.getElementById("addProduto");
      selS.innerHTML = `<option value="">+ Adicionar serviço...</option>${optionsServico()}`;
      selP.innerHTML = `<option value="">+ Adicionar material...</option>${optionsProduto()}`;
    };

    document.getElementById("orcModoSeg").onclick = (e) => {
      const btn = e.target.closest("button[data-modo]");
      if (!btn) return;
      modoLocal = btn.dataset.modo;
      document.querySelectorAll("#orcModoSeg button").forEach((b) => b.classList.toggle("active", b.dataset.modo === modoLocal));
      refreshAddOptions();
    };

    renderItens();
    document.getElementById("oDesc").oninput = renderItens;
    document.getElementById("oIncluiMat")?.addEventListener("change", renderItens);
    document.getElementById("oNotaFiscal").onchange = () => {
      syncNfEmissorUI();
      renderItens();
    };
    document.getElementById("oNfEmissor").onchange = renderItens;
    syncNfEmissorUI();
    document.getElementById("addServico").onchange = (e) => {
      const sv = s.servicos.find((x) => x.id === e.target.value);
      if (!sv) return;
      const meta = enrichFromCatalog(sv);
      const base = getPrecoByModo(sv, modoLocal);
      const ocultas = despesasDoServico(sv.id, s).map((d) => ({
        id: d.id,
        nome: d.nome,
        valor: Number(d.valor) || 0,
        global: !!d.global
      }));
      const custoOculto = ocultas.reduce((t, d) => t + d.valor, 0);
      itens.push({
        id: uid("item"),
        refId: sv.id,
        tipo: "servico",
        nome: sv.nome,
        precoBase: base,
        custoOculto,
        despesasOcultas: ocultas,
        preco: base + custoOculto,
        precoMin: meta.precoMin,
        precoMed: meta.precoMed,
        precoMax: meta.precoMax,
        precoModo: modoLocal,
        qtd: 1,
        unidade: sv.unidade
      });
      e.target.value = "";
      renderItens();
    };
    document.getElementById("addProduto").onchange = (e) => {
      const p = s.produtos.find((x) => x.id === e.target.value);
      if (!p) return;
      const meta = enrichFromCatalog(p);
      itens.push({
        id: uid("item"),
        refId: p.id,
        tipo: "produto",
        nome: p.nome,
        preco: getPrecoByModo(p, modoLocal),
        precoMin: meta.precoMin,
        precoMed: meta.precoMed,
        precoMax: meta.precoMax,
        precoModo: modoLocal,
        qtd: 1,
        unidade: p.unidade
      });
      e.target.value = "";
      renderItens();
    };
    document.getElementById("cancelModal").onclick = closeModal;
    document.getElementById("saveOrc").onclick = () => {
      const titulo = document.getElementById("oTitulo").value.trim();
      const clienteId = document.getElementById("oCliente").value;
      if (!clienteId) return toast("Selecione um cliente");
      if (!titulo) return toast("Informe o título");
      if (!itens.length) return toast("Adicione ao menos um item");

      const notaFiscal = document.getElementById("oNotaFiscal").value || "a_definir";
      const nfEmissorId =
        notaFiscal === "sim"
          ? document.getElementById("oNfEmissor")?.value || "nf-propria"
          : "";
      const emissor = notaFiscal === "sim" ? getEmissorNf(nfEmissorId, getState()) : null;
      const nfAliquota = notaFiscal === "sim" ? Number(emissor?.aliquota) || 0 : 0;

      const itensClean = itens.map((i) => sanitizarItemOculto(i, getState()));
      const temServ = itensClean.some((i) => i.tipo === "servico");
      const despesasObra = temServ ? custoOcultoGlobal(getState()) : 0;

      const data = {
        id: o.id || uid("orc"),
        codigo: o.codigo || nextCodigo("ORC", getState().orcamentos),
        clienteId,
        titulo,
        data: document.getElementById("oData").value,
        validade: Number(document.getElementById("oVal").value) || 15,
        prazo: document.getElementById("oPrazo").value.trim(),
        desconto: Number(document.getElementById("oDesc").value) || 0,
        garantiaMeses: Number(document.getElementById("oGarantia").value) || 3,
        incluirMateriaisNoPdf: document.getElementById("oIncluiMat")?.checked !== false,
        formasPagamento: [...document.querySelectorAll(".oPag:checked")].map((el) => el.value),
        formaPagamentoObs: document.getElementById("oPagObs").value.trim(),
        observacoes: document.getElementById("oObs").value.trim(),
        notaFiscal,
        nfEmissorId,
        nfEmissorNome: emissor?.nome || "",
        nfAliquota,
        precoModo: modoLocal,
        despesasObra,
        itens: itensClean,
        status: o.status || "pendente"
      };
      const list = [...getState().orcamentos];
      const idx = list.findIndex((x) => x.id === data.id);
      if (idx >= 0) list[idx] = data; else list.push(data);
      Store.update({ orcamentos: list });
      closeModal();
      toast("Orçamento salvo");
      navigate("orcamentos");
    };
  }

  function renderServicos() {
    const s = getState();
    const q = searchQuery.toLowerCase();
    let list = s.servicos.filter((sv) =>
      (!q || sv.nome.toLowerCase().includes(q) || sv.categoria.toLowerCase().includes(q)) &&
      (servicoFiltro === "todos" || sv.tipo === servicoFiltro)
    );

    content.innerHTML = `
      <div class="view-enter">
      <div class="hero-note">
        <div>
          <h3>Tabela de mão de obra — ES</h3>
          <p>Clique em <strong>Mínimo</strong>, <strong>Médio</strong> ou <strong>Máximo</strong> em cada serviço (ou no topo da tela) para definir o valor usado nos orçamentos.</p>
          <div class="source-pill">Modo ativo: ${precoModoLabel(getPrecoModo())}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-secondary" id="btnPdfPrecos">PDF tabela de preços</button>
          <button class="btn btn-primary" id="btnNovoServ">+ Novo serviço</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab ${servicoFiltro === "todos" ? "active" : ""}" data-f="todos">Todos</button>
        <button class="tab ${servicoFiltro === "residencial" ? "active" : ""}" data-f="residencial">Residencial</button>
        <button class="tab ${servicoFiltro === "comercial" ? "active" : ""}" data-f="comercial">Comercial</button>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Serviço</th><th>Categoria</th><th>Tipo</th><th>Unidade</th><th>Mínimo · Médio · Máximo</th><th>Embutido</th><th>Tempo</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map((sv) => {
                const emb = custoOcultoServico(sv.id, s);
                return `
                <tr>
                  <td><strong>${sv.nome}</strong><div style="color:var(--text-dim);font-size:.8rem;max-width:320px">${sv.descricao || ""}</div></td>
                  <td>${sv.categoria}</td>
                  <td>${sv.tipo}</td>
                  <td>${sv.unidade}</td>
                  <td>${priceRangeHtml(sv)}</td>
                  <td title="Soma no unitário · oculto no PDF">${emb > 0 ? money(emb) : "—"}</td>
                  <td>${sv.tempo || "—"}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" data-edit="${sv.id}">Editar</button>
                    <button class="btn btn-sm btn-danger" data-del="${sv.id}">Excluir</button>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    `;

    content.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => { servicoFiltro = t.dataset.f; render(); };
    });
    content.querySelectorAll(".price-range [data-tier]").forEach((btn) => {
      btn.onclick = () => setPrecoModo(btn.dataset.tier);
    });
    document.getElementById("btnNovoServ").onclick = () => openServicoForm();
    document.getElementById("btnPdfPrecos").onclick = async () => {
      try {
        await PDF.preloadBrand();
        PDF.tabelaPrecos(getState().servicos, getState().produtos, getState().empresa);
        toast("PDF da tabela de preços gerado");
      } catch (e) {
        toast(e.message || "Falha ao gerar PDF");
      }
    };
    content.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openServicoForm(s.servicos.find((x) => x.id === btn.dataset.edit));
    });
    content.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        if (!confirm("Excluir serviço?")) return;
        Store.update({ servicos: getState().servicos.filter((x) => x.id !== btn.dataset.del) });
        toast("Serviço removido");
        render();
      };
    });
  }

  function openServicoForm(servico = null) {
    const sv = servico || { tipo: "residencial", unidade: "ponto", categoria: "Instalações" };
    openModal(servico ? "Editar serviço" : "Novo serviço", `
      <div class="form-grid">
        <div class="field full"><label>Nome</label><input id="sNome" value="${sv.nome || ""}" /></div>
        <div class="field"><label>Categoria</label><input id="sCat" value="${sv.categoria || ""}" /></div>
        <div class="field"><label>Tipo</label>
          <select id="sTipo"><option value="residencial" ${sv.tipo === "residencial" ? "selected" : ""}>Residencial</option><option value="comercial" ${sv.tipo === "comercial" ? "selected" : ""}>Comercial</option></select>
        </div>
        <div class="field"><label>Unidade</label><input id="sUn" value="${sv.unidade || "ponto"}" /></div>
        <div class="field"><label>Preço sugerido (R$)</label><input id="sPreco" type="number" step="0.01" value="${sv.preco || 0}" /></div>
        <div class="field"><label>Tempo estimado</label><input id="sTempo" value="${sv.tempo || ""}" /></div>
        <div class="field"><label>Faixa mín. (R$)</label><input id="sMin" type="number" step="0.01" value="${sv.precoMin ?? sv.preco ?? 0}" /></div>
        <div class="field"><label>Faixa máx. (R$)</label><input id="sMax" type="number" step="0.01" value="${sv.precoMax ?? sv.preco ?? 0}" /></div>
        <div class="field full"><label>Descrição</label><textarea id="sDesc">${sv.descricao || ""}</textarea></div>
      </div>
    `, `
      <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
      <button class="btn btn-primary" id="saveServ">Salvar</button>
    `);
    document.getElementById("cancelModal").onclick = closeModal;
    document.getElementById("saveServ").onclick = () => {
      const nome = document.getElementById("sNome").value.trim();
      if (!nome) return toast("Informe o nome");
      const preco = Number(document.getElementById("sPreco").value) || 0;
      const data = {
        id: sv.id || uid("srv"),
        nome,
        categoria: document.getElementById("sCat").value.trim(),
        tipo: document.getElementById("sTipo").value,
        unidade: document.getElementById("sUn").value.trim(),
        preco,
        precoMin: Number(document.getElementById("sMin").value) || preco,
        precoMax: Number(document.getElementById("sMax").value) || preco,
        tempo: document.getElementById("sTempo").value.trim(),
        descricao: document.getElementById("sDesc").value.trim()
      };
      const list = [...getState().servicos];
      const idx = list.findIndex((x) => x.id === data.id);
      if (idx >= 0) list[idx] = data; else list.push(data);
      Store.update({ servicos: list });
      closeModal();
      toast("Serviço salvo");
      render();
    };
  }

  function renderProdutos() {
    const s = getState();
    const cats = ["Todas", ...new Set(s.produtos.map((p) => p.categoria))];
    const q = searchQuery.toLowerCase();
    const list = s.produtos.filter((p) =>
      (produtoCategoria === "Todas" || p.categoria === produtoCategoria) &&
      (!q || p.nome.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q))
    );

    content.innerHTML = `
      <div class="view-enter">
      <div class="hero-note">
        <div>
          <h3>Materiais com preço de varejo</h3>
          <p>Escolha Mínimo, Médio ou Máximo no topo (ou nos cards). Esse valor entra automaticamente no orçamento.</p>
          <div class="source-pill">Modo ativo: ${precoModoLabel(getPrecoModo())}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-secondary" id="btnPdfPrecosMat">PDF tabela de preços</button>
          <button class="btn btn-primary" id="btnNovoProd">+ Novo material</button>
        </div>
      </div>
      <div class="tabs">
        ${cats.map((c) => `<button class="tab ${produtoCategoria === c ? "active" : ""}" data-cat="${c}">${c}</button>`).join("")}
      </div>
      <div class="product-grid">
        ${list.map((p) => `
          <article class="product-card">
            <div class="product-media">${produtoMedia(p)}</div>
            <div class="product-body">
              <div class="product-cat">${p.categoria}</div>
              <h4>${p.nome}</h4>
              <div class="product-marca">${p.marca || "Linha popular"}</div>
              <p style="color:var(--text-muted);font-size:.8rem">${p.descricao || ""}</p>
              <div class="product-price">${money(getPrecoByModo(p, getPrecoModo()))} <span class="product-faixa">/ ${p.unidade}</span></div>
              ${tierPicksHtml(p, getPrecoModo())}
              <div class="product-actions">
                <button class="btn btn-sm btn-secondary" data-edit="${p.id}">Editar</button>
                <button class="btn btn-sm btn-danger" data-del="${p.id}">Excluir</button>
              </div>
            </div>
          </article>
        `).join("") || `<div class="empty full"><strong>Nenhum material</strong></div>`}
      </div>
      </div>
    `;

    content.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => { produtoCategoria = t.dataset.cat; render(); };
    });
    content.querySelectorAll(".product-card [data-tier]").forEach((btn) => {
      btn.onclick = () => setPrecoModo(btn.dataset.tier);
    });
    document.getElementById("btnNovoProd").onclick = () => openProdutoForm();
    document.getElementById("btnPdfPrecosMat").onclick = async () => {
      try {
        await PDF.preloadBrand();
        PDF.tabelaPrecos(getState().servicos, getState().produtos, getState().empresa);
        toast("PDF da tabela de preços gerado");
      } catch (e) {
        toast(e.message || "Falha ao gerar PDF");
      }
    };
    content.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openProdutoForm(s.produtos.find((p) => p.id === btn.dataset.edit));
    });
    content.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        if (!confirm("Excluir material?")) return;
        Store.update({ produtos: getState().produtos.filter((p) => p.id !== btn.dataset.del) });
        toast("Material removido");
        render();
      };
    });
  }

  function openProdutoForm(produto = null) {
    const p = produto || { categoria: "Tomadas", unidade: "un", icon: "tomada", cor: "#3db4ff" };
    const iconKeys = Object.keys(icons);
    openModal(produto ? "Editar material" : "Novo material", `
      <div class="form-grid">
        <div class="field full"><label>Nome</label><input id="pNome" value="${p.nome || ""}" /></div>
        <div class="field"><label>Categoria</label><input id="pCat" value="${p.categoria || ""}" /></div>
        <div class="field"><label>Unidade</label><input id="pUn" value="${p.unidade || "un"}" /></div>
        <div class="field"><label>Preço sugerido (R$)</label><input id="pPreco" type="number" step="0.01" value="${p.preco || 0}" /></div>
        <div class="field"><label>Marca / linha</label><input id="pMarca" value="${p.marca || ""}" /></div>
        <div class="field"><label>Faixa mín. (R$)</label><input id="pMin" type="number" step="0.01" value="${p.precoMin ?? p.preco ?? 0}" /></div>
        <div class="field"><label>Faixa máx. (R$)</label><input id="pMax" type="number" step="0.01" value="${p.precoMax ?? p.preco ?? 0}" /></div>
        <div class="field"><label>Ícone</label>
          <select id="pIcon">
            ${iconKeys.map((k) => `<option value="${k}" ${p.icon === k ? "selected" : ""}>${k}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Cor do ícone</label><input id="pCor" type="color" value="${p.cor || "#3db4ff"}" /></div>
        <div class="field full"><label>Descrição</label><textarea id="pDesc">${p.descricao || ""}</textarea></div>
      </div>
    `, `
      <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
      <button class="btn btn-primary" id="saveProd">Salvar</button>
    `);
    document.getElementById("cancelModal").onclick = closeModal;
    document.getElementById("saveProd").onclick = () => {
      const nome = document.getElementById("pNome").value.trim();
      if (!nome) return toast("Informe o nome");
      const preco = Number(document.getElementById("pPreco").value) || 0;
      const data = {
        id: p.id || uid("prd"),
        nome,
        categoria: document.getElementById("pCat").value.trim(),
        unidade: document.getElementById("pUn").value.trim(),
        preco,
        precoMin: Number(document.getElementById("pMin").value) || preco,
        precoMax: Number(document.getElementById("pMax").value) || preco,
        marca: document.getElementById("pMarca").value.trim(),
        icon: document.getElementById("pIcon").value,
        cor: document.getElementById("pCor").value,
        descricao: document.getElementById("pDesc").value.trim()
      };
      const list = [...getState().produtos];
      const idx = list.findIndex((x) => x.id === data.id);
      if (idx >= 0) list[idx] = data; else list.push(data);
      Store.update({ produtos: list });
      closeModal();
      toast("Material salvo");
      render();
    };
  }

  function renderFinanceiro() {
    const s = getState();
    const mes = todayISO().slice(0, 7);
    const doMes = s.lancamentos.filter((l) => (l.data || "").startsWith(mes));
    const entradas = doMes.filter((l) => l.tipo === "entrada").reduce((t, l) => t + l.valor, 0);
    const saidas = doMes.filter((l) => l.tipo === "saida").reduce((t, l) => t + l.valor, 0);
    const despesasServico = s.despesasServico || [];
    const despesasGlobais = s.despesasGlobais || [];
    const totalGlobal = custoOcultoGlobal(s);
    const aprovadosMes = s.orcamentos.filter((o) => o.status === "aprovado" && (o.data || "").startsWith(mes));
    const ocultoEmOrcamentos = aprovadosMes.reduce((t, o) => {
      const itens = (o.itens || []).map((i) => sanitizarItemOculto(i, s));
      const porItem = itens.reduce(
        (s2, i) => s2 + Number(i.custoOculto || 0) * Number(i.qtd || 0),
        0
      );
      return t + porItem + despesasObraDoOrcamento({ ...o, itens }, s);
    }, 0);
    const saldo = entradas - saidas;

    const nomeServico = (id) => s.servicos.find((sv) => sv.id === id)?.nome || "Serviço removido";

    content.innerHTML = `
      <div class="view-enter">
      <div class="hero-note">
        <div>
          <h3>Despesas embutidas (ocultas no PDF)</h3>
          <p><strong>Deslocamento</strong> e <strong>alimentação</strong> entram <strong>1× por orçamento</strong> (visita), não por ponto. Edite os valores abaixo se estiverem altos. Extras por serviço somam no unitário.</p>
        </div>
      </div>
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat-card success"><div class="stat-label">Entradas (mês)</div><div class="stat-value">${money(entradas)}</div></div>
        <div class="card stat-card danger"><div class="stat-label">Saídas (mês)</div><div class="stat-value">${money(saidas)}</div></div>
        <div class="card stat-card warn"><div class="stat-label">Global (1× visita)</div><div class="stat-value">${money(totalGlobal)}</div></div>
        <div class="card stat-card accent"><div class="stat-label">Embutido em aprovados</div><div class="stat-value">${money(ocultoEmOrcamentos)}</div></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="btnLan">+ Lançamento</button>
        <button class="btn btn-secondary" id="btnDespServ">+ Despesa por serviço</button>
        <button class="btn btn-secondary" id="btnRel">Baixar relatório PDF</button>
      </div>

      <div class="card" style="padding:0;margin-bottom:16px">
        <div class="card-header" style="padding:16px 16px 0">
          <div>
            <h3>Despesas em todos os serviços</h3>
            <p>Deslocamento e alimentação — 1× por orçamento · ocultas no PDF</p>
          </div>
          <button class="btn btn-sm btn-secondary" id="btnAddGlobal">+ Global</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Despesa</th><th>Escopo</th><th>Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${despesasGlobais.map((d) => `
                <tr>
                  <td><strong>${d.nome}</strong></td>
                  <td>1× por orçamento</td>
                  <td>${money(d.valor)}</td>
                  <td><span class="badge badge-${d.ativo === false ? "rejeitado" : "aprovado"}">${d.ativo === false ? "off" : "ativa"}</span></td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" data-edit-dg="${d.id}">Editar</button>
                    <button class="btn btn-sm btn-secondary" data-toggle-dg="${d.id}">${d.ativo === false ? "Ativar" : "Desativar"}</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="5"><div class="empty">Sem despesas globais</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card" style="padding:0">
          <div class="card-header" style="padding:16px 16px 0"><div><h3>Lançamentos</h3><p>Entradas e saídas do mês · saldo ${money(saldo)}</p></div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                ${doMes.length ? doMes.sort((a,b)=>b.data.localeCompare(a.data)).map((l) => `
                  <tr>
                    <td>${formatDate(l.data)}</td>
                    <td>${l.descricao}<div style="font-size:.75rem;color:var(--text-dim)">${l.categoria}</div></td>
                    <td><span class="badge badge-${l.tipo === "entrada" ? "aprovado" : "rejeitado"}">${l.tipo}</span></td>
                    <td>${money(l.valor)}</td>
                    <td><button class="btn btn-sm btn-danger" data-del-lan="${l.id}">✕</button></td>
                  </tr>`).join("") : `<tr><td colspan="5"><div class="empty">Sem lançamentos neste mês</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div class="card-header" style="padding:16px 16px 0"><div><h3>Extras por serviço</h3><p>Além do global · ocultas no PDF</p></div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Serviço</th><th>Despesa</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                ${despesasServico.length ? despesasServico.map((d) => `
                  <tr>
                    <td><strong>${nomeServico(d.servicoId)}</strong></td>
                    <td>${d.nome}</td>
                    <td>${money(d.valor)}</td>
                    <td><button class="btn btn-sm btn-danger" data-del-ds="${d.id}">✕</button></td>
                  </tr>`).join("") : `<tr><td colspan="4"><div class="empty">Nenhuma despesa extra por serviço</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>
    `;

    const openGlobalForm = (despesa = null) => {
      const d = despesa || { nome: "", valor: 0, ativo: true };
      openModal(despesa ? "Editar despesa global" : "Nova despesa global", `
        <div class="form-grid">
          <div class="field full"><label>Nome</label><input id="dgNome" value="${d.nome || ""}" placeholder="Ex: Deslocamento, Alimentação…" /></div>
          <div class="field"><label>Valor (R$)</label><input id="dgValor" type="number" step="0.01" value="${d.valor || 0}" /></div>
          <div class="field full" style="color:var(--text-dim);font-size:.82rem">Soma <strong>1× por orçamento</strong> (visita), não por ponto. Cliente não vê o detalhe.</div>
        </div>
      `, `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="saveDg">Salvar</button>`);
      document.getElementById("cancelModal").onclick = closeModal;
      document.getElementById("saveDg").onclick = () => {
        const nome = document.getElementById("dgNome").value.trim();
        const valor = Number(document.getElementById("dgValor").value);
        if (!nome) return toast("Informe o nome");
        if (!(valor >= 0)) return toast("Informe um valor válido");
        const list = [...(getState().despesasGlobais || [])];
        const data = {
          id: d.id || uid("dg"),
          nome,
          valor,
          ativo: d.ativo !== false,
          escopo: "orcamento"
        };
        const idx = list.findIndex((x) => x.id === data.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...data };
        else list.push(data);
        Store.update({ despesasGlobais: list });
        closeModal();
        toast("Despesa global salva");
        render();
      };
    };

    document.getElementById("btnAddGlobal").onclick = () => openGlobalForm();
    content.querySelectorAll("[data-edit-dg]").forEach((btn) => {
      btn.onclick = () => openGlobalForm(despesasGlobais.find((x) => x.id === btn.dataset.editDg));
    });
    content.querySelectorAll("[data-toggle-dg]").forEach((btn) => {
      btn.onclick = () => {
        const list = (getState().despesasGlobais || []).map((d) =>
          d.id === btn.dataset.toggleDg ? { ...d, ativo: d.ativo === false } : d
        );
        Store.update({ despesasGlobais: list });
        render();
      };
    });

    document.getElementById("btnLan").onclick = () => {
      openModal("Novo lançamento", `
        <div class="form-grid">
          <div class="field"><label>Tipo</label><select id="lTipo"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></div>
          <div class="field"><label>Data</label><input id="lData" type="date" value="${todayISO()}" /></div>
          <div class="field full"><label>Descrição</label><input id="lDesc" /></div>
          <div class="field"><label>Categoria</label>
            <select id="lCat"><option>Serviço</option><option>Material</option><option>Equipamento</option><option>Administração</option><option>Transporte</option><option>Marketing</option><option>Outros</option></select>
          </div>
          <div class="field"><label>Valor</label><input id="lValor" type="number" step="0.01" /></div>
        </div>
      `, `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="saveLan">Salvar</button>`);
      document.getElementById("cancelModal").onclick = closeModal;
      document.getElementById("saveLan").onclick = () => {
        const descricao = document.getElementById("lDesc").value.trim();
        const valor = Number(document.getElementById("lValor").value);
        if (!descricao || !valor) return toast("Preencha descrição e valor");
        Store.update({
          lancamentos: [...getState().lancamentos, {
            id: uid("lan"),
            tipo: document.getElementById("lTipo").value,
            data: document.getElementById("lData").value,
            descricao,
            categoria: document.getElementById("lCat").value,
            valor
          }]
        });
        closeModal();
        toast("Lançamento salvo");
        render();
      };
    };

    document.getElementById("btnDespServ").onclick = () => {
      openModal("Despesa por serviço", `
        <div class="form-grid">
          <div class="field full"><label>Serviço</label>
            <select id="dsServ">
              ${s.servicos.map((sv) => `<option value="${sv.id}">${sv.nome}</option>`).join("")}
            </select>
          </div>
          <div class="field full"><label>Nome da despesa (interno)</label><input id="dsNome" placeholder="Ex: Consumíveis, EPI…" /></div>
          <div class="field"><label>Valor embutido (R$)</label><input id="dsValor" type="number" step="0.01" /></div>
          <div class="field full" style="color:var(--text-dim);font-size:.82rem">Extra além de deslocamento/alimentação. Soma no unitário; cliente não vê o detalhe.</div>
        </div>
      `, `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="saveDs">Salvar</button>`);
      document.getElementById("cancelModal").onclick = closeModal;
      document.getElementById("saveDs").onclick = () => {
        const nome = document.getElementById("dsNome").value.trim();
        const valor = Number(document.getElementById("dsValor").value);
        const servicoId = document.getElementById("dsServ").value;
        if (!servicoId) return toast("Selecione um serviço");
        if (!nome || !valor) return toast("Preencha nome e valor");
        Store.update({
          despesasServico: [...(getState().despesasServico || []), {
            id: uid("ds"),
            servicoId,
            nome,
            valor
          }]
        });
        closeModal();
        toast("Despesa vinculada ao serviço");
        render();
      };
    };

    document.getElementById("btnRel").onclick = async () => {
      try {
        await PDF.preloadBrand();
        PDF.financeiro({
          periodo: mes,
          entradas,
          saidas,
          fixas: ocultoEmOrcamentos,
          labelFixas: "Custo oculto embutido (aprovados)",
          saldo,
          lancamentos: doMes,
          despesasGlobais,
          despesasServico: despesasServico.map((d) => ({
            ...d,
            servicoNome: nomeServico(d.servicoId)
          }))
        }, s.empresa);
        toast("Relatório gerado");
      } catch (e) {
        toast(e.message);
      }
    };

    content.querySelectorAll("[data-del-lan]").forEach((btn) => {
      btn.onclick = () => {
        Store.update({ lancamentos: getState().lancamentos.filter((l) => l.id !== btn.dataset.delLan) });
        render();
      };
    });
    content.querySelectorAll("[data-del-ds]").forEach((btn) => {
      btn.onclick = () => {
        Store.update({
          despesasServico: (getState().despesasServico || []).filter((d) => d.id !== btn.dataset.delDs)
        });
        render();
      };
    });
  }

  function renderCalculadoras() {
    const tabs = [
      { id: "ambientes", label: "Ambientes" },
      { id: "nbr5410", label: "NBR 5410" },
      { id: "corrente", label: "Corrente" },
      { id: "potencia", label: "Potência" },
      { id: "queda", label: "Queda de tensão" },
      { id: "bitola", label: "Bitola rápida" }
    ];

    content.innerHTML = `
      <div class="view-enter">
      <div class="tabs">
        ${tabs.map((t) => `<button class="tab ${calcTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}
      </div>
      <div id="calcBody"></div>
      </div>
    `;

    content.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => {
        calcTab = t.dataset.tab;
        render();
      };
    });

    const box = document.getElementById("calcBody");
    if (calcTab === "ambientes") {
      renderPreProjetoAmbientes(box);
      return;
    }
    if (calcTab === "nbr5410") {
      renderDimNBR(box);
      return;
    }

    box.className = "card";
    box.style.maxWidth = "560px";

    if (calcTab === "corrente") {
      box.innerHTML = `
        <h3 style="font-family:var(--display);margin-bottom:12px">Corrente elétrica</h3>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:.9rem">I = P ÷ V (monofásico aproximado)</p>
        <div class="form-grid">
          <div class="field"><label>Potência (W)</label><input id="cP" type="number" value="5500" /></div>
          <div class="field"><label>Tensão (V)</label><input id="cV" type="number" value="220" /></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" id="calcBtn">Calcular</button>
        <div class="calc-result" id="calcOut" hidden></div>
      `;
      document.getElementById("calcBtn").onclick = () => {
        const P = Number(document.getElementById("cP").value);
        const V = Number(document.getElementById("cV").value);
        const I = V ? P / V : 0;
        const out = document.getElementById("calcOut");
        out.hidden = false;
        out.innerHTML = `<div class="label">Corrente estimada</div><div class="value">${I.toFixed(2)} A</div>`;
      };
    } else if (calcTab === "potencia") {
      box.innerHTML = `
        <h3 style="font-family:var(--display);margin-bottom:12px">Potência</h3>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:.9rem">P = V × I</p>
        <div class="form-grid">
          <div class="field"><label>Tensão (V)</label><input id="cV" type="number" value="220" /></div>
          <div class="field"><label>Corrente (A)</label><input id="cI" type="number" value="20" /></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" id="calcBtn">Calcular</button>
        <div class="calc-result" id="calcOut" hidden></div>
      `;
      document.getElementById("calcBtn").onclick = () => {
        const V = Number(document.getElementById("cV").value);
        const I = Number(document.getElementById("cI").value);
        const P = V * I;
        const out = document.getElementById("calcOut");
        out.hidden = false;
        out.innerHTML = `<div class="label">Potência</div><div class="value">${P.toFixed(0)} W <span style="font-size:1rem;color:var(--text-muted)">(${(P / 1000).toFixed(2)} kW)</span></div>`;
      };
    } else if (calcTab === "queda") {
      box.innerHTML = `
        <h3 style="font-family:var(--display);margin-bottom:12px">Queda de tensão</h3>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:.9rem">Estimativa NBR 5410 simplificada (cobre)</p>
        <div class="form-grid">
          <div class="field"><label>Comprimento (m)</label><input id="cL" type="number" value="30" /></div>
          <div class="field"><label>Corrente (A)</label><input id="cI" type="number" value="16" /></div>
          <div class="field"><label>Seção (mm²)</label><input id="cS" type="number" value="2.5" step="0.1" /></div>
          <div class="field"><label>Tensão (V)</label><input id="cV" type="number" value="220" /></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" id="calcBtn">Calcular</button>
        <div class="calc-result" id="calcOut" hidden></div>
      `;
      document.getElementById("calcBtn").onclick = () => {
        const q = NBR5410.quedaTensao({
          comprimentoM: Number(document.getElementById("cL").value),
          correnteA: Number(document.getElementById("cI").value),
          secaoMm2: Number(document.getElementById("cS").value),
          tensaoV: Number(document.getElementById("cV").value),
          fases: 1
        });
        const out = document.getElementById("calcOut");
        out.hidden = false;
        out.innerHTML = `<div class="label">Queda estimada</div><div class="value">${q.dV.toFixed(2)} V <span style="font-size:1rem;color:var(--text-muted)">(${q.pct.toFixed(2)}%)</span></div><p style="margin-top:8px;color:var(--text-muted);font-size:.85rem">${q.okTerminal ? "Dentro do limite usual de circuito terminal (≤4%)." : "Acima de 4% — aumente a bitola."}</p>`;
      };
    } else {
      box.innerHTML = `
        <h3 style="font-family:var(--display);margin-bottom:12px">Bitola rápida</h3>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:.9rem">Compara o mesmo circuito em <strong>127 V</strong> e <strong>220 V</strong> (atalho — use NBR 5410 para o completo)</p>
        <div class="form-grid">
          <div class="field"><label>Potência (W)</label><input id="cP" type="number" value="5500" /></div>
          <div class="field"><label>Comprimento ida (m)</label><input id="cL" type="number" value="15" step="0.5" /></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" id="calcBtn">Sugerir 127 V e 220 V</button>
        <div id="calcOut" hidden style="margin-top:14px"></div>
      `;
      document.getElementById("calcBtn").onclick = () => {
        const P = Number(document.getElementById("cP").value);
        const L = Number(document.getElementById("cL").value) || 15;
        const calc = (tensaoV) =>
          NBR5410.dimensionar({
            tipoId: "livre",
            potenciaW: P,
            tensaoV,
            comprimentoM: L,
            polos: tensaoV >= 220 ? 2 : 1,
            fases: 1,
            agrupamentoId: "1",
            tempId: "30",
            dr: false
          });
        const r127 = calc(127);
        const r220 = calc(220);
        const card = (titulo, r, V) => `
          <div class="calc-result" style="margin:0">
            <div class="label">${titulo}</div>
            <div class="value" style="font-size:1.25rem">${r.cabo.secao} mm²</div>
            <p style="margin-top:8px;color:var(--text-muted);font-size:.82rem;line-height:1.5">
              Ib ≈ <strong>${r.ib.toFixed(2)} A</strong> · Disjuntor <strong>${r.disjuntor.In} A</strong> (${r.disjuntor.polos}P)<br/>
              Queda ≈ ${r.queda.pct.toFixed(2)}% ${r.queda.okTerminal ? "(ok ≤4%)" : "(acima de 4%)"} · ${V} V
            </p>
          </div>`;
        const out = document.getElementById("calcOut");
        out.hidden = false;
        out.innerHTML = `
          <div class="grid grid-2" style="gap:10px">
            ${card("127 V — seção sugerida", r127, 127)}
            ${card("220 V — seção sugerida", r220, 220)}
          </div>
          <p style="margin-top:10px;color:var(--text-dim);font-size:.78rem">Em 127 V a corrente sobe (P÷V), então a bitola/disjuntor podem ser maiores que em 220 V para a mesma potência.</p>
        `;
      };
    }
  }

  function renderPreProjetoAmbientes(box) {
    if (!preProjetoState.comodos.length && preProjetoState.uso === "residencial") {
      // seed inicial amigável
      preProjetoState.comodos = [
        PreProjeto.criarComodo("residencial", "sala"),
        PreProjeto.criarComodo("residencial", "quarto", "Quarto 1"),
        PreProjeto.criarComodo("residencial", "cozinha"),
        PreProjeto.criarComodo("residencial", "banheiro")
      ];
    }

    const uso = preProjetoState.uso;
    const presets = PreProjeto.PRESETS[uso] || PreProjeto.PRESETS.residencial;
    const resultado =
      preProjetoState.comodos.length > 0
        ? PreProjeto.calcular({
            uso,
            comodos: preProjetoState.comodos,
            produtos: getState().produtos,
            servicos: getState().servicos,
            modoPreco: getPrecoModo()
          })
        : null;
    lastPreProjeto = resultado;

    box.innerHTML = `
      <div class="hero-note" style="margin-bottom:16px">
        <div>
          <h3>Pré-projeto por ambientes</h3>
          <p>Escolha residência ou comércio, monte os cômodos e os pontos. No final: materiais, mão de obra e um <strong>guia de circuitos</strong>. Só para base de orçamento — não substitui engenheiro.</p>
          <div class="source-pill">Estimativa auxiliar · NBR 5410 simplificada</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px">Tipo de instalação</div>
            <div class="segmented" id="ppUsoSeg">
              <button type="button" data-uso="residencial" class="${uso === "residencial" ? "active" : ""}">Residência</button>
              <button type="button" data-uso="comercial" class="${uso === "comercial" ? "active" : ""}">Comércio</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="ppPreset" style="min-width:160px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:11px;padding:10px">
              ${presets.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}
            </select>
            <button class="btn btn-primary" id="ppAddComodo">+ Cômodo</button>
          </div>
        </div>
      </div>

      <div class="grid grid-2" style="align-items:start;gap:16px">
        <div>
          <div id="ppComodos">
            ${
              preProjetoState.comodos.length
                ? preProjetoState.comodos
                    .map(
                      (c, idx) => `
              <div class="card room-card" data-room="${c.id}">
                <div class="room-card-head">
                  <div>
                    <input class="room-name" data-field="nome" data-id="${c.id}" value="${c.nome}" />
                    <div class="room-meta">Área aprox. <input type="number" min="1" step="1" data-field="area" data-id="${c.id}" value="${c.area}" style="width:64px" /> m²</div>
                  </div>
                  <button class="btn btn-sm btn-danger" data-del-room="${c.id}">Remover</button>
                </div>
                <div class="room-grid">
                  ${PreProjeto.CAMPOS.map(
                    (f) => `
                    <label class="room-field">
                      <span>${f.label}</span>
                      <input type="number" min="0" step="1" data-field="${f.key}" data-id="${c.id}" value="${c[f.key] || 0}" />
                    </label>`
                  ).join("")}
                </div>
              </div>`
                    )
                    .join("")
                : `<div class="card"><div class="empty"><strong>Nenhum cômodo</strong>Adicione sala, quarto, cozinha…</div></div>`
            }
          </div>
        </div>

        <div class="card" id="ppResult">
          ${
            resultado
              ? renderPreProjetoResultadoHtml(resultado)
              : `<div class="empty"><strong>Resultado</strong>Adicione cômodos para ver circuitos e materiais.</div>`
          }
        </div>
      </div>
    `;

    document.getElementById("ppUsoSeg").onclick = (e) => {
      const btn = e.target.closest("button[data-uso]");
      if (!btn) return;
      const novo = btn.dataset.uso;
      if (novo === preProjetoState.uso) return;
      if (
        preProjetoState.comodos.length &&
        !confirm("Trocar o tipo reinicia a lista de cômodos. Continuar?")
      ) {
        return;
      }
      preProjetoState.uso = novo;
      preProjetoState.comodos =
        novo === "comercial"
          ? [
              PreProjeto.criarComodo("comercial", "loja"),
              PreProjeto.criarComodo("comercial", "escritorio"),
              PreProjeto.criarComodo("comercial", "banheiro_c")
            ]
          : [
              PreProjeto.criarComodo("residencial", "sala"),
              PreProjeto.criarComodo("residencial", "quarto", "Quarto 1"),
              PreProjeto.criarComodo("residencial", "cozinha"),
              PreProjeto.criarComodo("residencial", "banheiro")
            ];
      render();
    };

    document.getElementById("ppAddComodo").onclick = () => {
      const presetId = document.getElementById("ppPreset").value;
      preProjetoState.comodos.push(PreProjeto.criarComodo(preProjetoState.uso, presetId));
      render();
    };

    box.querySelectorAll("[data-del-room]").forEach((btn) => {
      btn.onclick = () => {
        preProjetoState.comodos = preProjetoState.comodos.filter((c) => c.id !== btn.dataset.delRoom);
        render();
      };
    });

    box.querySelectorAll("[data-field][data-id]").forEach((inp) => {
      const apply = () => {
        const comodo = preProjetoState.comodos.find((c) => c.id === inp.dataset.id);
        if (!comodo) return;
        const field = inp.dataset.field;
        if (field === "nome") comodo.nome = inp.value.trim() || comodo.nome;
        else comodo[field] = Math.max(0, Number(inp.value) || 0);
        // Atualiza só o painel de resultado sem perder foco
        const r = PreProjeto.calcular({
          uso: preProjetoState.uso,
          comodos: preProjetoState.comodos,
          produtos: getState().produtos,
          servicos: getState().servicos,
          modoPreco: getPrecoModo()
        });
        lastPreProjeto = r;
        const panel = document.getElementById("ppResult");
        if (panel) panel.innerHTML = renderPreProjetoResultadoHtml(r);
        bindPreProjetoResultActions(panel);
      };
      inp.addEventListener(inp.tagName === "INPUT" && inp.type === "number" ? "change" : "change", apply);
      if (inp.dataset.field === "nome") inp.addEventListener("blur", apply);
    });

    bindPreProjetoResultActions(box);
  }

  function renderPreProjetoResultadoHtml(r) {
    const c = r.circuitos;
    return `
      <h3 style="font-family:var(--display);margin-bottom:6px">Guia de circuitos</h3>
      <p style="color:var(--text-dim);font-size:.8rem;margin-bottom:12px">${r.disclaimer}</p>

      <div class="grid grid-2" style="gap:8px;margin-bottom:12px">
        <div class="calc-result" style="margin:0"><div class="label">Total de circuitos</div><div class="value" style="font-size:1.35rem">${c.total}</div></div>
        <div class="calc-result" style="margin:0"><div class="label">Quadro sugerido</div><div class="value" style="font-size:1.35rem">${c.quadroSugerido} polos</div></div>
      </div>

      <div class="circuit-guide">
        <div><strong>Iluminação:</strong> ${c.iluminacao.qtd} circuito(s) · ${c.iluminacao.pontos} pontos · ${c.iluminacao.bitola} · ${c.iluminacao.disjuntor}<div class="hint">${c.iluminacao.detalhe}</div></div>
        <div><strong>Tomadas (TUG):</strong> ${c.tug.qtd} circuito(s) · ${c.tug.tug10}×10A + ${c.tug.tug20}×20A · ${c.tug.bitola}<div class="hint">${c.tug.detalhe}</div></div>
        <div><strong>Dedicados:</strong> ${c.dedicados.qtd} · chuveiro ${c.dedicados.chuveiros} · ar ${c.dedicados.ares} · fogão ${c.dedicados.fogoes}<div class="hint">${c.dedicados.detalhe}</div></div>
        <div><strong>Reserva:</strong> ${c.reserva.qtd}<div class="hint">${c.reserva.detalhe}</div></div>
      </div>

      <div style="font-size:.82rem;color:var(--text-muted);margin:12px 0">
        Potência prevista (VA aproximados): <strong>${Math.round(c.potenciaPrevistaVA).toLocaleString("pt-BR")} VA</strong>
      </div>

      <h4 style="font-family:var(--display);margin:14px 0 8px">Materiais estimados</h4>
      <div class="table-wrap" style="max-height:220px;overflow:auto">
        <table>
          <thead><tr><th>Item</th><th>Qtd</th><th>Total</th></tr></thead>
          <tbody>
            ${r.materiais
              .map(
                (i) => `<tr>
              <td><strong>${i.nome}</strong>${i.nota ? `<div style="font-size:.72rem;color:var(--text-dim)">${i.nota}</div>` : ""}</td>
              <td>${i.qtd} ${i.unidade || ""}</td>
              <td>${money(i.qtd * i.preco)}</td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <h4 style="font-family:var(--display);margin:14px 0 8px">Mão de obra estimada</h4>
      <div class="table-wrap" style="max-height:180px;overflow:auto">
        <table>
          <thead><tr><th>Serviço</th><th>Qtd</th><th>Total</th></tr></thead>
          <tbody>
            ${
              r.maoObra.length
                ? r.maoObra
                    .map(
                      (i) => `<tr>
              <td><strong>${i.nome}</strong></td>
              <td>${i.qtd} ${i.unidade || ""}</td>
              <td>${money(i.qtd * i.preco)}</td>
            </tr>`
                    )
                    .join("")
                : `<tr><td colspan="3"><div class="empty">Sem serviços correspondentes no catálogo</div></td></tr>`
            }
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px">
        <div>
          <div style="font-size:.78rem;color:var(--text-muted)">Materiais ${money(r.totais.materiais)} · Mão de obra ${money(r.totais.maoObra)}</div>
          <strong style="font-size:1.1rem">Total base: ${money(r.totais.geral)}</strong>
        </div>
        <button class="btn btn-primary" id="ppOrcBtn">Gerar orçamento</button>
      </div>
    `;
  }

  function bindPreProjetoResultActions(root) {
    const btn = root?.querySelector?.("#ppOrcBtn");
    if (!btn) return;
    btn.onclick = () => {
      if (!lastPreProjeto) return toast("Monte os cômodos antes");
      enviarPreProjetoAoOrcamento(lastPreProjeto);
    };
  }

  function enviarPreProjetoAoOrcamento(resultado) {
    const s = getState();
    if (!s.clientes.length) return toast("Cadastre um cliente primeiro");

    openModal("Orçamento do pré-projeto", `
      <div class="form-grid">
        <div class="field full"><label>Cliente</label>
          <select id="ppCli">${s.clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}</select>
        </div>
        <div class="field full"><label>Título</label>
          <input id="ppTitulo" value="Pré-projeto ${resultado.uso === "comercial" ? "comercial" : "residencial"} — ${resultado.circuitos.total} circuitos" />
        </div>
        <div class="field full">
          <label style="display:flex;gap:8px;align-items:center;font-size:.9rem">
            <input type="checkbox" id="ppIncluiServ" checked /> Incluir mão de obra estimada
          </label>
          <label style="display:flex;gap:8px;align-items:center;font-size:.9rem;margin-top:8px">
            <input type="checkbox" id="ppIncluiMat" checked /> Incluir materiais estimados
          </label>
        </div>
        <div class="field"><label>Nota fiscal</label>
          <select id="ppNotaFiscal">
            <option value="a_definir">A definir</option>
            <option value="sim">Precisa de NF</option>
            <option value="nao">Sem NF</option>
          </select>
        </div>
        <div class="field" id="ppNfEmissorWrap" hidden>
          <label>Emissor da NF</label>
          <select id="ppNfEmissor">
            ${getEmissoresNf(s)
              .filter((e) => e.ativo !== false)
              .map(
                (e) =>
                  `<option value="${e.id}">${e.nome}${e.contato ? ` (${e.contato})` : ""} — ${Number(e.aliquota) || 0}%</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field full" style="color:var(--text-dim);font-size:.82rem">${resultado.disclaimer}</div>
      </div>
    `, `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="savePpOrc">Criar orçamento</button>`);

    document.getElementById("ppNotaFiscal").onchange = () => {
      document.getElementById("ppNfEmissorWrap").hidden =
        document.getElementById("ppNotaFiscal").value !== "sim";
    };

    document.getElementById("cancelModal").onclick = closeModal;
    document.getElementById("savePpOrc").onclick = () => {
      const modo = getPrecoModo();
      const incluiServ = document.getElementById("ppIncluiServ").checked;
      const incluiMat = document.getElementById("ppIncluiMat").checked;
      const itens = [];

      if (incluiServ) {
        (resultado.maoObra || []).forEach((sv) => {
          const ref = s.servicos.find((x) => x.id === sv.refId);
          const ocultas = ref
            ? despesasDoServico(ref.id, s).map((d) => ({
                id: d.id,
                nome: d.nome,
                valor: Number(d.valor) || 0,
                global: !!d.global
              }))
            : [];
          const custoOculto = ocultas.reduce((t, d) => t + d.valor, 0);
          const base = Number(sv.preco) || 0;
          itens.push({
            id: uid("item"),
            refId: sv.refId,
            tipo: "servico",
            nome: sv.nome,
            precoBase: base,
            custoOculto,
            despesasOcultas: ocultas,
            preco: base + custoOculto,
            precoMin: sv.precoMin,
            precoMed: sv.precoMed ?? base,
            precoMax: sv.precoMax,
            precoModo: modo,
            qtd: sv.qtd,
            unidade: sv.unidade
          });
        });
      }

      if (incluiMat) {
        (resultado.materiais || []).forEach((m) => {
          itens.push({
            id: uid("item"),
            refId: m.refId,
            tipo: "produto",
            nome: m.nome,
            preco: Number(m.preco) || 0,
            precoMin: m.precoMin,
            precoMed: m.precoMed ?? m.preco,
            precoMax: m.precoMax,
            precoModo: modo,
            qtd: m.qtd,
            unidade: m.unidade,
            precoBase: Number(m.preco) || 0,
            custoOculto: 0
          });
        });
      }

      if (!itens.length) return toast("Selecione materiais e/ou mão de obra");

      const c = resultado.circuitos;
      const data = {
        id: uid("orc"),
        codigo: nextCodigo("ORC", getState().orcamentos),
        clienteId: document.getElementById("ppCli").value,
        titulo: document.getElementById("ppTitulo").value.trim() || "Pré-projeto elétrico",
        data: todayISO(),
        validade: 15,
        prazo: "A definir após vistoria",
        desconto: 0,
        garantiaMeses: 3,
        formasPagamento: ["pix"],
        formaPagamentoObs: "",
        observacoes: [
          `Pré-projeto ${resultado.uso}. Circuitos estimados: ${c.total} (ilum. ${c.iluminacao.qtd}, TUG ${c.tug.qtd}, dedicados ${c.dedicados.qtd}, reserva ${c.reserva.qtd}). Quadro ~${c.quadroSugerido} polos.`,
          resultado.disclaimer
        ].join(" "),
        notaFiscal: document.getElementById("ppNotaFiscal")?.value || "a_definir",
        nfEmissorId:
          document.getElementById("ppNotaFiscal")?.value === "sim"
            ? document.getElementById("ppNfEmissor")?.value || "nf-propria"
            : "",
        nfEmissorNome:
          document.getElementById("ppNotaFiscal")?.value === "sim"
            ? getEmissorNf(document.getElementById("ppNfEmissor")?.value, getState())?.nome || ""
            : "",
        nfAliquota:
          document.getElementById("ppNotaFiscal")?.value === "sim"
            ? Number(getEmissorNf(document.getElementById("ppNfEmissor")?.value, getState())?.aliquota) || 0
            : 0,
        precoModo: modo,
        despesasObra: itens.some((i) => i.tipo === "servico") ? custoOcultoGlobal(getState()) : 0,
        itens: itens.map((i) => sanitizarItemOculto(i, getState())),
        status: "pendente",
        origem: "preprojeto"
      };

      Store.update({ orcamentos: [...getState().orcamentos, data] });
      closeModal();
      toast("Orçamento criado a partir do pré-projeto");
      navigate("orcamentos");
    };
  }

  function renderProjetoEletrico() {
    const projetos = getState().projetos || [];

    if (peEditingId) {
      if (peOpening) {
        content.innerHTML = `<div class="view-enter"><div class="empty">Sincronizando projeto…</div></div>`;
        return;
      }

      const mountEditor = (projeto) => {
        peOpening = false;
        if (!projeto) {
          peEditingId = null;
          toast("Projeto não encontrado");
          return renderProjetoEletrico();
        }
        content.innerHTML = `<div id="peRoot" class="view-enter"></div>`;
        ProjetoEletrico.mount(document.getElementById("peRoot"), {
          projeto,
          produtos: getState().produtos,
          servicos: getState().servicos,
          precoModo: getPrecoModo(),
          openModal,
          closeModal,
          toast,
          onSave: (next) => {
            const list = (getState().projetos || []).slice();
            const idx = list.findIndex((p) => p.id === next.id);
            const saved = { ...next, updatedAt: Date.now() };
            delete saved._stub;
            delete saved._cloudNewer;
            if (idx >= 0) list[idx] = saved;
            else list.push(saved);
            Store.update({ projetos: list });
          },
          onBack: () => {
            peEditingId = null;
            peOpening = false;
            render();
          },
          onCreateOrcamento: (proj, analise) => {
          if (!analise?.materiais?.length && !analise?.maoObra?.length) {
            return toast("Rode a análise antes");
          }
          const st = getState();
          const modo = getPrecoModo();
          const maoObra =
            analise.maoObra?.length
              ? analise.maoObra
              : sugerirServicosProjeto(proj, analise, st.servicos, modo);
          const nServ = maoObra.length;
          const nMat = (analise.materiais || []).length;
          const clientes = st.clientes;
          openModal(
            "Orçamento do projeto elétrico",
            `
            <div class="form-grid">
              <div class="field full"><label>Cliente</label>
                <select id="peOrcCli">
                  <option value="">— Sem cliente —</option>
                  ${clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}
                </select>
              </div>
              <div class="field full"><label>Título</label>
                <input id="peOrcTitulo" value="Projeto elétrico — ${proj.nome}" />
              </div>
              <p class="hint" style="grid-column:1/-1">${analise.circuits?.length || 0} circuitos · <strong>${nServ}</strong> serviços · <strong>${nMat}</strong> materiais (modelo VoltES / NBR 5410)</p>
            </div>
            `,
            `<button class="btn btn-secondary" id="peOrcCancel">Cancelar</button>
             <button class="btn btn-primary" id="peOrcOk">Criar orçamento</button>`
          );
          document.getElementById("peOrcCancel").onclick = closeModal;
          document.getElementById("peOrcOk").onclick = () => {
            const itensServ = (maoObra || []).map((m) => {
              const sv = st.servicos.find((x) => x.id === m.refId);
              const base = sv ? getPrecoByModo(sv, modo) : Number(m.preco || 0);
              const ocultas = sv
                ? despesasDoServico(sv.id, st).map((d) => ({
                    id: d.id,
                    nome: d.nome,
                    valor: Number(d.valor) || 0,
                    global: !!d.global
                  }))
                : [];
              const custoOculto = ocultas.reduce((t, d) => t + d.valor, 0);
              return {
                id: uid("item"),
                tipo: "servico",
                refId: m.refId || null,
                nome: m.nome,
                unidade: m.unidade || "un",
                qtd: Number(m.qtd) || 1,
                precoBase: base,
                custoOculto,
                despesasOcultas: ocultas,
                preco: base + custoOculto,
                precoMin: m.precoMin ?? sv?.precoMin,
                precoMed: m.precoMed ?? sv?.preco,
                precoMax: m.precoMax ?? sv?.precoMax,
                precoModo: modo,
                nota: m.nota || ""
              };
            });
            const itensMat = (analise.materiais || []).map((m) => {
              const prod = m.refId ? st.produtos.find((x) => x.id === m.refId) : null;
              const unit = prod ? getPrecoByModo(prod, modo) : Number(m.preco || 0);
              // Cabos no catálogo são rolo 100 m → preço/m já vem de analise (÷100)
              const precoUnit =
                m.unidade === "m" && m.preco != null && Number(m.preco) > 0
                  ? Number(m.preco)
                  : m.unidade === "m" && prod
                    ? unit / 100
                    : unit;
              return {
                id: uid("item"),
                tipo: "produto",
                refId: m.refId || null,
                nome: m.nome,
                unidade: m.unidade || "un",
                qtd: m.qtd,
                preco: precoUnit,
                precoMin: m.precoMin ?? prod?.precoMin,
                precoMed: m.precoMed ?? prod?.preco,
                precoMax: m.precoMax ?? prod?.precoMax,
                precoModo: modo,
                nota: m.nota || ""
              };
            });
            const itensAll = [...itensServ, ...itensMat].map((i) => sanitizarItemOculto(i, st));
            const data = {
              id: uid("orc"),
              codigo: `ORC-${Date.now().toString(36).toUpperCase()}`,
              clienteId: document.getElementById("peOrcCli").value || null,
              titulo: document.getElementById("peOrcTitulo").value.trim() || proj.nome,
              data: todayISO(),
              validade: 15,
              observacoes:
                `Gerado do projeto elétrico "${proj.nome}". Serviços e materiais conforme a planta (NBR 5410 auxiliar). ${analise.disclaimer || ""}`,
              nf: "nao",
              precoModo: modo,
              incluirMateriaisNoPdf: true,
              despesasObra: itensServ.length ? custoOcultoGlobal(st) : 0,
              itens: itensAll,
              status: "pendente",
              origem: "projeto-eletrico",
              projetoId: proj.id,
              updatedAt: Date.now()
            };
            Store.update({ orcamentos: [...getState().orcamentos, data] });
            closeModal();
            toast(`Orçamento criado · ${itensServ.length} serviços · ${itensMat.length} materiais`);
            peEditingId = null;
            peOpening = false;
            navigate("orcamentos");
            openOrcamentoForm(data);
          };
        }
        });
      };

      // Baixa a planta só ao abrir (se a nuvem estiver mais nova que o cache)
      peOpening = true;
      content.innerHTML = `<div class="view-enter"><div class="empty">Sincronizando projeto…</div></div>`;
      const localFallback = projetos.find((p) => p.id === peEditingId) || null;
      Store.ensureProjetoFromCloud(peEditingId)
        .then((projeto) => mountEditor(projeto))
        .catch((err) => {
          console.error(err);
          peOpening = false;
          toast("Falha ao baixar — abrindo cache local");
          mountEditor(localFallback);
        });
      return;
    }

    content.innerHTML = `
      <div class="view-enter">
        <div class="hero-note">
          <div>
            <h3>Projeto elétrico na planta</h3>
            <p>Desenhe a planta, coloque os pontos, trace os conduítes até o QDC e analise com critérios da <strong>NBR 5410</strong> (circuitos, bitolas, disjuntores e lista de materiais). Auxiliar — não substitui projeto assinado.</p>
            <div class="source-pill">NBR 5410 · residencial / comercial · conduítes manuais</div>
          </div>
          <button class="btn btn-primary" id="peNovo">+ Novo projeto</button>
        </div>
        <div class="card">
          ${
            projetos.length
              ? `<div class="table-wrap"><table>
                  <thead><tr><th>Nome</th><th>Uso</th><th>Pontos</th><th>Conduítes</th><th>Circuitos</th><th></th></tr></thead>
                  <tbody>
                    ${projetos
                      .slice()
                      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                      .map((p) => {
                        const nPts = p._stub ? p._indexPoints || 0 : (p.points || []).length;
                        const nCond = p._stub ? p._indexConduits || 0 : (p.conduits || []).length;
                        const nCirc = p._stub
                          ? p._indexCircuits || "—"
                          : p.lastAnalise?.circuits?.length || "—";
                        const badge = p._stub || p._cloudNewer ? ` <span class="hint">nuvem</span>` : "";
                        return `<tr>
                          <td><strong>${p.nome}</strong>${badge}<div class="hint">${p.criadoEm || ""}</div></td>
                          <td>${p.uso === "comercial" ? "Comercial" : "Residencial"}</td>
                          <td>${nPts}</td>
                          <td>${nCond}</td>
                          <td>${nCirc}</td>
                          <td class="actions-cell">
                            <button class="btn btn-secondary btn-sm" data-open="${p.id}">Abrir</button>
                            <button class="btn btn-ghost btn-sm" data-del="${p.id}">Excluir</button>
                          </td>
                        </tr>`;
                      })
                      .join("")}
                  </tbody>
                </table></div>`
              : `<div class="empty"><strong>Nenhum projeto</strong>Crie o primeiro para desenhar a planta no grid.</div>`
          }
        </div>
      </div>
    `;

    // Índice leve (nomes) — no máx. 1x a cada 30s nesta aba
    if (!renderProjetoEletrico._idxAt || Date.now() - renderProjetoEletrico._idxAt > 30000) {
      renderProjetoEletrico._idxAt = Date.now();
      Store.syncProjetosIndex()
        .then((r) => {
          if (r?.changed && currentView === "projeto" && !peEditingId) render();
        })
        .catch(() => {});
    }

    document.getElementById("peNovo").onclick = () => {
      openModal(
        "Novo projeto elétrico",
        `
        <div class="form-grid">
          <div class="field full"><label>Nome</label><input id="peNewNome" value="Residência — planta" /></div>
          <div class="field full"><label>Uso</label>
            <select id="peNewUso">
              <option value="residencial">Residencial</option>
              <option value="comercial">Comercial</option>
            </select>
          </div>
        </div>
        `,
        `<button class="btn btn-secondary" id="peNewCancel">Cancelar</button>
         <button class="btn btn-primary" id="peNewOk">Criar e abrir</button>`
      );
      document.getElementById("peNewCancel").onclick = closeModal;
      document.getElementById("peNewOk").onclick = () => {
        const p = ProjetoEletrico.createEmpty(
          document.getElementById("peNewNome").value.trim() || "Novo projeto",
          document.getElementById("peNewUso").value
        );
        Store.update({ projetos: [...(getState().projetos || []), p] });
        peEditingId = p.id;
        closeModal();
        render();
      };
    };

    content.querySelectorAll("[data-open]").forEach((btn) => {
      btn.onclick = () => {
        peEditingId = btn.dataset.open;
        render();
      };
    });
    content.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        if (!confirm("Excluir este projeto?")) return;
        Store.update({
          projetos: (getState().projetos || []).filter((p) => p.id !== btn.dataset.del)
        });
        render();
      };
    });
  }

  function renderDimNBR(box) {
    const tipo0 = NBR5410.tipoById("chuveiro");
    box.innerHTML = `
      <div class="hero-note" style="margin-bottom:16px">
        <div>
          <h3>Dimensionamento NBR 5410</h3>
          <p>Sugere cabo, disjuntor, DR e materiais com critérios brasileiros simplificados. Use como assistência — não substitui projeto assinado.</p>
          <div class="source-pill">NBR 5410 · cobre PVC 70 °C · método B1 (ref.)</div>
        </div>
      </div>
      <div class="grid grid-2" style="align-items:start;gap:16px">
        <div class="card">
          <div class="form-grid">
            <div class="field full"><label>Tipo de circuito</label>
              <select id="nbrTipo">
                ${NBR5410.tipos().map((t) => `<option value="${t.id}" ${t.id === "chuveiro" ? "selected" : ""}>${t.label}</option>`).join("")}
              </select>
            </div>
            <div class="field full" id="nbrTipoDesc" style="color:var(--text-dim);font-size:.82rem;margin-top:-8px">${tipo0.descricao}</div>
            <div class="field"><label>Potência (W)</label><input id="nbrP" type="number" value="${tipo0.potenciaPadrao || 2200}" /></div>
            <div class="field"><label>Tensão (V)</label><input id="nbrV" type="number" value="${tipo0.tensaoPadrao || 220}" /></div>
            <div class="field"><label>Comprimento ida (m)</label><input id="nbrL" type="number" value="18" step="0.5" /></div>
            <div class="field"><label>Fator de potência</label><input id="nbrFp" type="number" value="${tipo0.fp}" min="0.5" max="1" step="0.05" /></div>
            <div class="field"><label>Agrupamento</label>
              <select id="nbrAgr">${NBR5410.FATOR_AGRUPAMENTO.map((a) => `<option value="${a.id}">${a.label}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Temp. ambiente</label>
              <select id="nbrTemp">${NBR5410.FATOR_TEMP.map((a) => `<option value="${a.id}">${a.label}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Polos do disjuntor</label>
              <select id="nbrPolos">
                <option value="1">1P (fase + PE)</option>
                <option value="2" selected>2P (220 V típico)</option>
                <option value="3">3P (trifásico)</option>
              </select>
            </div>
            <div class="field"><label>DR / IDR 30 mA</label>
              <select id="nbrDr">
                <option value="auto">Automático (pela norma)</option>
                <option value="sim">Forçar sim</option>
                <option value="nao">Não incluir</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <button class="btn btn-primary" id="nbrCalc">Dimensionar</button>
            <button class="btn btn-secondary" id="nbrOrc" ${lastDimensionamento ? "" : "disabled"}>Enviar ao orçamento</button>
          </div>
        </div>
        <div class="card" id="nbrOut">
          <div class="empty"><strong>Resultado</strong>Preencha os dados e clique em Dimensionar.</div>
        </div>
      </div>
    `;

    const applyTipoDefaults = () => {
      const t = NBR5410.tipoById(document.getElementById("nbrTipo").value);
      document.getElementById("nbrTipoDesc").textContent = t.descricao;
      if (t.potenciaPadrao) document.getElementById("nbrP").value = t.potenciaPadrao;
      if (t.tensaoPadrao) document.getElementById("nbrV").value = t.tensaoPadrao;
      document.getElementById("nbrFp").value = t.fp;
      document.getElementById("nbrPolos").value = String(t.polos || 1);
    };
    document.getElementById("nbrTipo").onchange = applyTipoDefaults;

    const paintResult = (r) => {
      lastDimensionamento = r;
      const btnOrc = document.getElementById("nbrOrc");
      if (btnOrc) btnOrc.disabled = false;
      const quedaOk = r.queda.okTerminal;
      document.getElementById("nbrOut").innerHTML = `
        <h3 style="font-family:var(--display);margin-bottom:8px">${r.tipo.label}</h3>
        <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:14px">${r.disclaimer}</p>
        <div class="grid grid-2" style="gap:10px;margin-bottom:14px">
          <div class="calc-result" style="margin:0"><div class="label">Corrente de projeto (Ib)</div><div class="value" style="font-size:1.4rem">${r.ib.toFixed(2)} A</div></div>
          <div class="calc-result" style="margin:0"><div class="label">Cabo sugerido</div><div class="value" style="font-size:1.4rem">${r.cabo.secao} mm²</div></div>
          <div class="calc-result" style="margin:0"><div class="label">Disjuntor</div><div class="value" style="font-size:1.4rem">${r.disjuntor.In} A · ${r.disjuntor.polos}P · ${r.disjuntor.curva}</div></div>
          <div class="calc-result" style="margin:0"><div class="label">Queda de tensão</div><div class="value" style="font-size:1.4rem">${r.queda.pct.toFixed(2)}% ${quedaOk ? "✓" : "!"}</div></div>
        </div>
        <div style="font-size:.86rem;color:var(--text-muted);line-height:1.55;margin-bottom:12px">
          Iz cabo: ${r.cabo.iz.toFixed(1)} A · Iz corrigida (k=${r.entrada.k.toFixed(2)}): ${r.cabo.izCorrigida.toFixed(1)} A<br/>
          Cabo estimado: ~${r.metrosCabo.toFixed(0)} m (${r.nCondutores} condutores) · Eletroduto: ${r.eletroduto}<br/>
          DR: ${r.dr ? "recomendado / incluído na lista" : "não obrigatório neste tipo"}
        </div>
        ${r.avisos.length ? `<div style="background:rgba(255,193,77,.08);border:1px solid rgba(255,193,77,.25);border-radius:12px;padding:10px 12px;font-size:.82rem;color:var(--warn);margin-bottom:12px">${r.avisos.map((a) => `• ${a}`).join("<br/>")}</div>` : ""}
        <div id="nbrMats"></div>
      `;
      const s = getState();
      const mats = NBR5410.sugerirMateriais(r, s.produtos, getPrecoModo());
      const servs = NBR5410.sugerirServicos(r, s.servicos, getPrecoModo());
      r._materiais = mats;
      r._servicos = servs;
      const matBox = document.getElementById("nbrMats");
      const total = [...mats, ...servs].reduce((t, i) => t + i.qtd * i.preco, 0);
      matBox.innerHTML = `
        <h4 style="margin:8px 0 10px;font-family:var(--display)">Lista sugerida</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
            <tbody>
              ${[...mats, ...servs].map((i) => `
                <tr>
                  <td><strong>${i.nome}</strong>${i.nota ? `<div style="font-size:.75rem;color:var(--text-dim)">${i.nota}</div>` : ""}</td>
                  <td>${i.qtd} ${i.unidade || ""}</td>
                  <td>${money(i.preco)}</td>
                  <td>${money(i.qtd * i.preco)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap">
          <strong>Subtotal estimado: ${money(total)}</strong>
          <label style="font-size:.82rem;color:var(--text-muted);display:flex;gap:8px;align-items:center">
            <input type="checkbox" id="nbrIncluiServ" checked /> Incluir mão de obra sugerida
          </label>
        </div>
      `;
    };

    document.getElementById("nbrCalc").onclick = () => {
      const drSel = document.getElementById("nbrDr").value;
      const r = NBR5410.dimensionar({
        tipoId: document.getElementById("nbrTipo").value,
        potenciaW: Number(document.getElementById("nbrP").value),
        tensaoV: Number(document.getElementById("nbrV").value),
        comprimentoM: Number(document.getElementById("nbrL").value),
        fp: Number(document.getElementById("nbrFp").value),
        agrupamentoId: document.getElementById("nbrAgr").value,
        tempId: document.getElementById("nbrTemp").value,
        polos: Number(document.getElementById("nbrPolos").value),
        fases: Number(document.getElementById("nbrPolos").value) === 3 ? 3 : 1,
        dr: drSel === "auto" ? undefined : drSel === "sim"
      });
      paintResult(r);
      toast("Dimensionamento calculado");
    };

    document.getElementById("nbrOrc").onclick = () => {
      if (!lastDimensionamento) return toast("Calcule antes de enviar");
      enviarDimAoOrcamento(lastDimensionamento);
    };

    if (lastDimensionamento) paintResult(lastDimensionamento);
  }

  function enviarDimAoOrcamento(resultado) {
    const s = getState();
    if (!s.clientes.length) return toast("Cadastre um cliente primeiro");
    const incluiServ = document.getElementById("nbrIncluiServ")?.checked !== false;
    const mats = resultado._materiais || NBR5410.sugerirMateriais(resultado, s.produtos, getPrecoModo());
    const servs = incluiServ
      ? resultado._servicos || NBR5410.sugerirServicos(resultado, s.servicos, getPrecoModo())
      : [];

    openModal("Criar orçamento do dimensionamento", `
      <div class="form-grid">
        <div class="field full"><label>Cliente</label>
          <select id="dimCli">${s.clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}</select>
        </div>
        <div class="field full"><label>Título</label>
          <input id="dimTitulo" value="Circuito ${resultado.tipo.label} — ${resultado.cabo.secao} mm² / ${resultado.disjuntor.In} A" />
        </div>
        <div class="field"><label>Nota fiscal</label>
          <select id="dimNotaFiscal">
            <option value="a_definir">A definir</option>
            <option value="sim">Precisa de NF</option>
            <option value="nao">Sem NF</option>
          </select>
        </div>
        <div class="field" id="dimNfEmissorWrap" hidden>
          <label>Emissor da NF</label>
          <select id="dimNfEmissor">
            ${getEmissoresNf(s)
              .filter((e) => e.ativo !== false)
              .map(
                (e) =>
                  `<option value="${e.id}">${e.nome}${e.contato ? ` (${e.contato})` : ""} — ${Number(e.aliquota) || 0}%</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field full" style="color:var(--text-dim);font-size:.82rem">
          Serão adicionados ${mats.length} material(is)${incluiServ ? ` e ${servs.length} serviço(s)` : ""}.
          Despesas de obra (deslocamento/alimentação) entram 1× no total se houver serviços.
        </div>
      </div>
    `, `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="saveDimOrc">Criar orçamento</button>`);

    document.getElementById("dimNotaFiscal").onchange = () => {
      document.getElementById("dimNfEmissorWrap").hidden =
        document.getElementById("dimNotaFiscal").value !== "sim";
    };

    document.getElementById("cancelModal").onclick = closeModal;
    document.getElementById("saveDimOrc").onclick = () => {
      const modo = getPrecoModo();
      const itens = [];

      servs.forEach((sv) => {
        const ref = s.servicos.find((x) => x.id === sv.refId);
        const ocultas = ref
          ? despesasDoServico(ref.id, s).map((d) => ({
              id: d.id,
              nome: d.nome,
              valor: Number(d.valor) || 0,
              global: !!d.global
            }))
          : [];
        const custoOculto = ocultas.reduce((t, d) => t + d.valor, 0);
        const base = Number(sv.preco) || 0;
        itens.push({
          id: uid("item"),
          refId: sv.refId,
          tipo: "servico",
          nome: sv.nome,
          precoBase: base,
          custoOculto,
          despesasOcultas: ocultas,
          preco: base + custoOculto,
          precoMin: sv.precoMin,
          precoMed: sv.precoMed ?? base,
          precoMax: sv.precoMax,
          precoModo: modo,
          qtd: sv.qtd,
          unidade: sv.unidade
        });
      });

      mats.forEach((m) => {
        itens.push({
          id: uid("item"),
          refId: m.refId,
          tipo: "produto",
          nome: m.nome,
          preco: Number(m.preco) || 0,
          precoMin: m.precoMin,
          precoMed: m.precoMed ?? m.preco,
          precoMax: m.precoMax,
          precoModo: modo,
          qtd: m.qtd,
          unidade: m.unidade,
          precoBase: Number(m.preco) || 0,
          custoOculto: 0
        });
      });

      if (!itens.length) return toast("Nenhum item para o orçamento");

      const data = {
        id: uid("orc"),
        codigo: nextCodigo("ORC", getState().orcamentos),
        clienteId: document.getElementById("dimCli").value,
        titulo: document.getElementById("dimTitulo").value.trim() || "Dimensionamento NBR 5410",
        data: todayISO(),
        validade: 15,
        prazo: "7 dias",
        desconto: 0,
        garantiaMeses: 3,
        formasPagamento: ["pix"],
        formaPagamentoObs: "",
        observacoes: [
          `Dimensionamento auxiliar NBR 5410 — ${resultado.tipo.label}.`,
          `Ib ${resultado.ib.toFixed(2)} A · Cabo ${resultado.cabo.secao} mm² · Disjuntor ${resultado.disjuntor.In} A ${resultado.disjuntor.polos}P curva ${resultado.disjuntor.curva}.`,
          `Queda estimada ${resultado.queda.pct.toFixed(2)}%.`,
          resultado.disclaimer
        ].join(" "),
        notaFiscal: document.getElementById("dimNotaFiscal")?.value || "a_definir",
        nfEmissorId:
          document.getElementById("dimNotaFiscal")?.value === "sim"
            ? document.getElementById("dimNfEmissor")?.value || "nf-propria"
            : "",
        nfEmissorNome:
          document.getElementById("dimNotaFiscal")?.value === "sim"
            ? getEmissorNf(document.getElementById("dimNfEmissor")?.value, getState())?.nome || ""
            : "",
        nfAliquota:
          document.getElementById("dimNotaFiscal")?.value === "sim"
            ? Number(getEmissorNf(document.getElementById("dimNfEmissor")?.value, getState())?.aliquota) || 0
            : 0,
        precoModo: modo,
        despesasObra: itens.some((i) => i.tipo === "servico") ? custoOcultoGlobal(getState()) : 0,
        itens: itens.map((i) => sanitizarItemOculto(i, getState())),
        status: "pendente",
        origem: "nbr5410"
      };

      Store.update({ orcamentos: [...getState().orcamentos, data] });
      closeModal();
      toast("Orçamento criado a partir do dimensionamento");
      navigate("orcamentos");
    };
  }

  function renderContratos() {
    const s = getState();
    content.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-primary" id="btnNovoContrato">+ Novo contrato</button>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Título</th><th>Cliente</th><th>Mensal</th><th>Meses</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${s.contratos.length ? s.contratos.map((ct) => {
                const cli = s.clientes.find((c) => c.id === ct.clienteId);
                return `<tr>
                  <td>${ct.codigo}</td>
                  <td><strong>${ct.titulo}</strong></td>
                  <td>${cli?.nome || "—"}</td>
                  <td>${money(ct.valorMensal)}</td>
                  <td>${ct.meses}</td>
                  <td><span class="badge badge-${ct.status === "ativo" ? "ativo" : "inativo"}">${ct.status}</span></td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" data-pdf="${ct.id}">PDF</button>
                    <button class="btn btn-sm btn-danger" data-del="${ct.id}">Excluir</button>
                  </td>
                </tr>`;
              }).join("") : `<tr><td colspan="7"><div class="empty"><strong>Nenhum contrato</strong>Crie contratos de manutenção recorrente.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("btnNovoContrato").onclick = () => {
      const s0 = getState();
      openModal("Novo contrato", `
        <div class="form-grid">
          <div class="field full"><label>Cliente</label>
            <select id="ctCliente">${s0.clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}</select>
          </div>
          <div class="field full"><label>Título</label><input id="ctTitulo" value="Contrato de manutenção elétrica" /></div>
          <div class="field"><label>Valor mensal (R$)</label><input id="ctValor" type="number" step="0.01" value="350" /></div>
          <div class="field"><label>Duração (meses)</label><input id="ctMeses" type="number" value="12" /></div>
          <div class="field"><label>Dia pagamento</label><input id="ctDia" type="number" min="1" max="28" value="10" /></div>
          <div class="field"><label>Início</label><input id="ctInicio" type="date" value="${todayISO()}" /></div>
          <div class="field full"><label>Observações</label><textarea id="ctObs">Os serviços serão agendados com 48 horas de antecedência.</textarea></div>
        </div>
      `, `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="saveCt">Salvar</button>`);
      document.getElementById("cancelModal").onclick = closeModal;
      document.getElementById("saveCt").onclick = () => {
        const inicio = document.getElementById("ctInicio").value;
        const meses = Number(document.getElementById("ctMeses").value) || 12;
        const terminoDate = new Date(inicio);
        terminoDate.setMonth(terminoDate.getMonth() + meses);
        const data = {
          id: uid("ct"),
          codigo: nextCodigo("CTR", getState().contratos),
          clienteId: document.getElementById("ctCliente").value,
          titulo: document.getElementById("ctTitulo").value.trim(),
          valorMensal: Number(document.getElementById("ctValor").value) || 0,
          meses,
          diaPagamento: Number(document.getElementById("ctDia").value) || 10,
          inicio,
          termino: terminoDate.toISOString().slice(0, 10),
          observacoes: document.getElementById("ctObs").value.trim(),
          status: "ativo"
        };
        Store.update({ contratos: [...getState().contratos, data] });
        closeModal();
        toast("Contrato criado");
        render();
      };
    };

    content.querySelectorAll("[data-pdf]").forEach((btn) => {
      btn.onclick = async () => {
        const ct = getState().contratos.find((c) => c.id === btn.dataset.pdf);
        const cli = getState().clientes.find((c) => c.id === ct.clienteId);
        try {
          await PDF.preloadBrand();
          PDF.contrato(ct, cli, getState().empresa);
          toast("PDF do contrato gerado");
        } catch (e) {
          toast(e.message);
        }
      };
    });
    content.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        if (!confirm("Excluir contrato?")) return;
        Store.update({ contratos: getState().contratos.filter((c) => c.id !== btn.dataset.del) });
        render();
      };
    });
  }

  function renderNotasFiscais() {
    const s = getState();
    const list = getEmissoresNf(s);

    content.innerHTML = `
      <div class="view-enter">
      <div class="hero-note" style="margin-bottom:16px">
        <div>
          <h3>Emissores de nota fiscal</h3>
          <p>Cadastre a alíquota de cada emissor. No orçamento, ao marcar <strong>Precisa de NF</strong>, o percentual é <strong>embutido no total</strong> (cliente não vê o detalhe).</p>
        </div>
      </div>
      <div class="grid grid-2" style="gap:16px;align-items:start">
        ${list
          .map(
            (e) => `
          <div class="card">
            <div class="card-header">
              <div>
                <h3>${e.nome}</h3>
                <p>${e.contato ? `Contato: ${e.contato}` : "Emissor próprio"}</p>
              </div>
              <span class="badge badge-${e.ativo === false ? "rejeitado" : "aprovado"}">${
                e.ativo === false ? "off" : "ativo"
              }</span>
            </div>
            <div class="form-grid">
              <div class="field full"><label>Nome / identificação</label><input data-nf-id="${e.id}" data-nf-field="nome" value="${e.nome || ""}" /></div>
              <div class="field full"><label>Razão social</label><input data-nf-id="${e.id}" data-nf-field="razaoSocial" value="${e.razaoSocial || ""}" /></div>
              <div class="field"><label>CNPJ</label><input data-nf-id="${e.id}" data-nf-field="cnpj" value="${e.cnpj || ""}" /></div>
              <div class="field"><label>Alíquota NF (%)</label><input type="number" min="0" step="0.01" data-nf-id="${e.id}" data-nf-field="aliquota" value="${e.aliquota ?? 0}" /></div>
              ${
                e.id === "nf-impacto"
                  ? `<div class="field full"><label>Contato</label><input data-nf-id="${e.id}" data-nf-field="contato" value="${e.contato || "Sandro"}" /></div>`
                  : ""
              }
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" data-save-nf="${e.id}">Salvar</button>
              <button class="btn btn-secondary btn-sm" data-toggle-nf="${e.id}">${
                e.ativo === false ? "Ativar" : "Desativar"
              }</button>
            </div>
            <p style="margin-top:10px;font-size:.78rem;color:var(--text-dim)">Ex.: base R$ 1.000 + ${Number(
              e.aliquota || 0
            )}% = total cliente ${money(1000 * (1 + Number(e.aliquota || 0) / 100))}</p>
          </div>`
          )
          .join("")}
      </div>
      </div>
    `;

    content.querySelectorAll("[data-save-nf]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.saveNf;
        const campos = content.querySelectorAll(`[data-nf-id="${id}"]`);
        const patch = {};
        campos.forEach((inp) => {
          const f = inp.dataset.nfField;
          patch[f] = f === "aliquota" ? Number(inp.value) || 0 : inp.value.trim();
        });
        const next = getEmissoresNf(getState()).map((e) =>
          e.id === id ? { ...e, ...patch } : e
        );
        const updates = { emissoresNf: next };
        if (id === "nf-propria") {
          updates.empresa = {
            ...getState().empresa,
            aliquotaNf: patch.aliquota,
            ...(patch.razaoSocial ? { nome: getState().empresa.nome } : {}),
            ...(patch.cnpj != null ? { cnpj: patch.cnpj || getState().empresa.cnpj } : {})
          };
          if (patch.cnpj) updates.empresa.cnpj = patch.cnpj;
        }
        Store.update(updates);
        toast("Emissor de NF salvo");
        render();
      };
    });

    content.querySelectorAll("[data-toggle-nf]").forEach((btn) => {
      btn.onclick = () => {
        const next = getEmissoresNf(getState()).map((e) =>
          e.id === btn.dataset.toggleNf ? { ...e, ativo: e.ativo === false } : e
        );
        Store.update({ emissoresNf: next });
        render();
      };
    });
  }

  function renderEmpresa() {
    const e = getState().empresa;
    const propria = getEmissorNf("nf-propria", getState());
    const aliquota = e.aliquotaNf != null ? e.aliquotaNf : propria?.aliquota ?? 10;
    content.innerHTML = `
      <div class="view-enter">
      <div class="card" style="max-width:720px">
        <div class="card-header"><div><h3>Dados da empresa</h3><p>Esses dados aparecem automaticamente nos PDFs</p></div></div>
        <div class="form-grid">
          <div class="field full"><label>Nome da empresa</label><input id="eNome" value="${e.nome || ""}" /></div>
          <div class="field"><label>CNPJ</label><input id="eCnpj" value="${e.cnpj || ""}" /></div>
          <div class="field"><label>Telefone</label><input id="eTel" value="${e.telefone || ""}" /></div>
          <div class="field"><label>E-mail</label><input id="eEmail" value="${e.email || ""}" /></div>
          <div class="field"><label>Cidade</label><input id="eCidade" value="${e.cidade || ""}" /></div>
          <div class="field"><label>Estado</label><input id="eEstado" value="${e.estado || "ES"}" /></div>
          <div class="field full"><label>Endereço</label><input id="eEnd" value="${e.endereco || ""}" /></div>
          <div class="field"><label>Alíquota NF própria (%)</label><input id="eAliqNf" type="number" min="0" step="0.01" value="${aliquota}" /></div>
          <div class="field" style="display:flex;align-items:flex-end">
            <p style="font-size:.78rem;color:var(--text-dim);margin:0 0 8px">Usada quando o orçamento escolher <strong>Minha empresa</strong> como emissor. Detalhes em Notas fiscais.</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="saveEmpresa">Salvar dados</button>
          <button class="btn btn-secondary" id="refreshCatalog">Atualizar tabela de preços</button>
          <button class="btn btn-danger" id="resetData">Restaurar sistema</button>
        </div>
        <p style="margin-top:14px;color:var(--text-dim);font-size:.82rem">“Atualizar tabela de preços” recarrega serviços e materiais com as médias ES 2026, sem apagar clientes/orçamentos.</p>
      </div>
      </div>
    `;
    document.getElementById("saveEmpresa").onclick = () => {
      const aliquotaNf = Number(document.getElementById("eAliqNf").value) || 0;
      const empresa = {
        nome: document.getElementById("eNome").value.trim(),
        cnpj: document.getElementById("eCnpj").value.trim(),
        telefone: document.getElementById("eTel").value.trim(),
        email: document.getElementById("eEmail").value.trim(),
        cidade: document.getElementById("eCidade").value.trim(),
        estado: document.getElementById("eEstado").value.trim(),
        endereco: document.getElementById("eEnd").value.trim(),
        logo: e.logo || "",
        aliquotaNf
      };
      const emissoresNf = getEmissoresNf(getState()).map((em) =>
        em.id === "nf-propria"
          ? {
              ...em,
              razaoSocial: empresa.nome || em.razaoSocial,
              cnpj: empresa.cnpj || em.cnpj,
              aliquota: aliquotaNf
            }
          : em
      );
      Store.update({ empresa, emissoresNf });
      toast("Dados da empresa salvos");
    };
    document.getElementById("refreshCatalog").onclick = () => {
      Store.refreshCatalog();
      toast("Catálogo de preços atualizado");
    };
    document.getElementById("resetData").onclick = () => {
      if (!confirm("Isso apaga orçamentos, clientes e lançamentos e restaura o catálogo padrão. Continuar?")) return;
      Store.reset();
      toast("Sistema restaurado");
      render();
    };
  }

  function render() {
    const meta = PAGE_META[currentView];
    pageTitle.textContent = meta.title;
    pageSubtitle.textContent = meta.subtitle;
    syncPrecoModoUI();
    if (chartInstance && currentView !== "dashboard") {
      chartInstance.destroy();
      chartInstance = null;
    }
    const map = {
      dashboard: renderDashboard,
      clientes: renderClientes,
      orcamentos: renderOrcamentos,
      servicos: renderServicos,
      produtos: renderProdutos,
      financeiro: renderFinanceiro,
      calculadoras: renderCalculadoras,
      projeto: renderProjetoEletrico,
      contratos: renderContratos,
      notas: renderNotasFiscais,
      empresa: renderEmpresa
    };
    try {
      map[currentView]();
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || err || "Erro ao renderizar a tela");
      content.innerHTML = `<div class="view-enter"><div class="empty">Erro ao abrir esta aba. Recarregue a página.</div></div>`;
      toast(msg);
    }
    refreshIcons();
  }

  function setSidebarOpen(open) {
    sidebar.classList.toggle("open", open);
    document.body.classList.toggle("sidebar-open", open);
    const scrim = document.getElementById("sidebarScrim");
    if (scrim) scrim.hidden = !open;
  }

  function navigate(view) {
    currentView = view;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    setSidebarOpen(false);
    render();
  }

  // Events
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(btn.dataset.view);
    });
  });
  document.getElementById("precoModoSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-modo]");
    if (!btn) return;
    setPrecoModo(btn.dataset.modo);
  });
  document.getElementById("modalClose").onclick = closeModal;
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.getElementById("menuToggle").onclick = () => {
    setSidebarOpen(!sidebar.classList.contains("open"));
  };
  document.getElementById("sidebarScrim")?.addEventListener("click", () => setSidebarOpen(false));
  document.getElementById("quickOrcamento").onclick = () => openOrcamentoForm();
  document.getElementById("globalSearch").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (["clientes", "orcamentos", "servicos", "produtos"].includes(currentView)) render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      setSidebarOpen(false);
    }
  });

  // Boot
  function syncAppVersionUI() {
    const el = document.getElementById("appVersion");
    if (!el) return;
    const ver = typeof APP_VERSION !== "undefined" ? APP_VERSION : "—";
    const cache = typeof CACHE_VERSION !== "undefined" ? CACHE_VERSION : "";
    el.textContent = `v${ver}`;
    el.title = cache ? `App v${ver} · cache ${cache}` : `App v${ver}`;
    const meta = document.querySelector('meta[name="voltes-version"]');
    if (meta) meta.setAttribute("content", ver);
  }

  function updateSyncChip() {
    const chip = document.getElementById("syncChip");
    const label = document.getElementById("syncLabel");
    if (!chip || !label) return;
    const status = Store.getStatus();
    chip.className = `sync-chip ${status}`;
    const map = {
      online: "Nuvem conectada",
      syncing: "Sincronizando…",
      local: "Só neste aparelho",
      offline: "Sem conexão Firebase",
      error: "Erro na nuvem"
    };
    label.textContent = map[status] || status;
  }

  let storeRenderTimer = null;
  window.addEventListener("voltes:store", (e) => {
    updateSyncChip();
    // Evita “reload” da tela a cada ping de sync/status
    if (e.detail?.stateChanged === false) return;
    // Não remonta o editor de planta a cada autosave (senão some seleção/painel)
    if (currentView === "projeto" && peEditingId) return;
    clearTimeout(storeRenderTimer);
    storeRenderTimer = setTimeout(() => render(), 60);
  });

  function syncThemeToggleUI() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const dark = getTheme() === "dark";
    const iconDark = btn.querySelector(".theme-icon-dark");
    const iconLight = btn.querySelector(".theme-icon-light");
    if (iconDark) iconDark.hidden = !dark;
    if (iconLight) iconLight.hidden = dark;
    btn.title = dark ? "Mudar para tema claro" : "Mudar para tema escuro";
  }

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const t = cycleTheme();
    syncThemeToggleUI();
    toast?.(t === "dark" ? "Tema escuro" : "Tema claro");
  });
  window.addEventListener("voltes-theme", () => syncThemeToggleUI());
  syncThemeToggleUI();

  updateSyncChip();
  syncAppVersionUI();
  navigate("dashboard");
  if (typeof PDF !== "undefined" && PDF.preloadBrand) PDF.preloadBrand();

  Store.initCloud().then(() => {
    updateSyncChip();
    render();
  });

}
