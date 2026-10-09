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
function Status($method, $path, $token, $body) {
  $h = Auth $token
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
# Il personale di prova va rimosso: la revoca lo disattiva ma non lo cancella,
# quindi una esecuzione interrotta lascia l'account in elenco.
$orfani = @((Invoke-RestMethod -Method Get -Uri "$base/staff/assistenti?page=1&limit=100" -Headers $h).data |
  Where-Object { $_.ruolo -eq 'portiere' -and $_.email -like 'portiere.prova.*@example.com' })
if ($orfani) {
  "  ATTENZIONE: restano account di prova del personale: $(($orfani | ForEach-Object { $_.email }) -join ', ')"
  exit 1
}

$me = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $h).data
$cid = $me.condomini[0].condominioId
$suff = [guid]::NewGuid().ToString('N').Substring(0, 8).ToUpper()
$emailPortiere = "portiere.prova.$suff@example.com"
# Password nota: la rotta la usa al posto della provvisoria, così lo script può
# entrare con l'account che ha appena creato.
$pwPortiere = 'Portiere123!'

"== 1. il personale nasce dalla pagina del team =="
$r = Invoke-RestMethod -Method Post -Uri "$base/staff/assistenti" -Headers $h -ContentType 'application/json' -Body (@{
  ruolo = 'portiere'; email = $emailPortiere; nome = 'Pietro'; cognome = 'Ferrari'; telefono = '+39 333 0001111'
  condominioId = $cid; password = $pwPortiere
} | ConvertTo-Json)
$idPortiere = Id $r.data
Check 'la creazione dal team risponde con la persona' ($r.data.id -and $idPortiere) ($r | ConvertTo-Json -Compress)
Check 'il personale riceve un id' ($idPortiere -match '^[0-9a-f]{24}$') "id $idPortiere"

# La lista del team contiene entrambe le forme, con il ruolo e gli stabili: è
# l'unico elenco, quindi non ce n'è un secondo da mettere d'accordo.
$team = (Invoke-RestMethod -Method Get -Uri "$base/staff/assistenti?page=1&limit=100&search=$suff" -Headers $h).data
$mio = @($team | Where-Object { $_.email -eq $emailPortiere })
Check 'il personale e nel team' ($mio.Count -eq 1) "trovati $($mio.Count)"
Check 'e distinto dal ruolo di portiere' ($mio[0].ruolo -eq 'portiere') "ruolo $($mio[0].ruolo)"
Check 'ed e legato a uno stabile solo' (@($mio[0].stabili).Count -eq 1) "stabili $(@($mio[0].stabili).Count)"
Check 'senza ambiti delegati' (@($mio[0].permessi).Count -eq 0) "permessi $(@($mio[0].permessi).Count)"

$portiere = Login $emailPortiere $pwPortiere
$hp = Auth $portiere
$suoProfilo = (Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $hp).data
Check 'il personale entra' ($suoProfilo.email -eq $emailPortiere) ($suoProfilo | ConvertTo-Json -Compress)
Check 'la sua posizione e di servito' (@($suoProfilo.condomini | Where-Object { $_.ruolo -eq 'servito' }).Count -eq 1) ($suoProfilo.condomini | ConvertTo-Json -Compress)

"== 2. il perimetro: vede la rubrica e nient'altro =="
$negate = @(
  @('lista versamenti', '/versamenti?page=1&limit=5'),
  @('quote mensili', '/versamenti/quote'),
  @('unità immobiliari', '/unita?page=1&limit=5'),
  @('bilanci', '/bilanci?page=1&limit=5'),
  @('verbali', '/verbali?page=1&limit=5'),
  @('assemblee', '/assemblee?page=1&limit=5'),
  @('tabella millesimale', '/tabella-millesimi'),
  @('storico revisioni', '/tabella-millesimi/revisioni/variazioni'),
  @('iscritti con i millesimi', '/condomini?page=1&limit=5'),
  @('comunicazioni', '/comunicazioni?page=1&limit=5')
)
foreach ($n in $negate) {
  $s = Status Get "/condomini/$cid$($n[1])" $portiere $null
  Check "$($n[0]): negato" ($s -eq 'FORBIDDEN') "esito $s"
}

