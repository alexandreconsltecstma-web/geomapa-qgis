/* Painel PA – licença original e renovações.
   - PDF da licença (original e das renovadas): IndexedDB "pa_docs" (mesmo banco da aba Documentos), emp = "lic:<chave>".
   - Renovações registradas: localStorage "pa_ren" = { chave: [ { num, emi, ven, manter, reg } ] }.
   A chave é a licença ORIGINAL (CNPJ + tipo + nº), então continua valendo depois de renovar. */

let REN = ler("pa_ren", {});
const chaveLic = (l) => `${String(l.cnpj || "").replace(/\D/g, "") || String(l.nome).toLowerCase()}|${l.tipo}|${l.num}`;

/* chamado pelo montar(): troca os dados pela renovação mais recente */
function aplicarRenovacao(l) {
  const k = chaveLic(l), lista = REN[k];
  const base = { ...l, chave: k };
  if (!lista || !lista.length) return base;
  const r = lista[lista.length - 1], delta = Math.round((D(r.emi) - D(l.emi)) / 864e5);
  const rows = r.manter
    ? l.rows.filter((x) => x.tipo !== "Renovação").map((x) => ({ ...x, data: addD(x.data, delta) })).filter((x) => x.data <= r.ven)
        .concat([{ cond: "—", texto: "Pedir a renovação da licença (120 dias antes do vencimento)", data: addD(r.ven, -120), tipo: "Renovação" }])
        .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
    : [{ cond: "—", texto: "Pedir a renovação da licença (120 dias antes do vencimento)", data: addD(r.ven, -120), tipo: "Renovação" }];
  return { ...base, num: r.num, emi: r.emi, ven: r.ven, ren: addD(r.ven, -120), rows, renov: lista.length,
           orig: { num: l.num, emi: l.emi, ven: l.ven }, file: undefined, pdf: undefined };
}

/* versões da licença: original + cada renovação */
function versoes(l) {
  const o = l.orig || { num: l.num, emi: l.emi, ven: l.ven };
  return [{ n: 0, num: o.num, emi: o.emi, ven: o.ven, rot: "Original" }]
    .concat((REN[l.chave] || []).map((r, j) => ({ n: j + 1, num: r.num, emi: r.emi, ven: r.ven, rot: `Renovação ${j + 1}`, reg: r.reg })));
}

