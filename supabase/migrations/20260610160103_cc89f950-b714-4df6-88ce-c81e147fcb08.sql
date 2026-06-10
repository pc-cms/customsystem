DROP POLICY IF EXISTS "Authenticated users can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Users can subscribe to casino realtime channels" ON realtime.messages;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can subscribe to casino realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    realtime.topic() ~ '^casino:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:'
    AND public.user_has_casino_access(
      auth.uid(),
      (substring(realtime.topic() from '^casino:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):'))::uuid
    )
  )
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "ssm_read" ON public.shop_stock_movements;
DROP POLICY IF EXISTS "shop_stock_movements_read_scoped" ON public.shop_stock_movements;

CREATE POLICY "shop_stock_movements_read_scoped"
ON public.shop_stock_movements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shop_items si
    WHERE si.id = shop_stock_movements.shop_item_id
      AND (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'account_manager'::public.app_role)
        OR si.casino_id = public.get_user_casino_id(auth.uid())
        OR public.user_has_casino_access(auth.uid(), si.casino_id)
      )
  )
);