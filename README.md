# CS Booster

Aplicativo desktop Windows para diagnóstico e ajustes individuais voltados a jogos competitivos. Versão inicial 0.1.0.

## Estado atual

- Nove áreas de navegação e catálogo de 29 ajustes.
- Seis ajustes de usuário com backup e restauração dos valores anteriores.
- Consulta da instalação Steam/CS2.
- Comparação de capturas JSON de frametime.
- Consulta e planejamento de perfis de mitigações da CPU, sem aplicação.

Limpeza, ajustes avançados de GPU, aplicação de mitigações, gerenciador de instalações e pontos de restauração completos ainda estão em desenvolvimento. Não há promessa de ganho de FPS.

## Desenvolvimento

Requer Windows e Node.js compatível com o Electron fixado no package-lock.json.

```text
npm ci
node node_modules/electron/install.js
npm start
npm test
npm run package
```

`npm run preview` abre um servidor somente leitura em http://127.0.0.1:4317. O pacote portátil é gerado em release/CS Booster. Mantenha todos os arquivos dessa pasta juntos.

## Dados locais

Dados, logs e backups ficam em data/settings no modo de desenvolvimento e junto ao aplicativo no pacote portátil. Esses arquivos, as dependências, os binários gerados e as evidências locais são excluídos do Git.

## Validação e limitações

15 testes de unidade passaram, incluindo registro simulado, backup e restauração exata, recusa de destinos não autorizados e cálculo de frametime. A interface foi verificada pela prévia local. A abertura do Electron neste ambiente de desenvolvimento encerrou antes de exibir a janela com o código 0x80000003; a validação do pacote desktop ainda está pendente.

As consultas CIM podem ser negadas pelo Windows; nesse caso o painel preserva os dados disponíveis e indica os demais como desconhecidos. Nenhum ajuste real foi aplicado ao computador durante o desenvolvimento.

## Atualizações

As próximas mudanças serão versionadas em commits com descrição e validação. Este repositório acompanha o trabalho desenvolvido nas sessões do projeto; não existe atualização autônoma em segundo plano.
