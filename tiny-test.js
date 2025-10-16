// Script de teste para a integração com a API do Tiny ERP.
//
// Execute com: `node tiny-test.js <TOKEN>` ou defina a variável de ambiente TINY_TOKEN.
// O script faz chamadas aos serviços de pedidos, notas fiscais e lançamentos
// financeiros e imprime a estrutura completa do JSON retornado, bem como
// qualquer mensagem de erro. Dessa forma é possível inspecionar os dados
// reais e ajustar a integração do Sistema DRE.

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Envia uma requisição POST para um endpoint da API do Tiny.
 * @param {string} endpoint - nome do serviço (ex.: 'pedidos.pesquisa.php')
 * @param {object} params - parâmetros (token, formato, pagina, limite, id, etc.)
 * @returns {Promise<object>} - objeto JSON retornado pela API
 */
async function postTiny(endpoint, params) {
  const payload = new URLSearchParams(params);
  const res = await fetch(`https://api.tiny.com.br/api2/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
    },
    body: payload.toString(),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    // Retorna texto bruto em caso de resposta não JSON.
    return { raw: text };
  }
}

async function testOrders(token) {
  console.log('------ Testando pedidos (orders) ------');
  try {
    // Pesquisa os primeiros 5 pedidos. Ajuste pagina/limite conforme necessário.
    const searchResp = await postTiny('pedidos.pesquisa.php', {
      token,
      formato: 'json',
      pagina: '1',
      limite: '5',
    });
    console.dir(searchResp, { depth: null });
    const pedidos = searchResp?.retorno?.pedidos;
    if (Array.isArray(pedidos) && pedidos.length > 0) {
      const id = pedidos[0]?.pedido?.id;
      if (id) {
        const detailResp = await postTiny('pedido.obter.php', {
          token,
          formato: 'json',
          id: String(id),
        });
        console.log('\nDetalhe do primeiro pedido:');
        console.dir(detailResp, { depth: null });
      }
    }
  } catch (err) {
    console.error('Erro ao testar pedidos:', err);
  }
  console.log('----------------------------------------\n');
}

async function testInvoices(token) {
  console.log('------ Testando notas fiscais (invoices) ------');
  try {
    const searchResp = await postTiny('notas.fiscais.pesquisa.php', {
      token,
      formato: 'json',
      pagina: '1',
      limite: '5',
    });
    console.dir(searchResp, { depth: null });
    const notas = searchResp?.retorno?.notas_fiscais;
    if (Array.isArray(notas) && notas.length > 0) {
      const id = notas[0]?.nota_fiscal?.id;
      if (id) {
        const detailResp = await postTiny('nota.fiscal.obter.php', {
          token,
          formato: 'json',
          id: String(id),
        });
        console.log('\nDetalhe da primeira nota fiscal:');
        console.dir(detailResp, { depth: null });
      }
    }
  } catch (err) {
    console.error('Erro ao testar notas fiscais:', err);
  }
  console.log('----------------------------------------------\n');
}

async function testReceivables(token, startDate, endDate) {
  console.log('------ Testando contas a receber (receivables) ------');
  try {
    const params = {
      token,
      formato: 'json',
      pagina: '1',
      limite: '5',
    };
    // Para evitar erro 31 (parâmetros obrigatórios), informe pelo menos um intervalo de datas.
    if (startDate) params['data_ini_emissao'] = startDate;
    if (endDate) params['data_fim_emissao'] = endDate;
    const searchResp = await postTiny('contas.receber.pesquisa.php', params);
    console.dir(searchResp, { depth: null });
    const contas = searchResp?.retorno?.contas_receber ?? searchResp?.retorno?.contas;
    if (Array.isArray(contas) && contas.length > 0) {
      const first = contas[0].conta_receber ?? contas[0].conta;
      const id = first?.id;
      if (id) {
        const detailResp = await postTiny('conta.receber.obter.php', {
          token,
          formato: 'json',
          id: String(id),
        });
        console.log('\nDetalhe da primeira conta a receber:');
        console.dir(detailResp, { depth: null });
      }
    }
  } catch (err) {
    console.error('Erro ao testar contas a receber:', err);
  }
  console.log('-----------------------------------------------------\n');
}

async function testPayables(token, startDate, endDate) {
  console.log('------ Testando contas a pagar (payables) ------');
  try {
    const params = {
      token,
      formato: 'json',
      pagina: '1',
      limite: '5',
    };
    if (startDate) params['data_ini_emissao'] = startDate;
    if (endDate) params['data_fim_emissao'] = endDate;
    const searchResp = await postTiny('contas.pagar.pesquisa.php', params);
    console.dir(searchResp, { depth: null });
    const contas = searchResp?.retorno?.contas_pagar ?? searchResp?.retorno?.contas;
    if (Array.isArray(contas) && contas.length > 0) {
      const first = contas[0].conta_pagar ?? contas[0].conta;
      const id = first?.id;
      if (id) {
        const detailResp = await postTiny('conta.pagar.obter.php', {
          token,
          formato: 'json',
          id: String(id),
        });
        console.log('\nDetalhe da primeira conta a pagar:');
        console.dir(detailResp, { depth: null });
      }
    }
  } catch (err) {
    console.error('Erro ao testar contas a pagar:', err);
  }
  console.log('--------------------------------------------------\n');
}

async function main() {
  const token = process.argv[2] || process.env.TINY_TOKEN;
  if (!token) {
    console.error('É necessário fornecer o token da API do Tiny como argumento ou na variável de ambiente TINY_TOKEN.');
    process.exit(1);
  }
  // Obtém intervalo opcional de datas (em dd/mm/yyyy) via argumentos ou variáveis de ambiente
  // Para contas a receber/pagar ao menos uma data de emissão é exigida pela API.
  const startDate = process.env.START_DATE || process.argv[3] || undefined;
  const endDate = process.env.END_DATE || process.argv[4] || undefined;
  await testOrders(token);
  await testInvoices(token);
  await testReceivables(token, startDate, endDate);
  await testPayables(token, startDate, endDate);
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
});