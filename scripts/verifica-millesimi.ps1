$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'

function Login($e, $p) {
  (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken
}
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Id($x) { if ($null -eq $x) { return $null } elseif ($x.id) { return $x.id } else { return $x._id } }

$ok = 0
$ko = 0
function Check($nome, $cond, $dettaglio = '') {
  if ($cond) { $script:ok++; "  OK   $nome" }
  else { $script:ko++; "  KO   $nome $dettaglio" }
}
function Status($method, $path, $body) {
  $h = Auth $ad
  try {
    Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8) | Out-Null
    return '200'
  } catch {
    $d = $_.ErrorDetails.Message
    if ($d) { $m = [regex]::Match($d, '"code"\s*:\s*"(\w+)"'); if ($m.Success) { return $m.Groups[1].Value } }
    return "HTTP$([int]$_.Exception.Response.StatusCode)"
  }
}

$ad = Login 'admin@condomini.local' 'Admin123!'
$h = Auth $ad
# Se una precedente esecuzione è stata interrotta prima della pulizia, il
# condominio è ancora in carico e la capacità contrattuale potrebbe esaurirsi:
# va rimosso con `npm run purge:condominio --workspace server -- <id>`.
$orfani = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data.condomini |
  Where-Object { $_.nome -eq 'Prova millesimi' }
if ($orfani) {
  "  ATTENZIONE: restano condomini di prova non ripuliti: $(($orfani | ForEach-Object { $_.condominioId }) -join ', ')"
  exit 1
}

$c = (Invoke-RestMethod -Method Post -Uri "$base/condomini" -Headers $h -ContentType 'application/json' -Body (@{nome='Prova millesimi';indirizzo=@{via='Via Prova';civico='1';citta='Milano';cap='20100';provincia='MI'};totaleMillesimi=1000} | ConvertTo-Json -Depth 6)).data
$cid = Id $c

"== 1. condominio nuovo: nessuna quota definita =="
$r = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/riepilogo" -Headers $h).data
$t = $r.tabella
Check 'il riepilogo espone la tabella' ($null -ne $t)
Check 'nessuna ripartizione attiva' ($t.ripartizioniAttive.Count -eq 0) "attive: $($t.ripartizioniAttive -join ',')"
# Prima era `valida: true` con totale `{}`: il messaggio prometteva una tabella valida e stampava `undefined`.
Check 'non e valida' ($t.valida -eq $false) "valida $($t.valida)"
Check 'il problema riporta lo scarto di 1000' ($t.problemi.Count -eq 1 -and $t.problemi[0].scarto -eq -1000) "problemi: $($t.problemi | ConvertTo-Json -Compress)"
Check 'totale diritto e zero, non undefined' ($t.totaleDiritto -eq 0) "totaleDiritto '$($t.totaleDiritto)'"

"== 2. un condominio con tabella definita: il riepilogo e coerente =="
# Solo lettura su un condominio già popolato: creare qui unità e quote
# renderebbe il condominio non eliminabile (la guardia di cancellazione lo
# impedirebbe), quindi la pulizia non sarebbe più possibile.
$conTabella = $null
foreach ($x in (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data.condomini) {
  $rr = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$($x.condominioId)/riepilogo" -Headers $h).data
  if ($null -ne $rr.tabella -and $rr.tabella.ripartizioniAttive.Count -gt 0) {
    $conTabella = @{ id = $x.condominioId; nome = $x.nome; riepilogo = $rr.tabella }
    break
  }
}
Check 'esiste un condominio con tabella definita' ($null -ne $conTabella) 'nessun condominio del profilo ha quote'
if ($null -ne $conTabella) {
  Check 'riepilogo valido' ($conTabella.riepilogo.valida -eq $true) "valida $($conTabella.riepilogo.valida)"
  Check 'riepilogo con totale 1000' ($conTabella.riepilogo.totaleDiritto -eq 1000) "totaleDiritto $($conTabella.riepilogo.totaleDiritto)"
  Check 'riepilogo con diritto attivo' ($conTabella.riepilogo.ripartizioniAttive -contains 'diritto')
  Check 'nessun problema residuo' ($conTabella.riepilogo.problemi.Count -eq 0) "problemi: $($conTabella.riepilogo.problemi | ConvertTo-Json -Compress)"

  "== 3. una revisione squilibrata viene rifiutata e non cambia quella attiva =="
  $tab = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$($conTabella.id)/tabella-millesimi" -Headers $h).data
  $prima = $tab.revisione
  $righe = @($tab.righe | ForEach-Object { @{ unitaId = $_.unitaId; quote = $_.quote } })
  $primaRiga = $righe[0].quotes.diritto
  $righe[0].quote.diritto = $primaRiga + 10
  $s = Status Post "/condomini/$($conTabella.id)/tabella-millesimi" @{ delibera='Squilibrata'; righe=$righe }
  Check 'revisione squilibrata rifiutata' ($s -ne '200') "esito $s"
  $dopo = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$($conTabella.id)/tabella-millesimi" -Headers $h).data
  Check 'la revisione attiva non e cambiata' ($dopo.revisione -eq $prima) "prima $prima, dopo $($dopo.revisione)"
}

try {
  Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid" -Headers $h | Out-Null
} catch {
  "  ATTENZIONE: pulizia fallita, residuo ${cid}: $($_.ErrorDetails.Message)"
  $ko++
}

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
