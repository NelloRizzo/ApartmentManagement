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

$ad = Login 'admin@condomini.local' 'Admin123!'
$h = Auth $ad
$cid = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data.condomini[0].condominioId

function NuovaAssemblea($titolo) {
  $corpo = @{
    tipo='straordinaria'; data='2026-09-15'; oraInizio='18:00'; luogo='Sala prova';
    ordineDelGiorno=@(@{ordine=1; titolo=$titolo}); note='verifica'
  }
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee" -Headers $h -ContentType 'application/json' -Body ($corpo|ConvertTo-Json -Depth 8)).data
}

"== 1. creazione e transizioni pubblicate =="
$suffisso = [guid]::NewGuid().ToString('N').Substring(0,4)
$a = NuovaAssemblea "Punto di prova $suffisso"
$aid = Id $a
Check 'assemblea creata' ($null -ne $aid)
Check 'stato iniziale bozza' ($a.stato -eq 'bozza') "stato $($a.stato)"
$d = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$aid/dettaglio-verbale" -Headers $h).data
$tr = $d.assemblea.transizioniConsentite
Check 'transizioni pubblicate dal server' ($null -ne $tr -and $tr.Count -gt 0) "transizioni: $($tr -join ',')"
Check 'da bozza si puo convocare' ($tr -contains 'convocata') "transizioni: $($tr -join ',')"
Check 'da bozza non si torna indietro' (-not ($tr -contains 'bozza'))

"== 2. transizione consentita =="
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$aid/stato" -Headers $h -ContentType 'application/json' -Body (@{stato='convocata'}|ConvertTo-Json)
Check 'stato convocata' ($t.data.stato -eq 'convocata') $t.error.message
Check 'dataConvocazione registrata' ($null -ne $t.data.dataConvocazione)
Check 'transizioni ricalcolate' ($t.data.transizioniConsentite -contains 'in_corso' -and -not ($t.data.transizioniConsentite -contains 'convocata'))

"== 3. transizione indietro rifiutata =="
$s = Status Post "/condomini/$cid/assemblee/$aid/stato" (@{stato='bozza'}) $ad
Check 'non si torna a bozza' ($s -eq 'CONFLICT') "esito $s"

"== 4. modifica dei dati =="
$t = Invoke-RestMethod -Method Patch -Uri "$base/condomini/$cid/assemblee/$aid" -Headers $h -ContentType 'application/json' -Body (@{luogo='Sala aggiornata'; note='modificata'} | ConvertTo-Json)
Check 'luogo aggiornato' ($t.data.luogo -eq 'Sala aggiornata') $t.error.message
Check 'stato invariato' ($t.data.stato -eq 'convocata') "stato $($t.data.stato)"

"== 5. ricalcolo millesimi =="
$r = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$aid/millesimi/ricalcola" -Headers $h -ContentType 'application/json' -Body '{}'
Check 'ricalcolo risponde con i totali' ($null -ne $r.data) $r.error.message

"== 6. chiusura senza esito di ogni punto rifiutata =="
$s = Status Post "/condomini/$cid/assemblee/$aid/stato" (@{stato='conclusa'}) $ad
Check 'conclusa rifiutata senza votazioni' ($s -eq 'BAD_REQUEST' -or $s -eq 'CONFLICT') "esito $s"

"== 7. eliminazione =="
Check 'delete assemblea non conclusa' ((Status Delete "/condomini/$cid/assemblee/$aid" $null $ad) -eq '200')
$s = Status Get "/condomini/$cid/assemblee/$aid" $null $ad
Check 'assemblea eliminata non esiste piu' ($s -eq 'NOT_FOUND') "esito $s"

"== 8. il condomino non cambia stato ne elimina =="
$b = NuovaAssemblea "Punto condòmino $([guid]::NewGuid().ToString('N').Substring(0,4))"
$bid = Id $b
Check 'assemblea del test condomino creata' ($null -ne $bid)
$co = Login 'marco.rossi@example.com' 'Condomino123!'
Check 'condomino non cambia stato' ((Status Post "/condomini/$cid/assemblee/$bid/stato" (@{stato='convocata'}) $co) -eq 'FORBIDDEN')
Check 'condomino non elimina' ((Status Delete "/condomini/$cid/assemblee/$bid" $null $co) -eq 'FORBIDDEN')
Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/assemblee/$bid" -Headers $h | Out-Null

