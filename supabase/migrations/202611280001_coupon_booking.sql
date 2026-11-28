-- Coupon-aware public booking RPC. Existing booking RPC remains untouched.
CREATE OR REPLACE FUNCTION public.create_public_booking_with_coupon(
 p_customer_name text,p_customer_phone text,p_day date,p_starts_at timestamptz,
 p_service_ids uuid[],p_barber_id uuid DEFAULT NULL,p_coupon_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'extensions','public','pg_temp'
AS $$
DECLARE cfg record; picked record; chosen record; mins int; total numeric; token text; bid uuid; ends timestamptz; dow int; work jsonb; local_start timestamp;
 c public.coupons%rowtype; eligible_subtotal numeric:=0; discount numeric:=0; final_total numeric; normalized_code text;
BEGIN
 IF cardinality(p_service_ids) IS NULL OR cardinality(p_service_ids)<1 OR cardinality(p_service_ids)>20 THEN RAISE EXCEPTION 'Choose between 1 and 20 services.'; END IF;
 IF length(trim(coalesce(p_customer_name,'')))<2 THEN RAISE EXCEPTION 'Customer name is required.'; END IF;
 IF length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'))<>10 THEN RAISE EXCEPTION 'Enter a valid 10-digit phone number.'; END IF;
 IF p_day<current_date THEN RAISE EXCEPTION 'Choose a future date.'; END IF;
 IF (p_starts_at AT TIME ZONE 'Asia/Kolkata')::date<>p_day THEN RAISE EXCEPTION 'Selected time does not match the date.'; END IF;
 SELECT * INTO cfg FROM public.settings WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business hours are not configured.'; END IF;
 SELECT count(*)::int AS svc_count,coalesce(sum(duration_minutes),0)::int AS total_mins,
        coalesce(sum(round(price_inr*(100-discount_percent)/100)),0)::numeric AS total_price
 INTO picked FROM public.services WHERE id=ANY(p_service_ids) AND is_active;
 IF picked.svc_count<>cardinality(p_service_ids) THEN RAISE EXCEPTION 'A selected service is unavailable.'; END IF;
 mins:=picked.total_mins; total:=picked.total_price; final_total:=total;
 IF nullif(trim(coalesce(p_coupon_code,'')),'') IS NOT NULL THEN
   normalized_code:=upper(regexp_replace(trim(p_coupon_code),'\s+','','g'));
   SELECT * INTO c FROM public.coupons WHERE code=normalized_code FOR UPDATE;
   IF NOT FOUND OR NOT c.is_active THEN RAISE EXCEPTION 'This coupon is invalid or inactive.'; END IF;
   IF c.starts_at IS NOT NULL AND c.starts_at>now() THEN RAISE EXCEPTION 'This coupon is not active yet.'; END IF;
   IF c.expires_at IS NOT NULL AND c.expires_at<=now() THEN RAISE EXCEPTION 'This coupon has expired.'; END IF;
   IF c.usage_limit IS NOT NULL AND c.usage_count>=c.usage_limit THEN RAISE EXCEPTION 'This coupon has reached its usage limit.'; END IF;
   SELECT coalesce(sum(round(s.price_inr*(100-s.discount_percent)/100)),0) INTO eligible_subtotal
   FROM public.services s JOIN public.coupon_services cs ON cs.service_id=s.id
   WHERE cs.coupon_id=c.id AND s.id=ANY(p_service_ids) AND s.is_active;
   IF eligible_subtotal<=0 THEN RAISE EXCEPTION 'This coupon does not apply to your selected services.'; END IF;
   IF eligible_subtotal<c.min_order_amount THEN RAISE EXCEPTION 'Selected eligible services do not meet the coupon minimum.'; END IF;
   IF c.discount_type='percentage' THEN discount:=round(eligible_subtotal*c.discount_value/100);
   ELSE discount:=least(eligible_subtotal,c.discount_value); END IF;
   IF c.max_discount_amount IS NOT NULL THEN discount:=least(discount,c.max_discount_amount); END IF;
   discount:=least(eligible_subtotal,discount);
   final_total:=greatest(0,total-discount);
 END IF;
 local_start:=p_starts_at AT TIME ZONE 'Asia/Kolkata'; dow:=extract(dow FROM p_day)::int;
 IF p_starts_at<=now() THEN RAISE EXCEPTION 'Choose a future time.'; END IF;
 IF dow=ANY(coalesce(cfg.weekly_holidays,'{}'::integer[])) THEN RAISE EXCEPTION 'Salon is closed on this weekday.'; END IF;
 IF EXISTS(SELECT 1 FROM public.shop_closures WHERE closed_date=p_day) THEN RAISE EXCEPTION 'Salon is closed on this date.'; END IF;
 IF local_start::time<cfg.open_time::time OR (local_start+mins*interval '1 minute')::time>cfg.close_time::time THEN RAISE EXCEPTION 'The full service duration must fit within opening hours.'; END IF;
 token:=encode(gen_random_bytes(24),'hex');
 FOR chosen IN
   SELECT b.id,b.name,b.working_hours,b.weekly_holidays FROM public.barbers b
   WHERE b.is_active AND (p_barber_id IS NULL OR b.id=p_barber_id)
    AND dow<>ALL(coalesce(b.weekly_holidays,'{}'::integer[]))
    AND ((SELECT count(*) FROM public.barber_services)=0 OR
      (SELECT count(*) FROM public.barber_services bs WHERE bs.barber_id=b.id AND bs.service_id=ANY(p_service_ids))=cardinality(p_service_ids))
   ORDER BY CASE WHEN p_barber_id IS NOT NULL THEN 0 ELSE 1 END,b.name
 LOOP
   work:=chosen.working_hours->dow::text;
   IF work IS NOT NULL AND (local_start::time<(work->>'open')::time OR (local_start+mins*interval '1 minute')::time>(work->>'close')::time) THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtext(chosen.id::text),hashtext(p_day::text));
   ends:=p_starts_at+mins*interval '1 minute';
   IF EXISTS(SELECT 1 FROM public.bookings b WHERE b.barber_id=chosen.id AND b.status IN ('pending','confirmed')
    AND (b.starts_at AT TIME ZONE 'Asia/Kolkata')::date=p_day
    AND b.starts_at<ends+coalesce(cfg.buffer_minutes,0)*interval '1 minute'
    AND b.ends_at+coalesce(cfg.buffer_minutes,0)*interval '1 minute'>p_starts_at) THEN CONTINUE; END IF;
   bid:=gen_random_uuid();
   INSERT INTO public.bookings(id,customer_name,customer_phone,service_id,barber_id,starts_at,ends_at,price_inr,status,manage_token_hash,created_by_owner)
   VALUES(bid,trim(p_customer_name),regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'),p_service_ids[1],chosen.id,p_starts_at,ends,final_total,'pending',encode(sha256(convert_to(token,'UTF8')),'hex'),false);
   INSERT INTO public.booking_services(booking_id,service_id,price_inr,duration_minutes)
   SELECT bid,s.id,round(s.price_inr*(100-s.discount_percent)/100),s.duration_minutes FROM public.services s
   WHERE s.id=ANY(p_service_ids) ORDER BY array_position(p_service_ids,s.id);
   IF normalized_code IS NOT NULL THEN
     INSERT INTO public.coupon_redemptions(coupon_id,booking_id,customer_phone,discount_amount)
     VALUES(c.id,bid,regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'),discount);
     UPDATE public.coupons SET usage_count=usage_count+1 WHERE id=c.id;
   END IF;
   RETURN jsonb_build_object('booking_id',bid,'barber_id',chosen.id,'barber_name',chosen.name,'manage_token',token,
      'price_inr',final_total,'subtotal_inr',total,'discount_inr',discount,'coupon_code',normalized_code,'duration_minutes',mins);
 END LOOP;
 RAISE EXCEPTION 'That time is unavailable for the selected duration. Choose another time or barber.';
END; $$;
REVOKE ALL ON FUNCTION public.create_public_booking_with_coupon(text,text,date,timestamptz,uuid[],uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking_with_coupon(text,text,date,timestamptz,uuid[],uuid,text) TO anon,authenticated;
