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
    bar.innerHTML='<div class="mz-cc-inner"><p>이 사이트는 맞춤 광고와 통계를 위해 쿠키를 사용할 수 있습니다. 자세한 내용은 <a href="/pages/privacy.html">개인정보처리방침</a>을 확인하세요.</p><div class="mz-cc-btns"><button type="button" id="mz-cc-ess">필수만</button><button type="button" id="mz-cc-ok">동의</button></div></div>';
    document.body.appendChild(bar);
    document.getElementById('mz-cc-ok').addEventListener('click',function(){grant('granted');});
    document.getElementById('mz-cc-ess').addEventListener('click',function(){grant('denied');});
  }
  if(document.readyState!=='loading') build(); else document.addEventListener('DOMContentLoaded',build);
})();
