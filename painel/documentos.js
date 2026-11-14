/* Painel PA – aba "Documentos": checklist por órgão (SMDUMA ou IMA/AL) e pasta de arquivos por empresa.
   Situação de cada item: localStorage "pa_docs". Arquivos anexados: IndexedDB "pa_docs" (ficam só neste navegador). */

const CHECK = {
  smduma: {
    nome: "SMDUMA Arapiraca – portal Integra (26 campos)",
    fonte: "Campos do portal Integra da SMDUMA, conferidos no processo da Top Dedetização (nov/2026). Confirme no portal antes de protocolar.",
    grupos: [{ t: "Campos do Integra", itens: [
      [1, "DOF e notas fiscais", 0, "Se não usa madeira/produto florestal: justificativa de não aplicação."],
      [2, "PGRSS (CONAMA 358/2005 e RDC ANVISA) ou PGRS", 1, "Serviço de saúde = PGRSS. Os demais: justificativa + PGRS com ART."],
      [3, "Plano de monitoramento da ETE (água e esgoto tratado), com ART", 1, "Sem ETE (fossa/sumidouro ou rede): justificativa."],
      [4, "CDF – Certificado de Destinação Final (SGORS)", 0, "Pedir à empresa que recolhe os resíduos o CDF mais recente."],
      [5, "Credenciamento para embalagens vazias de agrotóxicos", 1, "Se não usa agrotóxico: justificativa."],
      [6, "Registro do pedido de autorização na ANP", 0, "Só posto/revenda de combustível; nos demais, justificativa."],
      [7, "Certidão negativa de débitos municipais (CND)", 1, "Portal da Fazenda de Arapiraca. Conferir a validade."],
      [8, "CNPJ (comprovante de inscrição)", 1, "Emitir no site da Receita."],
      [9, "Protocolo do IPHAN", 1, "Imóvel comum, sem tombamento: justificativa."],
      [10, "Outorga de lançamento de efluentes (SEMARH)", 0, "Esgoto em fossa/sumidouro ou rede: justificativa."],
      [11, "CPF, RG e comprovante de residência do representante legal", 0, "Juntar em 1 PDF."],
      [12, "Procuração com poderes específicos junto ao órgão ambiental", 1, "Conferir CPF e nomes; firma reconhecida ou gov.br."],
      [13, "Declaração dos CNAEs em funcionamento", 1, "Assinada pelo representante legal (ou procurador)."],
      [14, "Alvará de funcionamento ou certidão de uso e ocupação do solo", 1, "Sem alvará: processo de UOSOLO na Prefeitura."],
      [15, "Propriedade/posse do imóvel ou contrato de locação (assinado e com firma)", 1, "Conferir endereço, locatário (empresa) e testemunhas."],
      [16, "Autorização da CASAL ou fatura de água (ou justificativa)", 1, "Cacimba/poço: justificativa e item 18."],
      [17, "Estudo ambiental (DA – Anexo I da Res. CEPRAM 18/2022), com ART", 1, "DA + ART no mesmo PDF."],
      [18, "Licença de obra hídrica ou isenção de captação (SEMARH)", 1, "Só água da CASAL: justificativa. Poço/cacimba: pedir na SEMARH."],
      [19, "Projeto de tratamento de efluentes, memorial descritivo e de cálculo, com ART", 1, "Fossa/sumidouro pela NBR 17.076:2024. Rede com taxa de esgoto: justificativa."],
      [20, "AVCB ou ACPS do Corpo de Bombeiros (ou dispensa do CBMAL)", 1, "SAPS do CBMAL."],
      [21, "Termo de Ciência e Concordância (modelo SMDUMA)", 1, ""],
      [22, "Requerimento (modelo SMDUMA)", 1, "Tipo certo: LP, LI, LO, RegLO ou renovação."],
      [23, "Contrato social ou ato constitutivo", 0, "Empresário individual: certidão simplificada da JUCEAL."],
      [24, "Projetos executivos e memoriais (arquitetura, hidrossanitário, resíduos), com ART", 1, ""],
      [25, "Projeto da área de depósito de agrotóxicos (NBR 9843)", 0, "Se não armazena agrotóxico: justificativa."],
      [26, "Laudo de sondagem e teste de infiltração, com ART", 0, "Só se o esgoto for para fossa e sumidouro."],
    ] }],
  },
  ima: {
    nome: "IMA/AL – lista da PA Consultoria",
    fonte: "Lista enviada pela PA no grupo 'Lista das Farmácias' em 19/10/2026 (protocolo IMA). Confirme o TR do IMA para a atividade.",
    grupos: [
      { t: "Básicos", itens: [
        ["b1", "Requerimento (modelo IMA)", 1, ""],
        ["b2", "Boleto da taxa do IMA", 1, ""],
        ["b3", "Comprovante de pagamento do boleto do IMA", 1, ""],
        ["b4", "Publicação no Diário Oficial (comprovante)", 1, "Texto + comprovante publicado."],
        ["b5", "Publicação em jornal (comprovante)", 1, "Ex.: Tribuna."],
        ["b6", "RG do responsável legal", 1, ""],
        ["b7", "Comprovante de residência do responsável legal", 1, ""],
        ["b8", "CNPJ", 1, ""],
        ["b9", "Contrato social / ATA / estatuto", 1, ""],
        ["b10", "Procuração", 1, ""],
        ["b11", "Contrato de locação ou escritura", 1, ""],
      ] },
      { t: "Específicos", itens: [
        ["e1", "Alvará de funcionamento", 1, ""],
        ["e2", "Declaração de viabilidade de coleta pública", 1, "Ex.: ALURB (Maceió)."],
        ["e3", "Comprovante de abastecimento de água", 1, "Conta da concessionária."],
        ["e4", "Comprovante de taxa de esgoto", 1, "Sem taxa de esgoto: projeto de fossa (técnicos)."],
        ["e5", "Justificativa de outorga de captação", 1, ""],
        ["e6", "Justificativa de outorga de lançamento", 1, ""],
        ["e7", "Alvará sanitário (VISA) ou protocolo", 1, "Para atividades de saúde."],
        ["e8", "Contrato da coleta de resíduos (ex.: Serquip/Veolia)", 1, ""],
      ] },
      { t: "Técnicos", itens: [
        ["t1", "Diagnóstico ambiental (DA), com ART", 1, ""],
        ["t2", "Projeto arquitetônico + memorial descritivo + ART/RRT", 1, ""],
        ["t3", "Projeto de fossa e sumidouro", 0, "Só se a conta de água não tiver taxa de esgoto."],
        ["t4", "Justificativa de monitoramento (ETE)", 1, ""],
        ["t5", "PGRS / PGRSS", 1, ""],
        ["t6", "Georreferenciamento (KML)", 0, "Isento se a área for menor que 1.500 m²."],
      ] },
      { t: "Fotos", itens: [["f1", "Fotos do empreendimento", 1, "Com data e localização."]] },
    ],
  },
};

