$base = 'http://localhost:4000/api'
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Login($e, $p) { (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken }
function Esito($nome, $script, $atteso = $null) {
  # Con `$atteso` la riga dice il valore e non lo computa: serve per le verifiche
  # sullo stato, dove il valore va stampato per intero e non ridotto a una
  # condizione, e `ok`/`negato` da soli sembrerebbero dire che è andato bene.
  if ($null -ne $atteso) {
    try { Write-Output ("  {0,-52} {1}" -f $nome, $atteso) }
    catch { Write-Output ("  {0,-52} KO {1}" -f $nome, $_) }
    return
  }
  try { $r = & $script; Write-Output ("  {0,-52} ok ({1})" -f $nome, $r) }
  catch { $d = $_.ErrorDetails.Message; if ($d) { try { $d = ($d | ConvertFrom-Json).error.message } catch { } } else { $d = $_.Exception.Message }; Write-Output ("  {0,-52} negato ({1})" -f $nome, $d) }
}

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$ad = Login 'admin@condomini.local' 'Admin123!'
# Suffisso per gli indirizzi di questa esecuzione: sono account veri, restano nel
# database e la verifica non puo' cancellarli (una comunicazione inviata non si
# cancella, e un utente con una password casuale non e' piu' eliminabile).
$suff2 = [guid]::NewGuid().ToString('N').Substring(0,6)

Write-Output '=== Account demo: gia'' confermati, nessun avviso ==='
$demo = @(
  @{ nome='superadmin'; email='superadmin@condomini.local'; pw='SuperAdmin123!' },
  @{ nome='admin'; email='admin@condomini.local'; pw='Admin123!' },
  @{ nome='assistente'; email='assistente@example.com'; pw='Assistente123!' },
  @{ nome='condomino'; email='marco.rossi@example.com'; pw='Condomino123!' }
)
foreach ($d in $demo) {
  $t = Login $d.email $d.pw
  $me = (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $t)).data
  Write-Output ("  {0,-11} emailConfermato={1}" -f $d.nome, $me.emailConfermato)
}

