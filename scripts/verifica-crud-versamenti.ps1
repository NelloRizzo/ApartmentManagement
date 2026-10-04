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
      Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType 'application/json' -Body ($body|ConvertTo-Json -Depth 8) | Out-Null
    }
    return '200'
  } catch {
    $d = $_.ErrorDetails.Message
    if ($d) { $m = [regex]::Match($d, '"code":"(\w+)"'); if ($m.Success) { return $m.Groups[1].Value } }
    return "HTTP$([int]$_.Exception.Response.StatusCode)"
  }
}

$ad = Login 'admin@condomini.local' 'Admin123!'
$h = Auth $ad
$cid = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data.condomini[0].condominioId
$unita = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/unita?limit=1&attiva=true" -Headers $h).data
if ($unita.Count -eq 0) { throw 'nessuna unita attiva nel condominio di prova' }
$uid = Id $unita[0]

"== 1. registrazione =="
$corpo = @{ unita=$uid; periodo=@{anno=2026; mese=7}; importo=123.45; dataVersamento='2026-07-10'; metodo='bonifico'; causale="Verifica $uid"; identificativoTransazione="TX-$([guid]::NewGuid().ToString('N').Substring(0,8))" }
$v = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/versamenti" -Headers $h -ContentType 'application/json' -Body ($corpo|ConvertTo-Json)).data
$vid = Id $v
Check 'versamento registrato' ($null -ne $vid) $v.error.message
Check 'importo registrato' ([math]::Abs($v.importo - 123.45) -lt 0.001) "importo $($v.importo)"

"== 2. modifica dei campi consentiti =="
$t = Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/versamenti/$vid" -Headers $h -ContentType 'application/json' -Body (@{importo=200; metodo='contanti'; note='corretto'} | ConvertTo-Json)
Check 'importo aggiornato' ([math]::Abs($t.data.importo - 200) -lt 0.001) "importo $($t.data.importo)"
Check 'metodo aggiornato' ($t.data.metodo -eq 'contanti') $t.data.metodo
Check 'nota aggiornata' ($t.data.note -eq 'corretto') $t.data.note
Check 'periodo invariato' ($t.data.periodo.anno -eq 2026 -and $t.data.periodo.mese -eq 7) "$($t.data.periodo.anno)/$($t.data.periodo.mese)"

"== 3. unita e periodo non vengono spostati =="
# La validazione scarta i campi non previsti invece di rifiutarli: la richiesta
# va a buon fine, quindi il controllo è sull'effetto, non sul codice di errore.
Status Patch "/condomini/$cid/versamenti/$vid" (@{unita=$uid; periodo=@{anno=2025; mese=1}}) $ad | Out-Null
$dopo = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/versamenti?limit=30&anno=2026" -Headers $h).data.documenti
$r = $dopo | Where-Object { (Id $_) -eq $vid }
Check 'periodo invariato dopo il tentativo di spostamento' ($r.periodo.anno -eq 2026 -and $r.periodo.mese -eq 7) "$($r.periodo.anno)/$($r.periodo.mese)"
Check 'unita invariata dopo il tentativo di spostamento' ((Id $r.unita) -eq $uid) "unita $(Id $r.unita) attesa $uid"

"== 4. importo non positivo rifiutato =="
$s = Status Patch "/condomini/$cid/versamenti/$vid" (@{importo=0}) $ad
Check 'importo zero rifiutato' ($s -eq 'BAD_REQUEST') "esito $s"

"== 5. il condòmino non modifica né cancella =="
$co = Login 'marco.rossi@example.com' 'Condomino123!'
Check 'condomino non modifica' ((Status Patch "/condomini/$cid/versamenti/$vid" (@{importo=1}) $co) -eq 'FORBIDDEN')
Check 'condomino non cancella' ((Status Delete "/condomini/$cid/versamenti/$vid" $null $co) -eq 'FORBIDDEN')

"== 6. eliminazione =="
Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/versamenti/$vid" -Headers $h | Out-Null
$t = Status Get "/condomini/$cid/versamenti" $null $ad
Check 'lista ricaricata senza errori' ($t -eq '200') "esito $t"

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
