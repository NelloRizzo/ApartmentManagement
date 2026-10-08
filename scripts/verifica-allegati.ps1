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

# Il download degli allegati è fuori da `/api` e senza token: si firma l'URL. Va
# fatto con `curl` perché lo script gira sotto Windows PowerShell, dove
# `Invoke-WebRequest` non ha `-SkipHttpErrorCheck`.
function Scarica($url) {
  $temporaneo = Join-Path $env:TEMP "dl-$suff-$([guid]::NewGuid().ToString('N').Substring(0,4))"
  $codice = & curl.exe -s -o $temporaneo -w "%{http_code}" $url
  $corpo = if (Test-Path $temporaneo) { Get-Content $temporaneo -Raw -Encoding utf8 } else { '' }
  Remove-Item $temporaneo -ErrorAction SilentlyContinue
  return @{ Status = [int]$codice; Corpo = $corpo }
}

# Il caricamento è `multipart`, quindi va fatto con curl: `Invoke-RestMethod`
# non ha un modo comodo di allegare un file a una richiesta con altri campi.
# I campi sono nell'hash, i file si aggiungono come `allegati=@percorso`.
function PostFile($percorso, $token, $file, $campi) {
  $argomenti = @('-s', '-X', 'POST', "$base$percorso", '-H', "Authorization: Bearer $token")
  foreach ($chiave in $campi.Keys) { $argomenti += @('-F', "$chiave=$($campi[$chiave])") }
  $argomenti += @('-F', "allegati=@$file")
  try { return (& curl.exe @argomenti) | ConvertFrom-Json }
  catch { return @{ success = $false; error = @{ message = 'risposta illeggibile' } } }
}

$ad = Login 'admin@condomini.local' 'Admin123!'
$as = Login 'assistente@example.com' 'Assistente123!'
$h = Auth $ad
$cid = (Get '/auth/me' $ad).condomini[0].condominioId

# File di prova. Il contenuto serve a distinguerlo quando si scarica.
$suff = [guid]::NewGuid().ToString('N').Substring(0,8).ToUpper()
$file = Join-Path $env:TEMP "allegato-$suff.txt"
Set-Content -Path $file -Value "contenuto di prova $suff" -Encoding utf8
$altroFile = Join-Path $env:TEMP "allegato2-$suff.txt"
Set-Content -Path $altroFile -Value "secondo file $suff" -Encoding utf8
$anno = 2095

# Anno e voce dedicati: non deve toccare i bilanci veri.
function PulisciBilanci {
  foreach ($b in @(Get "/condomini/$cid/bilanci?anno=$anno" $ad)) {
    if ($b.approvato) {
      Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$($b._id)/approva" -Headers $h -ContentType 'application/json' -Body '{"approvato":false}' | Out-Null
    }
    Invoke-RestMethod -Method Delete -Uri "$base/condomini/$cid/bilanci/$($b._id)" -Headers $h | Out-Null
  }
}
PulisciBilanci

"== 1. creazione del contenitore =="
$voce = @(@{ categoria = 'pulizie'; descrizione = "Voce $suff"; importo = 100; ripartizione = 'diritto'; voci = @() }) |
  ConvertTo-Json -Depth 6 -Compress
# `anno` e `importo` sono numeri e in `multipart` arriverebbero come stringhe: il
# bilancio si crea in JSON e gli allegati si caricano a parte, sulla rotta dedicata.
$b = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci" -Headers $h -ContentType 'application/json' -Body (@{
  anno = $anno; tipo = 'preventivo'; descrizione = "Verifica allegati $suff"
} | ConvertTo-Json)
$bid = Id $b.data
Check 'bilancio creato' ($null -ne $bid) $b.error.message
$inv = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/voci" -Headers $h -ContentType 'application/json' -Body (@{
  categoria = 'pulizie'; descrizione = "Voce $suff"; importo = 100; ripartizione = 'diritto'
} | ConvertTo-Json)
$vid = Id $inv.data.voci[0]
Check 'voce creata' ($null -ne $vid) $inv.error.message

