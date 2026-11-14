/* Painel PA – aba "Gerar documentos": requerimento, termo de ciência, declarações, procuração, justificativas e
   publicação, nos modelos usados pela PA na SMDUMA (Arapiraca) e no IMA/AL. Gera um arquivo para imprimir/salvar em PDF
   ou abrir no Word. Dados pessoais (CPF) não ficam no site: são digitados e guardados só neste navegador. */

const G_CAMPOS = ["razao", "fantasia", "cnpj", "end", "bairro", "mun", "cep", "fone", "email", "cnae", "sec", "porte",
  "rep", "repCpf", "repCargo", "proc", "procCpf", "procProf", "procEnd", "procFone", "procEmail", "procCrea",
  "terreno", "constr", "func", "horario", "agua", "esgoto", "residuos", "lat", "lon", "local", "data"];
const G_PADRAO = { proc: "PATRÍCIA BEZERRA ALBUQUERQUE", procProf: "Engenheira Sanitarista e Ambiental", procEmail: "patriciaconsultec.stma@gmail.com",
  repCargo: "sócio-administrador", local: "Arapiraca/AL", horario: "Horário comercial" };

const PEDIDOS = { lp: "Licença Prévia (LP)", li: "Licença de Instalação (LI)", lo: "Licença de Operação (LO)", reglo: "Regularização da Licença de Operação (LO)",
  regli: "Regularização da Licença de Instalação (LI)", ren: "Renovação da Licença de Operação (LO)", las: "Licença Ambiental Simplificada (LAS)" };

/* justificativas de "não se aplica" – [rótulo, descrição do item, justificativa padrão] */
const JUST = {
  smduma: {
    dof: ["DOF", "Documento de Origem Florestal – DOF e as respectivas notas fiscais, se couber",
      "NÃO SE APLICA AO EMPREENDIMENTO. A empresa não utiliza, armazena, transporta nem comercializa produtos ou subprodutos florestais de origem nativa (madeira, lenha, carvão vegetal ou similares). Como não há movimentação desses produtos, não há DOF nem notas fiscais a apresentar."],
    pgrss: ["PGRSS", "Plano de Gerenciamento de Resíduos de Serviços de Saúde – PGRSS (Resolução CONAMA nº 358/2005 e RDC ANVISA)",
      "NÃO SE APLICA AO EMPREENDIMENTO. A empresa não é estabelecimento de serviço de saúde e não gera resíduos de serviços de saúde. Os resíduos da atividade são geridos pelo Plano de Gerenciamento de Resíduos Sólidos – PGRS do empreendimento, apresentado em anexo."],
    ete: ["Monitoramento da ETE", "Plano de monitoramento da Estação de Tratamento de Efluentes (qualidade da água e do esgoto tratado), com ART",
      "NÃO SE APLICA AO EMPREENDIMENTO. O empreendimento não possui Estação de Tratamento de Efluentes nem lança efluentes tratados em corpo hídrico. Os efluentes são exclusivamente sanitários, destinados a ==sistema individual de tanque séptico, filtro anaeróbio e sumidouro / rede pública de esgoto==."],
    emb: ["Embalagens de agrotóxicos", "Declaração ou documento que comprove o credenciamento para recebimento de embalagens vazias de agrotóxicos, com cópia de licença ambiental válida, quando se tratar de agrotóxicos",
      "NÃO SE APLICA AO EMPREENDIMENTO. A empresa não produz, comercializa, utiliza nem recebe embalagens vazias de agrotóxicos."],
    anp: ["ANP", "Registro do pedido de autorização para operação da instalação junto à Agência Nacional do Petróleo – ANP, se couber",
      "NÃO SE APLICA AO EMPREENDIMENTO. A empresa não armazena, revende, distribui nem utiliza em instalação própria combustíveis, derivados de petróleo ou gás em quantidade sujeita a autorização da ANP."],
    iphan: ["IPHAN", "Protocolo do IPHAN em caso de patrimônio histórico e artístico nacional",
      "NÃO SE APLICA AO EMPREENDIMENTO. O imóvel é edificação urbana comum, já construída, sem tombamento ou proteção como patrimônio histórico, artístico ou arqueológico, e a atividade não prevê obras de escavação ou intervenção no solo."],
    lanc: ["Outorga de lançamento", "Outorga de lançamento de efluentes tratados emitida pela SEMARH, se couber",
      "NÃO SE APLICA AO EMPREENDIMENTO. O empreendimento não lança efluentes em corpo hídrico. Os efluentes são exclusivamente sanitários, destinados a ==sistema individual de tanque séptico, filtro anaeróbio e sumidouro / rede pública de esgoto==."],
    casal: ["CASAL (água)", "Autorização da CASAL para abastecimento de água ou fatura de água",
      "NÃO SE APLICA AO EMPREENDIMENTO. O imóvel não é ligado à rede pública da CASAL. O abastecimento de água é feito por ==cacimba / poço==, para uso sanitário e limpeza. A regularização do uso dessa água junto à SEMARH/AL é tratada no item de obra hídrica/isenção de captação."],
    hidrica: ["Obra hídrica / captação", "Licença de obra hídrica ou isenção de captação emitida pela SEMARH",
      "NÃO SE APLICA AO EMPREENDIMENTO. O abastecimento de água é feito exclusivamente pela rede pública da CASAL; não há poço, cacimba ou outra captação própria no imóvel."],
    deposito: ["Depósito de agrotóxicos", "Projeto da área de depósito de agrotóxicos conforme ABNT NBR 9843, se couber",
      "NÃO SE APLICA AO EMPREENDIMENTO. A empresa não armazena agrotóxicos."],
  },
  ima: {
    capt: ["Outorga de captação", "Outorga de direito de uso de recursos hídricos para captação, emitida pela SEMARH",
      "NÃO SE APLICA AO EMPREENDIMENTO. O abastecimento de água é feito pela rede pública ==(concessionária)==; não há captação própria (poço, cacimba ou corpo hídrico)."],
    lanc: ["Outorga de lançamento", "Outorga de lançamento de efluentes, emitida pela SEMARH",
      "NÃO SE APLICA AO EMPREENDIMENTO. O empreendimento não lança efluentes em corpo hídrico. Os efluentes são exclusivamente sanitários, destinados a ==rede pública de esgoto / sistema de fossa e sumidouro==."],
    ete: ["Monitoramento da ETE", "Plano de monitoramento da Estação de Tratamento de Efluentes",
      "NÃO SE APLICA AO EMPREENDIMENTO. O empreendimento não possui Estação de Tratamento de Efluentes; gera apenas efluentes sanitários, destinados a ==rede pública de esgoto / sistema de fossa e sumidouro==."],
    iphan: ["IPHAN", "Manifestação do IPHAN sobre patrimônio histórico, artístico e arqueológico",
      "NÃO SE APLICA AO EMPREENDIMENTO. O imóvel é edificação urbana já construída, sem tombamento ou proteção como patrimônio histórico, artístico ou arqueológico, e não há obras de escavação previstas."],
    asv: ["Supressão vegetal (ASV)", "Autorização de Supressão de Vegetação – ASV",
      "NÃO SE APLICA AO EMPREENDIMENTO. O empreendimento ocupa imóvel urbano já edificado e não prevê supressão de vegetação nativa."],
  },
};
const ORGAOS = {
  smduma: { nome: "SMDUMA – Arapiraca", destino: "SECRETARIA MUNICIPAL DE DESENVOLVIMENTO URBANO E MEIO AMBIENTE – SMDUMA", ente: "à SMDUMA – Secretaria Municipal de Desenvolvimento Urbano e Meio Ambiente de Arapiraca" },
  ima: { nome: "IMA/AL", destino: "INSTITUTO DO MEIO AMBIENTE DO ESTADO DE ALAGOAS – IMA/AL", ente: "ao IMA – Instituto do Meio Ambiente do Estado de Alagoas" },
};
const DOCS_G = [["req", "Requerimento"], ["termo", "Termo de ciência e concordância"], ["cnae", "Declaração de CNAEs em funcionamento"],
  ["solo", "Declaração de uso e ocupação do solo"], ["proc", "Procuração"], ["pub", "Texto para publicação (jornal/Diário Oficial)"], ["just", "Justificativas marcadas abaixo"]];

