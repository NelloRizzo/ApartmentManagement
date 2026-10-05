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
function Status($method, $path, $body, $token) {
  $h = Auth $token
  try {
    if ($null -eq $body) {
      Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h | Out-Null
    } else {
      Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType 'application/json' -Body ($body|ConvertTo-Json -Depth 10) | Out-Null
    }
    return '200'
  } catch {
    $d = $_.ErrorDetails.Message
    if ($d) { $m = [regex]::Match($d, '"code"\s*:\s*"(\w+)"'); if ($m.Success) { return $m.Groups[1].Value } }
    return "HTTP$([int]$_.Exception.Response.StatusCode)"
  }
}
function Get($path, $token) { (Invoke-RestMethod -Method Get -Uri "$base$path" -Headers (Auth $token)).data }

# Anno dedicato: il consuntivo di un anno in uso non deve essere toccato.
$anno = 2099

$ad = Login 'admin@condomini.local' 'Admin123!'
$h = Auth $ad
$cid = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data.condomini[0].condominioId

# Pulisce un eventuale residuo di una precedente esecuzione interrotta.
foreach ($b in @(Get "/condomini/$cid/bilanci?anno=$anno" $ad)) {
  Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($b._id)/approva" -Headers $h -ContentType 'application/json' -Body '{"approvato":false}' | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/bilanci/$($b._id)" -Headers $h | Out-Null
}

"== 1. creazione del preventivo =="
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci" -Headers $h -ContentType 'application/json' -Body (@{anno=$anno;tipo='preventivo';descrizione='Preventivo di prova'} | ConvertTo-Json)
$bid = Id $t.data
Check 'preventivo creato' ($null -ne $bid) $t.error.message
Check 'crea con zero voci' ($t.data.voci.Count -eq 0)
Check 'totale iniziale zero' ($t.data.totale -eq 0)
Check 'descrizione registrata' ($t.data.descrizione -eq 'Preventivo di prova')

"== 2. la seconda creazione non azzera le voci =="
$v = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/voci" -Headers $h -ContentType 'application/json' -Body (@{categoria='pulizie';descrizione='Pulizie scale';importo=1200;ripartizione='diritto'} | ConvertTo-Json)
Check 'voce aggiunta' ($v.data.voci.Count -eq 1) $v.error.message
Check 'totale ricalcolato dal server' ($v.data.totale -eq 1200) "totale $($v.data.totale)"
$s = Status Post "/condomini/$cid/bilanci" (@{anno=$anno;tipo='preventivo';voci=@()}) $ad
Check 'creazione duplicata rifiutata' ($s -eq 'CONFLICT') "esito $s"
$riletta = Get "/condomini/$cid/bilanci/$bid" $ad
Check 'la voce non e stata persa' ($riletta.voci.Count -eq 1) "voci $($riletta.voci.Count)"

"== 3. modifica dei dati del bilancio =="
$t = Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/bilanci/$bid" -Headers $h -ContentType 'application/json' -Body (@{descrizione='Preventivo deliberato';note='nota di prova'} | ConvertTo-Json)
Check 'descrizione aggiornata' ($t.data.descrizione -eq 'Preventivo deliberato') $t.error.message
Check 'note aggiornate' ($t.data.note -eq 'nota di prova')
Check 'anno non modificabile' ($t.data.anno -eq $anno)
Check 'voci intatte dopo il patch' ($t.data.voci.Count -eq 1)

"== 4. il consuntivo non si genera su un preventivo non approvato =="
$s = Status Post "/condomini/$cid/bilanci/$bid/consuntivo" $null $ad
Check 'consuntivo rifiutato senza approvazione' ($s -eq 'BAD_REQUEST') "esito $s"

"== 5. approvazione =="
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/approva" -Headers $h -ContentType 'application/json' -Body '{"approvato":true}'
Check 'bilancio approvato' ($t.data.approvato -eq $true) $t.error.message
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/consuntivo" -Headers $h -ContentType 'application/json' -Body '{}'
$cid2 = Id $t.data
Check 'consuntivo generato' ($t.data.tipo -eq 'consuntivo') $t.error.message
Check 'consuntivo porta il totale previsto' ($t.data.totalePrevisto -eq 1200) "previsto $($t.data.totalePrevisto)"
Check 'consuntivo ripropone le voci' ($t.data.voci.Count -eq 1)

"== 6. il bilancio approvato non si elimina ne si modifica =="
Check 'delete di un bilancio approvato rifiutato' ((Status Delete "/condomini/$cid/bilanci/$bid" $null $ad) -eq 'NOT_FOUND')

"== 7. revoca e poi eliminazione =="
# Prima il consuntivo: risale al preventivo con `daBilancio`.
Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/bilanci/$cid2" -Headers $h | Out-Null
Check 'consuntivo di prova ripulito' ((Status Get "/condomini/$cid/bilanci/$cid2" $null $ad) -eq 'NOT_FOUND')
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/approva" -Headers $h -ContentType 'application/json' -Body '{"approvato":false}'
Check 'approvazione revocata' ($t.data.approvato -eq $false)
Check 'bilancio eliminabile dopo la revoca' ((Status Delete "/condomini/$cid/bilanci/$bid" $null $ad) -eq '200')
Check 'bilancio non esiste piu' ((Status Get "/condomini/$cid/bilanci/$bid" $null $ad) -eq 'NOT_FOUND')

"== 8. il condomino non gestisce i bilanci =="
$co = Login 'marco.rossi@example.com' 'Condomino123!'
Check 'condomino non crea' ((Status Post "/condomini/$cid/bilanci" (@{anno=2098;tipo='preventivo';voci=@()}) $co) -eq 'FORBIDDEN')
Check 'condomino non approva' ((Status Post "/condomini/$cid/bilanci/$cid2/approva" (@{approvato=$true}) $co) -eq 'FORBIDDEN')
Check 'condomino non elimina' ((Status Delete "/condomini/$cid/bilanci/$cid2" $null $co) -eq 'FORBIDDEN')

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