"== 2. l'allegato sta sulla voce, non sul bilancio =="
$r = PostFile "/condomini/$cid/bilanci/$bid/voci/$vid/allegati" $ad $file @{ allegatiOggetto = "Fattura $suff"; allegatiFonte = 'Fornitore'; allegatiRiferimento = "Prot $suff" }
Check 'file caricato' ($r.success -and $r.data.aggiunti -eq 1) $r.error.message

$voceLetta = (Get "/condomini/$cid/bilanci/$bid" $ad).voci[0]
Check 'la voce ha l''allegato' ($voceLetta.allegati.Count -eq 1) "trovati $($voceLetta.allegati.Count)"
Check 'oggetto registrato' ($voceLetta.allegati[0].oggetto -eq "Fattura $suff") $voceLetta.allegati[0].oggetto
Check 'fonte registrata' ($voceLetta.allegati[0].fonte -eq 'Fornitore') $voceLetta.allegati[0].fonte
Check 'riferimento registrato' ($voceLetta.allegati[0].riferimento -eq "Prot $suff") $voceLetta.allegati[0].riferimento
Check 'il bilancio non ha allegati propri' ($null -eq $voceLetta.allegatiPadre)
$aid = Id $voceLetta.allegati[0]

"== 3. il file si scarica davvero =="
$url = (Get "/condomini/$cid/bilanci/$bid" $ad).voci[0].allegati[0].url
Check 'l''url è firmato' ($url -match '/allegati/[0-9a-f]{24}\?t=\d+&s=[0-9a-f]{64}') $url
$scaricato = Scarica ("http://localhost:4000" + $url)
Check 'download concesso' ($scaricato.Status -eq 200) "HTTP $($scaricato.Status)"
Check 'il contenuto è quello giusto' ($scaricato.Corpo -match $suff) $scaricato.Corpo

"== 4. il link non porta la firma del caricamento =="
# Non si possono confrontare due letture: se cadono nello stesso secondo la firma
# è legittimamente identica e il controllo fallirebbe a intermittenza. Si verifica
# invece che il timestamp sia vicino ad adesso: se l'URL fosse quello scritto al
# caricamento, dopo 24 ore il file diventerebbe irraggiungibile.
$secondo = [regex]::Match($url, 't=(\d+)').Groups[1].Value
$ora = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Check 'il link è firmato adesso, non al caricamento' ($secondo -ge ($ora - 60) -and $secondo -le ($ora + 90000)) "firmato a $secondo, ora $ora"

"== 5. firma manomessa =="
$manomessa = $url -replace 's=[0-9a-f]{64}', "s=$('0' * 64)"
$r5 = Scarica ("http://localhost:4000" + $manomessa)
Check 'una firma inventata non scarica nulla' ($r5.Status -eq 404) "HTTP $($r5.Status)"

"== 6. il file senza oggetto e' rifiutato =="
# Serve il file: senza file non c'è nulla da descrivere e la rotta non ha nemmeno
# un corpo da cui prendere l'oggetto del documento padre.
$r6 = PostFile "/condomini/$cid/bilanci/$bid/voci/$vid/allegati" $ad $altroFile @{ allegatiFonte = 'Senza oggetto' }
Check 'senza oggetto rifiutato' ($r6.error.code -eq 'BAD_REQUEST') "esito $($r6.error.code) $($r6.error.message)"

"== 7. un bilancio approvato non accetta allegati =="
Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/approva" -Headers $h -ContentType 'application/json' -Body '{"approvato":true}' | Out-Null
$r7 = PostFile "/condomini/$cid/bilanci/$bid/voci/$vid/allegati" $ad $altroFile @{ allegatiOggetto = 'Tentativo' }
Check 'allegare su un bilancio approvato e'' un 409' ($r7.error.code -eq 'CONFLICT') "esito $($r7.error.code)"
Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/bilanci/$bid/approva" -Headers $h -ContentType 'application/json' -Body '{"approvato":false}' | Out-Null