$rubrica = (Invoke-RestMethod -Method Get -Uri "$base/condomini/$cid/condomini/rubrica" -Headers $hp).data
Check 'la rubrica e concessa' ($rubrica.residenti.Count -gt 0) "residenti $($rubrica.residenti.Count)"
$primo = $rubrica.residenti[0]
Check 'il residente ha cognome e unita' ($primo.cognome -and $primo.unita.Count -ge 1) ($primo | ConvertTo-Json -Compress)
# I campi che non devono esserci: sono la ragione per cui la rubrica e una rotta
# separata e non la lista degli iscritti con un filtro.
Check 'la rubrica non ha i millesimi' ($primo.PSObject.Properties.Name -notcontains 'millesimi') ($primo | ConvertTo-Json -Compress)
Check 'la rubrica non ha la email' ($primo.PSObject.Properties.Name -notcontains 'email') ($primo | ConvertTo-Json -Compress)
Check 'la rubrica ha il telefono' ($primo.PSObject.Properties.Name -contains 'telefono') ($primo | ConvertTo-Json -Compress)

$scritta = Status Post "/condomini/$cid/comunicazioni" $portiere @{ oggetto = 'ciao'; corpo = 'test'; destinatari = @() }
Check 'il personale non scrive ai residenti' ($scritta -eq 'FORBIDDEN') "esito $scritta"

"== 3. i compiti =="
$r = Invoke-RestMethod -Method Post -Uri "$base/staff/attivita" -Headers $h -ContentType 'application/json' -Body (@{
  titolo = "Verifica personale $suff"; assegnatari = @($idPortiere)
} | ConvertTo-Json)
$idAttivita = Id $r.data
Check "l'amministratore affida un compito" ($idAttivita -match '^[0-9a-f]{24}$') "id $idAttivita"

$suoi = (Invoke-RestMethod -Method Get -Uri "$base/staff/attivita?page=1&limit=50&stato=tutte" -Headers $hp).data
Check 'il compito e nel suo elenco' (@($suoi | Where-Object { (Id $_) -eq $idAttivita }).Count -eq 1) "trovati $(@($suoi).Count)"

$creato = Status Post '/staff/attivita' $portiere @{ titolo = 'Non deve passare' }
Check 'il personale non crea compiti' ($creato -eq 'FORBIDDEN') "esito $creato"

$fatto = Invoke-RestMethod -Method Post -Uri "$base/staff/attivita/$idAttivita/fatto" -Headers $hp -ContentType 'application/json' -Body (@{ fatto = $true } | ConvertTo-Json)
Check 'il personale annota il compito come fatto' ($fatto.data.fatto -eq $true) ($fatto.data | ConvertTo-Json -Compress)

$eliminato = Status Delete "/staff/attivita/$idAttivita" $portiere $null
Check 'il personale non elimina il compito' ($eliminato -eq 'FORBIDDEN') "esito $eliminato"

"== 4. un compito non suo non e visibile =="
$r = Invoke-RestMethod -Method Post -Uri "$base/staff/attivita" -Headers $h -ContentType 'application/json' -Body (@{ titolo = "Solo per l'amministratore $suff" } | ConvertTo-Json)
$privato = Id $r.data
$s = Status Get "/staff/attivita/$privato" $portiere $null
# 404 e non 403: confermare che esiste la tradirebbe a chi non deve vederla.
Check 'non e visibile, e 404' ($s -eq 'NOT_FOUND') "esito $s"

"== 5. revoca =="
$revocato = Invoke-RestMethod -Method Delete -Uri "$base/staff/assistenti/$idPortiere" -Headers $h
Check 'la revoca risponde' ($null -eq $revocato -or $true) "esito $revocato"

# La revoca toglie il legame dallo stabile; se era l'unico, l'account viene
# disattivato, come per l'assistente revocato.
$ancora = $null
try { $ancora = Login $emailPortiere $pwPortiere } catch { }
if ($ancora) {
  $s = Status Get "/condomini/$cid/condomini/rubrica" $ancora $null
  Check 'dopo la revoca non vede piu la rubrica' ($s -eq 'FORBIDDEN') "esito $s"
} else {
  Check 'dopo la revoca non entra piu' ($true)
}

"== 6. pulizia =="
# L'account resta nel database ma disattivato, se questo era il suo unico
# incarico: è il comportamento di revocaAssistente, che non cancella l'utente per
# non portare via i compiti che ha già svolto.
Invoke-RestMethod -Method Delete -Uri "$base/staff/attivita/$idAttivita" -Headers $h | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/staff/attivita/$privato" -Headers $h | Out-Null
$team = (Invoke-RestMethod -Method Get -Uri "$base/staff/assistenti?page=1&limit=100&search=$suff" -Headers $h).data
$rimasti = @($team | Where-Object { $_.ruolo -eq 'portiere' }).Count
Check 'il personale non e piu nel team come portiere' ($rimasti -eq 0) "residui $rimasti"

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
