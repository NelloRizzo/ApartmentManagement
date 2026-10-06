$base = 'http://localhost:4000/api'
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Login($e, $p) { (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken }
function Esito($nome, $script) {
  try { $r = & $script; Write-Output ("  {0,-52} ok ({1})" -f $nome, $r) }
  catch { $d = $_.ErrorDetails.Message; if ($d) { try { $d = ($d | ConvertFrom-Json).error.message } catch { } } else { $d = $_.Exception.Message }; Write-Output ("  {0,-52} negato ({1})" -f $nome, $d) }
}

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$ad = Login 'admin@condomini.local' 'Admin123!'

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