"== 8. l'allegato non si vede da un altro condominio =="
# `requireCondominioAccess` risponde 403 prima ancora di guardare il bilancio:
# l'errore dice che non si entra nello stabile, non che il file non esiste.
Check 'un altro condominio non lo raggiunge' ((Status Get "/condomini/000000000000000000000000/bilanci/$bid" $null $ad) -eq 'FORBIDDEN')

"== 9. l'assistente non puo' scrivere =="
Check 'l''assistente non allega' ((Status Post "/condomini/$cid/bilanci/$bid/voci/$vid/allegati" $null $as) -eq 'FORBIDDEN')

"== 10. rimozione =="
# Un id ben formato che non esiste è un no-op innocuo: toglie un id che non è
# nella lista. Un id mal formato è invece un errore di chi ha costruito la rotta.
Check 'id di allegato mal formato rifiutato' ((Status Delete "/condomini/$cid/bilanci/$bid/voci/$vid/allegati/non-e-un-id" $null $ad) -eq 'BAD_REQUEST')
$del = curl.exe -s -o NUL -w "%{http_code}" -X DELETE "$base/condomini/$cid/bilanci/$bid/voci/$vid/allegati/$aid" -H "Authorization: Bearer $ad"
Check 'rimozione riuscita' ($del -eq '204') "HTTP $del"
Check 'la voce non ha piu'' allegati' ((Get "/condomini/$cid/bilanci/$bid" $ad).voci[0].allegati.Count -eq 0)

"== 11. l'allegato sparisce anche dal database =="
$orfano = Scarica ("http://localhost:4000" + $url)
Check 'il file non e'' piu'' scaricabile' ($orfano.Status -eq 404) "HTTP $($orfano.Status)"

"== 12. verbale e comunicazione =="
# Serve un'assemblea modificabile (`assicuraAssembleaModificabile` chiude solo
# `conclusa` e `annullata`) e che non abbia già un verbale: `deleteOne` la
# rifiuta se il verbale esiste, e non si elimina un verbale in questa verifica.
# Se non c'è una che vada bene se ne crea una: è l'unico modo per avere un punto
# all'ordine del giorno conoscendo l'ordine, che è come lo chiama la rotta.
$usata = $false
$asm = @(Get "/condomini/$cid/assemblee?limit=20" $ad) | Where-Object { $_.stato -eq 'bozza' -and $_.ordineDelGiorno.Count -gt 0 } | Select-Object -First 1
# Una bozza con verbale non si elimina, e questo script non elimina verbali: se
# l'unica bozza trovata ha già il suo, ne crea una propria e la segna per la
# pulizia finale.
if ($asm) {
  $verbali = @(Get "/condomini/$cid/verbali?limit=100" $ad) | Where-Object { $_.assemblea -eq $asm._id }
  if (@($verbali).Count -gt 0) { $asm = $null }
}
if (-not $asm) {
  $nuova = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee" -Headers $h -ContentType 'application/json' -Body (@{ numero = $anno; tipo = 'straordinaria'; data = "$anno-01-01"; luogo = 'Sala prova'; ordineDelGiorno = @(@{ ordine = 1; titolo = "Punto di prova $suff" }) } | ConvertTo-Json -Depth 6)
  Check 'assemblea di prova creata' ($nuova.success -and @($nuova.data.ordineDelGiorno).Count -eq 1) $nuova.error.message
  $asm = $nuova.data
  $usata = $true
}
$asmId = if ($asm) { $asm._id } else { $null }
$verbaleId = $null
# Solo il punto dell'ordine del giorno sta su una bozza: il verbale nasce
# dall'assemblea e non si può creare prima che sia stata tenuta.
if ($asm -and $asm.stato -ne 'bozza') {
  $verb = Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/assemblee/$asmId/verbale" -Headers $h -ContentType 'application/json' -Body '{}'
  $verbaleId = Id $verb.data
  # Si contano solo gli allegati con il nome di questa esecuzione: il verbale
  # dell'assemblea può averne di precedenti e il controllo deve valere anche alla
  # seconda esecuzione.
  $prima = @((Get "/condomini/$cid/verbali/$verbaleId" $ad).allegati).Count
  $rv = PostFile "/condomini/$cid/verbali/$verbaleId/allegati" $ad $file @{ allegatiOggetto = "Verbale firmato $suff" }
  Check 'allegato su verbale' ($rv.success) $rv.error.message
  $letto = Get "/condomini/$cid/verbali/$verbaleId" $ad
  Check 'il verbale ha il nuovo allegato' (@($letto.allegati | Where-Object { $_.oggetto -eq "Verbale firmato $suff" }).Count -eq 1) "trovati $(@($letto.allegati).Count)"
  Check 'gli allegati precedenti sono rimasti' (@($letto.allegati).Count -eq ($prima + 1)) "prima $prima ora $(@($letto.allegati).Count)"
} elseif ($asm) {
  # Non è un errore: questa esecuzione ha creato la bozza per i punti, e su una
  # bozza il verbale non esiste ancora.
  Write-Output '  (verbale non provato: l''assemblea di questa esecuzione e'' una bozza)'
} else {
  Check 'serve un''assemblea per provare il verbale' $false 'nessuna assemblea utilizzabile'
}

