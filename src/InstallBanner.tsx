import {useEffect,useState} from 'react';

type InstallEvent={prompt:()=>Promise<void>};

export default function InstallBanner(){
 const [evt,setEvt]=useState<InstallEvent|null>(null);
 const [show,setShow]=useState(false);
 const [ios,setIos]=useState(false);

 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as unknown as {standalone?:boolean}).standalone===true;
  if(standalone)return;
  setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
  setShow(true);
  const onPrompt=(e:Event)=>{e.preventDefault();setEvt(e as unknown as InstallEvent)};
  const onInstalled=()=>setShow(false);
  window.addEventListener('beforeinstallprompt',onPrompt);
  window.addEventListener('appinstalled',onInstalled);
  return ()=>{window.removeEventListener('beforeinstallprompt',onPrompt);window.removeEventListener('appinstalled',onInstalled)};
 },[]);

 if(!show)return null;

 const install=async()=>{
  if(evt){await evt.prompt();setEvt(null);return}
  alert('Chrome ke menu (⋮) mein "Install app" ya "Add to Home screen" chunein.');
 };

 return <div style={{margin:'12px 16px',padding:'12px 14px',borderRadius:12,background:'linear-gradient(135deg,#1a0a0d,#2a0f14)',border:'1px solid #c9a24a',color:'#f5ecd7',display:'flex',alignItems:'center',gap:10}}>
  <div style={{flex:1,fontSize:14,lineHeight:1.4}}>
   <b style={{color:'#e0b75a'}}>Royal Blade ki app download karein</b>
   <div style={{fontSize:12,opacity:0.85}}>{ios?'Safari mein neeche Share (↑) button dabayein, phir "Add to Home Screen" chunein.':'Home screen par app ki tarah rakhein, tez aur aasan booking ke liye.'}</div>
  </div>
  {!ios&&<button onClick={install} style={{background:'#c9a24a',color:'#1a0a0d',border:'none',borderRadius:8,padding:'8px 12px',fontWeight:700,cursor:'pointer'}}>Download</button>}
  <button onClick={()=>setShow(false)} aria-label="Close" style={{background:'transparent',color:'#f5ecd7',border:'none',fontSize:18,cursor:'pointer'}}>×</button>
 </div>;
}
