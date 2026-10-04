$base = 'http://localhost:5173/api'
function Login($e, $p) {
  (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken
}
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Esito($nome, $script) {
  try { $r = & $script; Write-Output ("  {0,-52} consentito ({1})" -f $nome, $r) }
  catch { $s = $_.Exception.Response.StatusCode.value__; Write-Output ("  {0,-52} negato ({1})" -f $nome, $s) }
}

$sa = Login 'superadmin@condomini.local' 'SuperAdmin123!'
$ad = Login 'admin@condomini.local' 'Admin123!'
$as = Login 'assistente@example.com' 'Assistente123!'
$co = Login 'marco.rossi@example.com' 'Condomino123!'

$c = (Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth $sa)).data | Where-Object { $_.role -eq 'superadmin' }
$st = (Invoke-RestMethod -Uri "$base/contratti" -Headers (Auth $ad)).data[0]
$tot = $st.costo

Write-Output '=== Piattaforma riservata al superadmin ==='
Esito 'admin  GET /contratti/amministratori'  { (Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth $ad)).data.Count }
Esito 'assistente GET /contratti/amministratori' { (Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth $as)).data.Count }
Esito 'superadmin GET /contratti/amministratori' { (Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth $sa)).data.Count }
Esito 'admin  POST /contratti (nuovo contratto)' { (Invoke-RestMethod -Method Post -Uri "$base/contratti" -Headers (Auth $ad) -ContentType 'application/json' -Body (@{amministratoreId='x';condominiMassimi=1;costo=1;periodicita='annuale';durataMesi=12;dataInizio='2026-01-01';dataScadenza='2027-01-01'}|ConvertTo-Json)).data.stato }
Esito 'condomino GET /staff/assistenti' { (Invoke-RestMethod -Uri "$base/staff/assistenti" -Headers (Auth $co)).data.Count }

$prof = (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $as)).data
$cid = $prof.condomini[0].condominioId
$u = (Invoke-RestMethod -Uri "$base/condomini/$cid/unita" -Headers (Auth $ad)).data[0]
Write-Output "  (condominio in prova: $($prof.condomini[0].codice))"

Write-Output ''
Write-Output '=== Permessi delegati all''assistente (solo versamenti) ==='
Esito 'assistente POST /versamenti (scrittura delegata)' { (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/versamenti" -Headers (Auth $as) -ContentType 'application/json' -Body (@{unita=$u._id;periodo=@{anno=2026;mese=11};importo=100;dataVersamento='2026-10-01';metodo='contanti'}|ConvertTo-Json)).data.importo }
Esito 'assistente POST /unita (non delegato)' { (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/unita" -Headers (Auth $as) -ContentType 'application/json' -Body (@{interno='T1';scala='A';piano=1;tipologia='monolocale';superficie=45;millesimi=100}|ConvertTo-Json)).data.codice }
Esito 'assistente POST /tabella-millesimi (non delegato)' { (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/tabella-millesimi" -Headers (Auth $as) -ContentType 'application/json' -Body '{}').data }
Esito 'assistente GET /assemblee (lettura negata)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/assemblee" -Headers (Auth $as)).data.Count }
Esito 'assistente GET /versamenti (leggere incluso in scrivere)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/versamenti" -Headers (Auth $as)).data.Count }
Esito 'assistente GET /unita (lettura negata)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/unita" -Headers (Auth $as)).data.Count }
Esito 'assistente GET /bilanci (lettura negata)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/bilanci" -Headers (Auth $as)).data.Count }
Esito 'assistente GET /verbali (lettura negata)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/verbali" -Headers (Auth $as)).data.Count }
Esito 'assistente GET /iscritti (lettura negata)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/condomini" -Headers (Auth $as)).data.Count }
Esito 'assistente GET /comunicazioni (lettura negata)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/comunicazioni" -Headers (Auth $as)).data.Count }
Esito 'admin     GET /bilanci (accesso pieno)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/bilanci" -Headers (Auth $ad)).data.Count }
Esito 'admin     GET /unita (accesso pieno)' { (Invoke-RestMethod -Uri "$base/condomini/$cid/unita" -Headers (Auth $ad)).data.Count }
Esito 'condomino  POST /versamenti (escluso)' { (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/versamenti" -Headers (Auth $co) -ContentType 'application/json' -Body (@{data='2026-10-01';importo=100;metodo='contanti'}|ConvertTo-Json)).data }
Esito 'condomino  POST /unita (escluso)' { (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cid/unita" -Headers (Auth $co) -ContentType 'application/json' -Body (@{interno='T2';scala='A';piano=1;tipologia='monolocale';superficie=45;millesimi=100}|ConvertTo-Json)).data.codice }

Write-Output ''
Write-Output '=== Validazione input ==='
Esito 'contratto con periodicita inesistente' { (Invoke-RestMethod -Method Post -Uri "$base/contratti" -Headers (Auth $sa) -ContentType 'application/json' -Body (@{amministratoreId='x';condominiMassimi=1;costo=1;periodicita='giornaliera';durataMesi=12;dataInizio='2026-01-01';dataScadenza='2027-01-01'}|ConvertTo-Json)).error.codice }
Esito 'contratto senza permesso (admin su /p)' { (Invoke-RestMethod -Uri "$base/contratti/$($st.id)/rate" -Headers (Auth $co)).data.Count }