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

# Il difetto segnalato in bugs.md: il pallino restava a 1 anche dopo aver letto e
# risposto. Aveva due cause, e questa sezione le prende entrambe.
#
# La prima: il contatore escludeva solo le bozze, mentre la lista "Posta in arrivo"
# accetta `inviata` e `letta`. Un avviso a cui il condomino risponde passa a
# `risposta` ed esce dalla lista, ma restava contato: il pallino puntava a una voce
# che non si vedeva da nessuna parte.
$rispostaA = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{tipo='avviso'; oggetto="Risposta $suff"; corpo='prova'; destinatari=@($coUtente); salvaComeBozza=$false}|ConvertTo-Json -Depth 8)).data
$primaRisposta = NonLette $mio $co
Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni/$(Id $rispostaA)/risposte" -Headers (Auth $co) -ContentType 'application/json' -Body (@{corpo='risposta di prova'}|ConvertTo-Json) | Out-Null
$inLista = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$mio/comunicazioni?bandiera=posta&limit=100" -Headers (Auth $co)).data | Where-Object { (Id $_) -eq (Id $rispostaA) }
Check 'un avviso risposto esce da Posta in arrivo' (-not $inLista) "stato $($inLista.stato)"
Check 'e non continua a contare come non letta' ((NonLette $mio $co) -eq ($primaRisposta - 1)) "prima $primaRisposta, ora $((NonLette $mio $co))"

# La seconda: la segnatura di lettura era condizionata a `destinatario` singolo, ma
# gli avvisi hanno `destinatari`. Il condomino li apriva e il pallino non
# scendeva mai. Qui non si può provare il clic della UI, quindi si prova che il
# server accetta la segnatura su un avviso collettivo: senza `destinatario`, con
# `destinatari` pieni.
$collettivo = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{tipo='avviso'; oggetto="Collettivo $suff"; corpo='prova'; salvaComeBozza=$false}|ConvertTo-Json)).data
$primaCollettivo = NonLette $mio $co
# L'avviso risposto non conta più, quindi il collettivo riporta il contatore al
# valore di prima della risposta.
Check 'un avviso collettivo conta come non letta' ($primaCollettivo -eq $primaRisposta) "prima della risposta $primaRisposta, ora $primaCollettivo"
$s = Status Post "/condomini/$mio/comunicazioni/$(Id $collettivo)/letti" $null $co
Check 'il condomino segna come letto un avviso collettivo' ($s -eq '200') "esito $s"
Check 'il pallino scende dopo la segnatura' ((NonLette $mio $co) -eq ($primaCollettivo - 1)) "prima $primaCollettivo, ora $((NonLette $mio $co))"

"== 8. il perimetro è il condominio della rotta =="
# Il difetto: `condominio` non era dichiarato in `comunicazioneListQuery`, quindi
# `validate` lo scartava, il controller leggeva un `undefined` e la lista non
# filtrava nulla. Per un amministratore il filtro di visibilità è vuoto, quindi la
# pagina "Messaggi" mostrava i messaggi di tutti gli stabili del database. Il
# percorso indicava uno stabile suo, ma lo stabile non arrivava alla query.
# `assicuraAccesso` poi escludeva il caso singolo: chiunque poteva aprire un
# messaggio di un altro stabile conoscendone l'id.
#
# La prova usa una **bozza in uno stabili diverso** invece di creare uno stabili
# nuovo: non consuma la capacità contrattuale e si può eliminare, cosa che un
# avviso inviato non permette. Con il codice vecchio la bozza comparirebbe
# comunque nella lista, perché il filtro non guardava il condominio e per un
# amministratore `filtroVisibilita` è vuoto.
SetPermessi 'amministratori' $idAd $null
$ad = Login 'admin@condomini.local' 'Admin123!'

$bozzaAltro = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$altro/comunicazioni" -Headers (Auth $sa) -ContentType 'application/json' -Body (@{tipo='segnalazione'; oggetto="Segreto $suff"; corpo='riservato'; salvaComeBozza=$true}|ConvertTo-Json)).data
$idBozzaAltro = if ($bozzaAltro.id) { $bozzaAltro.id } else { $bozzaAltro._id }

