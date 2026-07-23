const PDF = (() => {
  function ensure() {
    if (!window.jspdf) {
      throw new Error("jsPDF ainda não carregou. Tente novamente.");
    }
    return window.jspdf.jsPDF;
  }

  function header(doc, empresa, titulo, subtitulo) {
    doc.setFillColor(15, 22, 32);
    doc.rect(0, 0, 210, 36, "F");
    doc.setTextColor(47, 155, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(empresa.nome || "VoltES Elétrica", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(180, 190, 205);
    doc.setFont("helvetica", "normal");
    const contato = [empresa.telefone, empresa.email, empresa.endereco].filter(Boolean).join("  ·  ");
    doc.text(contato || "Espírito Santo — Brasil", 14, 24);
    doc.setTextColor(30, 224, 160);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(titulo, 196, 16, { align: "right" });
    if (subtitulo) {
      doc.setTextColor(180, 190, 205);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(subtitulo, 196, 24, { align: "right" });
    }
  }

  function orcamento(orc, cliente, empresa) {
    const jsPDF = ensure();
    const doc = new jsPDF();
    header(doc, empresa, "ORÇAMENTO", orc.codigo || "");

    let y = 48;
    doc.setTextColor(30, 40, 55);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(orc.titulo || "Orçamento de serviços elétricos", 14, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 90, 105);
    doc.text(`Cliente: ${cliente?.nome || "—"}`, 14, y);
    y += 6;
    doc.text(`Documento: ${cliente?.documento || "—"}  |  Tel: ${cliente?.telefone || "—"}`, 14, y);
    y += 6;
    doc.text(`Endereço: ${cliente?.endereco || "—"}`, 14, y);
    y += 6;
    doc.text(`Data: ${formatDate(orc.data)}  |  Validade: ${orc.validade || 30} dias  |  Prazo: ${orc.prazo || "—"}`, 14, y);
    y += 10;

    const rows = (orc.itens || []).map((item, i) => [
      String(i + 1),
      item.nome,
      item.tipo === "servico" ? "Serviço" : "Material",
      String(item.qtd),
      money(item.preco),
      money(item.qtd * item.preco)
    ]);

    doc.autoTable({
      startY: y,
      head: [["#", "Descrição", "Tipo", "Qtd", "Unitário", "Total"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [47, 155, 255], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 248, 252] }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    const subtotal = orc.itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    const desconto = Number(orc.desconto || 0);
    const total = Math.max(0, subtotal - desconto);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 90, 105);
    doc.text(`Subtotal: ${money(subtotal)}`, 196, finalY, { align: "right" });
    doc.text(`Desconto: ${money(desconto)}`, 196, finalY + 6, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 30, 45);
    doc.text(`Total: ${money(total)}`, 196, finalY + 14, { align: "right" });

    if (orc.observacoes) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Observações", 14, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 90, 105);
      const lines = doc.splitTextToSize(orc.observacoes, 120);
      doc.text(lines, 14, finalY + 14);
    }

    doc.setFontSize(8);
    doc.setTextColor(140, 150, 165);
    doc.text("Valores de referência baseados em médias do mercado no Espírito Santo. Proposta sujeita a vistoria.", 14, 285);

    doc.save(`${orc.codigo || "orcamento"}.pdf`);
  }

  function contrato(contrato, cliente, empresa) {
    const jsPDF = ensure();
    const doc = new jsPDF();
    header(doc, empresa, "CONTRATO", contrato.codigo || "");

    let y = 48;
    doc.setTextColor(30, 40, 55);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(contrato.titulo || "Contrato de manutenção elétrica", 14, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 70, 85);
    const texto = [
      `CONTRATANTE: ${cliente?.nome || "—"}, documento ${cliente?.documento || "—"}, endereço ${cliente?.endereco || "—"}.`,
      `CONTRATADA: ${empresa.nome || "—"}, ${empresa.endereco || "Espírito Santo"}, telefone ${empresa.telefone || "—"}.`,
      "",
      `Objeto: ${contrato.titulo || "Prestação de serviços elétricos"}.`,
      `Valor mensal: ${money(contrato.valorMensal)}.`,
      `Duração: ${contrato.meses} meses (total estimado ${money(contrato.valorMensal * contrato.meses)}).`,
      `Dia de pagamento: dia ${contrato.diaPagamento || 10} de cada mês.`,
      `Início: ${formatDate(contrato.inicio)}  |  Término: ${formatDate(contrato.termino)}.`,
      "",
      "Observações:",
      contrato.observacoes || "Os serviços serão agendados com antecedência mínima de 48 horas."
    ].join("\n");

    const lines = doc.splitTextToSize(texto, 180);
    doc.text(lines, 14, y);

    y = 230;
    doc.text("_______________________________", 14, y);
    doc.text("_______________________________", 120, y);
    doc.text("Contratada", 14, y + 6);
    doc.text("Contratante", 120, y + 6);
    doc.text(`${empresa.cidade || "Vitória"}/${empresa.estado || "ES"}, ${formatDate(todayISO())}`, 14, y + 24);

    doc.save(`${contrato.codigo || "contrato"}.pdf`);
  }

  function financeiro(resumo, empresa) {
    const jsPDF = ensure();
    const doc = new jsPDF();
    header(doc, empresa, "RELATÓRIO", resumo.periodo);

    let y = 50;
    doc.setTextColor(30, 40, 55);
    doc.setFontSize(11);
    doc.text(`Entradas: ${money(resumo.entradas)}`, 14, y);
    doc.text(`Saídas: ${money(resumo.saidas)}`, 14, y + 8);
    doc.text(`${resumo.labelFixas || "Custo oculto embutido"}: ${money(resumo.fixas)}`, 14, y + 16);
    doc.setFont("helvetica", "bold");
    doc.text(`Saldo (entradas − saídas): ${money(resumo.saldo)}`, 14, y + 28);

    let startY = y + 40;
    if (resumo.despesasGlobais?.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 40, 55);
      doc.text("Despesas globais (todos os serviços)", 14, startY);
      doc.autoTable({
        startY: startY + 4,
        head: [["Despesa", "Escopo", "Valor", "Status"]],
        body: resumo.despesasGlobais.map((d) => [
          d.nome,
          "Todos",
          money(d.valor),
          d.ativo === false ? "off" : "ativa"
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [47, 155, 255] }
      });
      startY = doc.lastAutoTable.finalY + 10;
    }
    if (resumo.despesasServico?.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 40, 55);
      doc.text("Despesas extras por serviço", 14, startY);
      doc.autoTable({
        startY: startY + 4,
        head: [["Serviço", "Despesa", "Valor embutido"]],
        body: resumo.despesasServico.map((d) => [
          d.servicoNome || d.servicoId,
          d.nome,
          money(d.valor)
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [47, 155, 255] }
      });
      startY = doc.lastAutoTable.finalY + 10;
    }

    const rows = resumo.lancamentos.map((l) => [
      formatDate(l.data),
      l.descricao,
      l.tipo === "entrada" ? "Entrada" : "Saída",
      l.categoria,
      money(l.valor)
    ]);

    doc.autoTable({
      startY,
      head: [["Data", "Descrição", "Tipo", "Categoria", "Valor"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [47, 155, 255] }
    });

    doc.save(`financeiro-${resumo.periodo}.pdf`);
  }

  return { orcamento, contrato, financeiro };
})();
