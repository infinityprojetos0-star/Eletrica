/** Geração de PDF VoltES. */
// @ts-nocheck
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import html2canvas from "html2canvas";
import {
  PDF_FONT_REGULAR,
  PDF_FONT_BOLD,
  PDF_LOGO_ORC,
  PDF_LOGO_DARK,
  PDF_ICON_CLIENTE,
  PDF_ICON_SERVICOS,
  PDF_ICON_MATERIAIS,
  PDF_ICON_PAGAMENTO,
  PDF_ICON_OBS,
  PDF_ICON_GARANTIA,
  PDF_ICON_PHONE,
  PDF_ICON_SLOGAN_BOLT,
  PDF_FOOTER_BOLT,
  PDF_FOOTER_GEAR,
  PDF_FOOTER_DOC,
  PDF_FOOTER_NBR,
  PDF_FOOTER_CHECK
} from "./pdf-assets";
import {
  money,
  formatDate,
  getPrecoByModo,
  orcamentoTotalComNf,
  orcamentoTotalPdf,
  sanitizarItemOculto,
  custoOcultoGlobal
} from "../data/catalog";
import { Store } from "../store/store";


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

  function ensureJsPdf() { return jsPDF; }

  function ensureHtml2Canvas() { return html2canvas; }

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

  function tableBlock(items, minRows = 0) {
    const list = items || [];
    const count = Math.max(list.length, Math.min(minRows, list.length + 2));
    let rows = "";
    for (let i = 0; i < count; i++) {
      const it = list[i];
      const qtd =
        it && it.qtd !== "" && it.qtd != null
          ? `${it.qtd}${it.unidade ? ` ${it.unidade}` : ""}`
          : "";
      rows += `<tr>
        <td class="c">${String(i + 1).padStart(2, "0")}</td>
        <td class="d">${it ? esc(it.nome) : "&nbsp;"}</td>
        <td class="c">${esc(qtd) || "&nbsp;"}</td>
      </tr>`;
    }
    if (!count) {
      rows = `<tr><td class="c">01</td><td class="d">&nbsp;</td><td class="c">&nbsp;</td></tr>`;
    }
    return `<table class="ve-tbl" cellspacing="0" cellpadding="0">
      <thead><tr><th class="c">ITEM</th><th class="d">DESCRIÇÃO</th><th class="c">QUANTIDADE</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function obsLines(text, maxLines = 4) {
    const parts = String(text || "")
      .split(/\r?\n/)
      .concat(["", "", "", ""])
      .slice(0, maxLines);
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
    const footH = 72;
    return `
${fontFaceCss()}
#voltes-pdf-host,#voltes-pdf-host *{box-sizing:border-box;}
#voltes-pdf-host{
  position:fixed;left:0;top:0;width:${A4_W}px;height:auto;
  margin:0;padding:0;background:#fff;overflow:visible;
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
  height:${A4_H - footH}px;box-sizing:border-box;
  overflow:hidden;padding:0;
}
.ve-hdr{position:relative;height:118px;width:100%;background:#fff;flex-shrink:0;}
.ve-logo-wrap{position:absolute;left:20px;top:4px;width:370px;}
.ve-logo{
  height:100px;width:auto;max-width:365px;
  object-fit:contain;object-position:left center;display:block;
}
.ve-logo-sub{
  margin-top:4px;display:flex;align-items:center;gap:5px;
  font-size:7.5px;font-weight:700;letter-spacing:0.5px;color:${C.primary};text-transform:uppercase;
}
.ve-logo-sub .ln{flex:1;height:1px;background:${C.border};}
.ve-logo-sub .tx{white-space:nowrap;padding:0 3px 2px;}

.ve-banner{position:absolute;top:0;right:0;width:380px;height:118px;overflow:hidden;}
.ve-banner-img{position:absolute;inset:0;width:100%;height:100%;display:block;}
.ve-banner-txt{position:absolute;inset:0;padding:14px 24px 10px 80px;color:#fff;z-index:2;}
.ve-banner-txt h1{
  margin:0 0 7px;font-size:28px;font-weight:700;letter-spacing:0.7px;
  line-height:1;text-align:left;color:#fff;
}
.ve-banner-txt p{margin:0 0 3px;font-size:11px;font-weight:400;line-height:1.25;text-align:left;color:#fff;}
.ve-banner-txt .val{font-size:9.5px;margin-top:2px;}

.ve-main{
  padding:8px ${mx}px 0;flex:1 1 auto;display:flex;flex-direction:column;
  min-height:0;width:100%;
}

.ve-box{
  border:1px solid ${C.border};border-radius:6px;background:#fff;
  margin-bottom:7px;overflow:hidden;position:relative;width:100%;
}
.ve-box-pad{padding:7px 10px 8px;}
.ve-box-tbl{padding:0;overflow:hidden;}
.ve-box-tbl .ve-title{padding:6px 10px 4px;margin:0;}

.ve-badge{
  display:inline-block;width:16px;height:16px;background:${C.primary};color:#fff;
  text-align:center;line-height:16px;vertical-align:middle;border-radius:50%;
}
.ve-title{
  font-size:10px;font-weight:700;color:${C.primary};
  letter-spacing:0.3px;text-transform:uppercase;margin:0 0 4px;line-height:16px;
}
.ve-title .ve-badge{margin-right:6px;}

.ve-fields{width:100%;border-collapse:collapse;margin:0;table-layout:fixed;}
.ve-fields td{
  border-bottom:1px solid ${C.border};padding:4px 0 3px;vertical-align:bottom;
  font-size:9.5px;line-height:1.25;
}
.ve-fields .lbl{
  font-weight:700;color:${C.text};white-space:nowrap;text-transform:uppercase;
  padding-right:10px;width:132px;
}
.ve-fields .val{
  font-weight:400;font-size:10.5px;color:${C.text};
  white-space:normal;word-break:break-word;overflow-wrap:anywhere;
}
.ve-fields tr.two td{width:50%;border-bottom:none;padding:0;vertical-align:bottom;}
.ve-fields tr.two table{width:100%;border-collapse:collapse;table-layout:fixed;}
.ve-fields tr.two .lbl{width:78px;}
.ve-fields tr.two td td{border-bottom:1px solid ${C.border};padding:4px 0 3px;}

.ve-tbl{
  width:100%;max-width:100%;margin:0;border-collapse:collapse;table-layout:fixed;
  border:none;
}
.ve-tbl th,.ve-tbl td{
  border:1px solid ${C.tableLine};
  border-left:none;border-right:none;
  padding:5px 8px;font-size:9px;line-height:1.25;vertical-align:middle;
  word-wrap:break-word;overflow-wrap:anywhere;
}
.ve-tbl thead th{
  background:${C.primary};color:#fff;font-weight:700;
  border-color:${C.primary};padding:7px 8px;line-height:1.2;
}
.ve-tbl tbody tr:last-child td{border-bottom:none;}
.ve-tbl th.c,.ve-tbl td.c{text-align:center;color:${C.primary};font-weight:600;width:11%;}
.ve-tbl th.c{color:#fff;}
.ve-tbl th.d,.ve-tbl td.d{text-align:left;width:64%;color:${C.text};font-weight:400;}
.ve-tbl th.d{color:#fff;text-align:center;}
.ve-tbl td.c:last-child,.ve-tbl th.c:last-child{width:25%;}
.ve-page-note{font-size:7.5px;color:${C.muted};margin:4px 10px 6px;font-style:italic;line-height:1.2;}

.ve-compact .ve-tbl th,.ve-compact .ve-tbl td{padding:3px 6px;font-size:8px;}
.ve-compact .ve-tbl thead th{padding:5px 6px;}
.ve-compact .ve-box{margin-bottom:5px;}
.ve-compact .ve-main{padding-top:4px;}
.ve-compact .ve-garantia{font-size:7px;line-height:1.2;}
.ve-compact .ve-title{font-size:9px;margin-bottom:3px;}
.ve-compact .ve-total .val{font-size:16px;}
.ve-compact .ve-sign{margin-top:8px;}

.ve-2col{
  display:table;width:100%;table-layout:fixed;margin-bottom:7px;
  border-collapse:separate;border-spacing:7px 0;
}
.ve-2col > *{display:table-cell;vertical-align:top;}
.ve-2col > .ve-box{width:50%;}
.ve-2col.ve-final > .ve-box{width:58%;}
.ve-2col.ve-final > .ve-total{width:42%;}

.ve-pay{margin:2px 0 2px;font-size:8.5px;}
.ve-pay table{width:100%;border-collapse:collapse;}
.ve-pay td{padding:3px 4px 3px 0;vertical-align:middle;width:50%;}
.ve-chk-ico{
  width:12px;height:12px;border:1.6px solid ${C.primary};
  display:inline-block;vertical-align:middle;margin-right:5px;
  background:#fff;box-sizing:border-box;line-height:0;text-align:center;
  border-radius:2px;
}
.ve-chk-ico.on{background:${C.secondary};border-color:${C.secondary};}
.ve-chk-ico svg{display:block;margin:1px auto 0;width:8px;height:8px;}
.ve-chk-lab{vertical-align:middle;line-height:12px;display:inline-block;text-transform:uppercase;}
.ve-forma{font-size:8px;color:${C.muted};margin-top:4px;border-bottom:1px solid ${C.border};padding-bottom:2px;}
.obs-line{border-bottom:1px solid ${C.border};min-height:11px;margin-top:3px;font-size:8px;color:${C.text};line-height:1.2;word-break:break-word;}
.ve-garantia{font-size:7.5px;line-height:1.3;color:${C.text};font-weight:400;margin:2px 0 0;text-transform:none;}

.ve-total{
  border:2px solid ${C.secondary};border-radius:10px;
  text-align:center;padding:12px 8px;background:#fff;vertical-align:middle;
}
.ve-total .lbl{font-size:9px;font-weight:700;color:${C.primary};letter-spacing:0.25px;margin-bottom:6px;text-transform:uppercase;}
.ve-total .val{
  font-size:20px;font-weight:700;color:${C.secondary};line-height:1.15;
  white-space:nowrap;text-align:center;
}

.ve-sign{display:table;width:100%;margin:10px 0 0;table-layout:fixed;flex-shrink:0;}
.ve-sign .col{display:table-cell;width:50%;text-align:center;padding:0 18px;vertical-align:top;}
.ve-sign .hline{border-top:1.5px solid ${C.primary};margin-bottom:4px;}
.ve-sign .t{font-size:8px;font-weight:700;color:${C.text};}
.ve-sign .navy{color:${C.primary};}
.ve-sign .sub{font-size:8px;font-weight:700;margin-top:2px;color:${C.text};}

.ve-push{flex:1 1 auto;min-height:6px;width:100%;}

.ve-contact{
  margin:0 ${mx}px;padding:10px 0 8px;
  border-top:2px solid ${C.secondary};
  display:table;width:calc(100% - ${mx * 2}px);table-layout:fixed;
  flex-shrink:0;
}
.ve-contact .left,.ve-contact .right{
  display:table-cell;width:50%;vertical-align:middle;padding:4px 10px;height:32px;
}
.ve-contact .left{border-right:1px solid ${C.border};}
.ve-contact .ico{
  display:inline-block;width:20px;height:20px;vertical-align:middle;margin-right:8px;line-height:0;
}
.ve-contact .ico svg{display:block;width:18px;height:18px;}
.ve-contact .fone{
  font-size:14px;font-weight:700;color:${C.primary};line-height:20px;
  display:inline-block;vertical-align:middle;
}
.ve-contact .slogan{
  font-size:9.5px;font-weight:700;color:${C.primary};line-height:1.25;
  display:inline-block;vertical-align:middle;
}
.ve-contact .slogan b{color:${C.secondary};font-size:10.5px;}

.ve-foot{
  position:absolute;left:0;right:0;bottom:0;
  width:100%;height:${footH}px;margin:0;
  background:${C.primary};color:#fff;
  display:table;table-layout:fixed;
}
.ve-foot .cell{
  display:table-cell;vertical-align:middle;text-align:left;
  border-right:1px solid rgba(255,255,255,0.28);padding:0 8px;height:${footH}px;
}
.ve-foot .cell:last-child{border-right:none;}
.ve-foot .ico{
  display:inline-block;width:20px;height:20px;vertical-align:middle;margin-right:7px;line-height:0;
}
.ve-foot .ico svg{display:block;width:18px;height:18px;}
.ve-foot .ft{
  display:inline-block;vertical-align:middle;
  font-size:8px;font-weight:700;line-height:1.15;letter-spacing:0.15px;
  text-transform:uppercase;color:#fff;max-width:92px;
}
`;
  }

  function pageHeaderHtml(orc, bannerUrl, subtitle) {
    return `
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
        <p class="val">${esc(subtitle || `VALIDADE DA PROPOSTA: ${orc.validade != null ? orc.validade : 15} DIAS`)}</p>
      </div>
    </div>
  </div>`;
  }

  function pageFooterHtml(fone) {
    const footCell = (icon, lines) =>
      `<div class="cell"><span class="ico">${svgIcon(icon, 18)}</span><span class="ft">${lines}</span></div>`;
    return `
  <div class="ve-push"></div>
  <div class="ve-contact">
    <div class="left">
      <span class="ico">${svgIcon("phone", 18)}</span><span class="fone">${esc(fone)}</span>
    </div>
    <div class="right">
      <span class="ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="${C.secondary}" d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg></span>
      <span class="slogan">ENERGIA QUE CONECTA,<br/>QUALIDADE QUE <b>TRANSFORMA.</b></span>
    </div>
  </div>
  </div>

  <div class="ve-foot">
    ${footCell("zap", "INSTALAÇÕES<br/>ELÉTRICAS")}
    ${footCell("cog", "MANUTENÇÃO<br/>PREVENTIVA")}
    ${footCell("file", "PROJETOS<br/>ELÉTRICOS")}
    ${footCell("building", "ADEQUAÇÃO<br/>NBR 5410")}
    ${footCell("badge", "SEGURANÇA E<br/>QUALIDADE")}
    ${footCell("headset", "ATENDIMENTO<br/>ESPECIALIZADO")}
  </div>`;
  }

  function payCheck(formas, id, label) {
    const on = (formas || []).includes(id);
    const mark = on
      ? `<svg viewBox="0 0 12 12" width="8" height="8"><path d="M2 6.5 4.8 9.2 10 3.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : "";
    return `<span class="ve-chk-ico${on ? " on" : ""}">${mark}</span><span class="ve-chk-lab">${label}</span>`;
  }

  function buildPageHtml(orcRaw, cliente, empresa, bannerUrl) {
    /** true = soma materiais no total; lista de materiais sempre na pág. 2 */
    let state;
    try {
      state = Store.get();
    } catch {
      state = undefined;
    }
    const itensNorm = (orcRaw.itens || []).map((i) => sanitizarItemOculto(i, state));
    const temServ = itensNorm.some((i) => i.tipo === "servico");
    const despesasObra =
      orcRaw.despesasObra != null && orcRaw.despesasObra !== ""
        ? Math.max(0, Number(orcRaw.despesasObra) || 0)
        : temServ && state
          ? custoOcultoGlobal(state)
          : 0;
    const orc = { ...orcRaw, itens: itensNorm, despesasObra };

    const incluirValorMat = orc.incluirMateriaisNoPdf !== false;
    const servicos = itensNorm.filter((i) => i.tipo === "servico");
    const materiais = itensNorm.filter((i) => i.tipo !== "servico");
    const formas =
      orc.formasPagamento && orc.formasPagamento.length ? orc.formasPagamento : ["pix"];

    const total =
      typeof orcamentoTotalPdf === "function"
        ? orcamentoTotalPdf(orc, state)
        : typeof orcamentoTotalComNf === "function"
          ? orcamentoTotalComNf(
              { ...orc, itens: incluirValorMat ? itensNorm : servicos },
              state
            )
          : Math.max(
              0,
              (incluirValorMat ? itensNorm : servicos).reduce(
                (s, i) => s + Number(i.qtd || 0) * Number(i.preco || 0),
                0
              ) +
                despesasObra -
                Number(orc.desconto || 0)
            );
    const totalLabel =
      typeof money === "function"
        ? money(total)
        : `R$ ${Number(total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const fone = empresa?.telefone || "(27) 99617-5219";
    const garantiaMeses = orc.garantiaMeses || 3;
    const validade = orc.validade != null ? orc.validade : 15;
    const minServ = Math.min(servicos.length + 1, Math.max(servicos.length, 4));
    const minMat = Math.min(materiais.length + 2, Math.max(materiais.length, 6));
    const compact = servicos.length >= 8 ? " ve-compact" : "";
    const obsMax = compact ? 3 : 4;

    const page1 = `
<div class="ve-page${compact}" data-pdf-page="1">
  <div class="ve-page-inner">
  ${pageHeaderHtml(orc, bannerUrl, `VALIDADE DA PROPOSTA: ${validade} DIAS`)}

  <div class="ve-main">
    <div class="ve-box ve-box-pad">
      <div class="ve-title">${badge("user", true)} DADOS DO CLIENTE</div>
      <table class="ve-fields">
        <tr><td class="lbl">NOME / EMPRESA</td><td class="val">${esc(cliente?.nome || "")}</td></tr>
        <tr><td class="lbl">CPF / CNPJ</td><td class="val">${esc(cliente?.documento || "")}</td></tr>
        <tr class="two">
          <td>
            <table><tr><td class="lbl">TELEFONE</td><td class="val">${esc(cliente?.telefone || "")}</td></tr></table>
          </td>
          <td>
            <table><tr><td class="lbl">E-MAIL</td><td class="val">${esc(cliente?.email || "")}</td></tr></table>
          </td>
        </tr>
        <tr><td class="lbl">ENDEREÇO DA OBRA</td><td class="val">${esc(cliente?.endereco || orc.enderecoObra || "")}</td></tr>
      </table>
    </div>

    <div class="ve-box ve-box-tbl">
      <div class="ve-title" style="padding:6px 9px 4px">${badge("wrench", false)} DESCRIÇÃO DOS SERVIÇOS</div>
      ${tableBlock(servicos, minServ)}
      ${
        materiais.length
          ? `<p class="ve-page-note">${
              incluirValorMat
                ? "Lista de materiais na página seguinte (valores inclusos no total)."
                : "Lista de materiais na página seguinte (somente referência — valores não inclusos no total)."
            }</p>`
          : ""
      }
    </div>

    <div class="ve-2col">
      <div class="ve-box ve-box-pad">
        <div class="ve-title">${badge("dollar", false)} CONDIÇÕES DE PAGAMENTO</div>
        <div class="ve-pay">
          <table>
            <tr><td>${payCheck(formas, "pix", "PIX")}</td><td>${payCheck(formas, "boleto", "BOLETO")}</td></tr>
            <tr><td>${payCheck(formas, "dinheiro", "DINHEIRO")}</td><td>${payCheck(formas, "cartao", "CARTÃO")}</td></tr>
            <tr><td colspan="2">${payCheck(formas, "transferencia", "TRANSFERÊNCIA BANCÁRIA")}</td></tr>
          </table>
        </div>
        <div class="ve-forma">FORMA DE PAGAMENTO: ${esc(orc.formaPagamentoObs || "____________________")}</div>
      </div>
      <div class="ve-box ve-box-pad">
        <div class="ve-title">${badge("chat", false)} OBSERVAÇÕES</div>
        ${obsLines(orc.observacoes, obsMax)}
      </div>
    </div>

    <div class="ve-2col ve-final" style="margin-bottom:0">
      <div class="ve-box ve-box-pad">
        <div class="ve-title">${badge("shield", false)} GARANTIA</div>
        <p class="ve-garantia">A VoltES garante a execução dos serviços conforme as normas técnicas vigentes (NBR 5410), utilizando materiais de qualidade e mão de obra especializada. O prazo de garantia dos serviços executados será de <strong>${garantiaMeses}</strong> meses, não abrangendo danos decorrentes de mau uso, intervenções de terceiros ou causas externas.</p>
      </div>
      <div class="ve-total">
        <div class="lbl">VALOR TOTAL DA PROPOSTA</div>
        <div class="val">${esc(totalLabel)}</div>
      </div>
    </div>

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

  ${pageFooterHtml(fone)}
</div>`;

    if (!materiais.length) return page1;

    const page2 = `
<div class="ve-page" data-pdf-page="2">
  <div class="ve-page-inner">
  ${pageHeaderHtml(orc, bannerUrl, "MATERIAIS E EQUIPAMENTOS")}

  <div class="ve-main">
    <div class="ve-box ve-box-tbl">
      <div class="ve-title" style="padding:6px 9px 4px">${badge("cart", false)} MATERIAIS E EQUIPAMENTOS</div>
      <p class="ve-page-note">${
        incluirValorMat
          ? `Continuação do orçamento ${esc(orc.codigo || "")} — materiais fornecidos (valores no total da pág. 1).`
          : `Continuação do orçamento ${esc(orc.codigo || "")} — lista de referência (materiais do cliente / fora do total).`
      }</p>
      ${tableBlock(materiais, minMat)}
    </div>
  </div>

  ${pageFooterHtml(fone)}
</div>`;

    return page1 + page2;
  }

  async function capturePage(pageEl) {
    const html2canvas = ensureHtml2Canvas();
    return html2canvas(pageEl, {
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
        doc.querySelectorAll(".ve-page").forEach((p) => {
          p.style.transform = "none";
          p.style.width = `${A4_W}px`;
          p.style.height = `${A4_H}px`;
        });
      }
    });
  }

  async function orcamento(orc, cliente, empresa) {
    ensureHtml2Canvas();
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

    const pages = [...host.querySelectorAll(".ve-page")];
    if (!pages.length) {
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
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      for (let i = 0; i < pages.length; i++) {
        const canvas = await capturePage(pages[i]);
        if (i > 0) doc.addPage();
        doc.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }
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


export { orcamento, contrato, financeiro, tabelaPrecos, preloadBrand };
export const PDF = { orcamento, contrato, financeiro, tabelaPrecos, preloadBrand };
