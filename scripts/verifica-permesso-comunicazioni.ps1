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

# Ritorna il codice di errore dell'API: distingue 401 (sessione caduta) da 403
# (permesso assente), che è esattamente ciò che qui si vuole distinguere.
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
    if ($d) {
      $m = [regex]::Match($d, '"code"\s*:\s*"(\w+)"')
      if ($m.Success) { return $m.Groups[1].Value }
    }
    return "HTTP$([int]$_.Exception.Response.StatusCode)"
  }
}

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$condomini = (Invoke-RestMethod -Method Get -Uri "$base/condomini?limit=100" -Headers (Auth $sa)).data
if ($condomini.Count -lt 2) { throw 'servono almeno due condomini: eseguire il seed prima della verifica' }

# Il condominio del condòmino: serve a distinguere "può scrivere perché è
# iscritto" da "può scrivere perché ha il permesso".
function CondominioDi($email) {
  foreach ($c in $condomini) {
    $cid = Id $c
    $iscritti = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/condomini?limit=100" -Headers (Auth $sa)).data
    foreach ($i in $iscritti) {
      # L'iscritto espone l'email dentro `utente`, non in un campo piatto.
      if ($i.utente.email -eq $email) { return $cid }
    }
  }
  return $null
}
$mio = CondominioDi 'marco.rossi@example.com'
if (-not $mio) { throw 'marco.rossi non risulta iscritto a nessun condominio' }
$altro = $null
foreach ($c in $condomini) { if ((Id $c) -ne $mio) { $altro = Id $c; break } }

function IdStaff($path, $email) {
  $l = (Invoke-RestMethod -Method Get -Uri "$base/staff/$path`?search=$([uri]::EscapeDataString($email))&limit=100" -Headers (Auth $sa)).data
  foreach ($x in $l) { if ($x.email -eq $email) { return Id $x } }
}
function SetPermessi($path, $id, $lista) {
  Invoke-RestMethod -Method Patch -Uri "$base/staff/$path/$id" -Headers (Auth $sa) -ContentType 'application/json' -Body (@{permessi=$lista}|ConvertTo-Json) | Out-Null
}
# Cambiare i permessi chiude le sessioni aperte (tokenVersion): senza
# riautenticare i test misurerebbero un 401 invece del permesso.
$idAd = IdStaff 'amministratori' 'admin@condomini.local'

function Avviso { @{ tipo='avviso'; oggetto="Verifica $([guid]::NewGuid().ToString('N').Substring(0,6))"; corpo='prova'; salvaComeBozza=$true } }
# Avviso e convocazione sono riservati all'amministratore per regola di business:
# il condòmino scrive con `richiesta`, che arriva comunque all'amministratore.
function Richiesta { @{ tipo='richiesta'; oggetto="Verifica $([guid]::NewGuid().ToString('N').Substring(0,6))"; corpo='prova' } }

"== 1. admin con l'unico permesso sbagliato: rotta chiusa =="
SetPermessi 'amministratori' $idAd @('versamenti:scrivere')
$ad = Login 'admin@condomini.local' 'Admin123!'
Check 'admin senza comunicazioni:scrivere respinto' ((Status Post "/condomini/$mio/comunicazioni" (Avviso) $ad) -eq 'FORBIDDEN')

"== 2. stesso admin, permesso corretto: rotta aperta =="
SetPermessi 'amministratori' $idAd @('versamenti:scrivere','comunicazioni:scrivere')
$ad = Login 'admin@condomini.local' 'Admin123!'
Check 'admin con comunicazioni:scrivere' ((Status Post "/condomini/$mio/comunicazioni" (Avviso) $ad) -eq '200')

"== 3. il superadmin non ha un elenco di permessi: passa =="
Check 'superadmin scrive' ((Status Post "/condomini/$mio/comunicazioni" (Avviso) $sa) -eq '200')

"== 4. il condòmino scrive all'amministratore sulla stessa rotta =="
$co = Login 'marco.rossi@example.com' 'Condomino123!'
$s = Status Post "/condomini/$mio/comunicazioni" (Richiesta) $co
Check 'condomino scrive (requirePermesso lo avrebbe bloccato)' ($s -eq '200') "esito $s"

"== 4b. il condòmino non può emettere un avviso a nome dello stabile =="
$s = Status Post "/condomini/$mio/comunicazioni" (Avviso) $co
Check 'avviso del condomino respinto' ($s -eq 'FORBIDDEN') "esito $s"

"== 5. il condòmino non scrive dove non è iscritto =="
$s = Status Post "/condomini/$altro/comunicazioni" (Richiesta) $co
Check 'scrittura fuori dal proprio condominio respinta' ($s -eq 'FORBIDDEN' -or $s -eq 'NOT_FOUND') "esito $s"

