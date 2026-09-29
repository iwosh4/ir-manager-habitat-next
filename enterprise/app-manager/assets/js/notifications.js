(() => {
  const button=document.querySelector('[data-notification-toggle]'),panel=document.querySelector('[data-notification-panel]');
  if(!button||!panel)return;
  let busy=false;
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  async function load(body){
    if(busy)return;busy=true;button.setAttribute('aria-busy','true');
    try{
      const response=await fetch('notifications.php',body?{method:'POST',body}:{});
      if(!response.ok)throw new Error();const data=await response.json();
      const badge=button.querySelector('.notification-badge');badge.textContent=data.unread>99?'99+':data.unread;badge.hidden=!data.unread;
      const list=panel.querySelector('[data-notification-list]');list.replaceChildren();
      if(!data.items.length)list.append(text('p','Zatím nemáš žádná oznámení.'));
      for(const item of data.items){
        const row=document.createElement('article');row.className=Number(item.precteno)?'is-read':'is-unread';
        const title=text(item.url?'a':'strong',item.titulek);if(item.url){title.href=item.url;title.addEventListener('click',async e=>{if(Number(item.precteno))return;e.preventDefault();const form=new FormData();form.set('_csrf',panel.dataset.csrf);form.set('id',item.id);form.set('read','1');await load(form);location.assign(item.url);});}
        row.append(title,text('p',item.zprava||''),text('small',item.created_at));
        const toggle=text('button',Number(item.precteno)?'Označit jako nepřečtené':'Označit jako přečtené');toggle.type='button';
        toggle.onclick=()=>{const form=new FormData();form.set('_csrf',panel.dataset.csrf);form.set('id',item.id);form.set('read',Number(item.precteno)?'0':'1');load(form);};row.append(toggle);list.append(row);
      }
    }catch{panel.querySelector('[data-notification-list]').replaceChildren(text('p','Oznámení se nepodařilo načíst. Použij Obnovit.'));}
    finally{busy=false;button.removeAttribute('aria-busy');}
  }
  const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)load();};
  panel.querySelector('[data-notification-refresh]').onclick=()=>load();
  document.addEventListener('click',e=>{if(!e.target.closest('.notification-wrap'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
})();
