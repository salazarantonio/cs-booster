# CS Booster

Aplicativo desktop Windows para diagnóstico e ajustes individuais voltados a jogos competitivos. Versão de desenvolvimento 0.3.2.

## Estado atual

- Nove áreas de navegação e catálogo de 29 ajustes.
- Seis ajustes de usuário com backup e restauração dos valores anteriores.
- Consulta da instalação Steam/CS2.
- Comparação de capturas JSON de frametime.
- Consulta, planejamento, aplicação e restauração dos 12 perfis de mitigações da CPU; alterações exigem administrador. Estado efetivo no kernel ainda não é verificado.
- Debloat seletivo de aplicativos da conta atual, com confirmação individual da seleção.
- Seis recomendações com estrelas, filtro e categorias por cartão.

Limpeza acumulada disponível com oito opções: os três caches da 0.2 e as cinco categorias de sistema adicionadas na 0.3. Ajustes avançados de GPU, gerenciador de instalações e pontos de restauração completos ainda estão em desenvolvimento. A alternativa Raphire Win11Debloat é apresentada como orientação, sem download ou execução automática. Não há promessa de ganho de FPS.

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

68 testes foram executados: 67 aprovados e um ignorado porque o ambiente bloqueou a criação de junction. Incluem registro simulado, restauração exata, cálculo de frametime, nove testes da interface de limpeza e o executor PowerShell real contra arquivos sintéticos isolados. A interface foi verificada pela prévia local. A abertura do Electron neste ambiente de desenvolvimento encerrou antes de exibir a janela com o código 0x80000003; a abertura manual após a correção ESM foi confirmada; o teste funcional da interface com adaptadores simulados também passou.

As consultas CIM podem ser negadas pelo Windows; nesse caso o painel preserva os dados disponíveis e indica os demais como desconhecidos. Nenhum ajuste real foi aplicado ao computador durante o desenvolvimento.

## Atualizações

As próximas mudanças serão versionadas em commits com descrição e validação. Este repositório acompanha o trabalho desenvolvido nas sessões do projeto; não existe atualização autônoma em segundo plano.

## Mitigações da CPU

Feche a instância atual e use `Abrir CS Booster como Administrador.cmd` se decidir aplicar ou restaurar um perfil. O aplicativo não se eleva nem reinicia automaticamente.

O perfil `desligar-tudo` aplica os valores do perfil enviado pelo usuário (FeatureSettingsOverride=3 e FeatureSettingsOverrideMask=3). O nome do perfil não é garantia de desativação de toda mitigação presente ou futura em qualquer CPU/Windows. O estado gravado é separado do estado efetivo no kernel.

O comando `powershell -ExecutionPolicy Bypass -File ...` citado no fluxo original permite iniciar aquele script no processo invocado; não é ele que altera as mitigações. As alterações do script são nos valores de registro. O CS Booster implementa suas próprias operações sobre os mesmos valores autorizados, sem executar esse arquivo ou alterar permanentemente a política de execução.

Backups das mitigações ficam em `%ProgramData%/CSBooster/mitigation-backups`, com proprietário e permissões de Administradores/SYSTEM. A restauração verifica proprietário, permissões, ausência de redirecionamento e destinos autorizados. Falhas de gravação tentam reverter os valores tocados e informam se a recuperação não foi completa.

## Limpar Windows

O fluxo apresenta CS Booster seletivo e a alternativa guiada Raphire. No modo seletivo há 18 candidatos conhecidos, incluindo jogos e componentes Xbox; somente os instalados e removíveis são selecionáveis. Nenhum vem marcado. A operação remove somente da conta atual, sem `AllUsers` e sem remover provisionamento para novos usuários. Store, App Installer, frameworks, Gaming Services e Identity Provider não fazem parte da lista de remoção.

Antes da remoção, a lista é novamente validada e um relatório é salvo. O relatório não é um backup dos aplicativos nem de seus dados. A reinstalação depende dos pacotes e da disponibilidade na Store. Resultados de falha parcial são exibidos por aplicativo.

## Limites desta revisão

Aplicação real das mitigações e remoção real de aplicativos não foram executadas. As operações de escrita foram verificadas por testes simulados; a consulta AppX no ambiente retornou acesso negado. A prévia verificou seis recomendações, categorias, escolha do método de debloat, presença do perfil desligar-tudo e bloqueio de aplicação sem administrador. A abertura do pacote Electron e testes Windows completos ainda precisam de validação em ambiente adequado.


## Limpeza do sistema

As oito opções são DirectX, NVIDIA DirectX, NVIDIA OpenGL, temporários, Prefetch, Lixeira da conta atual, downloads do Windows Update e miniaturas. Os três caches da 0.2 foram preservados junto às cinco adições da 0.3 e passaram a usar o mesmo executor de limpeza. Nenhuma vem selecionada. A exclusão é permanente, exige confirmação e a Lixeira exige uma confirmação adicional. Caches podem ser reconstruídos pelo Windows; limpar Prefetch pode tornar aberturas iniciais mais lentas.

