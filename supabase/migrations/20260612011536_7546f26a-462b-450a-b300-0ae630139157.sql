DROP POLICY IF EXISTS slots_tips_cd_payouts_insert_same_casino ON public.cage_slots_tips_cd_payouts;
CREATE POLICY slots_tips_cd_payouts_insert_same_casino
ON public.cage_slots_tips_cd_payouts
FOR INSERT TO authenticated
WITH CHECK (casino_id = get_user_casino_id(auth.uid()) AND operator_id = auth.uid());