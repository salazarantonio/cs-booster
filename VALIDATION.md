# Validação do CS Booster 0.3.1

Estado: validação de lógica, consistência do pacote e abertura manual do desktop e teste funcional da interface com adaptadores simulados aprovados. Aplicação real de ajustes continua não validada. Nenhuma otimização, remoção AppX, alteração de mitigação ou limpeza de dados reais foi executada como teste.

| Verificação | Resultado observado |
| --- | --- |
| Suíte `npm test` | 68 testes: 67 aprovados, zero falhas, um ignorado |
| Junction | Criação da fixture recusada pelo ambiente; teste ignorado, sem afirmar cobertura |
| Executor de limpeza | Testado contra arquivos sintéticos isolados, incluindo bloqueios e resultados parciais |
| Empacotamento repetido | Geração nova e preservação dos dados locais verificadas; pacote anterior arquivado |
| Falha de publicação do pacote | Teste simulado confirma recuperação do pacote anterior |
| Consistência do pacote | 73 arquivos do runtime e 21 do aplicativo comparados por SHA-256 |
| Identidade do runtime | Electron 45.2.2, Chromium 156.0.8078.80, Node 24.22.2, Windows x64 |
| Electron em modo Node | Inicia e informa a versão; código de saída zero |
| Inicialização Chromium, `--version` | Encerra com `0x80000003`, antes de carregar a aplicação |
| Electron mínimo | Mesmo encerramento; marcador inicial de JavaScript não foi produzido |
| Variação do diretório de trabalho | Usar a pasta do executável não resolveu |
| Abertura manual inicial | Usuário informou que nenhuma janela apareceu |
| Iniciador com relatório | Automação: `0x80000003`. Abertura manual posterior: ambiente sem redirecionamento, saída zero, janela não confirmada pelo usuário |
| Abertura após a correção ESM | Usuário confirmou a janela; log registra `app-ready`, `window-created`, `page-loaded` e `window-ready-to-show` |
| Teste funcional desktop | Aprovado no Windows normal: nove rotas, 29 ajustes, oito limpezas, filtros, cancelamentos, isolamento e IPC |

## Correções e ferramentas

- O empacotamento passou a montar uma pasta de compilação separada. O executável recebe o nome final antes da publicação, sem sobrescrever um `.exe` existente. Dados de `resources/app/data` são preservados e o pacote anterior permanece em `release/CS Booster.previous-*`. Uma falha de publicação tenta restaurar a pasta anterior. Não há exclusão recursiva dos pacotes anteriores.
- O iniciador normal usa `scripts/launch-desktop.ps1` e salva `evidence/desktop-launch.json`. Um processo que permanece ativo por quatro segundos não é tratado como prova de janela aberta. A captura mantém o handle original do processo para não converter um código de saída indisponível em sucesso.
- `npm run validate:package` compara o pacote portátil ao runtime instalado e aos arquivos do projeto, além de conferir o formato PE x64. Isso comprova consistência local, não assinatura, procedência independente do runtime ou funcionamento da janela.
- `npm run validate:desktop` prepara verificações de nove rotas, catálogo, busca, seis recomendações, oito opções de limpeza, cancelamentos, debloat sem pré-seleção, bloqueio sem administrador, isolamento do renderer e comparação por IPC. O registro e o PowerShell são simulados. O relatório de 04/11/2026 foi aprovado: nove rotas, 29 ajustes, oito opções de limpeza, busca, filtro de recomendações, cancelamento, debloat sem pré-seleção, bloqueio das mitigações sem administrador, isolamento do renderer e comparação de capturas via IPC. Foram confirmadas zero escritas de registro e zero execuções de limpeza.
- Corrigida a versão exibida no painel para 0.3.1.
- A configuração do perfil portátil agora precede a trava de instância única. Sete testes simulados exercitam a lógica usada pela produção: ordem de inicialização, retorno sem bloquear o carregamento ESM, segunda instância, recuperação de janela minimizada, rejeição de IPC de outra origem, isolamento/permissões e falha de carregamento.
- O processo principal grava etapas em `release/CS Booster/resources/app/data/startup.jsonl`. Uma entrada `page-loaded` indica carregamento do documento, sem substituir a confirmação visual da janela.
- O iniciador não fecha silenciosamente após uma saída zero precoce. Remove `ELECTRON_RUN_AS_NODE` somente do ambiente do filho, se herdado, para iniciar a interface em vez do modo Node; não altera o ambiente do usuário permanentemente.