Os destinos são definidos no backend; a interface só envia identificadores conhecidos. O executor verifica caminhos e recusa pontos de redirecionamento, limita o inventário e não usa exclusão recursiva nativa. A checagem por caminho não é atômica contra trocas maliciosas concorrentes de diretórios. Arquivos bloqueados são informados como ignorados. Bytes excluídos são contagens de arquivos removidos, não promessa de espaço físico liberado no disco.

Sem administrador, os temporários ficam limitados à conta atual. Prefetch e downloads do Windows Update exigem administrador. O cache do Windows Update permanece indisponível enquanto Windows Update/BITS estiverem ativos ou seu estado não puder ser verificado; o aplicativo não interrompe serviços. O Explorer também não é encerrado para forçar a remoção de miniaturas bloqueadas.

A última tentativa e a última limpeza totalmente concluída são registradas separadamente. Falhas parciais e interrupções não viram mensagens de sucesso. A prévia web continua somente leitura; a execução pertence ao aplicativo desktop. Caches de shaders Steam/CS2, AMD e locais adicionais dos drivers permanecem pendentes. Os três destinos originais da 0.2 são LOCALAPPDATA/D3DSCache, LOCALAPPDATA/NVIDIA/DXCache e LOCALAPPDATA/NVIDIA/GLCache.

Veja [o relatório de investigação](CLEANUP-ANALYSIS.md) para a evidência e os limites da correspondência com o aplicativo de referência.

Validação da versão 0.3.1: 67 testes aprovados, nenhuma falha e um teste de junction ignorado. Nenhuma pasta real de temporários, Prefetch, Lixeira, Windows Update ou miniaturas foi limpa como teste. A abertura manual do pacote foi confirmada; o teste funcional da interface passou com adaptadores simulados. Operações reais continuam pendentes.


## Validação desktop e diagnóstico de abertura

Consulte [VALIDATION.md](VALIDATION.md) para os resultados reais e os limites da validação. O encerramento `0x80000003` foi observado na automação, enquanto o bloqueio de inicialização ESM encontrado no aplicativo foi corrigido. O usuário confirmou a abertura manual do pacote. Navegação, cancelamentos e operações reais têm validações próprias; a abertura não equivale à aprovação de todas elas.

O iniciador normal salva um relatório local em `evidence/desktop-launch.json` e mantém a mensagem de erro visível se houver falha. Não precisa de administrador. Feche o aplicativo antes de gerar um novo pacote.

`npm run validate:package` confere os arquivos do pacote. `npm run validate:desktop` executa o teste da janela com registro e PowerShell simulados, quando o Electron conseguir iniciar. O empacotamento agora preserva o pacote anterior em `release/CS Booster.previous-*` e copia os dados locais para o novo pacote.

A inicialização também registra etapas em `release/CS Booster/resources/app/data/startup.jsonl`. O perfil portátil é definido antes da trava de instância única. O iniciador preserva a mensagem de encerramento precoce mesmo com código zero.

O bloqueio da entrada ESM ao aguardar prontidão foi corrigido: o módulo principal agora termina de carregar antes da criação assíncrona da janela. Para validar a interface com registro e PowerShell simulados pelo Windows normal, use `Validar interface.cmd`. Esse teste não executa otimizações reais e recusa relatórios antigos como prova de sucesso.

Validação desktop concluída para abertura e interface: nove módulos, 29 ajustes no catálogo, oito opções de limpeza, filtros, cancelamentos, isolamento e comparação por IPC. O relatório confirmou zero escritas de registro e zero execuções de limpeza. A próxima etapa são operações reais em Windows de testes, com aplicação e restauração verificadas.


## Navegação na 0.3.2

A tela global de carregamento foi removida das trocas de módulo. Telas recentes e consultas são reaproveitadas em memória por até dez segundos. Consultas em andamento são compartilhadas; alterações e atualização explícita invalidam o cache. Uma consulta real ainda pode levar tempo na primeira visita ou após a expiração, mas a estrutura do módulo fica visível e as ações permanecem bloqueadas até a verificação.

A leitura dos estados passou de nove processos PowerShell para uma consulta agrupada. O painel consulta dados independentes em paralelo e módulos de orientação não consultam estados desnecessários. Os oito recursos de limpeza foram preservados.

A [comparação com o TogsBoost](NAVIGATION-ANALYSIS.md) apresenta os trechos examinados com REA, a tentativa de Ghidra e os limites da conclusão. A suíte atual tem 84 testes: 83 aprovados e uma omissão conhecida. A prévia da 0.3.2 foi conferida; a aprovação desktop da 0.3.1 permanece histórica e não substitui um novo relatório da 0.3.2.

Validação desktop da 0.3.2 aprovada: retorno recente sem consultas extras, formulário preservado e atualização explícita verificados com adaptadores simulados. Nenhuma alteração real do Windows foi executada.

O roteiro da próxima etapa está em [WINDOWS-LAB.md](WINDOWS-LAB.md): laboratório persistente e critérios para validar aplicação, verificação e restauração reais. Preparar o laboratório não significa aprovar essas operações.
