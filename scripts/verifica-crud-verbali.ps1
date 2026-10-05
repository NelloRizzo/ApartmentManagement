$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'

function Login($e, $p) {
  (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken
}
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Id($x) { if ($x.id) { return $x.id } else { return $x._id } }

$ok = 0
$ko = 0
function Check($nome, $cond, $dettaglio = '') {
  if ($cond) { $script:ok++; "  OK   $nome" }
  else { $script:ko++; "  KO   $nome $dettaglio" }
}

$ad = Login 'admin@condomini.local' 'Admin123!'
$h = Auth $ad
# `me.condomini` è un elenco di oggetti con `condominioId`, non di stringhe.
$cid = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data.condomini[0].condominioId

# Il verbale nasce dall'anagrafica di un'assemblea: per provare approvazione ed
# eliminazione serve un verbale vero, quindi si parte da un'assemblea del seed.
$ass = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee?limit=30" -Headers $h).data
if ($ass.Count -eq 0) { throw 'nessuna assemblea in locale: eseguire il seed prima della verifica' }

"== 1. generazione del verbale dall'anagrafica =="
$a = $ass[0]
$verbale = $null
try {
  $verbale = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$(Id $a)/verbale" -Headers $h -ErrorAction Stop).data
  Check 'verbale generato' ($null -ne $verbale)
} catch {
  Check 'verbale generato' $false $_.ErrorDetails.Message
}
if ($verbale) {
  $vid = Id $verbale

  "== 2. il testo si può modificare a mano =="
  $t = Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/verbali/$vid/testo" -Headers $h -ContentType 'application/json' -Body (@{testo="Verbale di verifica $vid"}|ConvertTo-Json)
  Check 'testo aggiornato' ($t.data.testo -like "Verbale di verifica*") $t.error.message

  "== 3. approvazione =="
  $t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/verbali/$vid/approva" -Headers $h -ContentType 'application/json' -Body (@{approvato=$true}|ConvertTo-Json)
  Check 'approvato' ($t.data.approvato -eq $true) $t.error.message
  Check 'approvatoIl registrato' ($null -ne $t.data.approvatoIl) $t.error.message

  "== 4. revoca approvazione =="
  $t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/verbali/$vid/approva" -Headers $h -ContentType 'application/json' -Body (@{approvato=$false}|ConvertTo-Json)
  Check 'revocato' ($t.data.approvato -eq $false) $t.error.message

"== 5. eliminazione =="
  Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/verbali/$vid" -Headers $h | Out-Null
  # Si guarda lo status, non il corpo: il 404 è la prova che il verbale è sparito.
  try {
    Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/verbali/$vid" -Headers $h -ErrorAction Stop | Out-Null
    Check 'il verbale eliminato non esiste più' $false 'la GET è ancora riuscita'
  } catch {
    $status = [int]$_.Exception.Response.StatusCode
    Check 'il verbale eliminato non esiste più' ($status -eq 404) "status $status"
  }

  "== 6. un condomino non approva né cancella =="
  $co = Login 'marco.rossi@example.com' 'Condomino123!'
  $v2 = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$(Id $a)/verbale" -Headers $h).data
  $vid2 = Id $v2
  foreach ($rotta in @(@{m='Post';p="/verbali/$vid2/approva";b=@{approvato=$true}}, @{m='Delete';p="/verbali/$vid2";b=$null})) {
    $h2 = Auth $co
    try {
      if ($rotta.b) { Invoke-RestMethod -Method $rotta.m -Uri "$base/condomini/$cid$($rotta.p)" -Headers $h2 -ContentType 'application/json' -Body ($rotta.b|ConvertTo-Json) | Out-Null }
      else { Invoke-RestMethod -Method $rotta.m -Uri "$base/condomini/$cid$($rotta.p)" -Headers $h2 | Out-Null }
      Check "condomino non puo' $($rotta.m.ToLower()) $($rotta.p)" $false 'la richiesta è riuscita'
    } catch {
      $code = ([regex]::Match($_.ErrorDetails.Message, '"code"\s*:\s*"(\w+)"')).Groups[1].Value
      Check "condomino non puo' $($rotta.m.ToLower()) $($rotta.p)" ($code -eq 'FORBIDDEN') "esito $code"
    }
  }
  Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/verbali/$vid2" -Headers $h | Out-Null
}

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
