CREATE OR REPLACE FUNCTION public.tg_fin_closed_month_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_casino uuid; v_date date; v_year int; v_month int; v_cat uuid; v_collection boolean := false;
BEGIN
  r := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME IN ('fin_budget', 'boss_report_extras') THEN
    EXECUTE 'SELECT ($1).casino_id, ($1).year, ($1).month' INTO v_casino, v_year, v_month USING r;
  ELSE
    EXECUTE 'SELECT ($1).casino_id, ($1).business_date' INTO v_casino, v_date USING r;
    v_year := EXTRACT(YEAR FROM v_date)::int;
    v_month := EXTRACT(MONTH FROM v_date)::int;
  END IF;

  IF TG_TABLE_NAME = 'expenses' THEN
    EXECUTE 'SELECT ($1).fin_category_id' INTO v_cat USING r;
    SELECT EXISTS (SELECT 1 FROM public.fin_categories c
                    WHERE c.id = v_cat
                      AND (COALESCE(c.group_code,'') ILIKE '%collection%'
                           OR COALESCE(c.name,'') ILIKE '%collection%'))
      INTO v_collection;
    IF v_collection THEN RETURN r; END IF;
  END IF;

  IF v_casino IS NOT NULL AND v_year IS NOT NULL
     AND public.fin_month_report_is_closed(v_casino, v_year, v_month) THEN
    RAISE EXCEPTION '% is locked: month %-% is closed (only Collections are allowed)',
      TG_TABLE_NAME, v_year, v_month;
  END IF;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.fin_post_wallet_cash(uuid,uuid,numeric,text,numeric,date,boolean,text,uuid,text,uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.tg_fin_closed_month_guard() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.tg_fin_float_closed_guard() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.tg_boss_extras_protect() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.fin_assert_month_open(uuid,int,int) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.fin_assert_date_open(uuid,date) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.fin_month_report_is_closed(uuid,int,int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_month_report_is_closed(uuid,int,int) TO authenticated;