$file = 'C:\Users\Bixbie\Documents\Project\ENIGMA\firmware\main\Enigma_pro.c'
$lines = Get-Content $file
$cutAt = 341
$trimmed = $lines[0..($cutAt - 1)]
Set-Content -Path $file -Value $trimmed -NoNewline:$false
Write-Host "Trimmed to $($trimmed.Count) lines"
