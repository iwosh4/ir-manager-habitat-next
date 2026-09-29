<?php
declare(strict_types=1);

/**
 * Operační Plánovač 062.
 * Primární cíl: chovatel během sekund vidí co je dnes / po termínu a může
 * úkol dokončit, odložit nebo vynechat přímo z řádku bez otevírání detailu.
 */
function ir_render_planner_agenda(PDO $pdo,int $uid): void {
    $today=new DateTimeImmutable('today');
    $raw=(string)($_GET['timeline_date']??$today->format('Y-m-d'));
    $anchor=DateTimeImmutable::createFromFormat('!Y-m-d',$raw);
    if(!$anchor||$anchor->format('Y-m-d')!==$raw)$anchor=$today;

    $dayKey=$anchor->format('Y-m-d');
    $q=$pdo->prepare("SELECT p.*,z.jmeno_kod,z.latinsky_nazev,z.foto FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND p.datum_termin=? AND p.stav<>'Zrušeno' ORDER BY COALESCE(p.cas_termin,'23:59:59'),p.id");
    $q->execute([$uid,$dayKey]);
    $dayTasks=$q->fetchAll()?:[];
    $dayGroups=ir_planner_group_tasks($dayTasks);

    $q=$pdo->prepare("SELECT p.*,z.jmeno_kod,z.latinsky_nazev,z.foto FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND p.stav='Aktivní' AND p.datum_termin<CURDATE() ORDER BY p.datum_termin,COALESCE(p.cas_termin,'23:59:59'),p.id");
    $q->execute([$uid]);
    $overdueRows=$q->fetchAll()?:[];
    $overdueGroups=ir_planner_group_tasks($overdueRows);

    $countBy=function(string $needle)use($dayTasks):int{
        $n=0;$needle=mb_strtolower($needle,'UTF-8');
        foreach($dayTasks as $t){$hay=mb_strtolower((string)($t['kategorie'].' '.$t['nazev_ukolu']),'UTF-8');if(str_contains($hay,$needle))$n++;}
        return $n;
    };
    $activeToday=count(array_filter($dayTasks,static fn($t)=>(string)$t['stav']==='Aktivní'));
    $doneToday=count(array_filter($dayTasks,static fn($t)=>in_array((string)$t['stav'],['Hotovo','Splněno'],true)));
    $overdueCount=count($overdueRows);

    $returnTo='tasks.php?timeline_date='.rawurlencode($dayKey).'#today-upcoming';
    $page='tasks.php';

    $renderGroup=function(array $g,bool $late=false)use($returnTo):void{
        $items=$g['items'];$t=$g['first'];$count=count($items);
        $label=$count===1?(string)$t['nazev_ukolu']:(string)$g['label'];
        $icon=ir_activity_icon_key('task',$label.' '.(string)$t['kategorie']);
        $photo=ir_asset_photo_url((string)($t['foto']??''));
        $name=trim((string)($t['jmeno_kod']?:$t['latinsky_nazev']?:'Obecný úkol'));
        $allDone=true;foreach($items as $it)if(!in_array((string)$it['stav'],['Hotovo','Splněno'],true)){$allDone=false;break;}
        $state=$allDone?' is-done':($late?' is-overdue':'');
        $kind=' planner-kind-'.preg_replace('/[^a-z0-9_-]/i','',(string)$icon);
        echo '<article class="planner-operation-row'.$state.$kind.'">';
        echo '<a class="planner-operation-main" href="tasks.php?task='.(int)$t['id'].'">';
        echo '<span class="planner-operation-visual">';
        if($photo!=='')echo '<img src="'.ir_e($photo).'" alt="" loading="lazy">';else echo ir_visual_icon($icon);
        echo '</span><span class="planner-operation-copy"><strong>'.ir_e($label).($count>1?' <b class="planner-count">×'.$count.'</b>':'').'</strong><small>'.ir_e($name).'</small><em>'.ir_e((string)$t['kategorie']).($late?' · po termínu':'').'</em></span>';
        echo '<time>'.(!empty($t['cas_termin'])?ir_e(substr((string)$t['cas_termin'],0,5)):'Celý den').'</time></a>';
        if(!$allDone){
            echo '<form method="post" class="planner-operation-actions">'.ir_csrf_field().'<input type="hidden" name="return_to" value="'.ir_e($returnTo).'">';
            if($count>1){foreach($items as $it)echo '<input type="hidden" name="ids[]" value="'.(int)$it['id'].'">';echo '<input type="hidden" name="days" value="1"><button class="planner-done" name="action" value="complete_group" title="Vše hotovo">✓</button><button class="planner-delay" name="action" value="postpone_group" title="Odložit o den">+1</button><button class="planner-skip" name="action" value="skip_group" title="Vynechat">⊘</button>';}
            else{echo '<input type="hidden" name="id" value="'.(int)$t['id'].'"><input type="hidden" name="days" value="1"><button class="planner-done" name="action" value="complete" title="Hotovo">✓</button><button class="planner-delay" name="action" value="postpone" title="Odložit o den">+1</button><button class="planner-skip" name="action" value="skip" title="Vynechat">⊘</button>';}
            echo '</form>';
        }else echo '<span class="planner-completed-badge">Hotovo</span>';
        echo '</article>';
    };
    ?>
    <section class="panel planner-command-center" id="today-upcoming">
      <header class="planner-command-head">
        <div><span class="panel-kicker">PLÁNOVAČ &amp; AKTIVITY</span><h2><?=ir_e($anchor->format('d.m.Y')===$today->format('d.m.Y')?'Dnes · '.$anchor->format('d.m.Y'):$anchor->format('d.m.Y'))?></h2><p>Co je potřeba udělat. Hotovo, odložit nebo vynechat přímo z řádku.</p></div>
        <div class="planner-command-actions"><a class="btn primary" href="quick.php">+ Rychlý zápis</a><a class="btn" href="#new-task">+ Úkol</a></div>
      </header>

      <nav class="planner-date-strip" aria-label="Výběr dne">
        <?php for($i=-2;$i<=4;$i++):$d=$anchor->modify(($i>=0?'+':'').$i.' days');$is=$d->format('Y-m-d')===$dayKey;$isToday=$d->format('Y-m-d')===$today->format('Y-m-d');?>
        <a class="<?=$is?'is-active':''?> <?=$isToday?'is-today':''?>" href="<?=$page?>?timeline_date=<?=$d->format('Y-m-d')?>#today-upcoming"><small><?=['Ne','Po','Út','St','Čt','Pá','So'][(int)$d->format('w')]?></small><strong><?=$d->format('d')?></strong><span><?=$isToday?'Dnes':$d->format('m.')?></span></a>
        <?php endfor;?>
      </nav>

      <div class="planner-mini-kpis">
        <article><?=ir_visual_icon('tasks')?><span><small>Úkolů</small><strong><?=$activeToday?></strong></span></article>
        <article class="is-danger"><?=ir_visual_icon('warning')?><span><small>Po termínu</small><strong><?=$overdueCount?></strong></span></article>
        <article><?=ir_visual_icon('feeding')?><span><small>Krmení</small><strong><?=$countBy('krmen')?></strong></span></article>
        <article><?=ir_visual_icon('water')?><span><small>Voda / rosení</small><strong><?=$countBy('vod')+$countBy('rosen')?></strong></span></article>
        <article><?=ir_visual_icon('reproduction')?><span><small>Reprodukce</small><strong><?=$countBy('reproduk')+$countBy('inkub')+$countBy('snů')?></strong></span></article>
        <article class="is-success"><?=ir_visual_icon('check')?><span><small>Hotovo</small><strong><?=$doneToday?></strong></span></article>
      </div>

      <div class="planner-operation-layout">
        <main class="planner-today-column">
          <header><strong><?= $dayKey===$today->format('Y-m-d')?'Dnešní práce':'Práce pro '.$anchor->format('d.m.') ?></strong><span><?=count($dayGroups)?> skupin</span></header>
          <div class="planner-operation-list">
            <?php foreach($dayGroups as $g)$renderGroup($g,false);if(!$dayGroups):?><div class="planner-clear-state"><?=ir_visual_icon('check')?><strong>Pro tento den není nic naplánováno.</strong><small>Můžeš přidat úkol nebo zapsat aktivitu rovnou přes Rychlý zápis.</small></div><?php endif;?>
          </div>
        </main>
        <aside class="planner-overdue-column">
          <header><div><?=ir_visual_icon('warning')?><span><strong>Po termínu</strong><small>vyřešit nebo vědomě vynechat</small></span></div><b><?=$overdueCount?></b></header>
          <div class="planner-overdue-list">
            <?php foreach(array_slice($overdueGroups,0,8) as $g)$renderGroup($g,true);if(!$overdueGroups):?><div class="planner-clear-state compact"><?=ir_visual_icon('check')?><strong>Bez zpoždění</strong></div><?php endif;?>
          </div>
          <?php if(count($overdueGroups)>8):?><a class="planner-more" href="tasks.php?view=overdue">Zobrazit všechna zpoždění →</a><?php endif;?>
        </aside>
      </div>

      <footer class="planner-quick-entry">
        <strong>Rychlý zápis aktivity</strong>
        <?php foreach([['Krmení','feeding','Krmení'],['Voda','water','Výměna vody'],['Rosení','mist','Rosení'],['Úklid','cleaning','Čištění'],['Vážení','weight','Vážení'],['Svlek','shedding','Svlek'],['Zdraví','health','Zdravotní kontrola']] as [$label,$icon,$type]):?><a href="quick.php?type=<?=rawurlencode($type)?>"><?=ir_visual_icon($icon)?><span><?=$label?></span></a><?php endforeach;?>
        <a href="voice.php" class="is-voice"><?=ir_visual_icon('quick-add')?><span>Hlas</span></a>
      </footer>
    </section>
    <?php
}