let GF = ler("pa_ger", {});   // último formulário (só neste navegador)

function gerador() {
  const v = { ...G_PADRAO, ...GF }, org = v.orgao || "smduma";
  const emps = (typeof empresas === "function" ? empresas() : []);
  const campo = (k, rot, tipo = "text", extra = "") => `<label>${rot}<input name="${k}" type="${tipo}" value="${esc(v[k] || "")}" ${extra}></label>`;
  $("#ger").innerHTML = `<form id="gForm" class="card ger">
    <div class="ger-topo"><div><h2>Gerar documentos do processo</h2><p class="mut">Modelos usados pela PA na SMDUMA (Arapiraca) e no IMA/AL. O que ficar em branco sai <mark>em amarelo</mark> no documento.
      CPFs e dados pessoais ficam só neste navegador (não vão para o site).</p></div>
      <div class="ger-org">${Object.entries(ORGAOS).map(([k, o]) => `<label class="pill"><input type="radio" name="orgao" value="${k}" ${k === org ? "checked" : ""}> ${o.nome}</label>`).join("")}</div></div>
    <fieldset><legend>1. Empresa</legend>
      <div class="ger-linha"><label class="largo">Escolher do painel<select id="gEmp"><option value="">— digite os dados ou escolha —</option>${emps.map((e) => `<option value="${esc(e.k)}">${esc(curto(e.nome))} · ${esc(e.cnpj)}</option>`).join("")}</select></label>
        ${campo("cnpj", "CNPJ")}<button class="btn" type="button" id="gBusca">🔎 Buscar na Receita</button></div>
      <div class="ger-grade">${campo("razao", "Razão social")}${campo("fantasia", "Nome fantasia")}${campo("end", "Endereço (rua e nº)")}${campo("bairro", "Bairro")}
        ${campo("mun", "Município/UF")}${campo("cep", "CEP")}${campo("fone", "Telefone")}${campo("email", "E-mail da empresa")}
        ${campo("cnae", "CNAE principal (código – descrição)")}${campo("porte", "Natureza jurídica / porte")}</div>
      <label>CNAEs secundários em funcionamento (um por linha; vazio = não há)<textarea name="sec" rows="3">${esc(v.sec || "")}</textarea></label>
      <p class="mut" id="gMsg"></p></fieldset>
    <fieldset><legend>2. Representante legal e procurador(a)</legend><div class="ger-grade">
      ${campo("rep", "Representante legal")}${campo("repCpf", "CPF do representante")}${campo("repCargo", "Cargo (ex.: sócio-administrador)")}
      ${campo("proc", "Procurador(a)")}${campo("procCpf", "CPF do(a) procurador(a)")}${campo("procProf", "Profissão / formação")}
      ${campo("procCrea", "CREA / registro")}${campo("procFone", "Telefone do(a) procurador(a)")}${campo("procEmail", "E-mail para notificações")}
      ${campo("procEnd", "Endereço do(a) procurador(a)")}</div></fieldset>
    <fieldset><legend>3. Pedido e empreendimento</legend><div class="ger-grade">
      <label>Pedido<select name="pedido">${Object.entries(PEDIDOS).map(([k, t]) => `<option value="${k}" ${k === (v.pedido || "reglo") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      ${campo("terreno", "Área do terreno (m²)")}${campo("constr", "Área construída (m²)")}${campo("func", "Nº de funcionários")}${campo("horario", "Horário de funcionamento")}
      ${campo("agua", "Abastecimento de água")}${campo("esgoto", "Esgotamento sanitário")}${campo("residuos", "Resíduos (coleta/destinação)")}
      ${campo("lat", "Latitude (SIRGAS 2000)")}${campo("lon", "Longitude (SIRGAS 2000)")}${campo("local", "Local")}${campo("data", "Data", "date")}</div></fieldset>
    <fieldset><legend>4. Documentos</legend>
      <div class="ger-chk">${DOCS_G.map(([k, t]) => `<label class="pill"><input type="checkbox" name="d_${k}" ${v["d_" + k] !== false ? "checked" : ""}> ${t}</label>`).join("")}</div>
      <p class="mut" style="margin:10px 0 4px">Justificativas de "não se aplica" (${ORGAOS[org].nome}):</p>
      <div class="ger-chk" id="gJust">${Object.entries(JUST[org]).map(([k, j]) => `<label class="pill"><input type="checkbox" name="j_${k}" ${v["j_" + k] ? "checked" : ""}> ${j[0]}</label>`).join("")}</div></fieldset>
    <div class="ferramentas"><button class="btn" type="submit">🖨 Gerar e imprimir / salvar PDF</button>
      <button class="btn claro" type="button" id="gWord">⬇ Baixar para o Word</button>
      <button class="btn claro" type="button" id="gLimpar">Limpar formulário</button></div>
    <p class="mut">Confira sempre os dados e o modelo vigente no órgão antes de protocolar. A palavra final é da PA/órgão.</p></form>`;

  const f = $("#gForm");
  const ler_ = () => { const o = { orgao: f.orgao.value, pedido: f.pedido.value }; G_CAMPOS.forEach((k) => { if (f[k]) o[k] = f[k].value.trim(); });
    DOCS_G.forEach(([k]) => { o["d_" + k] = f["d_" + k].checked; }); Object.keys(JUST[o.orgao]).forEach((k) => { o["j_" + k] = !!f["j_" + k]?.checked; }); return o; };
  f.addEventListener("change", (ev) => { GF = ler_(); gravar("pa_ger", GF); if (ev.target.name === "orgao") gerador(); });
  $("#gLimpar").onclick = () => { if (confirm("Limpar todos os campos?")) { GF = {}; gravar("pa_ger", GF); gerador(); } };
  $("#gEmp").onchange = (ev) => {
    const e = emps.find((x) => x.k === ev.target.value); if (!e) return;
    const l = LIC.find((x) => chaveEmp(x.nome, x.cnpj) === e.k);
    f.razao.value = e.nome.replace(/\s*\(.*\)\s*$/, ""); f.fantasia.value = (e.nome.match(/\(([^)]+)\)/) || [])[1] || "";
    f.cnpj.value = e.cnpj === "—" ? "" : e.cnpj; if (l?.cnae) f.cnae.value = l.cnae.replace(/^CNAE\s*/, "");
    GF = ler_(); gravar("pa_ger", GF);
    if (f.cnpj.value.replace(/\D/g, "").length === 14) buscarCnpj();
  };
  $("#gBusca").onclick = buscarCnpj;
  f.onsubmit = (ev) => { ev.preventDefault(); GF = ler_(); gravar("pa_ger", GF); abrirDocs(GF, false); };
  $("#gWord").onclick = () => { GF = ler_(); gravar("pa_ger", GF); abrirDocs(GF, true); };

  async function buscarCnpj() {
    const c = f.cnpj.value.replace(/\D/g, ""); const msg = $("#gMsg");
    if (c.length !== 14) { msg.textContent = "Digite um CNPJ com 14 números."; return; }
    msg.textContent = "Buscando na Receita…";
    const fontes = [`https://brasilapi.com.br/api/cnpj/v1/${c}`, `https://minhareceita.org/${c}`];
    for (const u of fontes) {
      try {
        const r = await fetch(u); if (!r.ok) continue; const d = await r.json();
        const cep = String(d.cep || "").replace(/\D/g, "");
        f.razao.value = d.razao_social || f.razao.value; f.fantasia.value = d.nome_fantasia || f.fantasia.value;
        f.end.value = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ") + (d.numero ? `, nº ${d.numero}` : "") + (d.complemento ? ` – ${d.complemento}` : "");
        f.bairro.value = d.bairro || ""; f.mun.value = d.municipio ? `${d.municipio}/${d.uf}` : ""; f.cep.value = cep.length === 8 ? `${cep.slice(0, 2)}.${cep.slice(2, 5)}-${cep.slice(5)}` : "";
        if (d.ddd_telefone_1) f.fone.value = d.ddd_telefone_1.replace(/^(\d{2})(\d+)/, "($1) $2");
        if (d.email) f.email.value = d.email.toLowerCase();
        const fmtC = (x) => String(x).replace(/^(\d{2})(\d{2})(\d)(\d{2})$/, "$1.$2-$3-$4");
        if (d.cnae_fiscal) f.cnae.value = `${fmtC(d.cnae_fiscal)} - ${d.cnae_fiscal_descricao}`;
        if (Array.isArray(d.cnaes_secundarios)) f.sec.value = d.cnaes_secundarios.filter((s) => s.codigo).map((s) => `${fmtC(s.codigo)} - ${s.descricao}`).join("\n");
        f.porte.value = [d.natureza_juridica, d.porte].filter(Boolean).join(" / ");
        const socio = (d.qsa || [])[0]; if (socio && !f.rep.value) f.rep.value = socio.nome_socio || "";
        msg.textContent = `✔ Dados da Receita (${d.descricao_situacao_cadastral || "situação não informada"}). Confira os CNAEs secundários: deixe só os que funcionam no local.`;
        GF = ler_(); gravar("pa_ger", GF); return;
      } catch (e) { /* tenta a próxima fonte */ }
    }
    msg.textContent = "Não consegui consultar a Receita agora (sem internet ou serviço fora). Preencha à mão.";
  }
}

