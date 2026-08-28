-- Remove the two older overloads so RPC dispatch is unambiguous.
-- Keep the newest 8-arg variant (_repayable boolean), which the app calls.
DROP FUNCTION IF EXISTS public.fin_inter_casino_send(uuid, uuid, numeric, date, text);
DROP FUNCTION IF EXISTS public.fin_inter_casino_send(uuid, uuid, numeric, date, text, text, uuid);

-- Re-grant execute on the surviving signature explicitly
GRANT EXECUTE ON FUNCTION public.fin_inter_casino_send(uuid, uuid, numeric, date, text, text, uuid, boolean) TO authenticated;