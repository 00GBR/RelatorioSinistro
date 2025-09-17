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
const PORT = 3000;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage }).any();

app.use(express.static("public"));

// =================================================================
// 2.1 Helper: localizar logo por marca (no /public/imagens)
// =================================================================
function getMarcaLogoBase64(marca) {
  if (!marca) return null;
  const base = path.join(__dirname, "public", "imagens");

  const candidates = {
    honda: ["Honda.jpg", "honda.jpg", "honda.png", "logo-honda.png"],
    yamaha: ["yamaha.png", "Yamaha.png", "Yamaha.jpg"],
    ford: ["Ford.jpg", "ford.jpg", "ford.png", "logo-ford.png"],
  };

  const list = candidates[marca.toLowerCase()];
  if (!list) return null;

  for (const file of list) {
    const p = path.join(base, file);
    if (fs.existsSync(p)) {
      const b64 = fs.readFileSync(p).toString("base64");
      const ext = path.extname(p).toLowerCase().replace(".", "") || "png";
      return `data:image/${ext};base64,${b64}`;
    }
  }
  return null;
}

// =================================================================
// 3. ROTAS
// =================================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// helper: pegar arquivos por baseName (aceita [], [0], etc)
function pickFiles(files, baseName) {
  return (files || []).filter(
    (f) =>
      f.fieldname === baseName ||
      f.fieldname === `${baseName}[]` ||
      f.fieldname.startsWith(`${baseName}[`)
  );
}

