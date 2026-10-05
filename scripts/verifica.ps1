# Verifiche di permesso e CRUD sul server locale.
#
# Un solo comando instead diCalls separate: ogni script gira in sequenza e il
# primo rosso interrompe, così la durata totale è nota e limitata.
#
#   npm run verifica
#
# Richiede il server di sviluppo in ascolto su localhost:4000 (`npm run dev:server`,
# che con `tsx watch` si ricarica da solo a ogni modifica del server).
$ErrorActionPreference = 'Continue'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptVerifiche = @(
  'verifica-permesso-comunicazioni.ps1',
  'verifica-crud-condomini.ps1',
  'verifica-crud-verbali.ps1',
  'verifica-crud-versamenti.ps1',
  'verifica-crud-assemblee.ps1',
  'verifica-crud-bilanci.ps1',
  'verifica-millesimi.ps1',
  'verifica-attivita.ps1'
)

$falliti = @()

foreach ($nome in $scriptVerifiche) {
  $percorso = Join-Path $scriptDir $nome
  if (-not (Test-Path $percorso)) {
    "== $nome non presente, saltato =="
    continue
  }
  ""
  "===== $nome ====="
  & powershell -NoProfile -ExecutionPolicy Bypass -File $percorso
  if ($LASTEXITCODE -ne 0) { $falliti += $nome }
}

""
if ($falliti.Count -gt 0) {
  "VERIFICHE FALLITE: $($falliti -join ', ')"
  exit 1
}
' Tutte le verifiche sono passate.'