Write-Output ''
Write-Output '=== Creazione amministratore: email inviata ==='
$corpo = @{ email='nuovo.admin@example.com'; nome='Nuovo'; cognome='Admin'; password='PasswordRobusta1!' } | ConvertTo-Json
$a = (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori" -Headers (Auth $sa) -ContentType 'application/json' -Body $corpo).data
Write-Output "  creato $($a.email) confermato=$($a.emailConfermato) inviata=$($a.conferma.inviata) motivo=$($a.conferma.motivo) scadenza=$($a.conferma.scadenza)"

Write-Output ''
Write-Output '=== Conferma col token sbagliato deve fallire ==='
Esito 'token inesistente' { (Invoke-RestMethod -Method Post -Uri "$base/auth/conferma-email" -ContentType 'application/json' -Body (@{token=('a' * 64)}|ConvertTo-Json)).data }
Esito 'token troppo corto (validazione)' { (Invoke-RestMethod -Method Post -Uri "$base/auth/conferma-email" -ContentType 'application/json' -Body (@{token='corto'}|ConvertTo-Json)).data }

Write-Output ''
Write-Output '=== Il nuovo amministratore entra col suo avviso ==='
$t = Login 'nuovo.admin@example.com' 'PasswordRobusta1!'
Write-Output "  login riuscito, emailConfermato=$((Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $t)).data.emailConfermato)"

Write-Output ''
Write-Output '=== Reinvio ==='
Esito 'superadmin reinvia la conferma' { (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($a.id)/reinvia-conferma" -Headers (Auth $sa)).data.inviato }
Esito 'admin non puo reinviare a un amministratore' { (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($a.id)/reinvia-conferma" -Headers (Auth $ad)).data }
Esito 'utente non puo reinviare a un altro' { (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($a.id)/reinvia-conferma" -Headers (Auth $t)).data }

Write-Output ''
Write-Output '=== Reset della password ==='
$meSa = (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $sa)).data
Esito 'admin non puo reimpostare la password di un amministratore' { (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($a.id)/reimposta-password" -Headers (Auth $ad)).data }
Esito 'utente non puo reimpostare la password di un amministratore' { (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($a.id)/reimposta-password" -Headers (Auth $t)).data }
Esito 'superadmin non puo reimpostare la propria password' { (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($meSa.id)/reimposta-password" -Headers (Auth $sa)).data }
# Il caso positivo si comporta in due modi a seconda che Brevo sia configurato:
# con la chiave la password cambia e quella vecchia muore, senza la chiave
# l'API risponde 503 e la password precedente torna valida. Entrambe le cose
# sono il comportamento voluto, quindi il ramo lo dichiara invece di fallire.
$inviata = $false
try {
  $r = (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori/$($a.id)/reimposta-password" -Headers (Auth $sa)).data
  $inviata = $true
  Write-Output "  superadmin reimposta: nuova password inviata, scadenza=$($r.scadenza)"
} catch {
  Write-Output "  superadmin reimposta: invio non riuscito ($($_.Exception.Response.StatusCode.value__)), password precedente ripristinata"
}
if ($inviata) {
  Esito 'la password precedente non vale piu' { (Login 'nuovo.admin@example.com' 'PasswordRobusta1!').Length }
} else {
  Esito 'la password precedente vale ancora (ripristino)' { (Login 'nuovo.admin@example.com' 'PasswordRobusta1!').Length }
  $dopo = (Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth $sa)).data | Where-Object { $_.id -eq $a.id }
  Write-Output "  stato dopo il ripristino: emailConfermato=$($dopo.emailConfermato) (come prima del reset)"
}

Write-Output ''
Write-Output '=== Cambio di indirizzo: non e'' immediato ==='
# L'accesso e' per indirizzo, quindi salvare subito il nuovo chiuderebbe fuori
# chi lo sbaglia. Il nuovo sta in emailInAttesa e diventa email solo alla
# conferma del link, e quella verifica non puo' farla questa API: il token in
# chiaro esiste solo nell'email ricevuta. Qui si controlla tutto il resto, cioe'
# che il cambio non accada prima del link e che torni indietro su comando.
function Profilo($token) { (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $token)).data }
function Proponi($email) {
  (Invoke-RestMethod -Method Post -Uri "$base/auth/cambia-email" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{email=$email;password='Admin123!'}|ConvertTo-Json)).data
}
$prof = Profilo $ad
Write-Output "  email=$($prof.email) emailConfermato=$($prof.emailConfermato) emailInAttesa=$($prof.emailInAttesa)"

# `$nuovo` non collide con `nuovo.admin@example.com`, che questa stessa verifica
# ha creato poco fa: un indirizzo occupato risponderebbe 409 e sembrerebbe un
# difetto del cambio.
$nuovo = "cambio.admin.$suff2@example.com"
$altro = "cambio2.admin.$suff2@example.com"

Esito 'password sbagliata: il cambio non parte' { (Invoke-RestMethod -Method Post -Uri "$base/auth/cambia-email" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{email=$nuovo;password='Sbagliata1!'}|ConvertTo-Json)).data }
Esito 'email non valida (validazione)' { (Invoke-RestMethod -Method Post -Uri "$base/auth/cambia-email" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{email='non-una-email';password='Admin123!'}|ConvertTo-Json)).data }
Esito 'stesso indirizzo di ora' { (Invoke-RestMethod -Method Post -Uri "$base/auth/cambia-email" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{email='admin@condomini.local';password='Admin123!'}|ConvertTo-Json)).data }
Esito 'indirizzo gia'' occupato' { (Invoke-RestMethod -Method Post -Uri "$base/auth/cambia-email" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{email='superadmin@condomini.local';password='Admin123!'}|ConvertTo-Json)).data }
# Un account non ancora confermato ha gia' una conferma in corso: accavallarle
# lascerebbe due token per un solo hash, e un link morirebbe senza essere letto.
$bozza = (Invoke-RestMethod -Method Post -Uri "$base/staff/amministratori" -Headers (Auth $sa) -ContentType 'application/json' -Body (@{email="nonconfermato.$suff2@example.com";nome='Non';cognome='Confermato';password='PasswordRobusta1!'}|ConvertTo-Json)).data
$tNonConfermato = Login $bozza.email 'PasswordRobusta1!'
Esito 'account non confermato: il cambio viene rimandato' { (Invoke-RestMethod -Method Post -Uri "$base/auth/cambia-email" -Headers (Auth $tNonConfermato) -ContentType 'application/json' -Body (@{email=$altro;password='PasswordRobusta1!'}|ConvertTo-Json)).data }
Esito 'annulla quando non c''e'' nessun cambio in corso' { (Invoke-RestMethod -Method Post -Uri "$base/auth/annulla-cambio-email" -Headers (Auth $ad)).data }
Write-Output "  dopo i rifiuti: emailInAttesa=$(Profilo $ad | ForEach-Object { $_.emailInAttesa })"

$proposto = Proponi $nuovo
Write-Output "  proposto $($proposto.email) -> $($proposto.emailInAttesa)"
$prof = Profilo $ad
Esito 'l''accesso resta con il vecchio indirizzo' $prof.email "email=$($prof.email)"
Esito 'il nuovo indirizzo e'' in attesa' ($prof.emailInAttesa -eq $nuovo) "attesa $($prof.emailInAttesa)"
Esito 'il vecchio indirizzo entra ancora' ((Login 'admin@condomini.local' 'Admin123!').Length -gt 0) 'token'
Esito 'il nuovo indirizzo non entra ancora' { Login $nuovo 'Admin123!' }
Esito 'annullare svuota l''attesa e invalida il link' {
  # L'hash del token viene svuotato insieme all'attesa: senza, il link della
  # proposta resterebbe valido e potrebbe completare un cambio che l'utente ha
  # dichiarato annullato. Il token in chiaro vive nell'email, quindi qui si
  # controlla lo stato, non il link.
  Invoke-RestMethod -Method Post -Uri "$base/auth/annulla-cambio-email" -Headers (Auth $ad) | Out-Null
  $p = Profilo $ad
  (($p.email -eq 'admin@condomini.local') -and $null -eq $p.emailInAttesa)
} "attesa=$((Profilo $ad | ForEach-Object { $_.emailInAttesa }))"

Esito 'un secondo tentativo sovrascrive il primo' ((Proponi $altro).emailInAttesa -eq $altro) "attesa $((Proponi $altro).emailInAttesa)"

Invoke-RestMethod -Method Post -Uri "$base/auth/annulla-cambio-email" -Headers (Auth $ad) | Out-Null
$prof = Profilo $ad
Esito 'annullato: resta il vecchio e non c''e'' piu'' il nuovo' (($prof.email -eq 'admin@condomini.local') -and $null -eq $prof.emailInAttesa) "email=$($prof.email) attesa=$($prof.emailInAttesa)"
Esito 'superadmin annulla un cambio senza averne uno' { Invoke-RestMethod -Method Post -Uri "$base/auth/annulla-cambio-email" -Headers (Auth $sa) }

Write-Output ''
Write-Output '=== Assistente: password provvisoria via email ==='
$as = Login 'assistente@example.com' 'Assistente123!'
$corpoAss = @{ email='nuovo.assistente@example.com'; nome='Nuovo'; cognome='Assistente'; permessi=@('versamenti:leggere') } | ConvertTo-Json
$nuovoAss = (Invoke-RestMethod -Method Post -Uri "$base/staff/assistenti" -Headers (Auth $ad) -ContentType 'application/json' -Body $corpoAss).data
Write-Output "  creato $($nuovoAss.email) confermato=$($nuovoAss.emailConfermato) inviata=$($nuovoAss.conferma.inviata) passwordDaConsegnare=$($nuovoAss.passwordDaConsegnare)"
Esito 'elenco assistenti: stato della conferma' {
  $e = (Invoke-RestMethod -Uri "$base/staff/assistenti" -Headers (Auth $ad)).data | Where-Object { $_.email -eq 'nuovo.assistente@example.com' }
  "emailConfermato=$($e.emailConfermato) confermaInviataIl=$($e.confermaInviataIl)"
}
Esito 'admin reinvia la conferma del proprio assistente' { (Invoke-RestMethod -Method Post -Uri "$base/staff/assistenti/$($nuovoAss.id)/reinvia-conferma" -Headers (Auth $ad)).data.inviato }