const SITS = {
  falta: ["Falta", "t-atr"], pedido: ["Pedido ao cliente", "t-30"], assinar: ["Para assinar", "t-sem"],
  pronto: ["Pronto", "t-ok"], na: ["Não se aplica", "t-ent"],
};
const FEITO = (s) => s === "pronto" || s === "na";

let DOCS = ler("pa_docs", {});          // { chave: { nome, cnpj, orgao, itens: { id: { s, obs } }, extra? } }
let docSel = ler("pa_docs_sel", "");
const salvarDocs = () => gravar("pa_docs", DOCS);
const chaveEmp = (nome, cnpj) => { const d = String(cnpj || "").replace(/\D/g, ""); return d.length >= 11 ? "c" + d : "n" + String(nome).toLowerCase().trim(); };

/* ── arquivos no IndexedDB ── */
let _db;
function bancoArq() {
  if (_db) return _db;
  _db = new Promise((ok, erro) => {
    const r = indexedDB.open("pa_docs", 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore("arq", { keyPath: "id" }); s.createIndex("emp", "emp"); };
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
  return _db;
}
async function arqTx(modo, fn) {
  const db = await bancoArq();
  return new Promise((ok, erro) => { const tx = db.transaction("arq", modo), st = tx.objectStore("arq"); const r = fn(st); tx.oncomplete = () => ok(r?.result); tx.onerror = () => erro(tx.error); });
}
const arqDaEmpresa = (emp) => arqTx("readonly", (st) => st.index("emp").getAll(emp)).catch(() => []);

/* ── empresas: as das licenças + as adicionadas só aqui ── */
function empresas() {
  const m = new Map();
  (typeof LIC !== "undefined" ? LIC : []).forEach((l) => {
    const k = chaveEmp(l.nome, l.cnpj);
    if (!m.has(k)) m.set(k, { k, nome: l.nome, cnpj: l.cnpj, lic: [] });
    m.get(k).lic.push(`${l.tipo} ${l.num}`);
  });
  Object.entries(DOCS).forEach(([k, d]) => { if (d.extra && !m.has(k)) m.set(k, { k, nome: d.nome, cnpj: d.cnpj || "—", lic: [], extra: 1 }); });
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
function estado(e) {
  if (!DOCS[e.k]) DOCS[e.k] = { nome: e.nome, cnpj: e.cnpj, orgao: "smduma", itens: {} };
  return DOCS[e.k];
}
function itensDe(orgao) { return CHECK[orgao].grupos.flatMap((g) => g.itens.map(([id, txt, ob, dica]) => ({ id: String(id), txt, ob, dica, g: g.t }))); }
function progresso(e) {
  const st = DOCS[e.k]; if (!st) return null;
  const its = itensDe(st.orgao), ok = its.filter((i) => FEITO(st.itens[i.id]?.s)).length;
  return { ok, n: its.length, falta: its.filter((i) => !FEITO(st.itens[i.id]?.s) && i.ob).length };
}

/* ── tela ── */
async function documentos() {
  const lista = empresas();
  if (!docSel || !lista.some((e) => e.k === docSel)) docSel = lista[0]?.k || "";
  const e = lista.find((x) => x.k === docSel);
  $("#doc").innerHTML = `<div class="doc-grade">
    <aside class="card doc-emps"><div class="doc-busca"><input id="docBusca" placeholder="Buscar empresa…" aria-label="Buscar empresa"></div>
      <ul>${lista.map((x) => { const p = progresso(x); return `<li><button data-emp-doc="${esc(x.k)}" class="${x.k === docSel ? "on" : ""}">
        <b>${esc(curto(x.nome))}</b><small>${p ? `${p.ok}/${p.n} prontos · ${CHECK[DOCS[x.k].orgao].nome.split(" ")[0]}` : "checklist não iniciado"}</small>
        ${p ? `<i class="mini"><i style="width:${(p.ok / p.n) * 100}%"></i></i>` : ""}</button></li>`; }).join("")}</ul>
      <button class="btn claro peq" data-acao-doc="novaEmp">＋ Empresa sem licença</button></aside>
    <section class="card doc-corpo" id="docCorpo">${e ? "" : `<p class="mut">Nenhuma empresa.</p>`}</section></div>`;
  $("#docBusca").addEventListener("input", (ev) => { const q = ev.target.value.toLowerCase(); $$(".doc-emps li").forEach((li) => { li.hidden = !li.textContent.toLowerCase().includes(q); }); });
  if (e) await corpoEmpresa(e);
}

async function corpoEmpresa(e) {
  const st = estado(e), arqs = await arqDaEmpresa(e.k), C = CHECK[st.orgao];
  const its = itensDe(st.orgao), ok = its.filter((i) => FEITO(st.itens[i.id]?.s)).length;
  const porItem = (id) => arqs.filter((a) => a.item === id);
  let grupo = "";
  $("#docCorpo").innerHTML = `<div class="doc-cab"><div><h2>${esc(e.nome)}</h2><p class="mut">CNPJ ${esc(e.cnpj)}${e.lic.length ? " · " + esc(e.lic.join(", ")) : ""}</p></div>
      <label class="doc-orgao">Órgão <select id="docOrgao">${Object.entries(CHECK).map(([k, c]) => `<option value="${k}" ${k === st.orgao ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label></div>
    <div class="val"><span><b>${ok}</b> de ${its.length} itens prontos ou que não se aplicam</span><span>${arqs.length} arquivo(s) na pasta</span></div>
    <div class="prog"><i style="width:${(ok / its.length) * 100}%;background:var(--ok)"></i></div>
    <div class="ferramentas"><button class="btn" data-acao-doc="copiar">📋 Copiar o que falta</button>
      <button class="btn claro" data-acao-doc="imprimir">🖨 Imprimir checklist</button>
      ${e.extra ? `<button class="btn perigo" data-acao-doc="tirarEmp">Remover empresa</button>` : ""}</div>
    <p class="mut doc-fonte">${esc(C.fonte)}</p>
    <table class="doc-tab"><thead><tr><th>Nº</th><th>Documento</th><th>Situação</th><th>Observação</th><th>Arquivos</th></tr></thead><tbody>
    ${its.map((i) => { const s = st.itens[i.id] || {}; const cab = i.g !== grupo && CHECK[st.orgao].grupos.length > 1 ? `<tr class="doc-g"><td colspan="5">${esc((grupo = i.g))}</td></tr>` : ((grupo = i.g), "");
      return `${cab}<tr class="${FEITO(s.s) ? "feito" : ""}"><td>${esc(i.id.toUpperCase())}</td>
      <td><b>${esc(i.txt)}</b>${i.ob ? ` <span class="tag t-atr ob">obrigatório</span>` : ` <span class="tag t-ven ob">se couber</span>`}${i.dica ? `<small>${esc(i.dica)}</small>` : ""}</td>
      <td><select data-sit="${esc(i.id)}">${Object.entries(SITS).map(([k, [t]]) => `<option value="${k}" ${k === (s.s || "falta") ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><input data-obs="${esc(i.id)}" value="${esc(s.obs || "")}" placeholder="—"></td>
      <td class="doc-arqs">${porItem(i.id).map((a) => `<span class="chip"><a href="#" data-ver="${a.id}" title="${esc(a.nome)} (${Math.round(a.tam / 1024)} KB)">${esc(a.nome.length > 22 ? a.nome.slice(0, 20) + "…" : a.nome)}</a><button data-tirar="${a.id}" title="Tirar da pasta" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join("")}
        <label class="btn claro peq">＋<input type="file" multiple hidden data-anexar="${esc(i.id)}"></label></td></tr>`; }).join("")}
    </tbody></table>`;

  const corpo = $("#docCorpo");
  $("#docOrgao").onchange = (ev) => { st.orgao = ev.target.value; salvarDocs(); documentos(); };
  corpo.querySelectorAll("[data-sit]").forEach((s) => (s.onchange = () => {
    (st.itens[s.dataset.sit] ||= {}).s = s.value; salvarDocs(); s.closest("tr").classList.toggle("feito", FEITO(s.value)); atualizarLista();
  }));
  corpo.querySelectorAll("[data-obs]").forEach((inp) => (inp.onchange = () => { (st.itens[inp.dataset.obs] ||= {}).obs = inp.value.trim(); salvarDocs(); }));
  corpo.querySelectorAll("[data-anexar]").forEach((inp) => (inp.onchange = async () => {
    const id = inp.dataset.anexar;
    for (const f of inp.files) {
      if (f.size > 40e6) { alert(`"${f.name}" passa de 40 MB.`); continue; }
      await arqTx("readwrite", (s) => s.put({ id: `${e.k}|${id}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`, emp: e.k, item: id, nome: f.name, tipo: f.type, tam: f.size, data: new Date().toISOString(), blob: f }))
        .catch(() => alert("Não consegui guardar o arquivo neste navegador (espaço cheio?)."));
    }
    const it = (st.itens[id] ||= {}); if (!it.s || it.s === "falta" || it.s === "pedido") it.s = "pronto"; salvarDocs();
    aviso(`${inp.files.length} arquivo(s) na pasta de ${curto(e.nome)}`); corpoEmpresa(e); atualizarLista();
  }));
  corpo.querySelectorAll("[data-ver]").forEach((a) => (a.onclick = async (ev) => {
    ev.preventDefault(); const r = await arqTx("readonly", (s) => s.get(a.dataset.ver)); if (!r) return;
    const url = URL.createObjectURL(r.blob); const w = window.open(url, "_blank");
    if (!w) { const l = document.createElement("a"); l.href = url; l.download = r.nome; l.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }));
  corpo.querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Tirar este arquivo da pasta? (o original no seu computador continua)")) return;
    await arqTx("readwrite", (s) => s.delete(b.dataset.tirar)); corpoEmpresa(e);
  }));
}

function atualizarLista() {
  empresas().forEach((x) => { const b = $(`[data-emp-doc="${CSS.escape(x.k)}"]`), p = progresso(x); if (!b || !p) return;
    b.querySelector("small").textContent = `${p.ok}/${p.n} prontos · ${CHECK[DOCS[x.k].orgao].nome.split(" ")[0]}`;
    const m = b.querySelector(".mini i"); if (m) m.style.width = (p.ok / p.n) * 100 + "%"; });
}

function textoFalta(e) {
  const st = estado(e), its = itensDe(st.orgao).filter((i) => !FEITO(st.itens[i.id]?.s));
  if (!its.length) return `✅ ${e.nome}: checklist completo (${CHECK[st.orgao].nome}).`;
  return `*${e.nome}* – ${CHECK[st.orgao].nome}\nFaltam ${its.length} documento(s):\n` +
    its.map((i) => `• ${i.id.toUpperCase()} – ${i.txt}${st.itens[i.id]?.s === "assinar" ? " (para assinar)" : st.itens[i.id]?.s === "pedido" ? " (já pedido)" : ""}${st.itens[i.id]?.obs ? ` – ${st.itens[i.id].obs}` : ""}`).join("\n");
}

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-emp-doc],[data-acao-doc],[data-doc]"); if (!b) return;
  if (b.dataset.empDoc) { docSel = b.dataset.empDoc; gravar("pa_docs_sel", docSel); documentos(); return; }
  if (b.dataset.doc !== undefined) {  // vindo dos Detalhes da licença
    const l = LIC[+b.dataset.doc]; docSel = chaveEmp(l.nome, l.cnpj); gravar("pa_docs_sel", docSel);
    $$("dialog[open]").forEach((x) => x.close()); ir("doc"); return;
  }
  const e = empresas().find((x) => x.k === docSel);
  const a = b.dataset.acaoDoc;
  if (a === "novaEmp") {
    const nome = prompt("Nome da empresa:"); if (!nome?.trim()) return;
    const cnpj = prompt("CNPJ (pode deixar em branco):") || "—"; const k = chaveEmp(nome, cnpj);
    DOCS[k] = DOCS[k] || { nome: nome.trim(), cnpj, orgao: confirm("O processo é no IMA/AL?\nOK = IMA · Cancelar = SMDUMA") ? "ima" : "smduma", itens: {}, extra: 1 };
    salvarDocs(); docSel = k; documentos();
  } else if (a === "copiar" && e) copiar(textoFalta(e), "Lista do que falta copiada – cole no WhatsApp");
  else if (a === "imprimir") { document.body.classList.add("imprimindo-doc"); window.print(); setTimeout(() => document.body.classList.remove("imprimindo-doc"), 500); }
  else if (a === "tirarEmp" && e && confirm(`Remover ${e.nome} da lista? Os arquivos dela também saem da pasta.`)) {
    delete DOCS[e.k]; salvarDocs();
    arqDaEmpresa(e.k).then((as) => arqTx("readwrite", (s) => as.forEach((x) => s.delete(x.id)))).then(() => { docSel = ""; documentos(); });
  }
});