/* ── montagem dos documentos ── */
function abrirDocs(v, word) {
  const O = ORGAOS[v.orgao], A = (x, rot) => (x ? gesc(x) : `<mark>${rot}</mark>`);
  const dataExt = v.data ? (() => { const [a, m, d] = v.data.split("-"); return `${+d} de ${MESES[+m - 1]} de ${a}`; })() : "<mark>data</mark>";
  const LOCALDATA = `<p class="d">${gesc(v.local || "Arapiraca/AL")}, ${dataExt}.</p>`;
  const nomeEmp = `<b>${A(v.razao, "razão social")}</b>${v.fantasia ? ` (nome fantasia <b>${gesc(v.fantasia)}</b>)` : ""}`;
  const endCompleto = `${A(v.end, "endereço")}, ${A(v.bairro, "bairro")}, ${A(v.mun, "município/UF")}, CEP ${A(v.cep, "CEP")}`;
  const ass = (nome, ...linhas) => `<div class="ass"><p>_____________________________________________</p><p><b>${nome}</b>${linhas.map((l) => `<br>${l}`).join("")}</p></div>`;
  const ASS_REP = ass(A(v.rep, "representante legal"), `CPF ${A(v.repCpf, "CPF")} – ${gesc(v.repCargo || "representante legal")}`);
  const ASS_PROC = ass(A(v.proc, "procurador(a)"), `CPF ${A(v.procCpf, "CPF")}`, `Procurador(a) de ${A(v.razao, "razão social")} – CNPJ ${A(v.cnpj, "CNPJ")}`, "(procuração anexa)");
  const secs = (v.sec || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const docs = [];

  if (v.d_req) docs.push(v.orgao === "ima" ? reqIMA() : reqSMDUMA());
  if (v.d_termo) docs.push(["Termo de ciência e concordância", `<p class="c"><b>${v.orgao === "ima" ? "INSTITUTO DO MEIO AMBIENTE DO ESTADO DE ALAGOAS – IMA/AL" : "SECRETARIA MUNICIPAL DE DESENVOLVIMENTO URBANO E MEIO AMBIENTE"}</b></p>
    <p class="c"><b>TERMO DE CIÊNCIA E CONCORDÂNCIA</b></p>
    <p>Por meio deste instrumento, ${nomeEmp}, inscrita no CNPJ nº <b>${A(v.cnpj, "CNPJ")}</b>, por seu ${gesc(v.repCargo || "representante legal")} <b>${A(v.rep, "representante")}</b>, CPF nº ${A(v.repCpf, "CPF")}, neste ato representada por seu(sua) procurador(a) <b>${A(v.proc, "procurador(a)")}</b>, CPF nº ${A(v.procCpf, "CPF")}, conforme procuração anexa, declara estar ciente e concordar com o inteiro teor das seguintes normas:</p>
    <ul><li>Em caso de documentação incompleta, o status do processo é considerado como pendente por parte do interessado;</li>
    <li>Se houver necessidade, poderão ser solicitados esclarecimentos e complementações em relação aos documentos, projetos e avaliações de impactos ambientais apresentados, e essa exigência poderá ser repetida caso os esclarecimentos e complementações não tenham sido satisfatórios;</li>
    <li>O contribuinte receberá informações, comunicados, intimações e/ou outras solicitações por meio do e-mail e/ou WhatsApp informado no protocolo (no item Contato para assuntos relacionados ao Requerimento);</li></ul>
    <p>Por fim, declara que concorda e aceita o teor deste Termo e das normas a que faz referência, bem como que teve acesso a cópias dos documentos aqui mencionados. Declara, ainda, estar ciente de que a prestação de informações falsas e/ou incorretas implicará o não recebimento de informações a respeito dos processos.</p>
    ${LOCALDATA}${ASS_PROC}`]);
  if (v.d_cnae) docs.push(["Declaração de CNAEs", `<p class="c"><b>DECLARAÇÃO DO CNAE E ATIVIDADE ECONÔMICA ATIVA NO CADASTRO NACIONAL DE PESSOA JURÍDICA – CNPJ</b></p>
    <p>Venho por meio deste documento DECLARAR e descrever os códigos (CNAE) constantes no Cadastro Nacional de Pessoa Jurídica – CNPJ do empreendimento ${nomeEmp}, inscrito no CNPJ nº <b>${A(v.cnpj, "CNPJ")}</b>, localizado na ${endCompleto}, que estão em funcionamento no estabelecimento:</p>
    <p><b>PRINCIPAL:</b></p><p>${A(v.cnae, "CNAE principal")}</p>
    <p><b>SECUNDÁRIA(S) EM FUNCIONAMENTO:</b></p>${secs.length ? secs.map((s) => `<p>${gesc(s)}</p>`).join("") : "<p>Não há atividade secundária em funcionamento no estabelecimento.</p>"}
    ${LOCALDATA}${ASS_PROC}`]);
  if (v.d_solo) docs.push(["Uso e ocupação do solo", `<p class="c"><b>USO E OCUPAÇÃO DO SOLO</b></p><p class="c"><b>DECLARAÇÃO</b></p>
    <p>Declaro, para os devidos fins, que o imóvel da empresa ${nomeEmp}, inscrita no CNPJ nº <b>${A(v.cnpj, "CNPJ")}</b>, situado na ${endCompleto}, possui área total de terreno de ${A(v.terreno, "área do terreno")} m², com área construída de ${A(v.constr, "área construída")} m², utilizada para o exercício da atividade principal ${A(v.cnae, "CNAE principal")}${secs.length ? " e das atividades secundárias relacionadas na Declaração de CNAEs em funcionamento" : ""}. Diante disto, solicita-se a este órgão a regularização do documento de uso e ocupação do solo para o exercício dessas atividades.</p>
    ${LOCALDATA}${ASS_PROC}`]);
  if (v.d_proc) docs.push(["Procuração", `<p class="c"><b>PROCURAÇÃO</b></p><p><b>OUTORGANTE:</b></p>
    <p>${nomeEmp}, pessoa jurídica, com atividade principal ${A(v.cnae, "CNAE principal")}, situada na ${endCompleto}, devidamente inscrita no CNPJ ${A(v.cnpj, "CNPJ")}, neste ato representada por seu ${gesc(v.repCargo || "representante legal")}, o(a) Sr(a). <b>${A(v.rep, "representante legal")}</b>, portador(a) do CPF nº ${A(v.repCpf, "CPF")}, nomeia e constitui como seu(sua) procurador(a):</p>
    <p><b>OUTORGADO(A):</b></p>
    <p><b>${A(v.proc, "procurador(a)")}</b>, brasileiro(a), ${A(v.procProf, "profissão")}${v.procCrea ? `, ${gesc(v.procCrea)}` : ""}, portador(a) do CPF nº ${A(v.procCpf, "CPF")}, residente na ${A(v.procEnd, "endereço do(a) procurador(a)")}. Telefone para contato ${A(v.procFone, "telefone")}.</p>
    <p>Outorgando amplos, gerais e ilimitados poderes, inerentes ao bom e fiel cumprimento deste mandato, conforme estabelecido no artigo 38 do Código de Processo Civil, bem como para o Foro em geral, representá-la junto ${O.ente}, ao CORPO DE BOMBEIROS MILITAR DE ALAGOAS – CBMAL e demais órgãos ambientais, receber citações, notificações e intimações, requerer, retificar, assinar e apresentar documentos, alegar e prestar declarações e informações, bem como representá-la, enfim, praticar todos os atos legais necessários ao fiel cumprimento do presente mandato.</p>
    <p><b>Validade:</b> 1 (um) ano a partir da data de assinatura.</p>${LOCALDATA}${ASS_REP}`]);
  if (v.d_pub) docs.push(["Publicação", `<p class="c"><b>PUBLICAÇÃO – PEDIDO DE LICENÇA AMBIENTAL</b></p><p class="c"><b>TEXTO PARA PUBLICAÇÃO</b></p>
    <p>${A(v.razao, "RAZÃO SOCIAL")}${v.fantasia ? ` (${gesc(v.fantasia)})` : ""}, CNPJ ${A(v.cnpj, "CNPJ")}, endereço ${endCompleto}, torna público que requereu ${O.ente} a ${gesc(PEDIDOS[v.pedido])} para a atividade econômica principal ${A(v.cnae, "CNAE principal")}${secs.length ? " e atividades secundárias" : ""}, no município de ${A((v.mun || "").split("/")[0], "município")} – AL.</p>${LOCALDATA}`]);
  if (v.d_just) Object.entries(JUST[v.orgao]).filter(([k]) => v["j_" + k]).forEach(([, j]) => docs.push([`Justificativa – ${j[0]}`, `<p><b>A</b></p><p><b>${O.destino}</b></p>
    <p><b>Assunto:</b> Apresentar justificativas em relação aos documentos não aplicáveis ao processo</p>
    <p>Cumprimentando-os cordialmente, o requerente ${nomeEmp}, o qual funciona o CNAE principal <b>${A(v.cnae, "CNAE principal")}</b>, endereço <b>${endCompleto}</b>, CNPJ nº <b>${A(v.cnpj, "CNPJ")}</b>, já devidamente qualificado nos autos, vem por meio deste DECLARAR com as devidas justificativas, que o documento abaixo relacionado previsto no checklist da atividade ou empreendimento não é aplicável:</p>
    <table><tr><th>TIPO DE DOCUMENTO</th><th>DESCRIÇÃO</th><th>JUSTIFICATIVA</th></tr><tr><td>ESPECÍFICO</td><td>${gesc(j[1])}</td><td>${gmark(j[2])}</td></tr></table>
    <p>Nestes termos, pede deferimento,</p>${LOCALDATA}${ASS_PROC}`]));

  if (!docs.length) { alert("Marque pelo menos um documento."); return; }
  const titulo = `${v.razao || "Documentos"} – ${O.nome}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${gesc(titulo)}</title><style>
    @page { size: A4; margin: 2.5cm 2cm 2cm 2.5cm; } body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }
    p { text-align: justify; margin: 0 0 8pt; } .c { text-align: center; } .d { margin-top: 14pt; text-align: right; }
    .ass { margin-top: 34pt; text-align: center; } .ass p { text-align: center; margin: 0; }
    table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; } td, th { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; font-size: 10pt; }
    th { background: #d9e2f3; } h3 { font-size: 11pt; margin: 12pt 0 4pt; } mark { background: #ffff00; }
    .doc { page-break-after: always; } .doc:last-child { page-break-after: auto; }
    .rla td { font-size: 9.5pt; } .rla .t { background: #eee; font-weight: bold; } .x { display: inline-block; width: 11pt; height: 11pt; border: 1px solid #000; text-align: center; line-height: 11pt; font-size: 9pt; margin-right: 4pt; }
    .aviso { background: #fff7d6; border: 1px solid #e0c060; padding: 8px 12px; font: 13px Arial; margin-bottom: 14px; } @media print { .aviso { display: none; } }
  </style></head><body>${word ? "" : `<div class="aviso">${docs.length} documento(s). Use <b>Ctrl+P</b> e escolha <b>Salvar como PDF</b> (ou a impressora). O amarelo marca o que falta preencher.</div>`}
  ${docs.map(([, h]) => `<div class="doc">${h}</div>`).join("")}</body></html>`;
  if (word) {
    const nome = `${(v.razao || "documentos").replace(/[^\wÀ-ú ]+/g, "").trim().slice(0, 40)} - ${O.nome.split(" ")[0]}.doc`;
    baixar(nome, "application/msword", "﻿" + html); aviso("Arquivo para o Word baixado"); return;
  }
  const w = window.open("", "_blank"); if (!w) { alert("O navegador bloqueou a janela nova. Permita pop-ups para este site."); return; }
  w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600);

  function reqSMDUMA() {
    const linhas = (rows) => `<table>${rows.map(([a, b]) => `<tr><td style="width:38%"><b>${a}</b></td><td>${b}</td></tr>`).join("")}</table>`;
    return ["Requerimento SMDUMA", `<p class="c"><b>AO ILMO. SR. SECRETÁRIO MUNICIPAL DE DESENVOLVIMENTO URBANO E MEIO AMBIENTE – SMDUMA</b></p>
      <p class="c"><b>PREFEITURA MUNICIPAL DE ARAPIRACA – AL</b></p><p class="c"><b>REQUERIMENTO DE ${gesc(PEDIDOS[v.pedido]).toUpperCase()}</b></p>
      <p>${nomeEmp}, inscrita no CNPJ sob o nº <b>${A(v.cnpj, "CNPJ")}</b>, com sede na ${endCompleto}, vem, respeitosamente, requerer a V. Sa. a <b>${gesc(PEDIDOS[v.pedido])}</b> para a atividade ${A(v.cnae, "CNAE principal")}, conforme os dados abaixo, nos termos da Resolução CONAMA nº 237/1997 e da Lei Municipal nº 2.221/2001.</p>
      <h3>1. IDENTIFICAÇÃO DO REQUERENTE</h3>${linhas([["Nome empresarial", A(v.razao, "razão social")], ["Nome fantasia", gesc(v.fantasia || "—")], ["CNPJ", A(v.cnpj, "CNPJ")],
        ["Natureza jurídica / porte", A(v.porte, "natureza jurídica / porte")], ["Endereço", endCompleto], ["Telefone / e-mail", `${A(v.fone, "telefone")} / ${A(v.email, "e-mail")}`]])}
      <h3>2. REPRESENTANTE LEGAL</h3>${linhas([["Nome", A(v.rep, "representante legal")], ["CPF", A(v.repCpf, "CPF")], ["Cargo", gesc(v.repCargo || "—")]])}
      <h3>3. EMPREENDIMENTO</h3>${linhas([["CNAE principal / secundárias", `${A(v.cnae, "CNAE principal")} / ${secs.length ? secs.map(gesc).join("; ") : "não há em funcionamento"}`],
        ["Coordenadas (SIRGAS 2000)", `${A(v.lat, "latitude")}, ${A(v.lon, "longitude")}`], ["Área do terreno / construída", `${A(v.terreno, "terreno")} m² / ${A(v.constr, "construída")} m²`],
        ["Horário de funcionamento", A(v.horario, "horário")], ["Número de funcionários", A(v.func, "nº de funcionários")], ["Abastecimento de água", A(v.agua, "abastecimento de água")],
        ["Esgotamento sanitário", A(v.esgoto, "esgotamento sanitário")], ["Resíduos", A(v.residuos, "coleta/destinação dos resíduos")]])}
      <h3>4. RESPONSÁVEL TÉCNICO(A) E CONTATO DO PROCESSO</h3>${linhas([["Responsável técnico(a)", `${A(v.proc, "nome")} – ${A(v.procProf, "profissão")}${v.procCrea ? ` – ${gesc(v.procCrea)}` : ""}`],
        ["Empresa de consultoria", "PA CONSULTORIA AMBIENTAL"], ["Contato para notificações", `${A(v.procEmail, "e-mail")} / ${A(v.procFone, "telefone")}`], ["Procuração", "Anexa"]])}
      <p>Declaro que as informações prestadas neste requerimento e nos documentos anexos são verdadeiras e que o processo está instruído com a documentação exigida pelo sistema de licenciamento, com justificativa para os itens não aplicáveis ao empreendimento.</p>
      <p>Nestes termos, pede deferimento.</p>${LOCALDATA}${ASS_PROC}`];
  }

  function reqIMA() {
    const mk = (on) => `<span class="x">${on ? "X" : "&nbsp;"}</span>`;
    const p = v.pedido, linha = (cells) => `<tr>${cells.map(([t, c, s]) => `<td ${s ? `colspan="${s}"` : ""}>${t ? `<small>${t}</small><br>` : ""}${c || "&nbsp;"}</td>`).join("")}</tr>`;
    const [mun] = (v.mun || "").split("/");
    return ["Requerimento IMA", `<p class="c"><b>REQUERIMENTO PARA LICENCIAMENTO AMBIENTAL – RLA</b></p>
      <p style="font-size:9pt">Conforme a Lei Estadual nº 6.787, de 22 de dezembro de 2006, com alterações da Lei Estadual nº 7.226 de 29 de dezembro de 2010, Lei nº 7.625, de 26 de maio de 2014 e Lei nº 7.705 de 29 de julho de 2015, o Instituto do Meio Ambiente de Alagoas – IMA terá um prazo máximo de 3 (três) meses a contar do ato de protocolar o requerimento até seu deferimento ou indeferimento, ressalvados os casos em que houver EIA/RIMA ou audiência pública, quando o prazo será de até 12 (doze) meses ou quando ocorrer o envio de uma Intimação quando o prazo será acrescido do que estará descrito no referido documento.</p>
      <table class="rla"><tr><td colspan="3"><small>PROTOCOLO IMA:</small></td></tr>
      <tr><td colspan="3" class="t">1 – IDENTIFICAÇÃO DO REQUERENTE</td></tr>
      ${linha([["Razão Social (Pessoa Jurídica) ou Nome (Pessoa Física)", A(v.razao, "razão social"), 3]])}
      ${linha([["Endereço", A(v.end, "endereço"), 2], ["Bairro", A(v.bairro, "bairro")]])}
      ${linha([["Município/UF", A(v.mun, "município/UF")], ["CEP", A(v.cep, "CEP")], ["Telefone", A(v.fone, "telefone")]])}
      ${linha([["CNPJ ou CPF", A(v.cnpj, "CNPJ")], ["Insc. Estadual (PJ) ou RG (PF)", "", 2]])}
      ${linha([["CNAE/Atividade Principal (a ser licenciada)", A(v.cnae, "CNAE principal"), 3]])}
      ${linha([["Contato para assuntos relacionados ao Requerimento", `Nome: ${A(v.proc, "nome")} &nbsp; Telefone: ${A(v.procFone, "telefone")} &nbsp; E-mail: ${A(v.procEmail, "e-mail")}`, 3]])}
      <tr><td colspan="3" class="t">2 – ENDEREÇO PARA CORRESPONDÊNCIA</td></tr>
      ${linha([["Razão Social ou Nome", A(v.razao, "razão social"), 3]])}
      ${linha([["Endereço", A(v.end, "endereço"), 2], ["Bairro", A(v.bairro, "bairro")]])}
      ${linha([["Município/UF", A(v.mun, "município/UF")], ["CEP", A(v.cep, "CEP")], ["Telefone para Contato", A(v.procFone, "telefone")]])}
      <tr><td colspan="3" class="t">2 – OBJETO DA SOLICITAÇÃO</td></tr>
      ${linha([["Solicitação de Licenciamento Ambiental para (Tipo de Empreendimento)", gesc(PEDIDOS[p]), 3]])}
      ${linha([["Nome do Empreendimento", A(v.fantasia || v.razao, "nome"), 2], ["Coordenadas Geográficas (SIRGAS 2000)", `Latitude: ${A(v.lat, "latitude")}<br>Longitude: ${A(v.lon, "longitude")}`]])}
      ${linha([["Endereço", A(v.end, "endereço"), 2], ["Bairro", A(v.bairro, "bairro")]])}
      ${linha([["Município/UF", A(v.mun, "município/UF")], ["CEP", A(v.cep, "CEP")], ["Telefone para Contato", A(v.procFone, "telefone")]])}
      ${linha([["Informações Básicas para Enquadramento (preencher apenas os campos pertinentes)", `Área do terreno: ${A(v.terreno, "m²")} m² · Área construída: ${A(v.constr, "m²")} m² · Funcionários: ${A(v.func, "nº")}`, 3]])}
      ${linha([["Características da Atividade a ser Licenciada", `${A(v.cnae, "atividade")}${secs.length ? `; secundárias em funcionamento: ${secs.map(gesc).join("; ")}` : ""}. Horário: ${A(v.horario, "horário")}. Água: ${A(v.agua, "abastecimento")}. Esgoto: ${A(v.esgoto, "esgotamento")}. Resíduos: ${A(v.residuos, "destinação")}.`, 3]])}
      <tr><td colspan="3" class="t">3 – REQUERIMENTO</td></tr>
      <tr><td colspan="3">AO SENHOR PRESIDENTE DO INSTITUTO DO MEIO AMBIENTE DO ESTADO DE ALAGOAS<br>O Requerente supracitado vem mui respeitosamente à presença de V.S., requerer a expedição de (a):<br>
        ${mk(p === "lp")}Licença Prévia – LP &nbsp; ${mk(p === "li")}Licença de Instalação – LI &nbsp; ${mk(p === "lo")}Licença de Operação – LO &nbsp; ${mk(p === "las")}Licença Ambiental Simplificada (LAS)<br>
        Regularização de: ${mk(false)}LAS ${mk(p === "regli")}LI ${mk(p === "reglo")}LO &nbsp; Prorrogação/Renovação: ${mk(false)}LAS ${mk(false)}LP ${mk(false)}LI ${mk(p === "ren")}LO<br>
        Conforme elementos constantes das informações cadastradas e documentos anexos.<br>DECLARA, outrossim, que conhece a legislação ambiental e demais normas pertinentes ao licenciamento requerido, comprometendo-se a respeitá-la.<br><br>NESTES TERMOS, PEDE DEFERIMENTO.</td></tr>
      ${linha([["Local e Data", `${gesc(mun || v.local || "")}/AL, ${v.data ? v.data.split("-").reverse().join("/") : "<mark>data</mark>"}`], ["Assinatura do Requerente/Procurador (anexar procuração)", "<br><br>", 2]])}
      <tr><td colspan="3" class="t">4 – RECEBIMENTO DE DOCUMENTOS</td></tr>
      ${linha([["Documentos e Taxa Ambiental Conferidos Por: (Carimbo e Assinatura)", "<br><br>", 2], ["Data", "__/__/__"]])}</table>`];
  }
}
const gesc = (s) => esc(s);
const gmark = (s) => esc(s).replace(/==(.+?)==/g, "<mark>$1</mark>");
