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

$ad = Login 'admin@condomini.local' 'Admin123!'
$as = Login 'assistente@example.com' 'Assistente123!'
$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'

# Il team è `delegatoDa`, non `GET /staff/assistenti`: quest'ultimo legge
# `Condominio.assistenti` e non elencerebbe un assistente non ancora messo su un
# condominio.
$team = @(Get '/staff/attivita/team' $ad)
Check 'il team è visibile all''amministratore' ($team.Count -ge 1) "count $($team.Count)"
if ($team.Count -eq 0) {
  ' KO   nessun assistente nel team: il resto della verifica non ha senso'
  $ko++
  "esito: $ok ok, $ko ko"
  exit 1
}
$ass1 = Id $team[0]

function Crea($corpo) {
  Invoke-RestMethod -Method Post -Uri "$base/staff/attivita" -Headers (Auth $ad) -ContentType 'application/json' -Body ($corpo|ConvertTo-Json -Depth 10)
}

# Titoli usati da questa verifica: servono a ripulire i residui di una
# esecuzione interrotta senza toccare le attività vere dell'amministratore.
$titoliTest = @('Verifica impianto', 'Riservata', 'Sostituire la fune')

function Elimina($id) {
  if ($null -eq $id) { return }
  try {
    # Le voci prima del padre: l'eliminazione non è in cascata, per scelta.
    foreach ($v in @(Get "/staff/attivita/$id/thread" $ad)) {
      Invoke-RestMethod -Method Delete -Uri "$base/staff/attivita/$(Id $v)" -Headers (Auth $ad) | Out-Null
    }
    Invoke-RestMethod -Method Delete -Uri "$base/staff/attivita/$id" -Headers (Auth $ad) | Out-Null
  } catch {
    "  --   attività $id non ripulita: $($_.Exception.Message)"
  }
}

function PulisciResidui {
  foreach ($a in @(Get '/staff/attivita?stato=tutte&limit=100' $ad)) {
    if ($titoliTest -contains $a.titolo -or $a.titolo.StartsWith('Verifica impianto')) { Elimina (Id $a) }
  }
}

PulisciResidui

"== 1. creazione =="
$creata = Crea @{ titolo = 'Verifica impianto'; descrizione = 'Controllo annuale'; assegnatari = @($ass1); dataFine = '2026-12-31' }
$aid = Id $creata.data
Check 'attività creata' ($null -ne $aid) $creata.error.message
Check 'il proprietario sono io' ($creata.data.sonoProprietario -eq $true)
Check 'l''assignatario è registrato' ($creata.data.assegnatari.Count -eq 1)
Check 'non è ancora fatta' ($creata.data.fatto -eq $false)
Check 'la scadenza è registrata' ($null -ne $creata.data.dataFine)

"== 2. proprietario e assegnatario la vedono =="
Check 'in bacheca all''amministratore' (@(@(Get '/staff/attivita' $ad) | Where-Object { (Id $_) -eq $aid }).Count -eq 1)
Check 'in bacheca all''assistente assegnatario' (@(@(Get '/staff/attivita' $as) | Where-Object { (Id $_) -eq $aid }).Count -eq 1)
Check 'gli risponde assegnatoAMe' ((Get "/staff/attivita/$aid" $as).assegnatoAMe -eq $true)
Check 'gli risponde sonoProprietario falso' ((Get "/staff/attivita/$aid" $as).sonoProprietario -eq $false)

"== 3. chi non è coinvolto non vede nulla =="
# Un'attività senza destinatari resta del solo proprietario: serve a provare la
# stessa regola dell'isolamento fra assistenti senza creare altri utenti.
$privata = Crea @{ titolo = 'Riservata'; assegnatari = @() }
$idRiservata = Id $privata.data
Check 'attività senza assegnatari creata' ($null -ne $idRiservata) $privata.error.message
Check 'l''assistente non la vede in bacheca' (@(@(Get '/staff/attivita?stato=tutte' $as) | Where-Object { (Id $_) -eq $idRiservata }).Count -eq 0)
# 404 e non 403: confermare che esiste la rivelerebbe.
$sDettaglio = Status Get "/staff/attivita/$idRiservata" $null $as
Check 'il dettaglio è 404, non 403' ($sDettaglio -eq 'NOT_FOUND') "esito $sDettaglio"
Check 'il thread di un''attività non coinvolta non si apre' ((Status Get "/staff/attivita/$idRiservata/thread" $null $as) -eq 'NOT_FOUND')

"== 4. permessi per ruolo =="
$sSuper = Status Get '/staff/attivita' $null $sa
Check 'il superadmin non entra nella bacheca' ($sSuper -eq 'FORBIDDEN') "esito $sSuper"
Check 'l''assistente non crea attività' ((Status Post '/staff/attivita' @{ titolo = 'X'; assegnatari = @() } $as) -eq 'FORBIDDEN')
Check 'l''assistente non elimina' ((Status Delete "/staff/attivita/$aid" $null $as) -eq 'FORBIDDEN')
Check 'l''assistente non modifica' ((Status Patch "/staff/attivita/$aid" @{ titolo = 'X'; assegnatari = @($ass1) } $as) -eq 'FORBIDDEN')
Check 'l''assistente non segna fatto altrui' ((Status Post "/staff/attivita/$idRiservata/fatto" @{ fatto = $true } $as) -eq 'NOT_FOUND')

