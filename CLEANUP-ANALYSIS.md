# Limpeza do sistema — investigação e implementação

## Alvo e escopo

Análise estática solicitada do `togsboost.exe`, SHA-256 `c0b095f9921a7ccd91c0cb2548f3cd0a391549060bac89f6c7632234c4bb2130`, com REA e seleção explícita do provedor Ghidra. Nenhuma limpeza do aplicativo de referência foi executada.

O Ghidra 12.1.4 foi admitido e iniciou importação/análise, mas a primeira consulta atingiu o prazo do provedor de 330 segundos sem disponibilizar resultados completos. Uma segunda tentativa elevou o prazo do provedor para 900 segundos, conforme a recuperação indicada pelo REA; a conexão do cliente encerrou a chamada após 450 segundos. Não houve resultado válido de decompilação ou de busca nativa. A sessão foi encerrada após exportar as evidências disponíveis. O ajuste temporário do provedor foi restaurado. Uma investigação nativa futura precisará de um prazo do cliente que comporte a análise e sua finalização (`mcp_servers.rea.tool_timeout_sec`); aumentar somente o prazo interno do Ghidra não basta.

O aplicativo contém uma camada nativa Electron e uma aplicação no pacote `resources/app.asar`. O carregador JavaScript principal encaminha para bytecode Bytenode (`index.jsc`). A análise do executável nativo não equivale à recuperação desse bytecode.

## Evidência da tela distribuída

O componente `hE` do arquivo `out/renderer/assets/index-qyW3NT1i.js` declara exatamente as cinco ações abaixo. Identidade SHA-256 do arquivo examinado: `d492fc0d7e688903ffa8ca295cc8ac31b1cc7dd887350914e59b5f7d1fdf2b56`.

| Identificador | Recurso |
| --- | --- |
| temp | Arquivos temporários do sistema e do usuário |
| prefetch | Arquivos Prefetch |
| recyclebin | Esvaziar a Lixeira |
| windows-update | Cache de downloads do Windows Update |
| thumbnails | Cache de miniaturas do Explorador |

O componente mantém seleção individual, execução sequencial, resultado em bytes por ação e data da última limpeza. O fluxo chama `cleanup:fetch-script` com o identificador e encaminha o script recebido para `run-powershell`. Portanto, os scripts efetivamente fornecidos por esse canal permanecem desconhecidos nesta investigação estática.

Para uma análise limitada ao recurso, foi preservado um recorte literal dos bytes `[427556, 433033)` desse arquivo. SHA-256 do recorte: `46cadb1d8488fb9021b277e8a6a26b39af86a946d80d90bffcd392c0c47f3b2d`. O recorte não contém as dependências externas ou o backend e não foi executado.

Evidência REA do recorte: `ev_ad6b0601f4cc6a4b63dfc85b499405e48b697f2c5b54c4f8f363853473970bcc`; resumo `ev_9f9fbf5889208c4d81e66fed67d9bf4cce33ef9dbee8238a79d77ddccc7617c3`. O parser examinou um arquivo e 1.035 nós AST, sem falhas de sintaxe. A semântica permanece incompleta por depender de símbolos externos; a análise não prova execução. A chave de armazenamento local `last-clean` foi observada estaticamente. A análise do bundle inteiro atingiu o prazo de 300 segundos e deixou a evidência parcial `ev_4966c90d8bdf9054be8e24f56da618ee629bfabcff6f4bc14a26e23a5ee4bd4a`.

Há textos de scripts inline para três opções: Lixeira, `SoftwareDistribution/Download` e `thumbcache_*.db`. O fluxo observado usa o script retornado pelo canal, em vez dessas propriedades inline; elas não comprovam o conteúdo executado. Nenhum endpoint remoto foi consultado para recuperar scripts.

## Implementação própria do CS Booster

O projeto reproduz os cinco recursos e o fluxo de seleção, com executores próprios e uma lista fixa de destinos. Não inclui o código extraído nem os binários do aplicativo de referência. A confirmação da exclusão e a confirmação adicional da Lixeira pertencem ao fluxo do CS Booster.

A prévia é somente leitura. Resultados distinguem remoção concluída, parcial, arquivos ignorados e falhas. Bytes correspondem aos arquivos removidos, não ao tamanho inicial estimado, nem a uma garantia de espaço físico recuperado no volume.

## Limites da conclusão

A correspondência de recursos e identificadores foi estabelecida pelo código distribuído da interface. A equivalência dos comandos internos originais e a execução efetiva dos scripts do TogsBoost não foram estabelecidas. A validação de operações do CS Booster deve usar arquivos de teste isolados e adaptadores simulados, sem limpar o computador principal como experimento.

Nesta revisão foram executados 57 testes: 56 aprovados, nenhum com falha e um ignorado porque a criação de junction recebeu EPERM no ambiente. Os testes nativos usaram exclusivamente arquivos sintéticos isolados. A validação do aplicativo desktop completo permanece pendente; a prévia web foi conferida e continua somente leitura.
