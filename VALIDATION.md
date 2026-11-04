# Validação do CS Booster 0.3.1

Estado: validação de lógica e consistência do pacote aprovada; abertura e validação funcional da janela desktop ainda não aprovadas. Nenhuma otimização, remoção AppX, alteração de mitigação ou limpeza de dados reais foi executada como teste.

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
| Teste funcional desktop | Não executado com sucesso: runtime encerra antes da janela |

## Correções e ferramentas

- O empacotamento passou a montar uma pasta de compilação separada. O executável recebe o nome final antes da publicação, sem sobrescrever um `.exe` existente. Dados de `resources/app/data` são preservados e o pacote anterior permanece em `release/CS Booster.previous-*`. Uma falha de publicação tenta restaurar a pasta anterior. Não há exclusão recursiva dos pacotes anteriores.
- O iniciador normal usa `scripts/launch-desktop.ps1` e salva `evidence/desktop-launch.json`. Um processo que permanece ativo por quatro segundos não é tratado como prova de janela aberta. A captura mantém o handle original do processo para não converter um código de saída indisponível em sucesso.
- `npm run validate:package` compara o pacote portátil ao runtime instalado e aos arquivos do projeto, além de conferir o formato PE x64. Isso comprova consistência local, não assinatura, procedência independente do runtime ou funcionamento da janela.
- `npm run validate:desktop` prepara verificações de nove rotas, catálogo, busca, seis recomendações, oito opções de limpeza, cancelamentos, debloat sem pré-seleção, bloqueio sem administrador, isolamento do renderer e comparação por IPC. O registro e o PowerShell são simulados. Este teste permanece sem resultado aprovado enquanto o Electron não inicializar.
- Corrigida a versão exibida no painel para 0.3.1.
- A configuração do perfil portátil agora precede a trava de instância única. Sete testes simulados exercitam a lógica usada pela produção: ordem de inicialização, retorno sem bloquear o carregamento ESM, segunda instância, recuperação de janela minimizada, rejeição de IPC de outra origem, isolamento/permissões e falha de carregamento.
- O processo principal grava etapas em `release/CS Booster/resources/app/data/startup.jsonl`. Uma entrada `page-loaded` indica carregamento do documento, sem substituir a confirmação visual da janela.
- O iniciador não fecha silenciosamente após uma saída zero precoce. Remove `ELECTRON_RUN_AS_NODE` somente do ambiente do filho, se herdado, para iniciar a interface em vez do modo Node; não altera o ambiente do usuário permanentemente.

## Limite do diagnóstico

O mesmo código de exceção pode ter várias causas. Há relatos no projeto Electron de falhas com `0x80000003` em Windows 11 26H2 e de encerramento anterior aos logs. Eles são pistas, não diagnóstico confirmado desta máquina: [relato Windows 26H2](https://github.com/electron/electron/issues/54614), [relato de inicialização ICU](https://github.com/electron/electron/issues/51770).

A execução automatizada recebe LOCALAPPDATA redirecionado. Isso impede assumir que reproduz integralmente o ambiente de uma abertura pelo Explorador. O iniciador registra somente se esse redirecionamento foi observado, sem exportar variáveis de ambiente ou credenciais. O primeiro relatório manual confirmou ausência desse redirecionamento e saída zero. O usuário continuou sem janela. Isso é diferente da falha nativa observada na automação; a causa desse encerramento normal ainda não foi estabelecida. O teste manual após a correção de inicialização e a inclusão das etapas está pendente.

Não foram alterados antivírus, isolamento do núcleo, políticas do Windows ou permissões de pastas para tentar eliminar a falha. Também não foram introduzidas opções para desativar o sandbox do Electron. A causa da falha gráfica permanece não confirmada.

## Próxima etapa

Abrir `Abrir CS Booster.cmd` pelo Explorador, sem administrador, e examinar o relatório local atualizado. Se a janela abrir, validar navegação e cancelamentos antes de testar alterações em um Windows de testes. Se encerrar novamente, usar o código real dessa execução para orientar o próximo diagnóstico, sem concluir que a validação desktop passou.


## Bloqueio de inicialização identificado no aplicativo

O relatório manual de 04/11 registrou entrada no módulo principal, perfil configurado e trava adquirida, mas nenhuma etapa `app-ready`. Havia `await app.whenReady()` no fluxo aguardado pelo próprio módulo ESM de entrada. A inicialização foi corrigida para disparar a rotina assíncrona sem aguardar sua conclusão no nível principal. Um teste de regressão mantém `whenReady` pendente e comprova que o lançador retorna imediatamente, permitindo o fim da carga do módulo; depois libera a prontidão e verifica o carregamento da página.

O mesmo padrão foi removido do ponto de entrada do teste de interface. A referência de comportamento é a [documentação ESM do Electron](https://www.electronjs.org/docs/latest/tutorial/esm). A abertura visual do pacote corrigido ainda precisa ser confirmada. A falha nativa no contexto automatizado é uma observação separada; não deve ser usada para encobrir o bloqueio encontrado no código da aplicação.

`Validar interface.cmd` permite executar o teste com adaptadores simulados pelo Windows normal. Ele exige um relatório aprovado com data desta execução, recusando um resultado antigo, e encerra somente seu próprio processo de teste se houver tempo excedido. Sua execução não aplica ajustes ao Windows. O resultado continua pendente até esse teste terminar com sucesso no ambiente normal.