"== 5. i destinatari devono essere del team =="
$sFuori = Status Post '/staff/attivita' @{ titolo = 'X'; assegnatari = @('000000000000000000000000') } $ad
Check 'id inesistente rifiutato' ($sFuori -eq 'BAD_REQUEST') "esito $sFuori"
$mio = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers (Auth $ad)).data.user._id
if ($mio) {
  # Il proprietario non è del proprio team: non può assegnarsi il compito.
  Check 'non posso assegnare a me stesso' ((Status Post '/staff/attivita' @{ titolo = 'X'; assegnatari = @($mio) } $ad) -eq 'BAD_REQUEST')
}

"== 6. marcare fatto e tornare indietro =="
$f = Invoke-RestMethod -Method Post -Uri "$base/staff/attivita/$aid/fatto" -Headers (Auth $as) -ContentType 'application/json' -Body '{"fatto":true}'
Check 'l''assistente segna fatto' ($f.data.fatto -eq $true) $f.error.message
Check 'registra chi l''ha segnata' ($f.data.fattoDa.id -eq $ass1)
Check 'non sta più fra le aperte' (@(@(Get '/staff/attivita' $ad) | Where-Object { (Id $_) -eq $aid }).Count -eq 0)
Check 'sta fra le chiuse' (@(@(Get '/staff/attivita?stato=fatta' $ad) | Where-Object { (Id $_) -eq $aid }).Count -eq 1)
Check 'resta visibile con stato=tutte' (@(@(Get '/staff/attivita?stato=tutte' $ad) | Where-Object { (Id $_) -eq $aid }).Count -eq 1)
$r = Invoke-RestMethod -Method Post -Uri "$base/staff/attivita/$aid/fatto" -Headers (Auth $ad) -ContentType 'application/json' -Body '{"fatto":false}'
Check 'torna indietro e si riapre' ($r.data.fatto -eq $false)
Check 'non resta traccia di chi l''aveva chiusa' ($null -eq $r.data.fattoDa)

"== 7. thread di un solo livello =="
$voce = Crea @{ titolo = 'Sostituire la fune'; assegnatari = @($ass1); parent = $aid; milestone = $true }
$vid = Id $voce.data
Check 'voce di thread creata' ($null -ne $vid) $voce.error.message
Check 'è collegata al padre' ($voce.data.parent -eq $aid)
Check 'la voce è la milestone' ($voce.data.milestone -eq $true)
Check 'il thread elenca la voce' (@(@(Get "/staff/attivita/$aid/thread" $ad) | Where-Object { (Id $_) -eq $vid }).Count -eq 1)
Check 'la voce non sta in bacheca' (@(@(Get '/staff/attivita?stato=tutte' $ad) | Where-Object { (Id $_) -eq $vid }).Count -eq 0)
Check 'il secondo livello è rifiutato' ((Status Post '/staff/attivita' @{ titolo = 'Terzo'; assegnatari = @(); parent = $vid } $ad) -eq 'BAD_REQUEST')
Check 'l''assistente vede la voce assegnata' (@(@(Get "/staff/attivita/$aid/thread" $as) | Where-Object { (Id $_) -eq $vid }).Count -eq 1)

"== 8. date incoerenti =="
$sDate = Status Post '/staff/attivita' @{ titolo = 'X'; assegnatari = @(); dataInizio = '2026-12-31'; dataFine = '2026-01-01' } $ad
Check 'scadenza prima dell''inizio rifiutata' ($sDate -eq 'BAD_REQUEST') "esito $sDate"

"== 9. il proprietario corregge =="
$agg = Invoke-RestMethod -Method Patch -Uri "$base/staff/attivita/$aid" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{
  titolo = 'Verifica impianto e centralina'; assegnatari = @($ass1)
} | ConvertTo-Json)
Check 'titolo aggiornato' ($agg.data.titolo -eq 'Verifica impianto e centralina') $agg.error.message
Check 'l''aggiornamento non tocca il thread' (@($agg.data.parent -eq $null))

"== 10. pulizia =="
Elimina $aid
Elimina $idRiservata
Check 'attività eliminate' ((Status Get "/staff/attivita/$aid" $null $ad) -eq 'NOT_FOUND')
Check 'attività private eliminate' ((Status Get "/staff/attivita/$idRiservata" $null $ad) -eq 'NOT_FOUND')
$residui = @(Get '/staff/attivita?stato=tutte&limit=100' $ad) | Where-Object { $titoliTest -contains $_.titolo -or $_.titolo.StartsWith('Verifica impianto') }
Check 'nessun residuo della verifica' ($residui.Count -eq 0) "trovati $($residui.Count)"

"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }