<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();$code=trim((string)($_GET['code']??''));
if($code!==''){
 // tokenised labels (IR:A:… / IR:E:…, optional :FEED/:WATER/…) — resolved only within this account
 if($r=ir_qr_resolve($pdo,$uid,$code)){
   $actionTypes0=['FEED'=>'Krmení','WATER'=>'Výměna vody','MIST'=>'Rosení','CLEAN'=>'Čištění','WEIGHT'=>'Vážení','SHED'=>'Svlek'];$act=strtoupper((string)($r['action']??''));
   if($r['kind']==='animal'){if($act==='HEALTH')ir_redirect('health.php?animal_id='.$r['id']);if(isset($actionTypes0[$act]))ir_redirect('quick.php?animal_id='.$r['id'].'&fast=1&source=qr&type='.rawurlencode($actionTypes0[$act]));ir_redirect('animal.php?id='.$r['id']);}
   if(isset($actionTypes0[$act]))ir_redirect('quick.php?cage_id='.$r['id'].'&source=qr&type='.rawurlencode($actionTypes0[$act]));
   $_GET['cage_id']=$r['id'];
 }
 $actionTypes=['FEED'=>'Krmení','WATER'=>'Výměna vody','MIST'=>'Rosení','CLEAN'=>'Čištění','WEIGHT'=>'Vážení','SHED'=>'Svlek'];
 if(preg_match('/IR:(?:ANIMAL|ZVIRE):(\d+)(?::([A-Z]+))?/i',$code,$m)){
   $aid=(int)$m[1];$action=strtoupper((string)($m[2]??''));
   if($action==='HEALTH')ir_redirect('health.php?animal_id='.$aid);
   if(isset($actionTypes[$action]))ir_redirect('quick.php?animal_id='.$aid.'&fast=1&type='.rawurlencode($actionTypes[$action]));
   ir_redirect('animal.php?id='.$aid);
 }
 if(preg_match('/IR:RACK:(\d+)(?::([A-Z]+))?/i',$code,$m)){
   $rackId=(int)$m[1];$action=strtoupper((string)($m[2]??''));
   if(isset($actionTypes[$action]))ir_redirect('quick.php?rack_id='.$rackId.'&type='.rawurlencode($actionTypes[$action]));
   $_GET['rack_id']=$rackId;
 }
 if(preg_match('/IR:CAGE:(\d+)(?::([A-Z]+))?/i',$code,$m)){
   $cageId=(int)$m[1];$action=strtoupper((string)($m[2]??''));
   if(isset($actionTypes[$action]))ir_redirect('quick.php?cage_id='.$cageId.'&type='.rawurlencode($actionTypes[$action]));
   $_GET['cage_id']=$cageId;
 }
 if(ctype_digit($code)&&ir_animal($pdo,$uid,(int)$code))ir_redirect('animal.php?id='.(int)$code);
}
$rackId=ir_int($_GET['rack_id']??0);$cageId=ir_int($_GET['cage_id']??0);$animals=[];
try{if($rackId){$st=$pdo->prepare("SELECT z.id,z.jmeno_kod,z.latinsky_nazev FROM wp_ir2_zvirata z JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND u.rack_id=? AND ".ir_status_active_sql('z')." ORDER BY u.grid_row,u.grid_col,z.jmeno_kod");$st->execute([$uid,$rackId]);$animals=$st->fetchAll()?:[];}elseif($cageId){$st=$pdo->prepare("SELECT id,jmeno_kod,latinsky_nazev FROM wp_ir2_zvirata z WHERE user_id=? AND ubikace_id=? AND ".ir_status_active_sql('z')." ORDER BY jmeno_kod");$st->execute([$uid,$cageId]);$animals=$st->fetchAll()?:[];}}catch(Throwable){}
ir_page_start('Scan QR / NFC','habitat');echo ir_back('index.php','Zpět');
?>
<div class="two-column-layout"><section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">SKENER QR / NFC</span><h2>Naskenovat QR</h2></div></header><div class="scanner-box"><video data-qr-video autoplay muted playsinline></video><p data-qr-status><?=isset($_GET['ready'])?'Zapsáno. Naskenuj další QR / NFC.':'Spusť kameru nebo vlož kód ručně.'?></p><button class="btn primary" type="button" data-start-scan>Spustit kameru</button><form method="get"><input class="input" name="code" placeholder="IR:ANIMAL:123 / IR:ANIMAL:123:FEED / IR:RACK:4"><button class="btn secondary">Otevřít</button></form><div class="scan-action-legend"><span>FEED · krmení</span><span>WATER · voda</span><span>CLEAN · úklid</span><span>SHED · svlek</span></div></div></section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">NFC ŠTÍTEK</span><h2>Číst / zapsat NFC</h2></div></header><div class="nfc-tools"><p data-nfc-status>Přilož NFC tag po spuštění čtení. Web NFC funguje jen v podporovaných prohlížečích přes HTTPS.</p><div class="form-grid"><label>Obsah tagu<input data-nfc-payload value="<?=ir_e(IR_PUBLIC_URL.'/scan.php?code=IR:ANIMAL:')?>" placeholder="IR:ANIMAL:123 nebo IR:ANIMAL:123:FEED"></label></div><div class="form-actions"><button class="btn primary" type="button" data-nfc-read>Číst NFC</button><button class="btn secondary" type="button" data-nfc-write>Zapsat NFC</button></div></div></section></div>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">HROMADNÁ AKCE</span><h2><?=($rackId||$cageId)?'Obsah naskenované skupiny':'Rack / ubikace'?></h2></div></header><?php if($animals):?><div class="simple-list"><?php foreach($animals as $a):?><a href="animal.php?id=<?=$a['id']?>"><strong><?=ir_e((string)$a['jmeno_kod'])?></strong><span><?=ir_e((string)$a['latinsky_nazev'])?></span></a><?php endforeach;?></div><a class="btn primary" href="quick.php?<?=$rackId?'rack_id='.$rackId:'cage_id='.$cageId?>">Rychlý záznam celé skupiny</a><?php else:?><div class="empty-state small">Po naskenování racku nebo ubikace se zde zobrazí zvířata.</div><?php endif;?></section>
<script>
(()=>{const s=document.querySelector('[data-nfc-status]'),p=document.querySelector('[data-nfc-payload]');const msg=t=>{if(s)s.textContent=t};document.querySelector('[data-nfc-read]')?.addEventListener('click',async()=>{if(!('NDEFReader'in window)){msg('Web NFC tento prohlížeč nepodporuje.');return}try{const n=new NDEFReader();await n.scan();msg('Čekám na NFC tag…');n.onreading=e=>{for(const r of e.message.records){try{const text=new TextDecoder(r.encoding||'utf-8').decode(r.data);p.value=text;msg('NFC načteno.');if(/^https?:\/\//i.test(text))location.href=text;else if(/^IR:/i.test(text))location.href='scan.php?code='+encodeURIComponent(text);break}catch{}}}}catch(e){msg('NFC čtení se nepodařilo: '+e.message)}});document.querySelector('[data-nfc-write]')?.addEventListener('click',async()=>{if(!('NDEFReader'in window)){msg('Web NFC tento prohlížeč nepodporuje.');return}try{const n=new NDEFReader();msg('Přilož NFC tag pro zápis…');await n.write(p.value.trim());msg('NFC tag byl zapsán.')}catch(e){msg('NFC zápis se nepodařil: '+e.message)}})})();
</script>
<?php ir_page_end();
