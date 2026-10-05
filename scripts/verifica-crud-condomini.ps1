$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'

function Login($e, $p) {
  (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken
}
function Auth($t) { @{ Authorization = "Bearer $t" } }

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$h = Auth $sa

$ok = 0
$ko = 0
function Check($nome, $cond, $dettaglio = '') {
  if ($cond) { $script:ok++; "  OK   $nome" }
  else { $script:ko++; "  KO   $nome $dettaglio" }
}

function Api($method, $path, $body) {
  try {
    if ($null -eq $body) { return Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h }
    return Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType 'application/json' -Body ($body|ConvertTo-Json -Depth 8)
  } catch {
    # Il corpo della risposta, non il messaggio di PowerShell: un KO che dice
    # solo "Richiesta non valida" non dice quale campo è sbagliato, ed è
    # l'unica parte che distingue un 400 atteso da uno inatteso.
    $dettaglio = $_.ErrorDetails.Message
    if (-not $dettaglio) { $dettaglio = $_.Exception.Message }
    return @{ __errore = $dettaglio; __status = [int]$_.Exception.Response.StatusCode }
  }
}

function Id($x) { if ($x.id) { return $x.id } else { return $x._id } }

# Un'esecuzione interrotta a metà lascia un condominio `Verifica …` nel database, e
# quello consuma un posto della capacità contrattuale: la creazione successiva
# viene rifiutata e i controlli successivi falliscono tutti insieme, per un motivo
# che non ha niente a che fare con quello che stanno provando. Prima di iniziare si
# ripulisce, come fa `verifica-attivita.ps1` con le attività.
function PulisciResidui {
  $residui = @((Api Get '/condomini?limit=100' $null).data) | Where-Object { $_.nome -like 'Verifica *' }
  foreach ($x in $residui) {
    $r = Api Delete "/condomini/$(Id $x)" $null
    if ($r.__errore) { "  --   condominio $($x.nome) non ripulito: $($r.__errore)" }
  }
  if ($residui.Count -gt 0) { "  ripuliti $($residui.Count) condomini di una verifica precedente" }
}
PulisciResidui

$suff = [guid]::NewGuid().ToString('N').Substring(0,8).ToUpper()
$corpo = @{ nome="Verifica $suff"; indirizzo=@{ via='Via Prova'; civico='1'; citta='Milano'; cap='20100'; provincia='MI' }; totaleMillesimi=1000 }

"== 1. creazione =="
$r = Api Post '/condomini' $corpo
# Il codice non lo manda il client: lo genera il server dal nome più un suffisso
# casuale di 6 cifre esadecimali. "Verifica 9BA11E4F" dà "VERIFICA9BA11-574D4E":
# la parte iniziale è il nome ripulito e troncato, quindi il regex non ne fissa la
# lunghezza.
$atteso = '^VERIFICA[A-Z0-9]*-[0-9A-F]{6}$'
Check 'crea condominio' ($r.data -and $r.data.nome -eq "Verifica $suff") ($r.__errore)
Check 'il codice è generato dal nome' ($r.data.codice -match $atteso) "codice $($r.data.codice)"
Check 'il codice non contiene spazi' ($r.data.codice -notmatch '\s') "codice $($r.data.codice)"

# La creazione riuscita va tenuta da parte: il controllo seguente riusa `$r` per
# una POST che viene rifiutata, e chi legge `data` dopo troverebbe il vuoto.
$creato = $r
$codice1 = $creato.data.codice
$id = $creato.data.id
if (-not $id) { $id = $creato.data._id }
# Senza questo, una creazione rifiutata lascia `$id` vuoto e i controlli dopo
# falliscono a catena dicendo "404" invece del vero motivo.
if (-not $id) { throw "creazione rifiutata: $($creato.__errore)" }

# Mandare il codice deve essere un errore e non una modifica ignorata: il client
# si troverebbe un codice diverso da quello chiesto senza che nulla lo dica.
$r = Api Post '/condomini' (@{ nome="Verifica $suff"; codice='CODICE-MIO'; indirizzo=@{ via='Via Prova'; citta='Milano' } })
Check 'creazione con codice rifiutata' ($r.__status -eq 400) "status $($r.__status): $($r.__errore)"
Check 'l errore nomina il codice' ($r.__errore -match 'codice') $r.__errore

"== 2. modifica =="
$r = Api Patch "/condomini/$id" (@{ nome="Verifica $suff rinominata"; note='modificato' })
Check 'patch nome' ($r.data.nome -eq "Verifica $suff rinominata") ($r.__errore)
Check 'patch conserva il codice generato' ($r.data.codice -eq $codice1) "atteso $codice1, trovato $($r.data.codice)"

"== 2b. il codice non si puo' cambiare =="
# Non è un campo come gli altri: è l'identificativo con cui lo stabile compare
# nei contratti, quindi cambiarlo renderebbe false le comunicazioni già emesse.
# `condominioUpdateSchema` è `strict` proprio perché una `PATCH` che lo manda
# verrebbe altrimenti ignorata in silenzio e sembrerebbe una modifica riuscita.
$r = Api Patch "/condomini/$id" (@{ codice='CODICE-MIO' })
Check 'patch con codice rifiutata' ($r.__status -eq 400) "status $($r.__status): $($r.__errore)"
Check 'il condominio non ha cambiato codice' ((Api Get "/condomini/$id" $null).data.codice -eq $codice1) "codice $((Api Get "/condomini/$id" $null).data.codice)"

"== 3. cancellazione di un condominio vuoto =="
$r = Api Delete "/condomini/$id" $null
Check 'delete vuoto' (-not $r.__errore) ($r.__errore)

"== 4. la cancellazione di un condominio con dati viene rifiutata =="
$r = Api Post '/condomini' $corpo
$id2 = $r.data.id
if (-not $id2) { $id2 = $r.data._id }
# Stesso identico nome del primo: se il codice dipendesse solo dal nome, i due
# condomini avrebbero lo stesso codice ed è quello che renderebbe ambiguo un
# contratto.
Check 'lo stesso nome genera un codice diverso' ($r.data.codice -ne $codice1) "primo $codice1, secondo $($r.data.codice)"
$r = Api Post "/condomini/$id2/unita" (@{ codice="U$suff"; piano=1; numero='1'; metratura=50; tipo='appartamento' })
Check 'crea unita di prova' (-not $r.__errore) ($r.__errore)
$r = Api Delete "/condomini/$id2" $null
Check 'delete con dipendenze rifiutato' ($r.__status -eq 403) "status $($r.__status): $($r.__errore)"
$msg = try { (Invoke-RestMethod -Method Delete -Uri "$base/condomini/$id2" -Headers $h -ErrorAction Stop) } catch { $_.ErrorDetails.Message }
Check 'il messaggio nomina la dipendenza' (($msg -match 'unit')) $msg

"== 5. pulizia =="
$u = Api Get "/condomini/$id2/unita" $null
foreach ($x in $u.data) { $ux = if ($x.id) { $x.id } else { $x._id }; Api Delete "/condomini/$id2/unita/$ux" $null | Out-Null }
$r = Api Delete "/condomini/$id2" $null
Check 'cleanup' (-not $r.__errore) ($r.__errore)

""
"esito: $ok ok, $ko ko"
if ($ko -gt 0) { exit 1 }
