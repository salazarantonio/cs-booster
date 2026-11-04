$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEvidence = Join-Path $taskRoot 'evidence'
$taskExe = Join-Path $taskRoot 'node_modules\electron\dist\electron.exe'
$taskScript = Join-Path $PSScriptRoot 'smoke.mjs'
try {
    if (-not (Test-Path -LiteralPath $taskExe -PathType Leaf)) { throw 'Runtime local nao encontrado. Instale as dependencias do projeto antes de validar.' }
    New-Item -ItemType Directory -Path $taskEvidence -Force | Out-Null
    $taskStarted = [DateTime]::UtcNow
    $taskStart = New-Object Diagnostics.ProcessStartInfo
    $taskStart.FileName = $taskExe
    $taskStart.Arguments = '"' + $taskScript + '"'
    $taskStart.WorkingDirectory = $taskRoot
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.RedirectStandardOutput = $true
    $taskStart.RedirectStandardError = $true
    $taskStart.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
    $taskProcess = New-Object Diagnostics.Process
    $taskProcess.StartInfo = $taskStart
    if (-not $taskProcess.Start()) { throw 'O Windows nao iniciou o teste.' }
    $taskOutput = $taskProcess.StandardOutput.ReadToEndAsync()
    $taskError = $taskProcess.StandardError.ReadToEndAsync()
    if (-not $taskProcess.WaitForExit(30000)) {
        $taskProcess.Kill()
        $taskProcess.WaitForExit()
        throw 'O teste excedeu 30 segundos. Apenas o processo de teste foi encerrado.'
    }
    [IO.File]::WriteAllText((Join-Path $taskEvidence 'desktop-ui.stdout.log'), $taskOutput.GetAwaiter().GetResult())
    [IO.File]::WriteAllText((Join-Path $taskEvidence 'desktop-ui.stderr.log'), $taskError.GetAwaiter().GetResult())
    if ($taskProcess.ExitCode -ne 0) { throw ('O teste encerrou com codigo ' + $taskProcess.ExitCode + '. Consulte evidence\desktop-ui.stderr.log.') }
    $taskReport = Get-Content -LiteralPath (Join-Path $taskEvidence 'ui-validation.json') -Raw | ConvertFrom-Json
    if ($taskReport.passed -ne $true -or [DateTime]::Parse($taskReport.at).ToUniversalTime() -lt $taskStarted) { throw 'O teste nao produziu um resultado aprovado atualizado.' }
    Write-Host 'VALIDACAO DA INTERFACE APROVADA.'
    Write-Host 'Nove modulos, oito opcoes de limpeza, filtros, cancelamentos, isolamento e comunicacao com o aplicativo conferidos.'
    Write-Host 'Registro e PowerShell simulados: nenhuma otimizacao ou limpeza real foi executada.'
    Write-Host 'Relatorio local: evidence\ui-validation.json'
    exit 0
} catch {
    Write-Host ('VALIDACAO NAO CONCLUIDA: ' + $_.Exception.Message)
    exit 1
}