# `segnalazione` e non `avviso`: avviso e convocazione partono sempre inviati, dove
# `salvaComeBozza` non vale, e un messaggio inviato non si può eliminare. Una
# segnalazione in bozza si elimina e non lascia nulla nel database.
$comm = PostFile "/condomini/$cid/comunicazioni" $ad $file @{ tipo = 'segnalazione'; oggetto = "Comunicazione $suff"; corpo = 'test'; allegatiOggetto = "Avviso $suff"; salvaComeBozza = 'true' }
Check 'allegato su comunicazione in creazione' ($comm.success -and $comm.data.allegati.Count -eq 1) $comm.error.message
Check 'la bozza non parte subito' ($comm.data.stato -eq 'bozza') $comm.data.stato
$commId = Id $comm.data

"== 13. punto all'ordine del giorno =="
# Fin qui la verifica copriva voce di bilancio, verbale e comunicazione, ma non il
# punto: la rotta esisteva e nessuna verifica la passava, quindi un eventuale
# difetto sarebbe arrivato in produzione senza che niente lo notasse.
#
# Il punto non ha un id proprio: si indica col numero d'ordine, ed è per questo
# che l'allegato si carica dall'assemblea aperta e non dal form di creazione.
$puntoOrdine = if ($asm) { @($asm.ordineDelGiorno)[0].ordine } else { $null }
Check 'l''assemblea ha un punto all''ordine del giorno su cui provare' ($null -ne $puntoOrdine) 'assemblea senza punti'

$rp = PostFile "/condomini/$cid/assemblee/$asmId/ordine/$puntoOrdine/allegati" $ad $file @{ allegatiOggetto = "Relazione $suff"; allegatiFonte = 'Tecnico'; allegatiRiferimento = "Prot $suff" }
Check 'allegato su punto all''ordine del giorno' ($rp.success) $rp.error.message

$puntoLetto = @(Get "/condomini/$cid/assemblee/$asmId" $ad).ordineDelGiorno | Where-Object { $_.ordine -eq $puntoOrdine }
Check 'il punto ha l''allegato' (@($puntoLetto.allegati | Where-Object { $_.oggetto -eq "Relazione $suff" }).Count -eq 1) "trovati $(@($puntoLetto.allegati).Count)"
Check 'i metadati sono quelli mandati' ($puntoLetto.allegati[0].fonte -eq 'Tecnico' -and $puntoLetto.allegati[0].riferimento -eq "Prot $suff") "fonte $($puntoLetto.allegati[0].fonte)"
$puntoAid = Id $puntoLetto.allegati[0]

