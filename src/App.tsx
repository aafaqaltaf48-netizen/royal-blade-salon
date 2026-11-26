import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import InstallBanner from './InstallBanner';
import {ArrowUpRight,CalendarDays,CalendarOff,CheckCircle2,ChevronRight,Clock,Crown,LogOut,MapPin,MessageCircle,Phone,Plus,Scissors,Settings,ShieldCheck,X} from 'lucide-react';

type Tab='home'|'services'|'book'|'login'|'owner';
type Service={id:string,name:string,category:string,description:string,price_inr:number,duration_minutes:number,discount_percent:number,is_active:boolean};
type Barber={id:string,name:string};
type Hours={open_time:string,close_time:string};
type Booking={id:string,customer_name:string,customer_phone:string,service_id:string,starts_at:string,status:string,price_inr:number};
type Draft={id?:string,name:string,category:string,description:string,price_inr:number,duration_minutes:number,discount_percent:number,is_active:boolean};

const PHONE='9596414560';
const supabase=createClient(import.meta.env.VITE_SUPABASE_URL as string,import.meta.env.VITE_SUPABASE_KEY as string);
const images:Record<string,string>={'Signature Haircut':'/services/signature-haircut.jpg','Beard Sculpting':'/services/beard-sculpting.jpg','Royal Grooming Ritual':'/services/royal-grooming-ritual.jpg','Deep Cleansing Facial':'/services/deep-cleansing-facial.jpg','Hair Wash & Styling':'/services/hair-wash-styling.jpg','Hair Colour':'/services/hair-colour.jpg'};
const imageFor=(n:string)=>images[n]||'/services/signature-haircut.jpg';
const finalPrice=(s:{price_inr:number,discount_percent:number})=>Math.round(s.price_inr*(100-s.discount_percent)/100);
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const istISO=(d:string,t:string)=>new Date(`${d}T${t}:00+05:30`).toISOString();
const pad=(n:number)=>String(n).padStart(2,'0');
const buildSlots=(h:Hours)=>{const out:string[]=[];let cur=Number(h.open_time.slice(0,2))*60+Number(h.open_time.slice(3,5));const end=Number(h.close_time.slice(0,2))*60+Number(h.close_time.slice(3,5));while(cur+30<=end){out.push(`${pad(Math.floor(cur/60))}:${pad(cur%60)}`);cur+=30}return out};
const whenText=(iso:string)=>new Date(iso).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const blankDraft:Draft={name:'',category:'Haircuts',description:'',price_inr:0,duration_minutes:30,discount_percent:0,is_active:true};

