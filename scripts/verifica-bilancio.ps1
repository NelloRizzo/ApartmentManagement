$base = 'http://localhost:5173/api'
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Login($e, $p) { (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken }
function Esito($nome, $script) {
  try { $r = & $script; Write-Output ("  {0,-52} ok ({1})" -f $nome, $r) }
  catch { $d = $_.ErrorDetails.Message; if ($d) { $d = ($d | ConvertFrom-Json).error.message } else { $d = $_.Exception.Message }; Write-Output ("  {0,-52} NO ({1})" -f $nome, $d) }
}

$ad = Login 'admin@condomini.local' 'Admin123!'
$as = Login 'assistente@example.com' 'Assistente123!'
$cid = (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $ad)).data.condomini[0].condominioId
$anno = (Get-Date).Year

Write-Output "=== Voci di bilancio, una alla volta (condominio $cid, anno $anno) ==="
$b = (Invoke-RestMethod -Uri "$base/condomini/$cid/bilanci?anno=$anno" -Headers (Auth $ad)).data | Where-Object { $_.tipo -eq 'preventivo' }
Write-Output "  preventivo $($b.totale) con $($b.voci.Count) voci"

Esito 'aggiungi voce "Ascensore: manutenzione straordinaria"' {
  $r = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($b._id)/voci" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{categoria='ascensore';descrizione='Manutenzione straordinaria';importo=4500;ripartizione='diritto'}|ConvertTo-Json)).data
  "totale $($r.totale), $($r.voci.Count) voci"
}
$nuova = (Invoke-RestMethod -Uri "$base/condomini/$cid/bilanci?anno=$anno" -Headers (Auth $ad)).data |
  Where-Object { $_.tipo -eq 'preventivo' } |
  ForEach-Object { $_.voci[-1] }
Write-Output "  (nuova voce id $($nuova._id))"

Esito 'modifica importo 4500 -> 5200' {
  $r = (Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/bilanci/$($b._id)/voci/$($nuova._id)" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{importo=5200}|ConvertTo-Json)).data
  "totale $($r.totale)"
}
Esito 'modifica importo negativo (deve fallire)' {
  (Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/bilanci/$($b._id)/voci/$($nuova._id)" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{importo=-100}|ConvertTo-Json)).data
}
Esito 'elimina la voce' {
  $r = (Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/bilanci/$($b._id)/voci/$($nuova._id)" -Headers (Auth $ad)).data
  "totale tornato a $($r.totale), $($r.voci.Count) voci"
}
Esito 'assistente modifica una voce (non delegato)' {
  (Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/bilanci/$($b._id)/voci/$($b.voci[0]._id)" -Headers (Auth $as) -ContentType 'application/json' -Body (@{importo=1}|ConvertTo-Json)).data
}

Write-Output ''
Write-Output '=== Approvazione e consuntivo ==='
$prev = (Invoke-RestMethod -Uri "$base/condomini/$cid/bilanci?anno=$anno" -Headers (Auth $ad)).data | Where-Object { $_.tipo -eq 'preventivo' }
Esito 'genera consuntivo con preventivo non approvato (deve fallire)' {
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($prev._id)/consuntivo" -Headers (Auth $ad)).data
}
Esito 'approva il preventivo' {
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($prev._id)/approva" -Headers (Auth $ad) -ContentType 'application/json' -Body '{"approvato":true}').data.approvato
}
Esito 'genera consuntivo dal preventivo approvato' {
  $r = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($prev._id)/consuntivo" -Headers (Auth $ad)).data
  "tipo $($r.tipo), $($r.voci.Count) voci copiate, previsto $($r.totalePrevisto), realizzato $($r.totale)"
}
$cons = (Invoke-RestMethod -Uri "$base/condomini/$cid/bilanci?anno=$anno" -Headers (Auth $ad)).data | Where-Object { $_.tipo -eq 'consuntivo' }
Esito 'prima voce del consuntivo conserva il previsto' {
  $v = $cons.voci[0]; "$($v.descrizione): previsto $($v.previsto), realizzato $($v.importo)"
}
Esito 'compila il realizzato della prima voce' {
  $r = (Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/bilanci/$($cons._id)/voci/$($cons.voci[0]._id)" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{importo=1000}|ConvertTo-Json)).data
  "totale $r.totale su previsto $($r.totalePrevisto)"
}
Esito 'genera consuntivo una seconda volta (idempotente)' {
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($prev._id)/consuntivo" -Headers (Auth $ad)).data.tipo
}
Esito 'voce su bilancio approvato (deve fallire)' {
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($prev._id)/voci" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{descrizione='Tentativo';importo=1}|ConvertTo-Json)).data
}

Write-Output ''
Write-Output '=== Modelli di punto all''ordine ==='
$modelli = (Invoke-RestMethod -Uri "$base/condomini/$cid/assemblee/modelli?anno=$anno" -Headers (Auth $ad)).data
foreach ($x in $modelli) {
  Write-Output "  - $($x.chiave) (richiede $($x.richiede), bilancio collegato: $($x.disponibile))"
  Write-Output "    delibera: $($x.punto.delibera)"
}
Esito 'assistente legge i modelli (non delegato)' {
  (Invoke-RestMethod -Uri "$base/condomini/$cid/assemblee/modelli?anno=$anno" -Headers (Auth $as)).data.Count
}
Esito 'anno non numerico (deve fallire)' {
  (Invoke-RestMethod -Uri "$base/condomini/$cid/assemblee/modelli?anno=xyz" -Headers (Auth $ad)).data
}