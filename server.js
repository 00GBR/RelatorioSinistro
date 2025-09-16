// =================================================================
// 1. IMPORTAÇÃO DAS BIBLIOTECAS NECESSÁRIAS
// =================================================================
const express = require("express");
const multer = require("multer");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

// =================================================================
// 2. CONFIGURAÇÃO DO SERVIDOR E DO UPLOAD
// =================================================================
const app = express();
const PORT = 3030;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage }).any();

// =================================================================
// 3. DEFINIÇÃO DAS ROTAS DO SISTEMA
// =================================================================

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/gerar-relatorio", upload, async (req, res) => {
  try {
    console.log("Recebida requisição para gerar relatório dinâmico...");
    const dados = req.body;
    const files = req.files;

    // Obtém os textos das sugestões (garantindo que seja um array)
    const sugestoesTextos = Array.isArray(dados.sugestoes)
      ? dados.sugestoes
      : dados.sugestoes
      ? [dados.sugestoes]
      : [];

    // Mapeia cada texto de sugestão para um objeto com seu texto e suas imagens
    const sugestoesComImagens = sugestoesTextos.map((texto, index) => {
      return {
        text: texto,
        images: files.filter(
          (f) => f.fieldname === `imagensSugestao[${index}]`
        ),
      };
    });

    // Organizando os dados e arquivos recebidos
    const reportData = {
      dadosGerais: {
        numeroSinistro: dados.numeroSinistro,
        numeroApolice: dados.numeroApolice,
        nomeSegurado: dados.nomeSegurado,
        dataOcorrencia: dados.dataOcorrencia,
        horaOcorrencia: dados.horaOcorrencia,
        localOcorrencia: dados.localOcorrencia,
      },
      sumario: {
        text: dados.sumario,
        images: files.filter((f) => f.fieldname === "imagensSumario"),
      },
      objetivo: {
        text: dados.objetivo,
        images: files.filter((f) => f.fieldname === "imagensObjetivo"),
      },
      agradecimentos: {
        text: dados.agradecimentos,
        images: files.filter((f) => f.fieldname === "imagensAgradecimentos"),
      },
      fluxoTransporte: {
        text: dados.textoFluxoTransporte,
        images: files.filter((f) => f.fieldname === "imagensFluxoTransporte"),
      },
      inspecaoCarga: {
        text: dados.inspecaoCarga,
        images: files.filter((f) => f.fieldname === "imagensInspecaoCarga"),
      },
      inspecaoEntrega: {
        text: dados.inspecaoEntrega,
        images: files.filter((f) => f.fieldname === "imagensInspecaoEntrega"),
      },
      conclusao: {
        text: dados.conclusao,
        images: files.filter((f) => f.fieldname === "imagensConclusao"),
      },
      sugestoes: sugestoesComImagens,
      operacoes: [],
      analises: [],
      pessoasEnvolvidas: {
        principal: {
          nome: dados.nomeSegurado,
          funcao: dados.funcaoPrincipal,
          empresa: dados.empresaPrincipal,
        },
        outros: [],
      },
      localData: { local: dados.localRelatorio, data: dados.dataRelatorio },
    };

    // Processando as operações dinâmicas
    if (dados.operationName) {
      const nomesOperacao = Array.isArray(dados.operationName)
        ? dados.operationName
        : [dados.operationName];
      const descricoesOperacao = Array.isArray(dados.operationDescription)
        ? dados.operationDescription
        : [dados.operationDescription];
      nomesOperacao.forEach((nome, index) => {
        reportData.operacoes.push({
          name: nome,
          description: descricoesOperacao[index],
          images: files.filter(
            (f) => f.fieldname === `operationImages[${index}]`
          ),
        });
      });
    }

    // Processando as análises dinâmicas
    if (dados.textoAnalise) {
      const textosAnalise = Array.isArray(dados.textoAnalise)
        ? dados.textoAnalise
        : [dados.textoAnalise];
      textosAnalise.forEach((texto, index) => {
        reportData.analises.push({
          text: texto,
          images: files.filter(
            (f) => f.fieldname === `imagensAnalise[${index}]`
          ),
        });
      });
    }

    // Processando os outros responsáveis
    if (dados.outrasPessoasNomes) {
      const nomes = Array.isArray(dados.outrasPessoasNomes)
        ? dados.outrasPessoasNomes
        : [dados.outrasPessoasNomes];
      const funcoes = Array.isArray(dados.outrasPessoasFuncoes)
        ? dados.outrasPessoasFuncoes
        : [dados.outrasPessoasFuncoes];
      const empresas = Array.isArray(dados.outrasPessoasEmpresas)
        ? dados.outrasPessoasEmpresas
        : [dados.outrasPessoasEmpresas];

      nomes.forEach((nome, index) => {
        if (nome || funcoes[index] || empresas[index]) {
          reportData.pessoasEnvolvidas.outros.push({
            nome: nome || "",
            funcao: funcoes[index] || "",
            empresa: empresas[index] || "",
          });
        }
      });
    }

    const htmlContent = gerarHTMLRelatorioDetalhado(reportData);
    console.log("HTML do relatório dinâmico gerado.");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });
    const logoPath = path.join(
      __dirname,
      "public",
      "imagens",
      "logoSompoSeguros.jpeg"
    );
    const logoSompoBase64 = `data:image/jpeg;base64,${fs
      .readFileSync(logoPath)
      .toString("base64")}`;
    const headerTemplate = `<div style="padding-left: 25px;"><img src="${logoSompoBase64}" alt="Logo" style="height: 40px; width: auto;" /></div>`;
    const footerTemplate = `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 9px; width: 100%; display: flex; justify-content: space-between; padding: 10px 25px 0 25px; border-top: 1px solid #ccc;"><span>Documento Confidencial - Sompo Seguros</span><div>Página <span class="pageNumber"></span> de <span class="totalPages"></span></div></div>`;
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "70px", right: "25px", bottom: "50px", left: "25px" },
      displayHeaderFooter: true,
      headerTemplate: headerTemplate,
      footerTemplate: footerTemplate,
    });
    await browser.close();
    console.log("PDF detalhado gerado com sucesso.");
    if (files) {
      files.forEach((file) => {
        if (file && file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      console.log("Imagens temporárias removidas.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Relatorio_Sinistro_${
        dados.numeroSinistro || "geral"
      }.pdf`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("ERRO AO GERAR RELATÓRIO:", error);
    res
      .status(500)
      .send(
        "Ocorreu um erro interno ao gerar o relatório. Verifique o console do servidor para mais detalhes."
      );
  }
});

// =================================================================
// 4. INICIALIZAÇÃO DO SERVIDOR
// =================================================================
app.listen(PORT, () => {
  console.log(`\n=======================================================`);
  console.log(`  SERVIDOR DO GERADOR DE RELATÓRIOS INICIADO`);
  console.log(`  Acesse http://localhost:${PORT} no seu navegador`);
  console.log(`=======================================================`);
});

// =================================================================
// 5. FUNÇÃO TEMPLATE DO RELATÓRIO PDF
// =================================================================
function gerarHTMLRelatorioDetalhado(data) {
  const { dadosGerais } = data;

  const formatarData = (dataInput) => {
    if (!dataInput) return null;
    const dataOcorrencia = new Date(dataInput + "T00:00:00");
    return dataOcorrencia.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  };

  const dataFormatada = formatarData(dadosGerais.dataOcorrencia);

  const criarGaleria = (imagens) => {
    if (!imagens || imagens.length === 0) return "";
    let galeriaHTML = '<div class="image-gallery">';
    imagens.forEach((file) => {
      const imgBase64 = `data:${file.mimetype};base64,${fs
        .readFileSync(file.path)
        .toString("base64")}`;
      galeriaHTML += `<div class="image-item"><img src="${imgBase64}" alt="Foto do Relatório"></div>`;
    });
    galeriaHTML += "</div>";
    return galeriaHTML;
  };

  const p = (texto) => (texto ? `<p>${texto.replace(/\n/g, "<br>")}</p>` : "");

  const criarSecaoComGaleria = (titulo, sectionData) => {
    if (
      !sectionData ||
      (!sectionData.text &&
        (!sectionData.images || sectionData.images.length === 0))
    ) {
      return "";
    }
    const textContent = sectionData.text ? p(sectionData.text) : "";
    const imageContent = sectionData.images
      ? criarGaleria(sectionData.images)
      : "";
    return `<div class="section"><div class="section-title">${titulo}</div><div class="section-content">${textContent}${imageContent}</div></div>`;
  };

  const criarSecaoDadosGerais = (dados) => {
    let tableRows = [];
    if (dados.numeroSinistro) {
      tableRows.push(
        `<tr><td class="label">Nº do Sinistro:</td><td>${dados.numeroSinistro}</td></tr>`
      );
    }
    if (dados.numeroApolice) {
      tableRows.push(
        `<tr><td class="label">Nº da Apólice:</td><td>${dados.numeroApolice}</td></tr>`
      );
    }
    if (dados.nomeSegurado) {
      tableRows.push(
        `<tr><td class="label">Segurado:</td><td>${dados.nomeSegurado}</td></tr>`
      );
    }
    const dataHoraString = [
      dataFormatada || null,
      dados.horaOcorrencia ? "às " + dados.horaOcorrencia : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (dataHoraString) {
      tableRows.push(
        `<tr><td class="label">Data e Hora:</td><td>${dataHoraString}</td></tr>`
      );
    }
    if (dados.localOcorrencia) {
      tableRows.push(
        `<tr><td class="label">Local:</td><td>${dados.localOcorrencia}</td></tr>`
      );
    }

    if (tableRows.length === 0) return "";

    const conteudoTabela = `<table>${tableRows.join("")}</table>`;
    return `<div class="section"><div class="section-title">Dados Gerais</div><div class="section-content">${conteudoTabela}</div></div>`;
  };

  const conteudoOperacoes = data.operacoes
    .map((op) => {
      if (!op.name && !op.description && (!op.images || op.images.length === 0))
        return "";
      const sectionData = { text: op.description, images: op.images };
      const tituloOperacao = op.name || "Detalhes da Operação";
      return criarSecaoComGaleria(tituloOperacao, sectionData);
    })
    .join("");

  const criarSecaoAnalises = (analises) => {
    if (!analises || analises.length === 0) return "";

    const conteudoAnalises = analises
      .map((analise, index) => {
        if (!analise.text && (!analise.images || analise.images.length === 0))
          return null;
        return `<div class="sub-section"><h4>Análise ${index + 1}</h4>${p(
          analise.text
        )}${criarGaleria(analise.images)}</div>`;
      })
      .filter(Boolean)
      .join("");

    if (!conteudoAnalises) return "";

    return `<div class="section"><div class="section-title">Análise Realizada</div><div class="section-content">${conteudoAnalises}</div></div>`;
  };

  const criarSecaoConclusao = (conclusao, sugestoes) => {
    const hasConclusaoText = conclusao && conclusao.text;
    const hasConclusaoImages =
      conclusao && conclusao.images && conclusao.images.length > 0;
    const validSugestoes = sugestoes
      ? sugestoes.filter((s) => s.text || (s.images && s.images.length > 0))
      : [];
    const hasSugestoes = validSugestoes.length > 0;

    if (!hasConclusaoText && !hasConclusaoImages && !hasSugestoes) {
      return "";
    }

    const textContent = hasConclusaoText ? p(conclusao.text) : "";
    const imageContent = hasConclusaoImages
      ? criarGaleria(conclusao.images)
      : "";
    let sugestoesHtml = "";

    if (hasSugestoes) {
      sugestoesHtml += '<h4 class="sugestoes-title">Sugestões de Ações:</h4>';
      sugestoesHtml += '<ol class="sugestoes-list">';
      validSugestoes.forEach((sugestao) => {
        sugestoesHtml += `<li>${
          sugestao.text ? p(sugestao.text) : ""
        }${criarGaleria(sugestao.images)}</li>`;
      });
      sugestoesHtml += "</ol>";
    }
    return `<div class="section"><div class="section-title">Conclusão e Sugestões</div><div class="section-content">${textContent}${imageContent}${sugestoesHtml}</div></div>`;
  };

  const criarSecaoEncerramento = (pessoasData, localData) => {
    let dataFormatadaLocal = "____ de __________ de ______";
    const hoje = new Date();
    const dataBase =
      localData && localData.data
        ? new Date(localData.data + "T00:00:00")
        : hoje;

    if (localData && localData.data) {
      dataFormatadaLocal = dataBase.toLocaleDateString("pt-BR", {
        timeZone: "UTC",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } else {
      dataFormatadaLocal = dataBase.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }

    const local =
      localData && localData.local ? localData.local : "____________________";
    const localDataHtml = `<p class="local-data">${local}, ${dataFormatadaLocal}.</p>`;

    let assinaturasHtml = '<div class="assinaturas-container">';
    const todasPessoas = [
      pessoasData ? pessoasData.principal : null,
      ...((pessoasData && pessoasData.outros) || []),
    ].filter(Boolean);

    todasPessoas.forEach((pessoa) => {
      if (pessoa.nome || pessoa.funcao || pessoa.empresa) {
        let blockContent = "";
        // Ordem: Função, Nome, Empresa
        if (pessoa.funcao) {
          blockContent += `${pessoa.funcao}<br>`;
        }
        if (pessoa.nome) {
          // Se o nome do segurado for repetido na principal, removemos aqui para não duplicar.
          // Mas, como agora o principal é só um bloco, deixaremos como está.
          blockContent += `${pessoa.nome}<br>`;
        }
        if (pessoa.empresa) {
          blockContent += `${pessoa.empresa}`;
        }

        assinaturasHtml += `
              <div class="assinatura-block">
                <div class="linha-assinatura"></div>
                <p class="nome-assinatura" style="line-height: 1.4; text-align: center;">
                  ${blockContent}
                </p>
              </div>
            `;
      }
    });

    assinaturasHtml += "</div>";

    const temAlgumaAssinatura = todasPessoas.some(
      (p) => p.nome || p.funcao || p.empresa
    );
    if (!temAlgumaAssinatura) {
      assinaturasHtml = "";
    }

    return `<div class="section"><div class="section-title">Validação e Encerramento</div><div class="section-content">${localDataHtml}${assinaturasHtml}</div></div>`;
  };

  const secaoDadosGerais = criarSecaoDadosGerais(dadosGerais);
  const secaoAnalises = criarSecaoAnalises(data.analises);
  const secaoConclusao = criarSecaoConclusao(data.conclusao, data.sugestoes);
  const secaoEncerramento = criarSecaoEncerramento(
    data.pessoasEnvolvidas,
    data.localData
  );

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Relatório de Análise de Sinistro - Sompo Seguros</title>
        <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; font-size: 11px; line-height: 1.5; }
            .container { width: 100%; margin: 0 auto; }
            h1 { font-size: 22px; font-weight: bold; color: #333; text-align: center; margin-bottom: 30px; }
            .section { margin-top: 20px; page-break-inside: avoid; }
            .section-title { background-color: #f2f2f2; padding: 8px 12px; font-weight: bold; font-size: 14px; border: 1px solid #ddd; border-bottom: 2px solid #c8102e; }
            .section-content { padding: 15px; border: 1px solid #ddd; border-top: none; }
            .section-content p { margin: 0 0 10px 0; text-align: justify; white-space: pre-wrap; }
            .sub-section { border-left: 3px solid #eee; padding-left: 15px; margin-top: 15px; page-break-inside: avoid; }
            .sub-section h4 { margin-top: 0; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
            td, th { padding: 8px; border: 1px solid #eee; vertical-align: top; text-align: left;}
            td.label { font-weight: bold; width: 25%; background-color: #fafafa; }
            .image-gallery { margin-top: 15px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .image-item img { max-width: 100%; height: auto; display: block; border: 1px solid #ccc; padding: 2px; }
            .sugestoes-title { margin-top: 20px; font-size: 12px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .sugestoes-list { padding-left: 20px; margin-top: 10px; }
            .sugestoes-list li { margin-bottom: 8px; }
            .sugestoes-list li .image-gallery { margin-top: 10px; }
            .local-data { text-align: center; font-size: 11px; margin: 40px 0; }
            .assinaturas-container { display: flex; flex-wrap: wrap; justify-content: center; gap: 40px; margin-top: 20px; }
            .assinatura-block { flex: 1; min-width: 200px; max-width: 250px; text-align: center; }
            .linha-assinatura { border-bottom: 1px solid #333; height: 20px; margin-bottom: 5px; }
            .nome-assinatura { font-size: 10px; margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Relatório de Análise de Sinistro</h1>
            ${secaoDadosGerais}
            ${criarSecaoComGaleria("Sumário", data.sumario)}
            ${criarSecaoComGaleria("Objetivo", data.objetivo)}
            ${criarSecaoComGaleria("Agradecimentos", data.agradecimentos)}
            ${criarSecaoComGaleria(
              "Fluxo da Operação de Transporte",
              data.fluxoTransporte
            )}
            ${conteudoOperacoes}
            ${secaoAnalises}
            ${criarSecaoComGaleria(
              "Inspeção de Carga e Análise de Inconsistências",
              data.inspecaoCarga
            )}
            ${criarSecaoComGaleria(
              "Inspeção de Entrega na Concessionária",
              data.inspecaoEntrega
            )}
            ${secaoConclusao}
            ${secaoEncerramento}
        </div>
    </body>
    </html>
    `;
}
