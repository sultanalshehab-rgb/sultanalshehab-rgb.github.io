/* تقرير PDF وحفظ النتائج — مشترك بين كل الاختبارات
   - يصنع تقرير PDF في المتصفح بهوية سلطان الشهاب (خط دبي، كحلي وفيروزي).
   - يرسل النتيجة إلى خادم Google Apps Script الآمن، وهو الذي يحفظها في Airtable
     ويرسل الإيميل. لا يوجد أي مفتاح أو توكن في هذا الملف.
   الإعداد: ضع رابط تطبيق الويب في SR_API بعد نشر backend/apps-script/Code.gs */
(function(){
"use strict";
var SR_API=""; // مثال: "https://script.google.com/macros/s/XXXX/exec"
var SITE="sultanalshehab-rgb.github.io";
var LIBS=["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
var CUR=null; // {panel, meta, rec:{id,tok}, saving:Promise, pdf:{b64,name,blob}}

/* ---------- styles ---------- */
var css=
'.sr-card{margin-top:28px;padding:20px 22px;border-radius:18px;border:1.5px solid var(--gold);background:var(--gold-soft)}'+
'.sr-card h4{margin:0;font-size:1.1rem}.sr-card>p{margin-top:4px;color:var(--muted);font-size:.92rem}'+
'.sr-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}'+
'.sr-row input[type=email]{flex:1 1 220px;min-width:0;padding:11px 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface)}'+
'.sr-row input[type=email]:focus{border-color:var(--gold);outline:none}'+
'.sr-ok{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:.88rem;color:var(--muted);cursor:pointer}'+
'.sr-ok input{margin-top:6px;accent-color:var(--gold-ink)}'+
'.sr-msg{margin-top:10px;font-size:.9rem;font-weight:600;min-height:1.2em}.sr-msg.err{color:#b91c1c}.sr-msg.ok{color:var(--gold-ink)}'+
'.sr-hp{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;border:0!important;overflow:hidden;clip-path:inset(50%);opacity:0}'+
'.btn[disabled]{opacity:.6;cursor:progress}'+
/* the off-screen A4 sheet (always light theme) */
'.sr-stage{position:fixed;top:0;left:-10000px;z-index:-1;pointer-events:none}'+
'.sr-page{--bg:#f4f6f8;--surface:#ffffff;--ink:#10283a;--muted:#56687a;--line:#dbe3ea;--navy:#0d2436;--navy-2:#153650;--gold:#2dd4bf;--gold-soft:#d5f5f0;--gold-ink:#0f766e;--sadu:#a8402c;--c-d:#c2410c;--c-e:#7c3aed;--c-a:#15803d;--c-t:#1d4ed8;'+
  'width:794px;height:1123px;background:#fff;color:var(--ink);font-family:"Dubai","Segoe UI",Tahoma,sans-serif;font-size:14.5px;line-height:1.75;direction:rtl;position:relative;overflow:hidden;display:flex;flex-direction:column}'+
'.sr-hd{background:linear-gradient(160deg,#153650,#0d2436);color:#eef3f7;padding:26px 44px 22px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex:none}'+
'.sr-brand{display:flex;align-items:center;gap:12px}.sr-brand i{width:34px;height:34px;border-radius:50% 50% 7px 7px;background:#2dd4bf;display:block;flex:none}'+
'.sr-brand b{display:block;font-size:20px;line-height:1.2}.sr-brand small{display:block;color:#a9bccb;font-size:11.5px;margin-top:2px}'+
'.sr-tag{font-size:12px;color:#2dd4bf;font-weight:700;text-align:left;line-height:1.4}'+
'.sr-wave{height:6px;background:linear-gradient(90deg,#2dd4bf,#0f766e);flex:none}'+
'.sr-body{flex:1;padding:22px 44px 0;overflow:hidden}'+
'.sr-cover{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:6px}'+
'.sr-cover .k{font-size:12px;color:var(--muted)}.sr-cover h1{font-size:23px;line-height:1.35;margin:2px 0 0}'+
'.sr-cover .who{text-align:left;font-size:12.5px;color:var(--muted);line-height:1.6}.sr-cover .who b{color:var(--ink);font-size:16px}'+
'.sr-ft{flex:none;margin:0 44px;padding:10px 0 16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}'+
'.sr-ft b{color:#0f766e}'+
/* make the cloned result read well on paper */
'.sr-body .score{margin-top:16px}.sr-body .dims{margin-top:18px;gap:10px}.sr-body .box{margin-top:14px;padding:14px 16px;background:#f7f9fb}'+
'.sr-body .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sr-body .grid2 .box{margin-top:0}.sr-body .sec-gap{margin-top:14px}'+
'.sr-body .bar i{margin-left:auto}.sr-body .dim-row{grid-template-columns:11em 1fr 6em}.sr-body .dim-row b{white-space:nowrap}'+
'.sr-body ul,.sr-body ol{list-style:none!important;padding-inline-start:0!important}.sr-body li{position:relative;padding-inline-start:18px}'+
'.sr-body ul>li::before{content:"";position:absolute;right:2px;top:.72em;width:6px;height:6px;border-radius:50%;background:#0f766e}'+
'.sr-body ol>li{padding-inline-start:26px}.sr-body ol>li>.sr-n{position:absolute;right:0;top:0;font-weight:700;color:#0f766e}.sr-body .disclaimer{margin-top:14px;font-size:11px}'+
'.sr-body .ring{background:none!important;position:relative}.sr-body .ring svg{position:absolute;inset:0}.sr-body .ring>div{position:relative}'+
'.sr-body .cta{display:block;margin-top:16px}.sr-body .cta .btn{display:none}'+
'.sr-body .sr-cta{margin-top:16px;padding:14px 18px;border-radius:14px;background:linear-gradient(160deg,#153650,#0d2436);color:#fff}'+
'.sr-body .sr-cta b{color:#2dd4bf}';
var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);

/* ---------- helpers ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function txt(el){return el?el.textContent.replace(/\s+/g," ").trim():""}
function load(src){return new Promise(function(ok,no){var s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=function(){no(new Error("load "+src))};document.head.appendChild(s)})}
var libs=null;
function ensureLibs(){if(!libs)libs=Promise.all(LIBS.map(load));return libs}
function api(d){
  if(!SR_API)return Promise.resolve(null);
  return fetch(SR_API,{method:"POST",body:JSON.stringify(d)}).then(function(r){return r.json()});
}
function today(){try{return new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-arab",{year:"numeric",month:"long",day:"numeric"})}catch(e){return new Date().toISOString().slice(0,10)}}
function fileName(m){return ("تقرير "+m.title+" - "+m.name).replace(/[\\\/:*?"<>|؟]+/g,"").replace(/\s+/g," ").trim().slice(0,90)+".pdf"}

/* headline = level badge + main heading of the result, unless the test set one */
function headline(panel,m){
  if(m.head)return m.head;
  var lv=txt(panel.querySelector(".score .lvl")),h3=txt(panel.querySelector(".score h3"));
  return [lv,h3].filter(Boolean).join(" — ").slice(0,200);
}

/* ---------- PDF ---------- */
function ringSvg(el){
  var cs=getComputedStyle(el),p=parseFloat(el.style.getPropertyValue("--p"))||0;
  var col=(cs.getPropertyValue("--rc")||"").trim()||"#0f766e";
  if(col.indexOf("var(")===0)col="#0f766e";
  var r=57,c=2*Math.PI*r,len=c*Math.max(0,Math.min(100,p))/100;
  return '<svg viewBox="0 0 130 130" width="130" height="130" aria-hidden="true"><circle cx="65" cy="65" r="'+r+'" fill="none" stroke="#dbe3ea" stroke-width="16"/>'+
    (len>0?'<circle cx="65" cy="65" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="16" stroke-dasharray="'+len.toFixed(2)+' '+c.toFixed(2)+'" transform="rotate(-90 65 65)"/>':'')+'</svg>';
}
function pageShell(m,n){
  var pg=document.createElement("div");pg.className="sr-page";
  pg.innerHTML='<div class="sr-hd"><div class="sr-brand"><i></i><div><b>سلطان الشهاب</b><small>مستشار قيادي وكوتش تنفيذي · خبرة +٢٥ سنة</small></div></div><div class="sr-tag">تقرير نتيجة<br>شخصي</div></div><div class="sr-wave"></div>'+
    '<div class="sr-body"></div>'+
    '<div class="sr-ft"><span>'+esc(m.name)+' · '+esc(m.title)+'</span><span><b>'+SITE+'</b> · صفحة '+n+'</span></div>';
  return pg;
}
function buildPages(panel,m){
  var stage=document.createElement("div");stage.className="sr-stage";document.body.appendChild(stage);
  var src=panel.cloneNode(true);
  [].forEach.call(src.querySelectorAll(".no-print,.actions,.back,.rhead,.sr-card,script"),function(x){x.remove()});
  var live=panel.querySelectorAll(".ring"),cl=src.querySelectorAll(".ring");
  [].forEach.call(cl,function(r,i){if(live[i])r.insertAdjacentHTML("afterbegin",ringSvg(live[i]))});
  [].forEach.call(src.querySelectorAll("ol"),function(ol){[].forEach.call(ol.children,function(li,i){li.insertAdjacentHTML("afterbegin",'<span class="sr-n">'+(i+1).toLocaleString("ar-EG")+'.</span>')})});
  var blocks=[].slice.call(src.children);
  var cover=document.createElement("div");cover.className="sr-cover";
  cover.innerHTML='<div><div class="k">تقرير اختبار</div><h1>'+esc(m.title)+'</h1></div><div class="who">أُعدّ لـ<br><b>'+esc(m.name)+'</b>'+(m.org?'<br>'+esc(m.org):'')+'<br>'+today()+'</div>';
  var cta=document.createElement("div");cta.className="sr-cta";
  cta.innerHTML='<b>خطوتك التالية:</b> في جلسة كوتشنج مع سلطان الشهاب نقرأ نتيجتك معاً ونحولها إلى خطة واضحة. احجز من الموقع: '+SITE;
  blocks.unshift(cover);
  var dIdx=blocks.length;while(dIdx>1&&blocks[dIdx-1].classList&&blocks[dIdx-1].classList.contains("disclaimer"))dIdx--;
  blocks.splice(dIdx,0,cta);
  var pages=[],n=0,pg,body;
  function newPage(){n++;pg=pageShell(m,n);stage.appendChild(pg);body=pg.querySelector(".sr-body");pages.push(pg)}
  newPage();
  blocks.forEach(function(b){
    body.appendChild(b);
    if(body.scrollHeight>body.clientHeight+1&&body.children.length>1){body.removeChild(b);newPage();body.appendChild(b)}
  });
  return {stage:stage,pages:pages};
}
function makePdf(){
  if(CUR.pdf)return Promise.resolve(CUR.pdf);
  var m=CUR.meta;
  return ensureLibs().then(function(){return document.fonts?document.fonts.ready:null}).then(function(){
    var b=buildPages(CUR.panel,m),JS=window.jspdf.jsPDF;
    var doc=new JS({unit:"pt",format:"a4",compress:true});
    var W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    var chain=Promise.resolve();
    b.pages.forEach(function(p,i){
      chain=chain.then(function(){return window.html2canvas(p,{scale:1.7,backgroundColor:"#ffffff",useCORS:true,logging:false,width:794,height:1123,windowWidth:1200})})
        .then(function(cv){if(i)doc.addPage();doc.addImage(cv.toDataURL("image/jpeg",0.82),"JPEG",0,0,W,H,undefined,"FAST")});
    });
    return chain.then(function(){
      b.stage.remove();
      doc.setProperties({title:"تقرير "+m.title+" - "+m.name,author:"سلطان الشهاب",creator:SITE});
      var uri=doc.output("datauristring");
      CUR.pdf={b64:uri.slice(uri.indexOf(",")+1),name:fileName(m),blob:doc.output("blob")};
      return CUR.pdf;
    },function(e){b.stage.remove();throw e});
  });
}
function download(p){
  var a=document.createElement("a");a.href=URL.createObjectURL(p.blob);a.download="SultanAlshehab-Report-"+CUR.meta.id+".pdf";document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},4000);
}