## Limite do diagnóstico

O mesmo código de exceção pode ter várias causas. Há relatos no projeto Electron de falhas com `0x80000003` em Windows 11 26H2 e de encerramento anterior aos logs. Eles são pistas, não diagnóstico confirmado desta máquina: [relato Windows 26H2](https://github.com/electron/electron/issues/54614), [relato de inicialização ICU](https://github.com/electron/electron/issues/51770).

A execução automatizada recebe LOCALAPPDATA redirecionado. Isso impede assumir que reproduz integralmente o ambiente de uma abertura pelo Explorador. O iniciador registra somente se esse redirecionamento foi observado, sem exportar variáveis de ambiente ou credenciais. O primeiro relatório manual confirmou ausência desse redirecionamento e saída zero. O usuário continuou sem janela. Isso é diferente da falha nativa observada na automação; a causa desse encerramento normal ainda não foi estabelecida. Após remover a espera no nível principal ESM, o usuário confirmou que o aplicativo abriu; os registros passaram pelas etapas de prontidão, criação da janela e carregamento da página.

Não foram alterados antivírus, isolamento do núcleo, políticas do Windows ou permissões de pastas para tentar eliminar a falha. Também não foram introduzidas opções para desativar o sandbox do Electron. A causa do erro nativo 0x80000003 restrito à execução automatizada permanece não confirmada. Na abertura normal, o bloqueio ESM da aplicação foi corrigido e a janela foi aprovada.

## Próxima etapa

Validar operações reais em um Windows de testes com estado conhecido e recuperação disponível: aplicar/restaurar cada ajuste suportado, validar permissões, AppX, mitigações e limpeza. A abertura e o teste funcional da interface com adaptadores simulados foram aprovados. Eles não aprovam alterações reais no sistema nem demonstram ganho de FPS.


## Bloqueio de inicialização identificado no aplicativo

O relatório manual de 04/11 registrou entrada no módulo principal, perfil configurado e trava adquirida, mas nenhuma etapa `app-ready`. Havia `await app.whenReady()` no fluxo aguardado pelo próprio módulo ESM de entrada. A inicialização foi corrigida para disparar a rotina assíncrona sem aguardar sua conclusão no nível principal. Um teste de regressão mantém `whenReady` pendente e comprova que o lançador retorna imediatamente, permitindo o fim da carga do módulo; depois libera a prontidão e verifica o carregamento da página.

O mesmo padrão foi removido do ponto de entrada do teste de interface. A referência de comportamento é a [documentação ESM do Electron](https://www.electronjs.org/docs/latest/tutorial/esm). A abertura visual do pacote corrigido foi confirmada pelo usuário e corroborada pelas etapas de inicialização. A falha nativa no contexto automatizado é uma observação separada; não deve ser usada para encobrir o bloqueio encontrado no código da aplicação.

`Validar interface.cmd` permite executar o teste com adaptadores simulados pelo Windows normal. Ele exige um relatório aprovado com data desta execução, recusando um resultado antigo, e encerra somente seu próprio processo de teste se houver tempo excedido. Sua execução não aplica ajustes ao Windows. O teste foi executado com sucesso pelo Windows normal e o relatório local foi conferido. Há um aviso de depreciação na assinatura do evento de console usada pelo teste; não houve erro funcional e esse aviso não aparece como aprovação de recursos adicionais.


## Resultado consolidado da etapa

A abertura e a interface da versão 0.3.1 foram aprovadas. A correção da espera circular no módulo ESM resolveu o bloqueio observado na abertura manual. Os registros agora chegam à página carregada e a janela foi confirmada pelo usuário. O teste funcional com adaptadores simulados passou sem executar mudanças reais. O erro nativo observado no ambiente automatizado não impediu a validação pelo Windows normal e permanece uma limitação daquele contexto de execução.
