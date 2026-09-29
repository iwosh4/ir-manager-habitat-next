/* Progressive enhancement of read-only data cells. Existing form actions stay intact. */
(()=>{'use strict';document.querySelectorAll('table.data-table').forEach(table=>{
 if(table.closest('#sale-calc')||table.dataset.enhanced||table.dataset.noEnhance==='1'||!table.tBodies[0])return;
 const body=table.tBodies[0],rows=[...body.rows].filter(r=>r.cells.length>1);
 if(rows.length<2)return;table.dataset.enhanced='1';let page=0,sort=-1,direction=1,ordered=rows;
 const bar=document.createElement('div');bar.className='module-toolbar table-tools';
 const search=document.createElement('input');search.type='search';search.placeholder='Hledat v načtené tabulce';search.setAttribute('aria-label','Hledat v načtené tabulce');
 const size=document.createElement('select');size.setAttribute('aria-label','Řádků na stránku');[25,50,100].forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n+' řádků';size.append(o);});
 const prev=document.createElement('button'),next=document.createElement('button'),status=document.createElement('span');prev.type=next.type='button';prev.textContent='← Předchozí';next.textContent='Další →';status.setAttribute('aria-live','polite');bar.append(search,size,prev,next,status);table.parentElement.before(bar);
 const text=r=>r.textContent.toLocaleLowerCase('cs');
 function render(){const selected=ordered.filter(r=>text(r).includes(search.value.toLocaleLowerCase('cs'))),n=Number(size.value);page=Math.max(0,Math.min(page,Math.ceil(selected.length/n)-1));rows.forEach(r=>r.hidden=true);selected.slice(page*n,page*n+n).forEach(r=>{r.hidden=false;body.append(r);});prev.disabled=page===0;next.disabled=(page+1)*n>=selected.length;status.textContent=selected.length?`${page*n+1}–${Math.min((page+1)*n,selected.length)} z ${selected.length} načtených řádků`:'Žádné odpovídající řádky';}
 search.oninput=()=>{page=0;render();};size.onchange=()=>{page=0;render();};prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
 [...(table.tHead?.rows[0]?.cells||[])].forEach((th,index)=>{const label=th.textContent.trim();if(!label||label==='Akce')return;const button=document.createElement('button');button.type='button';button.className='table-sort';button.textContent=label+' ↕';button.onclick=()=>{direction=sort===index?-direction:1;sort=index;ordered=[...rows].sort((a,b)=>a.cells[index].textContent.trim().localeCompare(b.cells[index].textContent.trim(),'cs',{numeric:true})*direction);table.querySelectorAll('th').forEach(h=>h.removeAttribute('aria-sort'));th.setAttribute('aria-sort',direction===1?'ascending':'descending');page=0;render();};th.replaceChildren(button);});render();
});})();