export default function App(){
 const [tab,setTab]=useState<Tab>('home');
 const [services,setServices]=useState<Service[]>([]);
 const [barbers,setBarbers]=useState<Barber[]>([]);
 const [closures,setClosures]=useState<string[]>([]);
 const [hours,setHours]=useState<Hours>({open_time:'09:00',close_time:'20:00'});
 const [taken,setTaken]=useState<Record<number,number>>({});
 const [bookings,setBookings]=useState<Booking[]>([]);
 const [isOwner,setIsOwner]=useState(false);
 const [selected,setSelected]=useState('');
 const [name,setName]=useState('');
 const [phone,setPhone]=useState('');
 const [date,setDate]=useState(today());
 const [time,setTime]=useState('');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [editing,setEditing]=useState<Draft|null>(null);
 const [closeDate,setCloseDate]=useState(today());
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);

 const active=services.filter(s=>s.is_active);
 const current=active.find(s=>s.id===selected)||active[0];
 const slots=useMemo(()=>buildSlots(hours),[hours]);
 const closedToday=closures.includes(date);

 const loadPublic=async()=>{
  const [s,b,c,h]=await Promise.all([
   supabase.from('services').select('*').order('created_at'),
   supabase.from('barbers').select('id,name').eq('is_active',true).order('name'),
   supabase.from('shop_closures').select('closed_date'),
   supabase.from('settings').select('open_time,close_time').eq('id',1).single()]);
  if(s.data)setServices(s.data as Service[]);
  if(b.data)setBarbers(b.data as Barber[]);
  if(c.data)setClosures(c.data.map((r:{closed_date:string})=>r.closed_date));
  if(h.data)setHours({open_time:String(h.data.open_time),close_time:String(h.data.close_time)});
 };

 const loadSlots=async(d:string)=>{
  const {data}=await supabase.rpc('slot_counts',{p_day:d});
  const m:Record<number,number>={};
  ((data||[]) as {starts_at:string,taken:number}[]).forEach(r=>{m[new Date(r.starts_at).getTime()]=r.taken});
  setTaken(m);
 };

 const loadOwner=async()=>{
  const {data}=await supabase.from('bookings').select('id,customer_name,customer_phone,service_id,starts_at,status,price_inr').order('starts_at',{ascending:false}).limit(200);
  setBookings((data||[]) as Booking[]);
 };

 useEffect(()=>{
  loadPublic();
  supabase.auth.getSession().then(async({data})=>{
   if(!data.session)return;
   const {data:ok}=await supabase.rpc('is_owner');
   if(ok)setIsOwner(true);
  });
 },[]);

 useEffect(()=>{loadSlots(date);setTime('')},[date,barbers.length]);
 useEffect(()=>{if(isOwner)loadOwner()},[isOwner]);

 const bookNow=async()=>{
  const digits=phone.replace(/\D/g,'');
  if(!current||name.trim().length<2||digits.length<10){setNotice('Please enter your name (at least 2 letters) and a 10-digit phone number.');return}
  if(!time){setNotice('Please choose a time.');return}
  if(closedToday){setNotice('The salon is closed on this date. Please choose another date.');return}
  if(barbers.length===0){setNotice('Online booking is not ready yet. Please call the salon.');return}
  setBusy(true);setNotice('');
  const start=istISO(date,time);
  const end=new Date(new Date(start).getTime()+current.duration_minutes*60000).toISOString();
  let ok=false;let lastError='';
  for(const b of barbers){
   const {error}=await supabase.from('bookings').insert({customer_name:name.trim(),customer_phone:digits,service_id:current.id,barber_id:b.id,starts_at:start,ends_at:end,price_inr:finalPrice(current),status:'confirmed'});
   if(!error){ok=true;break}
   if(error.code!=='23P01'){lastError=error.message;break}
  }
  setBusy(false);
  if(ok){setName('');setPhone('');setTime('');setNotice('Your appointment is booked. See you at the salon!');loadSlots(date);return}
  setNotice(lastError?`Booking failed: ${lastError}`:'That time has just been taken. Please choose another time.');
  loadSlots(date);
 };

 const login=async()=>{
  setBusy(true);setNotice('');
  const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(error){setBusy(false);setNotice('Sign-in failed. Check your email and password.');return}
  const {data:ok}=await supabase.rpc('is_owner');
  setBusy(false);
  if(!ok){await supabase.auth.signOut();setNotice('This account does not have owner access.');return}
  setPassword('');setIsOwner(true);setTab('owner');
 };

 const logout=async()=>{await supabase.auth.signOut();setIsOwner(false);setBookings([]);setTab('home')};

 const saveService=async()=>{
  if(!editing)return;
  const row={name:editing.name.trim(),category:editing.category.trim()||'Services',description:editing.description,price_inr:editing.price_inr,duration_minutes:editing.duration_minutes,discount_percent:editing.discount_percent,is_active:editing.is_active};
  if(!row.name){setNotice('Service name is required.');return}
  const res=editing.id?await supabase.from('services').update(row).eq('id',editing.id):await supabase.from('services').insert(row);
  if(res.error){setNotice(res.error.message);return}
  setEditing(null);setNotice('');loadPublic();
 };

 const setStatus=async(id:string,status:string)=>{await supabase.from('bookings').update({status}).eq('id',id);loadOwner();loadSlots(date)};

 const toggleClosed=async(d:string)=>{
  if(closures.includes(d)){await supabase.from('shop_closures').delete().eq('closed_date',d)}
  else{await supabase.from('shop_closures').insert({closed_date:d})}
  loadPublic();
 };

 const saveHours=async()=>{
  const {error}=await supabase.from('settings').update({open_time:hours.open_time,close_time:hours.close_time}).eq('id',1);
  setNotice(error?error.message:'Opening hours saved.');
 };

 const whatsapp=`https://wa.me/91${PHONE}?text=${encodeURIComponent('Hello ROYAL BLADE SALON, I want to enquire about an appointment.')}`;

 return <div className="app">
  <header><div className="brand" onClick={()=>setTab('home')}><div className="mark"><Crown size={24}/></div><div><div className="brandname">ROYAL BLADE</div><small>SALON · SOGAM, LOLAB</small></div></div><button className="ownerlink" onClick={()=>setTab(isOwner?'owner':'login')}><Settings size={17}/> Owner</button></header>

 <InstallBanner/>
 {tab==='home'&&<><div className="location"><MapPin size={16}/> Sogam, Lolab, Kupwara <span>• BY APPOINTMENT</span></div><section className="hero"><img src="/hero-barber.png" alt="Barber shaping a precision fade haircut"/><div className="shade"/><div className="herotext"><p className="eyebrow">A CUT ABOVE THE ORDINARY</p><h1>Royal Blade Salon.<br/><em>Your signature style.</em></h1><p>Precision cuts. Refined grooming.<br/>A little time for yourself, a lasting impression.</p><button className="goldbtn" onClick={()=>setTab('book')}>BOOK AN APPOINTMENT <ArrowUpRight size={17}/></button></div></section><div className="perks"><div><Scissors/><b>Expert craftsmanship</b><small>Every detail considered</small></div><div><ShieldCheck/><b>Hygiene comes first</b><small>Fresh tools. Complete care.</small></div><div><CalendarDays/><b>Your time, respected</b><small>Easy appointments</small></div></div><section className="section"><div className="eyebrow">THE GROOMING COLLECTION</div><div className="sectionhead"><h2>Our signature services</h2><button className="textbtn" onClick={()=>setTab('services')}>View all ↗</button></div><div className="servicegrid">{active.slice(0,3).map(s=><ServiceCard key={s.id} s={s} choose={()=>{setSelected(s.id);setTab('book')}}/>)}</div></section><section className="visit"><div><div className="eyebrow">YOUR NEIGHBOURHOOD. YOUR SALON.</div><h2>A royal experience,<br/>close to home.</h2><p>Sogam, Lolab, Kupwara, Jammu &amp; Kashmir, India</p><a href={`tel:+91${PHONE}`}><Phone size={16}/> Call salon</a> <a href={whatsapp}><MessageCircle size={16}/> WhatsApp</a></div><div className="visitnote"><span className="visitline"/><b>ROYAL BLADE SALON</b><small>PRECISION · STYLE · CRAFT</small><span className="visitline"/></div></section></>}

 {tab==='services'&&<section className="section page"><div className="eyebrow">THE GROOMING COLLECTION</div><h1 className="pagetitle">Find your signature.</h1><div className="servicegrid">{active.map(s=><ServiceCard key={s.id} s={s} choose={()=>{setSelected(s.id);setTab('book')}}/>)}</div></section>}

 {tab==='book'&&<section className="section page"><div className="eyebrow">RESERVE YOUR TIME</div><h1 className="pagetitle">Book an appointment.</h1><div className="formcard"><label>Choose a service</label><div className="choicegrid">{active.map(s=><button className={`choice ${current?.id===s.id?'chosen':''}`} key={s.id} onClick={()=>setSelected(s.id)}><img src={imageFor(s.name)} alt={s.name}/><span><b>{s.name}</b><small>₹{finalPrice(s)} · {s.duration_minutes} min</small></span></button>)}</div>
  <label>Your name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your full name"/>
  <label>Phone number</label><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="numeric" placeholder="10-digit mobile number"/>
  <label>Appointment date</label><input type="date" min={today()} value={date} onChange={e=>setDate(e.target.value)}/>
  {closedToday?<p className="closed"><CalendarOff size={16}/> Salon is closed on this date. Choose another day.</p>:<><label>Available time</label><div className="timegrid">{slots.map(t=>{const ms=new Date(istISO(date,t)).getTime();const full=(taken[ms]||0)>=Math.max(barbers.length,1);const past=ms<Date.now();return <button key={t} disabled={full||past} className={time===t?'chosen':''} onClick={()=>setTime(t)}>{t}{full?' (full)':''}</button>})}</div></>}
  <div className="total"><span>Total</span><b>₹{current?finalPrice(current):0}</b></div>
  <button className="goldbtn full" disabled={busy||closedToday} onClick={bookNow}>{busy?'BOOKING…':'BOOK APPOINTMENT'} <ChevronRight size={17}/></button>
  {notice&&<p className="notice">{notice}</p>}</div></section>}

 {tab==='login'&&!isOwner&&<section className="section page"><div className="eyebrow">PRIVATE MANAGEMENT</div><h1 className="pagetitle">Owner sign in.</h1><div className="formcard"><label>Owner email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Owner email"/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/><button className="goldbtn full" disabled={busy} onClick={login}>{busy?'SIGNING IN…':'SIGN IN'}</button>{notice&&<p className="notice">{notice}</p>}</div></section>}

 {tab==='owner'&&isOwner&&<section className="section page"><div className="eyebrow">PRIVATE MANAGEMENT</div><h1 className="pagetitle">Owner dashboard.</h1>
  <div className="ownerstats"><div><small>Bookings</small><b>{bookings.length}</b></div><div><small>Confirmed</small><b>{bookings.filter(b=>b.status==='confirmed').length}</b></div><div><small>Active services</small><b>{active.length}</b></div></div>
  {notice&&<p className="notice">{notice}</p>}
  <div className="adminbox"><div className="sectionhead"><h2>Services &amp; pricing</h2><button className="goldmini" onClick={()=>setEditing({...blankDraft})}><Plus size={15}/> Add service</button></div>
   {services.map(s=><div className="adminrow" key={s.id}><div><b>{s.name}</b><small>₹{s.price_inr} · {s.duration_minutes} min{s.discount_percent>0?` · ${s.discount_percent}% off`:''}{s.is_active?'':' · hidden'}</small></div><button onClick={()=>setEditing({id:s.id,name:s.name,category:s.category,description:s.description,price_inr:s.price_inr,duration_minutes:s.duration_minutes,discount_percent:s.discount_percent,is_active:s.is_active})}>Edit</button></div>)}
   <small className="hint">Price changes apply to new bookings only. Existing bookings keep their original price.</small></div>
  <div className="adminbox"><h2>Opening hours</h2><div className="hours"><label>Opens<input type="time" value={hours.open_time.slice(0,5)} onChange={e=>setHours({...hours,open_time:e.target.value})}/></label><label>Closes<input type="time" value={hours.close_time.slice(0,5)} onChange={e=>setHours({...hours,close_time:e.target.value})}/></label></div><button className="outline full" onClick={saveHours}>Save hours</button></div>
  <div className="adminbox"><h2>Closed dates</h2><label>Pick a date</label><input type="date" value={closeDate} onChange={e=>setCloseDate(e.target.value)}/><button className="outline full" onClick={()=>toggleClosed(closeDate)}>{closures.includes(closeDate)?'Reopen this date':'Mark this date closed'}</button><small className="hint">No fixed weekly holiday. You choose individual closed dates.</small></div>
  <div className="adminbox"><h2>Appointments</h2>{bookings.length===0?<p className="hint">No bookings yet.</p>:bookings.map(b=><div className="bookingrow" key={b.id}><div><b>{b.customer_name}</b><small>{services.find(s=>s.id===b.service_id)?.name||'Service'} · {whenText(b.starts_at)}</small><small>{b.customer_phone} · ₹{b.price_inr}</small><span className="status">{b.status}</span></div><div className="actions"><a href={`tel:+91${b.customer_phone}`}><Phone size={15}/></a><a href={`https://wa.me/91${b.customer_phone}`}><MessageCircle size={15}/></a><button onClick={()=>setStatus(b.id,'completed')}><CheckCircle2 size={15}/></button><button className="danger" onClick={()=>setStatus(b.id,'cancelled')}><X size={15}/></button></div></div>)}</div>
  <button className="outline full" onClick={logout}><LogOut size={15}/> Sign out</button></section>}

 <nav><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Crown/>Home</button><button className={tab==='services'?'active':''} onClick={()=>setTab('services')}><Scissors/>Services</button><button className={tab==='book'?'active':''} onClick={()=>setTab('book')}><CalendarDays/>Book</button><button className={tab==='login'||tab==='owner'?'active':''} onClick={()=>setTab(isOwner?'owner':'login')}><Settings/>Owner</button></nav>

 {editing&&<div className="modalback"><div className="modal editmodal"><button className="close" onClick={()=>setEditing(null)}><X/></button><h2>{editing.id?'Edit service':'Add service'}</h2>
  <label>Service name</label><input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/>
  <label>Category</label><input value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/>
  <div className="hours"><label>Price ₹<input type="number" value={editing.price_inr} onChange={e=>setEditing({...editing,price_inr:Number(e.target.value)})}/></label><label>Duration (min)<input type="number" value={editing.duration_minutes} onChange={e=>setEditing({...editing,duration_minutes:Number(e.target.value)})}/></label></div>
  <label>Discount (%)</label><input type="number" min="0" max="100" value={editing.discount_percent} onChange={e=>setEditing({...editing,discount_percent:Number(e.target.value)})}/>
  <label>Description</label><textarea value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/>
  <label className="check"><input type="checkbox" checked={editing.is_active} onChange={e=>setEditing({...editing,is_active:e.target.checked})}/> Show this service to customers</label>
  <button className="goldbtn full" onClick={saveService}>Save changes</button>{notice&&<p className="notice">{notice}</p>}</div></div>}
 </div>;
}

function ServiceCard({s,choose}:{s:Service,choose:()=>void}){
 return <article className="servicecard"><div className="serviceart"><img src={imageFor(s.name)} alt={s.name}/><span>{s.category}</span></div><div className="servicebody"><small>{s.category.toUpperCase()}</small><h3>{s.name}</h3><p>{s.description}</p><div className="servicefoot"><b>₹{finalPrice(s)} {s.discount_percent>0&&<del>₹{s.price_inr}</del>}</b><span><Clock size={14}/> {s.duration_minutes} min</span><button onClick={choose}><ArrowUpRight/></button></div></div></article>;
}