async function caixaLicenca(i) {
  const l = LIC[i], box = $("#licBox"); if (!box) return;
  const arqs = await arqDaEmpresa("lic:" + l.chave);
  const vs = versoes(l);
  box.innerHTML = `<div class="lic-box card">
    <div class="lic-cab"><h4>📄 Licença</h4>
      <div class="ferramentas" style="margin:0"><label class="btn claro peq">＋ Anexar PDF da licença atual<input type="file" accept=".pdf,image/*" hidden id="licArq"></label>
      <button class="btn peq" id="licRenovar" type="button">🔄 Registrar renovação</button></div></div>
    <table class="lic-vers"><thead><tr><th>Versão</th><th>Nº</th><th>Emissão</th><th>Vencimento</th><th>Arquivo</th></tr></thead><tbody>
    ${vs.slice().reverse().map((v) => { const a = arqs.filter((x) => x.item === "v" + v.n);
      return `<tr class="${v.n === vs.length - 1 ? "atual" : "antiga"}"><td><b>${v.rot}</b>${v.n === vs.length - 1 ? ` <span class="tag t-ok">em vigor</span>` : ""}</td>
      <td>${esc(v.num)}</td><td>${fd(v.emi)}</td><td>${fd(v.ven)}</td>
      <td>${a.length ? a.map((x) => `<span class="chip"><a href="#" data-ver-lic="${x.id}" title="${esc(x.nome)}">👁 Ver</a><button data-tirar-lic="${x.id}" aria-label="Tirar arquivo">×</button></span>`).join(" ")
        : v.n === 0 && LIC[i].orig === undefined && l.file ? `<a href="${esc(l.file)}" target="_blank" rel="noopener" class="mut">só o calendário</a>` : `<span class="mut">sem arquivo</span>`}</td></tr>`; }).join("")}
    </tbody></table>
    ${(REN[l.chave] || []).length ? `<button class="btn perigo peq" id="licDesfazer" type="button">Desfazer a última renovação</button>` : ""}
    <form id="licForm" hidden class="lic-form">
      <p><b>Nova licença (renovação)</b> – as entregas passam a contar desta emissão. A licença anterior fica guardada no histórico.</p>
      <div class="lic-campos">
        <label>Nº da nova licença<input name="num" required placeholder="ex.: 12/2027"></label>
        <label>Emissão<input name="emi" type="date" required></label>
        <label>Vencimento<input name="ven" type="date" required></label>
      </div>
      <label class="lic-chk"><input type="checkbox" name="manter" checked> Manter as mesmas condicionantes, com as datas recalculadas pela nova emissão</label>
      <p class="mut">Se a licença nova tiver condicionantes diferentes, desmarque e cadastre-as com <b>＋ Nova licença</b>.</p>
      <label>PDF da licença nova (opcional)<input name="arq" type="file" accept=".pdf,image/*"></label>
      <div class="ferramentas"><button class="btn" type="submit">Salvar renovação</button><button class="btn claro" type="button" id="licCancelar">Cancelar</button></div>
    </form></div>`;

  const guardarArq = async (f, n) => {
    if (!f) return;
    if (f.size > 40e6) { alert("Arquivo maior que 40 MB."); return; }
    await arqTx("readwrite", (s) => s.put({ id: `lic:${l.chave}|v${n}|${Date.now()}`, emp: "lic:" + l.chave, item: "v" + n, nome: f.name, tipo: f.type, tam: f.size, data: new Date().toISOString(), blob: f }))
      .catch(() => alert("Não consegui guardar o arquivo neste navegador."));
  };
  $("#licArq").onchange = async (ev) => { await guardarArq(ev.target.files[0], vs.length - 1); aviso("PDF da licença guardado"); caixaLicenca(i); };
  $("#licRenovar").onclick = () => {
    const f = $("#licForm"); f.hidden = false;
    const ven = D(l.ven); f.emi.value = l.ven < iso(HOJE) ? iso(HOJE) : l.ven;
    const v2 = D(f.emi.value); v2.setFullYear(v2.getFullYear() + (Math.round((ven - D(l.emi)) / 3.156e10) || 2)); f.ven.value = iso(v2);
    f.num.focus();
  };
  $("#licCancelar").onclick = () => { $("#licForm").hidden = true; };
  $("#licForm").onsubmit = async (ev) => {
    ev.preventDefault(); const f = ev.target;
    if (f.ven.value <= f.emi.value) { alert("O vencimento deve ser depois da emissão."); return; }
    (REN[l.chave] ||= []).push({ num: f.num.value.trim(), emi: f.emi.value, ven: f.ven.value, manter: f.manter.checked, reg: iso(HOJE) });
    gravar("pa_ren", REN);
    await guardarArq(f.arq.files[0], REN[l.chave].length);
    montar(); aviso(`Licença de ${curto(l.nome)} renovada: nº ${f.num.value.trim()}, vence em ${fd(f.ven.value)}`);
    detalhe(i);
  };
  $("#licDesfazer")?.addEventListener("click", () => {
    if (!confirm("Desfazer a última renovação registrada? A licença volta para a versão anterior (o PDF dela continua guardado).")) return;
    REN[l.chave].pop(); if (!REN[l.chave].length) delete REN[l.chave];
    gravar("pa_ren", REN); montar(); aviso("Renovação desfeita"); detalhe(i);
  });
  box.querySelectorAll("[data-ver-lic]").forEach((a) => (a.onclick = async (ev) => {
    ev.preventDefault(); const r = await arqTx("readonly", (s) => s.get(a.dataset.verLic)); if (!r) return;
    const url = URL.createObjectURL(r.blob); if (!window.open(url, "_blank")) { const x = document.createElement("a"); x.href = url; x.download = r.nome; x.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }));
  box.querySelectorAll("[data-tirar-lic]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Tirar este PDF do painel? (o arquivo no seu computador continua)")) return;
    await arqTx("readwrite", (s) => s.delete(b.dataset.tirarLic)); caixaLicenca(i);
  }));
}
