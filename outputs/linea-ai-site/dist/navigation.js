"use strict";
const menu=document.querySelector('.menu-toggle'),panel=document.querySelector('#account-nav'),account=document.querySelector('.account-menu');
function closeAccount(){if(!menu||!panel)return;menu.setAttribute('aria-expanded','false');panel.hidden=true;}
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!open));panel.hidden=open;});
panel?.addEventListener('click',event=>{if(event.target.closest('a'))closeAccount();});
document.addEventListener('click',event=>{if(account&&!account.contains(event.target))closeAccount();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){closeAccount();menu.focus();}});
account?.addEventListener('focusout',event=>{if(!account.contains(event.relatedTarget))closeAccount();});

// A reload of the home starts at the top instead of restoring its last section.
const pageNavigation=performance.getEntriesByType('navigation')[0];
if(pageNavigation?.type==='reload'){
 history.scrollRestoration='manual';
 if(location.hash)history.replaceState(history.state,'',location.pathname+location.search);
 const showHomeStart=()=>window.scrollTo({top:0,left:0,behavior:'instant'});
 showHomeStart();
 window.addEventListener('pageshow',()=>{
  showHomeStart();
  requestAnimationFrame(()=>requestAnimationFrame(showHomeStart));
 },{once:true});
}