/* ---------- public API used by tests.html ---------- */
function card(){
  return '<div class="sr-card no-print" id="sr-card"><h4>تقريرك PDF باسمك</h4>'+
    '<p>'+(SR_API?'نرسل لك تقريراً مرتباً بنتيجتك وتفاصيلها على بريدك، أو حمّله مباشرة.':'حمّل تقريراً مرتباً بنتيجتك وتفاصيلها باسمك.')+'</p>'+
    (SR_API?'<div class="sr-row"><input type="email" id="sr-em" autocomplete="email" inputmode="email" maxlength="120" placeholder="بريدك الإلكتروني" aria-label="بريدك الإلكتروني">'+
    '<input class="sr-hp" id="sr-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'+
    '<button class="btn" data-sr="send">أرسل التقرير لبريدي</button></div>'+
    '<label class="sr-ok"><input type="checkbox" id="sr-ok"><span>أوافق على حفظ نتيجتي لاستخدامها مستقبلاً في حال رغبتي بذلك.</span></label>':'')+
    '<div class="sr-row"><button class="btn dark" data-sr="dl">حمّل التقرير PDF</button></div>'+
    '<p class="sr-msg" id="sr-msg" role="status" aria-live="polite"></p></div>';
}
function onResult(panel,meta){
  CUR={panel:panel,meta:meta,rec:null,pdf:null};
  meta.headline=headline(panel,meta);
  if(!SR_API)return;
  var me=CUR;
  me.saving=api({action:"save",test_id:meta.id,test_title:meta.title,name:meta.name,org:meta.org||"",headline:meta.headline,summary:meta.summary||"",scores:meta.scores?JSON.stringify(meta.scores):"",page:location.href.slice(0,300)})
    .then(function(r){if(r&&r.ok)me.rec={id:r.id,tok:r.tok};return me.rec},function(){return null});
}
function msg(t,cls){var el=document.getElementById("sr-msg");if(el){el.textContent=t;el.className="sr-msg"+(cls?" "+cls:"")}}
function busy(b,on,label){if(!b)return;if(on){b.dataset.l=b.textContent;b.textContent=label;b.disabled=true}else{b.textContent=b.dataset.l||b.textContent;b.disabled=false}}

