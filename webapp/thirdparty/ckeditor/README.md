# CKEditor 5 — build `decoupled-document`

Biblioteca de terceiros, embarcada no repositório. **Não edite estes arquivos.**

| | |
|---|---|
| Pacote | `@ckeditor/ckeditor5-build-decoupled-document` |
| Versão | **43.2.0** |
| Licença | **GPL-2.0-or-later** (ver `LICENSE.md`) |
| Origem | `node_modules/@ckeditor/ckeditor5-build-decoupled-document/build/` do frontend Angular do Siagro (`C:\Projetos\Tagui\Siagro\Frontend`) |

## Por que está aqui

O editor de modelo de contrato e o de texto da minuta espelham a tela
`modelo-contrato-text` do Siagro Angular, que usa este mesmo build. É o build
*decoupled*: a barra de ferramentas é um elemento separado da área editável, o que dá
ao editor a aparência de documento — e é o que o `CkDocumentEditor`
(`webapp/control/CkDocumentEditor.ts`) monta.

O pacote é um bundle UMD puro, **sem dependência de Angular** — o
`@ckeditor/ckeditor5-angular` é só o invólucro, e não foi trazido. O
`CkDocumentEditor` carrega `ckeditor.js` sob demanda, por `sap.ui.require`, então só
quem abre essas duas telas paga o download.

## Licença — decisão registrada

Este build é **GPL-2.0-or-later**, e o SiagroB1 é um produto distribuído a vários
clientes. A alternativa é a licença comercial da CKSource. **O usuário decidiu, em
01/10/2026, seguir com a GPL**, ciente da situação. Esta nota existe para que a decisão
não se perca: quem for rever o licenciamento do produto precisa saber que ela está aqui.

A versão 43 ainda **não** exige chave de licença em tempo de execução; isso passou a ser
obrigatório a partir da 44. Atualizar para a 44 ou superior deixa de ser uma troca de
arquivo.

## O que NÃO foi trazido

- `ckeditor.js.map` (7 MB) — só serve ao DevTools e iria junto para o `dist/`.
- As demais traduções. Só `pt-br`, que é o idioma da aplicação.

## Como atualizar

Copie `build/ckeditor.js` e `build/translations/pt-br.js` da versão nova do pacote,
atualize a versão nesta tabela e confira a barra de ferramentas: a lista de botões em
`CkDocumentEditor` depende dos plugins que o build inclui.
