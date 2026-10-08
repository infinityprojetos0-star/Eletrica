(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))u(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const c of r.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&u(c)}).observe(document,{childList:!0,subtree:!0});function a(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function u(n){if(n.ep)return;n.ep=!0;const r=a(n);fetch(n.href,r)}})();const S="voltes-theme";function L(){try{const e=localStorage.getItem(S);if(e==="light"||e==="dark")return e}catch{}return typeof window<"u"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}function E(){const e=document.documentElement.getAttribute("data-theme");return e==="light"||e==="dark"?e:L()}function q(e){document.documentElement.setAttribute("data-theme",e);try{localStorage.setItem(S,e)}catch{}const s=document.querySelector('meta[name="theme-color"]');s&&s.setAttribute("content",e==="light"?"#1a5695":"#0a1628"),window.dispatchEvent(new CustomEvent("voltes-theme",{detail:e}))}function O(){const e=E()==="dark"?"light":"dark";return q(e),e}function k(){q(L())}const T="2.0.46",w="voltes-v96";function $(){try{return Object.entries(Object.assign({})).map(([s,a])=>({id:`bundled-${s}`,name:s.split("/").pop()||s,src:a,bundled:!0}))}catch{return[]}}function A(e="thumb"){return`${e}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}function P(e,s={}){let a=Array.isArray(s.session)?[...s.session]:[];const u=typeof s.toast=="function"?s.toast:()=>{},n=!!s.standalone,r=typeof s.onSessionChange=="function"?s.onSessionChange:null,c=g=>{a=g,r==null||r(a)},m=()=>{var y;const b=[...$(),...a];e.innerHTML=`
      <div class="view-enter thumb-page">
        <div class="hero-note">
          <div>
            <h3>Thumb ${n?"":'<span class="badge badge-pendente">temporária</span>'}</h3>
            <p>${n?"Arraste ou selecione imagens para visualizar nesta página.":"Coloque arquivos em <code>src/thumbs/</code> (e rode o build) ou arraste / selecione imagens aqui."}</p>
          </div>
        </div>
        <div class="card thumb-drop" id="thumbDrop">
          <input type="file" id="thumbFiles" accept="image/*" multiple hidden />
          <p><strong>Arraste imagens aqui</strong> ou <button type="button" class="btn btn-secondary btn-sm" id="thumbPick">Selecionar arquivos</button></p>
          <p class="hint">PNG, JPG, WEBP, GIF, SVG · ficam só nesta sessão do navegador</p>
        </div>
        <div class="thumb-toolbar">
          <span class="hint">${b.length} imagem(ns)</span>
          ${a.length?'<button type="button" class="btn btn-ghost btn-sm" id="thumbClear">Limpar sessão</button>':""}
        </div>
        ${b.length?`<div class="thumb-grid" id="thumbGrid">
                ${b.map(t=>`
                  <figure class="thumb-card">
                    <button type="button" class="thumb-open" data-src="${String(t.src).replace(/"/g,"&quot;")}" title="Ampliar">
                      <img src="${t.src}" alt="${String(t.name||"imagem").replace(/"/g,"&quot;")}" loading="lazy" />
                    </button>
                    <figcaption>
                      <span class="thumb-name" title="${String(t.name||"").replace(/"/g,"&quot;")}">${t.name||"imagem"}</span>
                      ${t.bundled?'<span class="hint">pasta</span>':`<button type="button" class="btn btn-ghost btn-sm" data-thumb-rm="${t.id}">Remover</button>`}
                    </figcaption>
                  </figure>`).join("")}
              </div>`:`<div class="empty"><strong>Nenhuma imagem</strong>Solte arquivos acima${n?".":" ou copie para <code>src/thumbs/</code>."}</div>`}
        <div class="toast-stack" id="thumbToastStack"></div>
        <div class="thumb-lightbox" id="thumbLightbox" hidden>
          <button type="button" class="thumb-lightbox-close" id="thumbLbClose" aria-label="Fechar">×</button>
          <img id="thumbLbImg" alt="" />
        </div>
      </div>
    `;const f=t=>{const i=[...t||[]].filter(o=>o.type.startsWith("image/"));if(!i.length){u("Selecione arquivos de imagem");return}const d=[...a];i.forEach(o=>{d.push({id:A("thumb"),name:o.name,src:URL.createObjectURL(o),bundled:!1})}),c(d),u(`${i.length} imagem(ns) adicionada(s)`),m()};e.querySelector("#thumbPick").onclick=()=>e.querySelector("#thumbFiles").click(),e.querySelector("#thumbFiles").onchange=t=>{f(t.target.files),t.target.value=""};const l=e.querySelector("#thumbDrop");l.addEventListener("dragover",t=>{t.preventDefault(),l.classList.add("dragover")}),l.addEventListener("dragleave",()=>l.classList.remove("dragover")),l.addEventListener("drop",t=>{var i;t.preventDefault(),l.classList.remove("dragover"),f((i=t.dataTransfer)==null?void 0:i.files)}),(y=e.querySelector("#thumbClear"))==null||y.addEventListener("click",()=>{a.forEach(t=>{try{URL.revokeObjectURL(t.src)}catch{}}),c([]),m()}),e.querySelectorAll("[data-thumb-rm]").forEach(t=>{t.onclick=()=>{const i=t.dataset.thumbRm,d=a.find(o=>o.id===i);if(d)try{URL.revokeObjectURL(d.src)}catch{}c(a.filter(o=>o.id!==i)),m()}});const h=e.querySelector("#thumbLightbox"),p=e.querySelector("#thumbLbImg"),v=()=>{h.hidden=!0,p.src=""};e.querySelector("#thumbLbClose").onclick=v,h.onclick=t=>{t.target===h&&v()},e.querySelectorAll(".thumb-open").forEach(t=>{t.onclick=()=>{p.src=t.dataset.src,h.hidden=!1}})};return m(),{getSession:()=>a,destroy:()=>{e.innerHTML=""}}}export{T as A,w as C,O as c,E as g,k as i,P as m};
