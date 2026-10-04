$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'

function Login($e, $p) {
  (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken
}
function Auth($t) { @{ Authorization = "Bearer $t" } }

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$h = Auth $sa

$ok = 0
$ko = 0
function Check($nome, $cond, $dettaglio = '') {
  if ($cond) { $script:ok++; "  OK   $nome" }
  else { $script:ko++; "  KO   $nome $dettaglio" }
}

function Api($method, $path, $body) {
  try {
    if ($null -eq $body) { return Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h }
    return Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType 'application/json' -Body ($body|ConvertTo-Json -Depth 8)
  } catch {
    return @{ __errore = $_.Exception.Message; __status = [int]$_.Exception.Response.StatusCode }
  }
}

$suff = [guid]::NewGuid().ToString('N').Substring(0,8).ToUpper()
$corpo = @{ nome="Verifica $suff"; codice="V$suff"; indirizzo=@{ via='Via Prova'; civico='1'; citta='Milano'; cap='20100'; provincia='MI' }; totaleMillesimi=1000 }

"== 1. creazione =="
$r = Api Post '/condomini' $corpo
Check 'crea condominio' ($r.data -and $r.data.codice -eq "V$suff") ($r.__errore)
$id = $r.data.id
if (-not $id) { $id = $r.data._id }

"== 2. modifica =="
$r = Api Patch "/condomini/$id" (@{ nome="Verifica $suff rinominata"; note='modificato' })
Check 'patch nome' ($r.data.nome -eq "Verifica $suff rinominata") ($r.__errore)
Check 'patch conserva codice' ($r.data.codice -eq "V$suff") ($r.__errore)

"== 3. cancellazione di un condominio vuoto =="
$r = Api Delete "/condomini/$id" $null
Check 'delete vuoto' (-not $r.__errore) ($r.__errore)

"== 4. la cancellazione di un condominio con dati viene rifiutata =="
$r = Api Post '/condomini' $corpo
$id2 = $r.data.id
if (-not $id2) { $id2 = $r.data._id }
$r = Api Post "/condomini/$id2/unita" (@{ codice="U$suff"; piano=1; numero='1'; metratura=50; tipo='appartamento' })
Check 'crea unita di prova' (-not $r.__errore) ($r.__errore)
$r = Api Delete "/condomini/$id2" $null
Check 'delete con dipendenze rifiutato' ($r.__status -eq 403) "status $($r.__status): $($r.__errore)"
$msg = try { (Invoke-RestMethod -Method Delete -Uri "$base/condomini/$id2" -Headers $h -ErrorAction Stop) } catch { $_.ErrorDetails.Message }
Check 'il messaggio nomina la dipendenza' (($msg -match 'unit')) $msg

"== 5. pulizia =="
$u = Api Get "/condomini/$id2/unita" $null
foreach ($x in $u.data) { $ux = if ($x.id) { $x.id } else { $x._id }; Api Delete "/condomini/$id2/unita/$ux" $null | Out-Null }
$r = Api Delete "/condomini/$id2" $null
Check 'cleanup' (-not $r.__errore) ($r.__errore)

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
