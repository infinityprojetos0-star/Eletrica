/**
 * PDF VoltES
 * Orçamento: HTML/CSS → html2canvas + jsPDF (1 página A4, sem carimbar modelo)
 */
const PDF = (() => {
  const C = {
    primary: "#0B2D5C",
    secondary: "#FF8A00",
    text: "#1B1B1B",
    border: "#D9D9D9",
    tableLine: "#E5E7EB",
    muted: "#6B7280"
  };

  const FONT = "Inter";
  let fontsReady = false;

  /** A4 @ 96dpi */
  const A4_W = 794;
  const A4_H = 1123;

  function ensureJsPdf() {
    if (!window.jspdf) throw new Error("jsPDF ainda não carregou. Tente novamente.");
    return window.jspdf.jsPDF;
  }

  function ensureHtml2Canvas() {
    const h2c = window.html2canvas;
    if (typeof h2c !== "function") {
      throw new Error("html2canvas não carregou. Recarregue a página (Ctrl+Shift+R).");
    }
    return h2c;
  }

  function registerFonts(doc) {
    if (typeof PDF_FONT_REGULAR === "undefined" || typeof PDF_FONT_BOLD === "undefined") {
      fontsReady = false;
      return false;
    }
    try {
      doc.addFileToVFS("Inter-Regular.ttf", PDF_FONT_REGULAR);
      doc.addFileToVFS("Inter-Bold.ttf", PDF_FONT_BOLD);
      doc.addFont("Inter-Regular.ttf", FONT, "normal");
      doc.addFont("Inter-Bold.ttf", FONT, "bold");
      fontsReady = true;
      return true;
    } catch {
      fontsReady = false;
      return false;
    }
  }

  function preloadBrand() {
    return Promise.resolve();
  }

  function logoUrl() {
    return typeof PDF_LOGO_ORC !== "undefined" ? PDF_LOGO_ORC : "";
  }

  function logoDarkUrl() {
    return typeof PDF_LOGO_DARK !== "undefined" ? PDF_LOGO_DARK : "";
  }

  function fontFaceCss() {
    if (typeof PDF_FONT_REGULAR === "undefined") return "";
    return `
@font-face{font-family:'InterPdf';src:url(data:font/ttf;base64,${PDF_FONT_REGULAR}) format('truetype');font-weight:400;font-style:normal;}
@font-face{font-family:'InterPdf';src:url(data:font/ttf;base64,${PDF_FONT_BOLD}) format('truetype');font-weight:700;font-style:normal;}
`;
  }

  const ICONS = {
    user: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    wrench: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`,
    cart: `<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>`,
    dollar: `<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>`,
    chat: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`,
    shield: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
    phone: `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>`,
    zap: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
    file: `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`,
    building: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`,
    badge: `<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>`,
    headset: `<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>`,
    cog: `<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>`
  };

  function svgIcon(name, px = 14) {
    const inner = ICONS[name] || ICONS.wrench;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  function badge(name, round) {
    const r = round ? "50%" : "5px";
    return `<span class="ve-badge" style="border-radius:${r}">${svgIcon(name, 14)}</span>`;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tableBlock(items, count) {
    let rows = "";
    for (let i = 0; i < count; i++) {
      const it = items[i];
      const qtd =
        it && it.qtd !== "" && it.qtd != null
          ? `${it.qtd}${it.unidade ? ` ${it.unidade}` : ""}`
          : "";
      rows += `<div class="ve-trow">
        <div class="item"><span class="cell-txt c">${String(i + 1).padStart(2, "0")}</span></div>
        <div class="desc"><span class="cell-txt">${it ? esc(it.nome) : ""}</span></div>
        <div class="qty"><span class="cell-txt c">${esc(qtd)}</span></div>
      </div>`;
    }
    return `<div class="ve-tbl">
      <div class="ve-thead">
        <div class="item"><span class="cell-txt">ITEM</span></div>
        <div class="desc"><span class="cell-txt">DESCRIÇÃO</span></div>
        <div class="qty"><span class="cell-txt">QUANTIDADE</span></div>
      </div>
      ${rows}
    </div>`;
  }

  function obsLines(text) {
    const parts = String(text || "")
      .split(/\r?\n/)
      .concat(["", "", "", ""])
      .slice(0, 4);
    return parts.map((l) => `<div class="obs-line">${esc(l)}</div>`).join("");
  }

  function makeBannerBg(w, h) {
    const dpr = 2;
    const c = document.createElement("canvas");
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);

    const topCut = w * 0.17;
    const tipR = 5; // arredondamento sutil

    function trapPath(ox, oy) {
      ctx.beginPath();
      ctx.moveTo(topCut + ox, oy);
      ctx.lineTo(w + ox, oy);
      ctx.lineTo(w + ox, h + oy);
      ctx.lineTo(tipR + 1 + ox, h + oy);
      ctx.quadraticCurveTo(ox, h + oy, ox, h - tipR + oy);
      ctx.lineTo(topCut + ox, oy);
      ctx.closePath();
    }

    // Laranja atrás = sombra do azul
    ctx.fillStyle = C.secondary;
    trapPath(-7, 5);
    ctx.fill();

    // Azul na frente
    ctx.fillStyle = C.primary;
    trapPath(0, 0);
    ctx.fill();

    return c.toDataURL("image/png");
  }

  function buildCss() {
    const mx = 40;
    return `
${fontFaceCss()}
#voltes-pdf-host,#voltes-pdf-host *{box-sizing:border-box;}
#voltes-pdf-host{
  position:fixed;left:0;top:0;width:${A4_W}px;height:${A4_H}px;
  margin:0;padding:0;background:#fff;overflow:hidden;
  z-index:2147483646;pointer-events:none;
}
.ve-page{
  width:${A4_W}px;height:${A4_H}px;margin:0;padding:0;
  font-family:'InterPdf',Inter,Arial,Helvetica,sans-serif;color:${C.text};background:#fff;
  position:relative;overflow:hidden;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.ve-page-inner{
  display:flex;flex-direction:column;
  height:${A4_H - 52}px;padding-bottom:6px;box-sizing:border-box;
}
.ve-hdr{position:relative;height:120px;width:100%;background:#fff;flex-shrink:0;}
.ve-logo-wrap{position:absolute;left:20px;top:4px;width:370px;}
.ve-logo{
  height:102px;width:auto;max-width:365px;
  object-fit:contain;object-position:left center;display:block;
}
.ve-logo-sub{
  margin-top:1px;display:flex;align-items:center;gap:5px;
  font-size:7.5px;font-weight:700;letter-spacing:0.5px;color:${C.primary};text-transform:uppercase;
}
.ve-logo-sub .ln{flex:1;height:1px;background:${C.border};}
.ve-logo-sub .tx{white-space:nowrap;padding:0 3px;}

.ve-banner{position:absolute;top:0;right:0;width:380px;height:120px;overflow:hidden;}
.ve-banner-img{position:absolute;inset:0;width:100%;height:100%;display:block;}
.ve-banner-txt{position:absolute;inset:0;padding:14px 24px 10px 80px;color:#fff;z-index:2;}
.ve-banner-txt h1{
  margin:0 0 7px;font-size:28px;font-weight:700;letter-spacing:0.7px;
  line-height:1;text-align:left;color:#fff;
}
.ve-banner-txt p{margin:0 0 3px;font-size:11px;font-weight:400;line-height:1.25;text-align:left;color:#fff;}
.ve-banner-txt .val{font-size:9.5px;margin-top:2px;}

.ve-main{padding:4px ${mx}px 0;flex:1;display:flex;flex-direction:column;min-height:0;}

.ve-box{
  border:1px solid ${C.border};border-radius:6px;background:#fff;
  margin-bottom:5px;overflow:visible;position:relative;
}
.ve-box-pad{padding:5px 9px 6px;}
.ve-box-tbl{padding:0;overflow:visible;}
.ve-box-tbl .ve-title{padding:5px 9px 3px;margin:0;}

.ve-badge{
  display:inline-flex;align-items:center;justify-content:center;
  width:18px;height:18px;background:${C.primary};color:#fff;flex-shrink:0;
}
.ve-title{
  display:flex;align-items:center;gap:6px;
  font-size:10px;font-weight:700;color:${C.primary};
  letter-spacing:0.3px;text-transform:uppercase;margin-bottom:3px;line-height:18px;
}

.ve-fields{display:flex;flex-direction:column;gap:2px;}
.ve-field{display:flex;align-items:flex-end;gap:5px;font-size:9px;min-height:14px;}
.ve-field label{
  font-weight:700;color:${C.text};white-space:nowrap;text-transform:uppercase;
  line-height:1;padding-bottom:2px;
}
.ve-field .line{
  flex:1;border-bottom:1px solid ${C.border};
  padding:0 3px 2px;font-weight:400;font-size:10px;color:${C.text};line-height:1.05;min-height:13px;
}
.ve-row2{display:flex;gap:10px;}
.ve-row2 .ve-field{flex:1;}

/* Células com padding interno — texto não cola/corta na linha */
.ve-tbl{margin:0 8px 7px;border:1px solid ${C.tableLine};border-radius:4px;overflow:visible;}
.ve-thead{
  display:flex;height:24px;background:${C.primary};color:#fff;
  border-radius:3px 3px 0 0;
}
.ve-thead > div{
  display:flex;align-items:center;justify-content:center;
  height:24px;box-sizing:border-box;padding:0 4px;
}
.ve-trow{
  display:flex;align-items:center;height:20px;
  border-top:1px solid ${C.tableLine};background:#fff;
}
.ve-trow > div{
  display:flex;align-items:center;height:20px;
  box-sizing:border-box;padding:0 5px;min-width:0;
}
.ve-trow .desc{justify-content:flex-start;}
.ve-trow .item,.ve-trow .qty,.ve-thead .item,.ve-thead .qty{justify-content:center;}
.cell-txt{
  display:block;width:100%;
  font-size:9px;line-height:1.25;font-weight:400;
  color:${C.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.ve-thead .cell-txt{
  color:#fff;font-weight:700;font-size:9px;line-height:1;text-align:center;
}
.cell-txt.c{color:${C.primary};font-weight:600;text-align:center;}
.ve-thead .item,.ve-trow .item{width:12%;flex-shrink:0;}
.ve-thead .desc,.ve-trow .desc{width:62%;flex:1;min-width:0;}
.ve-thead .qty,.ve-trow .qty{width:26%;flex-shrink:0;}
.ve-push{flex:1 1 auto;min-height:10px;}

.ve-2col{display:flex;gap:5px;margin-bottom:5px;}
.ve-2col > *{flex:1;min-width:0;}

.ve-pay{display:flex;flex-wrap:wrap;gap:2px 10px;margin:2px 0 3px;font-size:8px;}
.ve-chk{display:flex;align-items:center;gap:4px;color:${C.text};width:42%;}
.ve-chk.wide{width:100%;}
.ve-chk .box{
  width:9px;height:9px;border:1.5px solid ${C.primary};
  display:inline-flex;align-items:center;justify-content:center;
  flex-shrink:0;background:#fff;font-size:7px;line-height:1;color:${C.secondary};font-weight:700;
}
.ve-forma{font-size:8px;color:${C.muted};margin-top:1px;border-bottom:1px solid ${C.border};padding-bottom:1px;}
.obs-line{border-bottom:1px solid ${C.border};min-height:10px;margin-top:5px;font-size:9px;color:${C.text};}
.ve-garantia{font-size:7.5px;line-height:1.28;color:${C.text};font-weight:400;margin:2px 0 0;}

.ve-total{
  border:1.2px solid ${C.secondary};border-radius:8px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:54px;padding:6px 8px;background:#fff;
}
.ve-total .lbl{font-size:9px;font-weight:700;color:${C.primary};letter-spacing:0.25px;margin-bottom:4px;}
.ve-total .val{
  font-size:20px;font-weight:700;color:${C.secondary};line-height:1.15;
  white-space:nowrap;text-align:center;
}

.ve-sign{display:flex;gap:36px;margin:4px 4px 2px;padding:0;flex-shrink:0;}
.ve-sign .col{flex:1;text-align:center;}
.ve-sign .hline{border-top:1.5px solid ${C.primary};margin-bottom:3px;}
.ve-sign .t{font-size:8px;font-weight:700;color:${C.text};}
.ve-sign .navy{color:${C.primary};}
.ve-sign .sub{font-size:8px;font-weight:700;margin-top:2px;color:${C.text};}

.ve-contact{
  margin:4px ${mx}px 0;padding-top:5px;flex-shrink:0;
  border-top:1.5px solid ${C.secondary};
  display:flex;align-items:center;
}
.ve-contact .left,.ve-contact .right{
  flex:1;display:flex;align-items:center;gap:6px;padding:3px 10px;min-height:26px;
}
.ve-contact .left{justify-content:center;border-right:1px solid ${C.border};}
.ve-contact .right{justify-content:flex-start;}
.ve-contact .pi{color:${C.primary};display:flex;}
.ve-contact .fone{font-size:13px;font-weight:700;color:${C.primary};}
.ve-contact .bolt{display:flex;}
.ve-contact .slogan{font-size:9px;font-weight:700;color:${C.primary};line-height:1.2;}
.ve-contact .slogan b{color:${C.secondary};font-size:10px;}

/* Rodapé sempre na base da folha, largura total */
.ve-foot{
  position:absolute;left:0;right:0;bottom:0;
  width:100%;margin:0;height:52px;
  background:${C.primary};color:#fff;
  display:flex;align-items:center;justify-content:stretch;
  border-radius:0;
}
.ve-foot .cell{
  flex:1;display:flex;align-items:center;justify-content:center;gap:7px;
  padding:0 4px;height:100%;
  border-right:1px solid rgba(255,255,255,0.28);
}
.ve-foot .cell:last-child{border-right:none;}
.ve-foot .fi{flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;}
.ve-foot .fi svg{width:16px;height:16px;}
.ve-foot .ft{
  font-size:7.5px;font-weight:700;line-height:1.15;letter-spacing:0.15px;
  text-transform:uppercase;text-align:left;
}
`;
  }

  function buildPageHtml(orc, cliente, empresa, bannerUrl) {
    const servicos = (orc.itens || []).filter((i) => i.tipo === "servico");
    const materiais = (orc.itens || []).filter((i) => i.tipo !== "servico");
    const formas = orc.formasPagamento || [];
    const mark = (id) => (formas.includes(id) ? "✓" : "");

    const state = typeof getState === "function" ? getState() : undefined;
    const total =
      typeof orcamentoTotalComNf === "function"
        ? orcamentoTotalComNf(orc, state)
        : Math.max(
            0,
            (orc.itens || []).reduce((s, i) => s + Number(i.qtd || 0) * Number(i.preco || 0), 0) -
              Number(orc.desconto || 0)
          );
    const totalLabel =
      typeof money === "function"
        ? money(total)
        : `R$ ${Number(total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const fone = empresa?.telefone || "(27) 99617-5219";
    const garantiaMeses = orc.garantiaMeses || 3;
    const validade = orc.validade != null ? orc.validade : 15;

    return `
<div class="ve-page">
  <div class="ve-page-inner">
  <div class="ve-hdr">
    <div class="ve-logo-wrap">
      <img class="ve-logo" src="${logoUrl()}" alt="voltES" crossorigin="anonymous"/>
      <div class="ve-logo-sub"><span class="ln"></span><span class="tx">RESIDENCIAL E COMERCIAL</span><span class="ln"></span></div>
    </div>
    <div class="ve-banner">
      <img class="ve-banner-img" src="${bannerUrl}" alt=""/>
      <div class="ve-banner-txt">
        <h1>ORÇAMENTO</h1>
        <p>Nº: ${esc(orc.codigo || "—")}</p>
        <p>DATA: ${esc(formatDate(orc.data))}</p>
        <p class="val">VALIDADE DA PROPOSTA: ${esc(validade)} DIAS</p>
      </div>
    </div>
  </div>

  <div class="ve-main">
    <div class="ve-box ve-box-pad">
      <div class="ve-title">${badge("user", true)} DADOS DO CLIENTE</div>
      <div class="ve-fields">
        <div class="ve-field"><label>NOME / EMPRESA</label><div class="line">${esc(cliente?.nome)}</div></div>
        <div class="ve-field"><label>CPF / CNPJ</label><div class="line">${esc(cliente?.documento)}</div></div>
        <div class="ve-row2">
          <div class="ve-field"><label>TELEFONE</label><div class="line">${esc(cliente?.telefone)}</div></div>
          <div class="ve-field"><label>E-MAIL</label><div class="line">${esc(cliente?.email)}</div></div>
        </div>
        <div class="ve-field"><label>ENDEREÇO DA OBRA</label><div class="line">${esc(cliente?.endereco || orc.enderecoObra)}</div></div>
      </div>
    </div>

    <div class="ve-box ve-box-tbl">
      <div class="ve-title">${badge("wrench", false)} DESCRIÇÃO DOS SERVIÇOS</div>
      ${tableBlock(servicos, 10)}
    </div>

    <div class="ve-box ve-box-tbl">
      <div class="ve-title">${badge("cart", false)} MATERIAIS E EQUIPAMENTOS</div>
      ${tableBlock(materiais, 10)}
    </div>

    <div class="ve-2col">
      <div class="ve-box ve-box-pad">
        <div class="ve-title">${badge("dollar", false)} CONDIÇÕES DE PAGAMENTO</div>
        <div class="ve-pay">
          <div class="ve-chk"><span class="box">${mark("pix")}</span>PIX</div>
          <div class="ve-chk"><span class="box">${mark("boleto")}</span>BOLETO</div>
          <div class="ve-chk"><span class="box">${mark("dinheiro")}</span>DINHEIRO</div>
          <div class="ve-chk"><span class="box">${mark("cartao")}</span>CARTÃO</div>
          <div class="ve-chk wide"><span class="box">${mark("transferencia")}</span>TRANSFERÊNCIA BANCÁRIA</div>
        </div>
        <div class="ve-forma">FORMA DE PAGAMENTO: ${esc(orc.formaPagamentoObs || "____________________")}</div>
      </div>
      <div class="ve-box ve-box-pad">
        <div class="ve-title">${badge("chat", false)} OBSERVAÇÕES</div>
        ${obsLines(orc.observacoes)}
      </div>
    </div>

    <div class="ve-2col" style="margin-bottom:0">
      <div class="ve-box ve-box-pad">
        <div class="ve-title">${badge("shield", false)} GARANTIA</div>
        <p class="ve-garantia">A VoltES garante a execução dos serviços conforme as normas técnicas vigentes (NBR 5410), utilizando materiais de qualidade e mão de obra especializada. O prazo de garantia dos serviços executados será de <strong>${garantiaMeses}</strong> meses, não abrangendo danos decorrentes de mau uso, intervenções de terceiros ou causas externas.</p>
      </div>
      <div class="ve-total">
        <div class="lbl">VALOR TOTAL DA PROPOSTA</div>
        <div class="val">${esc(totalLabel)}</div>
      </div>
    </div>

    <div class="ve-push"></div>

    <div class="ve-sign">
      <div class="col">
        <div class="hline"></div>
        <div class="t">ASSINATURA DO CLIENTE</div>
        <div class="sub">DATA: ____ / ____ / ________</div>
      </div>
      <div class="col">
        <div class="hline"></div>
        <div class="t navy">VOLTES INSTALAÇÕES • MANUTENÇÃO • ELÉTRICA</div>
        <div class="sub navy">RESPONSÁVEL TÉCNICO</div>
      </div>
    </div>
  </div>

  <div class="ve-contact">
    <div class="left">
      <span class="pi">${svgIcon("phone", 14)}</span>
      <span class="fone">${esc(fone)}</span>
    </div>
    <div class="right">
      <span class="bolt"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path fill="${C.secondary}" d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg></span>
      <div class="slogan">ENERGIA QUE CONECTA,<br/>QUALIDADE QUE <b>TRANSFORMA.</b></div>
    </div>
  </div>
  </div>

  <div class="ve-foot">
    <div class="cell"><span class="fi">${svgIcon("zap", 16)}</span><span class="ft">INSTALAÇÕES<br/>ELÉTRICAS</span></div>
    <div class="cell"><span class="fi">${svgIcon("cog", 16)}</span><span class="ft">MANUTENÇÃO<br/>PREVENTIVA</span></div>
    <div class="cell"><span class="fi">${svgIcon("file", 16)}</span><span class="ft">PROJETOS<br/>ELÉTRICOS</span></div>
    <div class="cell"><span class="fi">${svgIcon("building", 16)}</span><span class="ft">ADEQUAÇÃO<br/>NBR 5410</span></div>
    <div class="cell"><span class="fi">${svgIcon("badge", 16)}</span><span class="ft">SEGURANÇA E<br/>QUALIDADE</span></div>
    <div class="cell"><span class="fi">${svgIcon("headset", 16)}</span><span class="ft">ATENDIMENTO<br/>ESPECIALIZADO</span></div>
  </div>
</div>`;
  }

  async function orcamento(orc, cliente, empresa) {
    const html2canvas = ensureHtml2Canvas();
    const jsPDF = ensureJsPdf();

    document.getElementById("voltes-pdf-host")?.remove();
    document.getElementById("voltes-pdf-style")?.remove();

    const bannerUrl = makeBannerBg(380, 120);

    const styleEl = document.createElement("style");
    styleEl.id = "voltes-pdf-style";
    styleEl.textContent = buildCss();
    document.head.appendChild(styleEl);

    const host = document.createElement("div");
    host.id = "voltes-pdf-host";
    host.setAttribute("aria-hidden", "true");
    host.style.opacity = "0.01";
    host.innerHTML = buildPageHtml(orc, cliente, empresa, bannerUrl);
    document.body.appendChild(host);

    const page = host.querySelector(".ve-page");
    if (!page) {
      host.remove();
      styleEl.remove();
      throw new Error("Falha ao montar o layout do orçamento.");
    }

    try {
      if (document.fonts?.ready) await document.fonts.ready;
    } catch {
      /* ignore */
    }
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 220)));

    const prevX = window.scrollX;
    const prevY = window.scrollY;
    window.scrollTo(0, 0);

    try {
      // Captura a página A4 fixa (sem scale — scale cortava o rodapé)
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: A4_W,
        height: A4_H,
        windowWidth: A4_W,
        windowHeight: A4_H,
        scrollX: 0,
        scrollY: 0,
        onclone: (doc) => {
          const h = doc.getElementById("voltes-pdf-host");
          if (h) {
            h.style.opacity = "1";
            h.style.left = "0";
            h.style.top = "0";
          }
          const p = doc.querySelector(".ve-page");
          if (p) {
            p.style.transform = "none";
            p.style.width = `${A4_W}px`;
            p.style.height = `${A4_H}px`;
          }
        }
      });

      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      doc.save(`${orc.codigo || "orcamento"}.pdf`);
    } finally {
      window.scrollTo(prevX, prevY);
      host.remove();
      styleEl.remove();
    }
  }

  function headerLegacy(doc, empresa, titulo, subtitulo) {
    doc.setFillColor(11, 45, 92);
    doc.rect(0, 0, 210, 30, "F");
    if (logoDarkUrl()) {
      try {
        doc.addImage(logoDarkUrl(), "PNG", 10, 2, 26, 26);
      } catch {
        /* ignore */
      }
    }
    doc.setFont(fontsReady ? FONT : "helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(titulo, 196, 14, { align: "right" });
    if (subtitulo) {
      doc.setFont(fontsReady ? FONT : "helvetica", "normal");
      doc.setFontSize(9);
      doc.text(subtitulo, 196, 22, { align: "right" });
    }
  }

  function contrato(contrato, cliente, empresa) {
    const jsPDF = ensureJsPdf();
    const doc = new jsPDF();
    registerFonts(doc);
    headerLegacy(doc, empresa, "CONTRATO", contrato.codigo || "");
    let y = 46;
    doc.setFont(fontsReady ? FONT : "helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(11, 45, 92);
    doc.text(contrato.titulo || "Contrato de manutenção elétrica", 14, y);
    y += 12;
    doc.setFont(fontsReady ? FONT : "helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(27, 27, 27);
    [
      `Contratante: ${cliente?.nome || "—"}; Documento: ${cliente?.documento || "—"}.`,
      `Contratada: ${empresa?.nome || "VoltES"}; Contato: ${empresa?.telefone || "—"}.`,
      `Objeto: ${contrato.titulo || "manutenção elétrica preventiva e corretiva"}.`,
      `Vigência: ${formatDate(contrato.inicio)} a ${formatDate(contrato.termino)} (${contrato.meses || 12} meses).`,
      `Valor mensal: ${money(contrato.valorMensal)}. Pagamento até o dia ${contrato.diaPagamento || 10} de cada mês.`,
      contrato.observacoes ||
        "Os serviços serão agendados com antecedência e executados conforme normas técnicas aplicáveis."
    ].forEach((p) => {
      const lines = doc.splitTextToSize(p, 180);
      doc.text(lines, 14, y);
      y += lines.length * 6 + 4;
    });
    doc.save(`${contrato.codigo || "contrato"}.pdf`);
  }

  function financeiro(resumo, empresa) {
    const jsPDF = ensureJsPdf();
    const doc = new jsPDF();
    registerFonts(doc);
    headerLegacy(doc, empresa, "RELATÓRIO", resumo.periodo);
    let y = 48;
    doc.setFont(fontsReady ? FONT : "helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(11, 45, 92);
    doc.text(`Entradas: ${money(resumo.entradas)}`, 14, y);
    doc.text(`Saídas: ${money(resumo.saidas)}`, 14, y + 8);
    doc.text(`${resumo.labelFixas || "Custo oculto embutido"}: ${money(resumo.fixas)}`, 14, y + 16);
    doc.setFont(fontsReady ? FONT : "helvetica", "bold");
    doc.text(`Saldo: ${money(resumo.saldo)}`, 14, y + 28);
    doc.autoTable({
      startY: y + 38,
      head: [["Data", "Descrição", "Tipo", "Categoria", "Valor"]],
      body: resumo.lancamentos.map((l) => [
        formatDate(l.data),
        l.descricao,
        l.tipo === "entrada" ? "Entrada" : "Saída",
        l.categoria,
        money(l.valor)
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [11, 45, 92] },
      alternateRowStyles: { fillColor: [255, 255, 255] }
    });
    doc.save(`financeiro-${resumo.periodo}.pdf`);
  }

  /** Catálogo com faixa mín. / médio / máx. (serviços + materiais) */
  function tabelaPrecos(servicos, produtos, empresa) {
    const jsPDF = ensureJsPdf();
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    registerFonts(doc);
    const f = fontsReady ? FONT : "helvetica";
    const gerado = typeof todayISO === "function" ? formatDate(todayISO()) : formatDate(new Date().toISOString().slice(0, 10));

    const priceOf = (item, modo) =>
      typeof getPrecoByModo === "function" ? getPrecoByModo(item, modo) : Number(item.preco || 0);

    const row = (item) => [
      item.nome || "—",
      item.categoria || "—",
      item.unidade || "—",
      money(priceOf(item, "minimo")),
      money(priceOf(item, "medio")),
      money(priceOf(item, "maximo"))
    ];

    const sortCat = (a, b) =>
      String(a.categoria || "").localeCompare(String(b.categoria || ""), "pt-BR") ||
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");

    const servBody = [...(servicos || [])].sort(sortCat).map(row);
    const matBody = [...(produtos || [])].sort(sortCat).map(row);

    const tableOpts = {
      head: [["Item", "Categoria", "Un.", "Mínimo", "Médio", "Máximo"]],
      styles: {
        font: f,
        fontSize: 8,
        cellPadding: 2.2,
        textColor: [27, 27, 27],
        lineColor: [217, 217, 217],
        lineWidth: 0.2
      },
      headStyles: {
        fillColor: [11, 45, 92],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center"
      },
      bodyStyles: { valign: "middle" },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 36 },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 24, halign: "right" },
        4: { cellWidth: 24, halign: "right", fontStyle: "bold" },
        5: { cellWidth: 24, halign: "right" }
      },
      alternateRowStyles: { fillColor: [247, 248, 250] },
      margin: { top: 36, left: 12, right: 12, bottom: 18 }
    };

    headerLegacy(doc, empresa, "TABELA DE PREÇOS", "Mão de obra · ES");
    doc.setFont(f, "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Gerado em ${gerado}  ·  Faixas mínimo, médio e máximo`, 14, 38);
    doc.setFont(f, "bold");
    doc.setFontSize(11);
    doc.setTextColor(11, 45, 92);
    doc.text("Serviços (mão de obra)", 14, 46);

    doc.autoTable({
      ...tableOpts,
      startY: 50,
      body: servBody.length
        ? servBody
        : [["Nenhum serviço cadastrado", "—", "—", "—", "—", "—"]],
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          headerLegacy(doc, empresa, "TABELA DE PREÇOS", "Serviços (cont.)");
        }
      }
    });

    doc.addPage();
    headerLegacy(doc, empresa, "TABELA DE PREÇOS", "Materiais · ES");
    doc.setFont(f, "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Gerado em ${gerado}  ·  Faixas mínimo, médio e máximo`, 14, 38);
    doc.setFont(f, "bold");
    doc.setFontSize(11);
    doc.setTextColor(11, 45, 92);
    doc.text("Materiais e equipamentos", 14, 46);

    doc.autoTable({
      ...tableOpts,
      startY: 50,
      body: matBody.length
        ? matBody
        : [["Nenhum material cadastrado", "—", "—", "—", "—", "—"]],
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          headerLegacy(doc, empresa, "TABELA DE PREÇOS", "Materiais (cont.)");
        }
      }
    });

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont(f, "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `${empresa?.nome || "VoltES"}  ·  Página ${i}/${pages}`,
        105,
        290,
        { align: "center" }
      );
    }

    doc.save("tabela-precos-voltes.pdf");
  }

  return { orcamento, contrato, financeiro, tabelaPrecos, preloadBrand };
})();