app.post("/gerar-relatorio", upload, async (req, res) => {
  try {
    const dados = req.body;
    const files = req.files || [];

    // Sugestões (texto + imagens)
    const sugestoesTextos = Array.isArray(dados.sugestoes)
      ? dados.sugestoes
      : dados.sugestoes
      ? [dados.sugestoes]
      : [];

    const sugestoesComImagens = sugestoesTextos.map((texto, index) => ({
      text: texto,
      images: files.filter((f) => f.fieldname === `imagensSugestao[${index}]`),
    }));

    // Montagem dos dados
    const reportData = {
      dadosGerais: {
        numeroSinistro: dados.numeroSinistro,
        numeroApolice: dados.numeroApolice,
        nomeSegurado: dados.nomeSegurado,
        dataOcorrencia: dados.dataOcorrencia,
        horaOcorrencia: dados.horaOcorrencia,
        localOcorrencia: dados.localOcorrencia,
      },

      sumario: { text: dados.sumario, images: pickFiles(files, "imagensSumario") },
      objetivo: { text: dados.objetivo, images: pickFiles(files, "imagensObjetivo") },

      metodologia: {
        text: dados.metodologia,
        images: pickFiles(files, "imagensMetodologia"),
      },

      agradecimentos: {
        text: dados.agradecimentos,
        images: pickFiles(files, "imagensAgradecimentos"),
      },

      fluxoTransporte: {
        text: dados.textoFluxoTransporte,
        images: pickFiles(files, "imagensFluxoTransporte"),
      },

      inspecaoCarga: {
        text: dados.inspecaoCarga,
        images: pickFiles(files, "imagensInspecaoCarga"),
      },

      inspecaoEntrega: {
        text: dados.inspecaoEntrega,
        images: pickFiles(files, "imagensInspecaoEntrega"),
      },

      conclusao: {
        text: dados.conclusao,
        images: pickFiles(files, "imagensConclusao"),
      },
      sugestoes: sugestoesComImagens,

      operacoes: [],
      analises: [],

      pessoasEnvolvidas: {
        principal: {
          nome: dados.nomeResponsavelPrincipal || dados.nomeSegurado || "",
          funcao: dados.funcaoPrincipal || "",
          empresa: dados.empresaPrincipal || "",
        },
        outros: [],
      },

      marcaSelecionada: (dados.asseguradoMarca || "").toLowerCase(),

      localData: {
        local: dados.localRelatorio,
        data: dados.dataRelatorio,
      },
    };

    // Operações dinâmicas
    if (dados.operationName) {
      const nomes = Array.isArray(dados.operationName)
        ? dados.operationName
        : [dados.operationName];
      const descs = Array.isArray(dados.operationDescription)
        ? dados.operationDescription
        : [dados.operationDescription];

      nomes.forEach((n, i) => {
        reportData.operacoes.push({
          name: n,
          description: descs[i],
          images: files.filter((f) => f.fieldname === `operationImages[${i}]`),
        });
      });
    }

    // Análises dinâmicas
    if (dados.textoAnalise) {
      const textos = Array.isArray(dados.textoAnalise)
        ? dados.textoAnalise
        : [dados.textoAnalise];
      textos.forEach((t, i) => {
        reportData.analises.push({
          text: t,
          images: files.filter((f) => f.fieldname === `imagensAnalise[${i}]`),
        });
      });
    }

    // Responsáveis adicionais
    if (
      dados.outrasPessoasNomes ||
      dados.outrasPessoasFuncoes ||
      dados.outrasPessoasEmpresas
    ) {
      const nomes = Array.isArray(dados.outrasPessoasNomes)
        ? dados.outrasPessoasNomes
        : [dados.outrasPessoasNomes || ""];
      const funcoes = Array.isArray(dados.outrasPessoasFuncoes)
        ? dados.outrasPessoasFuncoes
        : [dados.outrasPessoasFuncoes || ""];
      const empresas = Array.isArray(dados.outrasPessoasEmpresas)
        ? dados.outrasPessoasEmpresas
        : [dados.outrasPessoasEmpresas || ""];
      const total = Math.max(nomes.length, funcoes.length, empresas.length);

      for (let i = 0; i < total; i++) {
        const nome = nomes[i] || "";
        const funcao = funcoes[i] || "";
        const empresa = empresas[i] || "";
        if (nome || funcao || empresa) {
          reportData.pessoasEnvolvidas.outros.push({ nome, funcao, empresa });
        }
      }
    }

    // HTML + PDF
    const html = gerarHTMLRelatorioDetalhado(reportData);
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // <<< AQUI: "load" para evitar espera indefinida >>>
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });

    const sompoPath = path.join(
      __dirname,
      "public",
      "imagens",
      "logoSompoSeguros.jpeg"
    );
    const sompoB64 = `data:image/jpeg;base64,${fs.readFileSync(sompoPath).toString(
      "base64"
    )}`;
    const headerTemplate = `<div style="padding-left:25px;">
      <img src="${sompoB64}" style="height:40px;width:auto;" />
    </div>`;
    const footerTemplate = `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 9px; width: 100%; display: flex; justify-content: space-between; padding: 10px 25px 0 25px; border-top: 1px solid #ccc;">
      <span>Documento Confidencial - Sompo Seguros</span>
      <div>Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
    </div>`;

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "70px", right: "25px", bottom: "50px", left: "25px" },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });

    await browser.close();

    // Limpeza
    for (const f of files) {
      if (f && f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Relatorio_Sinistro_${dados.numeroSinistro || "geral"}.pdf`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("ERRO AO GERAR RELATÓRIO:", err);
    res.status(500).send("Erro interno ao gerar o relatório.");
  }
});

// =================================================================
// 4. START
// =================================================================
app.listen(PORT, () => {
  console.log(`\n=======================================================`);
  console.log(`  SERVIDOR DO GERADOR DE RELATÓRIOS INICIADO`);
  console.log(`  Acesse http://localhost:${PORT} no seu navegador`);
  console.log(`=======================================================`);
});