"== 9. il badge delle convocazioni, lato condòmino =="
function DaVedere($token) {
  (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/da-vedere" -Headers (Auth $token)).data.daVedere
}

$prima = DaVedere $co
$z = NuovaAssemblea "Badge $([guid]::NewGuid().ToString('N').Substring(0,4))"
$zid = Id $z
Check 'assemblea del test badge creata' ($null -ne $zid)
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$zid/stato" -Headers $h -ContentType 'application/json' -Body (@{stato='convocata'}|ConvertTo-Json)
Check 'convocazione riuscita' ($t.data.stato -eq 'convocata') $t.error.message

# Il badge conta le assemblee in cui il condòmino ha una riga di presenza: se la
# convocazione non scrive i convocati, non la vedrà mai.
$convocati = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$zid" -Headers $h).data.presenze
Check 'convocati scritti appena convocata' ($convocati.Count -gt 0) "righe $($convocati.Count)"

$dopo = DaVedere $co
Check 'la convocazione entra nel badge' ($dopo -eq ($prima + 1)) "daVedere $prima -> $dopo"

$p = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$zid" -Headers (Auth $co)).data
Check 'condomino: arriva in sola lettura' ($p.solaLettura -eq $true)
Check 'condomino: presenze non esposte' ($p.presenze.Count -eq 0) "righe $($p.presenze.Count)"
Check 'condomino: votazioni non esposte' ($p.votazioni.Count -eq 0)
Check 'condomino: elenco condomini non esposto' ($p.elencoCondomini.Count -eq 0)
Check 'condomino: nessuna transizione di stato' ($p.transizioniConsentite.Count -eq 0)
Check 'condomino: verbale non esposto' ($null -eq $p.verbale)
Check 'condomino: ordine del giorno completo' ($p.ordineDelGiorno.Count -eq 1) "punti $($p.ordineDelGiorno.Count)"
Check 'dettaglio-verbale vietato al condomino' ((Status Get "/condomini/$cid/assemblee/$zid/dettaglio-verbale" $null $co) -eq 'FORBIDDEN')

$aperto = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$zid/odg-visto" -Headers (Auth $co) -ContentType 'application/json' -Body '{}').data.visto
Check 'segnatura odg-visto accettata' ($aperto -eq $true)
$letto = DaVedere $co
Check 'aperto l ordine del giorno il badge scende' ($letto -eq ($dopo - 1)) "daVedere $dopo -> $letto"
Check 'ripetere la segnatura non cambia il conteggio' ((DaVedere $co) -eq $letto)
Check 'per lamministratore il badge resta zero' ((DaVedere $ad) -eq 0)

Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/assemblee/$zid" -Headers $h | Out-Null

"== 10. il segretario si indica mentre l'assemblea e in corso =="
$sg = NuovaAssemblea "Segretario $([guid]::NewGuid().ToString('N').Substring(0,4))"
$sgid = Id $sg
Check 'assemblea del test segretario creata' ($null -ne $sgid)
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$sgid/stato" -Headers $h -ContentType 'application/json' -Body (@{stato='convocata'}|ConvertTo-Json)
Check 'convocazione riuscita' ($t.data.stato -eq 'convocata') $t.error.message
$t = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$sgid/stato" -Headers $h -ContentType 'application/json' -Body (@{stato='in_corso'}|ConvertTo-Json)
Check 'assemblea in corso' ($t.data.stato -eq 'in_corso') $t.error.message

$d = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$sgid/dettaglio-verbale" -Headers $h).data
Check 'dettaglio: amministratore esposto fra i candidati' ([bool]$d.amministratore.id) "amministratore: $($d.amministratore | ConvertTo-Json -Compress)"
$candidato = $d.condomini[0]
Check 'dettaglio: candidati condòmini presenti' ([bool]$candidato.utenteId)

$s = Status Patch "/condomini/$cid/assemblee/$sgid" (@{segretario=$candidato.utenteId}) $ad
Check 'segretario salvato con un PATCH durante lo svolgimento' ($s -eq '200') "esito $s"
Check 'il condòmino non designa il segretario' ((Status Patch "/condomini/$cid/assemblee/$sgid" (@{segretario=$candidato.utenteId}) $co) -eq 'FORBIDDEN')

$d = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$sgid/dettaglio-verbale" -Headers $h).data
Check 'segretario restituito popolato con il suo id' ($d.assemblea.segretario._id -eq $candidato.utenteId) "segretario: $($d.assemblea.segretario | ConvertTo-Json -Compress)"
Check 'segretario con nome e cognome' ([bool]$d.assemblea.segretario.nome -and [bool]$d.assemblea.segretario.cognome)

# Il verbale è l'atto in cui il segretario conta: l'anteprima lo compone senza
# persistere nulla, quindi si legge qui senza dover concludere l'assemblea
# (che poi non si potrebbe più eliminare).
$ap = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$sgid/verbale/anteprima" -Headers $h).data.testo
Check 'verbale: il nome in apertura' ($ap -like "*Funge da segretario*$($candidato.nome)*")
Check 'verbale: il nome nella firma' ($ap -like "*redatto da $($candidato.nome)*")

$s = Status Patch "/condomini/$cid/assemblee/$sgid" (@{segretario=$null}) $ad
Check 'segretario tolto' ($s -eq '200') "esito $s"
$d = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$sgid/dettaglio-verbale" -Headers $h).data
Check 'senza designazione il campo e vuoto' ($null -eq $d.assemblea.segretario) "segretario: $($d.assemblea.segretario | ConvertTo-Json -Compress)"
$ap = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/assemblee/$sgid/verbale/anteprima" -Headers $h).data.testo
Check 'verbale senza segretario: formula generica' ($ap -like '*Funge da segretario il condomino designato*')

Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/assemblee/$sgid" -Headers $h | Out-Null

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
