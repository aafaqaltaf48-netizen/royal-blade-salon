import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Service={id:string;name:string};
type Coupon={id:string;code:string;discount_type:'percentage'|'fixed';discount_value:number;min_order_amount:number;max_discount_amount:number|null;starts_at:string|null;expires_at:string|null;usage_limit:number|null;usage_count:number;is_active:boolean};
const empty=()=>({code:'',discount_type:'percentage' as 'percentage'|'fixed',discount_value:'10',min_order_amount:'0',max_discount_amount:'',starts_at:'',expires_at:'',usage_limit:'',service_ids:[] as string[]});
export default function CouponManager({supabase,onNotice}:{supabase:SupabaseClient;onNotice:(message:string)=>void}){
 const [items,setItems]=useState<Coupon[]>([]),[services,setServices]=useState<Service[]>([]),[form,setForm]=useState(empty),[editing,setEditing]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const load=async()=>{const [c,s]=await Promise.all([supabase.from('coupons').select('*').order('created_at',{ascending:false}),supabase.from('services').select('id,name').eq('is_active',true).order('name')]);if(c.error)onNotice(c.error.message);else setItems((c.data||[]) as Coupon[]);if(s.data)setServices(s.data as Service[])};
 useEffect(()=>{void load()},[]);
 const reset=()=>{setForm(empty());setEditing(null)};
 const save=async()=>{const code=form.code.trim().toUpperCase().replace(/\s+/g,'');const value=Number(form.discount_value),minimum=Number(form.min_order_amount),cap=form.max_discount_amount?Number(form.max_discount_amount):null,limit=form.usage_limit?Number(form.usage_limit):null;
 if(!/^[A-Z0-9_-]{3,24}$/.test(code)||!Number.isFinite(value)||value<=0||(form.discount_type==='percentage'&&value>100)||!Number.isFinite(minimum)||minimum<0||(cap!==null&&(!Number.isFinite(cap)||cap<=0))||(limit!==null&&(!Number.isInteger(limit)||limit<=0))){onNotice('Please check the coupon code, discount, minimum and limits.');return}
 if(!form.service_ids.length){onNotice('Select at least one eligible service.');return}
 const starts=form.starts_at?new Date(form.starts_at).toISOString():null,expires=form.expires_at?new Date(form.expires_at).toISOString():null;if(starts&&expires&&expires<=starts){onNotice('Expiry must be after start date.');return}
 setBusy(true);const row={code,discount_type:form.discount_type,discount_value:value,min_order_amount:minimum,max_discount_amount:cap,starts_at:starts,expires_at:expires,usage_limit:limit};
 const saved=editing?await supabase.from('coupons').update(row).eq('id',editing).select('id').single():await supabase.from('coupons').insert(row).select('id').single();
 if(saved.error||!saved.data){setBusy(false);onNotice(saved.error?.message||'Could not save coupon.');return}
 const id=saved.data.id;const removed=await supabase.from('coupon_services').delete().eq('coupon_id',id);const linked=removed.error?removed:await supabase.from('coupon_services').insert(form.service_ids.map(service_id=>({coupon_id:id,service_id})));
 setBusy(false);if(linked.error){onNotice(linked.error.message);return}onNotice('Coupon saved.');reset();await load();
 };
 const edit=async(c:Coupon)=>{const {data,error}=await supabase.from('coupon_services').select('service_id').eq('coupon_id',c.id);if(error){onNotice(error.message);return}setEditing(c.id);setForm({code:c.code,discount_type:c.discount_type,discount_value:String(c.discount_value),min_order_amount:String(c.min_order_amount),max_discount_amount:c.max_discount_amount==null?'':String(c.max_discount_amount),starts_at:c.starts_at?new Date(c.starts_at).toISOString().slice(0,16):'',expires_at:c.expires_at?new Date(c.expires_at).toISOString().slice(0,16):'',usage_limit:c.usage_limit==null?'':String(c.usage_limit),service_ids:(data||[]).map(x=>x.service_id)})};
 const toggle=async(c:Coupon)=>{const {error}=await supabase.from('coupons').update({is_active:!c.is_active}).eq('id',c.id);onNotice(error?.message||'Coupon status updated.');if(!error)await load()};
 const remove=async(c:Coupon)=>{if(!window.confirm('Delete coupon '+c.code+'?'))return;const {error}=await supabase.from('coupons').delete().eq('id',c.id);onNotice(error?.message||'Coupon deleted.');if(!error)await load()};
 return <div className="adminbox"><div className="sectionhead"><h2>Coupons &amp; offers</h2><small>Discounts for selected services</small></div>
 <label>Coupon code</label><input value={form.code} placeholder="ROYAL10" onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})}/>
 <div className="hours"><label>Discount type<select value={form.discount_type} onChange={e=>setForm({...form,discount_type:e.target.value as 'percentage'|'fixed'})}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (₹)</option></select></label><label>Discount value<input type="number" min="0.01" value={form.discount_value} onChange={e=>setForm({...form,discount_value:e.target.value})}/></label></div>
 <div className="hours"><label>Minimum order ₹<input type="number" min="0" value={form.min_order_amount} onChange={e=>setForm({...form,min_order_amount:e.target.value})}/></label><label>Max discount ₹ (optional)<input type="number" min="0.01" value={form.max_discount_amount} onChange={e=>setForm({...form,max_discount_amount:e.target.value})}/></label></div>
 <div className="hours"><label>Starts (optional)<input type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})}/></label><label>Expires (optional)<input type="datetime-local" value={form.expires_at} onChange={e=>setForm({...form,expires_at:e.target.value})}/></label></div>
 <label>Maximum uses (blank = unlimited)<input type="number" min="1" value={form.usage_limit} onChange={e=>setForm({...form,usage_limit:e.target.value})}/></label>
 <label>Eligible services</label><div className="checkgrid">{services.map(s=><label className="check" key={s.id}><input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={e=>setForm({...form,service_ids:e.target.checked?[...form.service_ids,s.id]:form.service_ids.filter(id=>id!==s.id)})}/>{s.name}</label>)}</div>
 <div className="hours"><button className="goldmini" disabled={busy} onClick={()=>void save()}>{busy?'SAVING…':editing?'UPDATE COUPON':'CREATE COUPON'}</button>{editing&&<button className="outline" onClick={reset}>Cancel</button>}</div>
 {items.map(c=><div className="adminrow" key={c.id}><div><b>{c.code}</b><small>{c.discount_type==='percentage'?c.discount_value+'%':'₹'+c.discount_value} off · minimum ₹{c.min_order_amount} · used {c.usage_count}{c.usage_limit===null?'':' / '+c.usage_limit} · {c.is_active?'Active':'Paused'}</small></div><div className="rowtools"><button onClick={()=>void edit(c)}>Edit</button><button onClick={()=>void toggle(c)}>{c.is_active?'Pause':'Activate'}</button><button onClick={()=>void remove(c)}>Delete</button></div></div>)}
 </div>
}
