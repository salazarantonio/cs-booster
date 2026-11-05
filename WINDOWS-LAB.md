# Laboratório Windows para validação real

Estado: preparação. VirtualBox 7.2.22 instalado após autorização; instalador oficial com assinatura válida da Oracle e SHA-256 conferido. A criação da VM desligada foi executada e a configuração foi consultada com sucesso. Um teste de inicialização do firmware, ainda sem Windows, iniciou com 512 MB; a VM foi desligada e voltou à configuração de 4 GB. Isso não comprova funcionamento do Windows convidado. A ISO oficial pt-BR x64 foi conferida pelo SHA-256 publicado pela Microsoft e conectada à unidade de DVD virtual. Após liberar memória, a VM iniciou com 4 GB. O Windows convidado, o snapshot de base e as operações reais ainda não foram validados. A interface 0.3.2 passou com adaptadores simulados; os testes abaixo ainda não passaram em um Windows convidado. Nenhum resultado de FPS é inferido desta etapa.

## Ambiente

Usar uma VM persistente chamada `CS-Booster-Lab`, com 3 CPUs virtuais, 4 GB de RAM, EFI, TPM 2.0 e disco VDI dinâmico de 80 GB. O disco é um arquivo novo; não se conecta uma partição física. A proposta inicial usa o D: pelo espaço disponível. Não iniciar com memória insuficiente no host.

O script `scripts/prepare-windows-lab.ps1` cria somente uma VM nova desligada; recusa substituir uma pasta existente, exige espaço livre e interrompe no primeiro erro do VirtualBox. Não apaga artefatos em caso de falha. `-WhatIf` mostra o destino sem criar a VM. ISO, inicialização, instalação e snapshots são etapas separadas, ainda necessárias.

A rede, área de transferência, arrastar arquivos e aceleração 3D ficam desabilitados na configuração inicial. O apontador usa USB Tablet e controlador xHCI emulados; não são criados filtros nem conectados dispositivos USB físicos. Nenhuma pasta pessoal é compartilhada. Se for necessário acesso à internet durante a instalação e atualização, usar NAT temporariamente, sem portas encaminhadas, e desconectar antes dos testes de segurança. Não alterar o hipervisor, proteções ou BIOS do host para contornar problemas de inicialização.

Instalar o Windows de mídia oficial e com licença ou avaliação adequada. Instalar o pacote portátil do CS Booster dentro do convidado e criar um snapshot de base desligado após as atualizações. Copiar o aplicativo por mídia de teste, sem mapear dados pessoais. Verificar existência e recuperação do snapshot antes do primeiro teste de escrita.

## Ordem e critérios

| Etapa | Procedimento no convidado | Evidência exigida |
| --- | --- | --- |
| Base | Registrar build, permissões, versão e hash do pacote; abrir interface | Relatório identificado como VM e versão correta |
| Seis ajustes HKCU | Um ajuste por vez: capturar existência/tipo/valor, aplicar, conferir, restaurar o backup específico, conferir novamente | Estado restaurado idêntico ao anterior; ajuste já ativo é caso separado, sem fingir escrita |
| Cancelamentos e permissões | Cancelar antes de executar; repetir com conta padrão | Sem escrita após cancelar; recursos administrativos bloqueados |
| Oito limpezas | Criar arquivos sintéticos nos destinos do convidado, incluir bloqueados e itens fora do escopo; executar cada ação separada | Itens fora do escopo preservados, contagens reais, erros e limitações visíveis; snapshot recuperável antes de testar Lixeira |
| Debloat seletivo | Inventariar; selecionar um pacote descartável; cancelar primeiro, depois remover | Somente pacote selecionado da conta atual removido; voltar ao snapshot após testar, sem afirmar reinstalação pelo app |
| Mitigações | Snapshot separado; salvar estado; aplicar apenas perfis compatíveis com CPU exposta; conferir registro; reiniciar convidado; restaurar e reiniciar | Backup e reversão exatos; anotar proteção efetiva como não verificada até existir consulta apropriada |
| Recuperação | Reiniciar e recuperar o snapshot de base | Convidado inicia e o estado anterior volta; recuperação não depende de o CS Booster abrir |

Não automatizar todas as ações em sequência sem observar cada resultado. Registrar tentativa, falha, parcial e restauração separadamente. O perfil `desligar-tudo` é um teste dedicado, offline e recuperável, nunca o perfil padrão do laboratório.

A VM permite verificar aplicação e restauração no convidado, mas o hipervisor controla quais capacidades de CPU aparecem. Perfis AMD não podem ser aprovados em um convidado que exponha Intel, nem o inverso. Resultados não comprovam segurança do host, comportamento em hardware físico, anti-cheat ou desempenho competitivo. GPU virtual não serve para aprovar HAGS, drivers NVIDIA/AMD ou FPS no CS2.

## Relatórios e publicação

Guardar os relatórios em `evidence/`, fora do Git. Registrar versão, caso, snapshots anteriores/esperados/observados, ID do backup, reinicializações e resultado de restauração. Não exportar credenciais, chaves de produto, contas pessoais ou conteúdo dos arquivos. Publicar apenas conclusão revisada e limites da cobertura, depois dos testes efetivamente executados.

Fontes oficiais: [edições compatíveis com Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox), [instalação do VirtualBox](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html), [ISO Windows 11](https://www.microsoft.com/pt-br/software-download/windows11).

Preparada uma cópia limpa da versão 0.3.2 para transferência: 73 arquivos do runtime e 22 da aplicação comparados por SHA-256, sem perfil local. A cópia não comprova abertura no convidado. A suíte continua com 83 aprovados, zero falhas e uma omissão conhecida de junction.

## Inicialização observada

Com 2 CPUs e o motor native API/Hyper-V, a VM parou em tela preta e o log terminou em `EFI: debug point DXE_AP`. Após desligar a VM ainda sem Windows e ajustar somente o convidado para 3 CPUs, o firmware avançou à solicitação de inicialização pelo DVD. Há um [relato equivalente no projeto VirtualBox](https://github.com/VirtualBox/virtualbox/issues/799). Isso sustenta o contorno adotado, sem afirmar que todos os travamentos de EFI tenham essa causa. A configuração inicial do script agora usa 3 CPUs. Nenhuma proteção ou recurso de virtualização do host foi desativado.

A entrada automatizada de teclado no firmware não produziu a navegação esperada; foi solicitada interação manual para selecionar o DVD. Essa observação ainda não comprova que o instalador ou o Windows convidado tenham iniciado.

## Mouse no instalador

O instalador foi visto na tela de seleção da instalação, mas a entrada pelo mouse PS/2 com captura não acionou os controles como esperado; o usuário também informou não conseguir clicar. A VM foi reiniciada ainda sem instalação iniciada e recebeu USB Tablet com xHCI emulado. A configuração foi conferida como `hidpointing="usbtablet"` e `xhci="on"`, com nenhum dispositivo USB físico conectado. A confirmação funcional dos cliques dentro do instalador ainda depende de voltar à mídia e testar. O padrão do script acompanha a nova configuração. A [documentação da Oracle](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html) descreve as coordenadas absolutas do USB Tablet; isso não substitui a verificação funcional nesta VM.
