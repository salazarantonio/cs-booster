# Histórico

## 0.3.2 — 2026-11-04

- Troca de módulos sem tela global de carregamento; reaproveitamento de telas recentes e consultas em memória, sem persistência de cache.
- Consultas simultâneas deduplicadas, invalidação após operações e atualização explícita; respostas antigas não substituem o módulo atual.
- Estado e controles preservados em telas recentes; ações bloqueadas durante consultas de atualização.
- Nove leituras do registro agrupadas em um PowerShell; consultas independentes em paralelo e estados consultados apenas quando necessários.
- Oito limpezas preservadas. 84 testes de lógica/fixtures: 83 aprovados e uma omissão conhecida; prévia conferida.
- Interface desktop 0.3.2 aprovada: retorno sem novas consultas, formulário preservado, atualização explícita, nove módulos e oito limpezas; adaptadores simulados e zero mudanças reais. Aviso de captura da janela oculta registrado separadamente.
- Comparação estática com REA documentada. Ghidra iniciou a análise nativa, mas atingiu o prazo de 900 segundos; nenhuma decompilação completa foi alegada.

## Validação da 0.3.1 — 2026-11-04

- Corrigido o empacotamento repetido para montar uma pasta nova, preservar dados e arquivar o pacote anterior; teste de recuperação após falha de publicação.
- Iniciador normal com relatório local e mensagem de falha, inclusive saída zero precoce, sem exigir administrador.
- Removida a espera por prontidão no nível principal ESM, que bloqueava a inicialização; teste de regressão e iniciador de validação com adaptadores simulados.
- Perfil portátil configurado antes da trava de instância única; etapas de inicialização registradas e sete testes da lógica desktop de produção.
- Conferência SHA-256 dos arquivos do runtime e da aplicação no pacote portátil.
- Teste funcional desktop aprovado no Windows normal: nove rotas, filtros, cancelamentos, isolamento e IPC com adaptadores simulados.
- Versão do painel corrigida; 68 testes de lógica/fixtures: 67 aprovados e um ignorado. Abertura desktop e teste funcional da interface aprovados no Windows normal; operações reais ainda pendentes.

## 0.3.1 — 2026-11-04

- Corrigida a substituição indevida da lista da 0.2: DirectX, NVIDIA DirectX e NVIDIA OpenGL voltam junto às cinco limpezas da 0.3.
- Oito opções acumuladas, em dois grupos, com a mesma seleção, confirmação e relatório. Caches de shaders usam o executor existente e os destinos fixos anteriores.
- Aviso de recompilação de shaders e possibilidade de engasgos nas primeiras partidas.
- 59 testes executados: 58 aprovados, um ignorado por bloqueio na criação de junction; nenhuma limpeza dos dados reais do usuário.

## 0.3.0 — 2026-11-04

- Cinco opções de limpeza do sistema: temporários, Prefetch, Lixeira, downloads do Windows Update e miniaturas.
- Seleção individual, prévia, confirmação de exclusão permanente e confirmação adicional da Lixeira.
- Destinos fixos, recusa de redirecionamentos, inventário limitado e relatório de exclusões/ignorados/falhas.
- Registros separados da última tentativa e da última limpeza concluída; interrupções não geram sucesso fictício.
- Investigação estática com REA/Ghidra e análise da interface Electron, com limites documentados.
- Prévia web somente leitura; 57 testes: 56 aprovados e um ignorado por bloqueio de criação de junction. Executor real testado apenas em arquivos sintéticos isolados.

## 0.2.0 — 2026-11-04

- Seis recomendações indicadas pelo usuário, estrelas e filtro dedicado; categorias preservadas.
- Fluxo Limpar Windows com debloat seletivo da conta atual e alternativa Raphire guiada.
- Aplicação e restauração dos perfis de mitigações, incluindo desligar-tudo, com confirmação explícita de redução de proteção.
- Validação de administrador/fabricante, backups protegidos, verificação de valores e recuperação de falhas parciais.
- Iniciador manual de administrador e resultados por aplicativo removido.
- 33 testes aprovados; operações reais de remoção e mitigação ainda não executadas.

## 0.1.0

Interface desktop inicial, seis ajustes HKCU, backups, consulta Steam/CS2, planejamento de mitigações e comparação JSON de frametime.
