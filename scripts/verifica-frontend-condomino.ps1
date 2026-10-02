$base = 'http://localhost:5173/api'
function Login($e, $p) { (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).data.accessToken }
function Auth($t) { @{ Authorization = "Bearer $t" } }
function Esito($nome, $script) {
  try { $r = & $script; Write-Output ("  {0,-50} ok ({1})" -f $nome, $r) }
  catch { Write-Output ("  {0,-50} negato ({1})" -f $nome, $_.Exception.Response.StatusCode.value__) }
}

$as = Login 'assistente@example.com' 'Assistente123!'
$co = Login 'marco.rossi@example.com' 'Condomino123!'
$ad = Login 'admin@condomini.local' 'Admin123!'
$pas = (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $as)).data
$pco = (Invoke-RestMethod -Uri "$base/auth/me" -Headers (Auth $co)).data
$cas = $pas.condomini[0].condominioId
$cco = $pco.condomini[0].condominioId
$unita = (Invoke-RestMethod -Uri "$base/condomini/$cas/unita" -Headers (Auth $ad)).data[0]
# L'id del titolare del contratto: il destinatario obbligato di ogni scrittura del condomino.
$amministratore = ((Invoke-RestMethod -Uri "$base/staff/amministratori" -Headers (Auth (Login 'superadmin@condomini.local' 'SuperAdmin123!'))).data |
  Where-Object { $_.email -eq 'admin@condomini.local' }).id

Write-Output '=== Scrittura realmente delegata all''assistente ==='
Esito 'assistente POST /versamenti (unita, periodo, importo)' {
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cas/versamenti" -Headers (Auth $as) -ContentType 'application/json' -Body (@{
    unita = $unita._id; periodo = @{ anno = 2026; mese = 10 }; importo = 150.50; dataVersamento = '2026-10-05'; metodo = 'bonifico'
  } | ConvertTo-Json)).data.importo
}

Write-Output ''
Write-Output '=== Il condomino conserva i propri dati ==='
Esito 'condomino GET /mie-quote'                    { (Invoke-RestMethod -Uri "$base/condomini/$cco/condomini/mie-quote" -Headers (Auth $co)).data.Count }
Esito 'condomino GET /verbali'                      { (Invoke-RestMethod -Uri "$base/condomini/$cco/verbali" -Headers (Auth $co)).data.Count }
Esito 'condomino GET /comunicazioni'                { (Invoke-RestMethod -Uri "$base/condomini/$cco/comunicazioni" -Headers (Auth $co)).data.Count }
Esito 'condomino GET /versamenti (propri versamenti)' { (Invoke-RestMethod -Uri "$base/condomini/$cco/versamenti" -Headers (Auth $co)).data.Count }
Esito 'condomino GET /quote'                        { (Invoke-RestMethod -Uri "$base/condomini/$cco/versamenti/quote?anno=2026&mese=10" -Headers (Auth $co)).data.totaleDovuto }
Esito 'condomino POST /comunicazioni (va all''amministratore)' {
  $c = (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cco/comunicazioni" -Headers (Auth $co) -ContentType 'application/json' -Body (@{
    tipo = 'richiesta'; oggetto = 'Richiesta di prova'; corpo = 'Test'
  } | ConvertTo-Json)).data
  if ($c.destinatari -contains $amministratore) { "destinatario corretto (stato $($c.stato))" } else { "DESTINATARIO SBAGLIATO: $($c.destinatari -join ',')" }
}
Esito 'condomino POST /avviso (tipo riservato, deve fallire)' {
  (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cco/comunicazioni" -Headers (Auth $co) -ContentType 'application/json' -Body (@{
    tipo = 'avviso'; oggetto = 'Avviso fasullo'; corpo = 'Test'
  } | ConvertTo-Json)).data
}
Esito 'condomino GET /unita (non deve vedere la lista)' { (Invoke-RestMethod -Uri "$base/condomini/$cco/unita" -Headers (Auth $co)).data.Count }
Esito 'condomino POST /versamenti (resta escluso)'    { (Invoke-RestMethod -Method Post -Uri "$base/condomini/$cco/versamenti" -Headers (Auth $co) -ContentType 'application/json' -Body (@{unita=$unita._id;periodo=@{anno=2026;mese=9};importo=1;dataVersamento='2026-09-01'}|ConvertTo-Json)).data }