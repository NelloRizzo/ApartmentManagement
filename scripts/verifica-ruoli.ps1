$base = 'http://localhost:5173/api'
function Login($e, $p) {
  $r = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)
  return @{ Token = $r.data.accessToken; Utente = $r.data.user }
}
function Auth($t) { @{ Authorization = "Bearer $t" } }

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$ad = Login 'admin@condomini.local' 'Admin123!'
$as = Login 'assistente@example.com' 'Assistente123!'
$co = Login 'marco.rossi@example.com' 'Condomino123!'

Write-Output '=== Profili e permessi ==='
foreach ($x in @(@('superadmin',$sa), @('admin',$ad), @('assistente',$as), @('condomino',$co))) {
  $u = $x[1].Utente
  $p = if ($null -eq $u.permessi) { 'pieno' } else { ($u.permessi -join ',') }
  Write-Output ("  {0,-11} role={1,-11} superadmin={2,-5} permessi={3}" -f $x[0], $u.role, $u.isSuperadmin, $p)
  Write-Output ("               condomini: {0}" -f (($u.condomini | ForEach-Object { "$($_.codice)$(if ($_.assistito) { '(assistito)' } else { '' })" }) -join ', '))
}

Write-Output ''
Write-Output '=== Contratti per ruolo ==='
foreach ($x in @(@('superadmin',$sa), @('admin',$ad))) {
  $t = (Invoke-RestMethod -Uri "$base/contratti" -Headers (Auth $x[1].Token)).data
  Write-Output ("  {0,-11} contratti visibili: {1}" -f $x[0], $t.Count)
  foreach ($c in $t) { Write-Output ("               {0} {1} {2}/{3} condomini" -f $c.codice, $c.stato, $c.condominiInUso, $c.condominiMassimi) }
}

Write-Output ''
Write-Output '=== Stato servizio ==='
foreach ($x in @(@('superadmin',$sa), @('admin',$ad), @('assistente',$as), @('condomino',$co))) {
  $s = (Invoke-RestMethod -Uri "$base/contratti/mio-stato" -Headers (Auth $x[1].Token)).data
  if ($s.ruolo -eq 'admin') {
    Write-Output ("  {0,-11} stato={1} condomini {2}/{3} disponibili={4}" -f $x[0], $s.stato, $s.contratto.condominiInUso, $s.contratto.condominiMassimi, $s.contratto.condominiDisponibili)
  } elseif ($s.ruolo -eq 'superadmin') {
    Write-Output ("  {0,-11} contratti attivi={1} in scadenza 30gg={2}" -f $x[0], $s.contrattiAttivi, $s.inScadenzaEntro30Giorni)
  } else {
    Write-Output ("  {0,-11} ruolo={1}" -f $x[0], $s.ruolo)
  }
}

Write-Output ''
Write-Output '=== Assistenti visti dall''amministratore ==='
$ass = (Invoke-RestMethod -Uri "$base/staff/assistenti" -Headers (Auth $ad.Token)).data
foreach ($a in $ass) { Write-Output ("  {0} <{1}> accessoPieno={2} permessi={3}" -f $a.nomeCompleto, $a.email, $a.accessoPieno, ($a.permessi -join ',')) }

Write-Output ''
Write-Output '=== Amministratori visti dal superadmin ==='
$am = (Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth $sa.Token)).data
foreach ($a in $am) { Write-Output ("  {0} <{1}> role={2} accessoPieno={3}" -f $a.nomeCompleto, $a.email, $a.role, $a.accessoPieno) }

Write-Output ''
Write-Output '=== Messaggi di piattaforma ==='
$m = (Invoke-RestMethod -Uri "$base/contratti/messaggi" -Headers (Auth $ad.Token)).data
Write-Output "  l'admin vede $($m.Count) messaggi"
$m2 = (Invoke-RestMethod -Uri "$base/contratti/messaggi" -Headers (Auth $sa.Token)).data
Write-Output "  il superadmin vede $($m2.Count) messaggi"

Write-Output ''
Write-Output '=== Catalogo ambiti ==='
$amb = (Invoke-RestMethod -Uri "$base/staff/ambiti" -Headers (Auth $ad.Token)).data
Write-Output "  $($amb.ambiti.Count) ambiti, $($amb.permessi.Count) permessi"