"use strict";
const ids = ["bridgeKey","outputDeviceId","includeMic","micDeviceId","monitorAi","model","voice","mode","instructions","consentConfirmed"];
const $ = id => document.getElementById(id);
const defaults = { bridgeKey:"",outputDeviceId:"",includeMic:true,micDeviceId:"",monitorAi:true,model:"gpt-realtime-2.1-mini",voice:"marin",mode:"manual",instructions:"",consentConfirmed:false };
let oldState = null;
function toast(msg, bad=false) { $("toast").textContent=msg; $("toast").style.color=bad?"#b83431":"#087c59"; }
function readSettings() { const result={}; for(const id of ids) result[id]=$(id).type==="checkbox"?$(id).checked:$(id).value; return result; }
async function save() { await chrome.storage.local.set(readSettings()); toast("Salvo. Para iniciar selecione a guia da reunião e clique no ícone da extensão."); }
function setOption(select,val,label) { if(!val)return; if(![...select.options].some(o=>o.value===val)){const opt=document.createElement("option");opt.value=val;opt.textContent=label||"Dispositivo anterior";select.appendChild(opt);} select.value=val; }
async function devices(ask=false){
 let mic;
 try {
   if(ask) mic=await navigator.mediaDevices.getUserMedia({audio:true});
   const list=await navigator.mediaDevices.enumerateDevices();
   for(const [id,kind,placeholder] of [["outputDeviceId","audiooutput","Selecione CABLE Input (VB-Audio Virtual Cable)"],["micDeviceId","audioinput","Microfone padrão do Windows"]]){
     const node=$(id), prev=node.value;node.replaceChildren();
     const blank=document.createElement("option");blank.value="";blank.textContent=placeholder;node.appendChild(blank);
     for(const d of list.filter(d=>d.kind===kind)){const opt=document.createElement("option");opt.value=d.deviceId;opt.textContent=d.label||"Dispositivo sem nome";node.appendChild(opt);}
     if(prev) setOption(node,prev);
     else if(kind==="audiooutput"){const found=[...node.options].find(o=>/CABLE Input|VB-Audio|Virtual Cable/i.test(o.textContent));if(found){node.value=found.value;toast("CABLE Input detectado. Clique Salvar.");}}
   }
   if(ask)toast("Dispositivos detectados. Escolha o microfone físico e a saída CABLE Input.");
 }catch(e){toast("Permissão/dispositivo: "+e.message,true);}
 finally{if(mic)mic.getTracks().forEach(t=>t.stop());}
}
async function health(){try{const r=await fetch("http://127.0.0.1:8787/health",{cache:"no-store"});const x=await r.json();$("healthResult").textContent=x.ok?(x.apiConfigured?"Servidor e API configurados":"Servidor ativo, falta API key"):"Servidor indisponível";}catch{$("healthResult").textContent="Servidor offline. Execute start-windows.bat.";}}
async function command(type,text=""){try{const r=await chrome.runtime.sendMessage({target:"worker",type,text});if(!r||!r.ok)throw Error(r?.error||"Comando falhou");toast(type==="STOP"?"Sessão encerrada":"Comando enviado");await refresh();}catch(e){toast(e.message,true);}}
async function refresh(){try{const r=await chrome.runtime.sendMessage({target:"worker",type:"GET_STATE"});if(!r?.ok)return;const s=r.state;if(JSON.stringify(s)===JSON.stringify(oldState))return;oldState=s;const running=!!s.running;$("status").textContent=s.status==="conectado"?"Conectado à reunião":s.status||"Parado";$("meeting").textContent=s.meeting?"Reunião: "+s.meeting:"";$("dot").className=running?"connected":s.error?"error":"";$("error").hidden=!s.error;$("error").textContent=s.error||"";$("stop").disabled=!running;$("send").disabled=!running;$("respond").disabled=!running;$("transcript").textContent=s.lastText?"IA: "+s.lastText:"";}catch{$("status").textContent="Aguardando extensão";}}
async function testTone(){const device=$("outputDeviceId").value;if(!device)return toast("Selecione CABLE Input.",true);let ctx,player;try{ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=700;gain.gain.value=.06;osc.connect(gain).connect(dest);player=new Audio();player.srcObject=dest.stream;await player.setSinkId(device);await player.play();osc.start();osc.stop(ctx.currentTime+.65);toast("Tom enviado ao CABLE Input por 0,65s. Verifique o medidor CABLE Output no Meet/Teams.");await new Promise(r=>setTimeout(r,900));}catch(e){toast("Teste de áudio: "+e.message,true);}finally{if(player){player.pause();player.srcObject=null;}if(ctx)await ctx.close().catch(()=>{});}}
async function main(){
 const settings={...defaults,...await chrome.storage.local.get(defaults)};
 for(const id of ids){const node=$(id);if(node.type==="checkbox")node.checked=!!settings[id];else if(node.tagName==="SELECT")setOption(node,settings[id]);else node.value=settings[id];}
 await devices();
 $("save").addEventListener("click",save);$("devices").addEventListener("click",()=>devices(true));$("testTone").addEventListener("click",testTone);$("health").addEventListener("click",health);$("stop").addEventListener("click",()=>command("STOP"));$("respond").addEventListener("click",()=>command("RESPOND"));
 $("send").addEventListener("click",async()=>{const txt=$("promptText").value.trim();if(!txt)return toast("Digite uma instrução.",true);await command("RESPOND",txt);$("promptText").value="";});
 chrome.storage.onChanged.addListener((x,area)=>{if(area==="session"&&x.bridgeState)refresh();});
 await Promise.all([health(),refresh()]);
}
main().catch(e=>toast(e.message,true));