// =================================================================
// 5. TEMPLATE HTML DO PDF
// =================================================================
function gerarHTMLRelatorioDetalhado(data) {
  const { dadosGerais } = data;

  const formatarData = (d) => {
    if (!d) return null;
    const x = new Date(d + "T00:00:00");
    return x.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  };
  const dataFormatada = formatarData(dadosGerais.dataOcorrencia);

  // ====== GALERIA UNIFORME (1..6 imagens) ======
  const criarGaleria = (imagens) => {
    if (!imagens || imagens.length === 0) return "";
    const n = imagens.length;
    const cols = n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
    const isSingle = n === 1;
    const ratio = isSingle ? "16 / 9" : "4 / 3";
    const cls = isSingle ? "image-gallery one" : "image-gallery";

    let html = `<div class="${cls}" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;">`;
    imagens.forEach((file) => {
      const imgB64 = `data:${file.mimetype};base64,${fs
        .readFileSync(file.path)
        .toString("base64")}`;
      html += `<div class="image-item" style="aspect-ratio:${ratio};">
        <img src="${imgB64}" alt="Foto do Relatório"/>
      </div>`;
    });
    html += `</div>`;
    return html;
  };

  const p = (t) => (t ? `<p>${String(t).replace(/\n/g, "<br>")}</p>` : "");

  const criarSecaoComGaleria = (titulo, section) => {
    if (!section || (!section.text && (!section.images || !section.images.length)))
      return "";
    return `
      <div class="section">
        <div class="section-title">${titulo}</div>
        <div class="section-content">
          ${section.text ? p(section.text) : ""}
          ${section.images ? criarGaleria(section.images) : ""}
        </div>
      </div>`;
  };

  const criarSecaoDadosGerais = (d) => {
    const rows = [];
    if (d.numeroSinistro)
      rows.push(`<tr><td class="label">Nº do Sinistro:</td><td>${d.numeroSinistro}</td></tr>`);
    if (d.numeroApolice)
      rows.push(`<tr><td class="label">Nº da Apólice:</td><td>${d.numeroApolice}</td></tr>`);
    if (d.nomeSegurado)
      rows.push(`<tr><td class="label">Segurado:</td><td>${d.nomeSegurado}</td></tr>`);

    const dh = [dataFormatada || null, d.horaOcorrencia ? "às " + d.horaOcorrencia : null]
      .filter(Boolean)
      .join(" ");
    if (dh) rows.push(`<tr><td class="label">Data e Hora:</td><td>${dh}</td></tr>`);
    if (d.localOcorrencia)
      rows.push(`<tr><td class="label">Local:</td><td>${d.localOcorrencia}</td></tr>`);

    if (!rows.length) return "";
    return `
      <div class="section">
        <div class="section-title">Dados Gerais</div>
        <div class="section-content"><table>${rows.join("")}</table></div>
      </div>`;
  };

  const conteudoOperacoes = (data.operacoes || [])
    .map((op) => {
      if (!op.name && !op.description && (!op.images || !op.images.length)) return "";
      return criarSecaoComGaleria(op.name || "Detalhes da Operação", {
        text: op.description,
        images: op.images,
      });
    })
    .join("");

  const criarSecaoAnalises = (arr) => {
    if (!arr || !arr.length) return "";
    const inner = arr
      .map((a, i) => {
        if (!a.text && (!a.images || !a.images.length)) return null;
        return `<div class="sub-section"><h4>Análise ${i + 1}</h4>${p(a.text)}${
          a.images ? criarGaleria(a.images) : ""
        }</div>`;
      })
      .filter(Boolean)
      .join("");
    if (!inner) return "";
    return `
      <div class="section">
        <div class="section-title">Análise Realizada</div>
        <div class="section-content">${inner}</div>
      </div>`;
  };

  const criarSecaoConclusao = (conclusao, sugestoes) => {
    const hasC = conclusao && (conclusao.text || (conclusao.images && conclusao.images.length));
    const valids = (sugestoes || []).filter((s) => s.text || (s.images && s.images.length));
    if (!hasC && !valids.length) return "";
    let html = "";
    if (hasC) {
      html += (conclusao.text ? p(conclusao.text) : "") +
        (conclusao.images ? criarGaleria(conclusao.images) : "");
    }
    if (valids.length) {
      html += '<h4 class="sugestoes-title">Sugestões de Ações:</h4><ol class="sugestoes-list">';
      valids.forEach((s) => {
        html += `<li>${s.text ? p(s.text) : ""}${s.images ? criarGaleria(s.images) : ""}</li>`;
      });
      html += "</ol>";
    }
    return `
      <div class="section">
        <div class="section-title">Conclusão e Sugestões</div>
        <div class="section-content">${html}</div>
      </div>`;
  };

  const criarSecaoEncerramento = (pessoas, localData) => {
    const hoje = new Date();
    const base = localData && localData.data ? new Date(localData.data + "T00:00:00") : hoje;
    const dataFmt = base.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const local = (localData && localData.local) || "____________________";
    const localHtml = `<p class="local-data">${local}, ${dataFmt}.</p>`;

    let assinaturas = '<div class="assinaturas-container">';
    const todos = [pessoas ? pessoas.principal : null, ...((pessoas && pessoas.outros) || [])].filter(Boolean);

    todos.forEach((p) => {
      if (p.nome || p.funcao || p.empresa) {
        let block = "";
        if (p.funcao) block += `${p.funcao}<br>`;
        if (p.nome) block += `${p.nome}<br>`;
        if (p.empresa) block += `${p.empresa}`;
        assinaturas += `
          <div class="assinatura-block">
            <div class="linha-assinatura"></div>
            <p class="nome-assinatura" style="line-height:1.4;text-align:center;">${block}</p>
          </div>`;
      }
    });
    assinaturas += "</div>";
    if (!todos.some((x) => x.nome || x.funcao || x.empresa)) assinaturas = "";

    return `
      <div class="section">
        <div class="section-title">Validação e Encerramento</div>
        <div class="section-content">${localHtml}${assinaturas}</div>
      </div>`;
  };

  // Logo da marca (se houver)
  const marcaLogo = getMarcaLogoBase64(data.marcaSelecionada);

  const secaoDadosGerais = criarSecaoDadosGerais(dadosGerais);
  const secaoAnalises = criarSecaoAnalises(data.analises);
  const secaoConclusao = criarSecaoConclusao(data.conclusao, data.sugestoes);
  const secaoEncerramento = criarSecaoEncerramento(data.pessoasEnvolvidas, data.localData);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Análise de Sinistro - Sompo Seguros</title>
  <style>
    body { font-family: 'Helvetica','Arial',sans-serif; color:#333; font-size:11px; line-height:1.5; }
    .container { width:100%; margin:0 auto; position:relative; }

    h1 { font-size:22px; font-weight:bold; color:#333; text-align:center; margin-bottom:30px; }

    .section { margin-top:20px; page-break-inside: avoid; }
    .section-title { background:#f2f2f2; padding:8px 12px; font-weight:bold; font-size:14px; border:1px solid #ddd; border-bottom:2px solid #c8102e; }
    .section-content { padding:15px; border:1px solid #ddd; border-top:none; }
    .section-content p { margin:0 0 10px 0; text-align:justify; white-space:pre-wrap; }

    .sub-section { border-left:3px solid #eee; padding-left:15px; margin-top:15px; page-break-inside: avoid; }
    .sub-section h4 { margin-top:0; color:#555; }

    table { width:100%; border-collapse:collapse; margin-bottom:15px; font-size:10px; }
    td, th { padding:8px; border:1px solid #eee; vertical-align:top; text-align:left; }
    td.label { font-weight:bold; width:25%; background:#fafafa; }

    /* --- GALERIA PADRÃO --- */
    .image-gallery { margin-top:12px; display:grid; gap:12px; }
    .image-gallery.one .image-item { aspect-ratio: 16/9; }
    .image-item { width:100%; background:#f8f8f8; border:1px solid #ccc; overflow:hidden; border-radius:2px; }
    .image-item img { width:100%; height:100%; object-fit:cover; display:block; }

    .sugestoes-title { margin-top:20px; font-size:12px; border-bottom:1px solid #eee; padding-bottom:5px; }
    .sugestoes-list { padding-left:20px; margin-top:10px; }
    .sugestoes-list li { margin-bottom:8px; }
    .sugestoes-list li .image-gallery { margin-top:10px; }

    .local-data { text-align:center; font-size:11px; margin:40px 0; }
    .assinaturas-container { display:flex; flex-wrap:wrap; justify-content:center; gap:40px; margin-top:20px; }
    .assinatura-block { flex:1; min-width:200px; max-width:250px; text-align:center; }
    .linha-assinatura { border-bottom:1px solid #333; height:20px; margin-bottom:5px; }
    .nome-assinatura { font-size:10px; margin:0; }

    /* Logo da marca topo direito (só 1ª página) */
    .marca-topo { position:absolute; top:0; right:0; max-height:40px; height:auto; width:auto; }
  </style>
</head>
<body>
  <div class="container">
    ${marcaLogo ? `<img class="marca-topo" src="${marcaLogo}" alt="Marca" />` : ""}
    <h1>Relatório de Análise de Sinistro</h1>
    ${secaoDadosGerais}
    ${criarSecaoComGaleria("Sumário", data.sumario)}
    ${criarSecaoComGaleria("Objetivo", data.objetivo)}
    ${criarSecaoComGaleria("Metodologia de Análise", data.metodologia)}
    ${criarSecaoComGaleria("Agradecimentos", data.agradecimentos)}
    ${criarSecaoComGaleria("Fluxo da Operação de Transporte", data.fluxoTransporte)}
    ${conteudoOperacoes}
    ${secaoAnalises}
    ${criarSecaoComGaleria("Inspeção de Carga e Análise de Inconsistências", data.inspecaoCarga)}
    ${criarSecaoComGaleria("Inspeção de Entrega na Concessionária", data.inspecaoEntrega)}
    ${criarSecaoConclusao(data.conclusao, data.sugestoes)}
    ${criarSecaoEncerramento(data.pessoasEnvolvidas, data.localData)}
  </div>
</body>
</html>`;
}