document.addEventListener("click",function(e){
  var b=e.target.closest("[data-sr]");if(!b||!CUR)return;
  var a=b.dataset.sr;
  if(a==="dl"){
    busy(b,true,"جارٍ تجهيز التقرير...");msg("");
    makePdf().then(function(p){download(p);busy(b,false);msg("تم تحميل تقريرك.","ok")},function(){busy(b,false);msg("تعذر تجهيز التقرير هنا، سنفتح لك نافذة الطباعة لحفظه PDF.","err");setTimeout(function(){window.print()},600)});
    return;
  }
  if(a==="send"){
    var em=(document.getElementById("sr-em").value||"").trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){msg("اكتب بريداً إلكترونياً صحيحاً.","err");document.getElementById("sr-em").focus();return}
    var ok=document.getElementById("sr-ok").checked,hp=document.getElementById("sr-hp").value,m=CUR.meta,me=CUR;
    busy(b,true,"جارٍ الإرسال...");msg("نجهّز تقريرك ونرسله...");
    Promise.all([makePdf(),me.saving||Promise.resolve(null)]).then(function(r){
      var p=r[0],rec=r[1]||{};
      return api({action:"email",id:rec.id||"",tok:rec.tok||"",email:em,consent:ok,hp:hp,
        test_id:m.id,test_title:m.title,name:m.name,org:m.org||"",headline:m.headline,summary:m.summary||"",scores:m.scores?JSON.stringify(m.scores):"",
        pdf:p.b64,filename:p.name});
    }).then(function(r){
      busy(b,false);
      if(r&&r.ok){msg("وصل تقريرك إلى "+em+". إذا ما لقيته، شيّك على مجلد الرسائل غير المرغوبة.","ok");b.disabled=true}
      else msg((r&&r.msg)||"تعذر الإرسال الآن. حمّل التقرير مباشرة من الزر تحت.","err");
    },function(){busy(b,false);msg("تعذر الإرسال الآن. حمّل التقرير مباشرة من الزر تحت.","err")});
  }
});

window.SR={card:card,onResult:onResult,enabled:function(){return !!SR_API}};
})();
