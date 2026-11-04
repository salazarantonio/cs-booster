$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskExe = Join-Path $taskRoot 'release\CS Booster\CS Booster.exe'
$taskEvidence = Join-Path $taskRoot 'evidence'
try {
    if (-not (Test-Path -LiteralPath $taskExe -PathType Leaf)) { throw 'Pacote portatil nao encontrado. Gere-o com npm run package.' }
    New-Item -ItemType Directory -Path $taskEvidence -Force | Out-Null
    $taskReport = [ordered]@{
        at = [DateTime]::UtcNow.ToString('o')
        windowsVersion = [Environment]::OSVersion.Version.ToString()
        is64BitProcess = [Environment]::Is64BitProcess
        redirectedLocalAppData = ($env:LOCALAPPDATA -match '\\Packages\\sandbox\.')
        inheritedNodeMode = (-not [string]::IsNullOrEmpty($env:ELECTRON_RUN_AS_NODE))
        exitedEarly = $null
        exitCode = $null
        exitCodeHex = $null
        windowVerified = $false
    }
    # Keep the original process handle: Windows PowerShell Start-Process may
    # return no ExitCode when a GUI process terminates before handle acquisition.
    $taskStart = New-Object Diagnostics.ProcessStartInfo
    $taskStart.FileName = $taskExe
    $taskStart.WorkingDirectory = Split-Path -Parent $taskExe
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    # Affect only this child. Never change the user's environment permanently.
    $taskStart.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
    $taskProcess = New-Object Diagnostics.Process
    $taskProcess.StartInfo = $taskStart
    if (-not $taskProcess.Start()) { throw 'O Windows nao iniciou o processo.' }
    $taskReport.exitedEarly = $taskProcess.WaitForExit(4000)
    if ($taskReport.exitedEarly) {
        $taskReport.exitCode = $taskProcess.ExitCode
        if ($null -ne $taskReport.exitCode) {
            $taskUnsigned = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$taskProcess.ExitCode), 0)
            $taskReport.exitCodeHex = ('0x{0:X8}' -f $taskUnsigned)
        }
    }
    $taskFile = Join-Path $taskEvidence 'desktop-launch.json'
    $taskReport | ConvertTo-Json | Set-Content -LiteralPath $taskFile -Encoding UTF8
    if ($taskReport.exitedEarly -and $taskReport.exitCode -ne 0) {
        Write-Host ('O CS Booster encerrou antes de manter a janela aberta. Codigo: ' + $taskReport.exitCodeHex)
        Write-Host ('Relatorio local: ' + $taskFile)
        exit 1
    }
    if ($taskReport.exitedEarly) {
        Write-Host 'O processo encerrou sem confirmar uma janela, mesmo com codigo zero.'
        Write-Host ('Relatorio local: ' + $taskFile)
        Write-Host 'O registro das etapas fica em release\CS Booster\resources\app\data\startup.jsonl.'
        exit 1
    }
    else { Write-Host 'Processo iniciado. Confirme visualmente se a janela abriu.' }
    Write-Host ('Relatorio local: ' + $taskFile)
    exit 0
} catch {
    Write-Host ('Nao foi possivel iniciar o CS Booster: ' + $_.Exception.Message)
    exit 1
}
