# Próximos marcos

## Prioridade imediata

- Resolver e validar a abertura do pacote Electron fora das restrições do ambiente de desenvolvimento.
- Validar aplicação/restauração em Windows de testes com administrador, sem usar o computador principal como experimento.
- Validar o inventário e remoção AppX em Windows compatível e revisar efeitos dos componentes Xbox no uso de Game Pass.
- Adicionar verificação do estado efetivo das mitigações no kernel, separada do registro.

## Próxima entrega funcional

- Plano de energia máximo com restauração do plano anterior.
- Copilot e menu de contexto com compatibilidade/reversão verificadas.
- Serviços em Manual somente após definir lista explícita, dependências e estados anteriores.
- Ampliar a limpeza para Steam/CS2, AMD e locais adicionais dos drivers. A 0.3.1 mantém os três caches da 0.2 e as cinco limpezas da 0.3, totalizando oito opções.
- Validar a limpeza do sistema em Windows de testes com arquivos bloqueados, permissões e volumes distintos.
- Backup/recuperação de configurações e cache CS2 por conta Steam.

## Depois

- Importação direta de PresentMon e medições repetíveis.
- Perfis GPU por jogo, gerenciador de aplicativos e pontos completos de restauração.
- Instalador, assinatura, atualização e testes de compatibilidade.

Recomendação de catálogo não significa executor pronto. As próximas versões devem manter indicação de indisponibilidade até cada fluxo passar pela validação correspondente.


## Estado verificado na 0.3.1

| Área | Disponível | Falta concluir |
| --- | --- | --- |
| Otimizações | Catálogo de 29, categorias e seis estrelas; seis ajustes HKCU e debloat seletivo executáveis | 22 ajustes ainda sem executor validado; quatro deles estão entre as recomendações |
| Limpeza | Oito opções acumuladas, seleção individual, destinos fixos, confirmações, bytes e falhas por item | Steam/CS2, AMD, locais adicionais de shaders e testes Windows completos |
| Debloat | Inventário e remoção seletiva da conta atual, com relatório | Validar remoção real e impacto dos componentes Xbox; Raphire permanece guia |
| Mitigações | 12 perfis, incluindo desligar-tudo, aplicação e restauração com backup protegido | Consultar proteção efetiva no kernel e validar aplicação/restauração em Windows de testes |
| Jogos | Detecção Steam/CS2 e checklist dos vídeos | Backup/reset/restauração por conta, perfil gráfico e aplicação assistida das opções do jogo |
| Diagnóstico | Comparação A/B de JSON normalizado com FPS, 1% low e P99 | Importação direta de PresentMon, coleta de métricas e medições repetíveis |
| Restauração | Backups dos valores modificados pelo aplicativo | Pontos completos de restauração do Windows e recuperação dos demais módulos |
| Aplicativos | Catálogo de ferramentas e debloat separado | Instalação/desinstalação geral e importação/exportação de seleção |
| Distribuição | Código no GitHub e pacote portátil local | Validar janela Electron, instalador, assinatura e atualização |
| Investigação original | Interface e recursos empacotados examinados | Concluir Ghidra além dos limites de tempo e recuperar a lógica original não confirmada |

As quatro recomendações ainda pendentes são **plano de energia máximo, Copilot, menu de contexto clássico e serviços em Manual**. Limpar Windows e Finalizar Tarefa com botão direito já têm executor.

Os outros 18 ajustes pendentes são: BSOD detalhado; apps Store em segundo plano; isolamento do núcleo; proteção em tempo real do Defender; inicialização rápida; localização; dicas da tela de bloqueio; Wi-Fi Sense; HAGS; otimização de jogos em janela; rede; NVIDIA; remoção de apps de jogos como ação própria; OneDrive; utilitário Limpeza de Disco; PowerShell 7 padrão; UTC; prioridade Win32. A presença no catálogo não significa que estejam disponíveis ou recomendados para toda máquina.

Ordem sugerida: validar o aplicativo desktop e seus fluxos em Windows de testes; implementar as quatro recomendações restantes com recuperação do estado anterior; concluir Steam/CS2 e shaders; ampliar diagnóstico e distribuição. A comparação de FPS depende de medições repetidas e não é substituída por uma indicação de ajuste ativo.
