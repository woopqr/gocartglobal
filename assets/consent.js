(function(){
  try{ if(localStorage.getItem('mz-consent')) return; }catch(e){}
  function grant(v){
    try{localStorage.setItem('mz-consent', v);}catch(e){}
    if(v==='granted' && typeof gtag==='function'){ gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'}); }
    var b=document.getElementById('mz-consent-bar'); if(b&&b.parentNode) b.parentNode.removeChild(b);
  }
  function build(){
    if(document.getElementById('mz-consent-bar')) return;
    var bar=document.createElement('div'); bar.id='mz-consent-bar';
    bar.innerHTML='<div class="mz-cc-inner"><p>This site may use cookies for personalized ads and analytics. See our <a href="/pages/privacy.html">Privacy Policy</a> for details.</p><div class="mz-cc-btns"><button type="button" id="mz-cc-ess">Essential only</button><button type="button" id="mz-cc-ok">Accept</button></div></div>';
    document.body.appendChild(bar);
    document.getElementById('mz-cc-ok').addEventListener('click',function(){grant('granted');});
    document.getElementById('mz-cc-ess').addEventListener('click',function(){grant('denied');});
  }
  if(document.readyState!=='loading') build(); else document.addEventListener('DOMContentLoaded',build);
})();
