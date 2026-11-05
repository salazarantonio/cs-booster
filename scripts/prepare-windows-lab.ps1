[CmdletBinding(SupportsShouldProcess=$true)]
param([string]$BaseFolder='D:\CSBoosterLab')
$ErrorActionPreference='Stop'
$taskVBox='C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$taskName='CS-Booster-Lab'
$taskBase=[IO.Path]::GetFullPath($BaseFolder)
$taskFolder=Join-Path $taskBase $taskName
$taskDisk=Join-Path $taskFolder 'Windows-testes.vdi'
function Invoke-LabVBox([string[]]$VBoxArguments) {
    & $taskVBox @VBoxArguments
    if ($LASTEXITCODE -ne 0) { throw ('VirtualBox falhou: '+$VBoxArguments[0]+'. Arquivos existentes foram preservados.') }
}
if (-not (Test-Path -LiteralPath $taskVBox -PathType Leaf)) { throw 'Instale o VirtualBox oficial antes de preparar a VM.' }
if (Test-Path -LiteralPath $taskFolder) { throw 'A pasta da VM ja existe. Nao sera substituida.' }
$taskVolume=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($taskBase))
if ($taskVolume.AvailableFreeSpace -lt 100GB) { throw 'Reserve pelo menos 100 GB livres para disco, ISO e snapshots.' }
if ($PSCmdlet.ShouldProcess($taskFolder,'Criar VM desligada com disco virtual dinamico de 80 GB')) {
    Invoke-LabVBox -VBoxArguments @('createvm','--name',$taskName,'--platform-architecture','x86','--ostype','Windows11_64','--basefolder',$taskBase,'--register')
    Invoke-LabVBox -VBoxArguments @('modifyvm',$taskName,'--memory','4096','--cpus','2','--firmware','efi','--tpm-type','2.0','--ioapic','on','--graphicscontroller','vboxsvga','--vram','128','--accelerate-3d','off','--clipboard-mode','disabled','--drag-and-drop','disabled','--nic1','none','--usb-ohci','off','--usb-ehci','off','--usb-xhci','off','--audio-enabled','off','--boot1','dvd','--boot2','disk')
    Invoke-LabVBox -VBoxArguments @('createmedium','disk','--filename',$taskDisk,'--size','81920','--format','VDI','--variant','Standard')
    Invoke-LabVBox -VBoxArguments @('storagectl',$taskName,'--name','SATA','--add','sata','--controller','IntelAhci')
    Invoke-LabVBox -VBoxArguments @('storageattach',$taskName,'--storagectl','SATA','--port','0','--device','0','--type','hdd','--medium',$taskDisk)
    Invoke-LabVBox -VBoxArguments @('storageattach',$taskName,'--storagectl','SATA','--port','1','--device','0','--type','dvddrive','--medium','emptydrive')
    Invoke-LabVBox -VBoxArguments @('showvminfo',$taskName,'--machinereadable')
    Write-Host 'VM preparada e desligada. Falta instalar o Windows, conferir a inicializacao e criar snapshot de base.'
}