"== 6. la risposta in un thread non è più un errore 500 =="
# Va inviata, non salvata in bozza: una bozza non ha destinatari, quindi nessuno
# è "coinvolto" e la risposta è legittamente respinta.
$inviata = @{ tipo='avviso'; oggetto="Thread $([guid]::NewGuid().ToString('N').Substring(0,6))"; corpo='prova'; salvaComeBozza=$false }
$com = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni" -Headers (Auth $ad) -ContentType 'application/json' -Body ($inviata|ConvertTo-Json)).data
$s = Status Post "/condomini/$mio/comunicazioni/$(Id $com)/risposte" (@{ corpo='risposta di prova' }) $co
Check 'risposta a thread del condòmino' ($s -eq '200') "esito $s"

"== 7. il contatore delle non lette =="
# Una sola comunicazione inviata resta nel database: non si può cancellare una
# comunicazione già inviata, quindi il test ne lascia una a ogni esecuzione. È il
# prezzo di provare il difetto, che riguarda proprio il passaggio da "nessuno lo
# ha letto" a "qualcuno lo ha letto".
function NonLette($cid, $token) {
  (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/comunicazioni/non-lette" -Headers (Auth $token)).data.nonLette
}

function UtenteDi($cid, $email) {
  $iscritti = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/condomini?limit=100" -Headers (Auth $sa)).data
  foreach ($i in $iscritti) {
    if ($i.utente.email -eq $email) { return Id $i.utente }
  }
}
$suff = [guid]::NewGuid().ToString('N').Substring(0,6)
$coUtente = UtenteDi $mio 'marco.rossi@example.com'
if (-not $coUtente) { throw 'marco.rossi non risulta fra gli iscritti con un id utente' }

$co = Login 'marco.rossi@example.com' 'Condomino123!'
$prima = NonLette $mio $co
$adPrima = NonLette $mio $ad

# `segnalazione` e non `avviso`: avviso e convocazione partono inviati qualunque
# cosa dica `salvaComeBozza`, quindi una "bozza" creata con `avviso` sarebbe in
# realtà già stata recapitata e non si potrebbe nemmeno cancellare.
$bozza = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{tipo='segnalazione'; oggetto="Bozza $suff"; corpo='prova'; salvaComeBozza=$true}|ConvertTo-Json)).data
Check 'la bozza è davvero in bozza' ($bozza.stato -eq 'bozza') "stato $($bozza.stato)"
Check 'una bozza non conta come non letta' ((NonLette $mio $co) -eq $prima) "prima $prima, ora $((NonLette $mio $co))"
Invoke-RestMethod -Method Delete -Uri "$base/condomini/$mio/comunicazioni/$(Id $bozza)" -Headers (Auth $ad) | Out-Null

$inviata = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{tipo='avviso'; oggetto="Non lette $suff"; corpo='prova'; destinatari=@($coUtente); salvaComeBozza=$false}|ConvertTo-Json -Depth 8)).data
$dopo = NonLette $mio $co
Check 'un avviso indirizzato al condomino e non letto' ($dopo -eq ($prima + 1)) "prima $prima dopo $dopo"

# Il difetto: `stato` è un campo unico della comunicazione e `segnaLetta` lo
# porta a 'letta' per tutti. Se il contaggio guardasse `stato`, bastava che
# l'amministratore aprisse l'avviso perché il pallino del condòmino sparisse.
Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni/$(Id $inviata)/letti" -Headers (Auth $ad) | Out-Null
Check 'letta dall amministratore, resta non letta per il condomino' ((NonLette $mio $co) -eq $dopo) "atteso $dopo, trovato $((NonLette $mio $co))"

Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni/$(Id $inviata)/letti" -Headers (Auth $co) | Out-Null
Check 'letta dal condomino, sparisce dal suo contatore' ((NonLette $mio $co) -eq ($dopo - 1)) "atteso $($dopo - 1), trovato $((NonLette $mio $co))"

Check 'un proprio avviso non è una non letta per chi lo ha scritto' ((NonLette $mio $ad) -eq $adPrima) "prima $adPrima, ora $((NonLette $mio $ad))"

"== ripristino: l'admin torna ad accesso pieno =="
# `permessi: null` è l'accesso pieno. Il passaggio chiude anche le sessioni
# aperte, quindi va per ultimo: senza, l'account resterebbe delegato e i
# permessi si perderebbero da un'esecuzione all'altra.
SetPermessi 'amministratori' $idAd $null

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