# Il file si scarica con lo stesso percorso degli altri domini: l'allegato vive
# in `Allegato` e l'URL è firmato allo stesso modo.
$puntoUrl = $puntoLetto.allegati[0].url
$scaricaPunto = Scarica ("http://localhost:4000" + $puntoUrl)
Check 'il file del punto si scarica' ($scaricaPunto.Status -eq 200 -and $scaricaPunto.Corpo -match $suff) "status $($scaricaPunto.Status)"

# L'assistente ha `versamenti:scrivere` e niente su `assemblee`: deve ricevere
# 403 come sugli altri domini.
$sPunto = Status Post "/condomini/$cid/assemblee/$asmId/ordine/$puntoOrdine/allegati" $null $as
Check 'l''assistente non allega al punto' ($sPunto -eq 'FORBIDDEN') "esito $sPunto"

# `noContent` risponde 204: è il codice giusto per una rimozione, non un errore.
$delPunto = curl.exe -s -o NUL -w "%{http_code}" -X DELETE "$base/condomini/$cid/assemblee/$asmId/ordine/$puntoOrdine/allegati/$puntoAid" -H "Authorization: Bearer $ad"
Check 'rimozione dell''allegato del punto' ([int]$delPunto -eq 204) "status $delPunto"
$dopoRimozione = @(Get "/condomini/$cid/assemblee/$asmId" $ad).ordineDelGiorno | Where-Object { $_.ordine -eq $puntoOrdine }
Check 'l''allegato del punto e sparito' (@($dopoRimozione.allegati).Count -eq 0) "rimasti $(@($dopoRimozione.allegati).Count)"

"== 14. pulizia =="
# Gli allegati si togliono uno alla volta: la rimozione non è in cascata.
if ($verbaleId) {
  foreach ($al in @(Get "/condomini/$cid/verbali/$verbaleId" $ad).allegati) {
    if ($al.oggetto -like "*$suff*") {
      curl.exe -s -o NUL -X DELETE "$base/condomini/$cid/verbali/$verbaleId/allegati/$($al.id)" -H "Authorization: Bearer $ad"
    }
  }
}
if ($commId) {
  # Se la pulizia fallisce il file va comunque riepilogato: l'errore va nel
  # conteggio dei KO, non deve interrompere lo script e far perdere il resto.
  $sCancella = Status Delete "/condomini/$cid/comunicazioni/$commId" $null $ad
  Check 'la bozza di prova è stata eliminata' ($sCancella -eq '200') "esito $sCancella"
}
PulisciBilanci
$residui = @(Get "/condomini/$cid/bilanci?anno=$anno" $ad)
Check 'nessun bilancio di prova rimasto' ($residui.Count -eq 0) "trovati $($residui.Count)"
# L'assemblea creata qui è una bozza, quindi si elimina. Gli allegati vanno tolti
# uno a uno, punto per punto: la rimozione non è in cascata e il file
# sopravvive al documento che lo conteneva. Solo se è di questa esecuzione: un'assemblea
# bozza preesistente non va toccata, perché non è roba di prova.
if ($asm -and $usata) {
  foreach ($p in @(Get "/condomini/$cid/assemblee/$asmId" $ad).ordineDelGiorno) {
    foreach ($al in @($p.allegati)) {
      curl.exe -s -o NUL -X DELETE "$base/condomini/$cid/assemblee/$asmId/ordine/$($p.ordine)/allegati/$($al.id)" -H "Authorization: Bearer $ad"
    }
  }
  $sAsm = Status Delete "/condomini/$cid/assemblee/$asmId" $null $ad
  Check 'l''assemblea di prova è stata eliminata' ($sAsm -eq '200') "esito $sAsm"
}
Remove-Item $file, $altroFile -ErrorAction SilentlyContinue

"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
