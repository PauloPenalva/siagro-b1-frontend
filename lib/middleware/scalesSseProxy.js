const http = require("http");

/**
 * Proxy de streaming para /scales.
 *
 * O `ui5-middleware-simpleproxy` usado nas demais rotas ACUMULA a resposta inteira antes de
 * devolvê-la. Isso funciona para JSON, mas o peso ao vivo é Server-Sent Events: a resposta nunca
 * termina, então o navegador ficava esperando para sempre e a tela de pesagem não recebia
 * nenhuma leitura. Aqui a resposta é encaminhada com `pipe`, chunk a chunk.
 *
 * Só vale para o servidor de desenvolvimento: em produção o Gateway serve o SPA e /scales na
 * mesma origem, sem proxy no meio.
 *
 * @param {object} parameters Parâmetros do middleware do UI5 Tooling.
 * @returns {Function} Middleware Express.
 */
module.exports = function ({ options }) {
  const baseUri = options?.configuration?.baseUri ?? "http://localhost:5246/scales";
  const target = new URL(baseUri);

  return function scalesSseProxy(req, res) {
    // Sem accept-encoding o Gateway não comprime a resposta - compressão sobre SSE volta a
    // significar buffer, e buffer significa tela parada.
    const headers = { ...req.headers, host: target.host };
    delete headers["accept-encoding"];

    const proxyReq = http.request(
      {
        host: target.hostname,
        port: target.port || 80,
        // req.url já vem sem o mountPath, e baseUri termina em /scales.
        path: target.pathname + req.url,
        method: req.method,
        headers
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.flushHeaders?.();
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", (err) => {
      res.statusCode = 502;
      res.end(`Falha ao contatar o Gateway em ${baseUri}: ${err.message}`);
    });

    // Encerrar a conexão do navegador precisa derrubar a do servidor: sem isto cada F5 na tela de
    // pesagem deixaria um SSE órfão aberto contra o Gateway.
    //
    // O gatilho é o fechamento da RESPOSTA, não o da requisição: `req.on("close")` dispara assim
    // que o corpo da requisição termina - o que num GET é imediato - e derrubaria o proxy antes
    // da primeira leitura chegar.
    res.on("close", () => proxyReq.destroy());

    req.pipe(proxyReq);
  };
};