# L'admin chiede la lista passando per uno stabile che amministra davvero.
$lista = @((Invoke-RestMethod -Method Get -Uri "$base/condomini/$mio/comunicazioni?limit=100" -Headers (Auth $ad)).data)
$rubati = @($lista | Where-Object { $_.oggetto -eq "Segreto $suff" })
Check 'la lista non contiene messaggi di un altro stabile' ($rubati.Count -eq 0) "trovati $($rubati.Count) su $($lista.Count)"
# E non lo raggiunge neanche apprendone l'id: 404, non 403, perché un 403
# confermerebbe che il messaggio esiste.
$sDettaglio = Status Get "/condomini/$mio/comunicazioni/$idBozzaAltro" $null $ad
Check 'il messaggio di un altro stabile è 404' ($sDettaglio -eq 'NOT_FOUND') "esito $sDettaglio"
# Nel suo stabile la bozza si vede: la restrizione è il condominio, non l'id.
$listaSua = @((Invoke-RestMethod -Method Get -Uri "$base/condomini/$altro/comunicazioni?bandiera=tutte&limit=100" -Headers (Auth $sa)).data)
Check 'nel suo stabile la lista contiene il messaggio' (@($listaSua | Where-Object { $_.oggetto -eq "Segreto $suff" }).Count -eq 1) "messaggi $($listaSua.Count)"
# Il condòmino è legato a un solo stabile e non deve vedere quello dell'altro.
$co = Login 'marco.rossi@example.com' 'Condomino123!'
$listaCo = @((Invoke-RestMethod -Method Get -Uri "$base/condomini/$mio/comunicazioni?limit=100" -Headers (Auth $co)).data)
Check 'il condomino non vede messaggi di un altro stabile' (@($listaCo | Where-Object { $_.oggetto -eq "Segreto $suff" }).Count -eq 0) "messaggi in lista $($listaCo.Count)"

Invoke-RestMethod -Method Delete -Uri "$base/condomini/$altro/comunicazioni/$idBozzaAltro" -Headers (Auth $sa) | Out-Null
Check 'la bozza di prova è stata eliminata' ((Status Get "/condomini/$altro/comunicazioni/$idBozzaAltro" $null $sa) -eq 'NOT_FOUND')

"== 9. il mittente può aprire il proprio messaggio =="
# `getOne` fa `populate` su mittente e destinatario, `segnaLetta` no. Confrontando
# il campo popolato si ottiene "[object Object]" e il controllo di partecipazione
# fallisce sempre: il condòmino non riusciva ad aprire la richiesta che aveva
# scritto, mentre all'amministratore non diceva niente perché per lui quel controllo
# non esiste. Il test passa dal percorso che chiama `getOne`.
$co = Login 'marco.rossi@example.com' 'Condomino123!'
$richiesta = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$mio/comunicazioni" -Headers (Auth $co) -ContentType 'application/json' -Body (@{tipo='richiesta'; oggetto="Mia richiesta $suff"; corpo='prova'}|ConvertTo-Json)).data
$sProprio = Status Get "/condomini/$mio/comunicazioni/$($richiesta._id)" $null $co
Check 'il condomino apre il proprio messaggio' ($sProprio -eq '200') "esito $sProprio"
# Stesso messaggio, altro stabile. Qui risponde 403 e non 404 perché a fermare la
# richiesta è `requireCondominioAccess`, che chiede una posizione nel condominio
# prima ancora di arrivare al messaggio: è il livello più esterno e non rivela
# niente. Il 404 del perimetro lo si vede sopra, con l'amministratore che dei due
# stabili è legittimamente ammesso.
$sAltro = Status Get "/condomini/$altro/comunicazioni/$($richiesta._id)" $null $co
Check 'il condomino non lo apre da un altro stabile' ($sAltro -eq 'FORBIDDEN') "esito $sAltro"

"== ripristino: l'admin torna ad accesso pieno =="
# `permessi: null` è l'accesso pieno. Il passaggio chiude anche le sessioni
# aperte, quindi va per ultimo: senza, l'account resterebbe delegato e i
# permessi si perderebbero da un'esecuzione all'altra.
SetPermessi 'amministratori' $idAd $null

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
